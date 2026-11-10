import * as THREE from 'three';

/** Skips paint that later, nearer layers completely cover.
 *
 * Splats are blended back to front, so most fragments of a dense scene are
 * painted over before they reach the eye. One extra low-resolution pass adds
 * up the optical depth of the front-most N splats for sixteen nested values of
 * N. Where one of those sets already absorbs the pixel, every splat drawn
 * before that set is invisible there and its fragments are discarded before
 * the brush kernel runs.
 *
 * The test is conservative by construction:
 * - order is the submitted blend order (gl_InstanceID), never a depth guess;
 * - the capture reuses the complete vertex shader, so wind, seasons, reveals
 *   and every other vertex-stage change apply to the occluders as rendered;
 * - each occluder contributes a lower bound of its alpha over the whole
 *   low-resolution cell, with broken edges and dry brush at their thinnest;
 * - marks whose alpha has no cheap bound (cel, oil, defocused, LOD fades)
 *   never occlude, but can still be occluded.
 */
export const OCCLUSION_DEFAULTS=Object.freeze({occlusionCulling:true});
export const OCCLUSION_SLABS=16;
/** Optical depth at which the remaining transmittance is exp(-6.5) = .0015.
 * Half-float accumulation can round a sum up by .002 per add below 8; the
 * margin over the .004 alpha floor keeps the visible error under half a
 * display step. */
export const OCCLUSION_OPTICAL_DEPTH=6.5;
/** Background instances are blended before every foreground splat. */
const BACKGROUND_SLAB=200;

/** The capture runs at half resolution. A mark only certifies a cell it
 * covers with room to spare, so the pass pays for its second vertex stage
 * only when typical strokes are a few pixels wide on screen. Measured in
 * gouache on an Apple M1 at 1100 x 688: views at 2.9 px and wider rendered
 * 1.1-2.1x faster, views at 2.4 px and narrower (fine terrain and debris
 * marks) up to 25% slower. */
export const OCCLUSION_SCALE=2;
export const OCCLUSION_MIN_STROKE=2.7;

/** Third-quartile narrow-axis sigma, in pixels, of the submitted marks: the
 * same Jacobian projection as the vertex shader, sampled evenly through the
 * blend order. `data` is the packed splat texture (20 floats per splat). */
export function strokeWidth(data,indices,count,view,projection,width,height,footprint=1,samples=1024){
  const stride=Math.max(1,Math.floor(count/samples)),fx=projection[0]*width*.5,fy=projection[5]*height*.5,widths=[];
  for(let i=0;i<count;i+=stride){
    const k=indices[i]*20,x=data[k],y=data[k+1],z=data[k+2];
    const px=view[0]*x+view[4]*y+view[8]*z+view[12],py=view[1]*x+view[5]*y+view[9]*z+view[13],d=-(view[2]*x+view[6]*y+view[10]*z+view[14]);
    if(!(d>.08))continue;
    let xx=.3,xy=0,yy=.3;
    for(let axis=k+4;axis<k+16;axis+=4){
      const ax=data[axis]*footprint,ay=data[axis+1]*footprint,az=data[axis+2]*footprint;
      const vz=view[2]*ax+view[6]*ay+view[10]*az;
      const u=fx*((view[0]*ax+view[4]*ay+view[8]*az)/d+px*vz/(d*d)),v=fy*((view[1]*ax+view[5]*ay+view[9]*az)/d+py*vz/(d*d));
      xx+=u*u;xy+=u*v;yy+=v*v;
    }
    const narrow=.5*(xx+yy)-Math.sqrt(.25*(xx-yy)*(xx-yy)+xy*xy);
    if(Number.isFinite(narrow))widths.push(Math.sqrt(Math.max(narrow,0)));
  }
  if(!widths.length)return 0;
  widths.sort((a,b)=>a-b);
  return widths[Math.min(widths.length-1,Math.floor(widths.length*.75))];
}

export function occlusionSize(width,height,scale=OCCLUSION_SCALE){
  return [Math.max(1,Math.ceil(width/scale)),Math.max(1,Math.ceil(height/scale))];
}
/** Front-rank thresholds: set j holds the nearest ranks[j] submitted splats.
 * The last set stops short of the whole scene so that it can still cull. */
export function occlusionRanks(count,slabs=OCCLUSION_SLABS){
  return Array.from({length:slabs},(_,j)=>Math.max(j+1,Math.round(count*(j+1)/(slabs+1))));
}

export const OCCLUSION_VERTEX_DECLARATION=/* glsl */`
uniform vec4 occlusionRanks[4];
uniform float occlusionCount;
flat out float occlusionSlab;
#ifdef SPLAT_OCCLUSION_CAPTURE
uniform float occlusionCell;
flat out float occlusionShrink;
#endif
`;
export const OCCLUSION_VERTEX_RANK=/* glsl */`
  {
    // Instances arrive back to front; count them from the viewer instead.
    vec4 front=vec4(occlusionCount-1.-float(gl_InstanceID));
    occlusionSlab=occlusionCount<0.?${BACKGROUND_SLAB}.:dot(step(occlusionRanks[0],front)+step(occlusionRanks[1],front)+step(occlusionRanks[2],front)+step(occlusionRanks[3],front),vec4(1.));
  }
`;
export const OCCLUSION_VERTEX_CAPTURE=/* glsl */`
#ifdef SPLAT_OCCLUSION_CAPTURE
  // Farthest whitened distance between a cell's sample and any pixel in it:
  // half the cell diagonal over the narrow axis of the projected footprint.
  occlusionShrink=occlusionCell/sqrt(max(.5*(xx+yy)-sqrt(max(.25*(xx-yy)*(xx-yy)+xy*xy,0.)),.0001));
#endif
`;
export const occlusionFragmentDeclaration=(refraction=false)=>/* glsl */`
flat in float occlusionSlab;
#ifdef SPLAT_OCCLUSION_CAPTURE
flat in float occlusionShrink;
layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 occlusionB;
layout(location=2) out vec4 occlusionC;
layout(location=3) out vec4 occlusionD;
#else
uniform bool occlusionActive;
uniform sampler2D occlusionCut;
uniform vec2 occlusionTexel;
${refraction?'layout(location=0) ':''}out vec4 fragColor;
#endif
`;
export const OCCLUSION_FRAGMENT_TEST=/* glsl */`
#ifndef SPLAT_OCCLUSION_CAPTURE
  if(occlusionActive&&occlusionSlab>textureLod(occlusionCut,gl_FragCoord.xy*occlusionTexel,0.).r*255.-.5)discard;
#endif
`;
export const occlusionFragmentCapture=(celPaint=false)=>/* glsl */`
#ifdef SPLAT_OCCLUSION_CAPTURE
  {
    float reach=sqrt(r2)+occlusionShrink,bound=0.;
    if(reach<3.&&defocusAmount==0.&&lodWeight>=.99999${celPaint?'&&celKernel<.5':''}){
      float load=opacity*coverage,falloff=exp(-.5*reach*reach);
      float base=fogKernel>.5?1.-exp(-load*falloff):min(.995,load*falloff);
      float edgeSoftness=softness+mist*.7;
      if(ghibli>.5&&skyKernel<.5){
        if(oilPaint<.5){
          // gouacheMark with roundShape <= 1.12 |q|, tooth in [0,1] and the
          // bristle term at its full reach.
          float wander=.0655+.035*abs(gouacheSettings.x),feather=.12+.18*edgeSoftness,shape=1.12*reach;
          float body=1.-smoothstep(1.53-feather,1.65+feather,shape+wander);
          float dry=1.-max(gouacheSettings.x,0.)*.2*smoothstep(.7,1.65,shape);
          float underpaint=(1.-smoothstep(.8,2.5,reach))*.48;
          float loaded=1.-exp(-3.8*load*exp(-.14*reach*reach));
          bound=clamp(mix(min(.995,load*falloff),loaded*max(body*dry,underpaint),.34),0.,.995);
        }
      }else if(painted>.5&&skyKernel<.5){
        // Painted dab: wobble <= .09, bristles >= .97.
        float silhouette=1.-smoothstep(1.60-.3*edgeSoftness,1.75+.5*edgeSoftness,reach+.09);
        bound=min(base,(1.-exp(-7.5*load*falloff))*silhouette*.97);
      }else bound=base;
      bound*=clamp(defocusCoverage,0.,1.);
    }
    // Fragments below the .004 alpha floor are discarded by the real kernel.
    float thickness=bound>=.004?-log(1.-min(bound,.995)):0.;
    vec4 slab=vec4(occlusionSlab);
    fragColor=thickness*step(slab,vec4(.5,1.5,2.5,3.5));
    occlusionB=thickness*step(slab,vec4(4.5,5.5,6.5,7.5));
    occlusionC=thickness*step(slab,vec4(8.5,9.5,10.5,11.5));
    occlusionD=thickness*step(slab,vec4(12.5,13.5,14.5,15.5));
  }
#else
`;
/** Closes the branch opened by the capture. Nothing after the bound reaches
 * the capture program, so pigment, lighting and brush-frame varyings are
 * inactive there and the driver can drop the vertex work that feeds them. */
export const OCCLUSION_FRAGMENT_END=/* glsl */`
#endif
`;

const vertexShader=`varying vec2 vUv;void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}`;
const fragmentShader=/* glsl */`
varying vec2 vUv;
uniform sampler2D slabA;
uniform sampler2D slabB;
uniform sampler2D slabC;
uniform sampler2D slabD;
uniform float threshold;
void main(){
  // Sets are nested, so the saturated ones form a suffix. Counting them finds
  // the smallest; any rounding disagreement only selects a larger, safer set.
  vec4 full=step(vec4(threshold),texture2D(slabA,vUv))+step(vec4(threshold),texture2D(slabB,vUv))
    +step(vec4(threshold),texture2D(slabC,vUv))+step(vec4(threshold),texture2D(slabD,vUv));
  float saturated=dot(full,vec4(1.));
  gl_FragColor=vec4(saturated<.5?1.:(${OCCLUSION_SLABS}.-saturated+1.)/255.);
}`;

export class SplatOcclusion {
  constructor(){
    const options={depthBuffer:false,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false,colorSpace:THREE.NoColorSpace};
    this.slabTarget=new THREE.WebGLRenderTarget(1,1,{...options,count:4,type:THREE.HalfFloatType,format:THREE.RGBAFormat});
    this.cutTarget=new THREE.WebGLRenderTarget(1,1,{...options,format:THREE.RedFormat});
    const [slabA,slabB,slabC,slabD]=this.slabTarget.textures;
    this.material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{slabA:{value:slabA},slabB:{value:slabB},slabC:{value:slabC},slabD:{value:slabD},threshold:{value:OCCLUSION_OPTICAL_DEPTH}},
      depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
    this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.quad=new THREE.Mesh(this.geometry,this.material);this.quad.frustumCulled=false;this.scene=new THREE.Scene();this.scene.add(this.quad);this.camera=new THREE.Camera();
    this.clear=new THREE.Color();this.viewport=new THREE.Vector4();this.scissor=new THREE.Vector4();
    this.stats={width:0,height:0,slabs:OCCLUSION_SLABS,passes:2};
  }
  static supported(renderer){
    // Additive half-float color attachments; core WebGL2 only guarantees them
    // with this extension.
    return renderer.capabilities.isWebGL2!==false&&Boolean(renderer.extensions.get('EXT_color_buffer_float')||renderer.extensions.get('EXT_color_buffer_half_float'));
  }
  static uniforms(){
    return {occlusionRanks:{value:Array.from({length:4},()=>new THREE.Vector4())},occlusionCount:{value:0},occlusionCell:{value:0},
      occlusionActive:{value:false},occlusionCut:{value:null},occlusionTexel:{value:new THREE.Vector2(1,1)}};
  }
  captureMaterial(source){
    if(this.source===source&&this.vertexSource===source.vertexShader&&this.fragmentSource===source.fragmentShader)return;
    this.capture?.dispose();this.source=source;this.vertexSource=source.vertexShader;this.fragmentSource=source.fragmentShader;
    // The same uniform objects: wind, seasons and style stay in step.
    this.capture=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:source.vertexShader,fragmentShader:source.fragmentShader,
      defines:{...source.defines,SPLAT_OCCLUSION_CAPTURE:1},uniforms:source.uniforms,
      transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,
      blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor});
  }
  releaseCapture(){this.capture?.dispose();this.capture=null;this.source=null;this.vertexSource=null;this.fragmentSource=null;}
  /** Renders the occluder sets for the splats currently submitted by `mesh`
   * and returns the texture the main pass tests against. `width`/`height` are
   * the main target's pixels, which the splat `viewport` uniform must keep. */
  render(renderer,scene,camera,mesh,source,width,height,scale=OCCLUSION_SCALE){
    const [w,h]=occlusionSize(width,height,scale);
    if(this.slabTarget.width!==w||this.slabTarget.height!==h){this.slabTarget.setSize(w,h);this.cutTarget.setSize(w,h);}
    this.captureMaterial(source);
    const u=source.uniforms,count=mesh.geometry.instanceCount,ranks=occlusionRanks(count);
    for(let i=0;i<4;i++)u.occlusionRanks.value[i].fromArray(ranks,i*4);
    u.occlusionCell.value=.5*Math.hypot(width/w,height/h)*1.02;
    u.occlusionTexel.value.set(1/width,1/height);
    const previous=renderer.getRenderTarget(),alpha=renderer.getClearAlpha(),autoClear=renderer.autoClear,background=scene.background;
    renderer.getClearColor(this.clear);renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);const scissorTest=renderer.getScissorTest();
    const material=mesh.material,hidden=[];
    // The sky wash and optical sun are blended before the splats and never
    // hide them.
    for(const child of scene.children)if(child!==mesh&&child.visible){hidden.push(child);child.visible=false;}
    try{
      renderer.autoClear=true;renderer.setScissorTest(false);scene.background=null;
      u.occlusionActive.value=false;u.occlusionCut.value=null;mesh.material=this.capture;
      renderer.setRenderTarget(this.slabTarget);renderer.setClearColor(0,0);renderer.render(scene,camera);
      mesh.material=material;
      renderer.setRenderTarget(this.cutTarget);renderer.render(this.scene,this.camera);
    }finally{
      mesh.material=material;scene.background=background;
      for(const child of hidden)child.visible=true;
      renderer.setRenderTarget(previous);renderer.setClearColor(this.clear,alpha);renderer.autoClear=autoClear;
      renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);
    }
    u.occlusionCut.value=this.cutTarget.texture;
    Object.assign(this.stats,{width:w,height:h});
    return this.cutTarget.texture;
  }
  dispose(){this.slabTarget.dispose();this.cutTarget.dispose();this.releaseCapture();this.material.dispose();this.geometry.dispose();}
}
