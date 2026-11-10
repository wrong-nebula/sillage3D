import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {LimitedPondOrbit} from '../src/splat/LimitedPondOrbit.js';
import {GHIBLI_CAMERA,GHIBLI_ORBIT} from '../src/splat/ghibliFrame.js';
import {createMeadowDogEntranceRoute} from '../src/splat/meadowDog.js';
import {createSheepFlock} from '../src/splat/sheepFlock.js';
import {hillsideHeight,pondDistance,createGhibli} from '../src/splat/ghibli.js';
import {revealSchedule,REVEAL_END,ANIMALS_ENTER} from '../src/splat/SummerReveal.js';

function setup(){
 const camera=new PerspectiveCamera(35,1.6,.08,600);camera.position.fromArray(GHIBLI_CAMERA.position);
 const controls={target:new Vector3().fromArray(GHIBLI_CAMERA.target),enabled:true};camera.lookAt(controls.target);camera.updateMatrixWorld(true);
 const listeners=new Map(),canvas={clientHeight:800,addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:t=>listeners.delete(t),hasPointerCapture:()=>false};
 return {camera,controls,listeners,orbit:new LimitedPondOrbit(camera,controls,canvas,GHIBLI_ORBIT)};
}
test('the pond remains at its authored screen position throughout the bounded orbit and reload',()=>{
 const {camera,controls,orbit,listeners}=setup(),pond=orbit.pivot.clone().project(camera),distance=camera.position.distanceTo(orbit.pivot);
 for(const yaw of [-9,0,9])for(const pitch of [-9,0,9]){
  orbit.apply(yaw,pitch);const projected=orbit.pivot.clone().project(camera);
  assert.ok(projected.distanceTo(pond)<1e-10);assert.ok(Math.abs(camera.position.distanceTo(orbit.pivot)-distance)<1e-10);
  assert.ok(Math.abs(orbit.yaw)<=4*Math.PI/180&&Math.abs(orbit.pitch)<=4*Math.PI/180);
  const saved={position:camera.position.toArray()},a=orbit.yaw,b=orbit.pitch;orbit.reset();orbit.restore(saved);
  assert.ok(Math.abs(orbit.yaw-a)<1e-9&&Math.abs(orbit.pitch-b)<1e-9);
 }
 orbit.reset();assert.deepEqual(camera.position.toArray(),GHIBLI_CAMERA.position);assert.deepEqual(controls.target.toArray(),GHIBLI_CAMERA.target);
 assert.equal(controls.enabled,false);orbit.dispose();assert.equal(listeners.size,0);
});
test('the dog enters on dry ground and joins its loop without a speed or heading discontinuity',()=>{
 const r=createMeadowDogEntranceRoute(hillsideHeight),end=r.entranceDuration;
 assert.ok(r.pose(0).position[2]>45);
 for(let t=0;t<end+4;t+=.03){
  const a=r.pose(t),b=r.pose(t+.01);assert.ok(pondDistance(a.position[0],a.position[2])>1.08);
  assert.ok(Math.abs(Math.hypot(b.position[0]-a.position[0],b.position[2]-a.position[2])/.01-r.speed)<.08);
 }
 const before=r.pose(end-.001),after=r.pose(end+.001);
 assert.ok(Math.abs(Math.atan2(Math.sin(before.yaw-after.yaw),Math.cos(before.yaw-after.yaw)))<.01);
});
test('sheep emerge from behind the hill and settle into their original grazing motion',()=>{
 const entry=createSheepFlock(hillsideHeight,{entrance:true}),regular=createSheepFlock(hillsideHeight);
 assert.ok(entry.sheep.every(s=>s.position[2]<-68));
 for(const s of entry.sheep){
  let obstruction=-Infinity;const c=GHIBLI_CAMERA.position,p=[s.position[0],s.position[1]+.8,s.position[2]];
  for(let t=.01;t<.99;t+=.005){const x=c[0]+(p[0]-c[0])*t,z=c[2]+(p[2]-c[2])*t;obstruction=Math.max(obstruction,hillsideHeight(x,z)-(c[1]+(p[1]-c[1])*t));}
  assert.ok(obstruction>.4,'the terrain hides the waiting sheep');
 }
 for(let t=0;t<=36;t+=.5){entry.update(t);for(const s of entry.sheep)assert.equal(s.position[1],hillsideHeight(s.position[0],s.position[2]));}
 entry.update(40);regular.update(40);assert.deepEqual(entry.splats,regular.splats);
});
test('all landscape splats complete their reveal before animals enter and trimming remaps wind indices',()=>{
 const scene=createGhibli(),schedule=revealSchedule(scene,scene.splats.length+100);
 assert.ok(Math.max(...schedule.slice(0,60000))<REVEAL_END);
 for(let i=0;i<scene.splats.length;i++)assert.ok(schedule[i]+1.2<ANIMALS_ENTER);
 assert.ok(Math.abs(schedule.at(-1)-ANIMALS_ENTER)<1e-6);
 assert.ok(scene.composition.features.frameTrim.removed>4000);
 assert.deepEqual(scene.animation.indices,scene.splats.flatMap((s,i)=>s.wind?[i]:[]));
});
