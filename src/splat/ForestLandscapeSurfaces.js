import {forestLandscapeSample as sample,forestLandscapeHeight,forestLandscapeOpacity,forestDryShoreDistance,FOREST_LANDSCAPE_BOUNDS} from './ForestLandscape.js';
import {paintForestRocks} from './ForestBankDetails.js';
import {paintReefSandGlitter} from './reefSeabed.js';
import {FOREST_WATERFALL_TRUNKS,upperWaterContains,lowerReachContains} from './ForestWaterfalls.js';
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const hex=s=>s.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const hash=(x,z)=>{const f=Math.sin(x*127.1+z*311.7)*43758.5453;return f-Math.floor(f);};

export function addForestLandscape({mark,layer,splats,height=forestLandscapeHeight,instances=[],sediment={piles:[],height:()=>0}}){
  const [x0,z0,x1,z1]=FOREST_LANDSCAPE_BOUNDS,candidates=[],shoreCandidates=[];
  let dryCount=0,bedCount=0;
  function pigment(x,z,y,kind,dx,dz){
    const curvature=sample(x,z,1),flow=sample(x,z,2),deposition=sample(x,z,3);
    const exposure=sample(x,z,8),debris=sample(x,z,9),fractures=sample(x,z,10),wear=sample(x,z,14);
    const light=clamp((-.65*dx+.7+.65*dz)/Math.hypot(dx,1,dz)),bed=kind===1||kind===2;
    const shore=sample(x,z,5),sand=clamp(.38+(curvature-.5)*.65+deposition*.40+shore*.12-flow*.12-exposure*.22);
    let color=bed?mix(hex('#10263f'),hex(kind===1?'#91afc7':'#3c6482'),kind===1?.68:.22+.16*sand):
      mix(hex('#426482'),hex('#c0cde3'),clamp(.15+.52*light+.25*sand));
    if(!bed){
      const waterline=y>9?12.6:0,wetEdge=clamp(1-(y-waterline)/.70)*(y>=waterline?1:0);
      color=mix(color,hex('#24435e'),clamp(flow*.14+wear*.12+exposure*.12+fractures*.36+wetEdge*.42));
      color=mix(color,hex('#aabed4'),clamp(deposition*.20+debris*.08));
    }
    return {color,curvature,flow,deposition,exposure,debris,fractures,wear};
  }
  layer('landscape',()=>{
    const step=1.10;
    for(let j=0,z=z0;z<z1;z+=step,j++)for(let i=0,x=x0;x<x1;x+=step,i++){
      const px=x+(hash(x,z)-.5)*.15,pz=z+(hash(z,x)-.5)*.15,edge=sample(px,pz,4);
      if(forestLandscapeOpacity(px,pz)<.002)continue;
      const kind=sample(px,pz,6),bed=kind===1||kind===2;
      if(bed&&(i%2||j%2))continue;
      let y=height(px,pz),dx=(height(px+.3,pz)-height(px-.3,pz))/.6,dz=(height(px,pz+.3)-height(px,pz-.3))/.6;
      if(kind>=3){y=Math.min(y,sample(px,pz,7)-1.35);dx=0;dz=0;}
      dx=clamp(dx,-1.2,1.2);dz=clamp(dz,-1.2,1.2);
      const {color,curvature,flow,deposition,exposure,debris,fractures,wear}=pigment(px,pz,y,kind,dx,dz);
      const footprint=bed?1.25:kind>=3?.50:.78,opacity=.99;
      mark([px,y,pz],[-dx,1,-dz],[1,dx,0],footprint*Math.hypot(1,dx),footprint*Math.hypot(1,dz),.045,color,{material:'stone',opacity});
      if(bed)bedCount++;else dryCount++;
      if(kind===0&&pz>28&&pz<122&&y>12.65&&y<14.15&&exposure<.65&&edge>15&&forestDryShoreDistance(px,pz)<=5.2)shoreCandidates.push({x:px,z:pz});
      const slope=Math.hypot(dx,dz);
      if(!bed&&kind===0&&edge>14&&pz>5&&pz<126&&y>.2&&slope>.06&&slope<.95&&
        !upperWaterContains(px,pz)&&!lowerReachContains(px,pz)&&
        instances.every(p=>Math.hypot(px-p.position[0],pz-p.position[2])>(p.radius??1)*.82+1)&&
        FOREST_WATERFALL_TRUNKS.every(([tx,tz,r])=>Math.hypot(px-tx,pz-tz)>r+2)){
        candidates.push({x:px,y,z:pz,debris,score:debris*2.5+exposure*.6+fractures*.25+wear*.35+deposition*.4+Math.abs(curvature-.5)*.4+hash(px,pz)*.04});
      }
    }
  });
  let sedimentCount=0;
  layer('sedimentPiles',()=>{
    for(let z=10;z<130;z+=.62)for(let x=-132;x<4;x+=.62){
      const px=x+(hash(x,z)-.5)*.12,pz=z+(hash(z,x)-.5)*.12,amount=sediment.height(px,pz);
      if(amount<.07||sedimentCount>=6000)continue;
      const y=height(px,pz),dx=(height(px+.16,pz)-height(px-.16,pz))/.32,dz=(height(px,pz+.16)-height(px,pz-.16))/.32;
      const {color}=pigment(px,pz,y,0,dx,dz);
      mark([px,y+.012,pz],[-dx,1,-dz],[1,dx,0],.44*Math.hypot(1,dx),.42*Math.hypot(1,dz),.016,color,{material:'forest sediment'});
      sedimentCount++;
    }
  });
  let detailCount=0;
  layer('landscapeDetails',()=>{
    // Spend the extra surface samples on the new fine erosion, not distant flats.
    for(let z=3;z<124;z+=.42)for(let x=-126;x<3;x+=.42){
      if(detailCount>=15000)break;
      const px=x+(hash(x,z)-.5)*.16,pz=z+(hash(z,x)-.5)*.16,kind=sample(px,pz,6);
      if(kind>=3||forestLandscapeOpacity(px,pz)<.15)continue;
      const y=height(px,pz),level=kind===1?12.6:0;
      if(kind>0&&level-y>1.2)continue;
      const dx=clamp((height(px+.12,pz)-height(px-.12,pz))/.24,-1.8,1.8),dz=clamp((height(px,pz+.12)-height(px,pz-.12))/.24,-1.8,1.8);
      const detail=pigment(px,pz,y,kind,dx,dz),riverbank=sample(px,pz,11);
      const importance=Math.max(detail.exposure*.8,detail.fractures,detail.debris,riverbank*.85,detail.wear*.75,sample(px,pz,5)*.35);
      if(importance<.10||hash(px+19,pz)>importance*.82)continue;
      mark([px,y+.018,pz],[-dx,1,-dz],[1,dx,0],.32*Math.hypot(1,dx),.30*Math.hypot(1,dz),.016,detail.color,{material:'stone'});
      detailCount++;
    }
  });
  const stones=[];
  for(const p of candidates.sort((a,b)=>b.score-a.score)){
    if(stones.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<5.5))continue;
    const seed=hash(p.z,p.x),size=stones.length<6?1.6+seed*1.7:.65+seed*1.1;
    stones.push({...p,size,yaw:seed*Math.PI*2,samples:size>1.6?720:300});if(stones.length===34)break;
  }
  // Half-buried pieces interrupt the broad sand shoulders, with clear space
  // around roots and the wet edge. These use the same native fracture surfaces.
  for(const p of sediment.piles.filter((_,i)=>i%2===0)){
    const x=p.x+Math.cos(p.angle)*p.long*.45,z=p.z+Math.sin(p.angle)*p.long*.45,size=1.15+hash(p.z,p.x)*1.15;
    if(sample(x,z,6)!==0||instances.some(q=>Math.hypot(x-q.position[0],z-q.position[2])<(q.radius??1)*.82+size*.6))continue;
    if(stones.some(q=>Math.hypot(x-q.x,z-q.z)<(size+q.size)*.8))continue;
    stones.push({x,z,y:height(x,z),size,yaw:p.angle+.6,samples:540});
  }
  // Small angular fragments gather around larger pieces in deposited material.
  for(const p of [...stones])for(let i=0,placed=0;i<10&&placed<3;i++){
    const seed=hash(p.x+i*17,p.z+9),angle=(i*.27+seed)*Math.PI*2,distance=p.size*.65+.6+seed*1.3;
    const x=p.x+Math.cos(angle)*distance,z=p.z+Math.sin(angle)*distance,size=.19+hash(z,x)*.54;
    if(sample(x,z,6)!==0||sample(x,z,8)>.75||instances.some(q=>Math.hypot(x-q.position[0],z-q.position[2])<(q.radius??1)*.82+.35))continue;
    if(stones.some(q=>Math.hypot(x-q.x,z-q.z)<(size+q.size)*.42))continue;
    stones.push({x,z,y:height(x,z),size,yaw:angle,samples:96});
    placed++;
  }
  layer('landscapeRocks',()=>paintForestRocks(splats,stones));
  const shoreCenters=[];
  for(const p of shoreCandidates.sort((a,b)=>hash(a.x,a.z)-hash(b.x,b.z))){
    if(shoreCenters.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<9))continue;
    shoreCenters.push(p);if(shoreCenters.length>=20)break;
  }
  layer('sandGlitter',()=>{
    const bed={height,sample:(x,z)=>{
      const h=forestLandscapeHeight(x,z);
      if(sample(x,z,6)!==0||h<12.65||h>14.15||z<28||z>125||sample(x,z,8)>.65||forestDryShoreDistance(x,z)>5.2)return 1;
      const phase=(h-12.6)*4.5+.18*Math.sin(x*.6)+.10*Math.sin(z*.7);
      return .23-.18*Math.pow(.5+.5*Math.cos(phase*Math.PI*2),4)-sample(x,z,3)*.035;
    }};
    const shadow=(x,z)=>instances.some(p=>Math.hypot(x-p.position[0],z-p.position[2])<(p.radius??1)+.25)?1:0;
    for(const {x,z}of shoreCenters)paintReefSandGlitter(splats,bed,shadow,{count:900,radius:6.5,center:[x,z],sizeScale:5});
  });
  return {dryCount,bedCount,detailCount,sedimentCount,piles:sediment.piles,shoreCenters,stones:stones.map(({x,y,z,size})=>({x,y,z,size})),source:'/blue-forest/landscape.json'};
}
