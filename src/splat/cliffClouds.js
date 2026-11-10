import {Euler, Quaternion, Vector3} from 'three';
import {buildCloudBank} from './ghibliClouds.js';

let templates;

function cloudTemplates() {
  if (templates) return templates;
  const normal = new Vector3(), tangent = new Vector3(), across = new Vector3();
  templates = Array.from({length: 4}, (_, index) => {
    let seed = 7103 + index * 3127;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const marks = [];
    buildCloudBank({
      rnd, index, cloud: {center: [0, 0, 0], radius: 1, phase: 0, background: true},
      mark(center, direction, flow, width, length, depth, color, material, extra) {
        normal.fromArray(direction).normalize();
        tangent.fromArray(flow).addScaledVector(normal, -tangent.dot(normal)).normalize();
        across.crossVectors(normal, tangent);
        marks.push({center, color, material, seed: rnd(), ...extra,
          axes: [tangent.clone().multiplyScalar(length).toArray(),
            across.clone().multiplyScalar(width).toArray(), normal.clone().multiplyScalar(depth).toArray()]});
      },
    });
    return marks;
  });
  return templates;
}

export function addCliffClouds(splats) {
  const forms = cloudTemplates();
  const rotation = new Quaternion(), angle = new Euler(), point = new Vector3();
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const index = row * 6 + col;
      const x = -160 + col * 64 + 5 * Math.sin(index * 2.31);
      const z = -144 + row * 80 + 5 * Math.cos(index * 1.73);
      const radius = 16.5 + 2.8 * Math.sin(index * 1.91);
      const anchor = new Vector3(x, 84, z);
      rotation.setFromEuler(angle.set(0, .27 * Math.sin(index * 2.13), 0));
      for (const mark of forms[index % forms.length]) {
        const center = point.fromArray(mark.center).applyQuaternion(rotation).multiplyScalar(radius)
          .add(anchor).toArray();
        const axes = mark.axes.map(axis => point.fromArray(axis).applyQuaternion(rotation).multiplyScalar(radius).toArray());
        splats.push({...mark, center, axes, wind: [x, z, index * .37, 4]});
      }
    }
  }
}
