import {CatmullRomCurve3,CubicBezierCurve3,Vector3} from 'three';
import {AnimatedGLBSplats} from './AnimatedGLBSplats.js';
import {MeadowDogGait} from './animation/meadowDogGait.js';
import {attachRunningEars} from './animation/meadowDogEars.js';

export const MEADOW_DOG_SAMPLES=1100,MEADOW_DOG_SHADOWS=24;
/** Restrict dark pigment to facial details; the body is warm chalk white. */
export function meadowDogPigment(p,position){
 const y=.2126*p[0]+.7152*p[1]+.0722*p[2],[,height,z]=position;
 if(y<.16&&z>.75&&height>1.0&&height<1.47)return [.14+y*.2,.155+y*.2,.15+y*.2];
 if(height>1.45&&z>.45)return [.78+y*.14,.78+y*.14,.73+y*.16];
 return [.89+y*.09,.89+y*.085,.85+y*.10];
}

export const MEADOW_DOG_ROUTE=[[-7,13],[-10,26],[-24,30],[-39,27],[-45,15],[-49,1],[-48,-8],[-42,-13],[-33,-14],[-23,-14],[-17,-14],[-12,-10],[-14,0],[-12,7]];
export function createMeadowDogRoute(height){
 const curve=new CatmullRomCurve3(MEADOW_DOG_ROUTE.map(([x,z])=>new Vector3(x,0,z)),true,'centripetal');
 curve.arcLengthDivisions=900;const length=curve.getLength(),speed=3.6;
 return {length,speed,period:length/speed,pose(time){
  const t=((time*speed/length)%1+1)%1,p=curve.getPointAt(t),direction=curve.getTangentAt(t);
  const slope=(height(p.x+direction.x*.6,p.z+direction.z*.6)-height(p.x-direction.x*.6,p.z-direction.z*.6))/1.2;
  return {position:[p.x,height(p.x,p.z)+.025,p.z],yaw:Math.atan2(direction.x,direction.z),pitch:-Math.atan(slope),direction:[direction.x,direction.z]};
 }};
}

/** Enter from below the right edge, then join the pond loop at matching speed. */
export function createMeadowDogEntranceRoute(height){
 const loop=createMeadowDogRoute(height);let join=0,best=Infinity;
 for(let t=0;t<loop.period;t+=.01){const p=loop.pose(t).position,d=Math.hypot(p[0]+10,p[2]-26);if(d<best){best=d;join=t;}}
 const end=loop.pose(join),p=new Vector3(end.position[0],0,end.position[2]);
 const curve=new CubicBezierCurve3(new Vector3(-4,0,51),new Vector3(-3,0,36),p.clone().add(new Vector3(-end.direction[0]*9,0,-end.direction[1]*9)),p);
 curve.arcLengthDivisions=300;const duration=curve.getLength()/loop.speed;
 return {...loop,entranceDuration:duration,pose(time){
  if(time>=duration)return loop.pose(time-duration+join);
  const t=Math.max(0,time/duration),p=curve.getPointAt(t),d=curve.getTangentAt(t);
  const slope=(height(p.x+d.x*.6,p.z+d.z*.6)-height(p.x-d.x*.6,p.z-d.z*.6))/1.2;
  return {position:[p.x,height(p.x,p.z)+.025,p.z],yaw:Math.atan2(d.x,d.z),pitch:-Math.atan(slope),direction:[d.x,d.z]};
 }};
}

export async function loadMeadowDog(height,{entrance=false}={}){
 const dog=await AnimatedGLBSplats.load(`${import.meta.env?.BASE_URL??'/'}models/dog.glb`,{height:1.65,count:MEADOW_DOG_SAMPLES,seed:2718});
 try{
  // Grade in the unposed model frame before placing the dog on its route.
  // Fewer, larger fixed samples give a simple painted silhouette as it runs.
  dog.samples.forEach((sample,i)=>{sample.pigment=meadowDogPigment(sample.pigment,dog.splats[i].center);});
  attachRunningEars(dog);
  const route=entrance?createMeadowDogEntranceRoute(height):createMeadowDogRoute(height),pose=route.pose(0);
  dog.root.position.fromArray(pose.position);dog.root.rotation.y=pose.yaw;
  const controller=new MeadowDogGait(dog.root,route,height);
  dog.controller=controller;dog.time=0;dog.route=route;dog.activity='Dog running';
  const shadowStart=dog.splats.length;
  for(let i=0;i<MEADOW_DOG_SHADOWS;i++)dog.splats.push({center:[0,0,0],axes:[[.24,0,0],[0,0,.24],[0,.009,0]],color:[.2,.29,.2],opacity:.13,seed:i/MEADOW_DOG_SHADOWS,material:'actor-shadow'});
  dog.advance=dt=>{
   // Absolute-time curves give the same smooth pose at 30 or 60 Hz. Skin the
   // fixed splat samples once per frame after solving the four grounded paws.
   dog.time+=dt;controller.update(dog.time);
   dog.update(dt);const next=route.pose(dog.time);
   const s=Math.sin(next.yaw),c=Math.cos(next.yaw);
   for(let i=0;i<MEADOW_DOG_SHADOWS;i++){
    const a=i*2.3999632297,r=Math.sqrt((i+.5)/MEADOW_DOG_SHADOWS),x=Math.cos(a)*r*.36,z=Math.sin(a)*r*.8;
    const px=next.position[0]+x*c+z*s,pz=next.position[2]-x*s+z*c;
    dog.splats[shadowStart+i].center=[px,height(px,pz)+.04,pz];
   }
  };
  dog.advance(0);return dog;
 }catch(error){dog.dispose();throw error;}
}
