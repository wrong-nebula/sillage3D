import {landRandom} from './moebius/land-flora-genome.js';

const TAU=Math.PI*2,GOLDEN=Math.PI*(3-Math.sqrt(5));
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const mul=(a,s)=>a.map(v=>v*s);
export const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const radial=(a,r,y=0)=>[Math.cos(a)*r,y,Math.sin(a)*r];
function cubic(p,t){const q=1-t;return p[0].map((v,i)=>v*q*q*q+3*p[1][i]*q*q*t+3*p[2][i]*q*t*t+p[3][i]*t*t*t);}
function derivative(p,t){const q=1-t;return p[0].map((v,i)=>3*(p[1][i]-v)*q*q+6*(p[2][i]-p[1][i])*q*t+3*(p[3][i]-p[2][i])*t*t);}

/** An editable, deterministic organ graph in metres. The rosette retains its
 * Moebius genome, golden-angle phyllotaxy and coral/sage palette. Anatomical
 * additions are designed succulent traits, not a real-species reconstruction. */
export function createRosetteAnatomy(genome){
  const g=genome,h=g.height,w=g.width,rng=landRandom(g.seed,'rosette/anatomy-v2');
  const leaves=[],stemHeight=h*.17,stemRadius=h*.044;
  for(let i=0;i<g.branches;i++){
    const cohort=i/Math.max(1,g.branches-1),angle=g.phaseAngle+i*GOLDEN+(rng()-.5)*.12;
    // Young leaves emerge above older sheaths; every root intersects the stem.
    const root=radial(angle,stemRadius*(.62+.24*cohort),stemHeight*(.88-.60*cohort));
    const length=w*mix(.115,.46,cohort**.72)*(.91+.18*rng());
    const rise=h*mix(.88,.18,cohort**.65)*(.94+.12*rng());
    const arch=h*mix(.10,.31,cohort),direction=radial(angle,1);
    const tip=add(root,add(mul(direction,length),[0,rise,0]));
    const controls=[root,add(root,add(mul(direction,length*.12),[0,rise*.69+arch*.40,0])),
      add(root,add(mul(direction,length*.65),[0,rise+arch,0])),tip];
    const width=w*mix(.068,.185,cohort**.7)*(.92+.16*rng());
    leaves.push({id:i,genome:g,root,angle,cohort,controls,width,
      birth:.43*(1-cohort),thickness:width*(.055+.025*rng()),
      roll:mix(1.45,.13,cohort),twist:(rng()-.5)*.25,
      tipCurl:mix(.018,.075,cohort)*h*(.7+.6*rng()),
      veinPhase:rng()*TAU,sideBias:(rng()-.5)*.07,
      pigmentShift:(rng()-.5)*.035,
    });
  }
  return {genome:g,leaves,stemHeight,stemRadius,version:2};
}

function frameAt(leaf,v){
  const center=cubic(leaf.controls,v),tangent=unit(derivative(leaf.controls,v));
  const preferred=radial(leaf.angle+Math.PI/2,1);
  const across=unit(sub(preferred,mul(tangent,dot(preferred,tangent))));
  const normal=unit(cross(tangent,across));
  const twist=leaf.twist*Math.sin(v*Math.PI)+leaf.sideBias*v*v;
  const side=add(mul(across,Math.cos(twist)),mul(normal,Math.sin(twist)));
  const up=add(mul(normal,Math.cos(twist)),mul(across,-Math.sin(twist)));
  // A flexible distal tip extends the same connected centerline.
  center[1]-=leaf.tipCurl*smooth(.76,1,v)**2;
  return {center,tangent,side,up};
}

export function leafEnvelope(v){
  if(v>=1)return .001;
  const blade=(Math.max(.00001,v)/.28)**.35*((1-v)/.72)**.90;
  return Math.max(.001,mix(.13,blade,smooth(0,.075,v)));
}

export function leafVeins(leaf,u,v){
  const a=2*u-1,envelope=leafEnvelope(v),edge=1-a*a;
  const midrib=Math.exp(-((a/.052)**2));
  // Long vascular strands follow the blade; sparse lateral connections attach
  // to the midrib. No independent dots, deposits or glitter are generated.
  const strands=Math.exp(-Math.abs(Math.sin((a+.008*Math.sin(v*9+leaf.veinPhase))*Math.PI*5.5))*18);
  const secondary=Math.exp(-Math.abs(Math.sin((v-Math.abs(a)*.14)*Math.PI*12+leaf.veinPhase*.12))*24)*edge;
  const relief=leaf.width*envelope*(midrib*.007+strands*.0022+secondary*.0014)*smooth(.02,.11,v)*(1-smooth(.91,1,v));
  return {midrib,strands,secondary,relief};
}

/** side +1 is the adaxial surface, -1 is the abaxial surface. Both are real
 * connected surfaces. The thickness tapers without changing normal direction. */
export function leafPoint(leaf,u,v,side=1){
  const frame=frameAt(leaf,v),a=2*u-1,envelope=leafEnvelope(v),half=leaf.width*.5*envelope;
  const roll=leaf.roll*(.65+.35*(1-v)),rolled=a*roll;
  const across=half*Math.sin(rolled)/roll;
  const rolledEdge=half*(1-Math.cos(rolled))/roll;
  const channel=leaf.width*envelope*(.028+.055*a*a);
  const thickness=leaf.thickness*envelope*(.22+.78*Math.sqrt(Math.max(0,1-a*a)));
  const vein=leafVeins(leaf,u,v).relief*(side>0?1:-.35);
  const relief=channel+rolledEdge+side*thickness*.5+vein;
  return add(frame.center,add(mul(frame.side,across),mul(frame.up,relief)));
}

export function leafSample(leaf,u,v,side=1){
  const epsilon=.0004;
  const point=leafPoint(leaf,u,v,side),left=leafPoint(leaf,clamp(u-epsilon),v,side),right=leafPoint(leaf,clamp(u+epsilon),v,side);
  const du=sub(right,left);
  const dv=sub(leafPoint(leaf,u,clamp(v+epsilon),side),leafPoint(leaf,u,clamp(v-epsilon),side));
  const normal=mul(unit(cross(dv,du)),side);
  const tangent=unit(sub(dv,mul(normal,dot(dv,normal))));
  const veins=leafVeins(leaf,u,v),g=leaf.genome,a=Math.abs(2*u-1);
  const pigment=side>0?g.palette.body:g.palette.underside;
  const maturation=smooth(.08,.85,v)*.25;
  const basalShade=.67+.33*smooth(.015,.23,v),lip=smooth(.89,1,a),tip=smooth(.89,1,v);
  const color=pigment.map((c,k)=>{
    const tissue=mix(c,g.palette.tip[k],maturation)+leaf.pigmentShift*[1,.6,.4][k];
    const vascular=1-.065*veins.strands-.09*veins.secondary+.045*veins.midrib;
    const clean=tissue*vascular*basalShade;
    return clamp(mix(clean,g.palette.tip[k]*(side>0?1:.91),lip*.26+tip*.18));
  });
  const first=mul(du,1/(2*epsilon)),second=mul(sub(add(left,right),mul(point,2)),1/(epsilon*epsilon));
  const normalCurvature=Math.abs(dot(second,normal))/Math.max(1e-12,dot(first,first));
  return {point,normal,tangent,color,uv:[u,v],organ:leaf,
    curvature:u>epsilon&&u<1-epsilon?clamp(normalCurvature*leaf.width*.035,0,.65):.5,side};
}

/** Rounded margin surface explicitly bridges both tissues, closing the blade. */
export function leafMarginSample(leaf,edge,v,t){
  const u=edge===0?0:1,upper=leafPoint(leaf,u,v,1),lower=leafPoint(leaf,u,v,-1);
  const frame=frameAt(leaf,v),out=mul(frame.side,edge===0?-1:1);
  const thickness=Math.hypot(...sub(upper,lower));
  const center=mul(add(upper,lower),.5),theta=(t-.5)*Math.PI;
  const point=add(center,add(mul(out,Math.cos(theta)*thickness*.5),mul(frame.up,Math.sin(theta)*thickness*.5)));
  const normal=unit(add(mul(out,Math.cos(theta)),mul(frame.up,Math.sin(theta))));
  const pigment=leaf.genome.palette.tip;
  return {point,normal,tangent:frame.tangent,color:pigment.map(c=>c*.94),uv:[u,v],organ:leaf,side:0,curvature:.5};
}

/** Stable deformation shared with the splat shader. Organ origins remain
 * connected to the growing stem; older outer leaves unfold before the heart. */
export function rosetteGrowth(point,anchor,height,age,organ=null){
  const a=clamp(age,.015,1),rise=.055+.945*a**.72,spread=.025+.975*a**1.18;
  if(!organ){
    const level=clamp((point[1]-anchor[1])/height),opening=.32+.68*smooth(level*.32,.65+level*.35,a);
    return add(anchor,mul(sub(point,anchor),1).map((v,i)=>v*(i===1?rise:spread*opening)));
  }
  const root=organ.slice(0,3),birth=organ[3],leafAge=smooth(birth,birth+.47,a);
  const growth=[spread*(.20+.80*leafAge),rise*(.16+.84*leafAge**.72),spread*(.20+.80*leafAge)];
  const radialDirection=unit([root[0]-anchor[0],0,root[2]-anchor[2]]),axis=cross(radialDirection,[0,1,0]);
  const fold=(1-leafAge)*mix(.92,.20,smooth(.20,.43,birth));
  const p=sub(point,root),c=Math.cos(fold),s=Math.sin(fold);
  const rotated=add(add(mul(p,c),mul(cross(axis,p),s)),mul(axis,dot(axis,p)*(1-c)));
  const rootLevel=clamp((root[1]-anchor[1])/height),rootOpening=.32+.68*smooth(rootLevel*.32,.65+rootLevel*.35,a);
  const grownRoot=add(anchor,sub(root,anchor).map((v,i)=>v*(i===1?rise:spread*rootOpening)));
  return add(grownRoot,rotated.map((v,i)=>v*growth[i]));
}
