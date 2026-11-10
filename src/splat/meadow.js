/** A separate, all-sided meadow variation; source Canopy arrays are never mutated. */
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const hex=s=>s.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const palette=a=>a.map(hex);
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const noise=(x,y,z)=>.5*Math.sin(x*1.7+Math.sin(z*1.3))+.3*Math.sin(y*2.3+z*.8)+.2*Math.sin(z*3.2+x*.5);
const GRASS=palette(['#596e4b','#6b7b4d','#7e8953','#92965a','#a6a566','#bbb47a','#cbc294']);
const FOLIAGE=palette(['#354a3c','#465a40','#596e46','#71814c','#8a9558','#a3a363','#beb879']);
const SHRUB=palette(['#34483d','#435b42','#587044','#6c814b','#839452','#a0a765','#b7b67b']);
const EARTH=palette(['#877d68','#a0957e','#b2a78f','#c3b89f','#d0c4ab']);
const ROCK=palette(['#657176','#808a85','#9da296','#b4b7a4','#c9c6b3']);
const FLOWERS=palette(['#9a523e','#b75b3e','#c66c42','#d28a4c','#bb9d60','#d5bc79','#e1d6b0']);
const LIGHT=unit([-.8,1,.45]);
function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const groundHeight=(x,z)=>-.55+.27*Math.sin(x*.075+z*.025)+.24*Math.sin(z*.11)+.22*noise(x*.055,0,z*.055)+.85*smooth(2,65,-z);
const groundNormal=(x,z)=>unit([-(groundHeight(x+.1,z)-groundHeight(x-.1,z))*5,1,-(groundHeight(x,z+.1)-groundHeight(x,z-.1))*.5*10]);
const pathX=z=>-2.2+4.4*Math.sin((z+7)*.071)+.045*(z+8);
const pathWidth=z=>.4+.018*clamp(z+35,0,65);
const emptyBounds=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
function include(bounds,p){for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],p[k]);bounds.max[k]=Math.max(bounds.max[k],p[k]);}}

export function paintMeadowClouds(mark,rnd,banks=[[-30,20,-48],[9,25,-61],[38,19,-43],[-53,23,10],[28,28,49],[-17,30,54]],scale=1){
  const cloudPal=palette(['#c6d1d1','#d7dcd5','#e4e4d7','#eee9d8']);
  for(const [bank,[x,y,z]]of banks.entries())for(let i=0;i<145;i++){
   const broad=i<12,lobe=i%4,px=x+(lobe-1.5)*4.2+(rnd()+rnd()-1)*3,py=y+Math.sin(lobe*1.8)*1.6+(rnd()+rnd()-1)*1.5,pz=z+(rnd()+rnd()-1)*3;
   const size=broad?3.6+rnd()*1.2:1.15+rnd()*1.5,c=cloudPal[Math.min(3,Math.floor(clamp(.53+(py-y)*.08+(rnd()-.5)*.15)*4))];
   mark([x+(px-x)*scale,y+(py-y)*scale,z+(pz-z)*scale],[0,1,0],[1,0,0],size*scale,size*scale,size*scale,c,broad?.19:.15+ rnd()*.12,'cloud',{noFog:true});
  }
}

export function buildMeadow(sourceCanopy){
 if(!sourceCanopy?.splats?.length)throw new Error('Meadow requires a populated Canopy source.');
 const rnd=random(0x7f09a731),splats=[],layers={},features={};
 function mark(center,normal,direction,width,length,depth,color,opacity=.96,material='grass',extra=null){
  normal=unit(normal);let tangent=sub(direction,mul(normal,dot(direction,normal)));
  if(Math.hypot(...tangent)<.01)tangent=cross(normal,Math.abs(normal[1])>.8?[1,0,0]:[0,1,0]);
  tangent=unit(tangent);
  const s={center,axes:[mul(tangent,length),mul(unit(cross(normal,tangent)),width),mul(normal,depth)],color,opacity,seed:rnd(),material};
  if(extra)Object.assign(s,extra);splats.push(s);
 }
 function layer(name,build){
  const start=splats.length;build();const bounds=emptyBounds();
  for(let i=start;i<splats.length;i++)include(bounds,splats[i].center);
  layers[name]={start,count:splats.length-start,bounds};return layers[name];
 }
 function shade(colors,n,p,{haze=0,lightBias=0}={}){
  const value=clamp(.33+dot(n,LIGHT)*.42+noise(p[0]*.6,p[1]*.5,p[2]*.55)*.12+(rnd()-.5)*.16+lightBias);
  const color=colors[Math.min(colors.length-1,Math.floor(value*colors.length))];
  return haze?mix(color,hex('#b2bdb2'),haze):color;
 }
 function shell(center,radii,count,colors,{length=.3,width=.14,depth=.08,flow=[.6,1,.1],phase=0,irregular=.12,material='foliage',haze=0,lift=0}={}){
  for(let i=0;i<count;i++){
   const y=1-2*(i+.5)/count,a=i*2.399963229728653+phase,r=Math.sqrt(Math.max(0,1-y*y)),u=[Math.cos(a)*r,y,Math.sin(a)*r];
   const wobble=1+irregular*noise(u[0]*3+phase,u[1]*3,u[2]*3),n=unit(u.map((v,k)=>v/radii[k]));
   const p=add(add(center,u.map((v,k)=>v*radii[k]*wobble)),mul(n,lift));
   const varied=flow.map((v,k)=>v+.35*noise(p[0]*.7+k*2,p[1]*.6,p[2]*.6)),size=.73+rnd()*.6;
   mark(p,n,varied,width*size,length*size,depth,shade(colors,n,p,{haze}),.97,material);
  }
 }
 function trunk(x,z,height,radius,count=110){
  for(let i=0;i<count;i++){
   const t=rnd(),a=rnd()*TAU,r=radius*(1-t*.66),n=[Math.cos(a),0,Math.sin(a)],p=[x+n[0]*r+.12*Math.sin(t*3),groundHeight(x,z)+t*height,z+n[2]*r];
   mark(p,n,[.08,1,0],radius*.32,.31,.045,shade(palette(['#625e4d','#7e7961','#9a947b','#b7b196']),n,p),.98,'wood');
  }
 }
 layer('ground',()=>{
  const extent=67,grid=80,step=extent*2/grid;
  for(let iz=0;iz<grid;iz++)for(let ix=0;ix<grid;ix++){
   const x=-extent+(ix+.15+rnd()*.7)*step,z=-extent+(iz+.15+rnd()*.7)*step,y=groundHeight(x,z);
   const warmth=smooth(-2,-28,x)*(1-smooth(20,45,z));
   let color=GRASS[Math.min(6,Math.floor(clamp(.52+.22*noise(x*.13,0,z*.13)+(rnd()-.5)*.12)*7))];
   color=mix(color,hex('#b5a96c'),warmth*.48);
   color=mix(color,hex('#adb9a2'),smooth(34,80,Math.hypot(x,z))*.45);
   const onPath=z>=-36&&z<=34&&Math.abs(x-pathX(z))<pathWidth(z)*1.08;
   if(onPath)color=mix(EARTH[2],EARTH[3],.5+.25*noise(x*.6,0,z*.2));
   const flow=onPath?[.3124*Math.cos((z+7)*.071)+.045,.05,1]:[1,.08,.25];
   mark([x,y,z],groundNormal(x,z),flow,(.83+rnd()*.3)*(onPath?.75:1),1.25+rnd()*.52,.055,color,.99,onPath?'stone':'grass');
  }
  for(let i=0;i<2900;i++){
   const x=-43+rnd()*80,z=-30+rnd()*68;
   if(Math.abs(x-pathX(z))<pathWidth(z)*1.08)continue;
   const y=groundHeight(x,z),color=shade(GRASS,[0,1,0],[x,y,z],{lightBias:-.1});
   const angle=.35+(rnd()-.5)*1.0;
   mark([x,y+.055,z],groundNormal(x,z),[Math.cos(angle),.08,Math.sin(angle)],.09+rnd()*.12,.23+rnd()*.43,.04,color,.94,'grass');
  }
 });
 layer('path',()=>{
  for(let i=0;i<1900;i++){
   const z=-36+rnd()*70,x=pathX(z)+(rnd()-.5)*2*pathWidth(z)*(i<1100?1:.82),y=groundHeight(x,z)+.075;
   const direction=unit([.3124*Math.cos((z+7)*.071)+.045,0,1]),color=EARTH[Math.floor(clamp(.45+.2*noise(x*.6,0,z*.2)+(rnd()-.5)*.27)*EARTH.length)];
   mark([x,y,z],groundNormal(x,z),direction,.16+rnd()*.23,.35+rnd()*.38,.035,color,.96,'stone');
  }
  const samples=[];for(let i=0;i<=28;i++){const z=32-i*68/28,x=pathX(z);samples.push({center:[x,groundHeight(x,z)+.075,z],halfWidth:pathWidth(z)});}
  features.path={samples,bounds:emptyBounds()};samples.forEach(s=>include(features.path.bounds,s.center));
 });
 layer('flowers',()=>{
  // An open flower field, biased to the left of the path, with warm patches and poppies.
  for(let i=0;i<4100;i++){
   const z=-15+rnd()*42,x=-35+rnd()*31;
   if(x>pathX(z)-pathWidth(z)-.7)continue;
   const patch=.5+.5*noise(x*.2,0,z*.19),flower=rnd()<.51+.22*patch;
   const y=groundHeight(x,z),height=flower?.10+rnd()*.34:.07+rnd()*.18;
   if(flower){
    const color=FLOWERS[Math.floor(rnd()*FLOWERS.length)],n=unit([(rnd()-.5)*.5,.7,1]);
    mark([x,y+height,z],n,[.65,.3,.1],.045+rnd()*.048,.055+rnd()*.07,.045,color,.96,'foliage');
   }else{
    mark([x,y+height*.5,z],unit([.1,.35,1]),[.35,1,.2],.025,.11+height*.4,.025,hex(rnd()>.5?'#a8a56a':'#b9ad74'),.91,'grass');
   }
  }
 });
 features.leftFlowerField={count:layers.flowers.count,bounds:layers.flowers.bounds};
 features.path.bounds=layers.path.bounds;features.path.count=layers.path.count;
 layer('hills',()=>{
  const hillColors=palette(['#718a82','#80998c','#95aa96','#a5b6a0','#bdc2a9']);
  for(const [k,h]of [[-33,2,-61,24,7,17],[-5,1.7,-72,24,9,18],[27,2,-64,25,8,20]].entries()){
   shell(h.slice(0,3),h.slice(3),1100,hillColors,{length:1.25,width:.75,depth:.25,flow:[1,.15,.1],phase:k*4,irregular:.06,material:'grass',haze:.12});
  }
 });
 // Retain the original tree and rock primitives, deep-cloned into a smaller right-hand grove.
 const copied=sourceCanopy.splats.filter(s=>['wood','foliage','stone'].includes(s.material)),groveScale=.66;
 const translation=[15,groundHeight(15,-14)+.72,-14];
 layer('copiedGrove',()=>{
  for(const s of copied){
   const color=s.material==='foliage'?mix(s.color,hex('#92956b'),.25):s.material==='wood'?mix(s.color,hex('#8f8b75'),.12):mix(s.color,hex('#a6aaa0'),.12);
   splats.push({...s,center:s.center.map((v,k)=>v*groveScale+translation[k]),axes:s.axes.map(a=>a.map(v=>v*groveScale)),color,seed:s.seed});
  }
 });
 features.copiedGrove={count:layers.copiedGrove.count,bounds:layers.copiedGrove.bounds,scale:groveScale,translation};
 const poplarSpecs=[[-19,-42,8.2,.7],[-11,-33,11.8,.9],[-4.5,-28,14,1.1],[6.9,-12.5,24,1.8],[11.8,-25,16,1.25],[19.2,-31,14,1.1],[25,-24,12.8,1.3]];
 layer('poplars',()=>{
  for(const [index,[x,z,height,radius]]of poplarSpecs.entries()){
   trunk(x,z,height*.86,.17,125);
   const base=groundHeight(x,z);
   for(let i=0;i<960;i++){
    const t=(i+.5)/960,a=i*2.399963229728653+index*2,profile=Math.sin(Math.PI*t)**.48;
    const rib=1+.14*Math.sin(a*7+t*13)+.09*Math.sin(a*13-t*17),r=radius*profile*rib;
    const p=[x+Math.cos(a)*r+.24*Math.sin(t*5+index),base+2.2+t*(height-2.2),z+Math.sin(a)*r*.8];
    const n=unit([Math.cos(a),.16*(2*t-1),Math.sin(a)/.8]),detail=i%3!==0;
    mark(p,n,[.3*Math.sin(a*3),1,.15],detail?.075+rnd()*.045:.22+rnd()*.09,detail?.27+rnd()*.20:.62+rnd()*.22,detail?.055:.12,shade(FOLIAGE,n,p,{haze:.08,lightBias:.06}),.97,'foliage');
   }
  }
 });
 features.poplars={treeCount:poplarSpecs.length,count:layers.poplars.count,bounds:layers.poplars.bounds,trees:poplarSpecs.map(([x,z,h])=>({base:[x,groundHeight(x,z),z],height:h}))};
 layer('shrubs',()=>{
  for(const [k,[x,z,r]]of [[-13,-13,1.6],[5,-5,1.7],[21,1,1.9],[-24,-22,1.3]].entries()){
   shell([x,groundHeight(x,z)+r*.68,z],[r,r*.95,r*.82],410,SHRUB,{length:.28,width:.13,phase:k*3,irregular:.18});
  }
  for(const [k,[x,z,r]]of [[5,9,.8],[-5,3,.55],[8,-3,.7]].entries())shell([x,groundHeight(x,z)+r*.55,z],[r,r*.68,r*.8],130,ROCK,{length:.22,width:.1,depth:.06,flow:[1,.8,.2],phase:k*5,material:'stone',irregular:.14});
 });
 layer('foregroundShrub',()=>{
  const x=11.2,z=14.4,y=groundHeight(x,z),lobes=[[0,1.8,0,3.5,2.3,2.8],[-2.1,1.45,.5,2.25,1.8,2.1],[2.2,2.15,-.6,2.4,2.6,2.2],[.3,2.7,-1.4,2.5,2.1,2.3]];
  for(const [k,l]of lobes.entries()){
   const center=[x+l[0],y+l[1],z+l[2]],radii=l.slice(3);
   shell(center,radii,500,SHRUB,{length:.44,width:.23,depth:.13,phase:k*4,irregular:.2,flow:[1,.5,.2]});
   shell(center,radii,520,SHRUB,{length:.23,width:.075,depth:.05,phase:k*4,irregular:.2,flow:[1,.5,.2],lift:.09});
  }
 });
 features.rightForegroundShrub={count:layers.foregroundShrub.count,bounds:layers.foregroundShrub.bounds};
 layer('sky',()=>{
  const count=9500,radius=140,center=[0,16,0],top=hex('#6f9bb8'),horizon=hex('#bcc7b4');
  for(let i=0;i<count;i++){
   const y=1-2*(i+.5)/count,a=i*2.399963229728653,ring=Math.sqrt(1-y*y),u=[Math.cos(a)*ring,y,Math.sin(a)*ring],size=2.72+rnd()*.25;
   const variation=(rnd()-.5)*.025,color=mix(horizon,top,smooth(-.08,.82,y)).map(v=>clamp(v+variation));
   mark(u.map((v,k)=>center[k]+v*radius),mul(u,-1),[-Math.sin(a),0,Math.cos(a)],size,size,.65,color,.99,'cloud',{noFog:true,skyBackground:true});
  }
 });
 layer('clouds',()=>{
  paintMeadowClouds(mark,rnd);
 });
 return {splats,background:'#a9bfca',orbitLimit:110,
  atmosphere:{color:'#bcc9bc',horizonColor:'#d0d5bf',start:48,density:.007,max:.42,heightStart:24,heightDensity:.003},
  composition:{source:'canopy',sourceSplatCount:sourceCanopy.splats.length,copiedSplatCount:copied.length,layers,features,total:splats.length},
 };
}
