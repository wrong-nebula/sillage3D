import test from 'node:test';
import assert from 'node:assert/strict';
import {Bone,Group,Quaternion,Vector3} from 'three';
import {plantLeg,CourierMotion,CourierFootPlant} from '../src/splat/CourierMotion.js';

test('planting reaches the ground anchor without changing leg lengths or toe rotation',()=>{
  const root=new Group(),hip=new Bone(),knee=new Bone(),foot=new Bone();root.add(hip);hip.add(knee);knee.add(foot);
  root.scale.setScalar(.7);root.rotation.y=.8;hip.position.y=1;knee.position.set(0,-.5,.1);foot.position.set(0,-.5,-.1);foot.rotation.x=.2;root.updateMatrixWorld(true);
  const before=foot.getWorldQuaternion(new Quaternion()),h=hip.getWorldPosition(new Vector3()),k=knee.getWorldPosition(new Vector3()),f=foot.getWorldPosition(new Vector3());
  const upper=h.distanceTo(k),lower=k.distanceTo(f),target=f.clone().add(new Vector3(.08,.04,-.06));
  plantLeg(hip,knee,foot,target);
  assert.ok(foot.getWorldPosition(new Vector3()).distanceTo(target)<1e-8);
  assert.ok(before.angleTo(foot.getWorldQuaternion(new Quaternion()))<1e-7);
  assert.ok(Math.abs(hip.getWorldPosition(new Vector3()).distanceTo(knee.getWorldPosition(new Vector3()))-upper)<1e-8);
  assert.ok(Math.abs(knee.getWorldPosition(new Vector3()).distanceTo(foot.getWorldPosition(new Vector3()))-lower)<1e-8);
  plantLeg(hip,knee,foot,new Vector3(99,99,99));assert.ok(foot.matrixWorld.elements.every(Number.isFinite));
});

test('terrain IK raises the uphill foot, releases airborne poses and restores the animator pose',()=>{
  const root=new Group();
  for(const [side,x] of [['Left',-.2],['Right',.2]]){
    const hip=new Bone(),knee=new Bone(),foot=new Bone();
    hip.name=`${side}UpLeg`;knee.name=`${side}Leg`;foot.name=`${side}Foot`;
    root.add(hip);hip.add(knee);knee.add(foot);
    hip.position.set(x,1,0);knee.position.set(0,-.5,.15);foot.position.set(0,-.45,-.1);
  }
  root.updateMatrixWorld(true);
  const actor={root,source:root,controller:{enabled:true,grounded:true},clipNames:['Idle'],currentClip:0,
    action:{time:0,getClip:()=>({duration:1})}};
  const ik=new CourierFootPlant(actor);ik.groundHeight=x=>x*.5;
  const foot=root.getObjectByName('RightFoot'),before=foot.getWorldPosition(new Vector3());
  ik.apply(.2);const after=foot.getWorldPosition(new Vector3());assert.ok(after.y>before.y+.09);
  assert.ok(ik.snapshot().every(l=>l.error<1e-6));
  ik.restore();root.updateMatrixWorld(true);assert.ok(foot.getWorldPosition(new Vector3()).distanceTo(before)<1e-8);
  actor.controller.grounded=false;ik.apply(.2);assert.ok(ik.legs.every(l=>l.weight===0&&l.anchor===null));
});

function fixture(){const root=new Group(),parcel=new Bone();parcel.name='Parcels';root.add(parcel);const controller={yaw:0,enabled:true,flying:true,velocity:{x:0,y:0,z:4.8}};return {root,source:root,controller};}
test('flight banks into turns, stays restrained, and parcels settle after stopping',()=>{
  const actor=fixture(),motion=new CourierMotion(actor);let maxBank=0,maxSway=0;
  for(let i=0;i<60;i++){actor.controller.yaw+=.035;motion.step(1/60);maxBank=Math.max(maxBank,Math.abs(motion.bank));maxSway=Math.max(maxSway,Math.abs(motion.sway.roll.value));}
  assert.ok(motion.bank<-.05&&maxBank<=.2);assert.ok(maxSway>.01&&maxSway<.1);assert.ok(motion.gaze.x!==0);
  actor.controller.flying=false;actor.controller.velocity={x:0,y:0,z:0};
  for(let i=0;i<240;i++)motion.step(1/60);
  assert.ok(Math.abs(motion.bank)<1e-8);for(const s of Object.values(motion.sway))assert.ok(Math.abs(s.value)<1e-6);
});
test('additive parcel motion restores the sampled pose and cannot accumulate on paused updates',()=>{
  const actor=fixture(),motion=new CourierMotion(actor),p=actor.source.getObjectByName('Parcels');p.rotation.set(.1,.2,.3);const before=p.quaternion.clone();motion.sway.roll.value=.05;
  motion.apply();const posed=p.quaternion.clone();
  for(let i=0;i<30;i++){motion.restore();assert.ok(p.quaternion.angleTo(before)<1e-7);motion.apply();assert.ok(p.quaternion.angleTo(posed)<1e-7);}
});
