import {Vector3} from 'three';
import {cliffExposure, cliffSurface} from './cliffWall.js';

export function addCliffMeltwater(splats, route, height, sample) {
  const point = new Vector3();
  const positions = route.points.map(([x, z]) => {
    const y = height(x, z);
    const gx = (height(x + .38, z) - height(x - .38, z)) / .76;
    const gz = (height(x, z + .38) - height(x, z - .38)) / .76;
    const normal = new Vector3(-gx, 1, -gz).normalize();
    cliffSurface(x, y, z, gx, gz, cliffExposure(y, gx, gz), sample(x, z, 5), point);
    return point.clone().addScaledVector(normal, .10);
  });
  const along = new Vector3(), across = new Vector3(), normal = new Vector3();
  let distance = 0;
  for (let i = 1; i < positions.length; i++) {
    const a = positions[i-1], b = positions[i];
    const length = a.distanceTo(b);
    if (length < .001) continue;
    along.subVectors(b, a).normalize();
    normal.set(0, 1, .7).addScaledVector(along, -normal.dot(along)).normalize();
    across.crossVectors(along, normal).normalize();
    const count = Math.ceil(length / .23);
    for (let j = 0; j < count; j++) {
      const t = (j + .5) / count;
      const seed = ((i * 191 + j * 37) % 997) / 997;
      splats.push({
        center: point.lerpVectors(a, b, t).toArray(),
        axes: [along.clone().multiplyScalar(length / count * .65).toArray(),
          across.clone().multiplyScalar(.14 + .10 * seed).toArray(), normal.clone().multiplyScalar(.045).toArray()],
        color: [.55 + .20 * seed, .73 + .15 * seed, .80 + .14 * seed],
        opacity: .72, seed, material: 'meltwater', softParticle: true,
        wind: [distance + t * length, 0, seed, 14],
      });
    }
    // Sparse drops fall from the steepest parts of the small channel.
    if (i % 6 === 0 && a.y - b.y > .22) {
      const bottom = positions[Math.min(i + 3, positions.length - 1)];
      for (let j = 0; j < 4; j++) {
        const seed = (j * .249 + i * .137) % 1;
        splats.push({
          center: [a.x + (seed - .5) * .40, a.y, a.z + .18],
          axes: [[.055, 0, 0], [0, .10 + .065 * seed, 0], [0, 0, .045]],
          color: [.81, .91, .96], opacity: .87, seed, material: 'meltwater', softParticle: true,
          wind: [a.y, Math.min(a.y - .15, bottom.y), seed, 13],
        });
      }
    }
    distance += length;
  }
  const toe = positions.at(-1);
  for (let i = 0; i < 24; i++) {
    const angle = i * 2.39996, reach = .08 + .018 * i;
    splats.push({
      center: [toe.x + Math.cos(angle) * reach, toe.y + .025, toe.z + Math.sin(angle) * reach],
      axes: [[.075, 0, 0], [0, .025, 0], [0, 0, .075]],
      color: [.79, .88, .91], opacity: .34, seed: i/24, material: 'meltwater', softParticle: true,
      wind: [distance, 1, i/24, 14],
    });
  }
}
