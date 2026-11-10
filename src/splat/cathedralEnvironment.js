/** All-sided painted setting for the cathedral study; no image or mesh backing. */
const TAU=Math.PI*2;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const hex=s=>s.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const noise=(x,z)=>.5*Math.sin(x*.12+Math.sin(z*.08))+.3*Math.sin(z*.22-x*.045)+.2*Math.sin(x*.39+z*.31);

const pavementLow=hex('#7f849a');
const pavementHigh=hex('#a7a3b2');
const wetBlue=hex('#a9b7cc');
const wetRose=hex('#bdb1bc');
const warmGlint=hex('#efdcba');
const creamGlint=hex('#f3efe0');
const blueGlint=hex('#d6e2ef');

function pavementColor(x,z,rnd,detail=false){
  const large=.5+.5*noise(x,z);
  let color=mix(pavementLow,pavementHigh,clamp(large*.86+(rnd()-.5)*.15));
  // Broad, broken vertical reflections gather beneath the three facade portals.
  // They remain pigment laid on a level ground plane, never upright grass marks.
  if(z>0&&z<43){
    const width=1.8+z*.12;
    const portal=Math.max(...[-7,0,7].map(center=>Math.exp(-(((x-center)/width)**2))));
    const amount=portal*(1-smooth(20,43,z))*(.10+.12*(.5+.5*Math.sin(z*.29+x*.31)));
    color=mix(color,x<1?wetBlue:wetRose,amount*(detail?1.25:1));
  }
  return color;
}

/**
 * F.mark(center, normal, flow, sigmaWidth, sigmaLength, sigmaDepth,
 *        colorSRGB, opacity, material) appends a full-rank 3D splat.
 */
export function buildCathedralEnvironment(F){
  const begin=F.splats.length;
  const extent=55,grid=70,step=extent*2/grid;
  // Large overlapping brush shapes give the entire stone square continuous cover.
  for(let iz=0;iz<grid;iz++)for(let ix=0;ix<grid;ix++){
    const x=-extent+(ix+.5+(F.rnd()-.5)*.8)*step;
    const z=-extent+(iz+.5+(F.rnd()-.5)*.8)*step;
    const turn=.12+.16*Math.sin(x*.13+z*.07)+(F.rnd()-.5)*.18;
    F.mark([x,-.12,z],[0,1,0],[Math.cos(turn),0,Math.sin(turn)],
      .87+F.rnd()*.33,1.42+F.rnd()*.85,.035,
      pavementColor(x,z,F.rnd),.98,'stone');
  }
  const underpaintCount=F.splats.length-begin;
  const apronStart=F.splats.length,apronRadius=110,apronGrid=40,apronStep=apronRadius*2/apronGrid;
  // A sparse, broad apron reaches almost to the sky sphere's ground intersection.
  // Overlapping the inner square avoids a seam without quadrupling its detail.
  const distantPavement=hex('#d9d0d2');
  for(let iz=0;iz<apronGrid;iz++)for(let ix=0;ix<apronGrid;ix++){
    const x=-apronRadius+(ix+.5+(F.rnd()-.5)*.35)*apronStep;
    const z=-apronRadius+(iz+.5+(F.rnd()-.5)*.35)*apronStep;
    const r=Math.hypot(x,z);
    if(r>apronRadius||Math.abs(x)<51&&Math.abs(z)<51)continue;
    const turn=.12+(F.rnd()-.5)*.55;
    const color=mix(pavementColor(x,z,F.rnd),distantPavement,smooth(58,107,r)*.72);
    F.mark([x,-.12,z],[0,1,0],[Math.cos(turn),0,Math.sin(turn)],
      2.8+F.rnd()*.65,3.8+F.rnd()*1.1,.035,color,.99,'stone');
  }
  const apronCount=F.splats.length-apronStart;
  const patchStart=F.splats.length;
  for(let i=0;i<4500;i++){
    const near=F.rnd()<.62;
    const x=(F.rnd()-.5)*(near?72:110);
    const z=near?-9+F.rnd()*64:(F.rnd()-.5)*110;
    const length=.25+F.rnd()*.8,width=.055+F.rnd()*.21;
    const flow=F.rnd()<.2?[.25,0,1]:[1,0,.06+.3*Math.sin(x*.15+z*.06)];
    let color=pavementColor(x,z,F.rnd,true);
    const variation=(F.rnd()-.5)*.065;
    color=color.map(v=>clamp(v+variation));
    F.mark([x,-.075+F.rnd()*.012,z],[0,1,0],flow,width,length,.025,color,.9,'stone');
  }
  const pigmentStart=F.splats.length;
  // Independent paint sampling leaves the existing glints, sky, clouds and later
  // architecture RNG untouched. All marks remain horizontal 3D covariance volumes.
  let pigmentSeed=718943;
  const pigmentRandom=()=>{
    pigmentSeed|=0;pigmentSeed=pigmentSeed+0x6D2B79F5|0;
    let value=Math.imul(pigmentSeed^pigmentSeed>>>15,1|pigmentSeed);
    value=value+Math.imul(value^value>>>7,61|value)^value;
    return ((value^value>>>14)>>>0)/4294967296;
  };
  const coolPigments=['#596a95','#6b80a5','#7b83a5','#948cac','#a6aec5'].map(hex);
  const warmPigments=['#b29ca7','#c4afa5','#b7a7b8'].map(hex);
  for(let i=0;i<3600;i++){
    // Broken notes close to the buildings join the foot of the facade to the
    // foreground; a wider scatter keeps the pavement coherent when orbiting.
    const x=i<800?-43+pigmentRandom()*65:i<2600?-36+pigmentRandom()*82:(pigmentRandom()-.5)*110;
    const z=i<800?-7+pigmentRandom()*22:i<2600?2+pigmentRandom()*41:(pigmentRandom()-.5)*110;
    const family=pigmentRandom(),angle=family<.62?.55+(pigmentRandom()-.5)*.55:family<.9?-.65+(pigmentRandom()-.5)*.7:1.25+(pigmentRandom()-.5)*.45;
    const ca=Math.cos(angle),sa=Math.sin(angle),length=.22+pigmentRandom()*.52,width=.075+pigmentRandom()*.19;
    const warm=pigmentRandom()<.075,palette=warm?warmPigments:coolPigments;
    const field=clamp(.5+.37*noise(x*1.3,z*1.2)+(pigmentRandom()-.5)*.24);
    const pigment=palette[Math.min(palette.length-1,Math.floor(field*palette.length))];
    const base=pavementColor(x,z,pigmentRandom,true);
    const color=mix(base,pigment,warm?.32+pigmentRandom()*.18:.38+pigmentRandom()*.24);
    const thickness=.04+pigmentRandom()*.025;
    F.splats.push({
      center:[x,-.034,z],
      axes:[[ca*length,0,sa*length],[sa*width,0,-ca*width],[0,thickness,0]],
      color,opacity:.77+pigmentRandom()*.17,seed:pigmentRandom(),material:'stone',
    });
  }
  const pigmentCount=F.splats.length-pigmentStart;
  const patchCount=F.splats.length-patchStart,glintStart=F.splats.length;
  // Light is gathered into thirty broken reflection patches rather than evenly
  // scattered points. Half sit near the facade, where the authored view sees them.
  for(let cluster=0;cluster<30;cluster++){
    const portal=[-7,0,7][cluster%3];
    const zCenter=cluster<15?3+(cluster+.5)/15*13:cluster<24?16+(cluster-14.5)/9*14:30+(cluster-23.5)/6*15;
    const xCenter=portal+(F.rnd()-.5)*(1.8+zCenter*.16);
    const base=cluster%5===0?warmGlint:cluster%3===0?blueGlint:creamGlint;
    const turn=(F.rnd()-.5)*.28;
    for(let j=0;j<30;j++){
      const scatterX=(F.rnd()+F.rnd()+F.rnd()-1.5)/1.5;
      const scatterZ=(F.rnd()+F.rnd()-1);
      const x=xCenter+scatterX*(1.2+zCenter*.08);
      const z=clamp(zCenter+scatterZ*(.7+zCenter*.035),2.5,45);
      const color=mix(base,creamGlint,F.rnd()*.27);
      const angle=turn+(F.rnd()-.5)*.22+(j%9===0?.58:0);
      F.mark([x,.006+F.rnd()*.012,z],[0,1,0],[Math.cos(angle),0,Math.sin(angle)],
        .035+F.rnd()*.075,.18+F.rnd()*.47,.018,color,.88+F.rnd()*.11,'stone');
    }
  }
  const glintCount=F.splats.length-glintStart,skyStart=F.splats.length;
  const horizon=hex('#e5d7cf'),zenith=hex('#aebdca'),lower=hex('#d5c9d0');
  const skyUnderpaintCount=24000,skyScumbleCount=0,radius=120,skyCenter=[0,12,0];
  const skyColor=y=>y>=-.10?mix(horizon,zenith,smooth(-.10,.75,y)):mix(horizon,lower,smooth(.10,.9,-y)*.42);
  // Fine, overlapping round marks carry the gradient themselves. Tangential
  // jitter breaks the Fibonacci alignment while keeping the whole sphere covered.
  for(let i=0;i<skyUnderpaintCount;i++){
    const y=1-2*(i+.5)/skyUnderpaintCount,angle=i*2.399963229728653;
    const ring=Math.sqrt(1-y*y),base=[Math.cos(angle)*ring,y,Math.sin(angle)*ring];
    const east=[-Math.sin(angle),0,Math.cos(angle)],north=[-y*Math.cos(angle),ring,-y*Math.sin(angle)];
    const jx=(F.rnd()-.5)*.008,jy=(F.rnd()-.5)*.008;
    const jittered=base.map((v,k)=>v+east[k]*jx+north[k]*jy),norm=Math.hypot(...jittered);
    const u=jittered.map(v=>v/norm),size=1.8+F.rnd()*.2,variation=(F.rnd()-.5)*.04;
    const color=skyColor(u[1]).map(v=>clamp(v+variation));
    F.mark(u.map((v,k)=>skyCenter[k]+v*radius),u.map(v=>-v),[-Math.sin(angle),0,Math.cos(angle)],
      size,size,.55,color,.99,'cloud');
    F.splats.at(-1).noFog=true;
    F.splats.at(-1).skyBackground=true;
  }
  const cloudStart=F.splats.length;
  const cloudCream=hex('#ede4de'),cloudBlue=hex('#c3ccd8');
  const cloudCenters=[
    [-56,50,-72],[55,58,-69],[-57,51,64],[47,54,73],[0,77,-55],
    [-77,18,-50],[-67,32,-56],[-84,37,-40],[-50,75,-48],
  ];
  const lobes=[[-11,-1],[-3,3],[7,4],[14,-2]];
  // This is a fixed world-space composition, not a camera-facing cloud trick.
  // Keep each complete 3-sigma cloud sphere clear of the authored sun sightline.
  // The margin includes the solar quad's outer support at size 3.5, plus 2°.
  const sunCamera=[12.759340104455191,1.5307883850838113,27.557263217638358],sunAzimuth=-49.1,sunElevation=31.6,sunSize=3.5;
  const azimuth=sunAzimuth*Math.PI/180,elevation=sunElevation*Math.PI/180;
  const sunDirection=[Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),-Math.cos(azimuth)*Math.cos(elevation)];
  const sunExclusionDegrees=.533*sunSize+2,sunExclusion=sunExclusionDegrees*Math.PI/180;
  let excludedCloudCount=0;
  const cloudBankCounts=[];
  // Added lower-left banks sit behind the houses and the pale rear spire.
  // Overlapping translucent round volumes provide soft, fluffy edges.
  for(const anchor of cloudCenters){
    const bankStart=F.splats.length;
    const delta=anchor.map((v,k)=>v-skyCenter[k]),distance=Math.hypot(...delta),radial=delta.map(v=>v/distance);
    const azimuth=Math.atan2(radial[2],radial[0]);
    const east=[-Math.sin(azimuth),0,Math.cos(azimuth)];
    const north=[-radial[1]*Math.cos(azimuth),Math.hypot(radial[0],radial[2]),-radial[1]*Math.sin(azimuth)];
    for(let i=0;i<180;i++){
      const broad=i<14,lobe=lobes[i%lobes.length];
      const x=lobe[0]+(F.rnd()+F.rnd()-1)*(broad?3:6);
      const y=lobe[1]+(F.rnd()+F.rnd()-1)*(broad?2:4);
      const z=(F.rnd()+F.rnd()-1)*5;
      const local=delta.map((v,k)=>v+east[k]*x+north[k]*y+radial[k]*z);
      const length=Math.hypot(...local),scale=clamp(length,80,105)/length;
      const direction=local.map(v=>v/length),center=local.map((v,k)=>skyCenter[k]+v*scale);
      const size=broad?8+F.rnd()*3:2.8+F.rnd()*3.2;
      const fromCamera=center.map((v,k)=>v-sunCamera[k]),cameraDistance=Math.hypot(...fromCamera);
      const separation=Math.acos(clamp(fromCamera.reduce((sum,v,k)=>sum+v*sunDirection[k],0)/cameraDistance,-1,1));
      const angularSupport=Math.asin(Math.min(1,3*size/cameraDistance));
      if(separation<=sunExclusion+angularSupport){excludedCloudCount++;continue;}
      const tint=mix(cloudBlue,cloudCream,.3+.55*smooth(-7,9,y));
      const color=mix(skyColor(direction[1]),tint,broad?.64:.78);
      F.mark(center,direction.map(v=>-v),east,size,size,size,color,broad?.055:.045+F.rnd()*.03,'cloud');
      F.splats.at(-1).noFog=true;
    }
    cloudBankCounts.push(F.splats.length-bankStart);
  }
  const cloudCount=F.splats.length-cloudStart;
  return {
    underpaintCount,apronCount,patchCount,pigmentCount,glintCount,skyCount:F.splats.length-skyStart,
    skyUnderpaintCount,skyScumbleCount,cloudCount,cloudBankCounts,excludedCloudCount,total:F.splats.length-begin,
    pavementBounds:{min:[-apronRadius,-.12,-apronRadius],max:[apronRadius,.018,apronRadius]},
    apronRadius,glintBounds:{minZ:2.5,maxZ:45},
    sky:{center:skyCenter,radius,markRadiusRange:[1.8,2],cloudRadiusRange:[80,105],
      sunExclusion:{camera:sunCamera,direction:sunDirection,azimuth:sunAzimuth,elevation:sunElevation,size:sunSize,halfAngleDegrees:sunExclusionDegrees,sigmaSupport:3}},
  };
}
