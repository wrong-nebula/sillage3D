/** Spirited Away references: root-clinging moss and the smiling stone guardian. */
import {FOREST_TREES} from './ghibliForest.js';
const TAU=Math.PI*2;
const clamp=v=>Math.max(0,Math.min(1,v));
const hex=s=>s.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const add=(a,b)=>a.map((v,k)=>v+b[k]),mul=(a,s)=>a.map(v=>v*s);
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const MOSS=['#3f6141','#587642','#798b4a','#9aa45e'].map(hex);
const STONE=['#42564c','#65725a','#8d926e','#b1af85'].map(hex);
const patch=(x,y,z)=>Math.sin(x*2.8+Math.sin(z*3))*.45+Math.cos(y*4.1+z*2)*.35+Math.sin(x*7-y*3+z)*.2;

export function buildTreeMoss({mark,rnd,splats,treeLayer,height}){
 let count=0,coated=0;const trees=new Set();
 // Reuse actual sampled bark surfaces, so the moss follows every crooked root
 // and trunk instead of hovering on a second approximate cylinder.
 for(let i=treeLayer.start;i<treeLayer.start+treeLayer.count;i++){
  const s=splats[i];if(s.material!=='wood')continue;
  const [x,y,z]=s.center,n=unit(s.axes[2]),tree=FOREST_TREES.findIndex(([tx,tz,h,,k])=>Math.hypot(x-tx,z-tz)<3.8&&y-height(tx,tz)<(k<2?3:2.1));
  if(tree<0||n[1]<-.38)continue;
  const [tx,tz,,,k]=FOREST_TREES[tree],rise=Math.max(0,y-height(x,z)),limit=k<2?3:2.1;
  const growth=patch(x-tx,y*.7,z-tz)+.38-rise/limit*.85+n[1]*.22;
  if(growth<-.12)continue;
  const c=MOSS[Math.min(3,Math.floor(clamp(.52+n[1]*.24-n[0]*.18+patch(x,y,z)*.12)*4))];
  s.color=mix(s.color,c,.58+clamp(growth)*.28);coated++;trees.add(tree);
  if(rnd()>.74)continue;
  const p=add(s.center,mul(n,.025));
  mark(p,n,unit(s.axes[0]),.04+rnd()*.025,.065+rnd()*.045,.022,c,'foliage');count++;
 }
 return {trees:trees.size,count,coated,reference:'spirited-away-tree-moss.jpg'};
}

export const GUARDIAN_SITE={x:-19,z:-6,height:2.45,yaw:.15,radius:.96};
// Integer-hashed value noise gives weathering irregular scales without stripes.
function stoneNoise(x,y,z){
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fade=t=>t*t*(3-2*t);
 const f=[fade(x-ix),fade(y-iy),fade(z-iz)];
 const hash=(x,y,z)=>{let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
 let result=0;
 for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)result+=hash(ix+a,iy+b,iz+c)*(a?f[0]:1-f[0])*(b?f[1]:1-f[1])*(c?f[2]:1-f[2]);
 return result;
}
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
export function buildMossGuardian({mark,rnd,height}){
 const {x,z,height:h,yaw}=GUARDIAN_SITE,base=height(x,z)-.035,scale=h/2.35,c=Math.cos(yaw),s=Math.sin(yaw);
 const rotate=p=>[p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c],world=p=>add([x,base,z],rotate(mul(p,scale)));
 let count=0,mossCount=0,faceCount=0;
 const mineral=['#46554b','#737a65','#a5a38a','#c5bfa2'].map(hex);
 const lichen=['#365438','#526b3e','#77834b','#a1a563'].map(hex);
 const profile=[[0,.88],[.12,.96],[.48,1],[.9,.95],[1.24,.85],[1.56,.77],[1.88,.64],[2.1,.49],[2.25,.31],[2.34,.09],[2.35,0]];
 function radius(y){
  const j=Math.max(0,profile.findIndex(([v])=>v>=y)-1),a=profile[j],b=profile[Math.min(j+1,profile.length-1)];
  return a[1]+(b[1]-a[1])*clamp((y-a[0])/(b[0]-a[0]||1));
 }
 const bell=(v,r)=>Math.exp(-((v/r)**2));
 const mouthY=x=>1.42+.09*Math.pow(Math.abs(x/.43),1.7);
 function faceCarving(x,y){
  let relief=0;
  for(const side of [-1,1]){
   const eyeX=x-side*.265,browY=1.83+.045*Math.cos(clamp((eyeX+.14)/.28)*Math.PI);
   relief-=.07*bell(eyeX,.145)*bell(y-1.79,.037); // deeply set eyelids
   relief+=.05*bell(eyeX,.17)*bell(y-browY,.045);
   relief+=.045*bell(x-side*.40,.17)*bell(y-1.60,.14); // broad cheeks
  }
  // Low broad nose, a shallow bridge, and an actual carved mouth recess.
  relief+=.095*Math.exp(-Math.pow(x/.15,4))*bell(y-1.65,.075);
  relief+=.025*bell(x,.09)*bell(y-1.76,.13);
  relief-=.03*bell(x,.18)*bell(y-1.57,.023);
  relief-=.09*Math.exp(-Math.pow(x/.45,8))*bell(y-mouthY(x),.031);
  relief+=.035*Math.exp(-Math.pow(x/.47,8))*bell(y-mouthY(x)+.058,.037);
  return relief;
 }
 function frontZ(x,y){
  const r=radius(y),round=Math.sqrt(Math.max(0,r*r-x*x))*.82;
  const q=Math.hypot(x/.69,(y-1.70)/.46),face=1-smooth(.72,1.04,q);
  let depth=round*(1-face)+(.59+.055*(1-q*q)+faceCarving(x,y))*face;
  // The folded arms are carved from the same volume rather than added beads.
  const armY=1.10-.16*(1-Math.min(1,Math.abs(x)/.78));
  depth+=.09*bell(y-armY,.085)*Math.exp(-Math.pow(x/.81,8));
  depth-=.025*bell(y-armY+.13,.026)*Math.exp(-Math.pow(x/.8,8));
  return depth+.012*(stoneNoise(x*12,y*12,5)-.5);
 }
 function pigment(p,n){
  const grain=stoneNoise(p[0]*19+8,p[1]*19,p[2]*19),coarse=stoneNoise(p[0]*3+14,p[1]*3,p[2]*3);
  const isFace=p[2]>.35&&Math.hypot(p[0]/.68,(p[1]-1.7)/.46)<1;
  const growth=coarse*.66+stoneNoise(p[0]*8,p[1]*8+19,p[2]*8)*.34+(p[1]>2?.2:0)+(p[1]<1.2?.07:0)-(isFace?.2:0);
  const wet=smooth(.44,.57,growth),light=clamp(.48-n[0]*.24+n[1]*.29+n[2]*.16+(grain-.5)*.24);
  const t=light*3,k=Math.min(2,Math.floor(t)),stone=mix(mineral[k],mineral[k+1],t-k),moss=mix(lichen[k],lichen[k+1],t-k);
  let color=mix(stone,moss,wet);
  if(isFace){
   const eye=Math.max(bell(p[0]-.265,.15),bell(p[0]+.265,.15))*bell(p[1]-1.79,.027);
   const mouth=Math.exp(-Math.pow(p[0]/.45,8))*bell(p[1]-mouthY(p[0]),.027);
   color=mix(color,hex('#364638'),Math.max(eye*.58,mouth*.72));
  }
  return {color:color.map(v=>Math.round(v*16)/16*(.94+grain*.12)),wet,isFace};
 }
 function surface(p,n,width,length,dir=[.3,1,.2]){
  const {color,wet,isFace}=pigment(p,n);
  mark(world(p),rotate(n),rotate(dir),width*scale,length*scale,.018*scale,color,'stone');count++;if(isFace)faceCount++;
  if(wet>.7&&rnd()<.4){
   const moss=lichen[Math.min(3,Math.floor(clamp(.35+n[1]*.3+rnd()*.35)*4))];
   mark(world(add(p,mul(n,.025+rnd()*.02))),rotate(n),rotate([1,.25,.2]),.036*scale,.063*scale,.025*scale,moss,'foliage');count++;mossCount++;
  }
 }
 function bodyPoint(y,a){
  const r=radius(y)*(1+.025*(stoneNoise(Math.cos(a)*3,y*3,Math.sin(a)*3)-.5)),px=Math.cos(a)*r;
  return [px,y,Math.sin(a)>0?frontZ(px,y):Math.sin(a)*r*.82];
 }
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((v,k)=>v-b[k]);
 // A continuous, slightly chipped stone body. Finer face sampling follows the
 // same sculpted surface, so the eyes/nose/lips never float on a separate mask.
 for(let i=0;i<1550;i++){
  const y=(i+.5)/1550*2.35,a=i*2.3999632297,p=bodyPoint(y,a);
  // Coarse body kernels must not bridge across the small facial recesses.
  if(Math.sin(a)>0&&Math.hypot(p[0]/.68,(y-1.7)/.46)<1.22)continue;
  const dy=sub(bodyPoint(Math.min(2.3499,y+.002),a),bodyPoint(Math.max(.0001,y-.002),a));
  const da=sub(bodyPoint(y,a+.002),bodyPoint(y,a-.002));
  let n=unit(cross(dy,da));if(n[0]*p[0]+n[2]*p[2]<0)n=mul(n,-1);
  surface(p,n,.058+rnd()*.022,.086+rnd()*.03);
 }
 for(let y=1.13;y<2.27;y+=.039)for(let x=-.83;x<.84;x+=.039){
  if(Math.hypot(x/.68,(y-1.7)/.46)>1.25||Math.abs(x)>radius(y)*.98)continue;
  const px=x+(rnd()-.5)*.009,py=y+(rnd()-.5)*.009,p=[px,py,frontZ(px,py)+.004];
  const n=unit([-(frontZ(px+.002,py)-frontZ(px-.002,py))/.004,-(frontZ(px,py+.002)-frontZ(px,py-.002))/.004,1]);
  surface(p,n,.022,.029,[1,.15,0]);
 }
 // Sparse pale mineral chips and deep lichen spots give the silhouette age.
 for(let i=0;i<180;i++){
  const y=.12+rnd()*2.1,a=rnd()*TAU,p=bodyPoint(y,a),n=unit([p[0],.15,p[2]]);
  if(p[2]>0&&Math.hypot(p[0]/.68,(y-1.7)/.46)<1.1)continue;
  const color=i%3===0?hex('#b3b090'):hex('#40563a');
  mark(world(add(p,mul(n,.021))),rotate(n),rotate([.5,1,.2]),.012,.024,.01,color,i%3===0?'stone':'foliage');count++;if(i%3!==0)mossCount++;
 }
 return {base:[x,base,z],height:h,radius:GUARDIAN_SITE.radius,count,mossCount,faceCount,reference:'spirited-away-moss-guardian.jpg',construction:'Continuous carved stone surface, recessed eyes and mouth, broad nose and folded arms'};
}
