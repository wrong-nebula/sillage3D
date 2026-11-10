import {buildCathedralArchitecture} from './cathedralArchitecture.js';
import {buildCathedralEnvironment} from './cathedralEnvironment.js';
import {buildCathedralHouses} from './cathedralHouses.js';

const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));

/** A separate seeded field keeps the existing studies' mark sequences intact. */
function cathedralField(seed){
 const rnd=()=>{
  seed|=0;seed=seed+0x6D2B79F5|0;
  let t=Math.imul(seed^seed>>>15,1|seed);
  t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296;
 };
 const splats=[];
 function mark(center,normal,direction,width,length,depth,color,opacity=.95,material='stone'){
  normal=unit(normal);
  let tangent=direction.map((v,i)=>v-normal[i]*dot(direction,normal));
  if(Math.hypot(...tangent)<.01)tangent=cross(normal,Math.abs(normal[1])>.8?[1,0,0]:[0,1,0]);
  tangent=unit(tangent);
  splats.push({center,axes:[mul(tangent,length),mul(unit(cross(normal,tangent)),width),mul(normal,depth)],color,opacity,seed:rnd(),material});
 }
 return {rnd,splats,mark};
}

export function createCathedral(){
 const F=cathedralField(189402);
 const environment=buildCathedralEnvironment(F);
 const architecture=buildCathedralArchitecture(F);
 const houses=buildCathedralHouses(F);
 return {
  splats:F.splats,background:'#d7cdce',orbitLimit:90,
  atmosphere:{color:'#bdc6d7',horizonColor:'#e5d7cf',start:20,density:.017,max:.98,heightStart:17,heightDensity:.02},
  composition:{environment,architecture,houses},
 };
}
