import {Color, MathUtils, Vector3} from 'three';
import {linearToSrgb} from './irradiance.js';

const {smoothstep} = MathUtils;
const CLAY = new Color('#d97a63');
const TEAL = new Color('#429caf');
const PLASTER = new Color('#ede4cf');
const CERAMIC = new Color('#f3efe5');
const CUT_EDGE = new Color('#8d7867');
const KEY = new Vector3(.48, .79, .46).normalize();
const SPHERE = {x: -1.44, z: -.15, radius: 1.04};
const BLOCK = {x: 1.11, z: -.65, width: 1.62, depth: 1.50, height: 1.43};
const ROOM = {left: -3, right: 3, back: -2.8, front: 2.5, height: 3.7};

// Eight wall patches approximate diffuse reflection from the lit room. Their
// influence is wide and smooth, so the shape survives coarse brush sampling.
const patches = [];
for (const y of [.85, 2.70]) {
  for (const z of [-1.50, 1.16]) {
    patches.push({position: new Vector3(ROOM.left, y, z), normal: new Vector3(1, 0, 0), color: CLAY, area: 4.8});
  }
  for (const x of [-1.68, 1.32]) {
    patches.push({position: new Vector3(x, y, ROOM.back), normal: new Vector3(0, 0, 1), color: TEAL, area: 5.35});
  }
}

function floorContact(p) {
  const soft = Math.exp(-(((p.x - SPHERE.x + .23) / 1.10) ** 2 + ((p.z - SPHERE.z + .15) / 1.07) ** 2));
  const foot = Math.exp(-(((p.x - SPHERE.x) / .44) ** 2 + ((p.z - SPHERE.z - .14) / .66) ** 2));
  const sphere = .54 * soft + .46 * foot;
  const dx = Math.max(0, Math.abs(p.x - BLOCK.x + .15) - BLOCK.width * .46);
  const dz = Math.max(0, Math.abs(p.z - BLOCK.z + .19) - BLOCK.depth * .47);
  const block = Math.exp(-(dx * dx + dz * dz) / .21);
  return Math.max(sphere, block);
}

function createBounceRoom() {
  const started = performance.now();
  const splats = [], incoming = [], shadows = [];
  let seed = 6291;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const direction = new Vector3();
  const point = new Vector3(), tangent = new Vector3(), across = new Vector3();
  const normal = new Vector3(), up = new Vector3(0, 1, 0), forward = new Vector3(0, 0, 1);

  function mark(p, n, u, v, sizeU, sizeV, pigment, type) {
    const grain = random();
    const sun = Math.max(0, n.dot(KEY));
    const wallDistance = Math.min(p.x - ROOM.left, p.z - ROOM.back);
    const edge = type === 'floor' ? (1 - smoothstep(wallDistance, .02, .80)) * .24
      : type === 'wall' ? (1 - smoothstep(p.y, .015, .71)) * .24 : 0;
    const contact = type === 'floor' ? floorContact(p) * .72
      : type === 'object' ? (1 - smoothstep(p.y, .02, .49)) * .28 : 0;
    const visibility = (1 - edge) * (1 - contact);
    const wash = .016 * Math.sin(p.x * 3 + p.y * 4 + p.z * 2) + .028 * (grain - .5);
    const direct = Math.max(.06, (.17 + .65 * sun) * visibility + wash);
    splats.push({
      center: p.toArray(),
      axes: [u.clone().multiplyScalar(sizeU).toArray(), v.clone().multiplyScalar(sizeV).toArray(),
        n.clone().multiplyScalar(.013).toArray()],
      color: pigment.toArray().map(channel => linearToSrgb(channel * direct)),
      opacity: .98, seed: grain, material: 'stone',
    });
    shadows.push(1 - sun * visibility);

    let red = 0, green = 0, blue = 0;
    // Projected patch area and the two cosines give a cheap diffuse form factor.
    // Source color is already linear. The renderer applies receiver albedo.
    for (const patch of patches) {
      direction.subVectors(patch.position, p);
      const distance2 = direction.lengthSq();
      direction.multiplyScalar(1 / Math.sqrt(Math.max(distance2, .001)));
      const receive = Math.max(0, n.dot(direction));
      const emit = Math.max(0, -patch.normal.dot(direction));
      const power = .49 * receive * emit * patch.area / (patch.area + distance2);
      red += patch.color.r * power;
      green += patch.color.g * power;
      blue += patch.color.b * power;
    }
    incoming.push(red * (1 - contact * .39), green * (1 - contact * .39), blue * (1 - contact * .39));
  }

  function panel(origin, horizontal, vertical, facing, width, height, color, type) {
    const u = new Vector3(...horizontal), v = new Vector3(...vertical), n = new Vector3(...facing);
    const corner = new Vector3(...origin);
    const cols = Math.ceil(width / .115), rows = Math.ceil(height / .115);
    const dx = width / cols, dy = height / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        point.copy(corner).addScaledVector(u, (col + .5 + .29 * (random() - .5)) * dx)
          .addScaledVector(v, (row + .5 + .29 * (random() - .5)) * dy);
        mark(point, n, u, v, dx * .71, dy * .67, color, type);
      }
    }
  }

  const roomWidth = ROOM.right - ROOM.left, roomDepth = ROOM.front - ROOM.back;
  panel([ROOM.left, 0, ROOM.back], [1, 0, 0], [0, 0, 1], [0, 1, 0], roomWidth, roomDepth, PLASTER, 'floor');
  panel([ROOM.left, 0, ROOM.back], [0, 0, 1], [0, 1, 0], [1, 0, 0], roomDepth, ROOM.height, CLAY, 'wall');
  panel([ROOM.left, 0, ROOM.back], [1, 0, 0], [0, 1, 0], [0, 0, 1], roomWidth, ROOM.height, TEAL, 'wall');
  panel([ROOM.left, -.15, ROOM.front], [1, 0, 0], [0, 1, 0], [0, 0, 1], roomWidth, .15, CUT_EDGE, 'edge');
  panel([ROOM.right, -.15, ROOM.back], [0, 0, 1], [0, 1, 0], [1, 0, 0], roomDepth, .15, CUT_EDGE, 'edge');

  const {radius} = SPHERE;
  const sphereCenter = new Vector3(SPHERE.x, radius, SPHERE.z);
  const count = 1420, radiusOfSplat = radius * Math.sqrt(4 * Math.PI / count) * .73;
  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + .5) / count;
    const angle = i * 2.3999632297, ring = Math.sqrt(1 - y * y);
    normal.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
    tangent.crossVectors(Math.abs(y) > .91 ? forward : up, normal).normalize();
    across.crossVectors(normal, tangent);
    point.copy(normal).multiplyScalar(radius).add(sphereCenter);
    mark(point, normal, tangent, across, radiusOfSplat, radiusOfSplat * .95, CERAMIC, 'object');
  }

  const {x, z, width, depth, height} = BLOCK;
  const left = x - width / 2, right = x + width / 2, back = z - depth / 2, front = z + depth / 2;
  panel([left, height, back], [1, 0, 0], [0, 0, 1], [0, 1, 0], width, depth, CERAMIC, 'object');
  panel([left, 0, front], [1, 0, 0], [0, 1, 0], [0, 0, 1], width, height, CERAMIC, 'object');
  panel([left, 0, back], [1, 0, 0], [0, 1, 0], [0, 0, -1], width, height, CERAMIC, 'object');
  panel([right, 0, back], [0, 0, 1], [0, 1, 0], [1, 0, 0], depth, height, CERAMIC, 'object');
  panel([left, 0, back], [0, 0, 1], [0, 1, 0], [-1, 0, 0], depth, height, CERAMIC, 'object');

  return {
    splats, background: '#35424a', orbitLimit: 21, canvasOnSubject: true,
    lighting: {
      irradiance: new Float32Array(incoming),
      shadow: new Float32Array(shadows),
      stats: {patchCount: patches.length, bakeMs: performance.now() - started},
    },
  };
}

export const bounceRoomScene = {
  id: 'bounce-room',
  label: 'Bounce room',
  title: 'A study in bounced color',
  description: 'Colored walls bounce warm and cool light onto pale clay. Toggle Color bleed to compare.',
  caption: 'One-bounce lighting study',
  // A deliberately small room: every mark takes part in the bounce bake.
  splatBudget: 9_000,
  camera: {position: [4.5, 5.05, 10.8], target: [-.24, 1.36, -.18], fov: 35},
  styleOnVisit: true,
  initialStyle: {
    quality: 'studio', mode: 'ghibli', brushScale: 1.06, coverage: 1.23, softness: .28,
    gouacheTexture: .41, gouacheBlend: .34, gouacheTone: .17,
    indirect: true, bounceStrength: 1.42, tonePreservation: .27, tintedShadows: false,
    sun: false, lensDirt: false, lensFlare: false, painterlyVignette: false, foregroundDOF: false,
  },
  create: createBounceRoom,
};
