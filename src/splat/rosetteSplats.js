import {createRosetteAnatomy,leafPoint,leafSample,leafMarginSample,sub,cross,dot,unit,mul,add,smooth} from './rosetteAnatomy.js';

const PHI=.6180339887498949,ROOT2=.4142135623730951,TAU=Math.PI*2;
const fract=x=>x-Math.floor(x),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const LIGHT=unit([-.77,.53,.35]);
const rotate=(p,c,s)=>[c*p[0]+s*p[2],p[1],-s*p[0]+c*p[2]];
function areaProfile(leaf,side){
  const rows=96,cols=8,cumulative=[0];let area=0;
  for(let row=0;row<rows;row++){
    const v0=row/rows,v1=(row+1)/rows;
    for(let col=0;col<cols;col++){
      const u0=col/cols,u1=(col+1)/cols;
      const a=leafPoint(leaf,u0,v0,side),b=leafPoint(leaf,u1,v0,side),c=leafPoint(leaf,u0,v1,side),d=leafPoint(leaf,u1,v1,side);
      area+=(Math.hypot(...cross(sub(b,a),sub(c,a)))+Math.hypot(...cross(sub(d,b),sub(c,b))))*.5;
    }
    cumulative.push(area);
  }
  return {area,cumulative,rows};
}
function rowAt(profile,f){
  const target=f*profile.area,a=profile.cumulative;let lo=0,hi=profile.rows-1;
  while(lo<hi){const m=(lo+hi)>>>1;if(a[m+1]<target)lo=m+1;else hi=m;}
  return (lo+(target-a[lo])/Math.max(1e-12,a[lo+1]-a[lo]))/profile.rows;
}

/** Analytic, area-stratified thin-shell sampling. Each side and every margin
 * receives its own budget. Covariance follows the blade, shrinks at high
 * curvature and at its tips, and remains thinner than the local tissue. */
export function sampleRosetteSplats({genome,anchor,yaw=0,scale=1,count=105000,rnd}){
  const anatomy=createRosetteAnatomy(genome),splats=[],c=Math.cos(yaw),s=Math.sin(yaw);
  const plant=[...anchor,genome.height*scale],baseBudget=1800;
  const marginBudget=Math.round((count-baseBudget)*.10),faceBudget=count-baseBudget-marginBudget;
  const descriptors=[],organData=anatomy.leaves.map(leaf=>[...add(rotate(mul(leaf.root,scale),c,s),anchor),leaf.birth]);
  let totalArea=0;
  for(const leaf of anatomy.leaves)for(const side of [1,-1]){
    const profile=areaProfile(leaf,side);totalArea+=profile.area;descriptors.push({leaf,side,profile});
  }
  const emit=(sample,length,width,thickness,organ,kind)=>{
    const n=unit(rotate(sample.normal,c,s)),direction=rotate(sample.tangent,c,s);
    const tangent=unit(sub(direction,mul(n,dot(direction,n)))),across=unit(cross(n,tangent));
    const p=add(rotate(mul(sample.point,scale),c,s),anchor);
    const key=Math.max(0,dot(n,LIGHT)),transmission=Math.max(0,-dot(n,LIGHT));
    const diffuse=.53+.52*key+.16*transmission;
    const crownOcclusion=.80+.20*smooth(.03,genome.height*.58,sample.point[1]);
    const color=sample.color.map((v,i)=>clamp(v*diffuse*crownOcclusion+[.022,.012,.006][i]*key,0,1));
    splats.push({center:p,axes:[mul(tangent,length*scale),mul(across,width*scale),mul(n,thickness*scale)],
      color,opacity:.985,seed:rnd(),material:'foliage',desertPlant:plant,desertOrgan:organ,
      anatomy:{organ:sample.organ?.id??-1,surface:kind,u:sample.uv[0],v:sample.uv[1]},
      wind:[anchor[1],genome.height*scale,-20,16]});
  };
  // Stable area allocation avoids Poisson holes from independent random picks.
  let allocated=0,accumulatedArea=0;
  for(const {leaf,side,profile}of descriptors){
    accumulatedArea+=profile.area;
    const n=Math.round(faceBudget*accumulatedArea/totalArea)-allocated;allocated+=n;
    const spacing=Math.sqrt(profile.area/n),phase=rnd();
    for(let j=0;j<n;j++){
      const v=rowAt(profile,(j+.5)/n),u=.0005+.999*fract(j*PHI+phase);
      const sample=leafSample(leaf,u,v,side);
      const tissue=leaf.thickness*(.22+.78*Math.sqrt(Math.max(0,1-(2*u-1)**2)));
      const tip=1-.38*smooth(.87,1,v),bend=1-.24*sample.curvature;
      const width=spacing*.73*tip*bend,length=spacing*.91*tip;
      // Opposite tissues can never be blended by a fat normal covariance axis.
      const depth=clamp(tissue*.035,.00008,.00055);
      emit(sample,length,width,depth,organData[leaf.id],side>0?'upper':'lower');
    }
  }
  // The high-curvature lip is represented by separate, small normal-aligned
  // samples, rather than expanding nearby face splats over the silhouette.
  for(let j=0;j<marginBudget;j++){
    const leaf=anatomy.leaves[j%anatomy.leaves.length],k=Math.floor(j/anatomy.leaves.length);
    const edge=k%2,v=.003+.994*fract(k*PHI+leaf.id*ROOT2),t=.04+.92*fract(k*ROOT2+.5);
    const sample=leafMarginSample(leaf,edge,v,t);
    const spacing=Math.sqrt(totalArea/faceBudget);
    emit(sample,spacing*.63,Math.min(spacing*.40,leaf.thickness*.20),.0002,organData[leaf.id],'margin');
  }
  // Basal sheaths meet a flared stem at Y=0; no raised disk or exposed roots.
  for(let j=0;j<baseBudget;j++){
    const t=(j+.5)/baseBudget,a=TAU*fract(j*PHI),radius=anatomy.stemRadius*(1-.34*t)*(1+.025*Math.sin(a*11));
    const sample={point:[Math.cos(a)*radius,anatomy.stemHeight*t,Math.sin(a)*radius],normal:unit([Math.cos(a),.08,Math.sin(a)]),tangent:[0,1,0],
      color:genome.palette.base.map(v=>v*(.74+.20*t)),uv:[fract(j*PHI),t]};
    const spacing=Math.sqrt(TAU*anatomy.stemRadius*anatomy.stemHeight/baseBudget);
    emit(sample,spacing*.9,spacing*.75,.0004,null,'stem');
  }
  return {splats,anatomy,stats:{anatomyVersion:2,leaves:anatomy.leaves.length,samples:count,
    upper:descriptors.filter(d=>d.side===1).length,marginSamples:marginBudget,stemSamples:baseBudget,
    surfaceArea:totalArea*scale*scale,minimumThickness:Math.min(...anatomy.leaves.map(l=>l.thickness))*scale}};
}
