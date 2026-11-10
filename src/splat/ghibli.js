/** Ghibli hillside: original Marso meshes resampled to pigment, plus reference-led landscape.
 * See public/ghibli-references/sources.json and scripts/sample-ghibli-assets.py.
 * Every visible element is an all-sided 3D Gaussian field; no image billboards.
 */
import torii from './assets/torii_omoide003.json' with {type:'json'};
import {POND,PONDS,ISLANDS,pondDistance,wetlandDistance,wetlandHeight,buildWetlands,buildLowClouds,LOW_CLOUDS} from './wetlands.js';
export {POND,PONDS,ISLANDS,pondDistance} from './wetlands.js';
import {FOREST_TREES,buildGhibliTrees,buildBushes,buildForestFog} from './ghibliForest.js';
import {buildMeadowGrass} from './meadowGrass.js';
import {highlandColor,buildHighlandStrata} from './ghibliHighland.js';
import {buildHillRocks} from './ghibliHillRocks.js';
import {buildHighClouds} from './ghibliClouds.js';
import {buildGhibliMountains} from './ghibliMountains.js';
import {pathX,pathWidth,TORII_SITE,buildMeadowPath,refinePathGround} from './ghibliPath.js';
import {attachSheepFlock,SHEEP_SITES} from './sheepFlock.js';
import {attachDoveFlock} from './doveFlock.js';
import {loadMeadowDog} from './meadowDog.js';
import {buildGhibliRocks,buildToriiDecoration,refinePropGround} from './ghibliProps.js';
import {buildTreeMoss,buildMossGuardian,GUARDIAN_SITE} from './ghibliMoss.js';
import {GHIBLI_ORBIT,trimGhibliFrame} from './ghibliFrame.js';

const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const add=(a,b)=>a.map((v,k)=>v+b[k]);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const hex=h=>h.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const pal=a=>a.map(hex);
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const noise=(x,z)=>Math.sin(x*.73+Math.sin(z*.51))*.52+Math.sin(z*1.3+x*.38)*.3+Math.cos(x*1.9-z*.89)*.18;
const hill=(x,z,cx,cz,rx,rz,h)=>h*Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));
function baseHillsideHeight(x,z){
 return -.7+.34*Math.sin(x*.095+z*.035)+.26*Math.cos(z*.14)
  +hill(x,z,8,-7,15,14,2.1)+hill(x,z,-29,-47,25,19,10)
  +hill(x,z,6,-62,29,23,14)+hill(x,z,40,-46,26,24,11)
  +hill(x,z,-65,-35,24,30,9)+hill(x,z,70,-65,35,28,16);
}
export function hillsideHeight(x,z){return wetlandHeight(baseHillsideHeight(x,z),x,z);}
const normalAt=(x,z)=>unit([-(hillsideHeight(x+.1,z)-hillsideHeight(x-.1,z))*5,1,-(hillsideHeight(x,z+.1)-hillsideHeight(x,z-.1))*.5*10]);
const LIGHT=unit([-.7,1,.55]);
const GRASS=pal(['#4d7752','#658854','#7f9b5b','#9aad64','#b1bb71','#c2c781']);
const BARK=pal(['#424e43','#59604c','#76765b','#979375']);
const SKY=hex('#328fba'),HAZE=hex('#c0d3ba');
function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// Preserve the authored pigment of each layer when a neighbouring layer changes.
const LAYER_SEEDS={hillsAndField:761103,path:-432797507,pathGround:788021401,grassAndFlowers:185576225,
 torii:1773962975,trees:-655543859,bushes:821885168,forestFog:1684012608,laundry:1193382520,
 pond:-91516335,lowClouds:-810028119,mountains:-489476803,sky:1297457693,clouds:-1655987199,
 meadowRocks:-786024807,toriiDecoration:850954449,treeMoss:699428449,mossGuardian:1060933410,propGroundDetail:1957542178,hillRocks:761193,highlandStrata:761194};
export function createGhibli({trim=true,entrance=false}={}){
 let rnd=random(761103);const splats=[],layers={},features={},animated=[];
 function mark(p,n,dir,width,length,depth,color,material='grass',extra={}){
  n=unit(n);let u=sub(dir,mul(n,dot(n,dir)));
  if(Math.hypot(...u)<.01)u=cross(n,Math.abs(n[1])>.8?[1,0,0]:[0,1,0]);
  u=unit(u);const v=unit(cross(n,u));
  const s={center:p,axes:[mul(u,length),mul(v,width),mul(n,depth)],color,opacity:.98,seed:rnd(),material,...extra};
  if(s.wind)animated.push(splats.length);splats.push(s);return s;
 }
 function layer(name,fn){rnd=random(LAYER_SEEDS[name]);const start=splats.length;fn();layers[name]={start,count:splats.length-start};}
 function colorAt(colors,n,p,bias=0){const f=clamp(.3+dot(n,LIGHT)*.4+noise(p[0]*.6,p[2]*.6)*.12+(rnd()-.5)*.12+bias);return colors[Math.min(colors.length-1,Math.floor(f*colors.length))];}
 const trees=FOREST_TREES;
 function shadow(x,z){
  let shade=0;
  for(const [tx,tz,h,r] of trees){shade=Math.max(shade,Math.exp(-(((x-tx-h*.24)/(r*1.2))**2+((z-tz-h*.18)/(r*.66))**2))*.45);}
  for(const side of [-1,1]){
   const px=TORII_SITE.x+side*TORII_SITE.height*.316*Math.cos(TORII_SITE.yaw),pz=TORII_SITE.z-side*TORII_SITE.height*.316*Math.sin(TORII_SITE.yaw);
   shade=Math.max(shade,Math.exp(-(((x-px-1.1)/.65)**2+((z-pz-1.4)/2.8)**2))*.48);
  }
  return shade;
 }
 function groundColor(x,z){
  let c=GRASS[Math.min(5,Math.floor(clamp(.5+.24*noise(x*.14,z*.14))*6))];
  c=mix(c,hex('#b1bf7a'),smooth(-8,-65,z)*.12);
  c=mix(c,hex('#365e50'),shadow(x,z));
  c=mix(c,HAZE,smooth(32,125,Math.hypot(x,z))*.43);
  return highlandColor(c,x,z,hillsideHeight(x,z));
 }
 layer('hillsAndField',()=>{
  const step=2.0;
  for(let z=-110;z<65;z+=step)for(let x=-110;x<110;x+=step){
   const px=x+(rnd()-.5)*step*.32,pz=z+(rnd()-.5)*step*.32;
   if(wetlandDistance(px,pz)<1.8)continue;
   mark([px,hillsideHeight(px,pz),pz],normalAt(px,pz),[1,.12,.25],1.22,1.55,.11,groundColor(px,pz));
  }
  for(let i=0;i<3200;i++){
   const x=(rnd()-.5)*108,z=-50+rnd()*91;
   if(pondDistance(x,z)<1.1)continue;
   mark([x,hillsideHeight(x,z)+.045,z],normalAt(x,z),[1,.13,.23],.2+rnd()*.17,.47+rnd()*.5,.04,groundColor(x,z));
  }
 });
 layer('path',()=>{features.path=buildMeadowPath({mark,rnd,height:hillsideHeight,normal:normalAt});});
 layer('pathGround',()=>{features.pathGround=refinePathGround({mark,splats,groundLayer:layers.hillsAndField,height:hillsideHeight,normal:normalAt,colorAt:groundColor});});
 layer('grassAndFlowers',()=>{features.grass=buildMeadowGrass({mark,rnd,height:hillsideHeight,normal:normalAt,colorAt:groundColor,pondDistance,pathX,pathWidth});});
 function model(asset,x,z,height,yaw,name,stride=1){
  const start=splats.length,base=hillsideHeight(x,z)-.06,c=Math.cos(yaw),s=Math.sin(yaw);
  const rotate=a=>[c*a[0]+s*a[2],a[1],-s*a[0]+c*a[2]];
  const toriiPigments=pal(['#8b6455','#b87c5b','#d09770','#e0b68b','#456366','#6c8581','#a1aa94']);
  const vermilion=pal(['#813b32','#b9533c','#cf6c4b','#e49b70']);
  for(let sample=0;sample<asset.samples.length/9;sample+=stride){
   const i=Math.floor(sample)*9;
   const d=asset.samples,p=add([x,base,z],mul(rotate(d.slice(i,i+3)),height)),n=rotate(d.slice(i+3,i+6));
   const light=.84+.2*Math.max(0,dot(n,LIGHT));
   let color=d.slice(i+6,i+9).map(v=>clamp(v*light+.018));
   if(name==='torii'){
    color=toriiPigments.reduce((best,c)=>c.reduce((sum,v,k)=>sum+(v-color[k])**2,0)<best.distance?{color:c,distance:c.reduce((sum,v,k)=>sum+(v-color[k])**2,0)}:best,{color,distance:Infinity}).color;
    const pigment=toriiPigments.indexOf(color);
    if(pigment<4)color=vermilion[pigment];
    if(d[i+1]>.73)color=color.map(v=>clamp(((v-.48)*1.24+.48)*(n[1]>.35?1.08:.84)));
   }
   const size=asset.radius*height*Math.sqrt(stride)*(1.03+rnd()*.28);
   mark(p,n,[.16,1,.06],size*.86,size*1.12,size*.18,color,'wood');
  }
  features[name]={source:asset.source,sha256:asset.sha256,count:splats.length-start,base:[x,base,z],height,yaw};
 }
 layer('torii',()=>model(torii,TORII_SITE.x,TORII_SITE.z,TORII_SITE.height,TORII_SITE.yaw,'torii',2.5));
 function branch(a,b,ra,rb,count){
  const axis=unit(sub(b,a)),u=unit(cross(axis,[1,.1,0])),v=unit(cross(axis,u));
  for(let i=0;i<count;i++){
   const t=rnd(),angle=rnd()*TAU,n=add(mul(u,Math.cos(angle)),mul(v,Math.sin(angle))),radius=ra+(rb-ra)*t;
   const p=add(mix(a,b,t),mul(n,radius));
   mark(p,n,axis,.055+radius*.2,.18+radius*.2,.035,colorAt(BARK,n,p),'wood');
  }
 }
 layer('trees',()=>{features.trees=buildGhibliTrees({mark,rnd,height:hillsideHeight,branch});});
 layer('bushes',()=>{features.bushes=buildBushes({mark,rnd,height:hillsideHeight,pondDistance,pathX});});
 layer('forestFog',()=>{features.forestFog=buildForestFog({mark,rnd,height:hillsideHeight,normal:normalAt,pondDistance,pathX});});
 layer('pond',()=>{
  const wetland=buildWetlands({mark,rnd,height:hillsideHeight,normal:normalAt,groundColor});
  features.pond={...POND,...wetland,pathClearance:Math.abs(pathX(POND.center[1])-POND.center[0])-POND.radii[0]-pathWidth(POND.center[1])};
 });
 layer('lowClouds',()=>{features.lowClouds=buildLowClouds({mark,rnd});});
 layer('mountains',()=>{features.mountains=buildGhibliMountains({mark,rnd});});
 layer('sky',()=>{
  const count=6100,radius=230;
  for(let i=0;i<count;i++){
   const y=1-2*(i+.5)/count,a=i*2.399963229728653,r=Math.sqrt(1-y*y),u=[Math.cos(a)*r,y,Math.sin(a)*r];
   const c=mix(hex('#c6e2dc'),SKY,smooth(-.28,.035,y));
   mark([u[0]*radius,18+u[1]*radius,u[2]*radius],mul(u,-1),[-Math.sin(a),0,Math.cos(a)],5.4,5.4,1,c,'cloud',{noFog:true,skyBackground:true});
  }
 });
 layer('clouds',()=>{features.highClouds=buildHighClouds({mark,rnd});});
 layer('meadowRocks',()=>{features.rocks=buildGhibliRocks({mark,rnd,height:hillsideHeight});});
 layer('toriiDecoration',()=>{features.toriiDecoration=buildToriiDecoration({mark,rnd,torii:features.torii});});
 layer('treeMoss',()=>{features.treeMoss=buildTreeMoss({mark,rnd,splats,treeLayer:layers.trees,height:hillsideHeight});});
 layer('mossGuardian',()=>{features.guardian=buildMossGuardian({mark,rnd,height:hillsideHeight});});
 layer('highlandStrata',()=>{features.highlandStrata=buildHighlandStrata({mark,rnd,height:hillsideHeight,normal:normalAt,colorAt:groundColor});});
 layer('hillRocks',()=>{features.hillRocks=buildHillRocks({mark,rnd,height:hillsideHeight});});
 layer('propGroundDetail',()=>{features.propGround=refinePropGround({mark,splats,groundLayer:layers.hillsAndField,height:hillsideHeight,normal:normalAt,colorAt:groundColor,guardian:GUARDIAN_SITE,extraSites:SHEEP_SITES.map(([x,z])=>[x,z,2.8])});});
 const framed=trim?trimGhibliFrame(splats,layers):{splats,indices:animated};
 features.frameTrim=framed.report;
 return {splats:framed.splats,background:'#79b8ce',orbitLimit:150,cameraOrbit:GHIBLI_ORBIT,animation:{indices:framed.indices},reflection:{level:POND.level},lowClouds:LOW_CLOUDS,
  actorLabel:'animals',loadActor:async()=>attachDoveFlock(attachSheepFlock(await loadMeadowDog(hillsideHeight,{entrance}),hillsideHeight,{entrance}),hillsideHeight),trample:{size:192,bounds:[-62,-40,66,76],radius:1.1,recovery:15},
  atmosphere:{color:'#b2ced4',horizonColor:'#d0e3d6',start:65,density:.0038,max:.43,heightStart:55,heightDensity:0},
  composition:{layers,features,total:framed.splats.length,referenceBoard:'/ghibli-references/reference-board.jpg'},
 };
}
