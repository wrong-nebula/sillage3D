import {Box2,DataTexture,Vector2} from 'three';

/** Coalesce exact RGBA32F edits into rectangles. Three's updateRanges upload
 * one row per call; a contiguous actor can instead use two edge rows and one
 * rectangle for its interior. No quantization, repacking or private GL state. */
export class SplatTextureUploads {
  constructor(renderer,texture){
    this.renderer=renderer;this.texture=texture;this.version=-1;this.rows=new Map();
    // This CPU-only source must never be rendered/initialized as a GPU texture.
    this.source=new DataTexture(texture.image.data,texture.image.width,texture.image.height,texture.format,texture.type);
    this.region=new Box2();this.position=new Vector2();this.lastUpload={full:false,calls:0,bytes:0};
  }
  mark(start,count){
    const {width,data}=this.texture.image;
    if(!Number.isInteger(start)||!Number.isInteger(count)||start<0||count<0||start+count>data.length)throw new RangeError('Invalid splat texture update.');
    if(!count)return;
    // Include whole texels when a writer updates only XYZ in an RGBA record.
    const end=Math.ceil((start+count)/4);let pixel=Math.floor(start/4);
    while(pixel<end){
      const row=Math.floor(pixel/width),x=pixel%width,right=Math.min(width,end-row*width),range=this.rows.get(row);
      if(range){range[0]=Math.min(range[0],x);range[1]=Math.max(range[1],right);}
      else this.rows.set(row,[x,right]);
      pixel=row*width+right;
    }
  }
  rectangles(){
    const result=[];
    for(const [y,[x,right]] of [...this.rows].sort((a,b)=>a[0]-b[0])){
      const previous=result.at(-1);
      if(previous&&previous.x===x&&previous.width===right-x&&previous.y+previous.height===y)previous.height++;
      else result.push({x,y,width:right-x,height:1});
    }
    return result;
  }
  flush(){
    const texture=this.texture;
    if(texture.version!==this.version){
      // Initial upload, recoloring, LOD replacement or an external writer.
      // A full transfer includes queued motion and supersedes partial ranges.
      texture.clearUpdateRanges();texture.needsUpdate=true;this.renderer.initTexture(texture);this.version=texture.version;
      this.rows.clear();this.lastUpload={full:true,calls:1,bytes:texture.image.data.byteLength};return;
    }
    let calls=0,bytes=0;this.source.image=texture.image;
    for(const r of this.rectangles()){
      this.region.min.set(r.x,r.y);this.region.max.set(r.x+r.width,r.y+r.height);this.position.set(r.x,r.y);
      this.renderer.copyTextureToTexture(this.source,texture,this.region,this.position);
      calls++;bytes+=r.width*r.height*4*texture.image.data.BYTES_PER_ELEMENT;
    }
    this.rows.clear();this.lastUpload={full:false,calls,bytes};
  }
  dispose(){this.source.dispose();this.rows.clear();}
}
