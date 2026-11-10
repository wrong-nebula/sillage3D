// A clean procedural walk cycle for a skinned quadruped (the dog: characters/animals/dog/dog-rig.glb, rig_dog.py).
//
// Every joint follows a smooth curve through the stride (forward kinematics: no paw pinning, so a leg only ever bends
// the way a dog's leg bends). Turning comes from the SPINE: the back curves into the turn, chest and head leading and
// the hips following, so the body arcs instead of the legs twisting. Turning on the spot plays the same cycle in place,
// smaller, while the spine leads the body round.
//
// Shape of the cycle (tuned against the reference walk in characters/animals/reference-only, which is study-only):
//   footfall: the four-beat lateral walk, lift-offs at RF 0, LH .22, LF .51, RH .76 of the cycle; each paw in the air
//             ~48% of it
//   front leg: upper arm sweeps fore-aft; elbow folds ~40° mid-swing; the wrist curls the paw back early in the swing
//   hind leg:  thigh sweeps; stifle and hock fold together mid-swing (paw tucks up under the hock)
//   body:      dips twice per cycle; a small sway of the hips and shoulders with each step
//   sit:       q.sit(true/false), a pose solved from the Shiba reference's sit (rump down, front paws planted)
//
// The caller moves and turns the root object (position + rotation.y) as before, then calls update() every frame.
//   const q = new Quadruped(root);  ...  q.update(dt, { look: worldPointOrNull, wag: 0..1.6, sniff: rad })
import * as THREE from 'three';

const LEGS = {   // upper, lower, end, toe; lift-off phase in the cycle
  FR: { bones: ['FR_upperarm', 'FR_forearm', 'FR_paw', 'FR_toe'], off: 0.0, hind: false },
  HL: { bones: ['HL_thigh', 'HL_shin', 'HL_meta', 'HL_toe'], off: 0.22, hind: true },
  FL: { bones: ['FL_upperarm', 'FL_forearm', 'FL_paw', 'FL_toe'], off: 0.51, hind: false },
  HR: { bones: ['HR_thigh', 'HR_shin', 'HR_meta', 'HR_toe'], off: 0.76, hind: true },
};
const SWING = 0.48;                 // share of the cycle a paw is in the air
// sitting hind leg, degrees from straight down (from sitting-dog photos Ryan supplied, 2026-11-04):
//   the stifle is the FRONT of the haunch, about level with the hip: the thigh runs ~horizontally forward (the Shiba
//   reference: +98); the shin runs back-down to the hock on the ground; hock-to-paw lies flat, paw forward. The
//   knees splay out a little (splay = sideways lean of the thigh, share of its length).
const SIT = { thigh: 106, shin: 42, splay: 0.24, shinIn: -0.18, pawIn: -0.04, foreRake: 10 };   // lateral leans: + out, - in (share of length)   // foreRake: front legs lean forward a touch, deg
const _q = new THREE.Quaternion(), _pw = new THREE.Quaternion(), _bw = new THREE.Quaternion(), _rq = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const smooth = (t) => (t = Math.min(1, Math.max(0, t)), t * t * (3 - 2 * t));
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(Math.PI * (t - a) / (b - a)) ** 2);   // 0 > 1 > 0 over [a,b]

function worldRotate(bone, q) {
  bone.parent.getWorldQuaternion(_pw); bone.getWorldQuaternion(_bw);
  bone.quaternion.copy(_pw.invert().multiply(q).multiply(_bw)); bone.updateMatrixWorld(true);
}

export class Quadruped {
  constructor(root, opts = {}) {
    this.root = root; this.b = {};
    this.maxSpeed=opts.maxSpeed??2.5;
    root.traverse((o) => { if (o.isBone) this.b[o.name] = o; });
    this.rest = new Map(Object.values(this.b).map((o) => [o, o.quaternion.clone()]));
    this.pelvisRest = this.b.pelvis.position.clone();
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root); this.h = box.max.y - box.min.y;
    // which way each leg bone turns about its own x axis to swing its far end FORWARD (bone axes differ per rig)
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_rq));
    const sign = (bone) => {
      const child = bone.children.find((c) => c.isBone); if (!child) return 1;
      const p0 = child.getWorldPosition(new THREE.Vector3()), q0 = bone.quaternion.clone();
      bone.quaternion.multiply(_q.setFromAxisAngle(X, 0.05)); bone.updateMatrixWorld(true);
      const d = child.getWorldPosition(new THREE.Vector3()).sub(p0).dot(fwd);
      bone.quaternion.copy(q0); bone.updateMatrixWorld(true); return d >= 0 ? 1 : -1;
    };
    this.legs = {};
    for (const [k, d] of Object.entries(LEGS)) {
      const bs = d.bones.map((n) => this.b[n]); if (bs.some((x) => !x)) continue;
      const hip = bs[0].getWorldPosition(new THREE.Vector3()), paw = bs[3].getWorldPosition(new THREE.Vector3());
      this.legs[k] = { ...d, bs, s: bs.map(sign), len: hip.y - paw.y };
    }
    this.legLen = Object.values(this.legs).reduce((s, l) => s + l.len, 0) / Object.keys(this.legs).length;
    this.sitPose = this.buildSit();
    this.sitW = 0; this.sitOn = false; this.breathT = 0;
    this.phase = 0; this.amp = 0; this.lastPos = root.position.clone(); this.lastYaw = root.rotation.y;
    this.vel = new THREE.Vector3(); this.turn = 0; this.headYaw = 0; this.wagT = 0;
    this.K = {
      stride: 0.62,          // body travel per cycle, share of the dog's height (reference: ~62%)
      turnRadius: 0.35,      // turning on the spot advances the cycle like walking this far round, × height
      elbow: 0.70, carpus: 1.25, stifle: 0.75, hock: 0.85, toe: 0.5,   // fold at mid-swing, rad
      sweepMax: 0.5,         // max fore-aft sweep of the upper leg bones, rad each way
      inPlace: 0.35,         // sweep when stepping on the spot (share of a walking sweep)
      bend: 0.11,            // spine curve per rad/s of turning
      bob: 0.022,            // body dip, × height
      ...opts.K,
    };
  }

  update(dt, o = {}) {
    if (dt <= 0) return;
    const root = this.root, B = this.b, K = this.K;
    // body motion, from how the caller moved and turned the root
    const dp = _a.subVectors(root.position, this.lastPos); dp.y = 0;
    if (dp.length() > 0.6) { this.reset(); dp.set(0, 0, 0); }                 // a teleport: don't run to catch up
    dp.divideScalar(dt); if (dp.length() > this.maxSpeed) dp.setLength(this.maxSpeed);
    this.vel.lerp(dp, Math.min(1, dt * 10)); this.lastPos.copy(root.position);
    let dy = root.rotation.y - this.lastYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.lastYaw = root.rotation.y;
    this.turn += (THREE.MathUtils.clamp(dy / dt, -3.5, 3.5) - this.turn) * Math.min(1, dt * 6);   // clamp: no spine whip
    const speed = this.vel.length(), turnTravel = Math.abs(this.turn) * K.turnRadius * this.h;
    const travel = speed + turnTravel;
    // the cycle advances with distance (paws don't skate), fades out when the dog stops
    const strideLen = K.stride * this.h;
    this.phase = (this.phase + travel * dt / strideLen) % 1;
    this.amp += ((travel > 0.03 ? 1 : 0) - this.amp) * Math.min(1, dt * (travel > 0.03 ? 6 : 3));
    // stance sweep matches the ground travel; stepping on the spot is a smaller sweep
    const walkSweep = Math.min(K.sweepMax, Math.asin(Math.min(0.95, strideLen * (1 - SWING) / 2 / this.legLen)));
    const onSpot = turnTravel / Math.max(travel, 1e-4);
    const sweep = walkSweep * (1 - onSpot * (1 - K.inPlace)) * Math.min(1, travel / (0.25 * this.h) + 0.35);

    for (const [bone, q] of this.rest) bone.quaternion.copy(q);
    B.pelvis.position.copy(this.pelvisRest);

    // ---- legs ----
    const rot = (bone, s, a) => { if (a) bone.quaternion.multiply(_q.setFromAxisAngle(X, a * s)); };
    for (const l of Object.values(this.legs)) {
      const t = (this.phase - l.off + 1) % 1;             // 0 = lift-off; swing until SWING, then stance
      // upper bone: back > forward through the swing (eased), forward > back through the stance (steady, paw on ground)
      const u = t < SWING ? -1 + 2 * smooth(t / SWING) : 1 - 2 * ((t - SWING) / (1 - SWING));
      const fold = bump(t, 0, SWING) * this.amp;           // 0..1 over the swing
      const early = bump(t, 0, SWING * 0.75) * this.amp;   // peaks earlier: the paw curls as it leaves the ground
      const [up, lo, end, toe] = l.bs, [s0, s1, s2, s3] = l.s;
      if (!l.hind) {
        rot(up, s0, u * sweep * this.amp + 0.25 * fold);   // the upper arm lifts a little forward as the elbow folds
        rot(lo, s1, -K.elbow * fold);                     // elbow folds: forearm swings back under
        rot(end, s2, -K.carpus * early + 0.35 * fold);    // wrist curls the paw back, then reaches forward to land
        rot(toe, s3, -K.toe * early);
      } else {
        rot(up, s0, u * sweep * this.amp + 0.2 * fold);
        rot(lo, s1, -K.stifle * fold);                    // stifle folds: shin swings back
        rot(end, s2, K.hock * fold);                      // hock folds: the paw tucks forward under it
        rot(toe, s3, -K.toe * early);
      }
    }

    // ---- sit: ease into / out of the solved sit pose (down ~1 s, up ~0.6 s); no walking while seated ----
    this.sitW += ((this.sitOn ? 1 : 0) - this.sitW) * Math.min(1, dt * (this.sitOn ? 3.2 : 5));
    const sw = smooth(this.sitW);
    if (sw > 1e-3) {
      for (const [bone, q] of this.sitPose.q) bone.quaternion.slerp(q, sw);
      B.pelvis.position.lerp(this.sitPose.pelvis, sw);
      // breathing while seated: the chest lifts a touch
      this.breathT += dt; if (B.spine) B.spine.quaternion.multiply(_q.setFromAxisAngle(X, 0.025 * sw * Math.sin(this.breathT * 2.4)));
    }

    // ---- body: dip twice per cycle, sway with the steps, curve into the turn ----
    root.updateMatrixWorld(true);
    const dip = K.bob * this.h * this.amp * (0.5 - 0.5 * Math.cos(this.phase * Math.PI * 4));
    if (dip > 1e-5) {
      const pw = B.pelvis.parent.matrixWorld.clone().invert();
      B.pelvis.position.copy(B.pelvis.getWorldPosition(_a).add(_b.set(0, -dip, 0)).applyMatrix4(pw)); root.updateMatrixWorld(true);
    }
    const sway = 0.05 * this.amp * Math.sin(this.phase * Math.PI * 2);
    const bend = THREE.MathUtils.clamp(this.turn * K.bend, -0.45, 0.45);
    // hips lag (turn away a little), the back and neck lead: the body becomes an arc through the turn
    if (B.pelvis) worldRotate(B.pelvis, _q.setFromAxisAngle(UP, -0.35 * bend + sway));
    if (B.spine) worldRotate(B.spine, _q.setFromAxisAngle(UP, 0.8 * bend - 1.6 * sway));
    // head: into the turn, toward what it watches
    let want = bend * 0.9;
    if (o.look) {
      const hp = (B.head || B.neck2).getWorldPosition(_a), dir = _b.subVectors(o.look, hp); dir.y = 0;
      const f = _c.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_rq)); f.y = 0;
      want = THREE.MathUtils.clamp(Math.atan2(f.z * dir.x - f.x * dir.z, f.dot(dir)), -1.1, 1.1);
    }
    this.headYaw += (want - this.headYaw) * Math.min(1, dt * 4);
    for (const [n, k] of [['neck', 0.35], ['neck2', 0.35], ['head', 0.3]]) if (B[n]) worldRotate(B[n], _q.setFromAxisAngle(UP, this.headYaw * k));
    // the head nods a little with each step
    if (B.head) { const side = _a.set(1, 0, 0).applyQuaternion(root.getWorldQuaternion(_rq)); worldRotate(B.head, _q.setFromAxisAngle(side, 0.04 * this.amp * Math.sin(this.phase * Math.PI * 4) + (o.sniff ?? 0))); }
    // tail: wags, and swings out of the turn
    this.wagT += dt * (6 + 11 * (o.wag ?? 0.3)) * (o.wagRate ?? 1);   // wagRate: a dog's own tempo (dogs.js)
    const wag = (o.wag ?? 0.3) * 0.45 * Math.sin(this.wagT) - bend * 0.6;
    for (const [n, k] of [['tail1', 0.5], ['tail2', 0.8], ['tail3', 1]]) if (B[n]) worldRotate(B[n], _q.setFromAxisAngle(UP, wag * k));
  }

  // ---- sitting (modelled on the Shiba reference's sit; see characters/animals/reference-only) ----
  // Shiba sit, measured: body tips up ~50°, hips drop to ~14% of standing head height; front legs stay as standing;
  // hind legs fold flat: thigh forward along the ground, shin back-down to the hock, hock flat with the paw forward;
  // neck more upright, nose level. Here the tilt is SOLVED for Bruno: hips rest on the ground while the front paws
  // stay planted under the shoulders. Computed once from the rest pose; update() blends toward it.
  sit(on = true) { this.sitOn = !!on; }
  get sitting() { return this.sitW > 0.98; }
  buildSit() {
    const B = this.b, root = this.root, save = new Map([...this.rest.keys()].map((b) => [b, b.quaternion.clone()])), pel0 = B.pelvis.position.clone();
    root.updateMatrixWorld(true);
    const rq = root.getWorldQuaternion(new THREE.Quaternion()), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rq), side = new THREE.Vector3(1, 0, 0).applyQuaternion(rq);
    const ground = new THREE.Box3().setFromObject(root).min.y, H = this.h;
    const P = (n) => B[n].getWorldPosition(new THREE.Vector3());
    this.hindLen = { thigh: P('HL_thigh').distanceTo(P('HL_shin')), shin: P('HL_shin').distanceTo(P('HL_meta')) };
    // point bone `b` (from its joint to its child joint) along a direction in the body's side plane:
    // deg 0 = straight down, +90 = forward, -90 = back, ±180 = up; keeps its small sideways lean
    const point = (b, deg, out = null) => {
      const c = b.children.find((x) => x.isBone); if (!c) return;
      const p = b.getWorldPosition(new THREE.Vector3()), cur = c.getWorldPosition(new THREE.Vector3()).sub(p), len = cur.length();
      const ownLat = cur.dot(side) / len, lat = out === null ? ownLat : Math.sign(p.clone().sub(root.getWorldPosition(new THREE.Vector3())).dot(side) || 1) * out, r = Math.sqrt(Math.max(0, 1 - lat * lat)), a = THREE.MathUtils.degToRad(deg);
      const want = fwd.clone().multiplyScalar(Math.sin(a) * r).addScaledVector(UP, -Math.cos(a) * r).addScaledVector(side, lat);
      worldRotate(b, new THREE.Quaternion().setFromUnitVectors(cur.normalize(), want.normalize()));
    };
    const pose = (pitchDeg) => {
      for (const [b, q] of save) b.quaternion.copy(q); B.pelvis.position.copy(pel0); root.updateMatrixWorld(true);
      const hipW = B.HL_thigh.getWorldPosition(new THREE.Vector3()).add(B.HR_thigh.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
      // tip the body up about the hips (pelvis is the skeleton's root, so everything follows)
      const pq = new THREE.Quaternion().setFromAxisAngle(side, -THREE.MathUtils.degToRad(pitchDeg));
      const pw = B.pelvis.getWorldPosition(new THREE.Vector3()), off = pw.clone().sub(hipW).applyQuaternion(pq);
      worldRotate(B.pelvis, pq);
      const inv = B.pelvis.parent.matrixWorld.clone().invert();
      // hip height comes from the folded hind leg: hock on the ground, shin rising forward to the stifle, thigh level
      // back to the hip. (Dropping the hip joint itself to the floor leaves no room for the fold and squashes the leg.)
      const hipTo = hipW.clone(); hipTo.y = ground + 0.03 * H + this.hindLen.shin * Math.cos(THREE.MathUtils.degToRad(SIT.shin)) + this.hindLen.thigh * Math.cos(THREE.MathUtils.degToRad(SIT.thigh));
      B.pelvis.position.copy(hipTo.clone().add(off).applyMatrix4(inv)); root.updateMatrixWorld(true);
      // front legs straight down like standing (Shiba: -19, +4, +17), paw forward on the ground
      for (const k of ['FL', 'FR']) { point(B[k + '_upperarm'], -15 + SIT.foreRake); point(B[k + '_forearm'], 3 + SIT.foreRake); point(B[k + '_paw'], 12); point(B[k + '_toe'], 85); }
      // hind legs in the Z of a real sit: thigh forward-down, shin back-down to the hock, hock-to-paw flat and forward
      for (const k of ['HL', 'HR']) { point(B[k + '_thigh'], SIT.thigh, SIT.splay); point(B[k + '_shin'], -SIT.shin, SIT.shinIn); point(B[k + '_meta'], 90, SIT.pawIn); point(B[k + '_toe'], 90, SIT.pawIn); }   // paws tucked in under the body
      // neck up, nose level (Shiba: +140, +142, +84); tail resting behind on the ground
      if (B.neck) point(B.neck, 140); if (B.neck2) point(B.neck2, 150); if (B.head) point(B.head, 100);   // a touch below the Shiba's 84: Bruno's skull sits higher, this levels his nose
      for (const [n, d] of [['tail1', -110], ['tail2', -95], ['tail3', -85]]) if (B[n]) point(B[n], d);
      root.updateMatrixWorld(true);
      // how far the front paws are above (+) or below (-) the ground
      return Math.min(...['FL', 'FR'].map((k) => B[k + '_toe'].getWorldPosition(new THREE.Vector3()).y)) - (ground + 0.01 * H);
    };
    // solve the tilt so the front paws just touch the ground (bisection between a shallow and a steep sit)
    let lo = 15, hi = 70;
    // paws in the air = tipped up too far
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (pose(mid) > 0) hi = mid; else lo = mid; }
    this.sitPitch = (lo + hi) / 2; pose(this.sitPitch);
    const out = { q: new Map([...save.keys()].map((b) => [b, b.quaternion.clone()])), pelvis: B.pelvis.position.clone() };
    for (const [b, q] of save) b.quaternion.copy(q); B.pelvis.position.copy(pel0); root.updateMatrixWorld(true);
    return out;
  }

  // after a teleport
  reset() { this.lastPos.copy(this.root.position); this.lastYaw = this.root.rotation.y; this.vel.set(0, 0, 0); this.turn = 0; }
}
