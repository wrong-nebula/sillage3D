import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Ray} from 'three';
import {XPBDFlexWorld} from '../src/splat/physics/XPBDFlexWorld.js';
import {FlexibleLab} from '../src/splat/physics/FlexibleLab.js';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';
import {packSplats} from '../src/splat/math.js';
const calm={sample:(point,time,out)=>out.set(0,0,0)},groups=[{wind:new Vector3()}];
const close=(a,b,t=1e-4)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);

test('flexible integration preserves gravity and compliant stretch is stable across tick sizes',()=>{
  const world=new SplatPhysicsWorld(),s=new XPBDFlexWorld();const node=s.node(0,5,0,{mass:1,response:0,drag:0});
  for(let i=0;i<120;i++)s.step(1/120,world,groups);close(s.position[node*3+1],5-9.81/2);close(s.velocity[node*3+1],-9.81);
  const run=dt=>{const f=new XPBDFlexWorld();f.node(0,10,0,{pinned:true});f.node(0,9,0,{mass:1,response:0,drag:.8});f.distance(0,1,.0001);for(let i=0;i<3/dt;i++)f.step(dt,world,groups);return f.position[4];};
  close(run(1/120),run(1/60),.00015);close(run(1/120),9-.000981,.00015);
  assert.throws(()=>s.step(.1,world,groups));assert.throws(()=>new XPBDFlexWorld({iterations:100}));
});
test('flexible nodes collide with terrain and transfer bounded equal-and-opposite momentum to rigid bodies',()=>{
  const world=new SplatPhysicsWorld({gravity:[0,0,0],height:()=>0}),body=world.createBody({position:[0,1,0],mass:2,drag:0});world.advance(1/120);
  const f=new XPBDFlexWorld();f.maxReactionDelta=10;f.node(-.62,1,0,{mass:1,radius:.1,response:0,drag:0});f.velocity[0]=3;
  f.step(1/120,world,groups);assert.ok(f.position[0]<=-.599);assert.ok(body.velocity.x>0);close(f.velocity[0]+2*body.velocity.x,3);assert.ok(f.stats.rigidReactions>0);
  const ground=new XPBDFlexWorld();ground.node(4,.02,4,{mass:1,radius:.05,response:0,drag:0});ground.velocity[1]=-3;ground.step(1/120,world,groups);assert.ok(ground.position[1]>=.05);assert.ok(ground.velocity[1]>=0);
  f.maxReactionDelta=.01;f.velocity[0]=12;f.position[0]=-.61;body.velocity.set(0,0,0);f.step(1/120,world,groups);assert.ok(body.velocity.length()<=.01001);assert.ok(f.stats.reactionCaps>0);
});
test('rooted bending constraints recover after a shove while pins remain exact',()=>{
  const world=new SplatPhysicsWorld({gravity:[0,0,0]}),s=new XPBDFlexWorld();
  for(let i=0;i<8;i++)s.node(0,i*.2,0,{pinned:i<2,response:0,drag:2,mass:.02});
  for(let i=0;i<7;i++)s.distance(i,i+1,.000002);for(let i=0;i<6;i++)s.bend(i,i+1,i+2,.0003);
  s.velocity[21]=7;for(let i=0;i<20;i++)s.step(1/120,world,groups);assert.ok(Math.abs(s.position[21])>.05);
  for(let i=0;i<1200;i++)s.step(1/120,world,groups);
  close(s.position[21],0,.035);close(s.position[0],0);close(s.position[4],.2);
});
test('lab rigs use fixed render membership, respond to gusts/blasts/weather, and reset without growing pools',()=>{
  const physics=new CliffPhysics(()=>0,[],{flexibleLab:true,clusterCapacity:1}),f=physics.flexibles,s=f.solver,controller={position:{x:20,y:0,z:20},yaw:0};
  const objects=[...f.splats],position=s.position,nav=physics.world.bodies.length;
  assert.equal(s.count,358);assert.equal(f.triangles.length,396);assert.ok(f.splats.length<2500);assert.ok(s.distances<s.constraintCapacity);
  physics.command('KeyG',controller);for(let i=0;i<180;i++)physics.update(1/120,controller,.8);
  const cloth=f.groups.find(g=>g.kind==='cloth'),index=cloth.start+cloth.cols*6+9,k=index*3;
  assert.ok(Math.abs(s.position[k+2]-s.rest[k+2])>.1);assert.ok(s.snow[index]>0);assert.ok(s.position.every(Number.isFinite));assert.ok(s.snapshot().maxStretch<1.35);
  const ropeNode=f.groups[0].start+12,ropeBefore=new Vector3().fromArray(s.velocity,ropeNode*3),clothBefore=new Vector3().fromArray(s.velocity,k);
  physics.explode(new Vector3(0,2,10));assert.ok(f.lastBlastAffected>0);
  assert.ok(new Vector3().fromArray(s.velocity,ropeNode*3).distanceTo(ropeBefore)>.05);assert.ok(new Vector3().fromArray(s.velocity,k).distanceTo(clothBefore)>.05);
  for(let i=0;i<120;i++)physics.update(1/120,controller,.8);
  const packed=packSplats(physics.splats);physics.writePacked(packed.data,packed.centers,0);assert.ok(packed.data.every(Number.isFinite));
  for(let i=0;i<12;i++)physics.command('KeyR',controller);
  assert.equal(s.position,position);assert.deepEqual([...s.position],[...s.rest]);assert.equal(physics.world.bodies.length,nav);assert.ok(f.splats.every((mark,i)=>mark===objects[i]));
  physics.dispose();assert.equal(physics.world.bodies.length,0);
});
test('the character torso pushes cloth and hanging rope as it walks through their nodes',()=>{
  const p=new CliffPhysics(()=>0,[],{flexibleLab:true,clusterCapacity:1}),f=p.flexibles,s=f.solver;p.wind.sample=calm.sample;
  const c={position:{x:3.75,y:0,z:12},yaw:Math.PI},cloth=f.groups.find(g=>g.kind==='cloth'),index=(cloth.start+8*cloth.cols+9)*3;
  p.world.teleport(p.player,[3.75,.65,12]);p.player.enabled=true;
  for(let i=0;i<160;i++){c.position.z=12-i*.018;p.update(1/120,c);}
  assert.ok(s.stats.characterContacts>0);assert.ok(Math.abs(s.position[index+2]-s.rest[index+2])>.15);
  f.reset();c.position.x=-.7;c.position.z=12;p.world.teleport(p.player,[-.7,.65,12]);const before=s.stats.characterContacts,rope=f.groups[1],node=(rope.start+19)*3;
  for(let i=0;i<160;i++){c.position.z=12-i*.018;p.update(1/120,c);}
  assert.ok(s.stats.characterContacts>before);assert.ok(Math.hypot(s.position[node]-s.rest[node],s.position[node+2]-s.rest[node+2])>.1);assert.ok(s.position.every(Number.isFinite));
});
test('cloth/rope picking creates a compliant mouse attachment and cancellation releases it',()=>{
  const world=new SplatPhysicsWorld({capacity:8}),f=new FlexibleLab(world,calm,()=>0),s=f.solver;
  const hit=f.pick(new Ray(new Vector3(3.75,2.5,18),new Vector3(0,0,-1)));assert.equal(hit.label,'Cloth');assert.ok(f.grab.begin(hit,0));
  const before=f.grab.getAnchor(new Vector3()).clone();f.grab.setTarget(before.clone().add(new Vector3(0,0,1)),1);
  for(let i=0;i<60;i++)f.step(1/120,null,0);f.sync(1);assert.ok(f.grab.getAnchor(new Vector3()).z>before.z+.3);
  f.grab.end(2,false,'cancelled');assert.equal(f.grab.body,null);assert.equal(f.grab.releaseReason,'cancelled');
  const rope=f.groups[0],middle=rope.start+12,point=new Vector3().fromArray(s.display,middle*3);
  const ropeHit=f.pick(new Ray(point.clone().add(new Vector3(0,0,4)),new Vector3(0,0,-1)));assert.match(ropeHit.label,/rope/i);
});
test('heat chars and cuts flexible links; reset restores their topology and source pose',()=>{
  const world=new SplatPhysicsWorld({gravity:[0,0,0]}),s=new XPBDFlexWorld();s.node(0,.2,0,{pinned:true});s.node(0,.4,0);s.distance(0,1);
  const fire={active:true,intensity:1,position:new Vector3(0,.2,0)};
  for(let i=0;i<1200;i++)s.step(1/120,world,groups,fire);
  assert.ok(s.burn[0]>.92);assert.equal(s.edgeAlive[0],0);assert.equal(s.stats.cutConstraints,1);
  s.reset();assert.equal(s.burn[0],0);assert.equal(s.edgeAlive[0],1);assert.deepEqual([...s.position],[...s.rest]);
  const cut=new XPBDFlexWorld();cut.node(0,1,0,{pinned:true});cut.node(0,.5,0);cut.node(0,0,0);cut.distance(0,1);cut.distance(1,2);cut.distance(0,2,0,.02);cut.burn[1]=.95;
  cut.step(1/120,world,groups);assert.equal(cut.edgeAlive[2],0,'coarse tethers must release after a local burn cut');
});
