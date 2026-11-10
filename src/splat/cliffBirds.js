import {CatmullRomCurve3, Vector3} from 'three';
import {createDoveFlock} from './doveFlock.js';

const PERIOD = 95;
const ROUTE = [
  [-48, 52, -20], [-15, 59, -38], [30, 56, -27], [57, 31, 3],
  [28, 13, 36], [-13, 14, 31], [-48, 26, 8],
];

export function createCliffBirds(height) {
  const curve = new CatmullRomCurve3(ROUTE.map(point => new Vector3(...point)), true, 'centripetal');
  curve.arcLengthDivisions = 1000;
  const doves = createDoveFlock(height, {pose(time, index) {
    const group = Math.floor(index / 4), formation = index % 4 - 1.5;
    const t = ((time + 14 + group * 29 - (index % 4) * .26) / PERIOD % 1 + 1) % 1;
    const point = curve.getPointAt(t), direction = curve.getTangentAt(t);
    const ahead = curve.getTangentAt((t + .012) % 1);
    const x = point.x - direction.z * formation * 1.55;
    const z = point.z + direction.x * formation * 1.55;
    const y = Math.max(point.y + (index % 3) * .38, height(x, z) + 7);
    const turn = direction.x * ahead.z - direction.z * ahead.x;
    return {position: [x, y, z], yaw: Math.atan2(-direction.z, direction.x),
      bank: Math.max(-.32, Math.min(.32, turn * 2.4))};
  }});
  for (const bird of doves.birds) bird.scale *= .65;
  doves.update(0);
  const seasonalSnow = new Uint8Array(doves.splats.length * 4);
  for (let i = 0; i < doves.splats.length; i++) seasonalSnow[i * 4 + 3] = 96;
  return {
    splats: doves.splats, doves, seasonalSnow, time: 0,
    autoplay: !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    advance(dt) {
      this.time += dt;
      doves.update(this.time);
    },
    writePacked(data, centers, start) {
      for (let i = 0; i < this.splats.length; i++) {
        const splat = this.splats[i], offset = (start + i) * 20;
        data.set(splat.center, offset);
        data[offset + 3] = splat.opacity;
        for (let axis = 0; axis < 3; axis++) data.set(splat.axes[axis], offset + 4 + axis * 4);
        centers.set(splat.center, (start + i) * 3);
      }
    },
    dispose() {},
  };
}
