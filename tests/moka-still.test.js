import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera, Vector3} from 'three';
import {mokaStillScene} from '../src/splat/mokaStill.js';
import {packSplats} from '../src/splat/math.js';

const scene = mokaStillScene.create();
const luminance = ([r, g, b]) => .2126 * r + .7152 * g + .0722 * b;
const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;
const pinkness = s => s.color[0] - s.color[1];

test('the still life is deterministic, finite and full rank', () => {
  const again = mokaStillScene.create(), middle = scene.splats.length >> 1;
  assert.equal(again.splats.length, scene.splats.length);
  assert.deepEqual(again.splats[middle].center, scene.splats[middle].center);
  assert.ok(scene.splats.length > 6000 && scene.splats.length < 30000);
  for (const s of scene.splats) {
    for (const value of [...s.center, ...s.axes.flat(), ...s.color, s.opacity]) assert.ok(Number.isFinite(value));
    const [a, b, c] = s.axes;
    const determinant = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    assert.ok(Math.abs(determinant) > 1e-12);
  }
  // Authored color only: no bounce or shadow tint is added at runtime.
  assert.ok(scene.lighting.irradiance.every(v => v === 0));
  assert.doesNotThrow(() => packSplats(scene.splats));
});

test('the painting camera frames the pot where the painting has it', () => {
  const {position, target, fov} = mokaStillScene.camera;
  const camera = new PerspectiveCamera(fov, 1, .05, 100);
  camera.position.fromArray(position); camera.lookAt(...target); camera.updateMatrixWorld();
  const pixel = p => { const v = new Vector3(...p).project(camera); return [(v.x + 1) * 540, (1 - v.y) * 540]; };
  // Rim corners, the foot of the base and the knob top, measured on the painting.
  for (const [point, expected] of [[[0, 2.093, .6], [546, 412]], [[-.424, 2.093, .424], [419, 387]], [[0, 0, .579], [545, 962]], [[0, 2.661, 0], [542, 194]]]) {
    const [x, y] = pixel(point);
    assert.ok(Math.hypot(x - expected[0], y - expected[1]) < 8, `${point} lands at ${x.toFixed(0)},${y.toFixed(0)}`);
  }
});

test('the cloth splits cream and pink along the pot axis, and the pot facets follow it', () => {
  const cloth = scene.splats.filter(s => Math.abs(s.center[1]) < .02 && s.center[2] > .6 && Math.abs(s.center[0]) > .3 && Math.abs(s.center[0]) < 2.5);
  assert.ok(mean(cloth.filter(s => s.center[0] < 0).map(pinkness)) < .06);
  assert.ok(mean(cloth.filter(s => s.center[0] > 0).map(pinkness)) > .15);
  const facet = side => scene.splats.filter(s => {
    const [x, y, z] = s.center;
    return y > 1.5 && y < 2 && z > .4 && x * side > .05 && x * side < .3;
  });
  assert.ok(mean(facet(-1).map(pinkness)) < .06);
  assert.ok(mean(facet(1).map(pinkness)) > .15);
});

test('the lamp shadow falls on the wall left of the pot, not to its right', () => {
  const wall = scene.splats.filter(s => s.center[2] < -1.6 && s.center[1] > .4 && s.center[1] < 1.4);
  const band = (x0, x1) => mean(wall.filter(s => s.center[0] > x0 && s.center[0] < x1).map(s => luminance(s.color)));
  assert.ok(band(-1.4, -.7) < band(1, 2) * .8);
});
