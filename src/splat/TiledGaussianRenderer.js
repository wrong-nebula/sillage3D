/** Gaussian-only WebGPU research backend; the studio renderer does not use it.
 * CPU projection/binning is deliberately reported separately from GPU time. */
import {stopThePopShader} from './StopThePopShader.js';
// Kept for later research; disabled at the user's request.
export const TEMPORAL_QUALITY_ENABLED=false;
const computeCode=`
struct Splat { center:vec4f, conic:vec4f, color:vec4f }
struct Settings { size:vec4u, background:vec4f }
@group(0) @binding(0) var<storage,read> splats:array<Splat>;
@group(0) @binding(1) var<storage,read> offsets:array<u32>;
@group(0) @binding(2) var<storage,read> indices:array<u32>;
@group(0) @binding(3) var<uniform> settings:Settings;
@group(0) @binding(4) var output:texture_storage_2d<rgba8unorm,write>;
var<workgroup> batch:array<Splat,64>;
var<workgroup> live:array<u32,256>;
var<workgroup> survivors:u32;
var<workgroup> first:u32;
var<workgroup> last:u32;
@compute @workgroup_size(16,16)
fn main(@builtin(global_invocation_id) pixel:vec3u,@builtin(workgroup_id) tile:vec3u,@builtin(local_invocation_index) lane:u32){
  let inside=pixel.x<settings.size.x&&pixel.y<settings.size.y;
  if(lane==0u){let t=tile.y*settings.size.z+tile.x;first=offsets[t];last=offsets[t+1u];}
  let begin=workgroupUniformLoad(&first);let end=workgroupUniformLoad(&last);
  let point=vec2f(f32(pixel.x)+.5,f32(settings.size.y)-f32(pixel.y)-.5);
  var color=vec3f(0.);var transmittance=1.;var processing=inside;
  for(var base=begin;base<end;base+=64u){
    let n=min(64u,end-base);
    if(lane<n){batch[lane]=splats[indices[base+lane]];}
    workgroupBarrier();
    if(processing){
      for(var j=0u;j<n;j++){
        let s=batch[j];let delta=point-s.center.xy;
        let r2=s.conic.x*delta.x*delta.x+2.*s.conic.y*delta.x*delta.y+s.conic.z*delta.y*delta.y;
        if(r2>9.){continue;}
        let alpha=min(.995,s.center.z*exp(-.5*r2));
        if(alpha<.004){continue;}
        color+=transmittance*alpha*s.color.rgb;transmittance*=1.-alpha;
        if(transmittance<=settings.background.w){processing=false;break;}
      }
    }
    live[lane]=select(0u,1u,processing);
    workgroupBarrier();
    if(lane==0u){var total=0u;for(var i=0u;i<256u;i++){total+=live[i];}survivors=total;}
    if(workgroupUniformLoad(&survivors)==0u){break;}
  }
  if(inside){textureStore(output,pixel.xy,vec4f(color+transmittance*settings.background.rgb,1.));}
}`;
const presentCode=`
@group(0) @binding(0) var source:texture_2d<f32>;
@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
  var p=array<vec2f,3>(vec2f(-1.,-1.),vec2f(3.,-1.),vec2f(-1.,3.));return vec4f(p[i],0.,1.);
}
@fragment fn fragment(@builtin(position) p:vec4f)->@location(0) vec4f{return textureLoad(source,vec2i(p.xy),0);}`;

export class TiledGaussianRenderer {
  static async create(canvas){
    if(!navigator.gpu)throw new Error('WebGPU is unavailable in this browser. The studio still uses WebGL.');
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error('No WebGPU adapter available.');
    const timed=adapter.features.has('timestamp-query');
    const device=await adapter.requestDevice({requiredFeatures:timed?['timestamp-query']:[],requiredLimits:{maxStorageBufferBindingSize:Math.min(adapter.limits.maxStorageBufferBindingSize,256*1024*1024),maxBufferSize:Math.min(adapter.limits.maxBufferSize,256*1024*1024)}});
    const renderer=new TiledGaussianRenderer(canvas,device,timed);
    try{await renderer.init();return renderer;}catch(error){renderer.dispose();throw error;}
  }
  constructor(canvas,device,timed){
    this.canvas=canvas;this.device=device;this.timed=timed;this.buffers=new Map();this.errors=[];this.disposed=false;
    device.addEventListener('uncapturederror',event=>this.errors.push(event.error.message));
    device.lost.then(info=>{if(!this.disposed)this.errors.push(`WebGPU device lost: ${info.message}`);});
  }
  async init(){
    const d=this.device;d.pushErrorScope('validation');
    const computeModule=d.createShaderModule({label:'Tiled Gaussian compositor',code:computeCode});
    const diagnostics=await computeModule.getCompilationInfo();
    const errors=diagnostics.messages.filter(message=>message.type==='error');
    if(errors.length)throw new Error(errors.map(m=>`WGSL ${m.lineNum}:${m.linePos}: ${m.message}`).join('\n'));
    this.compute=await d.createComputePipelineAsync({layout:'auto',compute:{module:computeModule,entryPoint:'main'}});
    this.format=navigator.gpu.getPreferredCanvasFormat();this.context=this.canvas.getContext('webgpu');
    this.context.configure({device:d,format:this.format,alphaMode:'opaque'});
    const module=d.createShaderModule({code:presentCode});
    this.present=await d.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vertex'},fragment:{module,entryPoint:'fragment',targets:[{format:this.format}]},primitive:{topology:'triangle-list'}});
    this.uniform=d.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.qualityUniform=d.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    this.diagnostics=d.createBuffer({size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
    this.diagnosticsRead=d.createBuffer({size:4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    if(this.timed){
      this.queries=d.createQuerySet({type:'timestamp',count:2});
      this.resolve=d.createBuffer({size:16,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
      this.times=d.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    }
    const error=await d.popErrorScope();if(error)throw error;
  }
  async prepareQuality(){
    if(!TEMPORAL_QUALITY_ENABLED)throw new Error('Temporal quality is temporarily disabled.');
    if(this.qualityCompute)return;
    const module=this.device.createShaderModule({label:'Per-ray Gaussian sort',code:stopThePopShader}),info=await module.getCompilationInfo();
    const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw new Error(errors.map(m=>`WGSL ${m.lineNum}:${m.linePos}: ${m.message}`).join('\n'));
    this.qualityCompute=await this.device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
  }
  upload(name,array){
    const d=this.device,size=Math.max(4,array.byteLength);
    if(size>d.limits.maxStorageBufferBindingSize||size>d.limits.maxBufferSize)throw new Error(`${name} exceeds this GPU's buffer capacity; nothing was truncated.`);
    let buffer=this.buffers.get(name);
    if(!buffer||buffer.size<size){buffer?.destroy();buffer=d.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});this.buffers.set(name,buffer);}
    d.queue.writeBuffer(buffer,0,array);return buffer;
  }
  setScene(scene){
    if(this.busy)throw new Error('Wait for the pending render before changing the scene.');
    if(scene.rayData&&!this.qualityCompute)throw new Error('Call prepareQuality() before uploading per-ray data.');
    const {width,height}=scene,d=this.device;
    if(width>d.limits.maxTextureDimension2D||height>d.limits.maxTextureDimension2D)throw new Error('Image exceeds GPU texture limits.');
    if(!this.output||width!==this.canvas.width||height!==this.canvas.height){
      this.output?.destroy();this.canvas.width=width;this.canvas.height=height;
      this.output=d.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC});
      this.presentGroup=d.createBindGroup({layout:this.present.getBindGroupLayout(0),entries:[{binding:0,resource:this.output.createView()}]});
    }
    const buffers=['projected','offsets','indices'].map(name=>this.upload(name,scene[name]));
    this.group=d.createBindGroup({layout:this.compute.getBindGroupLayout(0),entries:[...buffers.map((buffer,binding)=>({binding,resource:{buffer}})),{binding:3,resource:{buffer:this.uniform}},{binding:4,resource:this.output.createView()}]});
    this.qualityGroups=null;
    if(scene.rayData){
      const rayBuffer=this.upload('rayData',scene.rayData),surfaceBuffer=this.upload('surfaces',scene.surfaces),rayIndices=this.upload('rayIndices',scene.rayIndices),rayOffsets=this.upload('rayOffsets',scene.rayOffsets);
      this.qualityGroups=[[buffers[1],buffers[2]],[rayOffsets,rayIndices]].map(([offsetBuffer,indexBuffer])=>d.createBindGroup({layout:this.qualityCompute.getBindGroupLayout(0),entries:[
        {binding:0,resource:{buffer:buffers[0]}},{binding:1,resource:{buffer:offsetBuffer}},{binding:2,resource:{buffer:indexBuffer}},
        {binding:3,resource:{buffer:this.qualityUniform}},{binding:4,resource:this.output.createView()},
        {binding:5,resource:{buffer:rayBuffer}},{binding:6,resource:{buffer:surfaceBuffer}},{binding:7,resource:{buffer:this.diagnostics}},
      ]}));
    }
    this.scene=scene;
  }
  async render({background=[0,0,0],cutoff=1/1024,readback=false,sortMode='global',materialResponse=false,lightDirection=[-.4,.7,.5],lightIntensity=1}={}){
    if(!TEMPORAL_QUALITY_ENABLED){sortMode='global';materialResponse=false;}
    if(this.busy)throw new Error('A tiled render is already pending.');
    if(!this.scene||this.disposed)throw new Error('No tiled scene is ready.');
    if(!Number.isFinite(cutoff)||cutoff<0||cutoff>1||background.length!==3||!background.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('Invalid display background or transmittance threshold.');
    if(!['global','ray'].includes(sortMode))throw new Error('Unknown Gaussian sorting mode.');
    const quality=sortMode==='ray'||materialResponse;
    if(quality&&!this.qualityGroups)throw new Error('Per-ray projection and surface metadata are required for quality rendering.');
    if(quality&&(lightDirection.length!==3||!lightDirection.every(Number.isFinite)||Math.hypot(...lightDirection)<1e-12||!Number.isFinite(lightIntensity)||lightIntensity<0))throw new Error('Invalid highlight lighting.');
    this.busy=true;let capture;
    try{
      const {width,height,tilesX,tilesY}=this.scene,d=this.device,uniform=new ArrayBuffer(32);
      new Uint32Array(uniform,0,4).set([width,height,tilesX,tilesY]);new Float32Array(uniform,16,4).set([...background,cutoff]);d.queue.writeBuffer(this.uniform,0,uniform);
      if(quality){
        const settings=new ArrayBuffer(80);new Uint8Array(settings).set(new Uint8Array(uniform));new Float32Array(settings,32,8).set([...this.scene.ray,...lightDirection,lightIntensity]);new Uint32Array(settings,64,4).set([sortMode==='ray'?1:0,materialResponse?1:0,0,0]);
        if(sortMode==='ray')new Uint32Array(settings,0,4).set([width,height,this.scene.rayTilesX,this.scene.rayTilesY]);
        d.queue.writeBuffer(this.qualityUniform,0,settings);d.queue.writeBuffer(this.diagnostics,0,new Uint32Array(1));
      }
      const encoder=d.createCommandEncoder(),pass=encoder.beginComputePass(this.timed?{timestampWrites:{querySet:this.queries,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}}:{});
      pass.setPipeline(quality?this.qualityCompute:this.compute);pass.setBindGroup(0,quality?this.qualityGroups[sortMode==='ray'?1:0]:this.group);pass.dispatchWorkgroups(quality?Math.ceil(width/4):tilesX,quality?Math.ceil(height/4):tilesY);pass.end();
      if(quality)encoder.copyBufferToBuffer(this.diagnostics,0,this.diagnosticsRead,0,4);
      const display=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});
      display.setPipeline(this.present);display.setBindGroup(0,this.presentGroup);display.draw(3);display.end();
      if(this.timed){encoder.resolveQuerySet(this.queries,0,2,this.resolve,0);encoder.copyBufferToBuffer(this.resolve,0,this.times,0,16);}
      const pitch=Math.ceil(width*4/256)*256;
      if(readback){capture=d.createBuffer({size:pitch*height,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});encoder.copyTextureToBuffer({texture:this.output},{buffer:capture,bytesPerRow:pitch},[width,height]);}
      const start=performance.now();d.queue.submit([encoder.finish()]);await d.queue.onSubmittedWorkDone();const wallMs=performance.now()-start;
      let gpuMs=null,pixels=null,fallbackPixels=0;
      if(this.timed){await this.times.mapAsync(GPUMapMode.READ);const t=new BigUint64Array(this.times.getMappedRange());gpuMs=Number(t[1]-t[0])/1e6;this.times.unmap();}
      if(capture){await capture.mapAsync(GPUMapMode.READ);const source=new Uint8Array(capture.getMappedRange());pixels=new Uint8Array(width*height*4);for(let y=0;y<height;y++)pixels.set(source.subarray(y*pitch,y*pitch+width*4),y*width*4);capture.unmap();}
      if(quality){await this.diagnosticsRead.mapAsync(GPUMapMode.READ);fallbackPixels=new Uint32Array(this.diagnosticsRead.getMappedRange())[0];this.diagnosticsRead.unmap();}
      if(this.errors.length)throw new Error(this.errors.join('\n'));
      return {gpuMs,wallMs,pixels,fallbackPixels};
    }finally{capture?.destroy();this.busy=false;}
  }
  dispose(){this.disposed=true;this.context?.unconfigure();this.output?.destroy();for(const b of this.buffers.values())b.destroy();this.uniform?.destroy();this.qualityUniform?.destroy();this.diagnostics?.destroy();this.diagnosticsRead?.destroy();this.queries?.destroy();this.resolve?.destroy();this.times?.destroy();this.device.destroy();}
}
