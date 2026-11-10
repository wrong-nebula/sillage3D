import test from 'node:test';
import assert from 'node:assert/strict';
import {mengerOccupied, fractalBoundary, createHollowFractal} from '../src/splat/hollowFractal.js';
import {kleinToPoincare, mobiusAdd, hyperbolicDistance, HyperbolicFractal, KLEIN_SCALE, BALL_SCALE} from '../src/splat/HyperbolicFractal.js';

test('Menger subtraction leaves 20^depth cells and open tunnels on all three axes', () => {
  for (let depth = 1; depth <= 3; depth++) {
    const n = 3 ** depth, middle = (n - 1) / 2;
    let count = 0;
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) for (let z = 0; z < n; z++) count += mengerOccupied(x, y, z, depth);
    assert.equal(count, 20 ** depth);
    for (let i = 0; i < n; i++) {
      assert.equal(mengerOccupied(i, middle, middle, depth), false);
      assert.equal(mengerOccupied(middle, i, middle, depth), false);
      assert.equal(mengerOccupied(middle, middle, i, depth), false);
    }
  }
  assert.equal(mengerOccupied(-1, 0, 0), false);
});

test('boundary extraction draws both exterior and cavity walls without internal faces', () => {
  const faces = fractalBoundary();
  assert.equal(faces.length, 18048);
  for (const {cell, axis, sign} of faces) {
    assert.equal(mengerOccupied(...cell), true);
    const adjacent = [...cell]; adjacent[axis] += sign;
    assert.equal(mengerOccupied(...adjacent), false);
  }
  assert.throws(() => fractalBoundary(4), /1–3/);
});

test('fixed-seed paint is reproducible and remains finite and inside the Klein ball', () => {
  const a = createHollowFractal(), b = createHollowFractal();
  assert.deepEqual(a.splats, b.splats);
  assert.equal(a.splats.length, 72192);
  for (const splat of a.splats) {
    assert.ok([...splat.center, ...splat.axes.flat(), ...splat.color].every(Number.isFinite));
    assert.ok(splat.color.every(c => c >= 0 && c <= 1));
    assert.ok(splat.center.reduce((s, v) => s + (v * KLEIN_SCALE) ** 2, 0) < 1);
    assert.ok(splat.axes.every(axis => Math.hypot(...axis) > 0));
  }
});

test('Klein lines project to Poincaré geodesic circles orthogonal to the ideal boundary', () => {
  // Klein y=.4 maps to x²+(y-2.5)²=2.5²-1.
  for (const x of [-.7, -.4, 0, .4, .7]) {
    const p = kleinToPoincare([x, .4, 0]);
    assert.ok(Math.abs(p[0] ** 2 + (p[1] - 2.5) ** 2 - (2.5 ** 2 - 1)) < 1e-12);
  }
  assert.throws(() => kleinToPoincare([1, 0, 0]), /inside/);
});

test('Möbius navigation preserves hyperbolic distances and has an inverse', () => {
  const a = [.29, .16, .23], p = [.3, -.2, .1], q = [-.25, .21, -.15];
  const movedP = mobiusAdd(a, p), movedQ = mobiusAdd(a, q);
  assert.ok(Math.abs(hyperbolicDistance(p, q) - hyperbolicDistance(movedP, movedQ)) < 1e-12);
  const inverse = mobiusAdd(a.map(v => -v), movedP);
  assert.ok(inverse.every((v, i) => Math.abs(v - p[i]) < 1e-12));
});

test('depth sort tracks the same curved coordinates as the shader and Euclidean mode restores originals', () => {
  const original = 'vec3 p=(modelViewMatrix*vec4(center.xyz,1.)).xyz;';
  const engine = {centers: new Float32Array([4, 2, -3, -1, 3, 2]), material: {vertexShader: original, uniforms: {}}};
  const source = engine.centers.slice(), projection = new HyperbolicFractal(engine);
  projection.update(9);
  const a = projection.translation.toArray();
  for (let i = 0; i < source.length; i += 3) {
    const p = kleinToPoincare(Array.from(source.slice(i, i + 3), v => v * KLEIN_SCALE));
    const mapped = mobiusAdd(a, p).map((v, j) => (v - a[j]) * BALL_SCALE);
    mapped.forEach((v, j) => assert.ok(Math.abs(engine.centers[i + j] - v) < 1e-6));
  }
  assert.equal(engine.frustumCulling, false);
  assert.equal(engine.sortDirty, true);
  projection.enabled = false; projection.update(9);
  assert.deepEqual(engine.centers, source);
  projection.dispose(); assert.equal(engine.material.vertexShader, original);
});
