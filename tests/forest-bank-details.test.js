import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadForestBankDetails,forestBankSample,openingSandHeight,paintForestSandGlitter,createPillarSandField} from '../src/splat/ForestBankDetails.js';
import {shoreline} from '../src/splat/DynamicWater.js';

test('the actual LibreTerrain bake is continuous at mirrored tile boundaries and keeps sand glitter dry',async()=>{
  await loadForestBankDetails(async path=>new Response(await readFile(new URL(`../public${path}`,import.meta.url))));
  for(const x of [-80,-48,-16,16,48,80]){
    assert.ok(Math.abs(forestBankSample(x-1e-6,3)-forestBankSample(x+1e-6,3))<1e-5);
  }
  const splats=[];paintForestSandGlitter(splats,[[0,0,3]]);
  assert.ok(splats.length>1500);
  for(const s of splats){
    const [x,y,z]=s.center;
    assert.ok(shoreline(x)-z>=.2&&shoreline(x)-z<=5.4);
    assert.ok(Math.abs(y-openingSandHeight(x,z)-.016)<1e-9);
    assert.ok(Math.hypot(x,z)>=3);
    assert.ok(s.sandGlint);assert.equal(s.wind,undefined,'grains stay fixed while the viewing angle changes their glints');
  }
});

test('pillar sand accumulates against the root, extends farther downwind, and never enters water',()=>{
  const height=createPillarSandField([{x:0,z:-14,yaw:0,radius:3,outline:new Array(48).fill(3)}]);
  assert.ok(height(2.5,-14)>.7);
  assert.ok(height(6.4,-14+4.8)>height(-6.4,-14-4.8)*3,'the lee tail is longer than the windward shoulder');
  assert.ok(height(30,-14)<.001);
  for(let x=-12;x<=12;x++)assert.equal(height(x,shoreline(x)+.05),0);
  assert.ok(Math.abs(height(3-1e-5,-14)-height(3+1e-5,-14))<1e-4);
});
