import test from 'node:test';
import assert from 'node:assert/strict';
import {mountainCloudOffset} from '../src/splat/cloudMotion.js';
import {createGhibli} from '../src/splat/ghibli.js';

test('all distant cloud banks begin at their authored positions and stay near the ridge',()=>{
 const scene=createGhibli(),layer=scene.composition.layers.clouds,banks=scene.splats.slice(layer.start,layer.start+layer.count);
 assert.equal(banks.length,312);
 for(const s of banks){
  assert.ok(s.wind[0]<0);assert.equal(s.wind[3],4);
  assert.ok(Math.hypot(...mountainCloudOffset(0,s.wind[2]))<1e-10);
  for(let t=0;t<900;t+=3)assert.ok(Math.hypot(...mountainCloudOffset(t,s.wind[2]))<5.1);
 }
});
