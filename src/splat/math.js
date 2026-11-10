import {splatMaterialSeed} from './SplatSurface.js';
/** Jacobian projection of a 3D Gaussian. Camera space looks down negative Z. */
export function projectCovariance(center, axes, focal, filter = .3) {
  const [x,y,z] = center, d = -z;
  if (d <= 0) return null;
  let xx=filter, xy=0, yy=filter;
  for (const [ax,ay,az] of axes) {
    const u=focal[0]*(ax/d+x*az/(d*d));
    const v=focal[1]*(ay/d+y*az/(d*d));
    xx+=u*u; xy+=u*v; yy+=v*v;
  }
  return [xx,xy,yy];
}

const depthWorkspaces=new WeakMap();
/** Exact Float32 depth order, with stable source-index ties. Reused radix
 * buffers avoid comparator callbacks and per-orbit allocations. */
export function depthOrder(centers, viewMatrix, order = null) {
  const count=centers.length/3;
  const result=order || new Uint32Array(count);
  let work=depthWorkspaces.get(result);
  if(!work||work.keys.length!==count){
    const depths=new Float32Array(count);
    work={depths,keys:new Uint32Array(depths.buffer),temporary:new Uint32Array(count),histogram:new Uint32Array(count>=4096?5120:1024)};
    depthWorkspaces.set(result,work);
  }
  const {depths,keys,temporary,histogram}=work;histogram.fill(0);
  const wide=count>=4096,initial=wide?temporary:result;
  for(let i=0;i<count;i++){
    const k=i*3;
    depths[i]=viewMatrix[2]*centers[k]+viewMatrix[6]*centers[k+1]+viewMatrix[10]*centers[k+2]+viewMatrix[14];
    // Numeric comparison considers -0 and +0 equal; preserve that tie rule.
    if(depths[i]===0)depths[i]=0;
    const bits=keys[i],key=(bits&0x80000000)?~bits:(bits^0x80000000);
    keys[i]=key;initial[i]=i;
    if(wide){histogram[key&2047]++;histogram[2048+((key>>>11)&2047)]++;histogram[4096+(key>>>22)]++;}
    else{histogram[key&255]++;histogram[256+((key>>>8)&255)]++;
      histogram[512+((key>>>16)&255)]++;histogram[768+(key>>>24)]++;}
  }
  // Large scenes use 11/11/10-bit digits: three stable passes instead of four.
  // Start in scratch storage so the odd number of passes finishes in result.
  // Tiny moving subsets keep the smaller 8-bit histogram to avoid setup cost.
  let source=initial,destination=wide?result:temporary;
  for(let pass=0;pass<(wide?3:4);pass++){
    const base=pass*(wide?2048:256),shift=pass*(wide?11:8),size=wide?(pass===2?1024:2048):256,mask=size-1;let offset=0;
    for(let bucket=0;bucket<size;bucket++){const n=histogram[base+bucket];histogram[base+bucket]=offset;offset+=n;}
    for(let i=0;i<count;i++){const index=source[i];destination[histogram[base+((keys[index]>>>shift)&mask)]++]=index;}
    const swap=source;source=destination;destination=swap;
  }
  return result;
}

/** The sort keys of the last `depthOrder` call that wrote `order`, indexed
 * like its centers. Ascending keys are the drawing order. */
export const depthOrderKeys=order=>depthWorkspaces.get(order)?.keys??null;
const keyDepth=new Float32Array(1),keyBits=new Uint32Array(keyDepth.buffer);
/** The key `depthOrder` gives the mark at `index`. */
export function depthKey(centers,viewMatrix,index){
  const k=index*3;
  keyDepth[0]=viewMatrix[2]*centers[k]+viewMatrix[6]*centers[k+1]+viewMatrix[10]*centers[k+2]+viewMatrix[14];
  if(keyDepth[0]===0)keyDepth[0]=0;
  const bits=keyBits[0];
  return ((bits&0x80000000)?~bits:(bits^0x80000000))>>>0;
}

/** Reuse the static depth order while only a known subset moves. Every merge
 * uses the same Float32 keys and source-index ties as the complete radix sort.
 * Create a new sorter when the center buffer or moving membership changes. */
export class DynamicDepthOrder {
  constructor(centers,movingIndices=[]){
    this.centers=centers;this.count=centers.length/3;
    const indices=[...new Set(movingIndices)].sort((a,b)=>a-b);
    if(indices.some(i=>!Number.isInteger(i)||i<0||i>=this.count))throw new RangeError('Moving splat index is outside the center buffer.');
    this.moving=Uint32Array.from(indices);this.mask=new Uint8Array(this.count);
    for(const i of indices)this.mask[i]=1;
    this.staticCount=this.count-indices.length;
    this.staticOrder=new Uint32Array(this.count);this.staticKeys=new Uint32Array(this.count);this.staticReady=false;
    this.movingCenters=new Float32Array(indices.length*3);this.movingOrder=new Uint32Array(indices.length);
    this.view=null;this.fullSorts=0;this.merges=0;
  }
  sort(viewMatrix,result){
    if(result.length!==this.count)throw new RangeError('Depth order length does not match the center buffer.');
    const m=viewMatrix,v=this.view;
    if(!v||v[0]!==m[2]||v[1]!==m[6]||v[2]!==m[10]||v[3]!==m[14]){
      depthOrder(this.centers,m,result);
      // Cheap bulk copies while the camera moves. Filter the static list only
      // if the next frame actually reuses this view, avoiding wasted cache work
      // on every orbit frame. Keys remain indexed by original splat address.
      this.staticOrder.set(result);this.staticKeys.set(depthWorkspaces.get(result).keys);this.staticReady=false;
      this.view=[m[2],m[6],m[10],m[14]];this.fullSorts++;return result;
    }
    const {centers,moving,movingCenters,movingOrder,staticOrder,staticKeys,staticCount}=this;
    if(!this.staticReady){
      let n=0;for(let i=0;i<this.count;i++){const index=staticOrder[i];if(!this.mask[index])staticOrder[n++]=index;}
      this.staticReady=true;
    }
    for(let i=0;i<moving.length;i++){
      const source=moving[i]*3,target=i*3;
      movingCenters[target]=centers[source];movingCenters[target+1]=centers[source+1];movingCenters[target+2]=centers[source+2];
    }
    depthOrder(movingCenters,m,movingOrder);
    const keys=depthWorkspaces.get(movingOrder).keys;
    let a=0,b=0,n=0;
    if(moving.length*64<staticCount){
      // Sparse animation leaves long static runs. Locate each insertion with
      // exact key/index comparisons, then copy the whole run in native code.
      for(const local of movingOrder){
        const index=moving[local],key=keys[local];let low=a,high=staticCount;
        while(low<high){const middle=(low+high)>>>1,s=staticOrder[middle],k=staticKeys[s];
          if(k<key||(k===key&&s<index))low=middle+1;else high=middle;
        }
        if(low>a){result.set(staticOrder.subarray(a,low),n);n+=low-a;a=low;}
        result[n++]=index;
      }
      result.set(staticOrder.subarray(a,staticCount),n);this.merges++;return result;
    }
    while(a<staticCount&&b<movingOrder.length){
      const local=movingOrder[b],index=moving[local],key=keys[local];
      const staticKey=staticKeys[staticOrder[a]];
      if(staticKey<key||(staticKey===key&&staticOrder[a]<index))result[n++]=staticOrder[a++];
      else{result[n++]=index;b++;}
    }
    result.set(staticOrder.subarray(a,staticCount),n);n+=staticCount-a;
    while(b<movingOrder.length)result[n++]=moving[movingOrder[b++]];
    this.merges++;return result;
  }
}

export function packSplats(splats, maxTextureSize=4096, irradiance=null) {
  if(irradiance&&irradiance.length!==splats.length*3) throw new Error('Invalid irradiance field length');
  const texels=splats.length*5, width=Math.min(1024,maxTextureSize), height=Math.max(1,Math.ceil(texels/width));
  if(height>maxTextureSize) throw new Error('This scene exceeds the GPU texture limit.');
  const data=new Float32Array(width*height*4), centers=new Float32Array(splats.length*3);
  splats.forEach((s,i)=>{
    if(s.center.length!==3 || s.axes.length!==3 || s.axes.some(a=>a.length!==3) || s.color.length!==3) throw new Error(`Invalid splat ${i}`);
    // Seeds occupy [0,1). The negative range carries a sky fog exemption
    // without spending another texel or disturbing the irradiance channels.
    // [2,3) soft particles, [3,4) sand glints, [4,5) opaque cel paint,
    // [5,6) fish scales, [6,7) fish catchlights, [7,11) coral glow groups,
    // [11,12) light shafts, [12,13) reef rock, [13,14) cel-painted reef rock,
    // [14,15) reef moss, [15,17) rocky/cel seabed (rock light, sand reveal).
    const packedSeed=splatMaterialSeed(s)??(s.reefMoss?14+s.seed:s.reefRock?(s.reefSeabed?(s.celPaint?16:15):s.celPaint?13:12)+s.seed:s.reefRay?11+s.seed:s.reefGlow!==undefined?7+s.reefGlow+s.seed:s.fishCatchlight?6+s.seed:s.fishScale?5+s.seed:s.sandGlint?3+s.seed:
      s.softParticle?2+s.seed:s.noFog?-1-s.seed:s.celPaint?4+s.seed:s.seed);
    // Thermal and coral flow studies have no irradiance or LOD, and reuse these channels.
    // Marks with a material response carry their place on the object instead,
    // which anchors the material's patterns (SplatMaterialResponse.js).
    const auxiliary=s.thermal??s.reefFlow??(splatMaterialSeed(s)===null?undefined:s.anchor??s.center);
    const values=[...s.center,s.opacity,...s.axes[0],auxiliary?.[0]??irradiance?.[i*3]??0,
      ...s.axes[1],auxiliary?.[1]??irradiance?.[i*3+1]??0,...s.axes[2],auxiliary?.[2]??irradiance?.[i*3+2]??0,...s.color,packedSeed];
    if(!values.every(Number.isFinite)) throw new Error(`Nonfinite splat ${i}`);
    data.set(values,i*20);centers.set(s.center,i*3);
  });
  return {data,width,height,centers};
}
