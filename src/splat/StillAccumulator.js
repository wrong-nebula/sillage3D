import * as THREE from 'three';

/** More pixels for a view at rest, and for exports.
 *
 * The preview draws fewer pixels than the display has, and an export is
 * capped at 1920 x 1200 so one frame never overloads the GPU. Both limits are
 * lifted the same way: the same view is drawn several times, each shifted by
 * a fraction of a pixel, and the frames are interleaved. For a factor of two,
 * four frames shifted by a quarter pixel fill the four pixels of every 2 x 2
 * block of the larger image.
 *
 * Every frame is a complete ordinary frame, so brush sizes, paint texture and
 * lens effects are exactly those of the preview, sampled more finely. Nothing
 * is tiled, so effects that span the image (vignette, flare, lens dirt) have
 * no seams. A native render at the larger size would draw marks relatively
 * thinner; this keeps the look that was composed on screen.
 */
export const STILL_DEFAULTS=Object.freeze({stillRefine:true});
/** Resolution factor of a preview at rest. */
export const STILL_SCALE=2;
export const EXPORT_SCALES=Object.freeze([1,2,4]);

/** Sub-pixel phases of a `scale` times larger image. Pixel (scale*i+a,
 * scale*j+b) samples the scene at base pixel i plus (a+.5)/scale, so the
 * frame for phase (a,b) shifts the scene by .5-(a+.5)/scale base pixels to
 * bring that point onto the pixel center. Rows count from the bottom. */
export function stillPhases(scale){
  if(!Number.isInteger(scale)||scale<1||scale>8)throw new RangeError('Still scale must be an integer from 1 to 8.');
  const phases=[];
  for(let b=0;b<scale;b++)for(let a=0;a<scale;a++)phases.push({a,b,shift:[.5-(a+.5)/scale,.5-(b+.5)/scale]});
  return phases;
}

/** Writes one phase into a top-down RGBA image of scale*width by
 * scale*height. `pixels` is a bottom-up RGBA readback of width by height. */
export function writeStillPhase(output,pixels,width,height,scale,{a,b}){
  const rows=height*scale,stride=width*scale*4;
  for(let j=0;j<height;j++){
    let target=(rows-1-(j*scale+b))*stride+a*4,source=j*width*4;
    for(let i=0;i<width;i++,source+=4,target+=scale*4){
      output[target]=pixels[source];output[target+1]=pixels[source+1];output[target+2]=pixels[source+2];output[target+3]=255;
    }
  }
  return output;
}

const vertexShader=`void main(){gl_Position=vec4(position.xy,0.,1.);}`;
// Three compiles these as GLSL ES 3.00, so integer fetches are available.
const interleaveShader=`
uniform sampler2D source;uniform ivec2 phase;uniform int scale;
void main(){
  ivec2 pixel=ivec2(gl_FragCoord.xy);
  if(pixel.x%scale!=phase.x||pixel.y%scale!=phase.y)discard;
  gl_FragColor=vec4(texelFetch(source,pixel/scale,0).rgb,1.);
}`;
const copyShader=`uniform sampler2D source;void main(){gl_FragColor=vec4(texelFetch(source,ivec2(gl_FragCoord.xy),0).rgb,1.);}`;

export class StillAccumulator {
  constructor(){
    this.frame=null;
    this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false,colorSpace:THREE.NoColorSpace,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,generateMipmaps:false});
    const material=fragmentShader=>new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{source:{value:null},phase:{value:new THREE.Vector2()},scale:{value:1}},
      depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
    this.interleave=material(interleaveShader);this.copy=material(copyShader);
    this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.quad=new THREE.Mesh(this.geometry,this.interleave);this.quad.frustumCulled=false;this.scene=new THREE.Scene();this.scene.add(this.quad);this.camera=new THREE.Camera();
  }
  static supported(renderer){return typeof renderer.copyFramebufferToTexture==='function';}
  resize(width,height,scale){
    if(this.target.width!==width*scale||this.target.height!==height*scale)this.target.setSize(width*scale,height*scale);
    if(this.frame?.image.width===width&&this.frame.image.height===height)return;
    this.frame?.dispose();this.frame=new THREE.FramebufferTexture(width,height);
    this.frame.colorSpace=THREE.NoColorSpace;this.frame.minFilter=this.frame.magFilter=THREE.NearestFilter;this.frame.generateMipmaps=false;
  }
  draw(renderer,target,material){
    const autoClear=renderer.autoClear,scissorTest=renderer.getScissorTest();
    try{
      this.quad.material=material;renderer.autoClear=false;renderer.setScissorTest(false);
      renderer.setRenderTarget(target);renderer.render(this.scene,this.camera);
    }finally{renderer.setRenderTarget(null);renderer.autoClear=autoClear;renderer.setScissorTest(scissorTest);}
  }
  /** Stores the width by height frame now on the canvas as one phase. */
  add(renderer,width,height,scale,{a,b}){
    this.resize(width,height,scale);
    renderer.setRenderTarget(null);renderer.copyFramebufferToTexture(this.frame);
    const u=this.interleave.uniforms;u.source.value=this.frame;u.phase.value.set(a,b);u.scale.value=scale;
    this.draw(renderer,this.target,this.interleave);
  }
  /** Enlarges the canvas drawing buffer and shows the interleaved image. The
   * caller restores the preview size before its next ordinary frame. */
  present(renderer,width,height,scale){
    renderer.setSize(width*scale,height*scale,false);
    this.copy.uniforms.source.value=this.target.texture;
    this.draw(renderer,null,this.copy);
  }
  dispose(){this.frame?.dispose();this.frame=null;this.target.dispose();this.interleave.dispose();this.copy.dispose();this.geometry.dispose();}
}
