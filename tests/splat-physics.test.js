import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';
import {BreakableSplatCluster} from '../src/splat/physics/BreakableSplatCluster.js';
import {CliffWindField} from '../src/splat/physics/CliffWindField.js';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';
import {PARTICLE, SplatParticles} from '../src/splat/physics/SplatParticles.js';
import {packSplats} from '../src/splat/math.js';

const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);
const run = (world, seconds, dt = 1 / 60) => { for (let i = 0; i < Math.round(seconds / dt); i++) world.advance(dt); };

test('sphere collision conserves momentum and restitution; static bodies remain fixed', () => {
  const w = new SplatPhysicsWorld({gravity: [0, 0, 0]});
  const a = w.createBody({position: [-1, 0, 0], velocity: [3, 0, 0], mass: 2, restitution: 1, friction: 0, drag: 0});
  const b = w.createBody({position: [1, 0, 0], velocity: [-1, 0, 0], restitution: 1, friction: 0, drag: 0});
  run(w, .6);
  close(2 * a.velocity.x + b.velocity.x, 5);
  close(b.velocity.x - a.velocity.x, 4);
  const wall = w.createBody({type: 'fixed', position: [4, 0, 0]});
  run(w, 1); assert.deepEqual(wall.position.toArray(), [4, 0, 0]); assert.ok(b.velocity.x < 0);
});

test('fixed ticks are invariant to render cadence and stalled frames obey the work budget', () => {
  const make = () => { const w = new SplatPhysicsWorld({height: () => 0}); w.createBody({position: [0, 3, 0], velocity: [1, 0, 0]}); return w; };
  const a = make(), b = make(); run(a, 2, 1 / 30); run(b, 2, 1 / 120);
  assert.deepEqual(a.bodies[0].position.toArray(), b.bodies[0].position.toArray());
  assert.deepEqual(a.bodies[0].velocity.toArray(), b.bodies[0].velocity.toArray());
  assert.equal(a.advance(10), 12); assert.ok(a.stats.droppedTime > 9.8); assert.ok(a.alpha < 1);
});

test('a resting body sleeps; an impulse and a moving kinematic proxy wake it', () => {
  const w = new SplatPhysicsWorld({height: () => 0});
  const b = w.createBody({position: [0, .5, 0]}); run(w, 2);
  assert.equal(b.sleeping, true); close(b.position.y, .5, .002);
  w.applyImpulse(b, [1, 2, 0]); assert.equal(b.sleeping, false); w.advance(1 / 60); assert.ok(b.position.y > .5);
  w.teleport(b, [0, .5, 0]); b.velocity.set(0, 0, 0); run(w, 3); assert.equal(b.sleeping, true);
  const k = w.createBody({type: 'kinematic', position: [-2, .5, 0]});
  w.setKinematicTarget(k, [1, .5, 0]); w.advance(1 / 30);
  assert.equal(b.sleeping, false); assert.ok(b.velocity.x > 0); close(k.position.x, 1);
});

test('slopes produce tangential motion, friction produces spin, and rapid sphere crossings collide', () => {
  const w = new SplatPhysicsWorld({height: x => .4 * x});
  const b = w.createBody({position: [0, 1, 0], friction: .7}); run(w, 1);
  assert.ok(b.position.x < -.2); assert.ok(b.angularVelocity.length() > .1);
  const fast = new SplatPhysicsWorld({gravity: [0, 0, 0]});
  fast.createBody({type: 'fixed', position: [0, 0, 0], radius: .2});
  const ball = fast.createBody({position: [-1.2, 0, 0], radius: .1, velocity: [150, 0, 0], drag: 0});
  fast.advance(1 / 120); assert.ok(ball.position.x < -.25); assert.ok(ball.velocity.x <= 0);
});

test('broadphase excludes distant pairs, and budgets and nonfinite inputs are checked', () => {
  const w = new SplatPhysicsWorld({gravity: [0, 0, 0], capacity: 100});
  for (let i = 0; i < 100; i++) w.createBody({position: [i * 10, 0, 0]});
  w.advance(1 / 120); assert.equal(w.stats.candidates, 0);
  assert.throws(() => w.createBody(), /budget/); assert.throws(() => w.advance(NaN));
  assert.throws(() => new SplatPhysicsWorld({fixedDt: 0}));
  assert.throws(() => new SplatPhysicsWorld().createBody({radius: -1}));
});

test('fracture transfers ownership and linear momentum while retaining all Gaussian axes', () => {
  const w = new SplatPhysicsWorld({gravity: [0, 0, 0]}); const c = new BreakableSplatCluster(w);
  c.launch(new Vector3(0, 4, 0), new Vector3(2, 1, -3));
  c.body.rotation.setFromAxisAngle(new Vector3(0, 1, 0), .7); c.body.previousRotation.copy(c.body.rotation);
  c.sync(1); const before = c.splats.map(s => [...s.center]);
  const centers = c.splats.map(s => s.center), axes = c.splats.map(s => s.axes);
  assert.equal(c.fracture(), true); assert.equal(c.fracture(), false); c.sync(1);
  const momentum = new Vector3();
  for (const chunk of c.chunks) momentum.addScaledVector(chunk.body.velocity, chunk.body.mass);
  close(momentum.x, 24); close(momentum.y, 12); close(momentum.z, -36);
  assert.equal(c.body.enabled, false);
  for (let i = 0; i < c.splats.length; i++) {
    assert.equal(c.splats[i].center, centers[i]); assert.equal(c.splats[i].axes, axes[i]);
    for (let k = 0; k < 3; k++) close(c.splats[i].center[k], before[i][k]);
  }
  const {data, centers: packed} = packSplats(c.splats), seed = data[19], aux = data[7];
  w.advance(1 / 60); c.sync(w.alpha); c.writePacked(data, packed, 0);
  close(data[19], seed); close(data[7], aux); assert.ok(data.every(Number.isFinite));
  for (let k = 0; k < 3; k++) close(packed[k], c.splats[0].center[k], 1e-6);
});

test('wind is deterministic, exposure shelters particles and gusts increase downwind force', () => {
  const wind = new CliffWindField(), p = new Vector3(2, 3, 4), a = wind.sample(p, 1), b = wind.sample(p, 1);
  assert.deepEqual(a.toArray(), b.toArray()); wind.gust(1); assert.ok(wind.sample(p, 1).length() > a.length() + 5);
  const shelter = new CliffWindField({exposure: () => 0}); assert.ok(shelter.sample(p, 1).length() < .36);
});

test('particle pool is bounded, preserves render objects and collides with terrain and coarse proxies', () => {
  const w = new SplatPhysicsWorld({height: () => 0}); w.createBody({type: 'fixed', position: [0, 1, 0]}); w.advance(1 / 120);
  const pool = new SplatParticles({capacity: 16}), wind = new CliffWindField({strength: 0});
  const center = pool.splats[0].center;
  for (let i = 0; i < 30; i++) pool.emit(PARTICLE.SNOW, new Vector3(0, 1, 0), new Vector3(0, -1, 0));
  pool.update(1 / 120, w, wind); pool.sync();
  assert.equal(pool.snapshot().active, 16); assert.equal(pool.snapshot().recycled, 14); assert.equal(pool.splats[0].center, center);
  for (const s of pool.splats) assert.ok(new Vector3(...s.center).distanceTo(new Vector3(0, 1, 0)) >= .539);
  for (let i = 0; i < 400; i++) pool.update(1 / 120, w, wind);
  pool.sync(); assert.equal(pool.snapshot().active, 0); assert.ok(pool.splats.every(s => s.opacity === 0));
});

test('cliff rockfall fractures on impact; fire, gusts, winter snow and fuel expiry share bounded ticks', () => {
  const cliff = new CliffPhysics(() => 0, [], {clusterCapacity: 2, particleCapacity: 256});
  const player = {position: {x: 0, y: 0, z: 0}, yaw: 0};
  cliff.command('KeyB', player);
  for (let i = 0; i < 180; i++) cliff.update(1 / 60, player);
  assert.equal(cliff.fractures, 1); assert.ok(cliff.clusters[0].chunks.every(c => c.body.enabled));
  cliff.command('KeyH', player); cliff.command('KeyG', player);
  for (let i = 0; i < 60; i++) cliff.update(1 / 60, player, .8);
  const s = cliff.snapshot();
  assert.ok(s.particles.snow > 0 && s.particles.flame > 0 && s.particles.smoke > 0 && s.particles.embers > 0);
  assert.ok(s.wind.gust); assert.ok(s.fire.wetness > 0); assert.ok(s.particles.active <= 256);
  for (let i = 0; i < 2100; i++) cliff.update(1 / 60, player);
  assert.equal(cliff.fire.active, false); assert.equal(cliff.snapshot().particles.active, 0);
  const packed = packSplats(cliff.splats); cliff.writePacked(packed.data, packed.centers, 0); assert.ok(packed.data.every(Number.isFinite));
  cliff.dispose(); assert.equal(cliff.world.bodies.length, 0);
});

test('heat fractures nearby clusters, sustained snow extinguishes fire, and reusing rock slots stays bounded', () => {
  const cliff = new CliffPhysics(() => 0, [], {clusterCapacity: 1, particleCapacity: 128});
  const player = {position: {x: 0, y: 0, z: 0}, yaw: 0};
  cliff.clusters[0].launch(new Vector3(0, .81, 3));
  cliff.clusters[0].body.angularVelocity.set(0, 0, 0);
  cliff.command('KeyH', player);
  for (let i = 0; i < 270; i++) cliff.update(1 / 60, player);
  assert.ok(cliff.clusters[0].heat > 3.5); assert.equal(cliff.fractures, 1);
  for (let i = 0; i < 360; i++) cliff.update(1 / 60, player, 1);
  assert.equal(cliff.fire.active, false); assert.ok(cliff.fire.wetness > .96);
  const count = cliff.world.bodies.length;
  for (let i = 0; i < 20; i++) { cliff.command('KeyB', player); cliff.update(1 / 120, player); }
  assert.equal(cliff.world.bodies.length, count); assert.equal(cliff.clusters.length, 1);
  assert.equal(cliff.snapshot().clusters, 1); assert.ok(cliff.particles.snapshot().active <= 128);
});

test('fire melts physical snow faster than unheated snow at the same position', () => {
  const w = new SplatPhysicsWorld({height: () => 0}), wind = new CliffWindField({strength: 0});
  const cold = new SplatParticles({capacity: 1}), hot = new SplatParticles({capacity: 1});
  for (const p of [cold, hot]) p.emit(PARTICLE.SNOW, new Vector3(0, 1, 0), new Vector3(), {life: 3});
  for (let i = 0; i < 60; i++) {
    cold.update(1 / 120, w, wind);
    hot.update(1 / 120, w, wind, [{active: true, intensity: 1, position: new Vector3(0, 1, 0)}]);
  }
  assert.equal(cold.snapshot().snow, 1); assert.equal(hot.snapshot().snow, 0);
});
