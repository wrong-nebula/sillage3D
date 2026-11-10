import {PerspectiveCamera,Vector3} from 'three';
import {packSplats,depthOrder} from '../../src/splat/math.js';
import {prepareTiledGaussians} from '../../src/splat/TiledGaussianProjection.js';
import {rayGaussianDepth} from '../../src/splat/RayGaussianDepth.js';
export {PerspectiveCamera,Vector3,packSplats,depthOrder,prepareTiledGaussians};
export function exactRayImage(scene,background=[0,0,0],cutoff=0,sampleStride=1){
  const {width,height,projected:p,rayData,ray,offsets,indices,tilesX}=scene,out=new Uint8Array(width*height*4);
  for(let y=0;y<height;y+=sampleStride)for(let x=0;x<width;x+=sampleStride){
    const tile=Math.floor(y/16)*tilesX+Math.floor(x/16),hits=[];
    for(let j=offsets[tile];j<offsets[tile+1];j++){
      const id=indices[j],k=id*12,dx=x+.5-p[k],dy=height-y-.5-p[k+1],r2=p[k+4]*dx*dx+2*p[k+5]*dx*dy+p[k+6]*dy*dy;
      if(r2>9)continue;const alpha=Math.min(.995,p[k+2]*Math.exp(-.5*r2));if(alpha<.004)continue;
      hits.push({id,alpha,depth:rayGaussianDepth(rayData,id,(x+.5-ray[0])/ray[2],(height-y-.5-ray[1])/ray[3])});
    }
    hits.sort((a,b)=>a.depth-b.depth||b.id-a.id);const color=[0,0,0];let t=1;
    for(const h of hits){for(let c=0;c<3;c++)color[c]+=t*h.alpha*p[h.id*12+8+c];t*=1-h.alpha;if(t<=cutoff)break;}
    for(let c=0;c<3;c++)out[(y*width+x)*4+c]=Math.round(255*(color[c]+t*background[c]));out[(y*width+x)*4+3]=255;
  }
  return out;
}
export function adversarialScene(count=40){
  const width=17,height=19,tilesX=2,tilesY=2,projected=new Float32Array(Math.max(12,count*12)),rayData=new Float32Array(Math.max(12,count*12)),surfaces=new Float32Array(Math.max(8,count*8));
  const offsets=new Uint32Array(5),indices=new Uint32Array(Math.max(1,count*4));
  for(let i=0;i<count;i++){
    projected.set([width/2,height/2,.15+(i%4)*.05,0,.012,0,.012,0,(i%3)/2,(i%5)/4,(i%7)/6,0],i*12);
    rayData.set([1,0,0,0,0,1,0,0,0,0,1,-(count-i)],i*12);surfaces.set([0,0,1,.9,0,0,.1,0],i*8);
  }
  for(let t=0;t<4;t++){offsets[t]=t*count;for(let i=0;i<count;i++)indices[t*count+i]=i;}offsets[4]=4*count;
  const rayTilesX=Math.ceil(width/4),rayTilesY=Math.ceil(height/4),rayOffsets=Uint32Array.from({length:rayTilesX*rayTilesY+1},(_,i)=>i*count),rayIndices=Uint32Array.from({length:Math.max(1,count*rayTilesX*rayTilesY)},(_,i)=>count?i%count:0);
  return {width,height,tilesX,tilesY,projected,offsets,indices,rayIndices,rayOffsets,rayTilesX,rayTilesY,rayData,surfaces,ray:[width/2,height/2,40,40]};
}
export function crossingScene(){
  const splats=[-.14,.14].map((x,i)=>({center:[x,0,-3],axes:[[.55,0,.45],[0,.23,0],[-.009,0,.011]],color:i?[.1,.8,.3]:[.9,.15,.1],opacity:.8,seed:.3,material:'stone'}));
  return {...packSplats(splats),splats};
}
export function sampleWorldPoint(pixels,camera,width,height){
  const ndc=new Vector3(0,0,-3).project(camera),x=(ndc.x+1)*width*.5-.5,y=(1-ndc.y)*height*.5-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  return [0,1,2].map(c=>{const p=(a,b)=>pixels[(b*width+a)*4+c];return p(ix,iy)*(1-fx)*(1-fy)+p(ix+1,iy)*fx*(1-fy)+p(ix,iy+1)*(1-fx)*fy+p(ix+1,iy+1)*fx*fy;});
}
