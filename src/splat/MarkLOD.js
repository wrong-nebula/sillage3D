/** Level of detail for dense fields of small static marks.
 *
 * A terrain sheet is sampled at a fixed world spacing, so far from the camera
 * thousands of marks land within a few pixels of each other. Each still costs
 * a vertex stage, a quad and its share of brush work. Where a mark's
 * projected footprint is smaller than `pixels` across, only a share of such
 * marks is kept and the kept ones are enlarged so the sheet stays covered:
 *
 *   keep  = (projected size / pixels)^2, at least 1/16
 *   grow  = 1 / (keep * mean weight)      (area; axes scale by its root)
 *
 * Which marks stay is fixed per mark by a low-discrepancy rank, so the kept
 * set is evenly spread and stable from frame to frame; a mark fades over the
 * last part of its range instead of popping as the camera moves.
 *
 * The vertex shader is the authority: it measures the real footprint after
 * wind, seasons and style, and drops or enlarges accordingly. The CPU only
 * withholds marks the shader is certain to drop, using a generous margin, so
 * disagreement between the two can cost a little speed but never a hole.
 *
 * Only plain, wind-free environment marks take part. Actors, plants, water,
 * sky, fog, glints and every specially lit surface are left alone.
 */
export const MARK_LOD_DEFAULTS=Object.freeze({markLOD:true});
export const MARK_LOD_MIN_KEEP=1/16;
/** Share of a mark's range over which it fades out. */
export const MARK_LOD_FADE=.25;
/** Largest linear enlargement of a kept mark; culling bounds allow for it. */
export const MARK_LOD_MAX_SCALE=Math.sqrt(1/(MARK_LOD_MIN_KEEP*(1-.5*MARK_LOD_FADE)));
/** The CPU withholds a mark only when its rank clears this inflated share.
 * Its estimate uses the largest footprint the style allows and no slope
 * clamp, so it is already at or above the shader's; the margin covers
 * float32 rounding. */
const CPU_MARGIN=[1.03,.004];

/** Stable rank in [0,1): Knuth's multiplicative hash, exact in 24 bits on
 * both the CPU and the GPU. */
export const markRank=index=>(Math.imul(index,0x9E3779B1)>>>8)/16777216;
/** Share of marks kept for a projected covariance without the pixel floor. */
export const markKeep=(xx,xy,yy,pixels)=>Math.min(1,Math.max(MARK_LOD_MIN_KEEP,Math.sqrt(Math.max(xx*yy-xy*xy,0))/(pixels*pixels)));
/** The fade narrows to nothing as keep reaches 1, so full detail has no
 * faded marks and the transition into LOD is continuous. */
const fadeWidth=keep=>MARK_LOD_FADE*Math.min(1,(1-keep)*5);
export function markWeight(keep,rank){
  if(keep>=1)return 1;
  const width=fadeWidth(keep)*keep;
  return width>0?Math.min(1,Math.max(0,(keep-rank)/width)):rank<keep?1:0;
}
/** Area enlargement that restores the coverage of the withheld marks. */
export const markGrow=keep=>keep>=1?1:1/(keep*(1-.5*fadeWidth(keep)));

export const MARK_LOD_VERTEX_DECLARATION=/* glsl */`
// x: footprint threshold in pixels (0 disables), y: first actor splat.
uniform vec2 markLod;
`;
/** Evaluated once the mark's class is known, before the frustum guard. */
export const MARK_LOD_VERTEX_ELIGIBLE=/* glsl */`
  bool markLodEligible=markLod.x>0.&&pigment.a>=0.&&pigment.a<1.&&windKind<.5&&splatIndex<markLod.y;
`;
/** The projected covariance of the mark, then its level of detail, then the
 * .3 px^2 floor. `a`, `b`, `c` and `footprintScale` feed the brush frame. */
export const MARK_LOD_VERTEX_GLSL=/* glsl */`
  float xx=dot(vec3(a.x,b.x,c.x),vec3(a.x,b.x,c.x));
  float xy=a.x*a.y+b.x*b.y+c.x*c.y;
  float yy=dot(vec3(a.y,b.y,c.y),vec3(a.y,b.y,c.y));
  if(markLodEligible){
    float keep=clamp(sqrt(max(xx*yy-xy*xy,0.))/(markLod.x*markLod.x),${MARK_LOD_MIN_KEEP},1.);
    if(keep<1.){
      float rank=float((uint(splatIndex)*2654435761u)>>8u)*${1/16777216};
      float fade=${MARK_LOD_FADE}*min(1.,(1.-keep)*5.),width=fade*keep;
      float weight=width>0.?clamp((keep-rank)/width,0.,1.):step(rank,keep-1e-7);
      if(weight<=0.){gl_Position=vec4(2.,2.,2.,1.);return;}
      float grow=1./(keep*(1.-.5*fade)),stretch=sqrt(grow);
      xx*=grow;xy*=grow;yy*=grow;a*=stretch;b*=stretch;c*=stretch;footprintScale*=stretch;
      defocusCoverage*=weight;
    }
  }
  xx+=.3;yy+=.3;
`;

/** Marks the splats of `indices` that the shader is certain to drop.
 * `data` is the packed splat texture (20 floats per splat), `wind` the
 * per-splat wind texture, `footprint` the largest axis scale the shader can
 * apply (brush size, gouache spread, defocus envelope). Marks that move on
 * the CPU are never withheld. Returns how many were marked. */
export function markLodDrops(drop,indices,count,data,wind,{view,projection,width,height,pixels,footprint=1,actorStart=Infinity,moving=null}){
  const fx=projection[0]*width*.5,fy=projection[5]*height*.5,inverse=1/(pixels*pixels);let dropped=0;
  for(let i=0;i<count;i++){
    const index=indices[i],k=index*20,seed=data[k+19];
    drop[index]=0;
    if(index>=actorStart||!(seed>=0&&seed<1)||(wind&&wind[index*4+3]>=.5))continue;
    const x=data[k],y=data[k+1],z=data[k+2];
    const px=view[0]*x+view[4]*y+view[8]*z+view[12],py=view[1]*x+view[5]*y+view[9]*z+view[13],d=-(view[2]*x+view[6]*y+view[10]*z+view[14]);
    if(!(d>.08))continue;
    let xx=0,xy=0,yy=0;
    for(let axis=k+4;axis<k+16;axis+=4){
      const ax=data[axis]*footprint,ay=data[axis+1]*footprint,az=data[axis+2]*footprint,vz=view[2]*ax+view[6]*ay+view[10]*az;
      const u=fx*((view[0]*ax+view[4]*ay+view[8]*az)/d+px*vz/(d*d)),v=fy*((view[1]*ax+view[5]*ay+view[9]*az)/d+py*vz/(d*d));
      xx+=u*u;xy+=u*v;yy+=v*v;
    }
    const keep=Math.max(MARK_LOD_MIN_KEEP,Math.sqrt(Math.max(xx*yy-xy*xy,0))*inverse);
    if(markRank(index)>=keep*CPU_MARGIN[0]+CPU_MARGIN[1]){drop[index]=1;dropped++;}
  }
  if(moving)for(const index of moving)if(drop[index]){drop[index]=0;dropped--;}
  return dropped;
}
