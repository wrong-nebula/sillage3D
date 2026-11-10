import {Euler, MathUtils, Quaternion, Vector3} from 'three';
import {buildRockSplats, loadRockFractures} from './rockFracture.js';

const {clamp, lerp, smoothstep, degToRad} = MathUtils;
const SIDE = 257;
const WIDTH = 9;
const DEPTH = 8;
const LIGHT = new Vector3(-.57, .74, .44).normalize();
const SLATE = [.39, .445, .48];
const SOIL = [.57, .495, .38];
const GRASS = [.47, .48, .31];

function readGround(grid) {
  const at = (x, y) => grid.getUint16((y * SIDE + x) * 2, true) * 3.5 / 65535;
  return (x, z) => {
    const u = clamp(.5 + x / WIDTH, 0, 1) * (SIDE - 1);
    const v = clamp(.5 + z / DEPTH, 0, 1) * (SIDE - 1);
    const col = Math.min(u | 0, SIDE - 2), row = Math.min(v | 0, SIDE - 2);
    return lerp(lerp(at(col, row), at(col + 1, row), u - col),
      lerp(at(col, row + 1), at(col + 1, row + 1), u - col), v - row);
  };
}

function placeRocks(placements, ground, splats) {
  const rotation = new Quaternion(), p = new Vector3(), angle = new Euler();
  const contacts = [];
  for (const [i, [sourceX, sourceZ, , yaw, size]] of placements.entries()) {
    const x = sourceX - WIDTH / 2, z = sourceZ - DEPTH / 2;
    const variant = 1 + i % 7;
    const metres = size * .01;
    angle.set(.31 * Math.sin(i * 2.13), -degToRad(yaw), .24 * Math.cos(i * 1.69), 'YXZ');
    rotation.setFromEuler(angle);
    const count = Math.round(260 + 86 * size ** 1.54);
    const marks = buildRockSplats({count, variant, inverseRotation: rotation.clone().invert()});
    let bottom = Infinity;
    for (const mark of marks) {
      mark.center = p.fromArray(mark.center).applyQuaternion(rotation).multiplyScalar(metres).toArray();
      bottom = Math.min(bottom, mark.center[1]);
      mark.axes = mark.axes.map(axis => p.fromArray(axis).applyQuaternion(rotation).multiplyScalar(metres).toArray());
    }
    const lift = ground(x, z) - bottom - size * .012;
    for (const mark of marks) {
      mark.center[0] += x;
      mark.center[1] += lift;
      mark.center[2] += z;
      splats.push(mark);
    }
    contacts.push({x, z, radius: .068 * size});
  }
  return contacts;
}

function createRockfall(grid, placements) {
  const escarpment = readGround(grid);
  const height = (x, z) => {
    const outside = Math.hypot(Math.max(0, Math.abs(x) - WIDTH / 2), Math.max(0, Math.abs(z) - DEPTH / 2));
    const grassland = .18 + .045 * Math.sin(x * 1.4 + z * .8) * Math.cos(z * 1.2 - x * .4);
    return lerp(escarpment(x, z), grassland, smoothstep(outside, 0, 3.1));
  };
  const splats = [];
  const contacts = placeRocks(placements, height, splats);
  const normal = new Vector3(), tangent = new Vector3(), across = new Vector3();
  const cols = 260, rows = 222;
  const width = WIDTH + 5, depth = DEPTH + 4;
  const spacing = width / cols;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const key = row * cols + col;
      const seed = (Math.imul(key + 17, 1597334677) >>> 0) / 4294967296;
      const drift = (Math.imul(key + 31, 3812015801) >>> 0) / 4294967296;
      const x = (col + .5 + .68 * (seed - .5)) / cols * width - width / 2;
      const z = (row + .5 + .68 * (drift - .5)) / rows * depth - depth / 2;
      const y = height(x, z);
      const dx = (height(x + .036, z) - height(x - .036, z)) / .072;
      const dz = (height(x, z + .036) - height(x, z - .036)) / .072;
      normal.set(-dx, 1, -dz).normalize();
      tangent.set(1, dx, 0).normalize();
      across.crossVectors(normal, tangent).normalize();

      const noise = Math.sin(x * 5.5 + z * 3.6) * Math.sin(z * 4.1 - x * 3.8);
      const ridge = Math.hypot(dx, dz);
      const exposed = smoothstep(ridge + noise * .18, .37, 1.2);
      const bedding = Math.sin(22 * y + x * 2.4 + z * 3.5 + 1.45 * noise) * exposed;
      const moss = smoothstep(Math.sin(x * 1.48 + z * 1.95) + .7 * noise, .14, 1.2) * (1 - exposed);
      const diffuse = Math.max(0, normal.dot(LIGHT));
      let contact = 0;
      for (const rock of contacts) {
        const d = Math.hypot(x - rock.x, z - rock.z) / rock.radius;
        if (d < 1.6) contact = Math.max(contact, 1 - smoothstep(d, .5, 1.6));
      }
      const shade = (.69 + .43 * diffuse) * (1 - .35 * contact);
      const color = SOIL.map((channel, c) => {
        const pigment = lerp(lerp(channel, GRASS[c], moss * .84), SLATE[c], exposed);
        return clamp((pigment + .028 * noise + .038 * bedding + .04 * (seed - .5)) * shade, 0, 1);
      });
      const reach = spacing * .73;
      const stretch = Math.hypot(1, dx);
      splats.push({
        center: [x, y, z],
        axes: [tangent.setLength(reach * stretch).toArray(),
          across.setLength(reach * Math.hypot(1, dz / stretch)).toArray(), normal.setLength(.011).toArray()],
        color, opacity: .97, seed, material: 'stone',
      });
    }
  }
  return {
    splats, background: '#94a7aa', orbitMin: 3.5, orbitLimit: 24,
    atmosphere: {color: '#94a7aa', start: 10, density: .027, max: .55},
    lighting: {
      irradiance: new Float32Array(splats.length * 3),
      shadow: new Float32Array(splats.length),
      stats: {},
    },
  };
}

let ground, debris;

export const stoneFamilyRockfallScene = {
  id: 'stone-family-rockfall',
  label: 'One stone family',
  title: 'One stone family',
  description: 'A slate outcrop and the fragments below it. LibreTerrain’s talus deposit guides their placement.',
  caption: 'LibreTerrain talus scatter',
  swatch: 'stone-family-rockfall',
  splatBudget: 125_000,
  camera: {position: [3.25, 2.75, 6.85], target: [.05, 1.03, -.54], fov: 47},
  styleOnVisit: true,
  initialStyle: {
    quality: 'studio', mode: 'gaussian', brushScale: 1, coverage: 1.24, softness: .22,
    indirect: false, tintedShadows: false, sun: false, lensDirt: false, lensFlare: false,
    painterlyVignette: false, foregroundDOF: false,
  },
  async prepare(fetcher = globalThis.fetch) {
    if (ground) return;
    const root = `${import.meta.env?.BASE_URL ?? '/'}stone-family-rockfall/`;
    const [height, points] = await Promise.all([
      fetcher(root + 'ground.u16'), fetcher(root + 'debris.json'), loadRockFractures(fetcher),
    ]);
    if (!height.ok || !points.ok) throw new Error('Could not load the LibreTerrain rockfall bake.');
    const [grid, list] = await Promise.all([height.arrayBuffer(), points.json()]);
    if (grid.byteLength !== SIDE ** 2 * 2 || !Array.isArray(list) || !list.length
      || !list.every(point => Array.isArray(point) && point.length === 5 && point.every(Number.isFinite) && point[4] > 0)) {
      throw new Error('Invalid LibreTerrain rockfall bake.');
    }
    debris = list;
    ground = new DataView(grid);
  },
  create() {
    return createRockfall(ground, debris);
  },
};
