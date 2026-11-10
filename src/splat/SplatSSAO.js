import * as THREE from 'three';

export const SSAO_DEFAULTS=Object.freeze({ssao:false,ssaoStrength:1.15,ssaoRadius:.65,ssaoBias:.025,ssaoDebug:false});
export const SSAO_DEPTH_RANGE=150;
export function ssaoSettings(options={}){
  const bound=(key,min,max)=>Math.max(min,Math.min(max,Number.isFinite(options[key])?options[key]:SSAO_DEFAULTS[key]));
  const strength=bound('ssaoStrength',0,3);
  return {enabled:options.ssao===true&&strength>0,strength,radius:bound('ssaoRadius',.08,3),bias:bound('ssaoBias',.005,.15),debug:options.ssaoDebug===true};
}
export function ssaoSize(width,height){
  const scale=Math.min(.5,800/Math.max(1,width,height));
  return [Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale))];
}

// One RGBA8 texel: octahedral view normal + 16-bit positive linear view depth.
// Zero depth is empty. Hardware depth selects the closest supported surface.
export const SSAO_BUFFER_GLSL=/* glsl */`
float aoDepth(vec4 value){return dot(value.ba,vec2(65280.,255.))*(150./65535.);}
vec3 aoNormal(vec2 encoded){
  vec2 f=encoded*2.-1.;vec3 n=vec3(f,1.-abs(f.x)-abs(f.y));
  float t=max(-n.z,0.);n.xy+=mix(vec2(t),vec2(-t),step(vec2(0.),n.xy));return normalize(n);
}
vec2 aoEncodeNormal(vec3 n){
  n/=abs(n.x)+abs(n.y)+abs(n.z);
  if(n.z<0.)n.xy=(1.-abs(n.yx))*mix(vec2(-1.),vec2(1.),step(vec2(0.),n.xy));
  return n.xy*.5+.5;
}
`;
export const SSAO_VERTEX_DECLARATION=/* glsl */`
#ifdef SPLAT_AO_CAPTURE
flat out vec4 aoRay0;
flat out vec4 aoRay1;
flat out vec4 aoRay2;
flat out vec3 aoViewNormal;
#endif
`;
export const SSAO_VERTEX_CAPTURE=/* glsl */`
#ifdef SPLAT_AO_CAPTURE
  // Depth/normal capture uses the same covariance, deformed axes and brush
  // footprint. Skip optical volumes, water, and low-opacity points entirely.
  if(sky||softParticle||water||glint||groundFog||(windKind>3.5&&windKind<4.5)||opacity<.8){gl_Position=vec4(2.,2.,2.,1.);return;}
  vec3 aoN=normalize(viewRotation*axisC);
  if(dot(aoN,-p)<=.035*length(p)){gl_Position=vec4(2.,2.,2.,1.);return;}
  vec3 aoA=viewRotation*axisA,aoB=viewRotation*axisB,aoC=viewRotation*axisC;
  vec3 row0=cross(aoB,aoC),row1=cross(aoC,aoA),row2=cross(aoA,aoB);
  float inverseScale=1./max(max(length(row0),length(row1)),max(length(row2),.00000001));
  row0*=inverseScale;row1*=inverseScale;row2*=inverseScale;
  aoRay0=vec4(row0,dot(row0,p));aoRay1=vec4(row1,dot(row1,p));aoRay2=vec4(row2,dot(row2,p));aoViewNormal=aoN;
  mist=0.;mistColor=vec3(0.);pigmentStrength=0.;skyKernel=0.;return;
#endif
`;
export const SSAO_FRAGMENT_DECLARATION=/* glsl */`
#ifdef SPLAT_AO_CAPTURE
flat in vec4 aoRay0;
flat in vec4 aoRay1;
flat in vec4 aoRay2;
flat in vec3 aoViewNormal;
uniform vec2 viewport;
uniform vec4 aoProjection;
${SSAO_BUFFER_GLSL}
#endif
`;
export const SSAO_FRAGMENT_CAPTURE=/* glsl */`
#ifdef SPLAT_AO_CAPTURE
  if(alpha<.3)discard;
  vec3 ray=vec3((gl_FragCoord.xy/viewport*2.-1.)/aoProjection.xy,-1.);
  vec3 whitenedRay=vec3(dot(aoRay0.xyz,ray),dot(aoRay1.xyz,ray),dot(aoRay2.xyz,ray));
  // Maximum-contribution Gaussian ray depth (StopThePop), evaluated only in
  // this half-resolution capture. Finite thickness avoids grazing-plane spikes.
  float depth=dot(whitenedRay,vec3(aoRay0.w,aoRay1.w,aoRay2.w))/max(dot(whitenedRay,whitenedRay),.000000000001);
  if(depth<=.08||depth>=150.)discard;
  vec3 n=aoViewNormal;
  float packedDepth=floor(depth*(65535./150.)+.5);
  fragColor=vec4(aoEncodeNormal(n),floor(packedDepth/256.)/255.,mod(packedDepth,256.)/255.);
  gl_FragDepth=clamp(( -aoProjection.z+aoProjection.w/depth)*.5+.5,0.,1.);return;
#endif
`;

const vertexShader=`varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}`;
const fragmentShader=/* glsl */`
varying vec2 vUv;
uniform sampler2D geometryBuffer;
uniform vec2 bufferSize;
uniform vec2 projectionScale;
uniform vec3 settings;
${SSAO_BUFFER_GLSL}
vec3 viewPosition(vec2 uv,float depth){return vec3((uv*2.-1.)/projectionScale*depth,-depth);}
void main(){
  vec4 g=texture2D(geometryBuffer,vUv);float depth=aoDepth(g);
  if(depth<=0.){gl_FragColor=vec4(1.);return;}
  vec3 p=viewPosition(vUv,depth),n=aoNormal(g.rg);
  float radius=settings.x,bias=settings.y;
  // Fixed interleaved rotation: no noise texture, temporal history, or clock.
  float rotation=6.2831853*fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));
  vec2 radiusUV=projectionScale*.5*radius/depth;
  radiusUV*=min(1.,56./max(radiusUV.x*bufferSize.x,radiusUV.y*bufferSize.y));
  float obscurance=0.;
  for(int direction=0;direction<8;direction++){
    float angle=rotation+float(direction)*.78539816;
    vec2 axis=vec2(cos(angle),sin(angle))*radiusUV;
    float horizon=0.;
    for(int stepIndex=0;stepIndex<2;stepIndex++){
      vec2 uv=vUv+axis*(stepIndex==0?.35:1.);
      if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))continue;
      // Reconstruct at the sampled texel center, matching its stored depth.
      uv=(floor(uv*bufferSize)+.5)/bufferSize;
      float sampleDepth=aoDepth(texture2D(geometryBuffer,uv));if(sampleDepth<=0.)continue;
      vec3 delta=viewPosition(uv,sampleDepth)-p;float d2=dot(delta,delta);
      float falloff=max(0.,1.-d2/(radius*radius));
      float occlusion=max(0.,dot(n,delta)-bias)*inversesqrt(max(d2,.00001));
      horizon=max(horizon,occlusion*falloff);
    }
    obscurance+=horizon;
  }
  float visibility=clamp(1.-obscurance*(settings.z*2.4/8.),.08,1.);
  gl_FragColor=vec4(vec3(visibility),1.);
}`;

/** Fused edge-aware smoothing/upsampling in the incumbent lens composite.
 * No standalone blur pass or full-resolution AO target. */
export const SSAO_COMPOSITE_GLSL=/* glsl */`
uniform bool ssaoEnabled;
uniform bool ssaoDebug;
uniform sampler2D ssaoGeometry;
uniform sampler2D ssaoMap;
uniform vec2 ssaoSize;
uniform float ssaoRadius;
${SSAO_BUFFER_GLSL}
vec2 splatAO(vec2 uv){
  if(!ssaoEnabled)return vec2(1.,0.);
  vec4 center=texture2D(ssaoGeometry,uv);float depth=aoDepth(center);
  if(depth<=0.)return vec2(1.,0.);
  vec3 n=aoNormal(center.rg);vec2 pixel=uv*ssaoSize-.5,base=floor(pixel),fraction=fract(pixel);
  float sum=0.,weight=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 offset=vec2(float(x),float(y)),sampleUV=(base+offset+.5)/ssaoSize;
    if(any(lessThan(sampleUV,vec2(0.)))||any(greaterThan(sampleUV,vec2(1.))))continue;
    vec4 g=texture2D(ssaoGeometry,sampleUV);float d=aoDepth(g);if(d<=0.)continue;
    float spatial=exp(-dot(offset-fraction,offset-fraction)*.65);
    float bilateral=exp(-abs(d-depth)/max(.008,ssaoRadius*.12))*pow(max(0.,dot(n,aoNormal(g.rg))),8.);
    float w=spatial*bilateral;sum+=texture2D(ssaoMap,sampleUV).r*w;weight+=w;
  }
  return vec2(weight>.0001?sum/weight:1.,1.);
}`;

export class SplatSSAO {
  constructor(){
    this.geometryTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false});
    this.aoTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false,format:THREE.RedFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false});
    this.material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{geometryBuffer:{value:this.geometryTarget.texture},bufferSize:{value:new THREE.Vector2()},projectionScale:{value:new THREE.Vector2()},settings:{value:new THREE.Vector3()}},depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
    this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.quad=new THREE.Mesh(this.geometry,this.material);this.quad.frustumCulled=false;this.scene=new THREE.Scene();this.scene.add(this.quad);this.camera=new THREE.Camera();
    this.clear=new THREE.Color();this.viewport=new THREE.Vector4();this.scissor=new THREE.Vector4();
    this.stats={width:0,height:0,taps:16,passes:2,cpuMs:0};
  }
  captureMaterial(source){
    if(this.source===source)return;
    this.capture?.dispose();this.source=source;
    this.capture=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:source.vertexShader,fragmentShader:source.fragmentShader,
      defines:{...source.defines,SPLAT_AO_CAPTURE:1},uniforms:{...source.uniforms,aoProjection:{value:new THREE.Vector4()}},
      transparent:false,depthTest:true,depthWrite:true,side:THREE.DoubleSide,blending:THREE.NoBlending,toneMapped:false});
  }
  releaseCapture(){this.capture?.dispose();this.capture=null;this.source=null;}
  render(renderer,scene,camera,mesh,source,options){
    const started=performance.now(),settings=ssaoSettings(options);
    renderer.getDrawingBufferSize(this.material.uniforms.bufferSize.value);
    const [width,height]=ssaoSize(this.material.uniforms.bufferSize.value.x,this.material.uniforms.bufferSize.value.y);
    if(this.geometryTarget.width!==width||this.geometryTarget.height!==height){this.geometryTarget.setSize(width,height);this.aoTarget.setSize(width,height);}
    this.captureMaterial(source);
    const previous=renderer.getRenderTarget(),alpha=renderer.getClearAlpha(),autoClear=renderer.autoClear,background=scene.background;
    renderer.getClearColor(this.clear);renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);const scissorTest=renderer.getScissorTest();
    const size=source.uniforms.viewport.value.clone(),material=mesh.material,hidden=[];
    // Other scene meshes (sky and optical sun) never become opaque occluders.
    for(const child of scene.children)if(child!==mesh&&child.visible){hidden.push(child);child.visible=false;}
    const p=camera.projectionMatrix.elements;
    try{
      renderer.autoClear=true;renderer.setScissorTest(false);scene.background=null;
      this.capture.uniforms.aoProjection.value.set(p[0],p[5],p[10],p[14]);
      source.uniforms.viewport.value.set(width,height);mesh.material=this.capture;
      renderer.setRenderTarget(this.geometryTarget);renderer.setClearColor(0,0);renderer.render(scene,camera);
      mesh.material=material;source.uniforms.viewport.value.copy(size);
      this.material.uniforms.bufferSize.value.set(width,height);this.material.uniforms.projectionScale.value.set(p[0],p[5]);
      this.material.uniforms.settings.value.set(settings.radius,settings.bias,settings.strength);
      renderer.setRenderTarget(this.aoTarget);renderer.setClearColor(0xffffff,1);renderer.render(this.scene,this.camera);
    }finally{
      mesh.material=material;source.uniforms.viewport.value.copy(size);scene.background=background;
      for(const child of hidden)child.visible=true;
      renderer.setRenderTarget(previous);renderer.setClearColor(this.clear,alpha);renderer.autoClear=autoClear;
      renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);
    }
    Object.assign(this.stats,{width,height,cpuMs:performance.now()-started});
    return {geometry:this.geometryTarget.texture,ao:this.aoTarget.texture,width,height,radius:settings.radius,debug:settings.debug};
  }
  dispose(){this.geometryTarget.dispose();this.aoTarget.dispose();this.releaseCapture();this.material.dispose();this.geometry.dispose();}
}
