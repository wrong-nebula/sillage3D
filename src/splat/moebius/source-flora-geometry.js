/** Source-derived additions to the existing terrestrial sculpting primitives.
 * No new renderer or placement system. All attachments use the same Y-up metres.
 */
import { giantFloraBuilders } from './giant-flora-geometry.js';
const TAU=Math.PI*2,GOLDEN=Math.PI*(3-Math.sqrt(5));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n);
const radial=(a,r,y=0)=>[Math.cos(a)*r,y,Math.sin(a)*r];
const lerp=(a,b,t)=>a+(b-a)*t;
const curve=(a,b,c,d)=>t=>a.map((v,i)=>v*(1-t)**3+3*b[i]*(1-t)**2*t+3*c[i]*(1-t)*t*t+d[i]*t**3);
const line=(a,b)=>t=>a.map((v,i)=>lerp(v,b[i],t));
const blend=(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t));

function fruit(m,g,top,radius,length,lobed=false){
 m.tube(t=>add(top,[0,-length*t,0]),t=>radius*(.025+.975*Math.sin(Math.PI*t)**.62)*(lobed?(.48+.66*t):1),
 {color:g.palette.accent,tip:g.palette.accent,wood:false,ridges:lobed?.16:0,sides:m.near?12:6,segments:m.near?10:5});
}
function orchard(m,g,rng){
 const h=g.height,w=g.width,p=g.palette,angle=g.phaseAngle;
 const stem=curve([0,0,0],radial(angle,h*.03,h*.17),radial(angle+.3,h*.08,h*.32),radial(angle,h*.045,h*.42));
 m.tube(stem,t=>h*.042*(1-.45*t),{ridges:.08,segments:m.near?12:6});
 let fruits=0;
 for(let i=0;i<g.branches;i++){
  const a=angle+i*GOLDEN,root=stem(.63+.35*rng()),end=add(root,radial(a,w*(.28+.055*rng()),h*(.27+.08*rng())));
  const bough=curve(root,add(root,radial(a,w*.08,h*.19)),add(end,[0,-h*.08,0]),end);
  m.tube(bough,t=>h*.024*(1-.68*t),{ridges:.045});
  for(let j=0;j<3;j++){
   const from=bough(.48+j*.23),aa=a+(j-1)*.8,to=add(from,radial(aa,w*.16,h*(.08+.095*rng()))),twig=curve(from,add(from,[0,h*.06,0]),add(to,[0,-h*.02,0]),to);
   m.tube(twig,t=>h*.008*(1-.75*t),{segments:m.near?6:3,sides:m.near?7:5});
   for(let k=0;k<11;k++){
    const q=twig(.17+.80*k/11),az=aa+(k%3-1)*1.12;
    m.leafFrom(q,az,h*(.13+.035*rng()),h*(.01+.065*rng()),h*.10,{shape:'round',thickness:.016,rows:m.near?6:3});
   }
   if(g.age>.66){
    const q=twig(.72),end=add(q,[0,-h*.045,0]);
    m.tube(line(q,end),()=>h*.003,{wood:false,sides:5,segments:2});
    fruit(m,g,end,h*.033,h*.065);fruits++;
   }
  }
 }
 return {fruitCount:fruits,structure:'forked fruiting crown'};
}

/** Triangulate actual holes; dark marks on an uncut leaf are not fenestrations. */
function perforatedBlade(m,g,THREE,root,angle,length,width,rise,mature){
 const segments=m.near?28:20,edge=[],holes=[],holeSides=m.near?10:6;
 const half=v=>Math.max(.01,.5*Math.sin(Math.PI*v)**.56*(1-.18*v))*(1-(mature?.58:.17)*Math.max(...[.28,.51,.76].map(c=>Math.exp(-(((v-c)/.035)**2)))));
 edge.push(new THREE.Vector2(0,0));
 for(let i=1;i<segments;i++){const v=i/segments;edge.push(new THREE.Vector2(half(v),v));}
 edge.push(new THREE.Vector2(0,1));
 for(let i=segments-1;i>0;i--){const v=i/segments;edge.push(new THREE.Vector2(-half(v),v));}
 if(mature)for(const v of [.39,.64])for(const side of [-1,1])holes.push(Array.from({length:holeSides},(_,i)=>new THREE.Vector2(side*.13+.035*Math.cos(i*TAU/holeSides),v+.052*Math.sin(i*TAU/holeSides))));
 const triangles=THREE.ShapeUtils.triangulateShape(edge,holes),rings=[edge,...holes],points=rings.flat();
 const forward=radial(angle,1),right=radial(angle+Math.PI/2,1);
 const path=curve(root,add(root,radial(angle,length*.18,rise+length*.20)),add(root,radial(angle,length*.72,rise+length*.20)),add(root,radial(angle,length,rise)));
 const mapped=point=>add(path(point.y),add(mul(right,point.x*width),[0,width*.08*(1-(point.x/.5)**2)*Math.sin(Math.PI*point.y),0]));
 const faces=m.near?[false,true]:[false],offsets=[],faceStart=m.triangleCount;
 for(const reverse of faces){
  const ids=points.map(q=>m.vertex(add(mapped(q),[0,reverse?-width*.008:width*.008,0]),blend(reverse?g.palette.underside:g.palette.body,g.palette.tip,q.y*q.y*.25),q.x+.5,q.y,{tissue:1,ink:.18}));
  offsets.push(ids);
  for(const [a,b,c]of triangles)m.tri(ids[a],ids[b],ids[c],reverse);
 }
 if(m.near){
  let off=0;
  for(const ring of rings){for(let i=0;i<ring.length;i++){const a=off+i,b=off+(i+1)%ring.length;m.tri(offsets[0][a],offsets[1][a],offsets[0][b]);m.tri(offsets[0][b],offsets[1][a],offsets[1][b]);}off+=ring.length;}
 }
 const faceEnd=m.triangleCount;
 // Midrib shares the blade path and is anchored to the petiole end.
 m.tube(path,t=>g.height*.005*(1-.85*t),{wood:false,color:g.palette.tip,tip:g.palette.tip,segments:m.near?12:6,sides:5});
 return {count:holes.length,apertures:mature?[.39,.64].flatMap(v=>[-1,1].map(side=>({center:mapped(new THREE.Vector2(side*.13,v)),faceStart,faceEnd}))):[]};
}
function windowleaf(m,g,rng,THREE){
 const h=g.height,w=g.width;let holes=0;const apertures=[];
 m.tube(t=>[0,h*.08*t,0],t=>h*.022*(1-.3*t),{wood:false,segments:3,sides:7});
 for(let i=0;i<g.branches;i++){
  const a=g.phaseAngle+i*GOLDEN,reach=w*(.13+.06*rng()),rise=h*(.42+.23*rng()),base=[0,h*.035,0],end=radial(a,reach,rise);
  m.tube(curve(base,radial(a,reach*.05,rise*.52),add(end,[0,-h*.20,0]),end),t=>h*.012*(1-.52*t),{wood:false,segments:m.near?12:6,sides:m.near?8:5});
  const blade=perforatedBlade(m,g,THREE,end,a,h*(.43+.08*rng()),w*.57,h*(.08+.08*rng()),g.age>.42);
  holes+=blade.count;apertures.push(...blade.apertures);
 }
 return {leafCount:g.branches,fenestrationCount:holes,apertures,structure:'continuous perforated membranes'};
}
function fruitshrub(m,g,rng){
 const h=g.height,w=g.width,p=g.palette,a=g.phaseAngle;
 const stem=curve([0,0,0],radial(a,h*.04,h*.26),radial(a+.2,h*.035,h*.56),radial(a,h*.04,h*.80));
 m.tube(stem,t=>h*.027*(1-.73*t),{ridges:.05});
 for(let i=0;i<g.branches;i++){
  const aa=a+Math.PI*.75+i*GOLDEN,root=stem(.38+.53*i/g.branches),end=add(root,radial(aa,w*(.3+.12*rng()),h*.16));
  const branch=curve(root,add(root,[0,h*.12,0]),add(end,[0,-h*.025,0]),end);
  m.tube(branch,t=>h*.010*(1-.78*t),{sides:m.near?8:5,segments:m.near?8:4});
  for(let j=0;j<6;j++)m.leafFrom(branch(.15+j*.14),aa+(j%2?1:-1)*1.05,h*.14,h*.035,h*.075,{shape:'spear',thickness:.015,rows:m.near?7:3});
 }
 let fruits=0;
 if(g.age>.6){
  const root=stem(.85),top=add(root,radial(a,w*.62,h*.035));
  const peduncle=curve(root,add(root,radial(a,w*.16,h*.17)),add(top,[0,h*.14,0]),top);
  m.tube(peduncle,t=>h*.009*(1-.2*t),{wood:false,segments:m.near?12:6,sides:7});
  m.tube(t=>add(top,[0,-h*.30*t,0]),()=>h*.008,{wood:false,segments:5,sides:6});
  const tiers=g.age>.86?4:2;
  for(let tier=0;tier<tiers;tier++)for(let j=0;j<3;j++){
   const aa=a+j*TAU/3+tier*.57,axis=add(top,[0,-h*.072*tier,0]),neck=add(axis,radial(aa,h*.039*(1-.13*tier),-h*.025));
   m.tube(line(axis,neck),()=>h*.004,{wood:false,segments:2,sides:5});
   fruit(m,g,neck,h*.064*(1-.12*tier),h*.14*(1-.10*tier),true);fruits++;
  }
 }
 return {fruitCount:fruits,bunchCount:fruits?1:0,structure:'one pendant tiered fruit bunch'};
}
function bloom(m,g,rng){
 const h=g.height,w=g.width,p=g.palette,a=g.phaseAngle;
 const stem=curve([0,0,0],radial(a,h*.035,h*.23),radial(a+.4,h*.035,h*.51),radial(a,h*.04,h*.73));
 m.tube(stem,t=>h*.014*(1-.34*t),{wood:false,color:p.base,tip:p.base,segments:m.near?14:7,sides:m.near?10:6});
 for(let i=0;i<g.branches;i++){
  const aa=a+i*GOLDEN,root=stem(.12+.65*i/g.branches),leafRoot=add(root,radial(aa,h*.055,h*.035));
  m.tube(line(root,leafRoot),t=>h*.005*(1-.25*t),{wood:false,segments:3,sides:5});
  m.leafFrom(leafRoot,aa,w*.37,h*.08,w*.27,{shape:'lobed',lobes:3,thickness:.025,rows:m.near?9:5});
 }
 const top=stem(1);let petals=0;
 for(let i=0;i<5;i++)m.leafFrom(top,a+i*TAU/5,w*.28,-h*.02,w*.11,{shape:'spear',color:p.body,tip:p.body,thickness:.02});
 if(g.age<.58){
  m.tube(t=>add(top,[0,h*.20*t,0]),t=>w*.12*(.03+.97*Math.sin(Math.PI*t)**.75),{wood:false,color:p.tip,tip:p.tip,ridges:.07,segments:m.near?12:6,sides:m.near?16:8});
 }else{
  for(let ring=0;ring<2;ring++)for(let i=0;i<9;i++){
   const aa=a+i*TAU/9+ring*.34,r=w*(ring?.30:.43),start=add(top,[0,ring*h*.025,0]);
   // Broad rounded rims are sampled as arcs instead of pointed leaf tips.
   for(const reverse of m.near?[false,true]:[false])m.grid(m.near?10:6,m.near?12:6,(u,v)=>{
    const theta=(u-.5)*Math.PI,az=aa+Math.sin(theta)*.46;
    const reach=r*(.025+.975*Math.sin(v*Math.PI/2))*(.79+.21*Math.cos(theta));
    const y=h*(ring?.17:.195)*(1-Math.cos(v*Math.PI/2))+h*.015*Math.sin(Math.PI*v)+(reverse?-h*.0015:h*.0015);
    return {point:add(start,radial(az,reach,y)),color:reverse?blend(p.tip,p.base,.12):p.tip,tissue:1,ink:.13};
   },false,reverse);
   petals++;
  }
  const disk=add(top,[0,h*.066,0]);
  m.bud(disk,w*.075,{color:p.accent,elongation:.6});
  for(let i=0;i<15;i++){const q=add(disk,radial(a+i*GOLDEN,w*.10*Math.sqrt(i/15),h*.025));m.bud(q,h*.010,{color:p.accent,elongation:1.25});}
 }
 return {petalCount:petals,closedBud:petals===0,structure:'open two-ring corolla'};
}
function bractcane(m,g,rng){
 const h=g.height,w=g.width,p=g.palette,count=Math.max(2,Math.round(g.branches*.55));let bracts=0,spikes=0;
 for(let i=0;i<count;i++){
  const aa=g.phaseAngle+i*GOLDEN,base=radial(aa,w*.12*Math.sqrt(i/count)),hh=h*(.68+.21*rng()),lean=w*(.11+.06*rng());
  const path=curve(base,add(base,[0,hh*.3,0]),add(base,radial(aa,lean*.55,hh*.70)),add(base,radial(aa,lean,hh)));
  m.tube(path,t=>h*.012*(1-.4*t),{wood:false,color:p.base,tip:p.base,segments:m.near?12:6,sides:m.near?8:5});
  for(let j=0;j<5;j++){
   const t=.12+j*.13,root=path(t),az=aa+j*GOLDEN;
   m.tube(v=>add(root,[0,h*.012*v,0]),()=>h*.016,{wood:false,color:p.tip,tip:p.tip,segments:2,sides:m.near?8:5});
   m.leafFrom(root,az,w*.40,h*.13,w*.15,{shape:'spear',thickness:.022,rows:m.near?9:5});
  }
  if(g.age>.5){
   const top=path(1),length=h*.22;
   m.tube(t=>add(top,[0,length*t,0]),t=>h*.045*(.025+.975*Math.sin(Math.PI*t)**.6),{color:p.accent,tip:p.accent,wood:false,sides:m.near?10:6,segments:m.near?12:6});
   for(let j=0;j<30;j++){
    const t=.08+.82*j/30,az=aa+j*GOLDEN,r=h*.039*Math.sin(Math.PI*t)**.6,root=add(top,radial(az,r,length*t));
    m.leafFrom(root,az,h*.037*(1-.5*t),h*.058,h*.048*(1-.45*t),{shape:'round',color:p.accent,tip:blend(p.accent,p.tip,.23),underside:p.accent,thickness:.045,rows:m.near?6:3});bracts++;
   }
   spikes++;
  }
 }
 return {shootCount:count,spikeCount:spikes,bractCount:bracts,structure:'imbricated terminal cones'};
}
function fingerfield(m,g,rng){
 const h=g.height,w=g.width,count=g.branches,shoots=[];
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 for(let i=0;i<count;i++){
  const a=g.phaseAngle+i*GOLDEN+(rng()-.5)*.25,r=Math.sqrt(i/Math.max(1,count-1));
  const boundary=1+.10*Math.sin(a*3+g.phaseAngle)+.06*Math.sin(a*5);
  const base=radial(a,w*.55*r*boundary),edge=.09+.91*(1-smooth(.28,1,r));
  const height=h*edge*(.77+.22*rng()),reach=height*(.10+.16*rng()),az=a+.3*Math.sin(a*2);
  const path=curve(base,add(base,radial(az,reach*.05,height*.38)),add(base,radial(az,reach*.52,height*.91)),add(base,radial(az,reach,height)));
  // Peripheral shoots become short rounded stubs, rather than hair-thin needles.
  const radius=h*Math.sqrt(edge)*(.045+.009*rng());
  // Reserve four of sixteen longitudinal rings for the rounded crown.
  const sample=t=>t<.75?t/.75*.86:.86+(t-.75)/.25*.14;
  m.tube(t=>path(sample(t)),t=>{const v=sample(t);return radius*(.80+.20*Math.sin(v*Math.PI*.65))*Math.sqrt(Math.max(.0002,1-(Math.max(0,v-.86)/.14)**2));},
   {wood:false,color:g.palette.body,tip:g.palette.tip,segments:m.near?16:10,sides:m.near?12:8,ridges:0});
  shoots.push({radialFraction:r,height,radius});
 }
 return {shootCount:count,branchJunctions:0,shoots,perimeterFade:true,structure:'dense meadow with rounded shoots and a graded perimeter'};
}
function splitpaddle(m,g,rng){
 const h=g.height,w=g.width,a=g.phaseAngle,p=g.palette;
 const stem=curve([0,0,0],radial(a,h*.025,h*.17),radial(a,h*.035,h*.33),radial(a,h*.04,h*.47));
 m.tube(stem,t=>h*.045*(1-.38*t),{wood:false,color:p.base,tip:p.body,segments:m.near?14:7,sides:m.near?12:8});
 let tears=0;
 for(let i=0;i<g.branches;i++){
  const az=a+i*GOLDEN,root=stem(.33+.63*i/g.branches),length=w*(.42+.07*rng()),width=h*(.28+.06*rng()),rise=h*(.13+.16*i/g.branches);
  const end=add(root,radial(az,length,rise));
  const path=curve(root,add(root,radial(az,length*.13,h*.32)),add(end,radial(az,-length*.20,h*.22)),end);
  const cuts=g.age>.48?[.24,.37,.51,.65,.79].map(v=>v+(rng()-.5)*.025):[];
  const stations=[0,.06,.12,...cuts.flatMap(v=>[v-.014,v,v+.014]),.88,.94,1].sort((a,b)=>a-b);
  const right=radial(az+Math.PI/2,1);
  for(const reverse of m.near?[false,true]:[false])m.grid(stations.length-1,m.near?6:3,(u,t)=>{
   const v=stations[Math.round(t*(stations.length-1))],across=u*2-1;
   const tear=cuts.reduce((n,c)=>Math.min(n,Math.abs(v-c)<.015?.18+.82*Math.min(1,Math.abs(v-c)/.014):1),1);
   const envelope=Math.max(.009,Math.sin(Math.PI*v)**.55)*(.5-.12*v);
   const lateral=across*width*envelope*tear;
   return {point:add(path(v),add(mul(right,lateral),[0,width*.09*(1-across*across)*Math.sin(Math.PI*v)+(reverse?-.0015:.0015)*h,0])),color:reverse?p.underside:blend(p.body,p.tip,v*.34),tissue:1,ink:.14};
  },false,reverse);
  m.tube(path,t=>h*.008*(1-.9*t),{wood:false,color:p.base,tip:p.tip,segments:m.near?14:7,sides:6});
  // Overlapping sheaths climb the same core as the petiole attachments.
  m.leafFrom(stem(.02),az,h*.05,root[1],h*.055,{shape:'spear',color:p.base,tip:p.body,rows:m.near?8:4});
  tears+=cuts.length*2;
 }
 const spear=stem(1);
 m.tube(t=>add(spear,radial(a+.5,h*.035*t,h*.50*t)),t=>h*.025*(.1+.9*Math.sin(Math.PI*t)**.7),{wood:false,color:p.tip,tip:p.tip,segments:m.near?16:8,sides:m.near?12:7});
 return {leafCount:g.branches,marginTearCount:tears,rolledLeafCount:1,structure:'continuous torn paddles around a sheathed core'};
}

function filamentflower(m,g,rng){
 const h=g.height,w=g.width,p=g.palette,a=g.phaseAngle;
 const stem=curve([0,0,0],radial(a,h*.025,h*.15),radial(a+.3,h*.07,h*.35),radial(a,h*.045,h*.57));
 m.tube(stem,t=>h*.011*(1-.33*t),{wood:false,color:p.base,tip:p.body,segments:m.near?14:7,sides:m.near?10:6});
 for(let i=0;i<g.branches;i++)m.leafFrom(stem(.15+.61*i/g.branches),a+i*GOLDEN,w*.40,h*.09,w*.23,{shape:'round',thickness:.02,rows:m.near?8:4});
 const top=stem(1);
 for(let i=0;i<5;i++)m.leafFrom(top,a+i*TAU/5,w*.17,-h*.025,w*.10,{shape:'spear',rows:m.near?6:3});
 if(g.age<.55){
  m.tube(t=>add(top,[0,h*.23*t,0]),t=>w*.12*(.03+.97*Math.sin(Math.PI*t)**.8),{wood:false,color:p.accent,tip:p.accent,segments:m.near?12:6,sides:m.near?14:8});
  return {petalCount:0,filamentCount:0,closedBud:true,structure:'closed violet floral bud'};
 }
 for(let i=0;i<5;i++)for(const reverse of m.near?[false,true]:[false])m.grid(m.near?14:7,m.near?12:6,(u,v)=>{
  const side=u*2-1,theta=a+i*TAU/5+side*.75,r=w*(.025+.32*v)*(.80+.20*Math.cos(side*Math.PI/2));
  const y=h*(.21*Math.sin(v*Math.PI*.70)-.015*v)+h*.025*(1-side*side)*v;
  return {point:add(top,radial(theta,r,y+(reverse?-.0015:.0015)*h)),color:blend(p.accent,reverse?p.underside:p.tip,reverse?.18:.06*v),tissue:1,ink:.12};
 },false,reverse);
 m.bud(add(top,[0,h*.025,0]),h*.028,{color:p.accent,elongation:.5});
 for(let i=0;i<5;i++){
  const az=a+i*GOLDEN,root=add(top,radial(az,h*.012,h*.025)),end=add(top,radial(az,w*(.10+.035*rng()),h*(.37+.05*rng())));
  m.tube(curve(root,add(root,[0,h*.18,0]),add(end,[0,-h*.12,0]),end),t=>h*.004*(1-.28*t),{wood:false,color:p.accent,tip:p.accent,segments:m.near?14:7,sides:m.near?8:5});
  m.bud(end,h*.014,{color:blend(p.accent,p.tip,.18),elongation:2.5});
 }
 return {petalCount:5,filamentCount:5,closedBud:false,structure:'lobed cup with long attached anther-bearing filaments'};
}

function flowermat(m,g,rng){
 const h=g.height,w=g.width,p=g.palette;let flowers=0;
 for(let i=0;i<g.branches;i++){
  const a=g.phaseAngle+i*GOLDEN,r=Math.sqrt(i/Math.max(1,g.branches-1)),base=radial(a,w*.43*r),rise=h*(.22+.25*(1-r)+.08*rng());
  const stem=curve(base,add(base,[0,rise*.4,0]),add(base,radial(a,h*.1,rise*.7)),add(base,radial(a,h*.16,rise)));
  m.tube(stem,t=>h*.012*(1-.6*t),{wood:false,color:p.base,tip:p.body,segments:m.near?7:4,sides:6});
  for(let j=0;j<5;j++){
   const q=stem(.15+j*.16),az=a+j*GOLDEN;
   m.leafFrom(q,az,h*.37,h*.045,h*.33,{shape:'round',lobes:3,color:p.body,tip:p.tip,thickness:.035,rows:m.near?7:4});
  }
  if(g.age>.58&&i%3===0){
   const q=stem(1),base=add(q,[0,h*.11,0]);
   m.tube(line(q,base),()=>h*.008,{wood:false,color:p.base,tip:p.body,segments:3,sides:6});
   const point=(u,v,inner)=>{
    const theta=u*TAU,peak=Math.max(0,Math.cos(theta*3));
    const radius=h*(.025+.085*Math.sin(Math.PI*v*.76)+.036*v**4)-(inner?h*.005:0);
    return add(base,radial(theta,radius,h*(.22*v+.14*peak**3*v**6)+(inner?h*.003:0)));
   };
   for(const inner of [false,true])m.grid(m.near?12:6,m.near?24:12,(u,v)=>({point:point(u,v,inner),color:inner?blend(p.accent,p.tip,.18):p.accent,tissue:1,ink:.12}),true,!inner);
   m.grid(1,m.near?24:12,(u,v)=>({point:point(u,1,v>.5),color:p.accent,tissue:1,ink:.1}),true);
   flowers++;
  }
 }
 return {shootCount:g.branches,flowerCount:flowers,flowerLobes:3,structure:'low leafy mound with hollow pointed three-lobe flowers'};
}

function pinnatepalm(m,g,rng){
 const h=g.height,w=g.width,p=g.palette,a=g.phaseAngle;
 const trunkHeight=h*(.26+.47*Math.sqrt(g.age));
 const trunk=curve([0,0,0],radial(a,h*.018,trunkHeight*.3),radial(a,h*.055,trunkHeight*.7),radial(a,h*.09,trunkHeight));
 const radius=t=>h*.033*(1-.25*t)*(1+.035*Math.cos(t*TAU*18));
 m.tube(trunk,radius,{color:p.base,tip:p.base,ridges:.018,segments:m.near?48:24,sides:m.near?14:8});
 const rings=Math.max(3,Math.round(22*g.age));
 for(let i=1;i<=rings;i++){
  const t=i/(rings+2),root=trunk(t),r=radius(t)*1.015;
  m.tube(v=>add(root,[0,h*.004*v,0]),()=>r,{color:p.accent,tip:p.accent,wood:true,segments:1,sides:m.near?14:8,capEnds:false});
 }
 const top=trunk(1),pairs=14;let leaflets=0;
 for(let i=0;i<g.branches;i++){
  const az=a+i*GOLDEN,length=w*(.43+.08*rng()),end=add(top,radial(az,length,h*(-.11+.06*(i%3))));
  const rachis=curve(top,add(top,radial(az,length*.15,h*.23)),add(top,radial(az,length*.7,h*.22)),end);
  m.tube(rachis,t=>h*.007*(1-.86*t),{wood:false,color:p.accent,tip:p.tip,segments:m.near?18:9,sides:m.near?8:5});
  for(let j=0;j<pairs;j++)for(const side of [-1,1]){
   const t=.14+.81*j/pairs,root=rachis(t),azimuth=az+side*(.88+.22*t),len=w*.19*Math.sin(Math.PI*(.07+.88*t))**.65;
   m.leafFrom(root,azimuth,len,-h*(.045+.045*t),w*.034*(1-.45*t),{shape:'spear',thickness:.016,curl:.16,rows:m.near?5:3});leaflets++;
  }
 }
 return {frondCount:g.branches,leafletCount:leaflets,trunkBranchCount:0,leafScarCount:rings,structure:'single scarred trunk and apical pinnate crown'};
}
export const sourceFloraBuilders={orchard,windowleaf,fruitshrub,bloom,bractcane,fingerfield,splitpaddle,filamentflower,flowermat,pinnatepalm,...giantFloraBuilders};
