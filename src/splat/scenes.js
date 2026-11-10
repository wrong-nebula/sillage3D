/** Authored and mesh-sampled 3D paint fields. Film references are comparison-only. */
import {createCathedral} from './cathedral.js';
import {buildMeadow} from './meadow.js';
import {ghibliScene} from './ghibliScene.js';
import {dogFieldScene} from './dogField.js';
import {createTechDemoScenes} from './techDemo.js';
import {blueForestScene} from './blueForest.js';
import {tenguCourierScene} from './tenguCourier.js';
import {handStudyScene} from './handStudy.js';
import {mountainStudies} from './mountainStudies.js';
import {bounceRoomScene} from './bounceRoom.js';
import {rockFractureScene} from './rockFracture.js';
import {stoneInscriptionScene} from './stoneInscription.js';
import {stoneFamilyRockfallScene} from './stoneFamilyRockfall.js';
import {gouacheCliffKitScene} from './gouacheCliffKit.js';
import {hollowReefScene} from './hollowReef.js';
import {cliffTalusScene} from './cliffTalus.js';
import {physicsLabScene} from './physicsLab.js';
import {desertGardenScene} from './desertGarden.js';
import {fractalStudyScenes} from './fractalShapes.js';
export {createGhibli} from './ghibli.js';
export {createCathedral} from './cathedral.js';
export const createMeadow=()=>buildMeadow(createCanopy());

const TAU = Math.PI * 2;
const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const hex=s=>s.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const palette=colors=>colors.map(hex);
const SUN=unit([-0.8,1.1,0.7]);
function random(seed) { return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}; }
function noise(x,y,z){return .5*Math.sin(x*1.7+Math.sin(z*2.1))+.3*Math.sin(y*2.9+z*.8)+.2*Math.sin(z*3.9+x*.7);}
function field(seed) {
 const rnd=random(seed),splats=[];
 function mark(center,normal,direction,width,length,depth,color,opacity=.95,material='stone'){
  normal=unit(normal);let tangent=sub(direction,mul(normal,dot(direction,normal)));
  if(Math.hypot(...tangent)<.01)tangent=cross(normal,Math.abs(normal[1])>.8?[1,0,0]:[0,1,0]);
  tangent=unit(tangent);const bitangent=unit(cross(normal,tangent));
  splats.push({center,axes:[mul(tangent,length),mul(bitangent,width),mul(normal,depth)],color,opacity,seed:rnd(),material});
 }
 function shade(colors,normal,p,variation=.12,foliage=false){
  const light=clamp(foliage
   ? (dot(normal,unit([-.85,.9,.13]))+.08)/1.08 + noise(p[0]*.65,p[1]*.7,p[2]*.7)*.21+(rnd()-.5)*.26
   : (dot(normal,SUN)+.35)/1.2 + noise(p[0]*.7,p[1]*.7,p[2]*.7)*variation+(rnd()-.5)*.16);
  return colors[Math.min(colors.length-1,Math.floor(light*colors.length))];
 }
 function shell(center,radii,count,colors,{length=.22,width=.1,depth=.07,irregular=.08,flow=[.4,1,.1],opacity=.97,phase=0,lift=0,foliage=false,flowJitter=0,material=foliage?'foliage':'stone'}={}){
  for(let i=0;i<count;i++){
   const y=1-2*(i+.5)/count,theta=i*2.399963229728653+phase;
   const f=Math.sqrt(1-y*y),u=[Math.cos(theta)*f,y,Math.sin(theta)*f];
   const warp=1+irregular*noise(u[0]*3+phase,u[1]*3,u[2]*3);
   const n=unit(u.map((v,k)=>v/radii[k]));
   const p=add(add(center,u.map((v,k)=>v*radii[k]*warp)),mul(n,lift));
   const v=.72+rnd()*.65;
   const direction=flow.map((v,k)=>v+flowJitter*noise(p[0]*.7+k*2,p[1]*.7,p[2]*.7));
   mark(p,n,direction,width*v,length*v,depth,shade(colors,n,p,.12,foliage),opacity,material);
  }
 }
 return {rnd,splats,mark,shade,shell};
}
const treeColors=palette(['#1d301f','#273e24','#324e2a','#406333','#527d3c','#6b9648','#94b963','#c0d88c']);
const willowColors=palette(['#1a3826','#204c2e','#296038','#36763e','#488e4c','#65a967','#91c484','#b1d49b']);
const barkColors=palette(['#302f27','#454234','#5b5541','#746c52','#918970','#b1aa90','#d3d0b0']);
const grassColors=palette(['#3e703c','#4e873d','#609c42','#78ad50','#8cbb64','#aed18b','#c3d99c']);
const rockColors=palette(['#394c45','#56625b','#77796c','#969582','#b2af97','#ccc9ad','#dedcc4']);
function wood(F,points,radii,count=950){
 const segments=points.length-1;
 for(let i=0;i<count;i++){
  const t=F.rnd()*segments,k=Math.min(segments-1,Math.floor(t)),f=t-k;
  const axis=unit(sub(points[k+1],points[k])),u=unit(cross(axis,Math.abs(axis[1])>.8?[1,0,0]:[0,1,0])),v=cross(axis,u);
  const a=F.rnd()*TAU,n=add(mul(u,Math.cos(a)),mul(v,Math.sin(a)));
  const r=(radii[k]*(1-f)+radii[k+1]*f)*(1+.07*Math.sin(a*9+t*3));
  const p=add(lerp(points[k],points[k+1],f),mul(n,r));
  F.mark(p,n,axis,.045+r*.09,.17+r*.18,.045,F.shade(barkColors,n,p),.99,'wood');
 }
}
function terrain(F,{count=6500,extent=33,alpine=false}={}){
 const height=(x,z)=>alpine?-.8+.45*Math.sin(x*.1)+.6*Math.sin(z*.1)+.3*Math.sin(x*.28+z*.08):-.6+x*.12+.22*Math.sin(z*.17)+.16*Math.sin(x*.31+z*.1);
 const colors=alpine?palette(['#4d695b','#64765b','#7d8959','#92964d','#a3a259','#b4b56a','#c6c188']):grassColors;
 for(let i=0;i<count;i++){
  const a=F.rnd()*TAU,r=Math.sqrt(F.rnd())*extent,x=Math.cos(a)*r,z=Math.sin(a)*r,y=height(x,z);
  const n=unit([-(height(x+.1,z)-y)*10,1,-(height(x,z+.1)-y)*10]);
  const far=clamp((Math.abs(z)+Math.abs(x)-18)/30),detail=i>count*.55;
  let c=colors[Math.floor(clamp(.42+.26*noise(x*.24,y,z*.2)+F.rnd()*.3)*colors.length)];
  if(far)c=lerp(c,alpine?hex('#99b2a3'):hex('#a9d2b1'),far*.7);
  F.mark([x,y,z],n,[1,.15,.35],detail?.12+F.rnd()*.15:.55+F.rnd()*.45,detail?.45+F.rnd()*.4:1.15+F.rnd()*.8,.045,c,.98,'grass');
 }
 return height;
}
function clouds(F,centers,alpine=false){
 const colors=palette(alpine?['#9fbaca','#b1c6d1','#c2d0d6','#d3dbdc','#e3e4df','#f1eee4']:['#b3c7b6','#d0d7bf','#e3e4ce','#f0edd6','#f8f1dc']);
 for(const [index,[x,y,z,s]]of centers.entries()){
  // Long flatter bellies connect unequal rising lobes; no repeated three-ball motif.
  F.shell([x,y-.08*s,z],[2.25*s,.48*s,.8*s],270,colors,{length:s*.34,width:s*.2,depth:s*.14,irregular:.1,flow:[1,.1,.05],phase:index*4,material:'cloud'});
  const lobes=3+index%3;
  for(let j=0;j<lobes;j++){
   const dx=-1.65+j*3.1/(lobes-1),r=.5+F.rnd()*.56,h=.45+F.rnd()*.65;
   F.shell([x+dx*s,y+h*s*.38,z+(F.rnd()-.5)*s*.35],[r*s,h*s,.65*s],150,colors,{length:s*.23,width:s*.15,depth:s*.09,irregular:.16,flow:[1,.25,.05],phase:index*3+j*6,flowJitter:.35,material:'cloud'});
  }
 }

}
export function createCanopy(){
 const F=field(73193),ground=terrain(F,{count:8600});
 clouds(F,[[-20,9,-28,3.2],[-10,14,-34,3.3],[14,10,-31,3.8],[23,15,-38,3.7],[-29,17,-37,2.2]]);
 // Broken shadows belong to the ground plane and remain stable under orbit.
 for(let i=0;i<750;i++){
  const x=-3+F.rnd()*13,z=-4+F.rnd()*10;
  if(((x-1)/7)**2+((z-1)/4.5)**2>1)continue;
  F.mark([x,ground(x,z)+.04,z],[0,1,0],[1,0,.3],.16+F.rnd()*.2,.4+F.rnd()*.4,.018,hex(F.rnd()>.45?'#3f6b35':'#4b7736'),.57,'grass');
 }
 wood(F,[[-2.4,ground(-2.4,0),0],[-3.3,1.3,0],[-4,3.7,-.1],[-4.1,6.3,0]],[.85,.74,.5,.19],1450);
 wood(F,[[-3.2,1.3,0],[-5.3,2.3,.2],[-6.6,4.1,.5],[-7.2,5.6,.5]],[.6,.42,.2,.06],750);
 wood(F,[[-3.8,3.3,0],[-1.7,4.4,0],[-.5,6,-.5]],[.42,.25,.07],600);
 wood(F,[[-3.8,3.6,0],[-4.7,5.4,2],[-4.5,7.3,2.5]],[.35,.21,.06],550);
 const clumps=[[-4.3,6.4,-.65,4.0,3.8,2.65],[-6.5,7.2,.05,2.25,2.5,2.05],[-4.7,9.0,-.2,2.65,1.9,2.2],[-1.7,8.3,-.65,2.4,2.1,2.0],[-7.0,4.8,.5,1.45,1.8,1.6],[-4.8,5.65,1.7,2.2,1.75,1.7],[-1.9,5.9,.45,2.2,2.4,2.0],[-6.1,3.35,.35,1.3,1.0,1.25]];
 for(let k=0;k<clumps.length;k++){
  const c=clumps[k],center=c.slice(0,3),radii=c.slice(3);
  F.shell(center,radii,k===0?1250:500,treeColors,{length:.53,width:.31,depth:.17,irregular:.18,phase:k*4,flow:[1,.5,.2],foliage:true,flowJitter:.8});
  F.shell(center,radii,k===0?1000:630,treeColors,{length:.24,width:.1,depth:.06,irregular:.18,phase:k*4,lift:.12,flow:[1,.5,.2],foliage:true,flowJitter:1.05});
 }
 wood(F,[[3.3,ground(3.3,-.5),-.5],[3.4,3.5,-.5],[3.0,7,-.5],[3.3,9.6,-.5]],[.68,.48,.3,.1],950);
 // Hanging curtains have a rounded crown and a ragged, broad hem.
 const willowPoint=(a,t)=>{
  const top=13.25+.38*Math.sin(a*3)+.18*Math.sin(a*7);
  const hem=1.05+.7*(.5+.5*Math.sin(a*9+.4))+.35*Math.sin(a*17);
  const y=hem+(top-hem)*t;
  const crown=Math.sqrt(Math.min(1,Math.max(.004,(1-t)*4.2)));
  const rib=1+.1*Math.sin(a*17+.3*Math.sin(y*.5))+.055*Math.sin(a*31+y*.2);
  const skirt=(.84+.17*Math.sin(t*2.6)+.05*Math.sin(a*5+y*.3))*crown*rib;
  return [3.15+Math.cos(a)*3.25*skirt,y,-.3+Math.sin(a)*2.9*skirt];
 };
 for(let i=0;i<7900;i++){
  const a=F.rnd()*TAU,t=F.rnd(),p=willowPoint(a,t);
  let n=unit(cross(sub(willowPoint(a,Math.min(.99999,t+.001)),p),sub(willowPoint(a+.001,t),p)));
  if(dot(n,[Math.cos(a),.1,Math.sin(a)])<0)n=mul(n,-1);
  const detail=i>1950,c=F.shade(willowColors,n,p,.2,true);
  F.mark(add(p,mul(n,detail?.055:0)),n,[.1*Math.sin(a*7),1,.05*Math.cos(a*9)],detail?.085+F.rnd()*.055:.3+F.rnd()*.13,detail?.32+F.rnd()*.32:.75+F.rnd()*.4,detail?.055:.13,c,.98,'foliage');
 }
 const rocks=[[-7.8,-.2,5.2,2.0,1.4,1.3],[5.7,1,3.0,1.9,1.65,1.35],[2,0,4,1.1,.8,.75],[-.5,0,4.3,.62,.42,.55],[-5,0,4.5,.95,.6,.8],[6.5,0,-2,.85,.7,.8]];
 for(let k=0;k<rocks.length;k++){
  const [x,,z,rx,ry,rz]=rocks[k],c=[x,ground(x,z)+ry*.53,z];
  F.shell(c,[rx,ry,rz],380,rockColors,{length:.29,width:.15,depth:.09,irregular:.17,flow:[.65,1,.25],phase:k*2});
  F.shell(c,[rx,ry,rz],310,rockColors,{length:.17,width:.045,depth:.04,irregular:.17,flow:[.65,1,.25],phase:k*2,lift:.07});
 }
 // A few pale grass blades bridge large strokes and small accents.
 for(let i=0;i<1200;i++){
  const x=(F.rnd()-.5)*28,z=F.rnd()*21-3,y=ground(x,z);
  if(Math.abs(x+1)<6&&z<3)continue;
  const h=.11+F.rnd()*.24;
  F.mark([x,y+h,z],unit([.1,0,1]),[.45,1,.1],.018,h,.022,hex(F.rnd()>.5?'#c6d985':'#9ec35e'),.91,'grass');
 }
 return {splats:F.splats,background:'#4889ad'};
}

const mountainColors=palette(['#4b6380','#59718f','#6a809d','#7f8ea7','#939bb0','#a8a9ba','#bbb5c3','#cec4cc']);
/** A closed, faceted ridge with a real front, rear, sloping ends and joined crest. */
function ridge(F,{x=0,z=-8,sx=12,sy=24,sz=8,seed=42,count=11000,fog=0,profile=null}){
 const local=random(seed),columns=profile||[
  [-1,.18],[-.83,.48],[-.66,.68],[-.53,.94],[-.43,.81],[-.26,.83],[-.08,.80],[.1,.84],[.25,1.02],[.34,.77],[.53,.69],[.74,.43],[1,.15]
 ];
 const rowT=[0,.18,.43,.7,1],front=[],back=[],triangles=[];
 const depth=columns.map((_,i)=>(local()-.5)*sz*.36+(i%2===0?.45:-.55));
 function vertex(i,t,side){
  const [u,h]=columns[i],shoulder=1-.27*t;
  return [x+u*sx*shoulder+.6*t, -.65+h*sy*t, z+side*sz*Math.pow(1-t,.85)+(depth[i]*(.45+.55*t))];
 }
 for(let r=0;r<rowT.length;r++){
  front.push(columns.map((_,i)=>vertex(i,rowT[r],1)));
  back.push(columns.map((_,i)=>vertex(i,rowT[r],-1)));
 }
 const triangle=(a,b,c)=>{
  const ab=sub(b,a),ac=sub(c,a),cr=cross(ab,ac),area=Math.hypot(...cr)*.5;
  if(area<.001)return;
  let n=unit(cr);const center=mul(add(add(a,b),c),1/3);
  if(dot(n,[center[0]-x,.1,center[2]-z])<0)n=mul(n,-1);
  triangles.push({a,b,c,n,area,center});
 };
 for(const grid of [front,back])for(let r=0;r<rowT.length-1;r++)for(let i=0;i<columns.length-1;i++){
  triangle(grid[r][i],grid[r][i+1],grid[r+1][i]);
  triangle(grid[r][i+1],grid[r+1][i+1],grid[r+1][i]);
 }
 for(const i of [0,columns.length-1])for(let r=0;r<rowT.length-1;r++){
  triangle(front[r][i],back[r][i],front[r+1][i]);
  triangle(back[r][i],back[r+1][i],front[r+1][i]);
 }
 // The base is closed too, so inspecting from below still reveals a volume.
 for(let i=0;i<columns.length-1;i++){
  triangle(front[0][i],front[0][i+1],back[0][i]);
  triangle(front[0][i+1],back[0][i+1],back[0][i]);
 }
 const total=triangles.reduce((sum,t)=>sum+t.area,0),lightDirection=unit([-.9,.48,.16]);
 const green=palette(['#687b5c','#7e8c5d','#959f65','#b0b774']);
 for(const tri of triangles){
  const number=Math.max(5,Math.ceil(count*tri.area/total));
  const planeLight=clamp(.29+.75*dot(tri.n,lightDirection)+.09*noise(tri.center[0]*.18,tri.center[1]*.18,tri.center[2]*.18));
  for(let i=0;i<number;i++){
   const r=Math.sqrt(F.rnd()),q=F.rnd(),p=add(add(mul(tri.a,1-r),mul(tri.b,r*(1-q))),mul(tri.c,r*q));
   const detail=i>number*.42;
   let level=clamp(planeLight+noise(p[0]*.42,p[1]*.35,p[2]*.35)*.11+(F.rnd()-.5)*.09);
   let color=mountainColors[Math.min(7,Math.floor(level*8))];
   // Moss follows a few broad low terraces rather than scattered white/green spots.
   const terrace=noise(p[0]*.3,0,p[2]*.22)+.2*Math.sin(p[1]*1.3);
   if(p[1]<sy*.37&&terrace>.36&&tri.n[1]>.18)color=green[Math.floor(clamp(planeLight+.15)*3.99)];
   color=lerp(color,hex('#a4bcca'),fog);
   const scale=(.7+F.rnd()*.65)*Math.sqrt(Math.max(.6,sx/12));
   F.mark(add(p,mul(tri.n,detail?.065:0)),tri.n,[.18+.18*noise(p[0]*.2,0,p[2]*.2),1,.06],detail?.10*scale:.34*scale,detail?.34*scale:.85*scale,detail?.045:.11,color,.98);
  }
 }
}
export function createAlpine(){
 const F=field(91273),ground=terrain(F,{count:8100,extent:42,alpine:true});
 clouds(F,[[-23,17,-32,4],[-8,23,-39,3.2],[15,22,-36,3.8],[29,16,-32,3.8],[-29,25,-37,2.5]],true);
 // Broad overlapping ridges form a continuous mountain wall, with a saddle and two crags.
 ridge(F,{x:-12,z:-18,sx:15,sy:17,sz:8,seed:13,count:3300,fog:.28});
 ridge(F,{x:12,z:-19,sx:15,sy:20,sz:8,seed:73,count:3300,fog:.24});
 ridge(F,{x:0,z:-8,sx:15,sy:25.5,sz:8.5,seed:42,count:13000});
 ridge(F,{x:-19,z:0,sx:12,sy:15,sz:7,seed:91,count:4300,profile:[[-1,.2],[-.7,.6],[-.4,.88],[-.12,1],[.15,.81],[.4,.65],[.65,.45],[1,.16]]});
 ridge(F,{x:19,z:1,sx:13,sy:17,sz:7.5,seed:51,count:4600,profile:[[-1,.2],[-.72,.5],[-.5,.7],[-.28,.92],[-.05,.79],[.2,.83],[.4,.63],[.75,.44],[1,.16]]});
 ridge(F,{x:-7,z:6,sx:9,sy:8,sz:5,seed:38,count:1900});
 ridge(F,{x:9,z:7,sx:10,sy:9,sz:5.5,seed:11,count:2100});
 // Pale braided scree paths run over the actual terrain rather than screen space.
 for(let i=0;i<1400;i++){
  const z=-2+F.rnd()*33,path=Math.sin(z*.13)*3+z*.1;
  const x=path+(F.rnd()-.5)*(.7+z*.07),y=ground(x,z)+.08;
  F.mark([x,y,z],[0,1,0],[.15,0,1],.08+F.rnd()*.16,.3+F.rnd()*.45,.025,hex(F.rnd()>.5?'#d4d1cb':'#b4bdc0'),.94);
 }
 // Meadow direction and warm wildflower strokes bring the foreground forward.
 for(let i=0;i<1500;i++){
  const x=(F.rnd()-.5)*39,z=9+F.rnd()*22,y=ground(x,z)+.08;
  const flower=F.rnd()>.8;
  F.mark([x,y,z],[0,1,0],[1,0,.25],flower?.03:.065,flower?.07:.35,.035,hex(flower?'#e7dfb9':F.rnd()>.4?'#b5b75c':'#c7b548'),.95,'grass');
 }
 return {splats:F.splats,background:'#7fbdda'};
}
/** The scenes that ship. The studio adds any kept only on this machine: see studioScenes.js. */
export const scenes=[
 {id:'alpine',title:'The painted peaks',subtitle:'Lavender cliffs and an open alpine meadow',reference:'/brush-references/alpine.jpg',camera:{position:[6,11.5,39],target:[0,11,-5],fov:43},create:createAlpine},
 {id:'cathedral',label:'Cathedral',title:'Stone dissolving into mist',subtitle:'Violet stone, a painted sky, and reflected light',description:'Gothic stonework in violet mist, above a pavement touched with light.',caption:'Mist, stone & reflected light',reference:'/brush-references/cathedral.png',lockCamera:true,camera:{position:[12.759340104455191,1.5307883850838113,27.557263217638358],target:[-7.178752256253695,11.08800395406828,-5.776385195536777],fov:54},initialStyle:{quality:'studio',bounceStrength:1.65,tonePreservation:.9,shadowTintStrength:.2,sunAzimuth:-49.1,sunElevation:31.6,sunSize:3.5,lensDirtStrength:.8,painterlyVignette:true,vignetteStrength:.65,vignetteSpread:.65},create:createCathedral},
 {id:'meadow',label:'Meadow',title:'A path through the poppies',subtitle:'Poplars, wildflowers & distant hills',description:'A winding path through flowers, shrubs, and distant hills.',caption:'Poplars, fields & a winding path',reference:'/brush-references/meadow.png',camera:{position:[7,5.5,30],target:[-2,5.2,-10],fov:49},initialStyle:{quality:'studio',bounceStrength:.8,tonePreservation:.8,shadowTint:'#68777c',shadowTintStrength:.15,lensDirtStrength:.3,painterlyVignette:true,vignetteStrength:.5,vignetteSpread:.65,vignetteSwirl:.75},create:createMeadow},
 ghibliScene,
 dogFieldScene,
 ...createTechDemoScenes(),
 blueForestScene,
 tenguCourierScene,
 handStudyScene,
 ...mountainStudies,
 bounceRoomScene,
 rockFractureScene,
 stoneInscriptionScene,
 stoneFamilyRockfallScene,
 gouacheCliffKitScene,
 hollowReefScene,
 cliffTalusScene,
 physicsLabScene,
 desertGardenScene,
 ...fractalStudyScenes,
];
