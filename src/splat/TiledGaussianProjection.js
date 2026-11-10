/** Experimental static Gaussian path. The input is the renderer's packed
 * display-RGB data, with all animation already applied. No DOF, fog, LOD fades,
 * water, pigment kernels or pixel filtering are evaluated here. */
import {writeRayGaussian,rayGaussianDepth} from './RayGaussianDepth.js';
import {splatSurface,microfacetNormal} from './SplatSurface.js';
export const TILE_SIZE=16;
export function prepareTiledGaussians({data,order,camera,width,height,brushScale=1,coverage=1,maxPairs=32_000_000,raySort=false,splats=null}){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>8192||height>8192)throw new Error('Invalid tiled image dimensions.');
  if(!(brushScale>0)||!Number.isFinite(brushScale)||coverage<0||!Number.isFinite(coverage))throw new Error('Invalid Gaussian style.');
  if(!(data instanceof Float32Array)||!(order instanceof Uint32Array)||data.length<order.length*20)throw new Error('Invalid packed Gaussian data.');
  camera.updateMatrixWorld(true);
  const m=camera.matrixWorldInverse.elements,p=camera.projectionMatrix.elements;
  if(!camera.isPerspectiveCamera||p[1]||p[4])throw new Error('The prototype requires an unskewed perspective camera.');
  const count=order.length,projected=new Float32Array(Math.max(12,count*12)),bounds=new Int32Array(count*4);bounds.fill(-1);
  if(splats&&splats.length!==count)throw new Error('Surface metadata must match the active splat order.');
  const rayData=raySort?new Float32Array(Math.max(12,count*12)):null,surfaces=raySort?new Float32Array(Math.max(8,count*8)):null;
  const rayTilesX=Math.ceil(width/4),rayTilesY=Math.ceil(height/4),rayOffsets=raySort?new Uint32Array(rayTilesX*rayTilesY+1):null,rayBounds=raySort?new Int32Array(count*4):null;
  rayBounds?.fill(-1);let rayPairs=0;
  const tilesX=Math.ceil(width/TILE_SIZE),tilesY=Math.ceil(height/TILE_SIZE),offsets=new Uint32Array(tilesX*tilesY+1);
  const fx=p[0]*width*.5,fy=p[5]*height*.5,tx=1/p[0],ty=1/p[5];let visible=0,pairs=0;
  for(let index=0;index<count;index++){
    const k=index*20,x=data[k],y=data[k+1],z=data[k+2],alpha=data[k+3]*coverage;
    if(alpha<.004)continue;
    const px=m[0]*x+m[4]*y+m[8]*z+m[12],py=m[1]*x+m[5]*y+m[9]*z+m[13],d=-(m[2]*x+m[6]*y+m[10]*z+m[14]);
    const sigma=Math.max(Math.hypot(data[k+4],data[k+5],data[k+6]),Math.hypot(data[k+8],data[k+9],data[k+10]),Math.hypot(data[k+12],data[k+13],data[k+14]))*brushScale;
    if(d<Math.max(camera.near,.08,sigma*1.5)||d>camera.far||Math.abs(px)>d*tx+3*sigma*Math.sqrt(1+tx*tx)||Math.abs(py)>d*ty+3*sigma*Math.sqrt(1+ty*ty))continue;
    const sx=Math.max(-1.3*tx,Math.min(1.3*tx,px/d)),sy=Math.max(-1.3*ty,Math.min(1.3*ty,py/d));
    let xx=.3,xy=0,yy=.3,ax=0,ay=0;
    for(const slot of [4,8,12]){
      const x=data[k+slot]*brushScale,y=data[k+slot+1]*brushScale,z=data[k+slot+2]*brushScale;
      const vz=m[2]*x+m[6]*y+m[10]*z;
      const a=fx*(m[0]*x+m[4]*y+m[8]*z+sx*vz)/d,b=fy*(m[1]*x+m[5]*y+m[9]*z+sy*vz)/d;
      xx+=a*a;xy+=a*b;yy+=b*b;if(slot===4){ax=a;ay=b;}
    }
    const det=xx*yy-xy*xy,rootDet=Math.sqrt(det),scale=Math.sqrt(xx+yy+2*rootDet),rxx=(xx+rootDet)/scale,rxy=xy/scale,ryy=(yy+rootDet)/scale;
    const al=Math.hypot(ax,ay),ux=al>.001?ax/al:1,uy=al>.001?ay/al:0;
    if(Math.hypot(rxx*ux+rxy*uy,rxy*ux+ryy*uy)+Math.hypot(-rxx*uy+rxy*ux,-rxy*uy+ryy*ux)>Math.max(width,height)*2)continue;
    const cx=px/d*fx+(1-p[8])*width*.5,cy=py/d*fy+(1-p[9])*height*.5;
    const support=Math.min(3,Math.sqrt(Math.max(0,2*Math.log(alpha/.004)))+.001);
    // One pixel absorbs CPU/GPU projection rounding. Rows are bottom-up here.
    const rx=support*Math.sqrt(xx)+1,ry=support*Math.sqrt(yy)+1;
    const x0=Math.max(0,Math.floor((cx-rx)/TILE_SIZE)),x1=Math.min(tilesX-1,Math.floor((cx+rx)/TILE_SIZE));
    const y0=Math.max(0,Math.floor((height-cy-ry)/TILE_SIZE)),y1=Math.min(tilesY-1,Math.floor((height-cy+ry)/TILE_SIZE));
    if(x0>x1||y0>y1)continue;
    if(raySort){
      writeRayGaussian(data,index,m,rayData,brushScale);
      const source=splats?.[index]??{axes:[[0,0,0],[0,0,0],[data[k+12],data[k+13],data[k+14]]]},surface=splatSurface(source),n=microfacetNormal(surface.normal,Math.abs(data[k+19])%1);
      surfaces.set([m[0]*n[0]+m[4]*n[1]+m[8]*n[2],m[1]*n[0]+m[5]*n[1]+m[9]*n[2],m[2]*n[0]+m[6]*n[1]+m[10]*n[2],surface.roughness,surface.metalness,surface.sparkle,Math.abs(data[k+19])%1,0],index*8);
      // Fine tiles reduce depth variation across each queue. The original
      // 16x16 lists stay intact for the default renderer and its A/B reference.
      const qx0=Math.max(0,Math.floor((cx-rx)/4)),qx1=Math.min(rayTilesX-1,Math.floor((cx+rx)/4)),qy0=Math.max(0,Math.floor((height-cy-ry)/4)),qy1=Math.min(rayTilesY-1,Math.floor((height-cy+ry)/4));
      rayBounds.set([qx0,qy0,qx1,qy1],index*4);rayPairs+=(qx1-qx0+1)*(qy1-qy0+1);
      if(rayPairs>maxPairs)throw new Error(`Ray tile list capacity exceeded (${rayPairs} > ${maxPairs}); nothing was truncated.`);
      for(let y=qy0;y<=qy1;y++)for(let x=qx0;x<=qx1;x++)rayOffsets[y*rayTilesX+x+1]++;
    }
    const j=index*12;projected.set([cx,cy,alpha,0,yy/det,-xy/det,xx/det,0,Math.min(1,Math.max(0,data[k+16])),Math.min(1,Math.max(0,data[k+17])),Math.min(1,Math.max(0,data[k+18])),0],j);
    if(!projected.subarray(j,j+12).every(Number.isFinite))throw new Error('Non-finite projected Gaussian.');
    bounds.set([x0,y0,x1,y1],index*4);visible++;
    pairs+=(x1-x0+1)*(y1-y0+1);
    if(pairs>maxPairs)throw new Error(`Tile list capacity exceeded (${pairs} > ${maxPairs}); nothing was truncated.`);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)offsets[y*tilesX+x+1]++;
  }
  for(let i=1;i<offsets.length;i++)offsets[i]+=offsets[i-1];
  const indices=new Uint32Array(Math.max(1,pairs)),cursor=offsets.slice(0,-1),seen=new Uint8Array(count);
  // Reverse the exact production order, including equal-depth ties. Sorting
  // tiles independently would risk changing translucent overlap.
  for(let i=count-1;i>=0;i--){
    const index=order[i];if(index>=count||seen[index])throw new Error('Depth order must be a permutation of the packed splats.');seen[index]=1;
    const k=index*4,x0=bounds[k];if(x0<0)continue;
    for(let y=bounds[k+1];y<=bounds[k+3];y++)for(let x=x0;x<=bounds[k+2];x++)indices[cursor[y*tilesX+x]++]=index;
  }
  const ray=[(1-p[8])*width*.5,(1-p[9])*height*.5,fx,fy];
  const rayIndices=raySort?new Uint32Array(Math.max(1,rayPairs)):null;
  if(raySort){
    for(let i=1;i<rayOffsets.length;i++)rayOffsets[i]+=rayOffsets[i-1];
    const cursor=rayOffsets.slice(0,-1);
    for(const index of order){const k=index*4;if(rayBounds[k]<0)continue;for(let y=rayBounds[k+1];y<=rayBounds[k+3];y++)for(let x=rayBounds[k];x<=rayBounds[k+2];x++)rayIndices[cursor[y*rayTilesX+x]++]=index;}
    const keys=new Float64Array(count);
    // Coarse tile-center depth order, then a per-pixel queue on the GPU.
    for(let tile=0;tile<rayTilesX*rayTilesY;tile++){
      const rx=((tile%rayTilesX+.5)*4-ray[0])/fx,ry=(height-(Math.floor(tile/rayTilesX)+.5)*4-ray[1])/fy;
      const list=rayIndices.subarray(rayOffsets[tile],rayOffsets[tile+1]);
      for(const index of list)keys[index]=rayGaussianDepth(rayData,index,rx,ry);
      list.sort((a,b)=>keys[a]-keys[b]||b-a);
    }
  }
  return {width,height,tilesX,tilesY,projected,offsets,indices,visible,pairs,rayData,surfaces,rayIndices,rayOffsets,rayTilesX,rayTilesY,rayPairs,ray,bytes:projected.byteLength+offsets.byteLength+indices.byteLength+(rayData?.byteLength??0)+(surfaces?.byteLength??0)+(rayIndices?.byteLength??0)+(rayOffsets?.byteLength??0)};
}
