import {Euler, MathUtils, Quaternion, Vector3} from 'three';

const COUNT = 3600;
const LENGTH = .72;
const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(1, 0, 0);
const KEY = new Vector3(-.54, .79, .29).normalize();
const INK = [.15, .17, .21];
const IVORY = [.85, .80, .71];
// Upper pupil points and surface normals sampled from the original textured GLB.
const PUPILS = [
  [[.41507, .05465, -.11198], [.238, .412, -.880]],
  [[.41492, .05114, .11329], [.242, .309, .920]],
];

export function readReefFish(buffer) {
  if (buffer.byteLength !== (1 + COUNT * 9) * 4) throw new Error('Invalid clownfish surface bake.');
  const values = new Float32Array(buffer);
  if (values[0] <= 0 || !values.every(Number.isFinite)) throw new Error('Invalid clownfish surface sample.');
  return values;
}

export class ReefFish {
  constructor(data) {
    this.time = 0;
    this.activity = 'Clownfish swimming';
    this.autoplay = true;
    this.position = new Vector3();
    this.rotation = new Quaternion();
    this.bendRotation = new Quaternion();
    this.finRotation = new Quaternion();
    this.euler = new Euler();
    this.finEuler = new Euler();
    this.scratch = new Vector3();

    this.samples = [];
    this.splats = [];
    const normal = new Vector3(), tangent = new Vector3(), across = new Vector3();
    for (let i = 0; i < COUNT; i++) {
      const offset = 1 + i * 9;
      const seed = (Math.imul(i + 1, 2654435761) >>> 0) / 2 ** 32;
      const radius = data[0] * LENGTH * (.79 + .45 * seed);
      normal.fromArray(data, offset + 3).normalize();
      const direction = Math.abs(normal.x) > .93 ? UP : FORWARD;
      tangent.copy(direction).addScaledVector(normal, -direction.dot(normal)).normalize();
      across.crossVectors(normal, tangent);
      const x = data[offset];
      const y = data[offset + 1], z = data[offset + 2];
      const bend = MathUtils.clamp((.16 - x) / .66, 0, 1);
      const [r, g, b] = data.subarray(offset + 6, offset + 9);
      const value = .25 * r + .62 * g + .13 * b;
      const ink = 1 - MathUtils.smoothstep(value, .045, .26);
      const ivory = MathUtils.smoothstep(value, .61, .92)
        * (1 - MathUtils.smoothstep(Math.max(r, g, b) - Math.min(r, g, b), .11, .31));
      const scumble = .025 * Math.sin(16 * x + 13 * z) * Math.cos(22 * y - 4 * x) + .026 * (seed - .5);
      const pigment = [r * .71 + .12, g * .53 + .09, b * .54 + .19].map((channel, k) =>
        MathUtils.clamp(MathUtils.lerp(MathUtils.lerp(channel, INK[k], ink * .8), IVORY[k], ivory) + scumble, 0, 1));
      const loaded = MathUtils.smoothstep(seed, .52, .94);
      const fin = MathUtils.smoothstep(Math.abs(z), .135, .245)
        * MathUtils.smoothstep(x, .12, .17) * (1 - MathUtils.smoothstep(x, .28, .33))
        * MathUtils.smoothstep(y, -.17, -.11) * (1 - MathUtils.smoothstep(y, .065, .105));
      const tail = MathUtils.smoothstep(-x, .30, .46);
      const medianFin = MathUtils.smoothstep(Math.abs(y), .16, .23)
        * (1 - MathUtils.smoothstep(Math.abs(z), .045, .095))
        * (1 - MathUtils.smoothstep(x, .18, .32));
      const membrane = Math.max(fin, tail, medianFin);
      this.samples.push({
        x, y, z, bend, fin, pigment,
        axes: [tangent.multiplyScalar(radius * (1.28 + .60 * loaded)).toArray(),
          across.multiplyScalar(radius * (.99 - .12 * loaded)).toArray(),
          normal.multiplyScalar(radius * .22).toArray()],
      });
      this.splats.push({
        center: [0, 0, 0], axes: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], color: [0, 0, 0],
        opacity: (.89 + .08 * seed) * (1 - .28 * membrane), seed, material: 'reef-clownfish',
        fishScale: seed > .74 && ink < .58 && x > -.29 && x < .35 && Math.abs(y) < .16
          && Math.abs(z) > .066 && fin < .45,
      });
    }
    for (const [point, direction] of PUPILS) {
      normal.fromArray(direction).normalize();
      tangent.copy(UP).addScaledVector(normal, -UP.dot(normal)).normalize();
      across.crossVectors(normal, tangent);
      const [x, y, z] = new Vector3().fromArray(point).addScaledVector(normal, .012).toArray();
      this.samples.push({x, y, z, bend: 0, fin: 0, pigment: [.97, .98, 1],
        axes: [tangent.multiplyScalar(.0051).toArray(), across.multiplyScalar(.0043).toArray(),
          normal.multiplyScalar(.0018).toArray()]});
      this.splats.push({
        center: [0, 0, 0], axes: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], color: [0, 0, 0],
        opacity: .91, seed: .37, material: 'reef-clownfish-catchlight', fishCatchlight: true,
      });
    }
    this.advance(0);
  }

  advance(dt) {
    this.time += dt;
    const t = this.time;
    // Two slow, continuous pulses alternate short pushes with quieter glides.
    const a = .12 + .235 * t + .115 * Math.sin(.61 * t) + .062 * Math.sin(1.26 * t);
    const pace = .235 + .115 * .61 * Math.cos(.61 * t) + .062 * 1.26 * Math.cos(1.26 * t);
    const effort = MathUtils.smoothstep(pace, .10, .39);
    const sin = Math.sin(a), cos = Math.cos(a);
    const width = 3.56 + .21 * Math.cos(2 * a + .48), depth = 3.28 + .16 * Math.sin(2 * a - .3);
    // Use the path tangent and its grade for the heading and pitch.
    const vx = width * cos - .42 * Math.sin(2 * a + .48) * sin;
    const vz = -depth * sin + .32 * Math.cos(2 * a - .3) * cos;
    const vy = -.48 * Math.sin(2 * a + .9) + .12 * Math.cos(a - .3) + .165 * Math.cos(3 * a - .32);
    this.position.set(width * sin, .17 + .24 * Math.cos(2 * a + .9)
      + .12 * Math.sin(a - .3) + .055 * Math.sin(3 * a - .32), depth * cos);
    const phase = 8.9 * t + .83 * Math.sin(.61 * t) + .48 * Math.sin(1.26 * t);
    const tailPower = .080 + .057 * effort;
    const yaw = Math.atan2(-vz, vx) + .035 * Math.sin(phase - .7);
    const pitch = Math.atan2(vy, Math.hypot(vx, vz));
    const roll = -.037 - .12 * effort + .078 * Math.sin(2 * a + .4) + .024 * Math.sin(phase);
    this.rotation.setFromEuler(this.euler.set(roll, yaw, pitch, 'YZX'));
    const finBeat = t * 12.4 + .59 * Math.sin(1.21 * t);
    const paddle = .39 - .12 * effort;

    const scratch = this.scratch;
    for (let i = 0; i < this.samples.length; i++) {
      const {x, y, z, bend, fin, pigment, axes} = this.samples[i];
      const splat = this.splats[i];
      scratch.set(x, y, z);
      let sweep = 0;
      this.bendRotation.copy(this.rotation);
      if (bend > 0 || fin > .001) {
        const tailPhase = phase + 5.1 * x;
        sweep = tailPower * bend * bend * Math.sin(tailPhase);
        const slope = tailPower * (5.1 * bend * bend * Math.cos(tailPhase) - 2 * bend / .66 * Math.sin(tailPhase));
        this.bendRotation.setFromAxisAngle(UP, -Math.atan(slope));
        if (fin > .001) {
          const side = Math.sign(z), beat = finBeat + side * .65;
          const flap = side * fin * (.08 + paddle * Math.cos(beat));
          const fold = side * fin * (.04 + paddle * .67 * Math.sin(beat));
          this.finRotation.setFromEuler(this.finEuler.set(flap, fold, 0, 'YXZ'));
          const hinge = side * .132;
          scratch.set(x - .278, y - .012, z - hinge).applyQuaternion(this.finRotation);
          scratch.x += .278;
          scratch.y += .012;
          scratch.z += hinge;
          this.bendRotation.multiply(this.finRotation);
        }
        this.bendRotation.premultiply(this.rotation);
      }
      scratch.z += sweep;
      scratch.multiplyScalar(LENGTH).applyQuaternion(this.rotation).add(this.position).toArray(splat.center);
      for (let k = 0; k < 3; k++) scratch.fromArray(axes[k]).applyQuaternion(this.bendRotation).toArray(splat.axes[k]);
      const light = splat.fishCatchlight ? .98 : .77 + .23 * Math.max(0, scratch.normalize().dot(KEY));
      for (let k = 0; k < 3; k++) splat.color[k] = pigment[k] * light;
    }
  }

  writePacked(data, centers, start) {
    for (let i = 0; i < this.splats.length; i++) {
      const splat = this.splats[i], offset = (start + i) * 20;
      const center=splat.center,color=splat.color,axes=splat.axes,address=(start+i)*3;
      // Direct scalar writes avoid converting five small JS arrays per mark.
      // Leave opacity, transit/irradiance channels, and material tags intact.
      data[offset]=centers[address]=center[0];
      data[offset+1]=centers[address+1]=center[1];
      data[offset+2]=centers[address+2]=center[2];
      for(let axis=0;axis<3;axis++){
        const values=axes[axis],destination=offset+4+axis*4;
        data[destination]=values[0];data[destination+1]=values[1];data[destination+2]=values[2];
      }
      data[offset+16]=color[0];data[offset+17]=color[1];data[offset+18]=color[2];
    }
  }

  dispose() {
    this.samples.length = 0;
    this.splats.length = 0;
  }
}
