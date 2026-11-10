import {WebGLRenderTarget,FloatType,RGBAFormat} from 'three';

/** Copy the actual GPU texture, without sampling/quantization, for bitwise A/B. */
export function readTextureBits(renderer,texture){
  const {width,height}=texture.image;
  const target=new WebGLRenderTarget(width,height,{format:RGBAFormat,type:FloatType,depthBuffer:false,stencilBuffer:false});
  try{
    renderer.initRenderTarget(target);renderer.copyTextureToTexture(texture,target.texture);
    const pixels=new Float32Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    return new Uint32Array(pixels.buffer);
  }finally{target.dispose();}
}
