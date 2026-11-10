import {forestLandscapeSample as sample,forestLandscapeHeight,forestLandscapeOpacity,forestDryShoreDistance} from './ForestLandscape.js';
import {forestBankSample} from './ForestBankDetails.js';
const clamp=x=>Math.max(0,Math.min(1,x));
const hash=(x,z)=>{const f=Math.sin(x*127.1+z*311.7)*43758.5453;return f-Math.floor(f);};
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

/** Deposited sand rests on the baked ground. A broad lee tail merges each pile
 * into that same surface; wet cells and the scoured channels remain clear. */
export function createForestSediment(instances=[]){
  const candidates=[],piles=[],buckets=new Map();
  for(let z=12;z<127;z+=2.4)for(let x=-128;x<1;x+=2.4){
    const px=x+(hash(x,z)-.5)*1.7,pz=z+(hash(z,x)-.5)*1.7;
    if(sample(px,pz,6)!==0||forestLandscapeOpacity(px,pz)<.45)continue;
    const y=forestLandscapeHeight(px,pz),exposure=sample(px,pz,8);
    if(!((y>12.72&&y<14.5)||(y>.3&&y<2.3))||exposure>.30||forestDryShoreDistance(px,pz)>5.2)continue;
    if(instances.some(p=>Math.hypot(px-p.position[0],pz-p.position[2])<(p.radius??2)*.82+1.3))continue;
    const deposition=sample(px,pz,3),debris=sample(px,pz,9),curvature=sample(px,pz,1);
    candidates.push({x:px,z:pz,y,score:deposition*8+debris*2+Math.max(0,.5-curvature)*.6+hash(px,pz)*.12});
  }
  for(const p of candidates.sort((a,b)=>b.score-a.score)){
    if(piles.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<7.2))continue;
    const seed=hash(p.x+31,p.z),angle=sample(p.x,p.z,12)*Math.PI*2;
    const broad=piles.length%5===0;
    const pile={...p,height:(broad?.85:.48)+seed*(broad?1.05:.86),long:(broad?5.2:3.2)+hash(p.z,p.x)*2.4,short:(broad?2.5:1.45)+seed*1.15,angle,seed};
    piles.push(pile);if(piles.length===28)break;
  }
  for(const p of piles){
    const reach=p.long*2.5;
    for(let j=Math.floor((p.z-reach)/16);j<=Math.floor((p.z+reach)/16);j++)for(let i=Math.floor((p.x-reach)/16);i<=Math.floor((p.x+reach)/16);i++){
      const key=i+j*64;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);
    }
  }
  function height(x,z){
    const nearby=buckets.get(Math.floor(x/16)+Math.floor(z/16)*64);if(!nearby)return 0;
    let accumulation=0;
    for(const p of nearby){
      const dx=x-p.x,dz=z-p.z,cs=Math.cos(p.angle),sn=Math.sin(p.angle);
      const along=(dx*cs+dz*sn)/p.long,across=(-dx*sn+dz*cs)/p.short;
      const radius=Math.hypot(across,along*(along<0?1.25:.77));
      if(radius>2.4)continue;
      accumulation+=p.height*Math.exp(-1.65*radius*radius)*(1-smooth(1.65,2.4,radius));
    }
    if(accumulation<.001||sample(x,z,6)!==0)return 0;
    const base=forestLandscapeHeight(x,z),level=base>9?12.6:0;
    const shore=smooth(.035,.65,base-level);
    return accumulation*shore*(.98+.06*(forestBankSample(x,z)-.35));
  }
  return {piles,height};
}
