import {shoreline} from './DynamicWater.js';
import {openingLandDistance} from './ForestTerrain.js';
import {loadRockFractures,buildRockSplats} from './rockFracture.js';
import {paintReefSandGlitter} from './reefSeabed.js';

const SIDE=513,clamp=x=>Math.max(0,Math.min(1,x));
let relief;
export async function loadForestBankDetails(fetcher=globalThis.fetch){
  if(relief)return;
  const [response]=await Promise.all([fetcher('/blue-forest/bank-relief.f32'),loadRockFractures(fetcher)]);
  if(!response.ok)throw new Error('Could not load the LibreTerrain forest banks.');
  const data=new Float32Array(await response.arrayBuffer());
  if(data.length!==SIDE*SIDE*4||!data.every(Number.isFinite))throw new Error('Invalid forest bank relief.');
  relief=data;
}
// Mirror the small eroded atlas at its borders, retaining metres and continuity.
export function forestBankSample(x,z,channel=0){
  if(!relief)return channel===0?.35:.5;
  const mirrored=(v,span)=>{const t=((v/span+.5)%2+2)%2;return (t>1?2-t:t)*(SIDE-1);};
  const u=mirrored(x,32),v=mirrored(z,24),i=Math.min(SIDE-2,Math.floor(u)),j=Math.min(SIDE-2,Math.floor(v));
  const at=(a,b)=>relief[(b*SIDE+a)*4+channel],a=u-i,b=v-j;
  return (at(i,j)*(1-a)+at(i+1,j)*a)*(1-b)+(at(i,j+1)*(1-a)+at(i+1,j+1)*a)*b;
}
export function openingSandHeight(x,z,boundary=openingLandDistance(x,z)){
  const edge=shoreline(x)-z;
  return .15+.28*clamp(edge/3)-.6*(1-clamp(boundary/5))
    +.48*(forestBankSample(x,edge*1.7)-.35)*clamp(edge/.8);
}
export function forestSandMask(x,z){
  const edge=shoreline(x)-z;
  if(edge<.20||edge>5.4||openingLandDistance(x,z)<1)return 1;
  const phase=(edge-.18*Math.sin(x*.61)-.08*Math.sin(x*1.53))/.88;
  const crest=Math.pow(.5+.5*Math.cos(phase*Math.PI*2),4);
  // The wave bands affect only the density of stationary sand grains.
  return .23-.18*crest-.035*clamp((forestBankSample(x,edge*1.7,2)-.4)*5);
}
export function paintForestSandGlitter(splats,obstacles,height=openingSandHeight){
  const bed={height,sample:forestSandMask};
  const shadow=(x,z)=>obstacles.some(([ox,oz,r])=>Math.hypot(x-ox,z-oz)<r)?1:0;
  for(let x=-32;x<=32;x+=8){
    paintReefSandGlitter(splats,bed,shadow,{count:1500,radius:5.2,center:[x,shoreline(x)-2.6],sizeScale:5});
  }
}

/** Windward banks and a longer lee tail merge into the sand around each foot.
 * The sampled root outline keeps these from becoming circular pedestals. */
export function createPillarSandField(pillars,dryMask){
  return (x,z)=>{
    const shore=dryMask?dryMask(x,z):clamp((shoreline(x)-z)/2),land=dryMask?1:clamp(openingLandDistance(x,z)/3);
    if(shore===0||land===0)return 0;
    let height=0;
    for(const p of pillars){
      const dx=x-p.x,dz=z-p.z,r=Math.hypot(dx,dz);
      if(r>p.radius+10)continue;
      const angle=(Math.atan2(dz,dx)-p.yaw+Math.PI*4)%(Math.PI*2);
      const u=angle/(Math.PI*2)*p.outline.length,i=Math.floor(u),f=u-i;
      const root=p.outline[i]*(1-f)+p.outline[(i+1)%p.outline.length]*f;
      const edge=Math.max(0,r-root*.88),direction=r>0?(dx*.8+dz*.6)/r:0;
      const lee=Math.max(0,direction),windward=Math.max(0,-direction);
      const reach=1.15+p.radius*.14+lee*3.8;
      const bank=Math.min(2.0,.65+p.radius*.15)*(.72+.33*windward+.12*Math.sin(angle*3+.6));
      const drift=bank*Math.exp(-Math.pow(edge/reach,1.65));
      height=Math.max(height,drift);
    }
    return height*shore*land;
  };
}

/** Closed, faceted rocks use the same triplanar LibreTerrain fractures as Cliff. */
export function paintForestRocks(splats,placements){
  const templates=new Map();
  for(let i=0;i<placements.length;i++){
    const {x,y,z,size,yaw=i*2.39996323,samples=160}=placements[i],variant=i%7,key=`${variant}:${samples}`;
    if(!templates.has(key))templates.set(key,buildRockSplats({count:samples,variant}));
    const source=templates.get(key),scale=size/16,cs=Math.cos(yaw),sn=Math.sin(yaw);
    const base=Math.min(...source.map(s=>s.center[1]));
    const rotate=a=>[cs*a[0]+sn*a[2],a[1],-sn*a[0]+cs*a[2]];
    for(const s of source){
      const p=rotate(s.center.map(v=>v*scale)),tone=s.color.reduce((a,b)=>a+b,0)/3;
      splats.push({...s,center:[x+p[0],y+p[1]-base*scale-size*.12,z+p[2]],
        axes:s.axes.map(a=>rotate(a.map(v=>v*scale))),
        color:[tone*.78,tone*1.04,tone*1.28+.025],material:'forest-fractured-stone'});
    }
  }
}

/** Sparse volumetric columns, aligned from ceiling apertures to the ground. */
export function paintForestCeilingRays(splats,beams){
  for(const {from,to,width=.34,strength=.055}of beams){
    const delta=to.map((v,k)=>v-from[k]),length=Math.hypot(...delta),axis=delta.map(v=>v/length);
    const across=[axis[1],-axis[0],0],d=Math.hypot(...across);across.forEach((v,i)=>across[i]=v/d);
    const depth=[axis[1]*across[2]-axis[2]*across[1],axis[2]*across[0]-axis[0]*across[2],axis[0]*across[1]-axis[1]*across[0]];
    const steps=Math.ceil(length/.6);
    for(let i=0;i<steps;i++){
      const t=(i+.5)/steps,p=from.map((v,k)=>v+delta[k]*t),w=width*(.5+.75*t);
      const envelope=Math.sin(Math.PI*t)**.65,shaft=(factor,opacity)=>({center:p,
        axes:[axis.map(v=>v*.53),across.map(v=>v*w*factor),depth.map(v=>v*w*factor)],
        color:[.73,.86,.91],opacity:strength*opacity*envelope,seed:(i*.6180339)%1,softParticle:true,material:'forest-ceiling-ray'});
      splats.push(shaft(1,1),shaft(2.7,.14));
    }
  }
}
