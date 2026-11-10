import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Euler, Matrix4, Vector3} from 'three';
import {projectCovariance, depthOrder, packSplats} from '../src/splat/math.js';

const close = (actual, expected, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} ≠ ${expected}`);
};
const closeArray = (actual, expected, tolerance) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => close(value, expected[i], tolerance));
};
const pixel = ([x, y, z], [fx, fy]) => [-fx * x / z, -fy * y / z];
const identity = new Matrix4().elements;

test('an on-axis Gaussian projects to the expected pixel ellipse and shrinks with distance', () => {
  const axes = [[2, 0, 0], [0, 1, 0], [0, 0, .4]];
  const near = projectCovariance([0, 0, -10], axes, [500, 400], 0);
  const far = projectCovariance([0, 0, -20], axes, [500, 400], 0);
  closeArray(near, [10000, 0, 1600]);
  closeArray(far, near.map(value => value / 4));
  closeArray(projectCovariance([0, 0, -10], axes, [500, 400]), [10000.3, 0, 1600.3]);
});

test('off-axis depth thickness contributes to both image axes and cross-covariance', () => {
  const center = [3, -2, -10];
  const withoutThickness = projectCovariance(center, [[.8, 0, 0], [0, .3, 0]], [600, 500], 0);
  const withThickness = projectCovariance(center, [[.8, 0, 0], [0, .3, 0], [0, 0, 2]], [600, 500], 0);
  closeArray(withThickness.map((v, i) => v - withoutThickness[i]), [1296, -720, 400]);
});

test('projection agrees with numerical perspective derivatives for rotated 3D axes', () => {
  const rotation = new Matrix4().makeRotationFromEuler(new Euler(.42, -.61, .27));
  const axes = [[.8, 0, 0], [0, .35, 0], [0, 0, .17]].map(axis => new Vector3(...axis).applyMatrix4(rotation).toArray());
  const center = [2.3, -1.8, -7.1], focal = [730, 690], h = 1e-5;
  const derivatives = axes.map(axis => {
    const before = pixel(center.map((v, i) => v - h * axis[i]), focal);
    const after = pixel(center.map((v, i) => v + h * axis[i]), focal);
    return after.map((v, i) => (v - before[i]) / (2 * h));
  });
  const expected = derivatives.reduce((sum, [x, y]) => [sum[0] + x * x, sum[1] + x * y, sum[2] + y * y], [0, 0, 0]);
  closeArray(projectCovariance(center, axes, focal, 0), expected, 1e-8);
});

test('camera orbit exposes the third axis instead of retaining a screen-facing ellipse', () => {
  const front = projectCovariance([0, 0, -10], [[2, 0, 0], [0, 1, 0], [0, 0, .2]], [500, 500], 0);
  // A 90-degree Y orbit maps the long world X axis into camera depth.
  const side = projectCovariance([0, 0, -10], [[0, 0, -2], [0, 1, 0], [.2, 0, 0]], [500, 500], 0);
  closeArray(front, [10000, 0, 2500]);
  closeArray(side, [100, 0, 2500]);
  assert.ok(side[0] * side[2] - side[1] ** 2 > 0, 'edge-on splats retain nonzero thickness');
});

test('camera-plane and behind-camera centers are rejected', () => {
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  assert.equal(projectCovariance([0, 0, 0], axes, [500, 500]), null);
  assert.equal(projectCovariance([0, 0, 4], axes, [500, 500]), null);
});

test('depth ordering is far to near and restores author order for ties', () => {
  const centers = new Float32Array([0, 0, -2, 0, 0, -9, 4, 1, -9, 0, 0, 2]);
  const reused = new Uint32Array([3, 2, 1, 0]);
  assert.equal(depthOrder(centers, identity, reused), reused);
  assert.deepEqual([...reused], [1, 2, 0, 3]);
});

test('depth ordering follows camera orientation rather than world Z', () => {
  const centers = new Float32Array([-5, 0, -4, 2, 0, -9, 8, 0, -2]);
  const view = new Matrix4().makeRotationY(Math.PI / 2).setPosition(0, 0, -20);
  assert.deepEqual([...depthOrder(centers, view.elements)], [2, 1, 0]);
});

const sampleSplat = i => ({
  center: [i, i + 1, -i - 2], opacity: .75,
  axes: [[2, 0, 0], [0, 1, 0], [0, 0, .125]],
  color: [.25, .5, .75], seed: i / 8,
});

test('five-texel splat records preserve shader addresses across texture rows', () => {
  const splats = Array.from({length: 3}, (_, i) => sampleSplat(i));
  const packed = packSplats(splats, 8);
  assert.equal(packed.width, 8);
  assert.equal(packed.height, 2);
  for (let i = 0; i < splats.length; i++) {
    const texel = offset => {
      const address = i * 5 + offset;
      const x = address % packed.width, y = Math.floor(address / packed.width);
      return [...packed.data.slice((y * packed.width + x) * 4, (y * packed.width + x + 1) * 4)];
    };
    closeArray(texel(0), [...splats[i].center, .75]);
    closeArray(texel(1), [2, 0, 0, 0]);
    closeArray(texel(2), [0, 1, 0, 0]);
    closeArray(texel(3), [0, 0, .125, 0]);
    closeArray(texel(4), [.25, .5, .75, i / 8]);
  }
  assert.deepEqual([...packed.centers], splats.flatMap(s => s.center));
  assert.ok(packed.data.slice(60).every(value => value === 0), 'unused texel is zero-filled');
});

test('packing rejects oversized textures and invalid numeric data', () => {
  assert.throws(() => packSplats(Array.from({length: 4}, (_, i) => sampleSplat(i)), 4), /GPU texture limit/);
  assert.throws(() => packSplats([{...sampleSplat(0), axes: [[1, 0], [0, 1, 0], [0, 0, 1]]}]), /Invalid splat/);
  assert.throws(() => packSplats([{...sampleSplat(0), center: [0, NaN, 0]}]), /Nonfinite splat/);
});

test('splat material tags preserve geometry and use distinct seed ranges', () => {
  const base={...sampleSplat(2),seed:.25},tags=[
    {}, {noFog:true}, {softParticle:true}, {celPaint:true}, {celPaint:true,softParticle:true},
    {celPaint:true,noFog:true}, {sandGlint:true}, {fishScale:true}, {fishCatchlight:true},
    {reefGlow:0}, {reefGlow:3}, {reefRay:true}, {reefRock:true}, {reefRock:true,celPaint:true},
    {reefMoss:true}, {reefRock:true,reefSeabed:true}, {reefRock:true,reefSeabed:true,celPaint:true},
  ];
  const packed=packSplats(tags.map(tag=>({...base,...tag}))),plain=packSplats([base]).data;
  const flags=[.25,-1.25,2.25,4.25,2.25,-1.25,3.25,5.25,6.25,7.25,10.25,11.25,12.25,13.25,14.25,15.25,16.25];
  for(let i=0;i<tags.length;i++){
    assert.deepEqual(packed.data.slice(i*20,i*20+19),plain.slice(0,19));
    assert.equal(packed.data[i*20+19],flags[i]);
  }
});

const {scenes}=await import('../src/splat/scenes.js');
// Scenes kept only on this machine get the same check, where that file exists.
const {localScenes=[]}=await import('../src/splat/scenes.local.js').catch(()=>({}));
for(const scene of [...scenes,...localScenes]){
  test(`${scene.id}: all-sided 3D splats have finite colors and full-rank orthogonal axes`,async()=>{
    if(scene.prepare)await scene.prepare(async path=>{
      const bytes=await readFile(new URL(`../public${path}`,import.meta.url));
      return {ok:true,json:async()=>JSON.parse(bytes.toString()),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
    });
    const data=scene.create();
    // A scene is substantial unless it declares a small budget, and then it
    // must still fill most of that budget.
    const floor=Math.min(10000,(scene.splatBudget??99999)*.8);
    assert.ok(data.splats.length>floor||(data.splats.length===0&&typeof data.loadActor==='function'));
    assert.ok(data.splats.length<=(scene.splatBudget??99999));
    const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
    for(const splat of data.splats){
      assert.ok(splat.center.every(Number.isFinite));
      assert.ok(splat.color.every(c=>Number.isFinite(c)&&c>=0&&c<=1));
      assert.ok(splat.opacity>0&&splat.opacity<=1);
      const lengths=splat.axes.map(a=>Math.hypot(...a));
      assert.ok(lengths.every(v=>Number.isFinite(v)&&v>0));
      for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)assert.ok(Math.abs(dot(splat.axes[i],splat.axes[j]))/(lengths[i]*lengths[j])<1e-8);
    }
    const second=scene.create();
    assert.equal(data.splats.length,second.splats.length);
    for(let i=0;i<data.splats.length;i+=137)assert.deepEqual(data.splats[i],second.splats[i]);
  });
}

test('indirect radiance occupies reserved channels without changing Gaussian shape or pigment',()=>{
  const s={center:[1,2,3],axes:[[.4,0,0],[0,.2,0],[0,0,.05]],color:[.3,.6,.2],opacity:.9,seed:.7};
  const base=packSplats([s]),lit=packSplats([s],4096,new Float32Array([.1,.3,.05]));
  closeArray([lit.data[7],lit.data[11],lit.data[15]],[.1,.3,.05]);
  for(let i=0;i<20;i++)if(![7,11,15].includes(i))assert.equal(lit.data[i],base.data[i]);
  assert.throws(()=>packSplats([s],4096,new Float32Array([1,2])),/irradiance/);
});
