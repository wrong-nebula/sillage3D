import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {scenes,createCanopy} from '../src/splat/scenes.js';
import {buildMeadow} from '../src/splat/meadow.js';

// The registered-scene tests in gaussian-splats.test.js scan every Meadow
// covariance and numeric field. Here we check the composition and copy contract.
const source=createCanopy();
for(const splat of source.splats){
  Object.freeze(splat.center);Object.freeze(splat.color);
  for(const axis of splat.axes)Object.freeze(axis);
  Object.freeze(splat.axes);Object.freeze(splat);
}
Object.freeze(source.splats);Object.freeze(source);
const meadow=buildMeadow(source),{layers,features}=meadow.composition;
const points=name=>meadow.splats.slice(layers[name].start,layers[name].start+layers[name].count);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
const unitNormal=splat=>splat.axes[2].map(value=>value/Math.hypot(...splat.axes[2]));

test('Meadow is separately registered and every feature belongs to a bounded, contiguous layer',()=>{
  assert.ok(scenes.some(scene=>scene.id==='meadow'),'the separate study must participate in generic geometry tests');
  assert.equal(meadow.composition.source,'canopy');assert.equal(meadow.composition.sourceSplatCount,source.splats.length);
  assert.equal(meadow.composition.total,meadow.splats.length);
  let end=0;
  for(const [name,layer] of Object.entries(layers)){
    assert.equal(layer.start,end);assert.ok(layer.count>0);end+=layer.count;
    for(const splat of points(name))for(let axis=0;axis<3;axis++){
      assert.ok(splat.center[axis]>=layer.bounds.min[axis]-1e-9&&splat.center[axis]<=layer.bounds.max[axis]+1e-9,`${name} must fit its declared bounds`);
    }
  }
  assert.equal(end,meadow.splats.length);
  for(const [feature,layer] of [['path','path'],['leftFlowerField','flowers'],['copiedGrove','copiedGrove'],['poplars','poplars'],['rightForegroundShrub','foregroundShrub']]){
    assert.equal(features[feature].count,layers[layer].count);
    assert.deepEqual(features[feature].bounds,layers[layer].bounds);
  }
});

test('the Canopy grove is a deep, editable copy and frozen source data remains deterministic',()=>{
  const original=source.splats.filter(splat=>['wood','foliage','stone'].includes(splat.material));
  const copied=points('copiedGrove'),{scale,translation}=features.copiedGrove;
  assert.equal(copied.length,original.length);assert.equal(copied.length,meadow.composition.copiedSplatCount);
  for(let i=0;i<copied.length;i++){
    const a=original[i],b=copied[i];
    assert.notEqual(a,b);assert.notEqual(a.center,b.center);assert.notEqual(a.color,b.color);assert.notEqual(a.axes,b.axes);
    for(let axis=0;axis<3;axis++)assert.notEqual(a.axes[axis],b.axes[axis]);
    if(i%137===0){
      assert.equal(a.material,b.material);assert.equal(a.seed,b.seed);
      for(let axis=0;axis<3;axis++){
        close(b.center[axis],a.center[axis]*scale+translation[axis]);
        for(let component=0;component<3;component++)close(b.axes[axis][component],a.axes[axis][component]*scale);
      }
    }
  }
  const before=hash(source),again=buildMeadow(source);
  assert.equal(hash(source),before);assert.equal(hash(again),hash(meadow),'all authored marks and metadata must repeat from the same source');
  assert.throws(()=>buildMeadow({splats:[]}),/populated Canopy/);
});

test('the path curves through depth, follows sloped ground and tapers toward the background',()=>{
  const path=points('path'),samples=features.path.samples;
  assert.ok(samples.length>10);
  assert.ok(samples[0].center[2]>20&&samples.at(-1).center[2]<-25);
  assert.ok(samples[0].halfWidth>samples.at(-1).halfWidth);
  assert.ok(features.path.bounds.max[0]-features.path.bounds.min[0]>5,'the path must bend across the meadow');
  assert.ok(features.path.bounds.max[1]-features.path.bounds.min[1]>.3,'path marks must follow actual height variation');
  for(let i=0;i<samples.length;i++){
    const sample=samples[i];assert.ok(sample.halfWidth>0);
    if(i)assert.ok(sample.center[2]<samples[i-1].center[2]);
    let nearest=Infinity;
    for(const splat of path)nearest=Math.min(nearest,Math.hypot(splat.center[0]-sample.center[0],splat.center[1]-sample.center[1],splat.center[2]-sample.center[2]));
    assert.ok(nearest<sample.halfWidth+.6,'the declared route must be occupied by real 3D path splats');
  }
  assert.ok(path.every(splat=>splat.material==='stone'&&unitNormal(splat)[1]>.9));
  assert.ok(path.some(splat=>Math.abs(splat.axes[0][1])>.005),'the path tangent must respond to the ground slope');
});

test('flowers, grove, poplars and the foreground shrub occupy distinct three-dimensional regions',()=>{
  assert.ok(features.leftFlowerField.bounds.max[0]<0);
  assert.ok(features.rightForegroundShrub.bounds.min[0]>0&&features.rightForegroundShrub.bounds.min[2]>0);
  assert.ok(features.copiedGrove.bounds.min[0]>0&&features.copiedGrove.bounds.max[2]<0);
  assert.ok(layers.hills.bounds.max[2]<layers.poplars.bounds.min[2]);
  assert.equal(features.poplars.treeCount,features.poplars.trees.length);assert.ok(features.poplars.treeCount>=5);
  const poplars=points('poplars'),shrub=points('foregroundShrub');
  for(const tree of features.poplars.trees){
    const near=poplars.filter(splat=>Math.hypot(splat.center[0]-tree.base[0],splat.center[2]-tree.base[2])<2.5);
    assert.ok(near.some(splat=>splat.material==='wood'&&splat.center[1]<tree.base[1]+.8),'each poplar needs a grounded trunk');
    assert.ok(near.some(splat=>splat.center[1]>tree.base[1]+tree.height*.9),'each crown must reach its declared height');
  }
  for(const group of [poplars,shrub])for(const [axis,sign] of [[0,-1],[0,1],[2,-1],[2,1]]){
    assert.ok(group.filter(splat=>unitNormal(splat)[axis]*sign>.6).length>100,'foliage volumes must expose sides and backs when orbiting');
  }
});

test('round sky marks remain background while actual cloud volumes can occlude scene optics',()=>{
  const sky=points('sky'),clouds=points('clouds');
  assert.ok(sky.every(splat=>splat.material==='cloud'&&splat.noFog&&splat.skyBackground));
  assert.ok(clouds.every(splat=>splat.material==='cloud'&&splat.noFog&&!splat.skyBackground));
  for(const splat of sky)close(Math.hypot(...splat.axes[0]),Math.hypot(...splat.axes[1]));
  for(const splat of clouds){
    close(Math.hypot(...splat.axes[0]),Math.hypot(...splat.axes[1]));
    close(Math.hypot(...splat.axes[1]),Math.hypot(...splat.axes[2]));
  }
});
