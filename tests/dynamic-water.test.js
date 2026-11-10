import test from 'node:test';
import assert from 'node:assert/strict';
import {DynamicWater,MAX_RIPPLES,RIPPLE_LIFETIME,isForestWater,shoreline} from '../src/splat/DynamicWater.js';
import {FOREST_CASCADES,forestHeadwaterHeight} from '../src/splat/ForestWaterfalls.js';

test('all cascade branches descend from the same headwater and end in the lower river',()=>{
  assert.equal(isForestWater(-60,16),false);assert.equal(isForestWater(-41,16),true);
  for(const c of FOREST_CASCADES){
    assert.ok(c.top>c.bottom);
    if(!c.parents.length)assert.equal(c.top,12.6);
    for(const parent of c.parents)assert.equal(FOREST_CASCADES[parent].bottom,c.top);
  }
  // Every branch that feeds no other reaches the lower river. The count of
  // such branches follows the authored network (four since the 7 Nov layout).
  const feeds=new Set(FOREST_CASCADES.flatMap(c=>c.parents)),ends=FOREST_CASCADES.filter((c,i)=>!feeds.has(i));
  assert.ok(ends.length>=3);assert.ok(ends.every(c=>c.bottom<.2));
  assert.ok(FOREST_CASCADES.every((c,i)=>!feeds.has(i)||c.bottom>.2));
});

test('ripples are spatial, deterministic, bounded, and decay to the undisturbed surface',()=>{
  const water=new DynamicWater({amplitude:0});
  assert.equal(water.disturb(0,12,1),true);
  const a=water.sample(1.2,12,2);
  assert.ok(Math.abs(a)>.0001);
  assert.equal(water.sample(1.2,12,2),a);
  assert.ok(Math.abs(water.sample(40,12,2))<1e-10);
  assert.ok(Math.abs(water.sample(1.2,12,2+RIPPLE_LIFETIME))<1e-12);
  assert.equal(water.sample(1.2,12,2),a,'seeking back reproduces the wave');
  for(let i=0;i<100;i++)water.disturb(i%8,12,2+i*.1);
  assert.equal(water.ripples.length,MAX_RIPPLES);
  assert.ok(water.ripples.every(r=>r[2]>10));
});

test('shore and submerged trunks reject disturbances; invalid values never reach uniforms',()=>{
  const water=new DynamicWater({obstacles:[[4,12,2]]});
  assert.equal(water.disturb(4,12,0),false);
  assert.equal(water.disturb(0,shoreline(0)-.01,0),false);
  assert.equal(water.disturb(NaN,12,0),false);
  assert.equal(water.disturb(0,12,Infinity),false);
  assert.equal(water.disturb(0,12,0,50),true);
  assert.equal(water.ripples[0][3],2);
  assert.equal(isForestWater(60,12),false);
});

test('current controls change the surface while obstacle deflection stays bounded over time',()=>{
  const still=new DynamicWater({speed:0}),moving=new DynamicWater({speed:1,obstacles:[[4,12,2]]});
  assert.equal(still.sample(2,12,0),still.sample(2,12,40));
  assert.notEqual(moving.sample(2,12,0),moving.sample(2,12,40));
  for(const t of [0,10,1000,100000])for(let x=0;x<10;x+=.2){
    assert.ok(Math.abs(moving.sample(x,12,t))<=moving.amplitude+1e-8);
    const slope=(moving.sample(x+.04,12,t)-moving.sample(x-.04,12,t))/.08;
    assert.ok(Math.abs(slope)<.2,'long-running currents must not form growing gradients');
  }
});
