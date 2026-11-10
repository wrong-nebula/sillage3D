/** Connected, asymmetric cloud volumes guided by the supplied Howl stills.
 * An irregular density surface is sampled into 3D Gaussians. Broad painted
 * light/shadow masses, fine fringes and trailing veils replace repeated balls.
 */
import {mountainHeight,mountainRidgeZ} from './ghibliMountains.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const hex=h=>h.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);};
const hash=(x,y,z)=>{let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,1442695041);h=Math.imul(h^h>>>13,1274126177);return ((h^h>>>16)>>>0)/4294967295;};
function noise(x,y,z){
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),u=smooth(0,1,x-ix),v=smooth(0,1,y-iy),w=smooth(0,1,z-iz);
 let sum=0;for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)sum+=hash(ix+a,iy+b,iz+c)*(a?u:1-u)*(b?v:1-v)*(c?w:1-w);
 return sum*2-1;
}
const smoothUnion=(a,b)=>{const k=.15,h=clamp(.5+.5*(a-b)/k);return b+(a-b)*h+k*h*(1-h);};
const SHADOW=hex('#9ebbc0'),MIDDLE=hex('#dfe8df'),WHITE=hex('#fff9e9');
const TETRA=[[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]];
const CORNERS=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];

function cloudField(index){
 const lift=[.12,.04,-.07,.17][index%4],lean=[-.34,.12,.48,-.15][index%4];
 const forms=[
  [-1.28,-.08,-.02,.65,.23,.42],[-.84,.05,.04,.75,.37,.52],[-.35,.17,-.03,.83,.49,.58],
  [lean,.37+lift,-.05,.72,.58+lift*.3,.58],[.53,.12,.03,.69,.41,.5],[1.05,-.04,.07,.63,.25,.41],
  [1.51,-.13,.09,.49,.16,.3],[-.65,.39+lift,.02,.36,.31,.35],[lean+.31,.63+lift,-.11,.34,.34,.31],
  [-.16,-.12,.22,.83,.22,.41],[-.2,.12,-.31,.67,.3,.35],
  [-1.15,.22,.09,.30,.25,.29],[-.82,.48,.06,.32,.31,.32],[-.40,.59,-.12,.31,.30,.36],
  [lean+.02,.88+lift,-.08,.26,.28,.28],[.54,.48,.12,.30,.29,.30],[.9,.26,-.05,.29,.22,.27]
 ];
 const field=(x,y,z)=>{
  let d=-10;
  for(const [cx,cy,cz,rx,ry,rz]of forms){const q=1-Math.hypot((x-cx)/rx,(y-cy)/ry,(z-cz)/rz);d=smoothUnion(d,q);}
  const warp=.16*noise(x*2.8+index*7,y*3.7,z*3.2)+.14*noise(x*6.5,y*8.3+index*3,z*7)+.05*noise(x*16,y*18,z*15+index*5);
  // A soft, almost level belly; irregular rising tops and a tapering windward end.
  return Math.min(d+warp,(y+.34+.026*noise(x*6,0,z*7))*3);
 };
 return field;
}
function surface(field,step){
 const min=[-2.2,-.48,-.95],dims=[Math.ceil(4.5/step),Math.ceil(2.05/step),Math.ceil(1.9/step)];
 const [nx,ny,nz]=dims,sy=nx+1,sz=(nx+1)*(ny+1),values=new Float32Array(sz*(nz+1));
 const point=(x,y,z)=>[min[0]+x*step,min[1]+y*step,min[2]+z*step];
 for(let z=0;z<=nz;z++)for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++)values[x+y*sy+z*sz]=field(...point(x,y,z));
 const faces=[];let area=0;
 const triangle=(a,b,c)=>{const size=Math.hypot(...cross(sub(b,a),sub(c,a)))*.5;if(size<1e-8)return;area+=size;faces.push({a,b,c,total:area});};
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const val=CORNERS.map(([dx,dy,dz])=>values[x+dx+(y+dy)*sy+(z+dz)*sz]);
  if(val.every(v=>v<0)||val.every(v=>v>=0))continue;
  const p=CORNERS.map(([dx,dy,dz])=>point(x+dx,y+dy,z+dz));
  const edge=(a,b)=>mix(p[a],p[b],val[a]/(val[a]-val[b]));
  for(const ids of TETRA){
   const inside=ids.filter(i=>val[i]>=0),outside=ids.filter(i=>val[i]<0);
   if(inside.length===1)triangle(...outside.map(i=>edge(inside[0],i)));
   else if(inside.length===3)triangle(...inside.map(i=>edge(outside[0],i)));
   else if(inside.length===2){
    const [a,b]=inside,[c,d]=outside,q=[edge(a,c),edge(a,d),edge(b,d),edge(b,c)];
    triangle(q[0],q[1],q[2]);triangle(q[0],q[2],q[3]);
   }
  }
 }
 return {faces,area};
}

export function buildCloudBank({mark,rnd,cloud,index=0,distant=false}){
 const {center,radius:r,phase}=cloud,field=cloudField(index),{faces,area}=surface(field,distant?.16:.095);
 const count=distant?180:cloud.background?720:1320,cores=distant?16:cloud.background?48:80,fringes=distant?24:cloud.background?72:140,veils=distant?8:cloud.background?20:32;
 const rotate=([u,v,w])=>[.94*u-.34*w,v,.34*u+.94*w];
 const world=p=>rotate(p).map((v,k)=>center[k]+v*r);
 const normal=p=>{const e=.008;return unit([field(p[0]-e,p[1],p[2])-field(p[0]+e,p[1],p[2]),field(p[0],p[1]-e,p[2])-field(p[0],p[1]+e,p[2]),field(p[0],p[1],p[2]-e)-field(p[0],p[1],p[2]+e)]);};
 const pigment=(p,n)=>{
  const broad=noise(p[0]*2.1+index*7,p[1]*2.6,p[2]*2.1),height=smooth(-.32,.82,p[1]);
  const occlusion=clamp(field(p[0]-.19,p[1]+.17,p[2]+.1),0,.22);
  const light=clamp(.48+.17*(-n[0]*.7+n[1]*.65+n[2]*.25)+.35*height+broad*.16-occlusion);
  return light<.70?mix(SHADOW,MIDDLE,smooth(.32,.70,light)):mix(MIDDLE,WHITE,smooth(.70,.92,light));
 };
 const extra=opacity=>({noFog:true,opacity,wind:[.035,5.5,phase,4]});
 // A bounded number of interior marks supplies optical depth from every side.
 for(let i=0;i<cores;i++){
  let p;for(let trial=0;trial<120;trial++){p=[-1.8+rnd()*3.6,-.24+rnd()*1.15,(rnd()-.5)*1.0];if(field(...p)>.16)break;}
  mark(world(p),[0,1,0],[.94,0,.34],r*.12,r*.2,r*.15,pigment(p,[0,1,0]),'cloud',extra(.76));
 }
 let fi=0;const sampled=[],sigma=Math.sqrt(area/count)*r*.67;
 for(let i=0;i<count;i++){
  const target=(i+rnd())/count*area;while(fi<faces.length-1&&faces[fi].total<target)fi++;
  const {a,b,c}=faces[fi],u=Math.sqrt(rnd()),v=rnd(),p=a.map((q,k)=>q*(1-u)+b[k]*u*(1-v)+c[k]*u*v),n=normal(p);
  sampled.push({p,n});const size=sigma*(.8+rnd()*.35);
  mark(world(p),rotate(n),[.94,.2,.34],size*.60,size*.94,size*.38,pigment(p,n),'cloud',extra(.78+rnd()*.14));
 }
 // Short ragged fringes soften only the silhouette, keeping a readable core.
 for(let i=0;i<fringes;i++){
  const {p,n}=sampled[Math.floor(rnd()*sampled.length)],reach=.025+rnd()*.055,q=p.map((v,k)=>v+n[k]*reach);
  const size=sigma*(.55+rnd()*.35);
  mark(world(q),rotate(n),[.94,.1,.34],size*.65,size*1.3,size*.52,pigment(q,n),'cloud',extra(.09+rnd()*.12));
 }
 // Uneven translucent veils pull away from the lower, downwind shoulder.
 for(let i=0;i<veils;i++){
  const t=rnd(),p=[.9+t*1.3,-.26+rnd()*.14,(rnd()-.5)*.58],size=(1-t*.55)*r;
  mark(world(p),[0,1,0],[.94,.02,.34],size*.045,size*.19,size*.035,mix(SHADOW,MIDDLE,.64),'cloud',extra(.08+rnd()*.08));
 }
 return {surface:count,cores,fringes,veils,count:count+cores+fringes+veils};
}

function buildSoftMountainCloud({mark,cloud,index}){
 const {center,radius:r,phase}=cloud,wind=[-.035,5.5,phase,4];let count=0;
 const put=(p,w,l,h,color,opacity)=>{
  const q=[center[0]+r*(.94*p[0]-.34*p[2]),center[1]+r*p[1],center[2]+r*(.34*p[0]+.94*p[2])];
  mark(q,[0,1,0],[.94,0,.34],w*r,l*r,h*r,color,'cloud',{noFog:true,opacity,wind});count++;
 };
 for(let j=0;j<7;j++){
  const x=(j-3)*.32,y=.12+.15*Math.sin(j*1.72+index*.8)+.1*Math.sin(j*.7),z=.09*Math.sin(j*2.1+index);
  const size=.85+.17*Math.sin(j*1.6+index*.4);
  put([x,y-.13,z],.29*size,.43*size,.20,mix(SHADOW,MIDDLE,.7),.4);
  put([x-.04,y+.08,z+.025],.31*size,.42*size,.31*size,mix(MIDDLE,WHITE,.85),.58);
  put([x-.08,y+.16,z],.35*size,.48*size,.34*size,WHITE,.18);
 }
 for(let j=0;j<5;j++)put([.7+j*.22,-.12+j*.015,.1*Math.sin(j+index)],.12,.33-j*.025,.065,mix(MIDDLE,WHITE,.65),.12-j*.012);
 return count;
}

export function buildHighClouds({mark,rnd}){
 const banks=[-132,-106,-77,-47,-27,1,29,53,75,97,116,140].map((x,i)=>{
  const ridge=mountainRidgeZ(x),behind=i%3===1;
  return {center:[x,mountainHeight(x,ridge)*(behind?.92:.76)+.9,ridge+(behind?-12:11+(i%2)*4)],radius:1.65+(i%4)*.26,behind};
 });
 let count=0;
 banks.forEach((bank,i)=>{count+=buildSoftMountainCloud({mark,cloud:{...bank,phase:bank.center[0]*.94+bank.center[2]*.34},index:i+4});});
 return {count,banks:banks.length,locations:banks};
}
