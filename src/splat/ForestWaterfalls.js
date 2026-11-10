/** One river curves out of its western deep pool, over three broad shelves,
 * toward the camera and into the deeper downstream basin. */
import {upperBasinDistance,downstreamBankDistance,organicOvalDistance} from './ForestTerrain.js';
import {panoramaAnchor} from './ForestPanorama.js';
import {isForestWater} from './DynamicWater.js';
import {forestLandscapeReady,forestLandscapeWater} from './ForestLandscape.js';
export const OPENING_OFFSET=[-61,12.6,112];
export const openingPoint=([x,y,z])=>[OPENING_OFFSET[0]-x,OPENING_OFFSET[1]+y,OPENING_OFFSET[2]-z];
export const openingWaterContains=(x,z)=>forestLandscapeReady()?forestLandscapeWater(x,z)===1:isForestWater(OPENING_OFFSET[0]-x,OPENING_OFFSET[2]-z);
export const FOREST_WATER_LOOP=1.62;
export const FOREST_WATER_FRAME=.09;
export const FALL_RUN=5.2,FALL_DEPTH=5.3;
// Individual drops are anchored to the mirrored panorama. Several channels
// split around the same trunk islands and reunite in the lower basin.
const drop=(id,from,to,width,top,bottom,parents=[])=>{
  const a=panoramaAnchor(...from,top),b=panoramaAnchor(...to,bottom);
  const left=panoramaAnchor(from[0]-width/2,from[1],top),right=panoramaAnchor(from[0]+width/2,from[1],top);
  const raised=v=>v===8.1?12.6:v===5.9?8.4:v===2.8?4.2:v;
  // Keep the landing at the reference anchor. The higher terraces need enough
  // upstream run for a rounded spillway instead of a near-vertical curtain.
  const run=Math.max(a[2]-b[2],(raised(top)-raised(bottom))*1.55),crestZ=b[2]+run;
  return {id,referenceTop:top,referenceBottom:bottom,referenceLipZ:a[2],near:Math.min(left[0],right[0]),far:Math.max(left[0],right[0]),lipZ:crestZ,flow:[b[0]-a[0],-run],top:raised(top),bottom:raised(bottom),parents,from,to,width};
};
export const FOREST_CASCADES=[
  drop('behind-slanted-trunk',[255,88],[268,116],105,8.1,5.9),
  drop('behind-cut-branch',[489,86],[494,125],170,8.1,5.9),
  drop('upper-dark-trunk',[609,65],[618,105],112,8.1,5.9),
  drop('central-shelf',[510,128],[508,174],184,5.9,2.8,[1]),
  drop('branch-left-plunge',[315,150],[310,226],148,5.9,.12,[0]),
  drop('branch-right-plunge',[449,178],[439,226],68,2.8,.12,[3]),
  drop('dark-trunk-left',[581,143],[585,183],74,5.9,2.8,[2]),
  drop('dark-trunk-right',[678,99],[674,143],76,5.9,2.8,[2]),
  drop('dark-trunk-foot',[638,177],[653,205],100,2.8,.12,[6,7]),
  drop('left-column-spill',[84,112],[75,185],115,5.9,.12,[0]),
];
export const FOREST_WATERFALL_TRUNKS=[
  [411,218,0,3.1],[628,180,5.9,4.1],[159,305,0,5.8],[102,180,0,4.3],
  [232,151,2.8,2.7],[681,120,0,3.0],[766,237,0,6.0],[958,151,0,4.8],
].map(([x,y,level,r])=>{const p=panoramaAnchor(x,y,level);return [p[0],p[2],r];});
export const lipBend=x=>.55*Math.sin(x*.48)+.22*Math.sin(x*1.7);
const outlets=FOREST_CASCADES.filter(c=>c.bottom<.2).map(c=>[(c.near+c.far)/2+c.flow[0],c.lipZ+c.flow[1]-3,(c.far-c.near)/2+7,13]);
const inlets=FOREST_CASCADES.filter(c=>c.top===12.6).map(c=>[(c.near+c.far)/2,c.lipZ+5,(c.far-c.near)/2+2,9]);
export const lowerShoreDistance=(x,z)=>Math.max(downstreamBankDistance(x,z),...outlets.map(([cx,cz,rx,rz])=>organicOvalDistance(x,z,cx,cz,rx,rz,.6)));
export function onCascadeOrShelf(x,z){
  for(const c of FOREST_CASCADES){
    const u=(z-c.lipZ)/c.flow[1],across=x-c.flow[0]*u;
    if(u>-.08&&u<1.08&&across>c.near-.5&&across<c.far+.5)return true;
    for(const parentIndex of c.parents){
      const p=FOREST_CASCADES[parentIndex],ax=(p.near+p.far)/2+p.flow[0],az=p.lipZ+p.flow[1],bx=(c.near+c.far)/2;
      const t=Math.abs(c.lipZ-az)>.01?(z-az)/(c.lipZ-az):(x-ax)/(bx-ax);
      const width=(p.far-p.near)*(1-t)+(c.far-c.near)*t;
      if(t>=0&&t<=1&&Math.abs(x-(ax+(bx-ax)*t))<width*.52)return true;
    }
  }
  return false;
}
// All high inlets connect to the shallow opening; all terminal drops drain to the same low basin.
export const upperWaterContains=(x,z)=>forestLandscapeReady()?forestLandscapeWater(x,z)===1:(openingWaterContains(x,z)||(upperBasinDistance(x,z)>0&&z>22+lipBend(x))||inlets.some(([cx,cz,rx,rz])=>organicOvalDistance(x,z,cx,cz,rx,rz,1)>0&&z>cz-5))&&!onCascadeOrShelf(x,z);
export const lowerReachContains=(x,z)=>forestLandscapeReady()?forestLandscapeWater(x,z)===2:lowerShoreDistance(x,z)>0&&!upperWaterContains(x,z);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function fallSurfaceHeight(x,u,top,bottom,across=0){
  const dome=Math.max(0,Math.sin(Math.PI*u));
  const bend=u+.045*Math.sin(x*.31+.8)*dome;
  const lobes=.84+.22*Math.sin(x*.23)+.13*Math.sin(x*.57+1.2);
  // Quarter-oval shoulders: the face bows out over the plunge instead of
  // easing into a concave trough at its foot.
  return bottom+(top-bottom)*Math.sqrt(Math.max(0,1-bend*bend))+dome*(1.05*lobes+.75*Math.max(0,1-across*across));
}
export function fallSurfacePoint(c,x,u){
  const mid=(c.near+c.far)/2,v=(x-mid)/((c.far-c.near)*.5),dome=Math.sin(Math.PI*u);
  return [mid+(x-mid)*(1-.18*dome)+c.flow[0]*u+.45*Math.sin(x*.28)*dome,
    fallSurfaceHeight(x,u,c.top,c.bottom,v),
    c.lipZ+lipBend(x)-lipBend(mid)+c.flow[1]*u-c.flow[1]*.28*v*v*Math.pow(u,.7)];
}
function fallFrame(c,x,u){
  const p=fallSurfacePoint(c,x,u),a=fallSurfacePoint(c,x-.02,u),b=fallSurfacePoint(c,x+.02,u);
  const before=fallSurfacePoint(c,x,Math.max(0,u-.003)),after=fallSurfacePoint(c,x,Math.min(1,u+.003));
  const across=b.map((v,i)=>v-a[i]),along=after.map((v,i)=>v-before[i]);
  let n=[across[1]*along[2]-across[2]*along[1],across[2]*along[0]-across[0]*along[2],across[0]*along[1]-across[1]*along[0]];
  const length=Math.hypot(...n),sign=n[1]<0?-1:1;n=n.map(v=>v/length*sign);return {p,n,along};
}
export function forestHeadwaterHeight(x,z=12){
  let best=Infinity,height=0;
  for(const c of FOREST_CASCADES){
    const u=Math.max(0,Math.min(1,(z-c.lipZ)/c.flow[1])),across=x-c.flow[0]*u;
    const p=fallSurfacePoint(c,Math.max(c.near,Math.min(c.far,across)),u);
    const distance=Math.hypot(x-p[0],z-p[2]);
    if(distance<best){best=distance;height=p[1];}
  }
  return height;
}
export function addForestWaterfalls({mark,layer,random:rnd,splats}){
  const clamp=x=>Math.max(0,Math.min(1,x)),mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
  const hex=s=>s.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255);
  const white=hex('#ede6f3'),blue=hex('#abc7e2');
  const trunkClear=(x,z)=>FOREST_WATERFALL_TRUNKS.every(([tx,tz,r])=>Math.hypot(x-tx,z-tz)>r);
  layer('cascadeShelves',()=>{
    for(const child of FOREST_CASCADES)for(const parentIndex of child.parents){
      const parent=FOREST_CASCADES[parentIndex],a=fallSurfacePoint(parent,(parent.near+parent.far)/2,1),b=fallSurfacePoint(child,(child.near+child.far)/2,0);
      const length=Math.hypot(b[0]-a[0],b[2]-a[2]);
      const steps=Math.max(3,Math.ceil(length/.25));
      for(let j=0;j<steps;j++)for(let k=0;k<50;k++){
        const t=(j+.5)/steps,w=k/49-.5,width=((parent.far-parent.near)*(1-t)+(child.far-child.near)*t)*(1+.12*Math.sin(t*Math.PI));
        const x=a[0]+(b[0]-a[0])*t+w*width,z=a[2]+(b[2]-a[2])*t+.38*Math.sin(w*7+t*3);
        if(!trunkClear(x,z))continue;
        const crown=.18*Math.sin(t*Math.PI)*Math.cos(w*Math.PI);
        mark([x,child.top+.025+crown,z],[0,1,0],[1,0,.1],width/50*.8,.30,.10,mix(hex('#759bb9'),hex('#b7c8df'),.38+.12*Math.sin(x*.27+z*.11)),{material:'waterfall',opacity:.99});
      }
    }
  });
  layer('waterfallSheets',()=>{
    for(const c of FOREST_CASCADES){
      const width=c.far-c.near;
      const rows=Math.ceil(Math.hypot(...c.flow,c.top-c.bottom)/.22);
      for(let x=c.near;x<c.far;x+=.24)for(let k=0;k<rows;k++){
        const u=Math.sin((k+.1+rnd()*.8)/rows*Math.PI*.5),px=x+rnd()*.13,{p,n,along}=fallFrame(c,px,u);
        if(!trunkClear(p[0],p[2]))continue;
        const edge=clamp(Math.min(px-c.near,c.far-px)*2);
        const tone=clamp(.54+.32*n[1]+.06*Math.sin(px*.33+u*1.4));
        // Pigmented volume under the surface gives rounded lips visible thickness.
        if(k%3===0)mark(p.map((v,i)=>v-n[i]*.18),n,along,.40,.29,.20,mix(hex('#477b9f'),blue,.26),{material:'waterfall',opacity:.96*edge});
        const incoming=c.top===12.6?hex('#86afcc'):hex('#9bbcd7'),receiving=c.bottom<.2?hex('#4f8eaf'):hex('#92b5d3');
        let body=mix(incoming,mix(hex('#83a6c7'),hex('#d5d3e7'),tone),smooth(0,.24,u));
        body=mix(body,receiving,smooth(.87,1,u)*.62);
        mark(p,n,along,.30,.22,.11,body,{material:'waterfall',opacity:.99*edge});
      }
      for(let i=0;i<Math.round(width*61);i++){
        const x=c.near+rnd()*width,phase=rnd(),u=phase*phase,{p,n,along}=fallFrame(c,x,u);
        if(!trunkClear(p[0],p[2]))continue;
        mark(p.map((v,i)=>v+n[i]*.065),n,along,.18+rnd()*.30,.016+rnd()*.014,.009,white,
          {material:'waterfall',opacity:.67+rnd()*.3,wind:[FOREST_CASCADES.indexOf(c),x,phase,8]});
      }
    }
  });
  layer('roundedFoam',()=>{
    for(const c of FOREST_CASCADES)for(let x=c.near+.2;x<c.far;x+=.42){
      const p=fallSurfacePoint(c,x,1),radius=.26+rnd()*.31;
      if(!trunkClear(p[0],p[2]))continue;
      for(let j=0;j<24;j++){
        const y=(j+.5)/24,a=j*2.39996323,r=Math.sqrt(1-y*y),n=[Math.cos(a)*r,y,Math.sin(a)*r];
        const center=[p[0]+n[0]*radius*1.35,p[1]+.04+n[1]*radius*.72,p[2]+n[2]*radius];
        mark(center,[n[0]/1.35,n[1]/.72,n[2]],[1,.12,0],radius*.38,radius*.32,.055,mix(hex('#8eb7d5'),white,.35+.65*y),
          {material:'foam',opacity:.97,wind:[0,0,x*.4,9]});
      }
    }
  });
  layer('waterfallFoam',()=>{
    for(const c of FOREST_CASCADES){
      const width=c.far-c.near;
      for(let i=0;i<Math.round(width*40);i++){
        const x=c.near+rnd()*width,z=fallSurfacePoint(c,x,1)[2]-(rnd()-.2)*.75,size=.07+rnd()**2*.20;
        if(!trunkClear(x+c.flow[0],z))continue;
        mark([x+c.flow[0],c.bottom+.09+rnd()**3*.12,z],[0,1,0],[1,0,.1],size*1.5,size,.025,mix(blue,white,.84+rnd()*.16),
          {material:'foam',opacity:.75+rnd()*.24,wind:[0,0,rnd()*6.28,9]});
      }
      for(let i=0;i<Math.round(width*5);i++){
        const x=c.near+rnd()*width,z=fallSurfacePoint(c,x,1)[2],y=c.bottom+.15+rnd()*.45;
        mark([x+c.flow[0],y,z],[0,0,-1],[1,.15,0],.3+rnd()*.3,.17+rnd()*.2,.12,mix(blue,white,.65),
          {material:'mist',opacity:.025+rnd()*.025,softParticle:true,wind:[0,0,rnd()*6.28,9]});
      }
    }
  });
  layer('plungeWash',()=>{
    for(const c of FOREST_CASCADES){
      if(c.bottom>.2)continue;
      const length=Math.hypot(...c.flow),dx=c.flow[0]/length,dz=c.flow[1]/length;
      for(let i=0;i<600;i++){
        const across=rnd(),x=c.near+across*(c.far-c.near),end=fallSurfacePoint(c,x,1),t=rnd(),travel=.15+t*6.5;
        const px=end[0]+dx*travel,pz=end[2]+dz*travel;
        if(!lowerReachContains(px,pz)||!trunkClear(px,pz))continue;
        const edge=Math.sin(across*Math.PI),color=mix(hex('#8ebcdb'),hex('#2c6288'),t);
        mark([px,.055,pz],[0,1,0],[dx,0,dz],.42,.32,.012,color,
          {material:'waterfall',opacity:(1-t)*(1-t)*.48*edge+.015,wind:[0,0,x*.4,9]});
      }
    }
  });
  layer('outflowContours',()=>{
    for(let ring=0;ring<19;ring++){
      const x=-56+rnd()*23,z=-6+rnd()*12,rx=1.5+rnd()*2.7,rz=.7+rnd()*1.2,phase=rnd()*6.283;
      for(let j=0;j<110;j++){
        const a=j/110*6.283,shape=1+.17*Math.sin(a*3+phase)+.09*Math.sin(a*7-phase);
        if(Math.sin(a*2+phase)<-.86)continue;
        const p=[x+Math.cos(a)*rx*shape,.09,z+Math.sin(a)*rz*shape];
        if(!lowerReachContains(p[0],p[2]))continue;
        mark(p,[0,1,0],[-Math.sin(a)*rx,0,Math.cos(a)*rz],.13,.055+rnd()*.022,.009,'#70b4d1',
          {material:'foam',opacity:.84+rnd()*.12,wind:[phase,a,rx,10]});
      }
    }
  });
}
export const WATERFALL_OFFSET_GLSL=`
  if(wind.w>7.5&&wind.w<8.5){
    float t=floor(windTime/.09+.0001)*.09;
    float phase=fract(wind.z),flow=fract(phase+t/1.62);
    float a=phase*phase,b=flow*flow;
    vec4 path=waterfallPaths[int(wind.x+.5)];
    float x=wind.y;
    vec2 edges=waterfallWidths[int(wind.x+.5)];
    float mid=(edges.x+edges.y)*.5,v=(x-mid)/max(.01,(edges.y-edges.x)*.5);
    float da=max(0.,sin(3.14159265*a)),db=max(0.,sin(3.14159265*b));
    float lobes=.84+.22*sin(x*.23)+.13*sin(x*.57+1.2);
    float aa=a+.045*sin(x*.31+.8)*da,bb=b+.045*sin(x*.31+.8)*db;
    float dy=(path.z-path.w)*(sqrt(max(0.,1.-bb*bb))-sqrt(max(0.,1.-aa*aa)))+(1.05*lobes+.75*max(0.,1.-v*v))*(db-da);
    return vec3(path.x*(b-a)+(.45*sin(x*.28)-.18*(x-mid))*(db-da),dy,
      path.y*(b-a)-path.y*.28*v*v*(pow(b,.7)-pow(a,.7)));
  }
  if(wind.w>8.5&&wind.w<9.5){
    float t=floor(windTime/.09+.0001)*.09*6.2831853/1.62;
    return vec3(.07*sin(t+wind.z),.045*sin(t*2.+wind.z),.09*cos(t+wind.z));
  }
  if(wind.w>9.5&&wind.w<10.5){
    float t=floor(windTime/.09+.0001)*.09*6.2831853/1.62;
    return vec3(.24*sin(t+wind.x)+.12*sin(wind.y*3.+t),.01,.20*cos(t+wind.x)+.11*cos(wind.y*2.-t));
  }
`;
