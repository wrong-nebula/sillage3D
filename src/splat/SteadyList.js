import {depthOrder,depthOrderKeys,depthKey} from './math.js';

/** The draw list of a view at rest, when only the actor moves.
 *
 * An animated actor changes its marks' depths every frame, so the list of
 * marks to draw was rebuilt every frame: every mark merged in depth order,
 * walked for visibility, walked again for stand-ins and level of detail. At a
 * view that does not change, none of that changes for the environment. This
 * keeps the environment's part of the finished list, in order with its depth
 * keys, and each frame only sorts the actor's marks and merges them in.
 *
 * The result is the list the full rebuild would give: the same Float32 depth
 * keys, the same tie rule (lower mark index first; every environment mark
 * precedes every actor mark), and the environment part taken from a full
 * rebuild of this same view. The renderer decides when that part can be
 * trusted (see GaussianBrushRenderer.mergeSteadyActor).
 */
export class SteadyList {
  constructor(){this.key=null;this.count=0;this.indices=null;this.keys=null;this.order=null;this.actorCount=0;}
  clear(){this.key=null;}
  /** Records a finished list. `list` holds `count` mark indices back to
   * front, of which exactly `actorCount` are at or above `actorStart`.
   * Returns false, and records nothing, if that does not hold. */
  capture(key,list,count,centers,view,actorStart,actorCount){
    const capacity=count-actorCount;
    if(capacity<0){this.key=null;return false;}
    if(!this.indices||this.indices.length<capacity){this.indices=new Float32Array(capacity);this.keys=new Uint32Array(capacity);}
    const {indices,keys}=this;let n=0;
    for(let i=0;i<count;i++){
      const index=list[i];if(index>=actorStart)continue;
      if(n===capacity){this.key=null;return false;}
      indices[n]=index;keys[n++]=depthKey(centers,view,index);
    }
    if(n!==capacity){this.key=null;return false;}
    // The list must already be in key order, or merging would not reproduce it.
    for(let i=1;i<n;i++)if(keys[i]<keys[i-1]||(keys[i]===keys[i-1]&&indices[i]<indices[i-1])){this.key=null;return false;}
    this.key=key;this.count=n;this.actorCount=actorCount;
    if(this.order?.length!==actorCount)this.order=new Uint32Array(actorCount);
    return true;
  }
  /** Writes the list for the actor's marks as they are now into `out` and
   * returns its length. */
  merge(centers,view,actorStart,out){
    const {indices,keys,count,order,actorCount}=this;
    depthOrder(centers.subarray(actorStart*3,(actorStart+actorCount)*3),view,order);
    const actorKeys=depthOrderKeys(order);
    let a=0,n=0;
    for(let b=0;b<actorCount;b++){
      const local=order[b],key=actorKeys[local];
      // An environment mark with the same key has the lower index and goes first.
      while(a<count&&keys[a]<=key)out[n++]=indices[a++];
      out[n++]=actorStart+local;
    }
    if(a<count){out.set(indices.subarray(a,count),n);n+=count-a;}
    return n;
  }
}
