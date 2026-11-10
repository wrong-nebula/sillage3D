import {Vector3, Quaternion, Euler} from 'three';
import {loadTenguCourier} from './tenguCourier.js';
import {SPLAT_MATERIAL_DEFAULTS} from './SplatMaterialResponse.js';
import {SSAO_DEFAULTS} from './SplatSSAO.js';
import {splatMaterialSeed} from './SplatSurface.js';
import {decodeNativeSplat} from './nativeSplat.js';
import {bakeReefGlow} from './ReefBioluminescence.js';
import {THERMAL_PALETTE} from './thermalMotion.js';
import {bakeStudioBounce} from './StudioBounce.js';
import {buildRockSplats,loadRockFractures} from './rockFracture.js';

const TAU = Math.PI * 2;
const hex = s => s.match(/[\da-f]{2}/gi).map(v => parseInt(v, 16) / 255);
const unit = a => {const n = Math.hypot(...a) || 1; return a.map(v => v / n);};
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const LIGHT = unit([-.45,.8,.6]);

export const LAB_MATERIALS = [
  {label:'Glazed porcelain',kind:'ceramic',color:'#eee9df',material:'stone',roughness:.18,metalness:0,sparkle:1,studioIntensity:.65},
  {label:'Terracotta',kind:'clay',color:'#c66f4e',material:'stone',roughness:.9,metalness:0,sparkle:0,studioIntensity:.8},
  {label:'Polished gold',kind:'metal',color:'#d9ad57',material:'metal',roughness:.12,metalness:1,sparkle:1,studioIntensity:1.2},
  {label:'Brushed titanium',kind:'brushed',color:'#a9b7c4',material:'rough-metal',roughness:.4,metalness:1,sparkle:.6,studioIntensity:1},
  {label:'Thin-film iridescence',kind:'iridescent',color:'#a1b7d7',material:'metal',roughness:.18,metalness:.9,sparkle:1,studioIntensity:.25},
  {label:'Oxidized copper',kind:'copper',color:'#bc875d',material:'metal',roughness:.3,metalness:.85,sparkle:.8,studioIntensity:1},
  {label:'Mirror chrome',kind:'chrome',color:'#d8e5ee',material:'metal',roughness:.08,metalness:1,sparkle:1,studioIntensity:.9},
  {label:'Jade',kind:'jade',color:'#42b794',material:'stone',roughness:.24,metalness:0,sparkle:.8,studioIntensity:.35},
  {label:'Anisotropic steel',kind:'anisotropic',color:'#b7c6d4',material:'metal',roughness:.28,metalness:1,sparkle:1,studioIntensity:1},
];
const BASE_STYLE = {quality:'studio',mode:'gaussian',brushScale:1,coverage:1.1,softness:.25,
  indirect:true,bounceStrength:1.2,tonePreservation:.65,tintedShadows:true,shadowTintStrength:.18,
  sun:false,lensDirt:false,lensFlare:false,painterlyVignette:false,foregroundDOF:false,
  autoFocus:true,pixelFilter:false,plantLOD:true,waterReflection:true,gouacheTexture:.35,gouacheBlend:.5,gouacheTone:.3,
  lensDiffraction:null,chromaticAberration:null,diffractionScale:1,diffractionStrength:1,fringeStrength:.48,...SPLAT_MATERIAL_DEFAULTS,...SSAO_DEFAULTS};

/** Small deterministic fields keep scene changes fast and fully editable. */
function field(seed = 1947) {
  const splats = [];
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0) / 2**32);
  function mark(center, normal, size, color, material='stone', extra={}) {
    const n=unit(normal), u=unit(cross(n,Math.abs(n[1])>.9?[1,0,0]:[0,1,0])),v=cross(n,u);
    const light=.22+.78*Math.max(0,n.reduce((sum,x,k)=>sum+x*LIGHT[k],0));
    const edge=Math.max(0,n[0]*.62+n[1]*.24-n[2]*.75)**5;
    const s={center,axes:[u.map(x=>x*size),v.map(x=>x*size*.86),n.map(x=>x*size*.2)],
      color:hex(color).map((c,k)=>Math.min(1,c*light+edge*[.035,.10,.16][k])),opacity:.98,seed:random(),material,...extra};
    splats.push(s);return s;
  }
  function shell(center,radii,count,color,material='stone',extra={}) {
    const size=Math.sqrt(4*Math.PI*Math.max(...radii)**2/count)*.69;
    for(let i=0;i<count;i++) {
      const y=1-2*(i+.5)/count,a=i*2.3999632297,r=Math.sqrt(1-y*y),n=[r*Math.cos(a),y,r*Math.sin(a)];
      mark(center.map((v,k)=>v+n[k]*radii[k]),n.map((v,k)=>v/radii[k]),size,color,material,extra);
    }
  }
  function floor(radius=5,level=0,color='#b9bba5',water=false) {
    const step=.16;
    for(let z=-radius;z<=radius;z+=step)for(let x=-radius;x<=radius;x+=step) {
      if(x*x+z*z>radius*radius)continue;
      const s=mark([x,level,z],[0,1,0],.12,color,water?'water':'stone',water?{wind:[0,0,0,3],opacity:.88}:{});
      const fade=Math.max(0,1-(x*x+z*z)/(radius*radius))**1.7;
      if(!water){const shadow=Math.exp(-((x+.4)**2+(z+.2)**2)/3)*.23;s.color=s.color.map(v=>v*(1-shadow)*.085*fade);}
      else s.color=s.color.map(v=>v*(.18+.82*fade));
    }
  }
  function torus(center,major=1.3,minor=.33,color='#c58058',{segments=144,rings=22,size=.065}={}) {
    for(let i=0;i<segments;i++)for(let j=0;j<rings;j++) {
      const a=i/segments*TAU,b=j/rings*TAU,n=[Math.cos(a)*Math.cos(b),Math.sin(a)*Math.cos(b),Math.sin(b)];
      mark([center[0]+Math.cos(a)*(major+minor*Math.cos(b)),center[1]+Math.sin(a)*(major+minor*Math.cos(b)),center[2]+minor*Math.sin(b)],n,size,color);
    }
  }
  function knot(center,{segments=448,rings=64}={}){
    const path=t=>{const radius=1.25+.5*Math.cos(t*3);return [radius*Math.cos(t*2),radius*Math.sin(t*2),.5*Math.sin(t*3)];};
    // Each mark is shaded once, so the spacing of the marks is the finest
    // highlight the surface can show. Sizes keep the overlap of the original
    // 320 by 48 sampling: .7 of the spacing along the tube, 1.09 around it.
    const along=.039*320/segments,around=.039*.86*48/rings;
    for(let i=0;i<segments;i++){
      const t=i/segments*TAU,p=path(t),next=path(t+.001),tangent=unit(next.map((v,k)=>v-p[k]));
      const u=unit(cross(tangent,[0,0,1])),v=cross(tangent,u);
      for(let j=0;j<rings;j++){
        const angle=j/rings*TAU,n=u.map((x,k)=>x*Math.cos(angle)+v[k]*Math.sin(angle));
        const s=mark(center.map((x,k)=>x+p[k]+n[k]*.235),n,along,'#ddba76','metal');
        s.axes[0]=tangent.map(v=>v*along);s.axes[1]=cross(n,tangent).map(v=>v*around);s.axes[2]=n.map(v=>v*along*.2);
      }
    }
  }
  function garden() {
    floor(4.7,0,'#a1ac78');
    shell([-2.6,1.2,-1.2],[.2,1.3,.2],300,'#80674d','wood');
    for(let i=0;i<3;i++)shell([-2.6+(i-1)*.45,2.7+i*.25,-1.2],[.9,.8,.8],500,i===1?'#92b46b':'#5e8e59','foliage',{wind:[1.4,2,i,2]});
    for(let i=0;i<700;i++) {
      const x=(random()-.5)*8,z=(random()-.5)*7,h=.1+random()*.27;
      mark([x,h,z],[0,.2,1],.07,i%7===0?'#e3bf71':'#759a54','grass',{wind:[0,.5,random()*6,2]});
    }
    for(let i=0;i<70;i++) {
      const anchor=[(random()-.5)*7,.5+random()*3,(random()-.5)*5],r=.014+random()*.012;
      mark(anchor,[0,0,1],r,'#fff1cc','spore',{softParticle:true,opacity:.65,
        sporeMotion:{anchor,phase:random()*TAU,rate:.3,amplitude:[.5,.25,.3]}});
    }
  }
  function finish(extra={}) {
    return {splats,background:'#000000',orbitMin:3,orbitLimit:30,orbitMaxPolar:Math.PI*.49,
      animation:{indices:splats.flatMap((s,i)=>s.wind?[i]:[])},...extra};
  }
  return {splats,random,mark,shell,floor,torus,knot,garden,finish};
}

/** Transform the sample through the dynamic upload path; all surface lighting
 * stays on the GPU and responds to the studio HDRI even with motion paused. */
class MaterialSculpture {
  constructor() {
    const f=field(711);f.knot([0,2.05,0]);
    this.splats=f.splats;this.rest=this.splats.map(s=>({center:s.center.slice(),axes:s.axes.map(a=>a.slice())}));
    for(const s of this.splats)s.filmPhase=.5+.4999*Math.sin(s.center[0]*2.7+Math.sin(s.center[1]*3.1)+s.center[2]*4.3);
    this.time=0;this.materialIndex=0;this.studioIntensities=new Map();this.root={position:new Vector3(0,0,0)};this.activity='Rotating material sample';
    this.point=new Vector3();this.origin=new Vector3(0,2.05,0);this.rotation=new Quaternion();this.autoplay=true;this.setMaterial(0);
  }
  attachEngine(engine){this.engine=engine;engine.setStyle('studioIntensity',LAB_MATERIALS[this.materialIndex].studioIntensity);}
  setMaterial(index){
    if(this.engine)this.studioIntensities.set(this.materialIndex,this.engine.options.studioIntensity);
    this.materialIndex=((index%LAB_MATERIALS.length)+LAB_MATERIALS.length)%LAB_MATERIALS.length;
    const profile=LAB_MATERIALS[this.materialIndex],type={iridescent:17,jade:18,anisotropic:19,metal:20,brushed:21,copper:22,chrome:23,ceramic:24,clay:25}[profile.kind];
    for(const s of this.splats){
      Object.assign(s,{material:profile.material,surfaceType:type,iridescent:profile.kind==='iridescent',jade:profile.kind==='jade',anisotropic:profile.kind==='anisotropic',
        roughness:profile.roughness,metalness:profile.metalness,sparkle:profile.sparkle});
      if(type)s.color=[.56,.58,.62];
    }
    this.engine?.setStyle('metalRoughness',profile.roughness);
    this.engine?.setStyle('studioIntensity',this.studioIntensities.get(this.materialIndex)??profile.studioIntensity);this.advance(0);
  }
  advance(dt) {
    this.time+=dt;
    this.rotation.setFromEuler(new Euler(.15*Math.sin(this.time*.3),this.time*.22,.12));
    for(let i=0;i<this.splats.length;i++) {
      const s=this.splats[i],r=this.rest[i];
      this.point.fromArray(r.center).sub(this.origin).applyQuaternion(this.rotation).add(this.origin).toArray(s.center);
      for(let k=0;k<3;k++)this.point.fromArray(r.axes[k]).applyQuaternion(this.rotation).toArray(s.axes[k]);
    }
  }
  writePacked(data,centers,start) {
    for(let i=0;i<this.splats.length;i++) {
      const s=this.splats[i],k=(start+i)*20;data.set(s.center,k);data[k+3]=s.opacity;
      for(let j=0;j<3;j++)data.set(s.axes[j],k+4+j*4);
      data.set(s.color,k+16);data[k+19]=splatMaterialSeed(s)??s.seed;centers.set(s.center,(start+i)*3);
      // The mark's place on the sculpture at rest anchors the material's patterns.
      const anchor=this.rest[i].center;data[k+7]=anchor[0];data[k+11]=anchor[1];data[k+15]=anchor[2];
    }
  }
  dispose(){this.engine=null;}
}

function createMaterials() {
  const f=field();f.floor();f.shell([0,.13,0],[1.75,.13,1.75],1200,'#17212b');
  return f.finish({loadActor:async()=>new MaterialSculpture(),actorLabel:'sculpture',splatMaterials:true,materialEnvironment:'/hdri/studio_small_09_1k.hdr'});
}
function createReflections() {
  const f=field(287);f.floor(5,-1.1,'#c0b590');
  const bed=f.splats.length;
  f.shell([-2,-.6,1],[.65,.35,.7],500,'#87b9af');
  for(let i=0;i<f.splats.length;i++)f.splats[i].wind=[0,0,0,16];
  f.torus([0,2.1,-.65],1.4,.32,'#e9b46c');
  f.shell([-2.6,1.1,-1.5],[.65,1.1,.65],900,'#729c87');
  f.shell([2.5,.8,-1],[.8,.8,.8],900,'#dbbf76');
  f.floor(5,0,'#2d637a',true);
  return f.finish({background:'#000000',reflection:{level:0,bounds:[-5,-5,5,5],blend:[.8,.18],minReflectance:.25,distortion:[.002,.002],waveAmplitude:.028},
    refraction:{clarity:.88,maxDepth:5,absorption:[.13,.05,.025]},dynamicWater:{amplitude:.025,speed:.7,flow:[.7,.25],contains:(x,z)=>x*x+z*z<25},
    forestCaustics:{scale:2,speed:.25,strength:1.1},labBedCount:bed});
}
function createAnimation() {
  const f=field(383);f.floor(4.5,0,'#a1ac96');
  f.shell([0,.18,0],[1.2,.18,1.2],600,'#6b837a');
  // A new test stage for the explicitly requested crow character.
  for(let y=1.1;y<3.3;y+=.1)for(let x=1.8;x<3.2;x+=.1)
    f.mark([x,y,-1.5],[0,0,1],.085,'#d69a70','cloth',{wind:[3.3,2.2,1,1]});
  for(let i=0;i<180;i++){
    const a=i/180*TAU,r=2.5,h=.18+.1*Math.sin(a*5);
    f.mark([Math.cos(a)*r,h,Math.sin(a)*r],[0,.3,1],.07,'#719e80','grass',{wind:[0,.45,a,2]});
  }
  for(let i=0;i<80;i++){
    const anchor=[(f.random()-.5)*7,.5+f.random()*3,(f.random()-.5)*6];
    f.mark(anchor,[0,0,1],.02,'#e9d19c','spore',{softParticle:true,opacity:.6,
      sporeMotion:{anchor,phase:i,rate:.4,amplitude:[.4,.3,.4]}});
  }
  return f.finish({spores:true,actorLabel:'crow',loadActor:loadLabCrow});
}
async function loadLabCrow(){
  const actor=await loadTenguCourier({count:24000,shadowCount:640,height:3.6});
  actor.demoClips=['Walk','Run','Fly','Wave','Idle'].filter(name=>actor.clipNames.includes(name));
  actor.demoCycle=true;actor.demoTime=0;actor.demoClip=actor.demoClips[0];
  actor.previewAnimation(actor.clipNames.indexOf(actor.demoClip));
  const advance=actor.advance.bind(actor);
  actor.advance=dt=>{
    actor.demoTime+=dt;
    if(actor.demoCycle){
      const next=actor.demoClips[Math.floor(actor.demoTime/4)%actor.demoClips.length];
      if(next!==actor.demoClip){actor.demoClip=next;actor.previewAnimation(actor.clipNames.indexOf(next));}
    }
    advance(dt);
    // A cool edge light keeps the dark feathers readable on the black stage.
    for(let i=0;i<actor.samples.length;i++){
      const s=actor.splats[i],n=s.axes[2],length=Math.hypot(...n);
      const rim=Math.max(0,(n[0]*.65+n[1]*.2-n[2]*.73)/length)**4;
      for(let k=0;k<3;k++)s.color[k]=Math.min(1,s.color[k]+rim*[.055,.13,.19][k]);
    }
  };
  actor.selectDemoClip=name=>{
    if(!actor.clipNames.includes(name))return;
    actor.demoClip=name;actor.demoCycle=false;actor.previewAnimation(actor.clipNames.indexOf(name));
  };
  return actor;
}

function createLighting(){
  const f=field(3001);
  // A finite receiver keeps the colored spill visible against the black stage.
  for(let z=-2.7;z<=3.1;z+=.11)for(let x=-2.3;x<=2.3;x+=.11){
    const s=f.mark([x,0,z],[0,1,0],.085,'#75736e');
    const contact=Math.exp(-((Math.hypot(x,z)-1.1)**2)/.2)*.24;
    s.color=s.color.map(v=>v*(1-contact));
  }
  f.torus([0,1.8,0],1.1,.37,'#e7e7d9');
  for(const side of [-1,1])for(let y=.05;y<3.5;y+=.13)for(let z=-2.5;z<1;z+=.13){
    const x=side*(2.25+.32*z),pigment=side<0?'#f78557':'#50d5e8';
    const s=f.mark([x,y,z],[-side,0,.32],.11,pigment,'stone',{bounceEmitter:true});
    s.color=hex(pigment).map(v=>v*(.82+.18*y/3.5));
  }
  for(let i=0;i<3;i++)f.shell([-1.1+i*1.1,.42,2],[.4,.42,.4],550,'#ede7d4');
  return f.finish({background:'#000000',lighting:bakeStudioBounce(f.splats)});
}
function createAtmosphere() {
  const f=field(888);f.floor(7,0,'#879d94');
  for(let i=0;i<7;i++)f.shell([(i%2?1:-1)*(1.5+i*.65),1+i*.35,-i*3],[.5,1+i*.35,.55],550,i%2?'#a4c2b6':'#879f9a');
  for(let i=0;i<6;i++)f.shell([-7+i*3,7+(i%2),-14-i],[2.6,.8,1.2],350,'#efe5ca','cloud',{wind:[i%2?1:-1,0,i*.7,4]});
  for(let i=0;i<200;i++) {
    const anchor=[(f.random()-.5)*12,.3+f.random()*4,-f.random()*18];
    f.mark(anchor,[0,0,1],.025,'#faf1d4','spore',{softParticle:true,opacity:.3,sporeMotion:{anchor,phase:i,rate:.15,amplitude:[.3,.4,.3]}});
  }
  return f.finish({background:'#000000',spores:true,atmosphere:{color:'#162332',horizonColor:'#263445',start:8,density:.045,max:.9,heightStart:5,heightDensity:.03}});
}
function createSeasons() {
  const f=field(494);f.garden();f.shell([1.4,.5,0],[1.1,.7,.85],1400,'#8e9890');
  const surfaceCount=f.splats.length;
  for(let i=0;i<600;i++)f.mark([(f.random()-.5)*9,f.random()*7,(f.random()-.5)*8],[0,0,1],.025,'#f2f5ef','snow',{softParticle:true,wind:[0,0,f.random(),15]});
  const seasonalSnow=new Uint8Array(f.splats.length*4);
  for(let i=0;i<surfaceCount;i++) {
    const s=f.splats[i],n=unit(s.axes[2]);
    seasonalSnow.set([Math.round(220*Math.max(0,n[1])),200,30,s.material==='grass'?255:0],i*4);
  }
  return f.finish({spores:true,seasonalSnow,causticClouds:{height:14,strength:.35},atmosphere:{color:'#17242e',start:10,density:.02,max:.6}});
}
function createLOD() {
  const f=field(901);f.floor(6,0,'#a3ad83');const groups=[];
  for(let i=0;i<5;i++) {
    const center=[(i%2?1:-1)*(1.8+i*.16),1,-i*2],start=f.splats.length;
    f.shell(center,[.9,1.1,.9],180,'#6f9b67','foliage');
    groups.push({id:i,start,count:180,center,radius:1.3,spacing:.14,levels:[{count:720},{count:1800}]});
  }
  const definition=f.finish();
  definition.lod={groups,baseCount:f.splats.length,maxActiveSplats:18000,draftMaxActiveSplats:10000,
    async load(group,level,signal) {
      if(signal.aborted)throw new DOMException('Aborted','AbortError');
      const detail=field(901+group.start),count=group.levels[level-1].count;
      detail.shell(group.center,[.9,1.1,.9],count,'#6f9b67','foliage');
      return {splats:detail.splats,parents:Uint32Array.from({length:count},(_,i)=>group.start+Math.min(group.count-1,Math.floor(i/count*group.count)))};
    }};
  return definition;
}

function createUnderwater(){
  const f=field(6201);f.floor(4.7,-.6,'#8ba6a3');
  for(const s of f.splats){s.reefRock=true;s.reefSeabed=true;}
  const glow=[];
  // A new arrangement of spiral luminous glass reeds; no coral assets.
  for(let reed=0;reed<5;reed++){
    const angle=reed/5*TAU,cx=Math.cos(angle)*2,cz=Math.sin(angle)*2;
    for(let i=0;i<900;i++){
      const t=i/900,a=t*TAU*3+reed,r=.2+.1*Math.sin(t*Math.PI);
      const p=[cx+Math.cos(a)*r,.05+t*3,cz+Math.sin(a)*r];
      f.mark(p,[Math.cos(a),.15,Math.sin(a)],.055,reed%2?'#71b8ae':'#ae91c5','light-reed',
        {reefGlow:reed%4,reefFlow:[t,0,0],wind:[0,3,reed,2]});
    }
    glow.push({center:[cx,1.3,cz],group:reed%4,radius:3,strength:1.2});
  }
  for(let i=0;i<220;i++){
    const anchor=[(f.random()-.5)*8,f.random()*4,(f.random()-.5)*8];
    f.mark(anchor,[0,0,1],.02,'#bde2d9','reef-particle',{softParticle:true,opacity:.4,
      sporeMotion:{anchor,phase:i,rate:.25,amplitude:[.35,.22,.25]}});
  }
  for(let ray=0;ray<4;ray++)for(let i=0;i<65;i++){
    const y=i/65*5;
    f.mark([-3+ray*1.8+y*.32,y,-2],[0,0,1],.18,'#b3e3d9','light-shaft',{reefRay:true,softParticle:true,opacity:.025});
  }
  const glowMap=Uint8Array.from({length:257**2},(_,i)=>Math.round(180+75*Math.sin((i%257)*.12)*Math.sin(Math.floor(i/257)*.1)));
  return f.finish({background:'#000000',spores:true,reefCaustics:{strength:1.25,surfaceY:5,glow:bakeReefGlow(glow),glowMap},
    atmosphere:{color:'#0b202c',start:6,density:.025,max:.7}});
}
function createThermal(){
  const f=field(8451);f.torus([0,2,0],1.35,.3,'#f87a49');f.torus([0,2,.1],.8,.18,'#ecba6c');
  for(const s of f.splats){
    const travel=Math.min(1,Math.hypot(s.center[0],s.center[1]-2)/1.8),heat=.2+.65*(1-travel*.75)+.1*Math.sin(s.center[1]*3);
    const u=Math.max(0,Math.min(6.999,heat*7)),band=Math.floor(u),blend=u-band;
    s.color=THERMAL_PALETTE[band].map((v,k)=>v*(1-blend)+THERMAL_PALETTE[band+1][k]*blend);
    s.thermal=[heat,travel,1];
  }
  const emissionStart=f.splats.length;f.shell([0,2,.25],[.36,.36,.36],800,'#fff4b4','emission');
  const starts=Array.from({length:25},(_,i)=>{const a=i/25*TAU;return [Math.cos(a),2+Math.sin(a),.05,.025];});
  const ends=starts.map(([x,y,z],i)=>[x*.7,2+(y-2)*.7,z+.06,.15+i%3*.05]);
  return f.finish({background:'#000000',canvasOnSubject:true,thermalMotion:true,
    thermalSkeleton:{dorsal:new Vector3(0,0,-1),starts,ends},emission:{start:emissionStart},
    lighting:{irradiance:new Float32Array(f.splats.length*3),shadow:new Float32Array(f.splats.length),stats:{bakeMs:0}}});
}
function createTransparency(){
  const f=field(1123);f.floor(4.6,0,'#a2aaa2');
  f.shell([0,1.6,0],[.48,.48,.48],900,'#f5d49a');
  for(let shell=0;shell<3;shell++){
    const radius=1+shell*.45,start=f.splats.length;
    f.shell([0,1.6,0],[radius,1.1+shell*.3,.7+shell*.25],1800,['#91c9d5','#b69bc9','#8ec4a3'][shell]);
    for(let i=start;i<f.splats.length;i++){const s=f.splats[i];s.opacity=.065;s.axes=s.axes.map((a,k)=>a.map(v=>v*(k===2?2:1)));}
  }
  return f.finish({background:'#000000'});
}
function createFractures(){
  const f=field(5017);f.floor(4.4,0,'#9ba69e');
  // A fresh spiral fault column, with real gaps and offset stone strata.
  for(let layer=0;layer<11;layer++){
    const h=.28,startY=.05+layer*.32,turn=layer*.13;
    for(let j=0;j<400;j++){
      const a=j/400*TAU,r=1.25+.14*Math.sin(a*5+turn),y=startY+f.random()*h;
      if(Math.abs(Math.sin(a*3+layer*.18))<.09)continue;
      const p=[Math.cos(a+turn)*r+.13*Math.sin(layer*.6),y,Math.sin(a+turn)*r];
      f.mark(p,[Math.cos(a+turn),.08,Math.sin(a+turn)],.07,layer%3===0?'#b9a789':'#7d9599','stone');
    }
    for(let j=0;j<200;j++){
      const a=f.random()*TAU,r=Math.sqrt(f.random())*1.3;
      f.mark([Math.cos(a+turn)*r+.13*Math.sin(layer*.6),startY+h,Math.sin(a+turn)*r],[0,1,0],.07,'#a3ada6');
    }
  }
  return f.finish({background:'#000000'});
}
function createNative(){
  const source=field(9441);
  for(let strand=0;strand<2;strand++)for(let i=0;i<2400;i++){
    const t=i/2400,a=t*TAU*3+strand*Math.PI,r=.9;
    source.mark([Math.cos(a)*r,.25+t*3.5,Math.sin(a)*r],[Math.cos(a),.1,Math.sin(a)],.055,strand?'#d7a975':'#75b6bd');
  }
  // Encode a new test asset in memory, then exercise the real native decoder.
  const buffer=new ArrayBuffer(source.splats.length*32),data=new DataView(buffer),bytes=new Uint8Array(buffer),q=new Quaternion(),axis=new Vector3(),forward=new Vector3(0,0,1);
  source.splats.forEach((s,i)=>{
    const k=i*32;for(let c=0;c<3;c++){data.setFloat32(k+c*4,s.center[c],true);data.setFloat32(k+12+c*4,Math.hypot(...s.axes[c]),true);bytes[k+24+c]=Math.round(s.color[c]*255);}
    bytes[k+27]=235;q.setFromUnitVectors(forward,axis.fromArray(s.axes[2]).normalize());
    [q.w,q.x,q.y,q.z].forEach((v,c)=>bytes[k+28+c]=Math.max(0,Math.min(255,Math.round(v*128+128))));
  });
  const f=field(425);f.floor(4.5);f.splats.push(...decodeNativeSplat(buffer,{height:3.5,flipYZ:false}));
  return f.finish();
}

function createDepthOfField(){
  const f=field(71031);
  f.torus([0,2,-3.5],1.32,.11,'#f1d196');
  const second=f.splats.length;f.torus([0,2,-3.5],1.02,.075,'#9bdde2');
  // A second ring tilts through the sharp subject plane.
  const rotation=new Quaternion().setFromEuler(new Euler(.6,.75,0)),point=new Vector3(),center=new Vector3(0,2,-3.5);
  for(let i=second;i<f.splats.length;i++){
    const s=f.splats[i];point.fromArray(s.center).sub(center).applyQuaternion(rotation).add(center).toArray(s.center);
    for(const axis of s.axes)point.fromArray(axis).applyQuaternion(rotation).toArray(axis);
  }
  f.shell([0,2,-3.5],[.3,.3,.3],450,'#e6e5d8');
  // Dense little surfaces become broad bokeh through the renderer's covariance
  // defocus, rather than baked blur textures or screen-space circles.
  for(const [x,y,z,r,color] of [
    [-1.2,2.7,6.8,.12,'#59dbe7'],[1.2,1.25,7,.10,'#f18f59'],[-.3,.8,6.3,.08,'#bd8ee2'],
    [-5,4,-23,.42,'#68dce9'],[5,1.2,-26,.45,'#e79d62'],[-3,.7,-29,.35,'#b58ee7'],[2.6,4.5,-32,.4,'#83ddd2'],
  ])f.shell([x,y,z],[r,r,r],100,color);
  for(let i=0;i<32;i++){
    const a=i/32*TAU,r=3.6+f.random()*2;
    f.shell([Math.cos(a)*r,2+Math.sin(a)*r*.65,-18-f.random()*18],[.06,.06,.06],18,i%2?'#78cbd7':'#e6b97d');
  }
  return f.finish({orbitMaxPolar:Math.PI*.8});
}
function createDiffraction(){
  const f=field(81423);
  f.torus([0,2,0],2.45,.045,'#f7f6ef');
  f.torus([0,2,0],1.35,.035,'#e9f1f6');
  f.shell([0,2,0],[.1,.1,.1],220,'#ffffff');
  for(let spoke=0;spoke<16;spoke++){
    const a=spoke/16*TAU;
    for(let j=0;j<45;j++){
      const r=1.6+j/45*1.8;
      f.mark([Math.cos(a)*r,2+Math.sin(a)*r,0],[0,0,1],.028,'#ffffff');
    }
    f.shell([Math.cos(a)*3.45,2+Math.sin(a)*3.45,0],[.075,.075,.075],55,'#ffffff');
  }
  return f.finish({orbitMaxPolar:Math.PI*.8});
}

function createDynamicFog(){
  const f=field(60718);f.floor(6.5,0,'#727f87');
  const rocks=[[-2.8,-.5,3.2,.35,2400],[2,-1.4,3.6,-.45,2600],[-.2,-4,4.1,.8,2800],[3.6,2,1.8,1.2,1500]];
  const point=new Vector3(),rotation=new Quaternion();
  for(const [i,[x,z,diameter,yaw,count]] of rocks.entries()){
    // Exactly the same fractured rock family used by the cliff's talus props.
    // Only these four props are reused; the fog set and composition are new.
    const template=buildRockSplats({count,variant:1+i}),scale=diameter/16;
    rotation.setFromEuler(new Euler(.37*Math.sin(i*2.13),yaw,.33*Math.cos(i*1.69),'YXZ'));
    const centers=template.map(s=>point.fromArray(s.center).applyQuaternion(rotation).multiplyScalar(scale).toArray());
    const bottom=Math.min(...centers.map(p=>p[1]));
    template.forEach((s,j)=>f.splats.push({...s,center:[centers[j][0]+x,centers[j][1]-bottom,centers[j][2]+z],
      axes:s.axes.map(a=>point.fromArray(a).applyQuaternion(rotation).multiplyScalar(scale).toArray())}));
  }
  const fogStart=f.splats.length;
  for(let row=0;row<17;row++)for(let col=0;col<23;col++)for(let layer=0;layer<2;layer++){
    const seed=f.random(),x=-5.4+(col+f.random())*.48,z=-5.5+(row+f.random())*.52,relative=.16+layer*.38+f.random()*.17;
    const radius=.46+f.random()*.36;
    f.splats.push({center:[x,.9*relative,z],axes:[[radius,0,0],[0,.24+seed*.17,0],[0,0,radius*.85]],
      color:[.59+seed*.08,.68+seed*.08,.78+seed*.08],opacity:.055+seed*.035,seed,material:'winter-fog',softParticle:true,
      wind:[0,relative,seed*TAU,5]});
  }
  const fogMap=new Uint8Array(513*513*4);
  for(let row=0;row<513;row++)for(let col=0;col<513;col++){
    const x=(col/512-.5)*118,z=(row/512-.5)*108;
    let mask=Math.exp(-((x/5.8)**2+((z+1)/5.4)**2));
    for(const [rx,rz,diameter] of rocks){const distance=Math.hypot((x-rx)/(diameter*.46),(z-rz)/(diameter*.38));mask*=Math.max(0,Math.min(1,(distance-.65)/.6));}
    const k=(row*513+col)*4;fogMap[k]=Math.round(mask*220);fogMap[k+1]=100;
  }
  const seasonalSnow=new Uint8Array(f.splats.length*4);
  // The fog's own semantic range activates the existing animated reservoir
  // shader. Stone records have zero snow depth, so no snow is added to them.
  for(let i=fogStart;i<f.splats.length;i++)seasonalSnow[i*4+3]=28;
  return f.finish({seasonalSnow,winterFog:fogMap,causticClouds:{height:14,strength:0},fogStart,interactiveFog:{bounds:[-6,-6,6,4],auto:true},
    lighting:{irradiance:new Float32Array(f.splats.length*3),shadow:new Float32Array(f.splats.length),stats:{bakeMs:0}}});
}
function createOcclusion(){
  const f=field(7403);
  const box=(center,half,color)=>{
    for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
      const u=(axis+1)%3,v=(axis+2)%3,n=[0,0,0];n[axis]=sign;
      for(let a=-half[u];a<=half[u]+.001;a+=.085)for(let b=-half[v];b<=half[v]+.001;b+=.085){
        const p=center.slice();p[axis]+=sign*half[axis];p[u]+=a;p[v]+=b;f.mark(p,n,.065,color);
      }
    }
  };
  for(let z=-2.2;z<=2.8;z+=.09)for(let x=-3.3;x<=3.3;x+=.09)f.mark([x,0,z],[0,1,0],.065,'#b7bab8');
  box([0,.175,-.25],[1.45,.175,1.05],'#e6e2d9');
  box([-1.75,1.6,-1.35],[.32,1.6,.32],'#dedbd4');
  box([1.75,1.6,-1.35],[.32,1.6,.32],'#dedbd4');
  box([0,3.05,-1.35],[1.75,.2,.32],'#e9e5dc');
  f.torus([0,1.6,-.25],.95,.3,'#e9e5dc',{segments:240,rings:36,size:.041});
  f.shell([-2.1,.5,1.25],[.5,.5,.5],2600,'#ddd9d0');
  box([-.75,.32,1.45],[.44,.32,.44],'#e3dfd7');
  // Broad unoccluded values: creases and contacts come from live SSAO, with
  // no baked contact shadows or irradiance masking the comparison.
  for(const s of f.splats)occlusionMark(s);
  return f.finish({loadActor:async()=>new OcclusionProbe(),actorLabel:'contact probe',lighting:{irradiance:new Float32Array(f.splats.length*3),shadow:new Float32Array(f.splats.length),stats:{bakeMs:0}}});
}
function occlusionMark(s){
  const a=s.axes[0],b=s.axes[1],angle=s.seed*TAU,c=Math.cos(angle),t=Math.sin(angle);
  const scale=.86+s.seed*.22;
  s.axes[0]=a.map((v,k)=>(v*c+b[k]*t)*scale*1.15);
  s.axes[1]=a.map((v,k)=>(-v*t+b[k]*c)*scale*.8);
  // Rotate in an orthonormal tangent frame, retaining full-rank Gaussians.
  const n=unit(s.axes[2]),u=unit(s.axes[0]),v=cross(n,u),length=Math.hypot(...s.axes[1]);
  s.axes[1]=v.map(x=>x*length);
  s.color=s.color.map(v=>Math.max(0,Math.min(1,(.22+v*.73)*(.94+s.seed*.12))));
}

class OcclusionProbe {
  constructor(){
    const f=field(7404);f.shell([1.9,.5,1.35],[.5,.5,.5],2800,'#e4e0d7');
    this.splats=f.splats;for(const s of this.splats)occlusionMark(s);
    this.rest=this.splats.map(s=>s.center[1]);this.root={position:new Vector3()};this.time=0;this.autoplay=true;this.activity='Lifting contact probe';this.advance(0);
  }
  advance(dt){this.time+=dt;const gap=.025+.6*(.5-.5*Math.cos(this.time*1.1));for(let i=0;i<this.splats.length;i++)this.splats[i].center[1]=this.rest[i]+gap;}
  writePacked(data,centers,start){for(let i=0;i<this.splats.length;i++){const s=this.splats[i],k=(start+i)*20;data.set(s.center,k);centers.set(s.center,(start+i)*3);}}
  dispose(){}
}

const scene=(id,label,description,features,create,extra={})=>({id:`lab-${id}`,label,title:label,description,
  caption:features.join(' · '),features,camera:{position:[4.2,3.1,9.5],target:[0,1.8,0],fov:38},
  initialStyle:{...BASE_STYLE},styleOnVisit:true,create,...extra});

export const featureLabScenes = [
  scene('materials','Material response','One sculptural sample cycles through nine surfaces. Compare roughness, pigment, and view-dependent highlights.',
    ['Studio HDRI','Nine materials','Thin-film shader','Anisotropic GGX','Jade transmission'],createMaterials,{materialCycle:true,initialMaterial:2,camera:{fitAspect:1,position:[.65,2.8,8.3],target:[0,2.05,0],fov:39}}),
  scene('reflections','Water & reflections','A mirrored sculpture above a shallow pool. Click the water to make ripples; switch off refraction to compare the submerged bed.',
    ['Planar reflection','Refraction','Fresnel','Caustics','Interactive ripples'],createReflections,{initialStyle:{...BASE_STYLE,mode:'gaussian'}}),
  scene('animation','Animated splats','The crow character performs walk, run, flight, and wave clips on a new test stage. Wind-driven cloth and drifting particles demonstrate GPU and CPU animation together.',
    ['Crow animation','Clip crossfade','GPU wind','Cloth','Particles','Partial uploads'],createAnimation,{camera:{position:[4.4,2.8,8],target:[0,1.8,0],fov:38}}),
  scene('lighting','Bounced light','Warm and cool reflectors spill color across an ivory ring, three neutral samples, and the receiving floor. Toggle color bleed or adjust the balance to compare each contribution.',
    ['Area bounce','Soft occlusion','Tone preservation'],createLighting,{bounceStudy:true,initialStyle:{...BASE_STYLE,bounceStrength:1.8,tonePreservation:.35,tintedShadows:false},camera:{fitAspect:1,position:[.7,3.7,11],target:[0,1.5,.2],fov:38}}),
  scene('atmosphere','Atmosphere & lens','Depth-layered columns disappear into height fog. A visible sun drives lens flare and dirt; click a column to set camera focus.',
    ['Height fog','Cloud drift','Optical sun','Lens flare','Lens dirt','Depth of field','Vignette'],createAtmosphere,
    {camera:{position:[.5,3.1,12],target:[0,3,-9],fov:48},initialStyle:{...BASE_STYLE,sun:true,sunAzimuth:9,sunElevation:10,sunSize:3,lensFlare:true,lensFlareStrength:.7,lensDirt:true,lensDirtStrength:.45,painterlyVignette:true,vignetteStrength:.35,foregroundDOF:true,dofStrength:.5}}),
  scene('lod','Adaptive detail','Five planted forms refine as they approach the camera. Zoom in and compare adaptive detail against the coarse source splats.',
    ['Screen-space LOD','Detail streaming','Crossfade','Culling','Radix sorting'],createLOD,{camera:{position:[6,4,11],target:[0,1,-3],fov:40}}),
  scene('seasons','Seasonal surfaces','The same garden moves through autumn, snowfall, winter, and thaw. Scrub the season to inspect snow coverage and the camera grade.',
    ['Snow accumulation','Snowfall','Seasonal pigment','Camera LUT','Thaw'],createSeasons),
  scene('reef','Underwater light','Five newly generated spiral light reeds glow through a shallow tank. Compare animated caustics, day/night light, shafts, and diffraction.',
    ['Caustic volume','Flow pulses','Bioluminescence','Diffraction','Light shafts','Spatial audio'],createUnderwater,
    {camera:{position:[6,3.4,10],target:[0,1.4,0],fov:43},initialStyle:{...BASE_STYLE,indirect:false,tintedShadows:false,lensDirt:true,lensDirtStrength:.45}}),
  scene('thermal','Thermal & emission','Concentric heat coils surround a luminous core. False-color waves travel through the surface; only the central source enters the emission capture.',
    ['Animated thermal pigment','False-color heat','Emission mask'],createThermal,
    {camera:{position:[.5,2.9,9],target:[0,2,0],fov:36},initialStyle:{...BASE_STYLE,indirect:false,tintedShadows:false,lensDirt:true,lensDirtStrength:.6}}),
  scene('transparency','Layered transparency','Three translucent ellipsoids surround an opaque core. Orbit to inspect sorted alpha compositing and the changing overlap of full-rank volumes.',
    ['Sorted transparency','Layered volumes','Alpha compositing'],createTransparency,
    {initialStyle:{...BASE_STYLE,mode:'gaussian',indirect:false,tintedShadows:false}}),
  scene('fracture','Fractured surfaces','Eleven offset stone strata form a new spiral fault column. The cuts are real gaps between surfaces; orbit to inspect their depth.',
    ['Procedural fracture geometry','Surface normals','Covariance projection'],createFractures),
  scene('native','Native Gaussians','A new double helix is encoded to the native .splat format in memory, then decoded by the engine. No captured or previously authored scene is loaded.',
    ['Native .splat decoding','Rotated covariance','Pixel filtering'],createNative,
    {initialStyle:{...BASE_STYLE,mode:'gaussian'}}),
  scene('dof','Depth of field','A sharp orbital sculpture sits between near lanterns and distant lights. Click a surface to focus, or pull focus manually in Controls.',
    ['Covariance defocus','Near and far bokeh','Click to focus','Smooth focus pulls'],createDepthOfField,
    {focusStudy:true,camera:{position:[0,2.3,10],target:[0,2,-3.5],fov:42},initialStyle:{...BASE_STYLE,foregroundDOF:true,autoFocus:false,focusDistance:13.5,dofStrength:.95,dofRange:.85,dofSwirl:.4,indirect:false,tintedShadows:false}}),
  scene('diffraction','Diffraction & fringe','White rings, fine spokes, and point lights reveal wavelength-dependent diffraction and red/blue edge separation. Toggle each effect independently in Controls.',
    ['Spectral diffraction','Red/blue fringe','Airy kernel','Lateral chromatic aberration'],createDiffraction,
    {opticsStudy:true,camera:{position:[.12,2.1,9.2],target:[0,2,0],fov:50},initialStyle:{...BASE_STYLE,indirect:false,tintedShadows:false,lensDiffraction:true,chromaticAberration:true,diffractionScale:2,fringeStrength:.9}}),
  scene('fog','Dynamic fog','The cliff’s fractured rock props stand in a new black stage. Low fog drifts and changes density through the gaps; adjust density and speed in Controls.',
    ['Dynamic reservoir fog','Advected density','Cliff rock props','GPU motion'],createDynamicFog,
    {fogStudy:true,prepare:loadRockFractures,camera:{position:[6,3.2,10],target:[0,1,-1.3],fov:44},initialStyle:{...BASE_STYLE,indirect:false,tintedShadows:false,fogDensity:1,fogSpeed:1.6}}),
  scene('ssao','Ambient occlusion','Ivory forms meet a stepped plinth and recessed frame. A lifting sphere reveals live contact shadows. Compare SSAO on/off or inspect the occlusion buffer in Controls.',
    ['Half-resolution SSAO','16 depth taps','Edge-aware smoothing','Live contact shadows'],createOcclusion,
    {ssaoStudy:true,splatBudget:28000,camera:{fitAspect:1.15,position:[4.7,4.1,9.5],target:[0,1.35,0],fov:42},initialStyle:{...BASE_STYLE,mode:'paint',brushScale:.85,coverage:.95,softness:.12,ssao:true,ssaoRadius:.65,ssaoStrength:1.15,indirect:false,tintedShadows:false}}),
];
