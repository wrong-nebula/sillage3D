import {upperWaterContains,lowerReachContains} from './ForestWaterfalls.js';
import {FOREST_LANDSCAPE_BOUNDS,forestLandscapeOpacity,forestLandscapeSample as sample} from './ForestLandscape.js';
const hex=s=>s.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255);
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
export function addDeepPool({mark,layer,random:rnd}){
  layer('deepPool',()=>{
    const [x0,z0,x1,z1]=FOREST_LANDSCAPE_BOUNDS;
    for(let x=x0;x<x1;x+=.72)for(let z=z0;z<125;z+=.76){
      const px=x+rnd()*.12,pz=z+rnd()*.12,upper=upperWaterContains(px,pz);
      if(!upper&&!lowerReachContains(px,pz))continue;
      if(forestLandscapeOpacity(px,pz)<.002)continue;
      const depth=(upper?12.6:0)-sample(px,pz),shallow=upper?Math.max(0,1-depth/2.2):sample(px,pz,15);
      const pockets=.10+shallow*.30+.07*Math.sin(px*.087+pz*.037)*Math.cos(pz*.13-px*.023);
      const c=upper?mix(hex('#4d7c9d'),hex('#a5c5de'),.20+shallow*.36):mix(hex('#07182e'),hex('#2c648c'),pockets);
      mark([px,upper?12.6:0,pz],[0,1,0],[1,0,0],.56,.58,.006,c,{material:'water',wind:[0,1,0,3]});
    }
  });
  layer('deepPoolGlints',()=>{
    for(let i=0;i<2600;i++){
      const x=-128+rnd()*120,z=-40+rnd()*155,upper=upperWaterContains(x,z);
      if(!upper&&!lowerReachContains(x,z))continue;
      const size=.028+rnd()**2*.035;
      const direction=sample(x,z,12)*Math.PI*2;
      mark([x,(upper?12.6:0)+.08,z],[0,1,0],[Math.cos(direction),0,Math.sin(direction)],size*(1.2+sample(x,z,13)*.4),size,.012,'#d8deee',
        {material:'water',opacity:.52+rnd()*.24,wind:[.12,.20+rnd()*.12,1,6]});
    }
  });
}
