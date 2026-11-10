/** Merged stand-ins for groups of small marks.
 *
 * Far from the camera a terrain sheet is sampled much more finely than the
 * screen can show. The mark level of detail (MarkLOD.js) keeps a share of such
 * marks and enlarges them, which leaves each survivor with one member's color
 * and shape. Here each group of neighbors is instead replaced by one mark
 * built from all of them: their area-weighted center and pigment, a shape
 * fitted to the whole group, and the group's total painted area. On the cliff
 * that saved the same GPU time with about a third less change to the image.
 *
 * Groups are formed once, at scene build, in cells sized for the scene's
 * authored camera. The stand-ins are added as ordinary splats after the marks
 * they summarize, so every per-splat table built afterwards covers them. At
 * run time the renderer draws either a group's stand-in or its members, never
 * both: the stand-in while it projects small, the members once the camera
 * comes close enough to see them. Nothing is lost by zooming in.
 */
export const MARK_CLUSTER_SWITCH=Object.freeze({show:1.15,hide:1.45});
/** Members must be this far below the threshold before they are grouped. */
const MEMBER_SHARE=.7;
/** Side of a grouping cell in thresholds: a cell of marks at the usual
 * overlap then merges to about one threshold across. */
const CELL=1.05;

/** A plain, static environment mark: no wind, no special kernel or lighting. */
export function plainStaticMark(splat){
  return !splat.wind&&!splat.noFog&&!splat.skyBackground&&!splat.softParticle&&!splat.celPaint&&!splat.sandGlint
    &&!splat.reefMoss&&!splat.reefRock&&!splat.reefRay&&splat.reefGlow===undefined&&!splat.fishScale&&!splat.fishCatchlight
    &&!splat.thermal&&!splat.reefFlow&&!splat.iridescent&&!splat.jade&&!splat.anisotropic&&splat.surfaceType===undefined;
}

/** View matrix elements (column-major, as three.js) for a camera at
 * `position` looking at `target` with +Y up. */
function lookAt(position,target){
  let zx=position[0]-target[0],zy=position[1]-target[1],zz=position[2]-target[2];const zl=Math.hypot(zx,zy,zz)||1;zx/=zl;zy/=zl;zz/=zl;
  let xx=zz,xy=0,xz=-zx;const xl=Math.hypot(xx,xz)||1;xx/=xl;xz/=xl;
  const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
  return [xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-(xx*position[0]+xy*position[1]+xz*position[2]),-(yx*position[0]+yy*position[1]+yz*position[2]),-(zx*position[0]+zy*position[1]+zz*position[2]),1];
}

/** Projected size of a mark in pixels: the fourth root of the determinant of
 * its screen covariance, as the level of detail measures it. */
export function markPixels(center,axes,view,fx,fy,scale=1){
  const [x,y,z]=center,px=view[0]*x+view[4]*y+view[8]*z+view[12],py=view[1]*x+view[5]*y+view[9]*z+view[13],d=-(view[2]*x+view[6]*y+view[10]*z+view[14]);
  if(!(d>.08))return {size:Infinity,depth:d};
  let xx=0,xy=0,yy=0;
  for(const a of axes){
    const ax=a[0]*scale,ay=a[1]*scale,az=a[2]*scale,vz=view[2]*ax+view[6]*ay+view[10]*az;
    const u=fx*((view[0]*ax+view[4]*ay+view[8]*az)/d+px*vz/(d*d)),v=fy*((view[1]*ax+view[5]*ay+view[9]*az)/d+py*vz/(d*d));
    xx+=u*u;xy+=u*v;yy+=v*v;
  }
  return {size:Math.sqrt(Math.sqrt(Math.max(xx*yy-xy*xy,0))),depth:d};
}

/** Eigenvectors of a symmetric 3x3 matrix [xx,xy,xz,yy,yz,zz], by Jacobi
 * rotations. Returns values and unit column vectors. */
function eigen(m){
  const a=[[m[0],m[1],m[2]],[m[1],m[3],m[4]],[m[2],m[4],m[5]]],v=[[1,0,0],[0,1,0],[0,0,1]];
  for(let sweep=0;sweep<16;sweep++)for(const [p,q] of [[0,1],[0,2],[1,2]]){
    if(Math.abs(a[p][q])<1e-18)continue;
    const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle);
    for(let k=0;k<3;k++){const x=a[k][p],y=a[k][q];a[k][p]=c*x-s*y;a[k][q]=s*x+c*y;}
    for(let k=0;k<3;k++){const x=a[p][k],y=a[q][k];a[p][k]=c*x-s*y;a[q][k]=s*x+c*y;}
    for(let k=0;k<3;k++){const x=v[k][p],y=v[k][q];v[k][p]=c*x-s*y;v[k][q]=s*x+c*y;}
  }
  return {values:[a[0][0],a[1][1],a[2][2]],vectors:v};
}

const inPlaneArea=axes=>{const lengths=axes.map(a=>Math.hypot(a[0],a[1],a[2])).sort((a,b)=>b-a);return lengths[0]*lengths[1];};

/** One mark for a group: weighted by painted area and opacity. */
function mergeGroup(group,splats){
  let weight=0,area=0,opacity=0;const center=[0,0,0],color=[0,0,0],normal=[0,0,0],covariance=[0,0,0,0,0,0];
  const weights=group.map(index=>{
    const s=splats[index],a=inPlaneArea(s.axes),w=a*s.opacity;weight+=w;area+=a;opacity=Math.max(opacity,s.opacity);
    for(let k=0;k<3;k++){center[k]+=w*s.center[k];color[k]+=w*s.color[k];normal[k]+=w*s.axes[2][k];}
    return w;
  });
  for(let k=0;k<3;k++){center[k]/=weight;color[k]=Math.min(1,Math.max(0,color[k]/weight));}
  group.forEach((index,i)=>{
    const s=splats[index],w=weights[i]/weight,dx=s.center[0]-center[0],dy=s.center[1]-center[1],dz=s.center[2]-center[2];
    covariance[0]+=w*dx*dx;covariance[1]+=w*dx*dy;covariance[2]+=w*dx*dz;covariance[3]+=w*dy*dy;covariance[4]+=w*dy*dz;covariance[5]+=w*dz*dz;
    for(const a of s.axes){covariance[0]+=w*a[0]*a[0];covariance[1]+=w*a[0]*a[1];covariance[2]+=w*a[0]*a[2];covariance[3]+=w*a[1]*a[1];covariance[4]+=w*a[1]*a[2];covariance[5]+=w*a[2]*a[2];}
  });
  const {values,vectors}=eigen(covariance),order=[0,1,2].sort((a,b)=>values[b]-values[a]),sigma=order.map(i=>Math.sqrt(Math.max(values[i],1e-12)));
  // The fitted shape gives direction and proportion; the group's summed
  // painted area gives size, so the sheet stays covered.
  const grow=Math.sqrt(area/Math.max(sigma[0]*sigma[1],1e-18)),first=splats[group[0]];
  const axes=order.map((i,j)=>{
    const length=j<2?sigma[j]*grow:Math.max(sigma[2],Math.hypot(...first.axes[2]));
    return [vectors[0][i]*length,vectors[1][i]*length,vectors[2][i]*length];
  });
  // The thin axis is the surface normal that lighting and snow read.
  if(axes[2][0]*normal[0]+axes[2][1]*normal[1]+axes[2][2]*normal[2]<0)axes[2]=axes[2].map(v=>-v);
  return {center,axes,color,opacity,seed:first.seed,material:first.material,markCluster:true};
}

/** Groups small eligible marks and appends one stand-in per group to
 * `splats`. `camera` is {position,target,fov} with a vertical field of view in
 * degrees, `height` the viewport height the threshold refers to. Returns the
 * table the renderer selects from, or null when nothing was grouped. */
export function buildMarkClusters(splats,{camera,height=1000,pixels=2,footprint=1,eligible=plainStaticMark}={}){
  if(!camera||!(pixels>0)||!(height>0))throw new RangeError('Mark clusters need a camera, a viewport height and a pixel threshold.');
  const view=lookAt(camera.position,camera.target),focal=height*.5/Math.tan(camera.fov*Math.PI/360),limit=splats.length;
  let candidates=[];
  for(let index=0;index<limit;index++){
    const splat=splats[index];
    if(!eligible(splat,index))continue;
    const {size,depth}=markPixels(splat.center,splat.axes,view,focal,focal,footprint);
    if(!(size*size<MEMBER_SHARE*pixels*pixels))continue;
    // Cells double in size per level, so each holds about one threshold of screen.
    const level=Math.round(Math.log2(CELL*pixels*depth/focal/.01));
    candidates.push({index,level,cell:.01*2**level});
  }
  const starts=[0],members=[],merged=[];
  // A mark alone in its cell often has neighbors just across the cell wall:
  // the second pass regroups the leftovers on a grid shifted by half a cell.
  for(const shift of [0,.5]){
    const groups=new Map(),alone=[];
    for(const candidate of candidates){
      const {index,level,cell}=candidate,splat=splats[index];
      const key=`${level}:${Math.floor(splat.center[0]/cell+shift)}:${Math.floor(splat.center[1]/cell+shift)}:${Math.floor(splat.center[2]/cell+shift)}:${splat.material??''}`;
      const group=groups.get(key);
      if(group)group.push(candidate);else groups.set(key,[candidate]);
    }
    for(const group of groups.values()){
      if(group.length<2){alone.push(group[0]);continue;}
      const indices=group.map(candidate=>candidate.index);
      merged.push(splats.length);splats.push(mergeGroup(indices,splats));
      members.push(...indices);starts.push(members.length);
    }
    candidates=alone;
  }
  if(!merged.length)return null;
  // Where each member stood when its stand-in was built. A member that has
  // since moved (a boulder the physics has pushed) invalidates the stand-in.
  const rest=new Float32Array(members.length*3);
  members.forEach((index,i)=>rest.set(splats[index].center,i*3));
  return {pixels,starts:Uint32Array.from(starts),members:Uint32Array.from(members),merged:Uint32Array.from(merged),rest};
}

/** The group each mark belongs to, -1 for none: a mark is in at most one. */
export function clusterOwners(clusters,total){
  const owner=new Int32Array(total).fill(-1),{starts,members,merged}=clusters;
  for(let c=0;c<merged.length;c++)for(let m=starts[c];m<starts[c+1];m++)owner[members[m]]=c;
  return owner;
}
const membersAtRest=(clusters,c,data)=>{
  const {starts,members,rest}=clusters;
  for(let m=starts[c];m<starts[c+1];m++){const p=members[m]*20,r=m*3;if(data[p]!==rest[r]||data[p+1]!==rest[r+1]||data[p+2]!==rest[r+2])return 0;}
  return 1;
};
/** Rechecks, in `still`, only the groups that own one of the `moving` marks. */
export function refreshClusterStill(clusters,still,data,moving,owner){
  for(const index of moving){const c=owner[index];if(c>=0)still[c]=membersAtRest(clusters,c,data);}
}

/** Chooses, for the current view, between each group's stand-in and its
 * members, and writes the losers into `hidden` (indexed by splat). `shown`
 * holds the previous choice per group and gives the switch its hysteresis.
 * `data` is the packed splat texture. With `enabled` false, or once any member
 * has left its place, a group shows its members. Reading every member's place
 * is most of the cost, so a caller that knows which marks can move may pass
 * `still` (one byte per group) and `verify: false` to trust it; with `verify`
 * every group is checked and `still` is rewritten. `standIns` may supply the
 * stand-ins' packed rows in group order in place of `data` (see
 * SplatSortJob.js). Returns how many groups show their stand-in. */
export function selectMarkClusters(clusters,shown,hidden,data,{view,projection,width,height,footprint=1,enabled=true,still:known=null,verify=true,standIns=null}){
  const {starts,members,merged,pixels}=clusters,fx=projection[0]*width*.5,fy=projection[5]*height*.5,center=[0,0,0],axes=[[0,0,0],[0,0,0],[0,0,0]];
  let count=0;
  for(let c=0;c<merged.length;c++){
    const index=merged[c],k=standIns?c*20:index*20,rows=standIns??data;let use=0;
    let still=known&&!verify?known[c]:membersAtRest(clusters,c,data);
    if(known&&verify)known[c]=still;
    if(!enabled)still=0;
    if(still){
      center[0]=rows[k];center[1]=rows[k+1];center[2]=rows[k+2];
      for(let j=0;j<3;j++){axes[j][0]=rows[k+4+j*4];axes[j][1]=rows[k+5+j*4];axes[j][2]=rows[k+6+j*4];}
      const {size}=markPixels(center,axes,view,fx,fy,footprint);
      use=size<pixels*(shown[c]?MARK_CLUSTER_SWITCH.hide:MARK_CLUSTER_SWITCH.show)?1:0;
    }
    shown[c]=use;hidden[index]=use?0:1;count+=use;
    for(let m=starts[c];m<starts[c+1];m++)hidden[members[m]]=use;
  }
  return count;
}
