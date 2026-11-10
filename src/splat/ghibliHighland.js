/** Mirrored Howl hillside reference: meadow below, exposed stone on the right crest. */
import {pathX,pathWidth} from './ghibliPath.js';
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const hex=h=>h.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
export function highlandRockiness(x,z,y){
 const altitude=smooth(7.5,14.5,y),region=smooth(16,40,x)*smooth(-28,-52,z);
 const strata=.5+.24*Math.sin(x*.29+z*.17+Math.sin(z*.13)*2)+.19*Math.sin(x*.73-z*.31)+.10*Math.cos(x*1.37+z*.86);
 return altitude*region*smooth(.28,.69,strata);
}
export function highlandColor(color,x,z,y){
 const rock=highlandRockiness(x,z,y),lit=.5+.23*Math.sin(x*.29+z*.17);
 return mix(color,mix(hex('#728582'),hex('#b4b9a4'),lit),rock*.88);
}
export function buildHighlandStrata({mark,rnd,height,normal,colorAt}){
 let count=0;
 for(let i=0;i<1250;i++){
  const x=28+rnd()*61,z=-83+rnd()*43,y=height(x,z),rock=highlandRockiness(x,z,y);
  if(rock<.37||Math.abs(x-pathX(z))<pathWidth(z)+.6)continue;
  const color=highlandColor(colorAt(x,z),x,z,y);
  mark([x,y+.035,z],normal(x,z),[.91,.08,-.4],.13+rnd()*.15,.35+rnd()*.7,.035,color,'stone');count++;
 }
 return {count,reference:'howl-rocky-altitude.png',referenceOrientation:'mirrored horizontally'};
}
