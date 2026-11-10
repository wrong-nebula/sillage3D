/** Broad, chipped stone planes and folded shrine paper, authored as 3D pigment. */
import {ISLANDS,pondDistance} from './wetlands.js';

const TAU=Math.PI*2;
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((v,x,k)=>v+x*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1)),mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const hex=s=>s.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const clamp=v=>Math.max(0,Math.min(1,v));
const SUN=unit([-.8,1.1,.7]);
const STONE=['#35403f','#5b695f','#92988a','#c0bca1','#dfd3b3'].map(hex);
const MOSS=['#546c45','#6f824c','#929c5d'].map(hex);

// These groups echo the original Canopy study, with lower, asymmetric profiles.
export const MEADOW_ROCKS=[
 [3,17,2.6,1.9,1.82],[5.8,18.5,.92,.65,.8],[.5,19.4,.65,.39,.58],
 [-8,-16,1.75,1.35,1.45],[-6,-16.4,.7,.65,.6],[-10.2,-14.8,.55,.42,.6],
 [23,-10,1.85,1.15,1.5],[25,-10.5,.85,.62,.65],
 [-39,7,1.9,1.3,1.45],[-36.8,7.8,.73,.5,.62],
 // Lower, moss-heavy outcrops in the open meadow and at the forest edge.
 [9,-8,.92,.76,.78],[10.25,-7.6,.38,.3,.35],[8.1,-6.9,.3,.22,.4],
 [-3,-7,.86,.68,.7],[-1.9,-6.6,.32,.24,.38],[-3.9,-6.1,.38,.28,.3],
 [24,11,1.2,.85,1.0],[25.5,11.7,.52,.35,.44],[22.8,12.5,.36,.28,.38],
 [-25,-8,.91,.73,.75],[-25.8,-9.3,.35,.27,.4],[-24.1,-6.9,.3,.22,.28],
 // Low-left outcrops frame the meadow and leave the dog's pond circuit open.
 [-45,32,2.1,1.45,1.6],[-47.8,32.5,.8,.6,.8],[-43.5,34,.46,.3,.55],
 [-52,18,1.55,1.0,1.2],[-50,19.4,.62,.45,.75],[-53.4,19.8,.37,.25,.32],
];

/** Keep broad ground Gaussians from washing over small stone silhouettes. */
export function refinePropGround({mark,splats,groundLayer,height,normal,colorAt,guardian,extraSites=[]}){
 const sites=[...MEADOW_ROCKS.map(([x,z,rx,,rz])=>[x,z,Math.max(rx,rz)+2]),[guardian.x,guardian.z,3.2],...extraSites];
 let refined=0;
 for(let i=groundLayer.start;i<groundLayer.start+groundLayer.count;i++){
  const s=splats[i],x=s.center[0],z=s.center[2];
  if(Math.hypot(...s.axes[0])<1.2||!sites.some(([sx,sz,r])=>Math.hypot(x-sx,z-sz)<r))continue;
  s.axes=s.axes.map(a=>mul(a,1/3));refined++;
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
   if(dx===0&&dz===0)continue;
   const px=x+dx*2/3,pz=z+dz*2/3;
   if(pondDistance(px,pz)<1.1)continue;
   mark([px,height(px,pz),pz],normal(px,pz),[1,.12,.25],.407,.517,.037,colorAt(px,pz));
  }
 }
 return {refined};
}

export function buildGhibliRocks({mark,rnd,height}){
 const rocks=[],islandRocks=[];let count=0,mossCount=0,smallRocks=0,grassCount=0;
 function rock(spec,index,island=false,chip=false){
  const [x,z,rx,ry,rz]=spec,base=height(x,z),yaw=index*2.37,cs=Math.cos(yaw),sn=Math.sin(yaw);
  const rotate=p=>[p[0]*cs+p[2]*sn,p[1],-p[0]*sn+p[2]*cs];
  const rings=[],faces=[];let area=0;
  // Joined uneven rings create a solid stone with a broad cap, broken shoulders
  // and a buried foot. Neighbouring triangles share vertices, with no cracks.
  const radial=Array.from({length:8},(_,i)=>.71+rnd()*.35+(i%3===0?.10:0));
  for(const [j,[y,r]]of [[-.4,.72],[.12,1],[.76,.69]].entries()){
   rings.push(Array.from({length:8},(_,i)=>{
    const a=i*TAU/8+.06*Math.sin(i*2+index),q=radial[i]*r;
    return add([x,base+ry*.34,z],rotate([Math.cos(a)*rx*q+rx*j*.09,(y+.15*Math.sin(i*1.7+index)+.045*Math.cos(i*3-index))*ry,Math.sin(a)*rz*q]));
   }));
  }
  const cap=add([x,base+ry*1.14,z],rotate([rx*.31,0,-rz*.23])),foot=[x,base-ry*.25,z];
  function face(a,b,c){
   let n=cross(sub(b,a),sub(c,a));const size=Math.hypot(...n)*.5;n=unit(n);
   const center=mul(add(add(a,b),c),1/3);
   if(dot(n,sub(center,[x,base+ry*.3,z]))<0)n=mul(n,-1);
   area+=size;faces.push({a,b,c,n,total:area});
  }
  for(let i=0;i<8;i++){
   const k=(i+1)%8;
   for(let j=0;j<2;j++){face(rings[j][i],rings[j][k],rings[j+1][i]);face(rings[j][k],rings[j+1][k],rings[j+1][i]);}
   face(rings[2][i],rings[2][k],cap);face(rings[0][k],rings[0][i],foot);
  }
  const samples=chip?90:island?180:rx>1?950:230,size=Math.sqrt(area/samples)*.66;
  let fi=0;
  for(let i=0;i<samples;i++){
   const target=(i+rnd())/samples*area;while(fi<faces.length-1&&faces[fi].total<target)fi++;
   const {a,b,c,n}=faces[fi],u=Math.sqrt(rnd()),v=rnd();
   const p=add(add(mul(a,1-u),mul(b,u*(1-v))),mul(c,u*v));
   if(p[1]<height(p[0],p[2])-.12)continue;
   const light=clamp(.36+.58*dot(n,SUN)),band=light*4,k=Math.min(3,Math.floor(band));
   const baseColor=mix(STONE[k],STONE[k+1],band-k);
   const mineral=Math.sin(p[0]*3.7+p[2]*2.1+Math.sin(p[1]*3.3)),grain=.96+.045*mineral+(rnd()-.5)*.04;
   let color=baseColor.map(v=>v*grain);
   const patch=Math.sin((p[0]-x)*2.3+index)+Math.cos((p[2]-z)*3.1-index*.4);
   const mossy=n[1]>.06&&patch>-.3;
   if(mossy)color=mix(color,MOSS[Math.min(2,Math.floor(light*3))],.48);
   mark(p,n,rotate([1,.18,.31]),size*.76,size*1.2,size*.07,color,'stone');count++;
   // A few chipped edges and mineral seams break the large coherent faces.
   const edge=Math.min(1-u,u*(1-v),u*v);
   if(!chip&&edge<.035&&rnd()<.27){
    const edgeColor=mix(color,n[1]>.45?hex('#d2c9aa'):hex('#354b4c'),.38);
    mark(add(p,mul(n,.025)),n,unit(sub(b,a)),size*.19,size*.7,.012,edgeColor,'stone');count++;
   }
   // Moss follows moist upward cracks in patches; pale faces stay readable.
   if(mossy&&rnd()<.53){
    mark(add(p,mul(n,.035)),n,rotate([1,.2,.4]),size*.64,size*.92,.036,MOSS[Math.min(2,Math.floor(light*3))],'foliage');count++;mossCount++;
    if(!chip&&n[1]>.55&&i%11===0){
     const base=p[1]+.04,h=.16+rnd()*.12;
     mark([p[0],base+h*.45,p[2]],[.34,0,-.94],[.18,1,.06],.023,h*.36,.012,hex('#b0bc74'),'grass',{wind:[base,h,index,2]});count++;grassCount++;
    }
   }
  }
  const info={center:[x,base,z],radii:[rx,ry,rz],island,chip};rocks.push(info);if(island)islandRocks.push(info);if(chip)smallRocks++;
 }
 MEADOW_ROCKS.forEach((s,i)=>rock(s,i));
 // Loose, unequal fragments gather around each large stone, with gaps for grass.
 for(const [group,boulder]of MEADOW_ROCKS.filter(s=>s[2]>1).entries()){
  const [x,z,rx,,rz]=boulder;
  for(let j=0;j<8;j++){
   const a=j*2.3999632297+group*.8,reach=1.15+rnd()*.8;
   const px=x+Math.cos(a)*(rx+.35)*reach,pz=z+Math.sin(a)*(rz+.3)*reach;
   if(pondDistance(px,pz)<1.18)continue;
   const scale=.16+rnd()**1.5*.32;
   rock([px,pz,scale,.13+scale*.62,scale*(.6+rnd()*.5)],40+group*8+j,false,true);
  }
 }
 ISLANDS.forEach((island,i)=>{
  const [x,z]=island.center;
  rock([x-.42,z+.02,.53,.42,.4],20+i*2,true);
  rock([x+.38,z+.19,.31,.23,.26],21+i*2,true);
 });
 return {groups:10,rocks,islandRocks: islandRocks.length,smallRocks,count,mossCount,grassCount,reference:'painted-trees-rocks.jpg',canopyReference:'createCanopy / stone palette and grouped boulders'};
}

export function buildToriiDecoration({mark,rnd,torii}){
 const {base,height:h,yaw}=torii,c=Math.cos(yaw),s=Math.sin(yaw);
 const rotate=p=>[c*p[0]+s*p[2],p[1],-s*p[0]+c*p[2]],world=p=>add(base,rotate(p));
 const rope=t=>[-h*.31+t*h*.62,h*.655-.34*Math.sin(Math.PI*t),-h*.076];
 const straw=['#8c7953','#b6a071','#d8c397'].map(hex);let ropeCount=0,paperCount=0;
 // One quiet sagging strand: broad fiber-colored splats, without braid rings.
 for(let i=0;i<42;i++){
  const t=i/41,p=rope(t);
  mark(world(p),rotate([0,.2,1]),rotate([1,-.34*Math.PI*Math.cos(Math.PI*t)/(h*.62),0]),.027,.061,.026,straw[i%7===0?0:1],'wood',{opacity:.94});ropeCount++;
 }
 const anchors=[];
 for(let j=0;j<4;j++){
  const t=.18+j*.215,top=rope(t);top[1]-=.045;const anchor=world(top);anchors.push(anchor);
  const length=1.04+(j%2)*.08;
  // Each diagonal fold is a handful of broad pigment strokes. Staggered rows,
  // varied ivory and translucent edges keep the separate splats visible.
  const points=[[0,0],[0,-.14],[-.135,-.27],[.135,-.48],[-.135,-.69],[.135,-.90],[.015,-1.04]].map(([x,y])=>[x,y*length/1.04]);
  const normals=points.slice(1).map((b,i)=>{const a=points[i],d=unit([b[0]-a[0],b[1]-a[1],0]);return [-d[1],d[0],0];});
  const joins=points.map((_,i)=>{
   if(i===0)return normals[0];if(i===points.length-1)return normals.at(-1);
   const n=unit(add(normals[i-1],normals[i]));return mul(n,1/Math.max(.45,dot(n,normals[i])));
  });
  for(let fold=0;fold<points.length-1;fold++){
   const a=points[fold],b=points[fold+1],rows=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.075),cols=fold===0?1:2;
   for(let row=0;row<=rows;row++)for(let col=0;col<cols;col++){
    const f=row===0?0:row===rows?1:clamp((row+(col===0?-.14:.14))/rows),across=(col+.5)/cols-.5,width=fold===0?.06:.135;
    const join=mix(joins[fold],joins[fold+1],f),x=a[0]+(b[0]-a[0])*f+join[0]*across*width;
    const y=Math.min(0,a[1]+(b[1]-a[1])*f+join[1]*across*width);
    const crease=(fold%2===0?1:-1)*Math.sin(f*Math.PI)*.018;
    const p=add(top,[x,y,crease]),dir=[b[0]-a[0],b[1]-a[1],0],n=[0,0,1];
    const color=hex((row+col)%3===0?'#c5d1bf':fold%2?'#f7efd9':'#e0e5cf').map(v=>v*(.94+rnd()*.06));
    const edge=row===0||row===rows;
    mark(world(p),rotate(n),rotate(dir),fold===0?.02:.026+rnd()*.006,edge?.031:.043,.012,color,'cloth',{wind:[anchor[1],length+.06,j*1.2,7],opacity:.88+rnd()*.07});paperCount++;
   }
  }
 }
 return {ropeCount,paperCount,streamers:4,anchors,reference:'torii-shide-reference.jpg',construction:'Zigzag shide made from broad translucent pigment splats, hung from a simple single cord'};
}
