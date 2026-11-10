/** Conservative submission culling. These bounds enclose the vertex shader's
 * existing rejection guard, including every DOF/LOD footprint during a pull.
 * Transparent overlap is deliberately not treated as opaque occlusion. */
export class SplatVisibility {
  constructor(data,count){this.update(data,count);}
  /** A culler for marks whose largest axis lengths are already known. */
  static fromSigma(sigma,count){const culler=Object.create(SplatVisibility.prototype);culler.count=count;culler.views=new Map();culler.sigma=sigma;culler.version=0;return culler;}
  update(data,count){
    this.count=count;this.views=new Map();this.version=(this.version??0)+1;
    if(!this.sigma||this.sigma.length<count)this.sigma=new Float32Array(count);
    for(let i=0;i<count;i++){
      const k=i*20;
      this.sigma[i]=Math.max(Math.hypot(data[k+4],data[k+5],data[k+6]),Math.hypot(data[k+8],data[k+9],data[k+10]),Math.hypot(data[k+12],data[k+13],data[k+14]));
    }
  }
  write(order,centers,camera,options,foreground,background,flags,{width,height,wind,actorStart=Infinity,reflection=false,transition=false,cacheKey=null,movingIndices=null,opticalPixels=0,reach=1,slack=0}={}){
    camera.updateMatrixWorld(true);
    const m=camera.matrixWorldInverse.elements,p=camera.projectionMatrix.elements;
    const tx=1/p[0],ty=1/p[5],brush=options.brushScale??1;
    // The maximum focus envelope avoids reculling/uploading indices during
    // focus pulls and LOD fades, while retaining even their largest soft edges.
    const blur=options.foregroundDOF&&!reflection?(options.dofStrength??.65):0;
    // `reach` covers marks the level-of-detail pass may enlarge.
    const footprint=(transition?1.08:1)*(1+blur*1.5)*(options.mode==='ghibli'?1+(options.gouacheBlend??.7)*.18:1)*reach;
    const rx=3*brush*footprint*Math.sqrt(1+tx*tx),ry=3*brush*footprint*Math.sqrt(1+ty*ty);
    // `slack` widens the frustum for a list that will be drawn a frame late.
    const gx=tx*(1+slack)+(6*height*.024*blur+opticalPixels)/(width*p[0]*.5),gy=ty*(1+slack)+(6*height*.024*blur+opticalPixels)/(height*p[5]*.5);
    // Opt-in contract: all CPU centers except movingIndices/actors, and wind
    // membership, stay fixed until update() or a new cache key. Unannotated
    // callers retain the original uncached behavior for mutable buffers.
    if(order.length!==this.count)cacheKey=null;
    const view=reflection?'reflection':'main';let cache=cacheKey===null?null:this.views.get(view);
    const same=cache&&cache.key===cacheKey&&cache.centers===centers&&cache.wind===wind&&cache.moving===movingIndices&&cache.actorStart===actorStart&&cache.opticalPixels===opticalPixels;
    const reuse=same&&cache.ready;
    // Avoid writing a throwaway mask on every orbit frame. Build it only once
    // this view repeats; stationary animation reuses it from the third frame.
    if(cacheKey!==null&&!same){cache={key:cacheKey,centers,wind,moving:movingIndices,actorStart,opticalPixels,visible:cache?.visible,ready:false};this.views.set(view,cache);}
    const save=same&&!cache.ready;
    if(save){cache.visible??=new Uint8Array(this.count);cache.visible.fill(0);}
    const visible=index=>{
      // Shader-deformed plants, drifting clouds and skinned actors retain their
      // full submission. Rest-pose bounds must never clip moving silhouettes.
      if(index<actorStart&&!(wind?.[index*4+3]>.5)){
        const k=index*3,x=centers[k],y=centers[k+1],z=centers[k+2],sigma=this.sigma[index];
        const px=m[0]*x+m[4]*y+m[8]*z+m[12],py=m[1]*x+m[5]*y+m[9]*z+m[13];
        const d=-(m[2]*x+m[6]*y+m[10]*z+m[14]);
        // Expand in world/view units to absorb float32 GPU rounding at edges.
        const margin=1e-4*(1+Math.abs(px)+Math.abs(py)+Math.abs(d)+sigma*brush);
        if(d<Math.max(camera.near,.08,sigma*brush*1.5)-margin||d>camera.far+margin
          ||Math.abs(px)>d*gx+sigma*rx+margin||Math.abs(py)>d*gy+sigma*ry+margin)return 0;
      }
      return 1;
    };
    let front=0,back=0;
    if(reuse){
      if(movingIndices)for(const index of movingIndices)cache.visible[index]=visible(index);
      for(let i=0;i<order.length;i++){
        const index=order[i];if(!cache.visible[index])continue;
        if(background&&flags[index])background[back++]=index;else foreground[front++]=index;
      }
      this.lastTested=movingIndices?.length??0;
    }else if(order.length===this.count){
      // A changing view tests every mark. Walking them in memory order reads
      // centers, sizes and wind in sequence; the depth-ordered walk that
      // follows then looks up one byte per mark instead of missing the cache
      // on each. The predicate is the one above.
      const count=this.count,tested=Math.min(count,actorStart),sigmas=this.sigma,near=Math.max(camera.near,.08),far=camera.far;
      const mask=save?cache.visible:(this.mask?.length===count?this.mask:(this.mask=new Uint8Array(count)));
      for(let index=0,k=0;index<tested;index++,k+=3){
        if(wind&&wind[index*4+3]>.5){mask[index]=1;continue;}
        const x=centers[k],y=centers[k+1],z=centers[k+2],reach=sigmas[index]*brush;
        const px=m[0]*x+m[4]*y+m[8]*z+m[12],py=m[1]*x+m[5]*y+m[9]*z+m[13],d=-(m[2]*x+m[6]*y+m[10]*z+m[14]);
        const margin=1e-4*(1+Math.abs(px)+Math.abs(py)+Math.abs(d)+reach);
        mask[index]=d<Math.max(near,reach*1.5)-margin||d>far+margin||Math.abs(px)>d*gx+sigmas[index]*rx+margin||Math.abs(py)>d*gy+sigmas[index]*ry+margin?0:1;
      }
      if(tested<count)mask.fill(1,tested,count);
      for(let i=0;i<count;i++){
        const index=order[i];if(!mask[index])continue;
        if(background&&flags[index])background[back++]=index;else foreground[front++]=index;
      }
      if(save)cache.ready=true;this.lastTested=count;
    }else{
      // Partial orders keep the original inline predicate.
      for(let i=0;i<order.length;i++){
        const index=order[i];
        if(index<actorStart&&!(wind?.[index*4+3]>.5)){
          const k=index*3,x=centers[k],y=centers[k+1],z=centers[k+2],sigma=this.sigma[index];
          const px=m[0]*x+m[4]*y+m[8]*z+m[12],py=m[1]*x+m[5]*y+m[9]*z+m[13],d=-(m[2]*x+m[6]*y+m[10]*z+m[14]);
          const margin=1e-4*(1+Math.abs(px)+Math.abs(py)+Math.abs(d)+sigma*brush);
          if(d<Math.max(camera.near,.08,sigma*brush*1.5)-margin||d>camera.far+margin
            ||Math.abs(px)>d*gx+sigma*rx+margin||Math.abs(py)>d*gy+sigma*ry+margin)continue;
        }
        if(save)cache.visible[index]=1;
        if(background&&flags[index])background[back++]=index;else foreground[front++]=index;
      }
      if(save)cache.ready=true;this.lastTested=order.length;
    }
    return {foreground:front,background:back,submitted:front+back,culled:order.length-front-back};
  }
}
