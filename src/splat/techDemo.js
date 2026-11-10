import {AnimatedGLBSplats} from './AnimatedGLBSplats.js';
import {decodeNativeSplat} from './nativeSplat.js';

export function pollinatorPose(time,kind){
  const speed=kind==='bee'?.24:.17,t=time*speed;
  return {position:[Math.sin(t)*.72,1.8+Math.sin(t*2+.4)*.17,Math.sin(t*2)*.48],yaw:.35+Math.sin(t)*.65,roll:Math.sin(t*2)*.075};
}
export async function loadPollinator(kind){
  const actor=await AnimatedGLBSplats.load(`/cc0-demo/${kind}.glb`,{count:kind==='bee'?6500:10000,span:kind==='bee'?1.25:2.1,seed:kind==='bee'?883:153,clip:0});
  actor.time=0;actor.activity=kind==='bee'?'Bee in flight':'Butterfly in flight';
  actor.advance=dt=>{
    actor.time+=dt;const pose=pollinatorPose(actor.time,kind);
    actor.root.position.fromArray(pose.position);actor.root.rotation.set(0,pose.yaw,pose.roll);
    actor.update(dt*(kind==='bee'?1.2:.65));
  };
  actor.advance(0);return actor;
}
let nativePlant,pendingPlant;
export async function prepareNativePlant(fetcher=globalThis.fetch){
  if(nativePlant)return;
  if(!pendingPlant)pendingPlant=(async()=>{
    const response=await fetcher('/cc0-demo/potted-plant.splat');if(!response.ok)throw new Error(`Could not load the CC0 plant (${response.status}).`);
    nativePlant=decodeNativeSplat(await response.arrayBuffer(),{height:3.5,flipYZ:true});
  })().finally(()=>{pendingPlant=null;});
  await pendingPlant;
}
function createNativeStudy(){
  if(!nativePlant)throw new Error('Prepare the CC0 plant before opening its study.');
  const splats=nativePlant.slice();
  // A quiet, original tabletop keeps the trained plant's silhouette readable.
  for(let z=-7;z<=7;z+=.15)for(let x=-7;x<=7;x+=.15){
    const seed=((Math.imul(Math.round((x+8)*100)+Math.round((z+8)*100)*193,1664525)>>>0)/2**32);
    const v=.78+.035*Math.sin(x*2.8+z*.4)+seed*.035;
    splats.push({center:[x,-.045,z],axes:[[.14,0,0],[0,0,.12],[0,.012,0]],color:[v,v*.97,v*.87],opacity:.98,seed,material:'stone'});
  }
  return {splats,background:'#b9c8bd',orbitLimit:25,lighting:{irradiance:new Float32Array(splats.length*3),shadow:new Float32Array(splats.length),stats:{nativeSplats:nativePlant.length,bakeMs:0}}};
}
const baseStyle={quality:'studio',mode:'ghibli',brushScale:1,coverage:1,softness:.25,indirect:false,tintedShadows:false,sun:false,lensDirt:false,lensFlare:false,painterlyVignette:false,foregroundDOF:true,autoFocus:true,dofStrength:.35,dofRange:.65};
export function createTechDemoScenes(){
  return [
    ...['bee','butterfly'].map(kind=>({
      // Keep the existing URLs and keyboard positions when isolating the subjects.
      id:`${kind}-garden`,label:kind==='bee'?'Bee':'Butterfly',title:kind==='bee'?'Bee in flight':'Butterfly in flight',
      description:kind==='bee'?'An isolated CC0 bee, animated entirely as splats.':'An isolated CC0 butterfly, with textured wings carried by animated splats.',
      caption:'CC0 · isolated animation',camera:{position:kind==='bee'?[1.15,2.7,3.6]:[1.35,3.25,4.4],target:[0,2.15,0],fov:40},splatBudget:kind==='bee'?6500:10000,styleOnVisit:true,initialStyle:{...baseStyle,foregroundDOF:false},
      create:()=>({splats:[],background:'#c8cdc8',orbitLimit:15,actorLabel:kind,loadActor:()=>loadPollinator(kind)}),
    })),
    {id:'botanical-splat',label:'Botanical splat',title:'A succulent, repainted',description:'51,278 native CC0 Gaussians. Explore the trained plant in each rendering method.',caption:'CC0 · native Gaussian study',
      camera:{position:[4.4,2.8,5.7],target:[0,1.75,0],fov:39},splatBudget:70000,styleOnVisit:true,initialStyle:{...baseStyle,mode:'gaussian',foregroundDOF:false},prepare:prepareNativePlant,create:createNativeStudy},
  ];
}
