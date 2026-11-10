import * as THREE from 'three';
import {PAINT_HASH_GLSL,PAINT_NOISE_SIZE} from './ghibliPaint.js';

/** The paint noise lattice, tabulated once per renderer.
 *
 * Wash, tooth, terrain and reef fields all sample one value noise.
 * Evaluated procedurally that is four hashes per sample, several times per
 * fragment, across every layer of paint. The lattice is written here by the
 * GPU with the same paintHash source, so each texel holds the value the
 * procedural field has at that cell on this machine, rounded to eight bits;
 * PAINT_NOISE_GLSL then reads the interpolated field with one filtered fetch.
 *
 * What changes: lattice values and blend weights are quantized to 1/255 and
 * 1/256, and cells beyond +-2048 repeat the window (the gouache wash, at 4.5
 * cells per world unit, repeats every 910 units). Fine pigment grain is not
 * read from the map. Nothing is sampled from an image. The map is 16 MB.
 */
const vertexShader=`void main(){gl_Position=vec4(position.xy,0.,1.);}`;
const fragmentShader=/* glsl */`
precision highp float;
${PAINT_HASH_GLSL}
void main(){gl_FragColor=vec4(paintHash(floor(gl_FragCoord.xy)-${PAINT_NOISE_SIZE/2}.));}`;

export class PaintNoiseMap {
  constructor(){
    this.target=new THREE.WebGLRenderTarget(PAINT_NOISE_SIZE,PAINT_NOISE_SIZE,{depthBuffer:false,stencilBuffer:false,format:THREE.RedFormat,type:THREE.UnsignedByteType,
      colorSpace:THREE.NoColorSpace,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,generateMipmaps:false});
    this.ready=false;
  }
  get texture(){return this.target.texture;}
  /** Writes the lattice. Renderer state is restored; later calls are free. */
  render(renderer){
    if(this.ready)return this.target.texture;
    const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    const quad=new THREE.Mesh(geometry,material);quad.frustumCulled=false;
    const scene=new THREE.Scene();scene.add(quad);
    const previous=renderer.getRenderTarget(),autoClear=renderer.autoClear,scissorTest=renderer.getScissorTest();
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4());
    try{
      renderer.autoClear=false;renderer.setScissorTest(false);
      renderer.setRenderTarget(this.target);renderer.render(scene,new THREE.Camera());
      this.ready=true;
    }finally{
      renderer.setRenderTarget(previous);renderer.autoClear=autoClear;
      renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);
      material.dispose();geometry.dispose();
    }
    return this.target.texture;
  }
  dispose(){this.target.dispose();this.ready=false;}
}
