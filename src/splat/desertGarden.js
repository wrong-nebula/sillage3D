import * as THREE from 'three';
import {generateLandGenome,buildLandGeometry,landRandom,LAND_FLORA_SPECIES} from './moebius/land-flora-genome.js';
import {landSuitability} from './moebius/land-flora-ecology.js';
import {buildDesertRosetteGeometry} from './desertRosetteGeometry.js';
import {sampleRosetteSplats} from './rosetteSplats.js';

const clamp=THREE.MathUtils.clamp,mix=THREE.MathUtils.lerp;
const LIGHT=new THREE.Vector3(-.77,.53,.35).normalize();
const PALETTE={lit:[.90,.70,.46],shade:[.57,.39,.31],fog:[.82,.70,.57]};
export const DESERT_SPECIES=['jade-candelabra','ochre-water-bottle','coral-dune-rosette','amber-needlegrass','copper-wind-fan','salt-pillow'];
let terrain;
export function decodeDesertTerrain(buffer){
  if(buffer.byteLength!==513*513*2)throw new Error('Invalid LibreTerrain dune heightfield.');
  const view=new DataView(buffer),heights=new Float32Array(513*513);
  for(let i=0;i<heights.length;i++)heights[i]=view.getUint16(i*2,true)*16/65535;
  function height(x,z){
    const u=clamp((x/144+.5)*512,0,512),v=clamp(((z+12)/144+.5)*512,0,512);
    const ix=Math.min(511,Math.floor(u)),iz=Math.min(511,Math.floor(v)),i=iz*513+ix;
    return mix(mix(heights[i],heights[i+1],u-ix),mix(heights[i+513],heights[i+514],u-ix),v-iz);
  }
  function normal(x,z){return new THREE.Vector3(-(height(x+.12,z)-height(x-.12,z))/.24,1,-(height(x,z+.12)-height(x,z-.12))/.24).normalize();}
  return {height,normal,heights};
}
export async function loadDesertTerrain(fetcher=globalThis.fetch){
  if(terrain)return;
  const response=await fetcher(`${import.meta.env?.BASE_URL??'/'}desert-garden/dunes.u16`);
  if(!response.ok)throw new Error('Could not load the LibreTerrain dunes.');
  terrain=decodeDesertTerrain(await response.arrayBuffer());
}

/** Terrain-derived shelter/moisture are procedural proxies, not solved water. */
export function desertHabitat(bed,x,z){
  const h=bed.height(x,z),n=bed.normal(x,z),slope=Math.acos(clamp(n.y,-1,1));
  const shelter=clamp((bed.height(x-4,z-2)-h+.5)/4,0,1);
  const pocket=clamp(1-h/7.5,0,1);
  return {temperature:32,moisture:.08+.21*pocket+.06*shelter,pH:7.6,soilDepth:.18+.85*pocket,
    dailyPAR:.86,wind:.84-.52*shelter,slope,salinity:.18,metals:.12,nitrogen:.17,phosphorus:.14,
    bedrock:'sandstone',waterDistance:180,altitude:120,pressureBar:1,oxygenPartialBar:.21,co2Fraction:.00042,
    submerged:false,habitable:true,liquidWater:true,minerals:{silica:.8,iron:.3,carbonate:.2},shelter,pocket};
}

function mark(splats,p,n,direction,length,width,depth,color,seed,extra={}){
  const tangent=new THREE.Vector3(...direction).addScaledVector(n,-new THREE.Vector3(...direction).dot(n)).normalize();
  if(tangent.lengthSq()<.01)tangent.crossVectors(n,new THREE.Vector3(0,0,1)).normalize();
  const across=new THREE.Vector3().crossVectors(n,tangent).normalize();
  splats.push({center:p,axes:[tangent.multiplyScalar(length).toArray(),across.multiplyScalar(width).toArray(),n.clone().multiplyScalar(depth).toArray()],color,seed,opacity:.98,material:'stone',...extra});
}

function paintDunes(splats,bed,rnd){
  // Nested sampling density: close-up grains and continuous distant dune faces.
  for(const [spacing,minX,maxX,minZ,maxZ,inside]of[
    [.72,-72,72,-84,60,false],[.24,-27,27,-21,24,true],[.10,-12,17,-9,15,true],
  ])for(let z=minZ;z<maxZ;z+=spacing)for(let x=minX;x<maxX;x+=spacing){
    if(!inside&&x>-27&&x<27&&z>-21&&z<24)continue;
    if(spacing===.24&&x>-12&&x<17&&z>-9&&z<15)continue;
    const px=x+(rnd()-.5)*spacing*.72,pz=z+(rnd()-.5)*spacing*.72,h=bed.height(px,pz),n=bed.normal(px,pz);
    const light=clamp(n.dot(LIGHT)*.84+.18,0,1);
    const ripple=Math.sin(px*7.8+pz*2.3+.7*Math.sin(pz*1.4))*.018;
    const grit=(rnd()-.5)*.045;
    const distant=clamp((Math.hypot(px,pz+3)-24)/100,0,.6);
    const color=PALETTE.lit.map((v,c)=>mix(mix(PALETTE.shade[c],v,light)+ripple+grit,PALETTE.fog[c],distant));
    mark(splats,[px,h,pz],n,[.94,0,.34],spacing*.76,spacing*.67,spacing*.075,color,rnd());
  }
  // Stationary mica-like grains distributed on the true surface, not the fog.
  for(let i=0;i<3300;i++){
    const x=-17+rnd()*39,z=-14+rnd()*37,n=bed.normal(x,z);
    if(n.dot(LIGHT)<.12)continue;
    const s=.006+rnd()**3*.021;
    mark(splats,[x,bed.height(x,z)+.017,z],n,[1,0,.2],s,s*.7,s*.55,[1,.92,.73],rnd(),{opacity:.8,softParticle:true,wind:[.04,.45,0,6],material:'sand-glitter'});
  }
}

function samplePlant(splats,genome,anchor,yaw,scale,count,rnd,birth){
  if(genome.morphology==='rosette'){
    const result=sampleRosetteSplats({genome,anchor,yaw,scale,count,rnd});
    for(const s of result.splats){s.wind[2]=birth;splats.push(s);}
    return {stage:genome.phase,height:genome.height*scale,anatomy:result.stats};
  }
  const geometry=genome.morphology==='rosette'?buildDesertRosetteGeometry(genome):buildLandGeometry(THREE,genome,'near');
  const position=geometry.getAttribute('position'),pigment=geometry.getAttribute('color'),normals=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv'),flora=geometry.getAttribute('aFlora');
  const indices=geometry.index.array,areas=[],triangles=[];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
  let total=0;
  for(let i=0;i<indices.length;i+=3){
    a.fromBufferAttribute(position,indices[i]);b.fromBufferAttribute(position,indices[i+1]);c.fromBufferAttribute(position,indices[i+2]);
    const area=ab.subVectors(b,a).cross(ac.subVectors(c,a)).length()*.5;
    if(area<1e-10)continue;total+=area;areas.push(total);triangles.push(i);
  }
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
  const footprint=clamp(Math.sqrt(total/count)*.79,.0015,.095)*scale;
  const light=LIGHT.clone().applyQuaternion(q.clone().invert());
  for(let j=0;j<count;j++){
    const pick=rnd()*total;let lo=0,hi=areas.length-1;
    while(lo<hi){const mid=(lo+hi)>>>1;if(areas[mid]<pick)lo=mid+1;else hi=mid;}
    const i=triangles[lo],ids=[indices[i],indices[i+1],indices[i+2]],r=Math.sqrt(rnd()),s=rnd(),w=[1-r,r*(1-s),r*s];
    a.fromBufferAttribute(position,ids[0]);b.fromBufferAttribute(position,ids[1]);c.fromBufferAttribute(position,ids[2]);
    const n=new THREE.Vector3();
    for(let k=0;k<3;k++)n.addScaledVector(new THREE.Vector3().fromBufferAttribute(normals,ids[k]),w[k]);
    n.normalize();
    // Leaves have two sides: soft transmitted light keeps their silhouettes legible.
    const lit=.64+.44*Math.abs(n.dot(light));
    const local=new THREE.Vector3(),color=[0,0,0];
    for(let k=0;k<3;k++){
      local.addScaledVector(new THREE.Vector3().fromBufferAttribute(position,ids[k]),w[k]);
      for(let ch=0;ch<3;ch++)color[ch]+=pigment.array[ids[k]*3+ch]*w[k]*lit;
    }
    // Clean anatomical surface: directional venation and a raised central rib.
    // No sand, dust deposits, glitter, or grain layer is applied to the plant.
    let u=0,v=0,tissue=0;
    for(let k=0;k<3;k++){u+=uv.getX(ids[k])*w[k];v+=uv.getY(ids[k])*w[k];tissue+=flora.getY(ids[k])*w[k];}
    const branchVein=Math.exp(-Math.abs(Math.sin((u-.5)*59+v*17)) * 22);
    const midrib=Math.exp(-Math.abs(u-.5)*190);
    const edge=Math.max(0,1-Math.min(u,1-u)*95);
    const relief=(midrib*.003+branchVein*.0008)*scale;
    local.addScaledVector(n,relief/scale);
    for(let c=0;c<3;c++){
      color[c]*=1-.09*branchVein-.07*midrib;
      color[c]+=edge*[.038,.023,.012][c];
      color[c]=clamp(color[c],0,1);
    }
    const p=local.clone().multiplyScalar(scale).applyQuaternion(q).add(new THREE.Vector3(...anchor));
    const normal=n.applyQuaternion(q),tangent=b.sub(a).applyQuaternion(q).normalize();
    mark(splats,p.toArray(),normal,tangent.toArray(),footprint*1.1,footprint,.00065*scale,color,rnd(),{
      material:'foliage',desertPlant:[...anchor,genome.height*scale],
      wind:[anchor[1],genome.height*scale,birth,16],
    });
  }
  geometry.dispose();return {triangles:indices.length/3,stage:genome.phase,height:genome.height*scale};
}

export function createDesertGarden(bed=terrain){
  if(!bed)throw new Error('Load the LibreTerrain dunes before building the garden.');
  const rnd=landRandom(73193,'desert-splats'),splats=[],plants=[];
  paintDunes(splats,bed,rnd);
  // A single inspected specimen; keep the surrounding dunes completely bare.
  const species='coral-dune-rosette',x=0,z=0,scale=2.1,seed=73579;
  const habitat=desertHabitat(bed,x,z),fitness=landSuitability(LAND_FLORA_SPECIES[species],habitat);
  const genome=generateLandGenome(species,seed,{...habitat,age:1,vigor:1,rootMode:'buried'});
  const anchor=[x,bed.height(x,z)-.025,z],birth=-20;
  const info=samplePlant(splats,genome,anchor,.45,scale,105000,landRandom(seed,'surface'),birth);
  plants.push({species,seed,age:1,anchor,fitness,habitat,scale,birth,...info});
  // A soft contact shadow sits on the actual dune beneath the crown.
  for(let i=0;i<1600;i++){
    const a=rnd()*Math.PI*2,r=Math.sqrt(rnd())*genome.width*scale*.5;
    const px=Math.cos(a)*r,pz=Math.sin(a)*r,n=bed.normal(px,pz);
    mark(splats,[px,bed.height(px,pz)+.009,pz],n,[1,0,.1],.055,.045,.005,[.31,.23,.22],rnd(),{opacity:.035*(1-r/(genome.width*scale*.5))});
  }
  // Advected, terrain-following saltation and low elongated dust sheets.
  for(let i=0;i<1380;i++){
    const fog=i<150,x=-33+rnd()*65,z=-35+rnd()*62,above=fog?.12+rnd()*.65:.025+rnd()**3*.55;
    const size=fog?1.2+rnd()*2.5:.007+rnd()*.014;
    mark(splats,[x,bed.height(x,z)+above,z],new THREE.Vector3(0,1,0),[.94,0,.34],fog?size*2.6:size*4,fog?size*.44:size,size*.18,[.93,.78,.58],rnd(),{
      opacity:fog?.035+rnd()*.035:.35+rnd()*.3,softParticle:true,
      wind:[above,fog?.32+rnd()*.4:1.1+rnd()*1.8,rnd(),fog?17:18],material:fog?'sandy-fog':'drifting-sand',
    });
  }
  const indices=[];splats.forEach((s,i)=>{if(s.wind)indices.push(i);});
  const counts=Object.fromEntries(DESERT_SPECIES.map(id=>[id,plants.filter(p=>p.species===id).length]));
  return {splats,background:'#d9c4a5',orbitMin:3,orbitLimit:60,orbitMinY:.2,orbitMaxPolar:Math.PI*.49,
    atmosphere:{color:'#d5b58e',horizonColor:'#e5cba7',start:7,density:.018,max:.52},
    shoreGlitter:true,animation:{indices},desert:{heights:bed.heights,stats:{plants,counts,source:'Moebius RPG terrestrial flora',terrain:'LibreTerrain 2026.2.0',growth:'rooted shoot extension and crown opening; sampled genome stages; authored allometry'}},
    lighting:{irradiance:new Float32Array(splats.length*3),shadow:new Float32Array(splats.length),stats:{}},
  };
}

export const desertGardenScene={
  splatBudget:270000,
  id:'desert-garden',label:'Dune rosette',title:'A life in the dunes',caption:'One Moebius plant · macro study',
  description:'One coral dune rosette, growing in glittering wind-swept sand. Drag to orbit; G replays growth.',
  swatch:'desert-garden',camera:{position:[3.3,3.5,6.3],target:[0,1.65,0],fov:38,focalLength:33},
  styleOnVisit:true,isolatedStyle:true,
  initialStyle:{quality:'studio',mode:'gaussian',brushScale:1,coverage:1.18,softness:.13,indirect:false,tintedShadows:false,
    sun:false,lensDirt:false,lensFlare:false,painterlyVignette:false,foregroundDOF:false},
  prepare:loadDesertTerrain,create:createDesertGarden,
};
