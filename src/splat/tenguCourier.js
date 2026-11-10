import {AnimatedGLBSplats} from './AnimatedGLBSplats.js';
import {CourierController} from './CourierController.js';
import {Vector3,LoopOnce,LoopRepeat} from 'three';
import {SplatGroundShadow,COURIER_SHADOW_SPLATS} from './SplatGroundShadow.js';
import {CourierAudio} from './CourierAudio.js';
import {CourierBlink,COURIER_EYE_SPLATS} from './CourierBlink.js';
import {CourierFootPlant,CourierMotion} from './CourierMotion.js';

export const TENGU_SPLAT_COUNT=42000;
const assetRoot=`${import.meta.env?.BASE_URL ?? '/'}tengu-courier/`;

export async function loadTenguCourier({count=TENGU_SPLAT_COUNT,shadowCount=COURIER_SHADOW_SPLATS,groundHeight,constrain,followHeight=.65,airplaneFlight=false,height=3.6}={}){
  const actor=await AnimatedGLBSplats.load(`${assetRoot}tengu-courier.glb?v=20261106-rigid-head`,{
    count,height,seed:61106,clip:0,deformCovariance:true,
  });
  const eyeResponse=await fetch(`${assetRoot}eyes.json`);
  if(!eyeResponse.ok){actor.dispose();throw new Error('Could not load the courier eyelids.');}
  actor.blink=new CourierBlink(actor.samples,(await eyeResponse.json()).eyes,actor.normalization);
  actor.splats.push(...actor.blink.splats);
  // Meshy's almost-black albedo relies on specular light to describe the feathers.
  // A restrained, diffuse charcoal highlight makes that volume readable in paint.
  const dark=[];
  actor.samples.forEach((sample,index)=>{
    const value=Math.max(...sample.pigment);
    if(value<.18)dark.push([index,1-value/.18]);
  });
  const feathers=Uint32Array.from(dark,pair=>pair[0]),featherWeight=Float64Array.from(dark,pair=>pair[1]);
  const updateSkin=actor.update.bind(actor);
  actor.shadow=new SplatGroundShadow(actor.splats.length,shadowCount);
  actor.splats.push(...actor.shadow.splats);
  actor.update=(dt=0)=>{
    actor.blink.advance(dt,actor.motionLayer?.gaze);
    updateSkin(dt);
    for(let i=0;i<feathers.length;i++){
      const splat=actor.splats[feathers[i]],n=splat.axes[2],length=Math.hypot(n[0],n[1],n[2]);
      const diffuse=Math.max(0,(-.52*n[0]+.72*n[1]+.46*n[2])/length);
      const lift=.08*featherWeight[i]*(.25+.75*diffuse);
      const color=splat.color;color[0]+=lift;color[1]+=lift;color[2]+=lift;
    }
    actor.blink.apply(actor.splats);
    actor.shadow.update(actor.splats);
    if(groundHeight){
      const ground=groundHeight(actor.root.position.x,actor.root.position.z);
      for(let i=0;i<actor.shadow.bodyCount;i++){
        const splat=actor.splats[i];
        if(splat.opacity>0)splat.center[1]+=ground;
      }
      for(const {center} of actor.shadow.splats)center[1]+=groundHeight(center[0],center[2]);
    }
  };
  actor.time=0;actor.animationOptions=actor.clipNames;
  actor.audio=new CourierAudio();
  const disposeSkin=actor.dispose.bind(actor);actor.dispose=()=>{actor.audio.dispose();disposeSkin();};
  actor.selectAnimation=(index,{fade=.22,restart=false}={})=>{
    const previous=actor.clipNames[actor.currentClip],next=actor.clipNames[index];
    const gait=['Walk','Run'],phase=actor.action&&gait.includes(previous)&&gait.includes(next)?actor.action.time/actor.action.getClip().duration:undefined;
    actor.setClip(index,{fade,phase,restart});actor.time=actor.action.time;
    const oneShot=['Jump','Takeoff','Land','Wave','Look around'].includes(actor.clipNames[index]);
    actor.action.setLoop(oneShot?LoopOnce:LoopRepeat,oneShot?1:Infinity);actor.action.clampWhenFinished=oneShot;
    actor.activity=`Courier · ${actor.clipNames[index].toLowerCase()}`;
    actor.update(0);
  };
  actor.selectAnimation(Math.max(0,actor.clipNames.indexOf('Idle')),{fade:0});
  actor.controller=new CourierController((name,restart)=>{
    actor.selectAnimation(actor.clipNames.indexOf(name),{fade:name==='Land' ? .12 : .22,restart});actor.engine?.onActorChange?.();
  },{airplaneFlight});
  const hips=actor.source.getObjectByName('Hips'),restHips=hips?.position.clone(),forward=new Vector3();
  actor.footPlant=new CourierFootPlant(actor);actor.motionLayer=new CourierMotion(actor);
  actor.onBeforePose=()=>{actor.footPlant.restore();actor.motionLayer.restore();};
  actor.onPose=dt=>{
    if(actor.controller.enabled&&hips)hips.position.copy(restHips);
    actor.footPlant.apply(dt);actor.motionLayer.apply();
  };
  const soles=actor.meshes.map(entry=>({entry,indices:Array.from({length:entry.vertices.length/3},(_,i)=>i).filter(i=>entry.vertices[i*3+1]<.18)}));
  actor.onVertices=meshes=>{
    let floor=Infinity;for(const {entry,indices} of soles)for(const index of indices)floor=Math.min(floor,entry.vertices[index*3+1]);
    if(!Number.isFinite(floor))return;
    const controller=actor.controller,motion=actor.clipNames[actor.currentClip];
    const supported=controller.enabled?controller.grounded&&motion!=='Run':['Idle','Walk','Wave','Look around'].includes(motion);
    let offset=supported?(controller.enabled?controller.position.y:0)+.012-floor:Math.max(0,.012-floor);
    let lowest=Infinity;for(const {vertices} of meshes)for(let i=1;i<vertices.length;i+=3)lowest=Math.min(lowest,vertices[i]);
    offset=Math.max(offset,.012-lowest);
    for(const {vertices} of meshes)for(let i=1;i<vertices.length;i+=3)vertices[i]+=offset;
    actor.placement={rawSoleHeight:floor,offset,supported};
  };
  actor.previewAnimation=index=>{
    actor.controller.enabled=false;actor.controller.clearKeys();actor.selectAnimation(index);
  };
  actor.attachEngine=engine=>{actor.engine=engine;};
  actor.followOffset=new Vector3();
  actor.advance=dt=>{
    const controller=actor.controller,engine=actor.engine;
    if(controller.enabled){
      if(engine)engine.camera.getWorldDirection(forward);else forward.set(0,0,-1);
      const previous=constrain?{...controller.position}:null;
      controller.step(dt,forward);
      constrain?.(controller,previous);
      actor.motionLayer.step(dt);
      actor.root.position.set(controller.position.x,controller.position.y,controller.position.z);
      actor.root.rotation.set(actor.motionLayer.pitch,controller.yaw,actor.motionLayer.bank,'YXZ');
      if(engine&&!constrain){
        // A small dead zone makes movement visible before the camera follows.
        const desired=new Vector3(controller.position.x,controller.position.y*followHeight,controller.position.z);
        const offset=desired.sub(actor.followOffset),distance=Math.hypot(offset.x,offset.z);
        if(distance>.55||Math.abs(offset.y)>.05){
          const planar=distance>.55?1-.55/distance:0;offset.x*=planar;offset.z*=planar;
          offset.multiplyScalar(1-Math.exp(-5*dt));
          actor.followOffset.add(offset);engine.camera.position.add(offset);engine.controls.target.add(offset);engine.controls.update();
        }
      }
    }else{
      actor.motionLayer.step(dt);actor.root.rotation.x=actor.motionLayer.pitch;actor.root.rotation.z=actor.motionLayer.bank;
    }
    actor.time+=dt;
    if(controller.enabled&&['Walk','Run'].includes(actor.clipNames[actor.currentClip])){
      const speed=Math.hypot(controller.velocity.x,controller.velocity.z),nominal=actor.clipNames[actor.currentClip]==='Run'?4.4:1.55;
      actor.action.setEffectiveTimeScale(Math.max(.15,Math.min(1.4,speed/nominal)));
    }
    actor.update(dt);
    actor.audio.update(dt,actor.clipNames[actor.currentClip],controller,{time:actor.action.time,duration:actor.action.getClip().duration});
  };
  actor.advance(0);
  return actor;
}

export const tenguCourierScene={
  id:'tengu-courier',label:'Tengu courier',title:'The mountain parcel courier',
  description:'WASD to move · Shift to run · Space to jump · Shift in the air to fly · Space to land.',
  caption:'Wings, wooden sandals & precious parcels',
  reference:'/tengu-courier/reference.png',splatBudget:TENGU_SPLAT_COUNT+COURIER_EYE_SPLATS+COURIER_SHADOW_SPLATS,styleOnVisit:true,
  camera:{position:[4.3,2.85,7.2],target:[0,2.05,0],fov:36},
  initialStyle:{quality:'studio',mode:'ghibli',brushScale:1,coverage:1.12,softness:.24,
    indirect:false,tintedShadows:false,sun:false,lensDirt:false,lensFlare:false,
    painterlyVignette:false,foregroundDOF:false},
  create:()=>({splats:[],background:'#80b2c3',orbitLimit:15,actorLabel:'courier',loadActor:loadTenguCourier}),
};
