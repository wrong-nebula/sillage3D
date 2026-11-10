/** Editable terrestrial organ grammars. Metres, +Y up, rooted at the origin.
 * A genome is a deterministic design record; age is a sampled development stage.
 * traits.roots: buried (default), rock-clasp, eroded-bank; habitat.rootMode can
 * override the chosen master. Exposed forms are designed habitat specialists,
 * not a collision/contact solve against individual rocks. traits.runner is
 * independent: surface-arch stems or omitted buried-clonal connections.
 */
import { sourceFloraBuilders } from './source-flora-geometry.js';
import { LAND_FLORA_SPECIES } from './land-flora-catalog.js';
export { LAND_FLORA_SPECIES } from './land-flora-catalog.js';

const TAU = Math.PI * 2, GOLDEN = Math.PI * (3 - Math.sqrt(5));
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, n) => a.map(v => v * n);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm = a => mul(a, 1 / (Math.hypot(...a) || 1));
const radial = (angle, radius, height = 0) => [Math.cos(angle)*radius,height,Math.sin(angle)*radius];
const rgb = value => Array.isArray(value) ? [...value] : [16,8,0].map(n => (parseInt(value.slice(1),16)>>n & 255)/255);
const colors = (a,b,t) => a.map((v,i)=>mix(v,b[i],clamp(t)));
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;

export function landRandom(seed, label = '') {
  let state = seed|0;
  for (let i=0;i<label.length;i++) state=Math.imul(state^label.charCodeAt(i),16777619);
  return () => {state=(state+0x6d2b79f5)|0;let x=Math.imul(state^(state>>>15),state|1);x^=x+Math.imul(x^(x>>>7),x|61);return ((x^(x>>>14))>>>0)/4294967296;};
}

export function generateLandGenome(speciesId, seed, habitat = {}) {
  const spec=LAND_FLORA_SPECIES[speciesId];
  if(!spec)throw new RangeError(`Unknown terrestrial flora species: ${speciesId}`);
  const topology=landRandom(seed,`${speciesId}/topology`), pigment=landRandom(seed,`${speciesId}/pigment`), surface=landRandom(seed,`${speciesId}/surface`);
  const sample=(range,fallback)=>{const [a,b]=range??fallback;return mix(a,b,topology());};
  const age=clamp(finite(habitat.age,1)), maturity=.12+.88*age**.72;
  const adultHeight=sample(spec.height,[1,2]);
  const widthRatio=sample(spec.width,[.42,.65]);
  const adultBranches=Math.round(sample(spec.branches,[5,8]));
  const condition=clamp(finite(habitat.vigor,1),.25,1.15);
  // Explicit exposure produces compact crowns; default herbarium genomes keep
  // their original silhouette. Pigment and topology streams remain independent.
  const wind=clamp(finite(habitat.wind,.35)),moisture=clamp(finite(habitat.moisture,.5));
  const exposure=clamp((wind-.35)*1.3,0,.65);
  const height=adultHeight*maturity*(.86+.14*condition);
  const width=height*widthRatio*(.68+.32*Math.sqrt(age))*(1-.18*exposure+.08*(moisture-.5));
  const woody=['canopy','bottle','spire','candelabra','whorl','fan','orchard','fruitshrub','pinnatepalm','highcanopy','tablecanopy','curtainshrub'].includes(spec.morphology);
  const stemFactor={canopy:.027,candelabra:.071,rosette:.04,grass:.016,fern:.024,fan:.026,bottle:.15,pitcher:.035,cushion:.028,whorl:.028,vine:.024,spire:.042,orchard:.042,windowleaf:.022,fruitshrub:.027,bloom:.014,bractcane:.016,fingerfield:.035}[spec.morphology]??.03;
  const sourcePalette=spec.palette??spec.palettes?.[0]??{base:'#8b8068',body:'#91a879',tip:'#d4d197',underside:'#77958a',accent:'#d7a178'};
  const tone=(pigment()-.5)*.065;
  const palette=Object.freeze(Object.fromEntries(Object.entries(sourcePalette).map(([key,value])=>[key,Object.freeze(rgb(value).map(v=>clamp(v+tone)))])));
  return Object.freeze({species:speciesId,genus:spec.genus,morphology:spec.morphology,studyPlate:spec.studyPlate,seed:seed|0,
    height,width,adultHeight,branches:Math.max(2,Math.round(adultBranches*(.35+.65*Math.sqrt(age)))),
    contactRadius:height*stemFactor,stiffness:woody?.91:.63,age,maturity,
    phase:age<.18?'seedling':age<.58?'juvenile':age<.88?'adult':'reproductive',
    variation:surface(),lean:sample(spec.lean,Number.isFinite(spec.traits?.lean)?[spec.traits.lean*.86,spec.traits.lean*1.14]:[.035,.10])*(1+.65*exposure),phaseAngle:topology()*TAU,
    rootMode:['buried','rock-clasp','eroded-bank'].includes(habitat.rootMode??spec.traits?.roots)?(habitat.rootMode??spec.traits.roots):'buried',
    runnerMode:['surface-arch','buried-clonal'].includes(spec.traits?.runner)?spec.traits.runner:'none',
    palette,traits:Object.freeze({...spec.traits}),night:Object.freeze({mode:'none',intensity:0,color:'#b2dcbd',opening:0,...spec.night}),
    habitat:Object.freeze({vigor:condition,moisture,wind}),
  });
}

function bezier(a,b,c,d){return t=>{const q=1-t;return a.map((v,i)=>v*q*q*q+3*b[i]*q*q*t+3*c[i]*q*t*t+d[i]*t*t*t);};}
function axes(path,t,preferred=[1,0,0]) {
  const tangent=norm(sub(path(clamp(t+.001)),path(clamp(t-.001))));
  let side=sub(preferred,mul(tangent,dot(preferred,tangent)));
  if(Math.hypot(...side)<.01)side=cross(tangent,Math.abs(tangent[1])<.9?[0,1,0]:[0,0,1]);
  side=norm(side);return [side,norm(cross(tangent,side)),tangent];
}

function sculpt(THREE,g,near,distant=false) {
  const positions=[],pigments=[],uvs=[],flora=[],life=[],glow=[],indices=[];
  const glowColor=rgb(g.night.color),p=g.palette;
  let organs=0;
  function vertex(point,color,u,v,options={}) {
    const y=Math.max(0,point[1]),mask=clamp(options.glow??0),wood=options.wood??false;
    const index=positions.length/3;
    positions.push(point[0],y,point[2]);pigments.push(...color);uvs.push(u,v);
    flora.push(y<1e-7?0:clamp(y/g.height)**1.65*(wood?.03:.28),options.tissue??1,options.ink??.13,g.variation);
    // A zero organ mask also zeros intensity, suppressing the marine shader's
    // legacy automatic photophores on ordinary terrestrial tissue.
    life.push(mask>0?(g.night.intensity??0):0,g.night.mode==='night'?1:0,(g.night.opening??0)*clamp(y/g.height),mask);
    glow.push(...glowColor);return index;
  }
  function tri(a,b,c,flip=false){indices.push(a,flip?c:b,flip?b:c);}
  function grid(rows,columns,sample,wrap=false,flip=false) {
    // Keep every organ and its end points, roots, pigment and luminous mask.
    // Distant meshes spend vertices on the silhouette, not tissue thickness.
    if(distant){rows=Math.max(2,Math.ceil(rows*.45));columns=Math.max(wrap?4:2,Math.ceil(columns*.5));}
    const stride=wrap?columns:columns+1,start=positions.length/3;
    for(let j=0;j<=rows;j++)for(let i=0;i<stride;i++){
      const data=sample(i/columns,j/rows);vertex(data.point,data.color,i/columns,j/rows,data);
    }
    for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
      const a=start+j*stride+i,b=start+j*stride+(i+1)%stride;
      tri(a,a+stride,b,flip);tri(b,a+stride,b+stride,flip);
    }
    return {start,stride,rows};
  }
  function cap(ring,end,color,options) {
    const base=ring.start+(end?ring.rows*ring.stride:0),center=[0,0,0];
    for(let i=0;i<ring.stride;i++)for(let axis=0;axis<3;axis++)center[axis]+=positions[(base+i)*3+axis]/ring.stride;
    const pole=vertex(center,color,.5,end?1:0,options);
    for(let i=0;i<ring.stride;i++)tri(pole,base+i,base+(i+1)%ring.stride,!end);
  }
  function tube(path,radius,{color=p.base,tip=p.base,ridges=0,segments=near?10:5,sides=near?10:6,wood=true,glow:mask=0,capEnds=true}={}) {
    organs++;
    const frames=Array.from({length:segments+1},(_,i)=>axes(path,i/segments));
    const ring=grid(segments,sides,(u,v)=>{
      const a=u*TAU,frame=frames[Math.round(v*segments)],r=radius(v)*(1+ridges*Math.cos(a*6));
      return {point:add(path(v),add(mul(frame[0],r*Math.cos(a)),mul(frame[1],r*Math.sin(a)))),color:colors(color,tip,v),wood,tissue:0,glow:mask,ink:.03};
    },true,true);
    if(capEnds){cap(ring,false,color,{wood,tissue:0,glow:mask});cap(ring,true,tip,{wood,tissue:0,glow:mask});}
    return ring;
  }
  function leaf(path,width,{angle=0,shape=g.traits.leafShape??'spear',thickness=.035,curl=g.traits.curl??.10,color=p.body,tip=p.tip,underside=p.underside,glow:mask=0,rows=near?10:5,lobes=g.traits.lobes??0}={}) {
    organs++;
    const cols=near||shape==='heart'?4:2,preferred=radial(angle,1),rings=[];
    // Distant blades keep the same contour on one double-sided sheet. The
    // close mesh carries distinct tissue thickness and the colored reverse.
    for(const reverse of near?[false,true]:[false]){
      const ring=grid(rows,cols,(u,v)=>{
        const [side,reverseNormal,tangent]=axes(path,v,preferred),normal=mul(reverseNormal,-1),across=2*u-1;
        const exponent=shape==='round'?.45:shape==='ribbon'?.24:.77;
        let envelope=Math.max(.012,Math.sin(Math.PI*v)**exponent);
        if(shape==='heart')envelope=Math.max(.012,(.68+.64*Math.sin(Math.PI*v)**.6)*(1-v)**.65);
        if(shape==='lobed'||lobes>1)envelope*=1-(.16+.07*Math.abs(across))*Math.sin(v*Math.PI*(lobes||4))**2;
        const half=width*.5*envelope*(1-.28*v),fold=(1-across*across)*width*(.10+thickness*(reverse?-1:1))*envelope;
        const twist=curl*Math.sin(v*Math.PI),lateral=add(mul(side,Math.cos(twist)),mul(normal,Math.sin(twist)));
        const camber=add(mul(normal,Math.cos(twist)),mul(side,-Math.sin(twist)));
        let point=add(path(v),add(mul(lateral,across*half),mul(camber,fold)));
        if(shape==='heart')point=add(point,mul(tangent,-width*.25*Math.sin(Math.PI*Math.abs(across))*(1-v)**3));
        return {point,color:colors(reverse?underside:color,tip,v**2*.65),tissue:1,glow:mask*(v>.70?1:0),ink:.22};
      },false,!reverse);rings.push(ring);
    }
    const [top,bottom]=rings;
    if(bottom)for(let j=0;j<rows;j++)for(const edge of [0,cols]){
      const a=top.start+j*top.stride+edge,b=a+top.stride,c=bottom.start+j*bottom.stride+edge,d=c+bottom.stride;
      tri(a,c,b,edge===0);tri(b,c,d,edge===0);
    }
    if(bottom)for(const row of [0,rows])for(let i=0;i<cols;i++){
      const a=top.start+row*top.stride+i,b=a+1,c=bottom.start+row*bottom.stride+i,d=c+1;
      tri(a,b,c,row===0);tri(b,d,c,row===0);
    }
  }
  function leafFrom(root,angle,length,rise,width,options={}) {
    const side=radial(angle,length),end=add(root,[side[0],rise,side[2]]);
    leaf(bezier(root,add(root,[side[0]*.18,rise*.62+length*.21,side[2]*.18]),add(root,[side[0]*.72,rise+length*.18,side[2]*.72]),end),width,{angle:angle+Math.PI/2,...options});
  }
  function bud(root,size,{color=p.accent,glow:mask=0,elongation=1.6}={}) {
    tube(t=>add(root,[0,size*elongation*t,0]),t=>size*(.09+.91*Math.sin(Math.PI*t)**.66),{color,tip:p.tip,wood:false,glow:mask,sides:near?10:6,segments:near?7:4});
  }
  function flower(root,size) {
    bud(root,size*.38,{glow:1,elongation:.8});
    for(let i=0;i<5;i++)leafFrom(root,g.phaseAngle+i*TAU/5,size*1.75,size*.20,size*.90,{shape:'round',color:p.tip,underside:p.tip,tip:p.tip,thickness:.014,rows:near?6:3,glow:1});
  }
  function fanBlade(root,angle,length,{spread=1.25,lobes=9,color=p.body,tip=p.tip,glow:mask=0}={}) {
    organs++;
    const side=radial(angle+Math.PI/2,1),front=radial(angle,1),rows=near?9:4,columns=near?48:24;
    for(const reverse of near?[false,true]:[false])grid(rows,columns,(u,v)=>{
      const theta=(u-.5)*spread*2,r=length*(.018+.982*v)*(1+.025*Math.cos(theta*lobes));
      const x=Math.sin(theta)*r,y=Math.cos(theta)*r;
      const pleat=Math.cos(theta*lobes*2)*length*.029*v,depth=length*(.10*v*v+(reverse?-.004:.004))+pleat;
      return {point:add(root,add(mul(side,x),add([0,y,0],mul(front,depth)))),color:colors(reverse?p.underside:color,tip,v**2*.85),tissue:2,glow:mask*(v>.85?1:0),ink:.22};
    },false,reverse);
  }
  function umbrella(root,angle,radius,{lobes=7,glow:mask=0}={}) {
    organs++;
    const rows=near?7:4,columns=near?40:20;
    for(const reverse of near?[false,true]:[false])grid(rows,columns,(u,v)=>{
      const a=u*TAU+angle,r=radius*(.02+.98*v)*(1+.10*Math.cos(a*lobes)),fold=radius*(.19*(1-v*v)+.035*Math.cos(a*lobes)*v)+(reverse?-.006:.006)*radius;
      return {point:add(root,radial(a,r,fold)),color:colors(reverse?p.underside:p.body,p.tip,v*.5),tissue:2,glow:mask*(v>.92?1:0),ink:.24};
    },true,!reverse);
  }
  function pendant(root,size,{color=p.accent,glow:mask=1}={}) {
    const drop=size*2.8,end=add(root,[0,-drop,0]);
    tube(t=>add(root,[size*.24*Math.sin(t*2),-drop*t,0]),t=>size*.10*(1-.3*t),{wood:false,color:p.base,tip:p.base,segments:near?6:2,sides:near?5:3});
    const lip=add(end,[size*.24*Math.sin(2),0,0]);
    // Downturned fluted floral corolla, with a real open mouth.
    const rows=near?7:2,sides=near?12:6;
    grid(rows,sides,(u,v)=>{const a=u*TAU,r=size*(.24+.57*v)*(1+.12*Math.cos(a*5));return {point:add(lip,radial(a,r,-size*1.3*v)),color:colors(color,p.tip,v*.4),tissue:3,glow:mask,ink:.09};},true,true);
  }
  function finish() {
    const mesh=new THREE.BufferGeometry();
    for(const [name,data,size]of[['position',positions,3],['color',pigments,3],['uv',uvs,2],['aFlora',flora,4],['aFloraLife',life,4],['aFloraGlow',glow,3]])mesh.setAttribute(name,new THREE.Float32BufferAttribute(data,size));
    mesh.setIndex(indices);mesh.computeVertexNormals();mesh.computeBoundingBox();mesh.computeBoundingSphere();
    mesh.userData={species:g.species,seed:g.seed,age:g.age,lod:near?'near':distant?'distant':'far',organs,contactRadius:g.contactRadius,grammar:g.morphology,rootMode:g.rootMode,runnerMode:g.runnerMode};
    return mesh;
  }
  return {tube,leaf,leafFrom,bud,flower,fanBlade,umbrella,pendant,grid,vertex,tri,finish,near,get triangleCount(){return indices.length/3;}};
}

function trunk(mesh,g,{end=.72,radius=1,color=g.palette.base}={}) {
  const h=g.height,angle=g.phaseAngle,lean=g.lean*h,curve=t=>[Math.cos(angle)*lean*Math.sin(t*1.6),h*end*t,Math.sin(angle)*lean*t*t];
  mesh.tube(curve,t=>g.contactRadius*radius*mix(1,.29,t),{ridges:.045,color,tip:color});return curve;
}

function canopy(mesh,g,rng) {
  const h=g.height,w=g.width,stem=trunk(mesh,g,{end:.75}),count=g.branches,style=g.traits.crownStyle??'compound',umbrella=style==='umbrella';
  for(let i=0;i<count;i++){
    const a=g.phaseAngle+i*GOLDEN+(rng()-.5)*.4,t=.32+.55*(i/(count-1)),root=stem(t);
    const reach=w*(.38+.18*rng())*(1-.25*t),rise=h*(.16+.08*rng());
    const end=add(root,radial(a,reach,rise));
    mesh.tube(bezier(root,add(root,radial(a,reach*.12,rise*.60)),add(root,radial(a,reach*.68,rise*.9)),end),t=>h*.014*mix(1,.24,t));
    if(umbrella){
      mesh.umbrella(end,a,w*.27,{lobes:g.traits.lobes??7,glow:i%3===1?1:0});
      if(g.age>.78)for(let j=0;j<2;j++)mesh.pendant(add(end,radial(a+j*1.4,w*.10)),h*.021,{glow:1});
    }else if(style==='broad'){
      for(let j=0;j<4;j++)mesh.leafFrom(end,a+(j-1.5)*.82,w*.25,h*.04,w*.24,{shape:g.traits.leafShape??'heart',thickness:.018});
      if(g.age>.65&&g.traits.flower)for(let j=0;j<3;j++)mesh.pendant(add(end,radial(a+j*2.1,w*.065)),h*.028,{glow:1});
    }else for(let j=0;j<3;j++){
      const branchAngle=a+(j-1)*.82,tip=add(end,radial(branchAngle,w*.19,h*.035));
      mesh.tube(bezier(end,add(end,radial(branchAngle,w*.06,h*.025)),add(tip,[0,-h*.012,0]),tip),t=>h*.006*mix(1,.22,t),{segments:mesh.near?5:3,sides:5});
      for(let k=0;k<7;k++){
        const leafRoot=add(tip,radial(branchAngle,w*.038*(k/7-.4))),leafAngle=branchAngle+(k%2?1:-1)*1.1;
        mesh.leafFrom(leafRoot,leafAngle,w*(.10+.012*rng()),h*.012,w*.075,{shape:'round',thickness:.015,glow:i%3===1&&j===1&&k===4?1:0,rows:mesh.near?6:3});
      }
    }
  }
  if(umbrella)mesh.umbrella(stem(1),g.phaseAngle,w*.29,{lobes:g.traits.lobes??7});
}

function candelabra(mesh,g,rng) {
  const h=g.height,w=g.width,slender=g.traits.slender??1,stemColor=g.traits.stemColorRole==='base'?g.palette.base:g.palette.body,stem=trunk(mesh,g,{end:.93,radius:slender,color:stemColor}),count=g.branches;
  for(let i=0;i<count;i++){
    const a=g.phaseAngle+i*GOLDEN,t=.19+.49*(i/(count-1)),root=stem(t),reach=w*(.28+.17*rng());
    const end=add(root,radial(a,reach,h*(.33+.15*rng())));
    const path=bezier(root,add(root,radial(a,reach*.8,h*.01)),add(end,[0,-h*.21,0]),end);
    mesh.tube(path,t=>h*.048*slender*(.87+.18*Math.sin(t*Math.PI))*mix(1,.68,t),{ridges:.10,color:stemColor,tip:g.palette.tip});
    if(g.age>.35)for(let j=0;j<3;j++){
      const fingerAngle=a+(j-1)*.9,fingerEnd=add(end,radial(fingerAngle,h*.075,h*(.075+.035*rng())));
      mesh.tube(bezier(end,add(end,radial(fingerAngle,h*.05,h*.015)),add(fingerEnd,[0,-h*.035,0]),fingerEnd),t=>h*.025*slender*mix(1,.61,t),{ridges:.08,color:stemColor,tip:g.palette.tip,segments:mesh.near?6:3});
      if(g.age>.6)mesh.bud(fingerEnd,h*.024,{glow:1,elongation:1.65});
    }
    if(g.traits.leafShape==='spear')for(let j=0;j<3;j++)mesh.leafFrom(add(end,[0,-h*.04,0]),a+j*2.1,w*.13,h*.06,w*.055,{thickness:.07});
  }
  mesh.bud(stem(1),h*.047,{glow:1});
}

function rosette(mesh,g,rng,origin=[0,0,0],scale=1) {
  const h=g.height*scale,w=g.width*scale,count=g.branches,base=add(origin,[0,h*.035,0]);
  mesh.tube(t=>add(origin,[0,h*.10*t,0]),t=>h*.055*(1-.5*t),{segments:3,sides:8});
  for(let i=0;i<count;i++){
    const a=g.phaseAngle+i*GOLDEN,inner=i<3,upright=g.traits.upright,reach=w*(upright?.23:inner?.20:.50)*( .84+.2*rng()),rise=h*(upright?.66+.32*rng():inner?.83:.30+.12*rng());
    if(upright){
      const path=bezier(base,add(base,radial(a,reach*.1,rise*.33)),add(base,radial(a,reach*.58,rise*.73)),add(base,radial(a,reach,rise)));
      mesh.leaf(path,w*.15,{angle:a+Math.PI/2,thickness:.11,glow:i%5===1?1:0,shape:'spear'});
    }else mesh.leafFrom(base,a,reach,rise,w*(inner?.18:.26),{thickness:.11,glow:i%5===1?1:0,shape:g.traits.leafShape??'spear'});
  }
  if(g.traits.flower&&g.age>.75){
    const path=t=>add(base,[h*.04*Math.sin(t*2),h*1.10*t,0]);mesh.tube(path,t=>h*.012*(1-.6*t));
    for(let j=0;j<4;j++){
      const root=path(.88+.04*j),a=g.phaseAngle+j*GOLDEN,end=add(root,radial(a,h*.045,h*.055));
      mesh.tube(t=>add(root,mul(sub(end,root),t)),t=>h*.006*(1-.4*t),{wood:false,segments:3,sides:5});mesh.bud(end,h*.030,{glow:1,elongation:2.3});
    }
  }
}

function grass(mesh,g,rng) {
  const h=g.height,w=g.width,count=g.branches;
  mesh.tube(t=>[0,h*.055*t,0],t=>g.contactRadius*(1-.55*t),{segments:2,sides:6});
  for(let i=0;i<count;i++){
    const a=g.phaseAngle+i*GOLDEN,reach=w*(.40+.58*rng()),rise=h*(.11+.40*rng());
    const leafPath=bezier([0,h*.015,0],radial(a,reach*.05,h*.42),radial(a,reach*.55,h*(.80+.14*rng())),radial(a,reach,rise));
    mesh.leaf(leafPath,w*(.014+.009*rng()),{angle:a+Math.PI/2,shape:'ribbon',thickness:.008,curl:.3});
    if(i%3===0&&g.age>.40){
      const end=radial(a,reach*.52,h*(.81+.12*rng())),path=bezier([0,0,0],[0,h*.35,0],add(end,[0,-h*.16,0]),end);
      mesh.tube(path,t=>h*.007*(1-.45*t),{wood:false,segments:mesh.near?8:4,sides:5});
      mesh.bud(end,h*.017,{glow:1,elongation:4.8});
      for(let j=0;j<6;j++)for(const sign of [-1,1])mesh.leafFrom(add(end,[0,h*.012*j,0]),a+sign*1.2,h*.040*(1-j*.08),h*.025,h*.008,{shape:'spear',thickness:.009,color:g.palette.accent,tip:g.palette.tip,rows:mesh.near?4:2});
    }
  }
}

function fern(mesh,g,rng) {
  const h=g.height,w=g.width,count=Math.max(3,Math.round(g.branches*.65));
  mesh.tube(t=>[0,h*.08*t,0],t=>g.contactRadius*(1-.6*t),{segments:3,sides:8});
  for(let i=0;i<count;i++){
    const a=g.phaseAngle+i*GOLDEN,reach=w*(.29+.18*rng()),rise=h*(.55+.35*rng()),root=[0,h*.025,0];
    const path=bezier(root,radial(a,reach*.05,rise*.66),radial(a,reach*.50,rise*1.16),radial(a,reach,rise));
    mesh.tube(path,t=>h*.012*mix(1,.15,t),{wood:false,sides:6});
    const pairs=Math.max(4,Math.round((g.traits.tiers??8)*(.55+.45*g.age)));
    for(let j=0;j<pairs;j++){
      const t=.20+.72*j/pairs,root=path(t),length=w*.24*Math.sin(t*Math.PI)*(.8+.2*rng());
      for(const sign of [-1,1])mesh.leafFrom(root,a+sign*1.03,length,h*.045,length*(g.traits.leafShape==='round'?.61:.42),{shape:g.traits.leafShape??'spear',thickness:.015,glow:j===pairs-1&&i===1?1:0});
    }
    mesh.leafFrom(path(.88),a,w*.12,h*.08,w*.05,{thickness:.01});
  }
}
function fan(mesh,g,rng) {
  const h=g.height,w=g.width,stem=trunk(mesh,g,{end:.70}),count=g.branches;
  for(let i=0;i<count;i++){
    const a=g.phaseAngle+i*GOLDEN,t=.38+.55*i/(count-1),root=stem(t),end=add(root,radial(a,w*.27,h*.13));
    mesh.tube(bezier(root,add(root,[0,h*.12,0]),add(end,[0,-h*.06,0]),end),v=>h*.014*(1-.55*v));
    mesh.fanBlade(end,a,w*(.29+.045*rng()),{lobes:g.traits.lobes??9,glow:i===1?1:0});
  }
}

function bottle(mesh,g,rng) {
  const h=g.height,w=g.width,p=g.palette,angle=g.phaseAngle;
  const path=t=>radial(angle,h*g.lean*Math.sin(t*1.2),h*.61*t);
  mesh.tube(path,t=>w*(.045+.28*Math.sin(Math.PI*(.21+t*.70))**1.15)*(1-.72*t),{color:p.base,tip:p.base,ridges:.055,segments:mesh.near?18:9,sides:mesh.near?16:8});
  for(let i=0;i<g.branches;i++){
    const a=angle+i*GOLDEN,root=path(.75+.23*rng()),end=add(root,radial(a,w*(.26+.13*rng()),h*(.16+.12*rng())));
    mesh.tube(bezier(root,add(root,[0,h*.15,0]),add(end,[0,-h*.06,0]),end),t=>h*.023*(1-.76*t));
    for(let j=0;j<3;j++)mesh.leafFrom(end,a+(j-1)*.8,w*.19,h*.025,w*.095,{shape:g.traits.leafShape??'spear',glow:j===1&&i%2===0?1:0});
    if(g.age>.75&&g.traits.flower)mesh.bud(end,h*.032,{glow:1});
  }
}

function pitcher(mesh,g,rng) {
  const h=g.height,w=g.width,p=g.palette,count=Math.max(2,Math.round(g.branches*.6));
  mesh.tube(t=>[0,h*.08*t,0],t=>g.contactRadius*(1-.5*t),{segments:3,sides:8});
  for(let i=0;i<count;i++){
    const a=g.phaseAngle+i*GOLDEN,root=[0,h*.04,0],base=radial(a,w*(.17+.08*rng()),h*.14),length=h*(.48+.25*rng()),radius=w*.14;
    mesh.tube(bezier(root,add(root,radial(a,w*.09,h*.13)),add(base,[0,-h*.04,0]),base),t=>h*.014*(1-.2*t));
    const trumpet=g.traits.form==='trumpet';
    const center=t=>add(base,radial(a,h*.04*Math.sin(t*2),length*t));
    const profile=t=>trumpet?radius*(.12+1.15*t**2.1):radius*(.18+.65*Math.sin(Math.PI*(.08+.68*t))+.25*t**3);
    const sides=mesh.near?16:8,rows=mesh.near?12:6;
    // A genuine open vessel: independent outer and inner wall joined over a thick lip.
    for(const inner of [false,true])mesh.grid(rows,sides,(u,v)=>{
      const theta=u*TAU,r=profile(v)-(inner?radius*.10:0),q=center(v),wave=Math.cos(theta*7)*radius*(trumpet?.065*v:.025);
      return {point:add(q,radial(theta,Math.max(radius*.025,r)+wave,trumpet?Math.cos(theta*7)*radius*.06*v**3:0)),color:colors(inner?p.underside:p.body,p.tip,v*v*.6),tissue:3,glow:v>.85?1:0,ink:.19};
    },true,inner);
    mesh.grid(1,sides,(u,v)=>({point:add(center(0),radial(u*TAU,profile(0)*v)),color:p.base,tissue:0,wood:true}),true,false);
    mesh.grid(1,sides,(u,v)=>{const theta=u*TAU,r=profile(1)-radius*.10*v+Math.cos(theta*7)*radius*(trumpet?.065:.025);return{point:add(center(1),radial(theta,r,trumpet?Math.cos(theta*7)*radius*.06:0)),color:p.accent,tissue:0,glow:1};},true,false);
    if(!trumpet){
      const stalkRoot=add(center(.45),radial(a+Math.PI,profile(.45)*.96,0)),lidRoot=add(center(1),radial(a+Math.PI,radius*.82,radius*.80));
      const stalk=bezier(stalkRoot,add(stalkRoot,radial(a+Math.PI,radius*.65,length*.45)),add(lidRoot,radial(a+Math.PI,radius*.40,radius*.38)),lidRoot);
      mesh.tube(stalk,t=>radius*.075*(1-.30*t),{wood:false,color:p.base,tip:p.body,segments:mesh.near?9:5,sides:6});
      mesh.leafFrom(lidRoot,a,radius*1.65,-radius*.12,radius*1.5,{shape:'round',thickness:.026,color:p.tip,glow:0});
    }
    mesh.leafFrom(root,a+.5,w*.43,h*.12,w*.20,{thickness:.02});
  }
}

function cushion(mesh,g,rng) {
  const h=g.height,w=g.width,count=g.branches;
  mesh.tube(t=>[0,h*.13*t,0],t=>g.contactRadius*1.8*(1-.3*t),{segments:3,sides:8});
  for(let i=0;i<count;i++){
    const a=g.phaseAngle+i*GOLDEN,r=w*.35*Math.sqrt(i/Math.max(1,count-1)),base=radial(a,r,h*(.045+.12*(1-i/count)));
    // A clonal mat: the buried runner is inferred, while each visible rosette
    // has its own ground-entering support rather than exposed root fingers.
    mesh.tube(t=>[base[0],base[1]*t,base[2]],t=>h*.025*(1-.3*t),{segments:2,sides:6});
    if(g.traits.form==='beads'){
      for(let j=0;j<7;j++){
        const bead=add(base,radial(a+j*GOLDEN,w*.060*Math.sqrt(j/6))),size=w*(.034+.008*rng());
        mesh.tube(t=>add(bead,[0,size*1.5*t,0]),t=>size*(.10+.90*Math.sin(Math.PI*t)**.60),{color:g.palette.body,tip:g.palette.tip,wood:false,segments:mesh.near?6:3,sides:mesh.near?8:5});
      }
      continue;
    }
    for(let j=0;j<11;j++){
      const inner=j>=7;
      mesh.leafFrom(base,a+j*GOLDEN,w*(inner?.065:.12),h*(inner?.23:.12+.08*rng()),w*(inner?.065:.105),{shape:'round',thickness:.10,glow:i%4===1&&j===1?1:0});
    }
    if(g.age>.68&&i%2===0&&g.traits.flower){const lift=h*(.55+.22*rng()),path=t=>add(base,[h*.025*Math.sin(t*2),t*lift,0]);mesh.tube(path,t=>h*.012*(1-.3*t),{wood:false,sides:5,segments:5});mesh.flower(path(1),h*.040);}
  }
}

function whorl(mesh,g,rng) {
  const h=g.height,w=g.width,stem=trunk(mesh,g,{end:.98}),tiers=Math.max(3,Math.round((g.traits.tiers??g.branches)*(.55+.45*g.age)));
  for(let i=0;i<tiers;i++){
    const t=.12+.75*i/Math.max(1,tiers-1),root=stem(t),count=g.traits.leavesPerNode??(4+i%2),extent=w*.43*(1-.48*t);
    if(g.traits.form==='lotus'){
      const a=g.phaseAngle+i*GOLDEN,end=add(root,radial(a,extent*.76,h*.05));
      mesh.tube(bezier(root,add(root,radial(a,extent*.20,h*.04)),add(end,[0,-h*.01,0]),end),v=>h*.010*(1-.45*v),{wood:false,segments:mesh.near?6:3,sides:5});
      mesh.umbrella(end,a,extent*.60,{lobes:9});
    }else for(let j=0;j<count;j++)mesh.leafFrom(root,g.phaseAngle+i*.53+j*TAU/count,extent,h*(.035+.03*rng()),extent*.65,{shape:g.traits.leafShape??'round',thickness:.055,glow:i%3===1&&j===0?1:0});
    if(g.traits.flower&&g.age>.75&&i%2===0)for(let j=0;j<3;j++){
      const a=g.phaseAngle+j*2.1,end=add(root,radial(a,h*.042,h*.045));
      mesh.tube(v=>add(root,mul(sub(end,root),v)),v=>h*.005*(1-.4*v),{wood:false,segments:3,sides:5});mesh.bud(end,h*.017,{glow:1});
    }
  }
  if(g.age>.55)mesh.bud(stem(1),h*.045,{glow:1,elongation:1.5});
}

function vine(mesh,g,rng) {
  const h=g.height,w=g.width,count=Math.max(2,Math.round(g.branches*.5));
  for(let i=0;i<count;i++){
    const a=g.phaseAngle+i*GOLDEN,reach=w*(.55+.15*rng()),end=radial(a,reach,0),rise=h*(.76+.16*rng());
    const path=bezier([0,0,0],radial(a,reach*.10,rise*1.34),radial(a,reach*.75,rise*1.34),end);
    mesh.tube(path,t=>h*.018*(.75+.25*Math.sin(t*Math.PI)),{wood:false,segments:mesh.near?14:7,sides:mesh.near?8:5});
    const leaves=7;
    for(let j=0;j<leaves;j++){
      const t=.14+.72*j/leaves,root=path(t),side=j%2?1:-1;
      mesh.leafFrom(root,a+side*1.18,w*.21,h*.065,w*.16,{shape:g.traits.leafShape??'round',thickness:.018,glow:g.traits.flower?0:(j%3===1?1:0)});
      if(g.age>.73&&g.traits.flower&&j%3===0)for(let k=0;k<3;k++)mesh.pendant(add(root,radial(a+k*2.1,h*.03)),h*.024,{glow:1});
    }
  }
}

function spire(mesh,g,rng) {
  const h=g.height,w=g.width,stem=trunk(mesh,g,{end:1}),tiers=Math.max(4,Math.round((g.traits.tiers??g.branches)*(.5+.5*g.age)));
  for(let i=0;i<tiers;i++){
    const t=.16+.70*i/(tiers-1),root=stem(t),count=4+i%3,extent=w*.48*(1-.78*t);
    for(let j=0;j<count;j++){
      const a=g.phaseAngle+i*.6+j*TAU/count,reach=extent*(g.traits.windCombed?.54+.46*(.5+.5*Math.cos(a-g.phaseAngle)):1),end=add(root,radial(a,reach,-h*.035));
      mesh.tube(bezier(root,add(root,radial(a,reach*.3,h*.03)),add(end,[0,h*.02,0]),end),v=>h*.010*(1-.8*v),{segments:mesh.near?5:3,sides:5});
      for(let k=0;k<3;k++)mesh.leafFrom(add(root,radial(a,reach*.24*k,-h*.006*k)),a+(k-1)*.18,reach*(.94-.10*k),-h*(.055+.03*rng()),extent*.09,{shape:g.traits.leafShape??'spear',thickness:.025,glow:i%3===0&&j===1&&k===1?1:0});
    }
  }
  mesh.leafFrom(stem(.87),g.phaseAngle,w*.065,h*.17,w*.09,{thickness:.04,glow:1});
}

const builders={canopy,candelabra,rosette,grass,fern,fan,bottle,pitcher,cushion,whorl,vine,spire,...sourceFloraBuilders};
function exposedRoots(mesh,g) {
  if(g.rootMode==='buried'||g.age<.28)return 0;
  const count=g.rootMode==='rock-clasp'?2:3,h=g.height;
  for(let i=0;i<count;i++){
    const angle=g.phaseAngle+.9+i*1.8,radius=g.contactRadius*(3.2+i*.65),end=radial(angle,radius,0),root=radial(angle,g.contactRadius*.25,h*.055);
    const bend=add(radial(angle+.22,radius*.56,h*(g.rootMode==='rock-clasp'?.038:.015)),[0,0,0]);
    mesh.tube(bezier(root,radial(angle,radius*.20,h*.075),bend,end),t=>g.contactRadius*.30*(1-.82*t),{color:g.palette.base,tip:g.palette.base,wood:true,segments:mesh.near?7:4,sides:mesh.near?8:5});
  }
  return count;
}
export function buildLandGeometry(THREE,genome,lod='near') {
  if(!builders[genome.morphology])throw new RangeError(`Unknown terrestrial grammar: ${genome.morphology}`);
  const mesh=sculpt(THREE,genome,lod==='near',lod==='distant');
  const features=builders[genome.morphology](mesh,genome,landRandom(genome.seed,`${genome.species}/organs`),...(sourceFloraBuilders[genome.morphology]?[THREE]:[]));
  const count=exposedRoots(mesh,genome),geometry=mesh.finish();geometry.userData.exposedRoots=count;if(features)geometry.userData.features=features;return geometry;
}
