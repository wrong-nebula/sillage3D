/** Low meadow pools and flower islands, guided by the user's Howl meadow stills. */
import {pathX,pathWidth,PATH_START,PATH_END} from './ghibliPath.js';
import {buildCloudBank} from './ghibliClouds.js';

const TAU=Math.PI*2;
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const hex=h=>h.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const noise=(x,z)=>Math.sin(x*.73+Math.sin(z*.51))*.52+Math.sin(z*1.3+x*.38)*.3+Math.cos(x*1.9-z*.89)*.18;
export const PONDS=Object.freeze([
 {center:[-25,16],radii:[12.5,8.3],rotation:-.18,level:-1.22},
 {center:[-32,-3],radii:[10.5,6.5],rotation:.22,level:-1.22},
 {center:[-42,-22],radii:[9.8,6.4],rotation:-.28,level:-1.22},
]);
export const POND=PONDS[0];
const CHANNEL={center:[-29,6],radii:[4.7,8.3],rotation:-.3};
export const ISLANDS=Object.freeze([
 {center:[-29,17.3],radii:[3.4,1.7],rotation:.12},
 {center:[-19.7,14.4],radii:[2.1,1.15],rotation:-.4},
 {center:[-33,-2.4],radii:[3.2,1.45],rotation:.15},
 {center:[-43.3,-22.2],radii:[1.8,1.1],rotation:.2},
]);
function distance(x,z,p){
 const dx=x-p.center[0],dz=z-p.center[1],c=Math.cos(p.rotation),s=Math.sin(p.rotation);
 const u=(dx*c+dz*s)/p.radii[0],v=(-dx*s+dz*c)/p.radii[1],a=Math.atan2(v,u);
 return Math.hypot(u,v)/(1+.12*Math.sin(a*3+.7)+.075*Math.cos(a*5)-.055*Math.sin(a*2));
}
export const wetlandDistance=(x,z)=>Math.min(...PONDS.map(p=>distance(x,z,p)),distance(x,z,CHANNEL));
export function pondDistance(x,z){
 const water=wetlandDistance(x,z),island=Math.min(...ISLANDS.map(p=>distance(x,z,p)));
 return Math.max(water,2-island);
}
export function wetlandHeight(base,x,z){
 const q=pondDistance(x,z),wet=wetlandDistance(x,z);
 if(wet>1.75)return base;
 const island=Math.min(...ISLANDS.map(p=>distance(x,z,p)));
 if(island<1.05)return POND.level+.18+.28*(1-smooth(0,1.05,island));
 if(q<.96)return POND.level-.22-.55*(1-smooth(0,.96,q));
 const edge=POND.level+.18;
 const bank=edge+(Math.max(base,edge)-edge)*smooth(1.18,1.75,q);
 return POND.level-.16+(bank-POND.level+.16)*smooth(.96,1.22,q);
}
export function buildWetlands({mark,rnd,height,normal,groundColor}){
 const blues=['#185b76','#256f88','#39889c','#4d9aaa','#76b3bc'].map(hex);
 const bankMark=(x,z,color,edge=false,extra={})=>{
  const n=normal(x,z),s=mark([x,height(x,z)+.025,z],n,[1,.05,.2],.28,.37,.04,color,edge?'stone':'grass',extra);
  // Lift the horizontal sampling grid onto the slope. Unit tangent axes shrink
  // the footprint on steep banks, leaving holes even though grid cells touch.
  // These sheared covariance axes keep a continuous horizontal footprint.
  const gx=-n[0]/Math.max(.08,n[1]),gz=-n[2]/Math.max(.08,n[1]);
  // The same footprint from perpendicular axes: rotating the sheared pair
  // within its plane leaves a a^T + b b^T unchanged, and one rotation makes
  // the pair the principal axes. Culling bounds and the brush frame assume
  // perpendicular axes. Level ground keeps its original pair exactly.
  const a=[.36,.36*gx,0],b=[0,.32*gz,.32],aa=a[0]*a[0]+a[1]*a[1],bb=b[1]*b[1]+b[2]*b[2],ab=a[1]*b[1];
  const turn=.5*Math.atan2(2*ab,aa-bb),cos=Math.cos(turn),sin=Math.sin(turn);
  const major=a.map((v,k)=>v*cos+b[k]*sin),minor=a.map((v,k)=>b[k]*cos-v*sin);
  const up=[major[1]*minor[2]-major[2]*minor[1],major[2]*minor[0]-major[0]*minor[2],major[0]*minor[1]-major[1]*minor[0]];
  const thickness=.04/Math.hypot(...up)*(up[0]*n[0]+up[1]*n[1]+up[2]*n[2]<0?-1:1);
  s.axes=[major,minor,up.map(v=>v*thickness)];
  s.bankSurface=true;return s;
 };
 let waterCount=0,glintCount=0,flowerCount=0;
 // A single level across linked pools allows one live planar reflection pass.
 for(let z=-36;z<35;z+=.46)for(let x=-61;x<-7;x+=.46){
  const px=x+(rnd()-.5)*.18,pz=z+(rnd()-.5)*.18,q=pondDistance(px,pz),wet=wetlandDistance(px,pz);
  if(q<.985){
   const tone=clamp(.35+.18*noise(px*.3,pz*.35)+.15*(1-q));
   const color=blues[Math.floor(tone*4.999)];
   mark([px,POND.level,pz],[0,1,0],[1,0,.08],.24,.34,.018,color,'water',{wind:[0,1,rnd()*TAU,3]});waterCount++;
  }else if(wet<1.8){
   const edge=q<1.12;
   const color=edge?hex(rnd()>.5?'#456f44':'#5c813f'):mix(groundColor(px,pz),hex('#96b65e'),.3);
   bankMark(px,pz,color,edge);
   if(rnd()<.14&&q<1.4){
    const y=height(px,pz),h=(.25+rnd()*.45)*.4;
    mark([px,y+h*.44,pz],[.15,.1,1],[.12,1,.06],.012,h*.45,.009,hex(rnd()>.5?'#afc56a':'#718f42'),'grass',{wind:[y,h,rnd()*TAU,2]});
   }
  }
 }
 // Separate small daubs follow gently curved, interrupted rows across each pool.
 // Position stays fixed; independently seeded flashes avoid traveling light.
 for(let row=0;row<33;row++){
  const z=-31+row*1.74;
  for(let x=-56;x<-10;x+=.48){
   const px=x+(rnd()-.5)*.09,pz=z+.34*Math.sin(x*.19+row*.7)+(rnd()-.5)*.035;
   if(pondDistance(px,pz)>.9||Math.sin(x*.24+row*1.7)<-.25||rnd()<.15)continue;
   const size=.043+rnd()*.018;
   mark([px,POND.level+.044,pz],[0,1,0],[1,0,.08],size*.78,size*1.05,.018,
    hex(row%3===0?'#fff3d7':row%3===1?'#e3efe4':'#c4e4e9'),'water',
    {opacity:.98,wind:[0,1,rnd()*TAU,6]});glintCount++;
  }
 }
 const flowers=['#e1a4c0','#f1c6d1','#e9ddd0','#f2d776','#d3b7d6','#9bacc8','#c875a2'].map(hex);
 for(let i=0;i<35500;i++){
  const near=i<15500,x=near?-61+rnd()*54:-62+rnd()*112,z=near?-37+rnd()*72:-54+rnd()*105;
  const q=pondDistance(x,z),wet=wetlandDistance(x,z);
  if(q<1.035)continue;
  if(z>PATH_START&&z<PATH_END&&Math.abs(x-pathX(z))<pathWidth(z)*1.1)continue;
  const band=noise(x*.25,z*.25)+.32*Math.sin(z*.85+x*.23);
  if(near?wet>1.9&&band<.1:band<-.12)continue;
  const y=height(x,z),h=(.13+rnd()*.24)*.55,phase=rnd()*TAU;
  const pick=rnd(),color=flowers[pick<.38?0:pick<.56?1:pick<.72?2:pick<.84?3:pick<.92?4:pick<.97?5:6];
  const patch=i%5===0;
  mark([x,y+h,z],[.12,.85,1],[1,.12,.15],patch?.08:.025+rnd()*.022,patch?.23:.045+rnd()*.045,.015,color,'foliage',{wind:[y,h,phase,2],opacity:patch?.73:.96});flowerCount++;
 }
 // The coarse hillside omits the entire wetland skirt, which extends beyond
 // the old water grid. Fill that missing dry bank too, especially behind the
 // rear pond and beside the foreground path. Appending preserves all existing
 // water, glint and flower seeds. These are small surface marks, not a veil.
 let bankExtensionCount=0;
 for(let iz=-32;iz<190;iz++)for(let ix=-32;ix<160;ix++){
  const x=-61+ix*.46,z=-36+iz*.46;
  if(x>=-61&&x<-7&&z>=-36&&z<35)continue;
  const wet=wetlandDistance(x,z),q=pondDistance(x,z);if(wet>=1.84||q<.985)continue;
  bankMark(x,z,mix(groundColor(x,z),hex('#96b65e'),.3),false,{wetlandBankExtension:true});bankExtensionCount++;
 }
 return {waterCount,glintCount,flowerCount,bankExtensionCount,pools:PONDS,islands:ISLANDS,level:POND.level,reference:'/ghibli-references/howl-wetlands.jpg'};
}

export const LOW_CLOUDS=[
 {center:[-42,10,-33],radius:4.4,background:true,phase:.2},
 {center:[-14,15,-45],radius:4.5,background:true,phase:2.2},
 {center:[31,12,-29],radius:4.2,background:true,phase:4.1},
 {center:[-56,7,6],radius:7.8,phase:1.4},
].map(c=>({...c,phase:c.center[0]*.94+c.center[2]*.34}));
export function buildLowClouds({mark,rnd}){
 const banks=LOW_CLOUDS.map((cloud,index)=>buildCloudBank({mark,rnd,cloud,index}));
 return {banks,count:banks.reduce((sum,b)=>sum+b.count,0),reference:'howl-low-clouds.jpg'};
}
