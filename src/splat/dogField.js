import {AnimatedGLBSplats} from './AnimatedGLBSplats.js';
import {Quadruped} from './animation/quadruped.js';

const TAU=Math.PI*2;
const hex=value=>value.match(/[\da-f]{2}/gi).map(channel=>parseInt(channel,16)/255);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
// The close grass stays level so a four-footed walk has reliable ground contact.
export const dogGround=(x,z)=>.035*Math.sin(x*.45)*Math.sin(z*.4);
export function dogPose(time){
  const phase=time*.23;
  const x=2.05*Math.sin(phase),z=.9*Math.sin(phase*2);
  return {position:[x,dogGround(x,z)+.025,z],yaw:Math.atan2(2.05*Math.cos(phase),1.8*Math.cos(phase*2))};
}

export async function loadFieldDog(){
  const dog=await AnimatedGLBSplats.load('/models/dog.glb',{height:1.65,count:4500});
  try{
    const pose=dogPose(0);dog.root.position.fromArray(pose.position);dog.root.rotation.y=pose.yaw;
    const controller=new Quadruped(dog.root);
    dog.controller=controller;dog.time=0;
    // Small, layered ground marks travel under the body, in the same depth sort.
    const shadowStart=dog.splats.length;
    for(let i=0;i<48;i++)dog.splats.push({center:[0,.03,0],axes:[[.25,0,0],[0,0,.22],[0,.008,0]],color:hex('#344c34'),opacity:.14,seed:i/48,material:'actor-shadow'});
    dog.advance=dt=>{
      dog.time+=dt;
      const next=dogPose(dog.time);dog.root.position.fromArray(next.position);dog.root.rotation.y=next.yaw;
      controller.update(dt,{wag:.55});dog.update(dt);
      const sin=Math.sin(next.yaw),cos=Math.cos(next.yaw);
      for(let i=0;i<48;i++){
        const a=i*2.399963229728653,r=Math.sqrt((i+.5)/48),x=Math.cos(a)*r*.36,z=Math.sin(a)*r*.84;
        const px=next.position[0]+x*cos+z*sin,pz=next.position[2]-x*sin+z*cos;
        dog.splats[shadowStart+i].center=[px,dogGround(px,pz)+.04,pz];
      }
    };
    dog.advance(0);return dog;
  }catch(error){dog.dispose();throw error;}
}

export function createDogField(){
  let seed=80917;const rnd=()=>{seed=Math.imul(1664525,seed)+1013904223|0;return (seed>>>0)/4294967296;};
  const splats=[],grass=['#54774a','#6f8d4e','#839d59','#9cad65','#b5b879'].map(hex);
  function mark(center,axes,color,opacity=.98,material='grass',extra={}){
    splats.push({center,axes,color,opacity,seed:rnd(),material,...extra});
  }
  // Overlapping turf washes, then smaller upward strokes around the dog.
  for(let z=-28;z<29;z+=.65)for(let x=-28;x<29;x+=.65){
    const px=x+(rnd()-.5)*.3,pz=z+(rnd()-.5)*.3;
    const color=grass[Math.min(4,Math.floor((.48+.17*Math.sin(x*.28+z*.21)+rnd()*.26)*5))];
    mark([px,dogGround(px,pz)-.035,pz],[[.48,0,.12],[-.1,0,.4],[0,.018,0]],color);
  }
  for(let z=-60;z<=60;z+=2)for(let x=-60;x<=60;x+=2){
    if(Math.abs(x)<26&&Math.abs(z)<26)continue;
    mark([x,-.13,z],[[1.6,0,0],[0,0,1.6],[0,.025,0]],mix(grass[2],hex('#a7b390'),rnd()*.45));
  }
  for(let i=0;i<7800;i++){
    const x=(rnd()-.5)*25,z=(rnd()-.5)*24,height=.055+rnd()*.15,angle=rnd()*TAU;
    const side=[Math.cos(angle),0,Math.sin(angle)],normal=[-Math.sin(angle),0,Math.cos(angle)],width=.018+rnd()*.009;
    mark([x,dogGround(x,z)+height*.7,z],[[0,height*.65,0],side.map(v=>v*width),normal.map(v=>v*.012)],grass[Math.floor(rnd()*5)]);
  }
  for(let i=0;i<320;i++){
    const x=(rnd()-.5)*21,z=(rnd()-.5)*18;
    if(Math.abs(x)<3&&Math.abs(z)<2)continue;
    mark([x,dogGround(x,z)+.19,z],[[.045,0,0],[0,.025,0],[0,0,.04]],hex(i%3?'#e6dfb1':'#c1c9de'),.95,'foliage');
  }
  // Distant low hills leave a clear silhouette around the warm-colored dog.
  for(let i=0;i<3600;i++){
    const angle=i*2.399963229728653,r=26+rnd()*16,x=Math.cos(angle)*r,z=Math.sin(angle)*r;
    const y=-.6+rnd()*(1.6+2.8*Math.sin(angle*3)**2);
    mark([x,y,z],[[1.4,0,0],[0,.7,0],[0,0,1.3]],mix(hex('#728d78'),hex('#a8b69b'),rnd()),.92);
  }
  const skyTop=hex('#8eafbd'),horizon=hex('#d6ddca');
  for(let i=0;i<4800;i++){
    const y=1-2*(i+.5)/4800,a=i*2.399963229728653,r=Math.sqrt(1-y*y),u=[Math.cos(a)*r,y,Math.sin(a)*r];
    mark([u[0]*100,12+u[1]*100,u[2]*100],[[4.5,0,0],[0,4.5,0],[0,0,4.5]],mix(horizon,skyTop,Math.max(0,y)),.9,'cloud',{skyBackground:true,noFog:true});
  }
  return {splats,background:'#b9cbbd',orbitLimit:55,loadActor:loadFieldDog,
    atmosphere:{color:'#c1cfb9',start:16,density:.016,max:.65}};
}

export const dogFieldScene={id:'dog-field',label:'Dog field',title:'An afternoon in the grass',description:'A curious dog walking through a sunlit grass field.',caption:'A walking dog & summer grass',swatch:'dog-field',
  camera:{position:[5.7,3.25,8.1],target:[0,.9,0],fov:42},
  initialStyle:{quality:'studio',mode:'paint',brushScale:1,coverage:1.1,softness:.25,indirect:true,bounceStrength:.65,tonePreservation:.85,shadowTintStrength:.12,lensDirt:false,lensFlare:false,sun:false,painterlyVignette:false},
  create:createDogField};
