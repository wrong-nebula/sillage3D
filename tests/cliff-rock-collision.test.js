import test from 'node:test';
import assert from 'node:assert/strict';
import {collideCliffRocks} from '../src/splat/cliffRockCollision.js';
const rock={x:0,z:0,radiusX:2,radiusZ:1,top:2};
const player=(x,y,z,vx=5,vz=0)=>({position:{x,y,z},velocity:{x:vx,z:vz}});
test('large rocks stop a fast crossing and remove inward velocity',()=>{
  const c=player(5,0,0);
  collideCliffRocks(c,{x:-5,z:0},[rock],()=>0);
  assert.ok(c.position.x< -2.43);assert.equal(c.velocity.x,0);
});
test('diagonal movement slides along an elliptical rock without penetrating',()=>{
  const c=player(-1.8,0,.9,3,2);
  collideCliffRocks(c,{x:-3,z:.2},[rock],()=>0);
  assert.ok(Math.hypot(c.position.x/2.44,c.position.z/1.44)>=1);
  assert.ok(c.position.z>.9);assert.ok(c.velocity.z>0);
});
test('flying over a rock clears it, lower flight and slopes still collide',()=>{
  const high=player(5,2.2,0);collideCliffRocks(high,{x:-5,z:0},[rock],()=>0);
  assert.ok(Math.abs(high.position.x-5)<1e-8);
  const low=player(5,.5,0);collideCliffRocks(low,{x:-5,z:0},[rock],()=>0);
  assert.ok(low.position.x< -2.43);
  const uphill=player(5,1.2,0);collideCliffRocks(uphill,{x:-5,z:0},[rock],()=>1);
  assert.ok(Math.abs(uphill.position.x-5)<1e-8);
});
