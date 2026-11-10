import test from 'node:test';
import assert from 'node:assert/strict';
import {CourierController} from '../src/splat/CourierController.js';
const step=(c,seconds)=>{for(let i=0;i<Math.round(seconds*60);i++)c.step(1/60);};
test('WASD walks on the plane, Shift runs, diagonals normalize and release returns to idle',()=>{
  const c=new CourierController();c.setKey('KeyW',true);step(c,1);
  assert.ok(-c.position.z>1.8&&-c.position.z<2);assert.equal(c.motion,'Walk');assert.equal(c.position.y,0);
  const walked=c.position.z;c.setKey('ShiftLeft',true);step(c,1);assert.ok(walked-c.position.z>4.2);assert.equal(c.motion,'Run');
  c.setKey('KeyD',true);step(c,1);assert.ok(Math.abs(Math.hypot(c.velocity.x,c.velocity.z)-4.4)<.001);
  c.clearKeys();step(c,.35);assert.equal(c.motion,'Idle');
});
test('acceleration and jump trajectories agree at 30 and 60 Hz, and entering flight does not teleport',()=>{
  const a=new CourierController(),b=new CourierController();
  for(const c of [a,b]){c.setKey('KeyW',true);c.setKey('Space',true);}
  for(let i=0;i<15;i++)a.step(1/30);for(let i=0;i<30;i++)b.step(1/60);
  for(const axis of ['x','y','z'])assert.ok(Math.abs(a.position[axis]-b.position[axis])<1e-9);
  const c=new CourierController();c.setKey('Space',true);const y=c.position.y;c.setKey('ShiftLeft',true);assert.equal(c.position.y,y);c.step(1/60);assert.ok(c.position.y>0&&c.position.y<.1);
});
test('jump needs a fresh Space press, airborne Shift starts sustained flight, Space lands',()=>{
  const c=new CourierController();c.setKey('Space',true);step(c,.2);assert.equal(c.grounded,false);assert.ok(c.position.y>.5);
  const velocity=c.velocity.y;c.setKey('Space',true);assert.equal(c.velocity.y,velocity);
  c.setKey('Space',false);c.setKey('ShiftLeft',true);assert.equal(c.flying,true);assert.equal(c.motion,'Fly');
  const altitude=c.position.y;c.setKey('ShiftLeft',false);step(c,2);assert.equal(c.position.y,altitude);
  c.setKey('Space',true);assert.equal(c.flying,false);step(c,2);
  assert.equal(c.grounded,true);assert.equal(c.position.y,0);assert.equal(c.motion,'Idle');
});
test('holding Shift on the ground does not automatically turn a running jump into flight',()=>{
  const c=new CourierController();c.setKey('ShiftLeft',true);c.setKey('Space',true);step(c,.3);
  assert.equal(c.flying,false);assert.equal(c.grounded,false);
  c.setKey('ShiftLeft',false);c.setKey('ShiftLeft',true);assert.equal(c.flying,true);
});
test('camera-relative movement and manual previews keep independent state',()=>{
  const c=new CourierController();c.setKey('KeyW',true);c.step(.1,{x:1,z:0});assert.ok(c.position.x>0);assert.equal(c.position.z,0);
  c.enabled=false;const old={...c.position};c.step(.1);assert.deepEqual(c.position,old);
  c.clearKeys();c.setKey('KeyA',true);assert.equal(c.enabled,true);
});

test('flight can climb and descend, then resumes walking on touchdown',()=>{
  const player=new CourierController();
  const step=(frames=1)=>{for(let i=0;i<frames;i++)player.step(1/60);};
  player.adjustFlightAltitude(3);
  assert.equal(player.flightAltitude,0);
  player.setKey('Space',true);step(18);
  player.setKey('ShiftLeft',true);player.setKey('ShiftLeft',false);
  player.adjustFlightAltitude(10);step(90);
  assert.ok(player.flying&&player.position.y>4.4&&player.position.y<=4.5);
  player.adjustFlightAltitude(-2);step(90);
  assert.ok(player.flying&&Math.abs(player.position.y-2.5)<.02);
  player.setKey('KeyW',true);
  player.adjustFlightAltitude(-10);step(100);
  assert.equal(player.position.y,0);
  assert.equal(player.grounded,true);
  assert.equal(player.flying,false);
  assert.equal(player.motion,'Walk');
  assert.ok(player.position.z<0);
});

test('airplane controls bank, climb and land while S slows forward travel without reversing',()=>{
  const c=new CourierController(()=>{},{airplaneFlight:true});
  c.setKey('Space',true);step(c,.23);
  c.setKey('ShiftLeft',true);c.setKey('ShiftLeft',false);
  c.setFlightInput(.7,.8);step(c,1.4);
  assert.ok(c.position.y>2.5&&c.position.z>3&&c.yaw>.5);
  c.setFlightInput(0,0);step(c,1.4);
  const yaw=c.yaw,altitude=c.flightAltitude;
  c.setKey('KeyS',true);step(c,1.3);
  assert.ok(Math.abs(c.flightAltitude-altitude)<.02);
  const along=Math.sin(c.yaw)*c.velocity.x+Math.cos(c.yaw)*c.velocity.z;
  assert.ok(along>2&&along<2.4);
  c.setKey('KeyS',false);c.setKey('KeyA',true);step(c,.6);
  assert.ok(c.yaw<yaw-.15);
  c.setKey('KeyA',false);
  c.setFlightInput(0,-1);step(c,3);
  assert.ok(c.grounded&&!c.flying);
  assert.equal(c.flightInput,null);
});

test('winter pace prevents running without slowing jump gravity and restores warm-season running',()=>{
  const c=new CourierController();c.speedScale=.55;c.allowRunning=false;
  c.setKey('KeyW',true);c.setKey('ShiftLeft',true);step(c,1);
  assert.equal(c.motion,'Walk');assert.ok(Math.abs(Math.hypot(c.velocity.x,c.velocity.z)-1.1)<.001);
  c.setKey('Space',true);step(c,.2);assert.ok(!c.grounded&&c.position.y>.8);
  c.setKey('Space',false);step(c,1.2);assert.equal(c.grounded,true);
  c.speedScale=1;c.allowRunning=true;step(c,1);
  assert.equal(c.motion,'Run');assert.ok(Math.abs(Math.hypot(c.velocity.x,c.velocity.z)-4.4)<.001);
});
