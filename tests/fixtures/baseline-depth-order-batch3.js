// Frozen pre-batch-3 exact sorting implementation for performance and image A/B.
const depthWorkspaces=new WeakMap();
/** Exact Float32 depth order, with stable source-index ties. Reused radix
 * buffers avoid comparator callbacks and per-orbit allocations. */
export function depthOrder(centers, viewMatrix, order = null) {
  const count=centers.length/3;
  const result=order || new Uint32Array(count);
  let work=depthWorkspaces.get(result);
  if(!work||work.keys.length!==count){
    const depths=new Float32Array(count);
    work={depths,keys:new Uint32Array(depths.buffer),temporary:new Uint32Array(count),histogram:new Uint32Array(1024)};
    depthWorkspaces.set(result,work);
  }
  const {depths,keys,temporary,histogram}=work;histogram.fill(0);
  for(let i=0;i<count;i++){
    const k=i*3;
    depths[i]=viewMatrix[2]*centers[k]+viewMatrix[6]*centers[k+1]+viewMatrix[10]*centers[k+2]+viewMatrix[14];
    // Numeric comparison considers -0 and +0 equal; preserve that tie rule.
    if(depths[i]===0)depths[i]=0;
    const bits=keys[i],key=(bits&0x80000000)?~bits:(bits^0x80000000);
    keys[i]=key;result[i]=i;
    histogram[key&255]++;histogram[256+((key>>>8)&255)]++;
    histogram[512+((key>>>16)&255)]++;histogram[768+(key>>>24)]++;
  }
  let source=result,destination=temporary;
  for(let pass=0;pass<4;pass++){
    const base=pass*256,shift=pass*8;let offset=0;
    for(let bucket=0;bucket<256;bucket++){const size=histogram[base+bucket];histogram[base+bucket]=offset;offset+=size;}
    for(let i=0;i<count;i++){const index=source[i];destination[histogram[base+((keys[index]>>>shift)&255)]++]=index;}
    const swap=source;source=destination;destination=swap;
  }
  return result;
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
    while(a<staticCount&&b<movingOrder.length){
      const local=movingOrder[b],index=moving[local],key=keys[local];
      const staticKey=staticKeys[staticOrder[a]];
      if(staticKey<key||(staticKey===key&&staticOrder[a]<index))result[n++]=staticOrder[a++];
      else{result[n++]=index;b++;}
    }
    while(a<staticCount)result[n++]=staticOrder[a++];
    while(b<movingOrder.length)result[n++]=moving[movingOrder[b++]];
    this.merges++;return result;
  }
}

