import {PMREMGenerator,EquirectangularReflectionMapping} from 'three';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';

/** One local HDR download and one GGX prefilter per renderer. The cached cube
 * survives study changes and is sampled by the existing splat vertex pass. */
export class StudioEnvironment {
  async prepare(renderer,url){
    if(this.url===url&&this.target)return;
    if(this.pending)return this.pending;
    this.pending=(async()=>{
      const source=await new HDRLoader().loadAsync(url);
      if(this.disposed){source.dispose();return;}
      const generator=new PMREMGenerator(renderer);
      source.mapping=EquirectangularReflectionMapping;
      try{
        const target=generator.fromEquirectangular(source);
        this.target?.dispose();this.target=target;this.url=url;
        this.maxLod=target.texture.mipmaps.length-1;
      }finally{source.dispose();generator.dispose();}
    })().finally(()=>{this.pending=null;});
    return this.pending;
  }
  dispose(){this.disposed=true;this.target?.dispose();this.target=null;}
}
