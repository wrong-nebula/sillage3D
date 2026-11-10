// Frozen v1 implementation for reproducible CPU A/B profiling only.
import {Quaternion, Vector3} from 'three';

const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
};
const vector = (value, fallback = [0, 0, 0]) => {
  const v = value ?? fallback;
  const result = new Vector3(v.x ?? v[0], v.y ?? v[1], v.z ?? v[2]);
  for (const n of result.toArray()) finite(n, 'vector component');
  return result;
};

/** CPU sphere-proxy solver. One body can drive thousands of anisotropic splats.
 * Fixed ticks, bounded motion substeps, spatial hashing and sleeping keep work
 * proportional to physical objects rather than the size of the paint field.
 * Motion substeps are a tunnelling mitigation, not exact continuous collision.
 */
export class SplatPhysicsWorld {
  constructor({height = () => -1e6, gravity = [0, -9.81, 0], fixedDt = 1 / 120,
    maxSteps = 12, maxMotionSteps = 16, iterations = 5, capacity = 256} = {}) {
    if (!(finite(fixedDt, 'fixedDt') > 0) || ![maxSteps, maxMotionSteps, iterations, capacity].every(n => Number.isInteger(n) && n > 0)) {
      throw new RangeError('Physics budgets must be positive');
    }
    this.height = height; this.gravity = vector(gravity); this.fixedDt = fixedDt;
    this.maxSteps = maxSteps; this.maxMotionSteps = maxMotionSteps; this.iterations = iterations; this.capacity = capacity;
    this.bodies = []; this.accumulator = 0; this.time = 0; this.alpha = 0;
    this.contacts = []; this.contactCount = 0; this.grid = new Map(); this.bucketPool = [];
    this.delta = new Vector3(); this.relative = new Vector3(); this.tangent = new Vector3();
    this.impulse = new Vector3(); this.spin = new Vector3();
    this.stats = {ticks: 0, candidates: 0, contacts: 0, active: 0, sleeping: 0, motionSteps: 0, motionBudgetHits: 0, droppedTime: 0};
  }

  createBody({position, velocity, angularVelocity, radius = .5, mass = 1,
    type = 'dynamic', restitution = .18, friction = .6, drag = .04,
    windResponse = 0, enabled = true, canSleep = true} = {}) {
    if (this.bodies.length >= this.capacity) throw new RangeError('Splat physics body budget exhausted');
    if (!['dynamic', 'fixed', 'kinematic'].includes(type) || !(finite(radius, 'radius') > 0)
      || !(finite(mass, 'mass') > 0) || ![restitution, friction, drag, windResponse].every(n => Number.isFinite(n) && n >= 0)
      || restitution > 1) throw new RangeError('Invalid body description');
    const p = vector(position), inverseMass = type === 'dynamic' ? 1 / mass : 0;
    const body = {id: this.bodies.length, type, position: p, previous: p.clone(), velocity: vector(velocity),
      angularVelocity: vector(angularVelocity), rotation: new Quaternion(), previousRotation: new Quaternion(),
      radius, mass, inverseMass, inverseInertia: 2.5 * inverseMass / (radius * radius),
      restitution, friction, drag, windResponse, enabled, canSleep, sleeping: false, idle: 0, supported: false,
      impact: 0, target: p.clone()};
    this.bodies.push(body); return body;
  }

  wake(body) { body.sleeping = false; body.idle = 0; }
  applyImpulse(body, impulse) {
    if (!body.inverseMass || !body.enabled) return;
    const value = vector(impulse);
    body.velocity.addScaledVector(value, body.inverseMass); this.wake(body);
  }
  teleport(body, position) {
    body.position.copy(vector(position)); body.previous.copy(body.position); body.target.copy(body.position); this.wake(body);
  }
  setKinematicTarget(body, position) {
    if (body.type !== 'kinematic') throw new Error('Expected a kinematic body');
    body.target.copy(vector(position));
  }

  advance(dt, {beforeStep, afterStep, wind} = {}) {
    if (!(finite(dt, 'dt') >= 0)) throw new RangeError('dt must be nonnegative');
    const budget = this.fixedDt * this.maxSteps;
    this.stats.droppedTime += Math.max(0, dt - budget);
    this.accumulator += Math.min(dt, budget);
    const tickCount = Math.min(this.maxSteps, Math.floor((this.accumulator + 1e-12) / this.fixedDt));
    if (tickCount) for (const b of this.bodies) if (b.enabled && b.type === 'kinematic') {
      b.velocity.subVectors(b.target, b.position).multiplyScalar(1 / (tickCount * this.fixedDt));
    }
    let steps = 0;
    while (this.accumulator + 1e-12 >= this.fixedDt && steps < this.maxSteps) {
      beforeStep?.(this.fixedDt, this.time);
      this.step(this.fixedDt, wind);
      this.time += this.fixedDt; afterStep?.(this.fixedDt, this.time);
      this.accumulator = Math.max(0, this.accumulator - this.fixedDt); steps++;
    }
    this.alpha = this.accumulator / this.fixedDt;
    this.stats.active = this.bodies.filter(b => b.enabled && b.inverseMass && !b.sleeping).length;
    this.stats.sleeping = this.bodies.filter(b => b.enabled && b.sleeping).length;
    return steps;
  }

  step(dt, wind) {
    let motionSteps = 1;
    for (const b of this.bodies) {
      if (!b.enabled) continue;
      b.previous.copy(b.position); b.previousRotation.copy(b.rotation); b.impact = 0; b.supported = false;
      if (b.type !== 'fixed' && !b.sleeping) motionSteps = Math.max(motionSteps,
        Math.ceil((b.velocity.length() + this.gravity.length() * dt) * dt / (b.radius * .4)));
    }
    if (motionSteps > this.maxMotionSteps) this.stats.motionBudgetHits++;
    motionSteps = Math.min(motionSteps, this.maxMotionSteps);
    this.stats.motionSteps = motionSteps; this.stats.candidates = 0; this.stats.contacts = 0;
    const h = dt / motionSteps;
    for (let sub = 0; sub < motionSteps; sub++) {
      for (const b of this.bodies) {
        if (!b.enabled || b.type === 'fixed' || b.sleeping) continue;
        if (b.inverseMass) {
          b.velocity.addScaledVector(this.gravity, h);
          if (wind && b.windResponse) {
            wind.sample(b.position, this.time + sub * h, this.delta);
            b.velocity.lerp(this.delta, 1 - Math.exp(-b.windResponse * h));
          }
          b.velocity.multiplyScalar(Math.exp(-b.drag * h));
          b.angularVelocity.multiplyScalar(Math.exp(-b.drag * h));
        }
        b.position.addScaledVector(b.velocity, h);
        const q = b.rotation, w = b.angularVelocity, x = q.x, y = q.y, z = q.z, a = q.w, half = h * .5;
        q.set(x + half * (w.x * a + w.y * z - w.z * y), y + half * (-w.x * z + w.y * a + w.z * x),
          z + half * (w.x * y - w.y * x + w.z * a), a - half * (w.x * x + w.y * y + w.z * z)).normalize();
      }
      this.detect();
      for (let iteration = 0; iteration < this.iterations; iteration++) {
        for (let i = 0; i < this.contactCount; i++) this.solve(this.contacts[i], iteration === 0);
      }
    }
    for (const b of this.bodies) {
      if (!b.enabled || !b.inverseMass || b.sleeping) continue;
      if (b.canSleep && b.supported && b.velocity.lengthSq() < .0049 && b.angularVelocity.lengthSq() < .01) {
        b.idle += dt;
        if (b.idle > .75) { b.sleeping = true; b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); }
      } else b.idle = 0;
    }
    this.stats.ticks++;
  }

  contact(a, b, nx, ny, nz, depth) {
    const c = this.contacts[this.contactCount] ??= {normal: new Vector3()};
    c.a = a; c.b = b; c.normal.set(nx, ny, nz); c.depth = depth;
    this.contactCount++; this.stats.contacts++;
    if (ny < -.4) a.supported = true;
    if (b && ny > .4) b.supported = true;
  }

  detect() {
    this.contactCount = 0;
    for (const bucket of this.grid.values()) { bucket.length = 0; this.bucketPool.push(bucket); }
    this.grid.clear();
    let cellSize = .1;
    for (const b of this.bodies) if (b.enabled) cellSize = Math.max(cellSize, 2 * b.radius);
    this.cellSize = cellSize;
    for (const b of this.bodies) {
      if (!b.enabled) continue;
      const p = b.position, x = Math.floor(p.x / cellSize), y = Math.floor(p.y / cellSize), z = Math.floor(p.z / cellSize);
      b.cellX = x; b.cellY = y; b.cellZ = z;
      const key = `${x},${y},${z}`;
      if (!this.grid.has(key)) this.grid.set(key, this.bucketPool.pop() ?? []);
      this.grid.get(key).push(b);
      if (!b.inverseMass || b.sleeping) continue;
      const height = this.height(p.x, p.z);
      const gx = (this.height(p.x + .05, p.z) - this.height(p.x - .05, p.z)) / .1;
      const gz = (this.height(p.x, p.z + .05) - this.height(p.x, p.z - .05)) / .1;
      const length = Math.hypot(gx, 1, gz), depth = b.radius - (p.y - height) / length;
      if (depth > 0) this.contact(b, null, gx / length, -1 / length, gz / length, depth);
    }
    for (const a of this.bodies) {
      if (!a.enabled) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const bucket = this.grid.get(`${a.cellX + dx},${a.cellY + dy},${a.cellZ + dz}`);
        if (!bucket) continue;
        for (const b of bucket) {
          if (b.id <= a.id || (!a.inverseMass && !b.inverseMass) || (a.sleeping && (b.sleeping || b.type === 'fixed'))
            || (b.sleeping && a.type === 'fixed')) continue;
          this.stats.candidates++;
          this.delta.subVectors(b.position, a.position);
          const distance = this.delta.length(), reach = a.radius + b.radius;
          if (distance >= reach) continue;
          if (distance > 1e-9) this.delta.multiplyScalar(1 / distance); else this.delta.set(1, 0, 0);
          this.contact(a, b, this.delta.x, this.delta.y, this.delta.z, reach - distance);
        }
      }
    }
  }

  /** One-way particle projection against the last tick's broadphase. */
  projectParticle(point, radius, out) {
    out.copy(point);
    if (!this.cellSize) return out;
    const x = Math.floor(point.x / this.cellSize), y = Math.floor(point.y / this.cellSize), z = Math.floor(point.z / this.cellSize);
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const bucket = this.grid.get(`${x + dx},${y + dy},${z + dz}`);
      if (!bucket) continue;
      for (const b of bucket) {
        if (!b.enabled) continue;
        this.delta.subVectors(out, b.position);
        const distance = this.delta.length(), reach = radius + b.radius;
        if (distance >= reach) continue;
        if (distance < 1e-9) this.delta.set(0, 1, 0); else this.delta.multiplyScalar(1 / distance);
        out.copy(b.position).addScaledVector(this.delta, reach + .0001);
      }
    }
    return out;
  }

  solve(c, correct) {
    const {a, b, normal: n} = c, inverseMass = a.inverseMass + (b?.inverseMass ?? 0);
    if (!inverseMass) return;
    if (correct) {
      const correction = Math.max(0, c.depth - .0005) * .85 / inverseMass;
      a.position.addScaledVector(n, -correction * a.inverseMass);
      if (b) b.position.addScaledVector(n, correction * b.inverseMass);
    }
    // Contact-point velocity includes the tangential spin of each spherical proxy.
    this.relative.copy(b?.velocity ?? this.delta.set(0, 0, 0)).sub(a.velocity);
    this.spin.crossVectors(a.angularVelocity, n); this.relative.addScaledVector(this.spin, -a.radius);
    if (b) { this.spin.crossVectors(b.angularVelocity, n); this.relative.addScaledVector(this.spin, -b.radius); }
    const speed = this.relative.dot(n);
    if (speed >= 0) return;
    const bounce = speed < -.7 ? Math.min(a.restitution, b?.restitution ?? a.restitution) : 0;
    const impulse = -(1 + bounce) * speed / inverseMass;
    const energy = .5 * speed * speed / inverseMass;
    a.impact = Math.max(a.impact, energy);
    if (b) b.impact = Math.max(b.impact, energy);
    a.velocity.addScaledVector(n, -impulse * a.inverseMass);
    if (b) b.velocity.addScaledVector(n, impulse * b.inverseMass);
    this.tangent.copy(this.relative).addScaledVector(n, -speed);
    const slip = this.tangent.length();
    if (slip > 1e-9) {
      this.tangent.multiplyScalar(1 / slip);
      const effective = inverseMass + a.radius ** 2 * a.inverseInertia + (b ? b.radius ** 2 * b.inverseInertia : 0);
      const friction = Math.min(slip / effective, impulse * Math.sqrt(a.friction * (b?.friction ?? a.friction)));
      this.impulse.copy(this.tangent).multiplyScalar(friction);
      a.velocity.addScaledVector(this.impulse, a.inverseMass);
      this.spin.crossVectors(n, this.impulse); a.angularVelocity.addScaledVector(this.spin, a.radius * a.inverseInertia);
      if (b) {
        b.velocity.addScaledVector(this.impulse, -b.inverseMass);
        b.angularVelocity.addScaledVector(this.spin, b.radius * b.inverseInertia);
      }
    }
    if (speed < -.15) { if (a.sleeping) this.wake(a); if (b?.sleeping) this.wake(b); }
  }

  snapshot() { return {...this.stats, bodies: this.bodies.filter(b => b.enabled).length, time: this.time, alpha: this.alpha}; }
  dispose() { this.bodies.length = 0; this.contacts.length = 0; this.grid.clear(); this.bucketPool.length = 0; }
}
