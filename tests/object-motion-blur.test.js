import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectMotionBlur} from '../src/splat/physics/ObjectMotionBlur.js';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';

test('object motion uses a small reused pose buffer, interpolated centres and live linear/angular velocity',()=>{
  const world=new SplatPhysicsWorld({capacity:393}),body=world.createBody({position:[3,4,5],velocity:[24,2,0],angularVelocity:[0,10,0]});
  body.previous.set(1,2,3);world.alpha=.25;const blur=new ObjectMotionBlur(world),data=blur.data;
  blur.update();assert.equal(blur.data,data);assert.ok(data.byteLength<20000);assert.deepEqual([...data.slice(0,7)],[1.5,2.5,3.5,1,24,2,0]);assert.equal(data[9],10);
  body.sleeping=true;blur.update();assert.equal(data[3],0);
  body.sleeping=false;body.velocity.set(0,0,0);body.angularVelocity.set(0,0,0);blur.update();assert.equal(data[3],0);
  blur.setStrength(99);assert.equal(blur.uniforms.objectMotionStrength.value,2);blur.setPaused(true);assert.equal(blur.uniforms.objectMotionExposure.value,0);blur.setPaused(false);assert.equal(blur.uniforms.objectMotionExposure.value,1/60);blur.dispose();
});
test('splat/body membership changes write existing metadata without adding a per-splat motion buffer',()=>{
  const world=new SplatPhysicsWorld(),body=world.createBody(),blur=new ObjectMotionBlur(world),data=new Float32Array(12*4);
  let version=0;const texture={image:{data},set needsUpdate(v){if(v)version++;}};
  blur.engine={windTexture:texture};blur.bindRange(2,3,body);assert.ok(version>0);
  for(let i=0;i<12;i++)assert.equal(data[i*4+3],i>=2&&i<5?31:0);
  assert.equal(blur.data.length,64*Math.ceil(world.capacity*3/64)*4);
});
