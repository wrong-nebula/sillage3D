import test from 'node:test';
import assert from 'node:assert/strict';
import {splatSurface,surfaceHighlight,microfacetNormal} from '../src/splat/SplatSurface.js';
const axes=[[.1,0,0],[0,.1,0],[0,0,.01]];
test('rough stone is stable and polished metal has an authored narrow highlight',()=>{
  const stone=splatSurface({material:'stone',axes}),metal=splatSurface({material:'metal',axes});
  assert.ok(stone.roughness>metal.roughness);assert.equal(stone.sparkle,0);assert.equal(metal.metalness,1);
  const color=[.3,.4,.5],seed=.15,n=microfacetNormal([0,0,1],seed),values=[];
  for(let i=-60;i<=60;i++){
    const view=[n[0]+i*.02,n[1],n[2]];
    assert.deepEqual(surfaceHighlight(color,[0,0,1],view,n,stone,seed),color);
    values.push(surfaceHighlight(color,[0,0,1],view,n,metal,seed)[0]);
  }
  assert.ok(Math.max(...values)-Math.min(...values)>.2);
  assert.equal(values[60],Math.max(...values));
  assert.deepEqual(surfaceHighlight(color,[0,0,1],n,n,metal,seed),surfaceHighlight(color,[0,0,1],n,n,metal,seed));
});
test('explicit surface authoring overrides presets, and invalid metadata is rejected',()=>{
  const s=splatSurface({material:'metal',roughness:.72,metalness:.4,sparkle:.2,axes,surfaceNormal:[0,2,0]});
  assert.equal(s.roughness,.72);assert.deepEqual(s.normal,[0,1,0]);
  assert.throws(()=>splatSurface({axes,roughness:NaN}),/roughness/);
  assert.throws(()=>splatSurface({axes,surfaceNormal:[0,0,0]}),/normal/);
});
