import {SplatReveal} from './SplatReveal.js';

export const REVEAL_END=10.5,ANIMALS_ENTER=10.8;
const timing={sky:.1,mountains:.5,clouds:1.4,lowClouds:1.8,hillsAndField:.4,pathGround:.4,
 pond:.9,highlandStrata:3,hillRocks:3.2,path:3.5,trees:4,bushes:4.6,forestFog:4.8,
 meadowRocks:5,propGroundDetail:.4,torii:5.6,toriiDecoration:6.6,treeMoss:5.4,mossGuardian:6,
 grassAndFlowers:6.7};
export function revealSchedule(definition,total){
 const starts=new Float32Array(total).fill(ANIMALS_ENTER);
 for(const [name,l]of Object.entries(definition.composition.layers)){
  for(let i=l.start;i<l.start+l.count;i++){
   const s=definition.splats[i],front=Math.max(0,Math.min(1,(s.center[2]+70)/115));
   // Coherent patches flow down the valley; fine seed variation leaves brush edges.
   const patch=.5+.5*Math.sin(s.center[0]*.24+Math.sin(s.center[2]*.21));
   const ground=['hillsAndField','pathGround','propGroundDetail'].includes(name);
   starts[i]=(timing[name]??4)+front*(name==='sky'||ground?.25:1.1)+patch*(ground?.35:.5)+s.seed*(ground?.15:.45);
  }
 }
 return starts;
}

export class SummerReveal extends SplatReveal{
 constructor(engine,definition){
  super(engine,revealSchedule(definition,engine.activeSplats.length),{end:ANIMALS_ENTER+1.3});
 }
}
