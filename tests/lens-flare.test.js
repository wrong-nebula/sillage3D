import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera, Vector3} from 'three';
import {flareGhosts, FLARE_GHOSTS, projectSolarDisc} from '../src/splat/lensFlare.js';
import {SUN_DEFAULTS, solarDirection, solarRadius} from '../src/splat/PainterlySun.js';

const close = (actual, expected, tolerance = 1e-10) => assert.ok(
  Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} ≠ ${expected}`,
);
const closeArray = (actual, expected, tolerance) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => close(value, expected[i], tolerance));
};
const options = overrides => ({...SUN_DEFAULTS, sunAzimuth:0, sunElevation:0, ...overrides});
function camera(fov = 42, aspect = 16 / 9) {
  const result = new PerspectiveCamera(fov, aspect, .08, 600);
  result.updateMatrixWorld(true);
  return result;
}

test('solar visibility projection is invariant to camera translation and far distance', () => {
  const view = camera(), config = options({sunAzimuth:16, sunElevation:12});
  view.rotation.set(.13, -.19, .06);
  const before = projectSolarDisc(view, config);
  view.position.set(1000, -72, 345);
  view.far = 20000;
  view.updateProjectionMatrix();
  const after = projectSolarDisc(view, config);
  for (const key of ['center', 'u', 'v']) closeArray(after[key], before[key]);
});

test('centered solar radii match perspective FOV and remain circular across aspect ratios', () => {
  const height = 800;
  for (const aspect of [16 / 9, 1, 9 / 16]) {
    const view = camera(42, aspect), result = projectSolarDisc(view, options());
    closeArray(result.center, [.5, .5]);
    const expectedVertical = solarRadius(1) / (2 * Math.tan(view.fov * Math.PI / 360));
    close(Math.abs(result.u[0]), expectedVertical / aspect);
    close(Math.abs(result.v[1]), expectedVertical);
    close(result.u[1], 0); close(result.v[0], 0);
    close(Math.abs(result.u[0]) * height * aspect, Math.abs(result.v[1]) * height);
  }
});

test('narrower FOV and larger solar size scale the sampled solar footprint', () => {
  const wide = projectSolarDisc(camera(60), options());
  const narrow = projectSolarDisc(camera(30), options());
  const expectedZoom = Math.tan(Math.PI / 6) / Math.tan(Math.PI / 12);
  close(Math.abs(narrow.v[1] / wide.v[1]), expectedZoom);
  const doubled = projectSolarDisc(camera(60), options({sunSize:2}));
  close(doubled.v[1] / wide.v[1], solarRadius(1, 2) / solarRadius(1, 1));
});

test('oblique solar axes agree with finite-difference projection of a tangent disc', () => {
  const view = camera(58, 9 / 16);
  view.position.set(4, -3, 9);view.rotation.set(.09, -.14, .12);view.updateMatrixWorld(true);
  const config = options({sunAzimuth:25, sunElevation:15, sunSize:1.4});
  const direction = new Vector3(...solarDirection(config.sunAzimuth, config.sunElevation));
  const tangent = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize();
  const bitangent = new Vector3().crossVectors(direction, tangent);
  const distance = 80, radius = solarRadius(distance, config.sunSize), h = 1e-3;
  const center = view.position.clone().addScaledVector(direction, distance);
  const uv = point => {
    const p = point.project(view);
    return [.5 + p.x * .5, .5 + p.y * .5];
  };
  const derivative = axis => {
    const left = uv(center.clone().addScaledVector(axis, -radius * h));
    const right = uv(center.clone().addScaledVector(axis, radius * h));
    return right.map((value, i) => (value - left[i]) / (2 * h));
  };
  const result = projectSolarDisc(view, config);
  closeArray(result.center, uv(center.clone()));
  closeArray(result.u, derivative(tangent), 1e-8);
  closeArray(result.v, derivative(bitangent), 1e-8);
});

test('disabled, dark and behind-camera suns cannot drive a flare', () => {
  const view = camera();
  assert.equal(projectSolarDisc(view, options({sun:false})), null);
  assert.equal(projectSolarDisc(view, options({sunIntensity:0})), null);
  assert.equal(projectSolarDisc(view, options({sunAzimuth:180})), null);
  assert.equal(projectSolarDisc(view, options({sunAzimuth:90})), null);
  view.rotation.y = Math.PI;
  const visibleAfterOrbit = projectSolarDisc(view, options({sunAzimuth:180}));
  assert.ok(visibleAfterOrbit);
  closeArray(visibleAfterOrbit.center, [.5, .5]);
});

test('ghosts follow the source-to-center axis at the six source-model offsets', () => {
  const source = [.18, .73], axis = source.map(value => .5 - value);
  const ghosts = flareGhosts(source);
  assert.equal(ghosts.length, 6);
  assert.deepEqual(FLARE_GHOSTS, [[.42,.016],[.78,.034],[1.22,.012],[1.46,.055],[1.9,.024],[2.6,.085]]);
  for (let i = 0; i < ghosts.length; i++) {
    const displacement = ghosts[i].center.map((value, k) => value - source[k]);
    close(displacement[0] * axis[1] - displacement[1] * axis[0], 0);
    closeArray(ghosts[i].center, source.map((value, k) => value + axis[k] * FLARE_GHOSTS[i][0]));
    close(ghosts[i].radius, FLARE_GHOSTS[i][1]);
  }
  assert.ok(ghosts[0].center[0] < .5 && ghosts[2].center[0] > .5, 'ghosts cross the optical center');
});

test('ghost scale changes radii only; positions and tints remain deterministic', () => {
  const source = [.2, .3], original = [...source], first = flareGhosts(source), scaled = flareGhosts(source, 1.7);
  assert.deepEqual(flareGhosts(source), first);
  assert.deepEqual(source, original);
  for (let i = 0; i < first.length; i++) {
    close(scaled[i].radius, first[i].radius * 1.7);
    assert.deepEqual(scaled[i].center, first[i].center);
    assert.deepEqual(scaled[i].tint, first[i].tint);
    assert.ok(first[i].tint.every(value => value >= 0 && value <= 1));
  }
  first[0].center[0] = -99;first[0].tint[0] = -99;
  assert.ok(flareGhosts(source)[0].center[0] >= 0, 'callers cannot mutate later results');
  assert.ok(flareGhosts(source)[0].tint[0] >= 0);
  for (const ghost of flareGhosts([.5,.5])) closeArray(ghost.center, [.5,.5]);
});
