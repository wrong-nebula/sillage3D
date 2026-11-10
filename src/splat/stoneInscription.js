import {MathUtils, Vector3} from 'three';

const {clamp, lerp, smoothstep} = MathUtils;
const SIDE = 513;
const HALF_WIDTH = 16;
const HALF_HEIGHT = 21;
const HALF_DEPTH = 3;
const LIGHT = new Vector3(-.8, .55, .37).normalize();
const SKY = new Vector3(.24, .62, -.73).normalize();
const STONE = [.67, .625, .535];
const LICHEN = [.35, .40, .28];
const SEDIMENT = [.205, .175, .133];

function surfaceSampler(data) {
  return (u, v, offset) => {
    const x = clamp((u + 1) * .5 * (SIDE - 1), 0, SIDE - 1);
    const y = clamp((v + 1) * .5 * (SIDE - 1), 0, SIDE - 1);
    const col = Math.min(x | 0, SIDE - 2), row = Math.min(y | 0, SIDE - 2);
    const index = (row * SIDE + col) * 4;
    const below = index + SIDE * 4;
    const at = offset === 0 ? i => data[i] + data[i + 1] * 256 : i => data[i + offset];
    const value = lerp(lerp(at(index), at(index + 4), x - col),
      lerp(at(below), at(below + 4), x - col), y - row);
    return offset === 0 ? value / 65535 * 2.4 - 1.2 : value / 255;
  };
}

function edgeWear(u, v) {
  const edge = smoothstep(Math.max(Math.abs(u), Math.abs(v)), .84, 1);
  const chip = Math.sin(u * 21 - v * 13 + 2 * Math.sin(v * 6 + u * 8));
  return edge * (.31 + .16 * Math.sin(u * 7 - v * 8) + .31 * smoothstep(chip, .27, .93));
}

function footprint(u, v, out) {
  const wear = edgeWear(u, v);
  const x = HALF_WIDTH * u * Math.sqrt(1 - .14 * v * v) * (1 - v * .025) - u * wear;
  const y = -HALF_HEIGHT * v * Math.sqrt(1 - .11 * u * u) + v * wear;
  return out.set(x + .34 * Math.sin(v * 2.4), y - .25 * u, 0);
}

function createSlab(data) {
  const sample = surfaceSampler(data);
  const splats = [];
  const p = new Vector3(), n = new Vector3(), tangent = new Vector3(), bitangent = new Vector3();
  const right = new Vector3(1, 0, 0), up = new Vector3(0, 1, 0);
  const frontDepth = (u, v) => HALF_DEPTH + sample(u, v, 0) - edgeWear(u, v) * .92;
  const backDepth = (u, v) => -HALF_DEPTH + edgeWear(u, v) * .8
    + .14 * Math.sin(17 * u + 12 * v) * Math.cos(21 * v - 13 * u);

  function mark(spacing, sediment = 0, runoff = 0) {
    const seed = (Math.imul(splats.length + 19, 2246822519) >>> 0) / 4294967296;
    const {x, y, z} = p;
    const patch = Math.sin(.53 * x + .48 * y + .44 * z) * Math.cos(.55 * y - .27 * x)
      + .55 * Math.cos(.91 * x - .88 * y + 1.36 * z);
    const grain = .017 * Math.sin(6.8 * x + 3.4 * z) * Math.sin(8.7 * y - 5.8 * z) + (seed - .5) * .043;
    const moss = smoothstep(patch + runoff * .32, .66, 1.38) * .47;
    const key = Math.max(0, n.dot(LIGHT)), fill = Math.max(0, n.dot(SKY));
    const shade = .59 + .44 * key + .21 * fill - .18 * runoff;
    const color = STONE.map((channel, c) => {
      const pigment = lerp(lerp(channel + grain + patch * .025, LICHEN[c], moss),
        SEDIMENT[c], sediment * .88);
      return clamp(pigment * shade + (c === 2 ? .032 : .013) * fill, 0, 1);
    });
    const axis = Math.abs(n.x) > .86 ? up : right;
    tangent.copy(axis).addScaledVector(n, -axis.dot(n)).normalize();
    bitangent.crossVectors(n, tangent);
    const size = spacing * (.65 + seed * .12);
    splats.push({
      center: p.toArray(),
      axes: [tangent.multiplyScalar(size * 1.04).toArray(),
        bitangent.multiplyScalar(size).toArray(), n.toArray().map(component => component * size * .31)],
      color, opacity: .97, seed, material: 'stone',
    });
  }

  for (const front of [true, false]) {
    const cols = front ? 230 : 94, rows = front ? 292 : 124;
    const depth = front ? frontDepth : backDepth;
    const du = 1 / cols, dv = 1 / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const u = -1 + (col + .5 + .20 * Math.sin(row * 7 + col * 3)) * 2 / cols;
        const v = -1 + (row + .5 + .20 * Math.cos(col * 8 + row * 4)) * 2 / rows;
        footprint(u, v, p);
        p.z = depth(u, v);
        const dx = (depth(u + du, v) - depth(u - du, v)) / (2 * du * HALF_WIDTH);
        const dy = (depth(u, v - dv) - depth(u, v + dv)) / (2 * dv * HALF_HEIGHT);
        n.set(-dx, -dy, 1).normalize().multiplyScalar(front ? 1 : -1);
        mark(2 * HALF_WIDTH / cols, front ? sample(u, v, 2) : 0, front ? sample(u, v, 3) : 0);
      }
    }
  }

  // Continue the edge profile from the carved face around the back.
  for (let edge = 0; edge < 4; edge++) {
    const vertical = edge % 2 === 0;
    const segments = vertical ? 180 : 142;
    const sign = edge < 2 ? 1 : -1;
    for (let i = 0; i < segments; i++) {
      const along = -1 + (i + .5) * 2 / segments;
      const u = vertical ? sign : along, v = vertical ? along : sign;
      const front = frontDepth(u, v), back = backDepth(u, v);
      for (let layer = 0; layer < 30; layer++) {
        const t = (layer + .5) / 30;
        footprint(u, v, p);
        n.set(vertical ? sign : 0, vertical ? 0 : -sign, .30 * Math.cos(Math.PI * t)).normalize();
        const rounding = Math.sin(Math.PI * t);
        const chip = .17 * Math.sin(i * .16 + t * 6) * Math.sin(i * .33 - t * 11);
        p.addScaledVector(n, rounding * (.32 + chip));
        p.z = lerp(front, back, t);
        mark(.18, 0, .18 * rounding);
      }
    }
  }

  return {
    splats, background: '#28312d', orbitMin: 34, orbitLimit: 130, orbitPan: false,
    lighting: {
      irradiance: new Float32Array(splats.length * 3),
      shadow: new Float32Array(splats.length),
      stats: {},
    },
  };
}

let surface;

export const stoneInscriptionScene = {
  id: 'stone-inscription',
  label: 'Rain-worn inscription',
  title: 'Rain-worn inscription',
  description: 'An incised stone tablet with rounded letter edges, mineral streaks, and pigment caught in the grooves.',
  caption: 'LibreTerrain wear study · approx. 42 cm',
  swatch: 'stone-inscription',
  camera: {position: [13, 8, 75], target: [0, 0, 0], fov: 41},
  styleOnVisit: true,
  initialStyle: {
    quality: 'studio', mode: 'gaussian', brushScale: 1, coverage: 1.25, softness: .22,
    indirect: false, tintedShadows: false, sun: false, lensDirt: false, lensFlare: false,
    painterlyVignette: false, foregroundDOF: false,
  },
  async prepare(fetcher = globalThis.fetch) {
    if (surface) return;
    const response = await fetcher(`${import.meta.env?.BASE_URL ?? '/'}stone-inscription/surface.bin`);
    if (!response.ok) throw new Error('Could not load the LibreTerrain inscription bake.');
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length !== SIDE ** 2 * 4) throw new Error('Invalid LibreTerrain inscription bake.');
    surface = data;
  },
  create() {
    return createSlab(surface);
  },
};
