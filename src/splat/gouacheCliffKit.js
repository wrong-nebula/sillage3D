import {MathUtils, Vector3} from 'three';

const {clamp, lerp, smoothstep} = MathUtils;
const SIDE = 161;
const MODULES = [
  {id: 'buttress', x: -4.45, width: 3.3, height: 3.65, depth: 1.75, base: [.52, .48, .47]},
  {id: 'fluted-wall', x: 0, width: 3.2, height: 4.65, depth: 1.65, base: [.52, .52, .56]},
  {id: 'stepped-shelf', x: 4.45, width: 3.9, height: 2.95, depth: 2.05, base: [.55, .48, .43]},
];
const LIGHT = new Vector3(-.59, .77, .36).normalize();
const WARM = [.76, .59, .46];
const COOL = [.31, .35, .49];

function tileSampler(data, tile) {
  const at = (x, y, channel) => {
    const i = ((tile * SIDE + y) * SIDE + x) * 4;
    return channel === 0 ? (data[i] + data[i + 1] * 256) / 65535 * 2.6 - 1 : data[i + channel] / 255;
  };
  return (u, v, channel) => {
    const x = clamp((u + 1) / 2, 0, 1) * (SIDE - 1);
    const y = clamp((1 - v) / 2, 0, 1) * (SIDE - 1);
    const col = Math.min(x | 0, SIDE - 2), row = Math.min(y | 0, SIDE - 2);
    return lerp(lerp(at(col, row, channel), at(col + 1, row, channel), x - col),
      lerp(at(col, row + 1, channel), at(col + 1, row + 1, channel), x - col), y - row);
  };
}

function paintCliff(data, index, splats, origin) {
  const module = MODULES[index];
  const sample = tileSampler(data, index);
  const point = new Vector3(), plus = new Vector3(), xAxis = new Vector3(), yAxis = new Vector3(), normal = new Vector3();
  const bedding = new Vector3(1, -.16 + .09 * index, -.04).normalize();
  const stroke = new Vector3(), across = new Vector3();

  function surface(u, v, side, out) {
    const t = (v + 1) / 2;
    const taper = [1 - .24 * t + .12 * smoothstep(t, .12, .3),
      1 - .07 * t - .12 * smoothstep(t, .66, .88),
      1 - .28 * smoothstep(t, .37, .48) - .16 * smoothstep(t, .7, .85)][index];
    const shoulder = [u * .55 - .25 * Math.abs(u - .4),
      -.37 * u - .47 * smoothstep(u, .26, .52),
      -.34 * u - .38 * smoothstep(-u, .28, .58)][index];
    const band = Math.sin(u * 11 - v * 9 + index) * Math.cos(v * 16 + u * 7);
    const shelf = sample(u, v, 0);
    const edge = smoothstep(Math.abs(u), .75, 1);
    const x = module.width * u * taper * .5 + t * [.26, -.27, .24][index] + .06 * band;
    const y = module.height * t + smoothstep(t, .58, 1) * (shoulder + .13 * band);
    const back = -module.depth * .56 - .13 * band - .14 * Math.sin(7 * u + v * 9);
    const front = module.depth * .35 + shelf * .87 - .08 * edge;
    out.set(x + origin[0], y + origin[1], lerp(back, front, (side + 1) / 2) + origin[2]);
  }

  // The six grids meet on the same parametric boundary. Front faces keep
  // more samples for the curvature masks and the shallow chisel marks.
  const faces = [
    {axes: [0, 1], lock: [2, 1], sign: 1, cols: 119, rows: 143},
    {axes: [0, 1], lock: [2, -1], sign: -1, cols: 58, rows: 73},
    {axes: [2, 1], lock: [0, 1], sign: -1, cols: 37, rows: 104},
    {axes: [2, 1], lock: [0, -1], sign: 1, cols: 37, rows: 104},
    {axes: [0, 2], lock: [1, 1], sign: -1, cols: 73, rows: 43},
    {axes: [0, 2], lock: [1, -1], sign: 1, cols: 40, rows: 21},
  ];
  const p = [0, 0, 0];
  for (const face of faces) {
    const [h, k] = face.axes;
    p[face.lock[0]] = face.lock[1];
    for (let row = 0; row < face.rows; row++) {
      for (let col = 0; col < face.cols; col++) {
        const seed = (Math.imul(splats.length + 13, 2654435761) >>> 0) / 4294967296;
        p[h] = (col + .5 + .35 * (seed - .5)) * 2 / face.cols - 1;
        p[k] = (row + .5 + .30 * Math.sin(row * 13 + col * 3)) * 2 / face.rows - 1;
        surface(...p, point);
        const delta = .006;
        p[h] += delta; surface(...p, plus);
        p[h] -= delta * 2; surface(...p, xAxis);
        xAxis.subVectors(plus, xAxis); p[h] += delta;
        p[k] += delta; surface(...p, plus);
        p[k] -= delta * 2; surface(...p, yAxis);
        yAxis.subVectors(plus, yAxis); p[k] += delta;
        normal.crossVectors(xAxis, yAxis).normalize().multiplyScalar(face.sign);

        const paint = smoothstep(p[2], -.6, .99);
        const broad = (sample(p[0], p[1], 2) - .5) * paint;
        const fine = (sample(p[0], p[1], 3) - .5) * paint;
        const crest = clamp(broad * .78 + fine * 1.05, 0, .79);
        const hollow = clamp(-broad * 1.03 - fine * .87, 0, .83);
        const light = Math.max(0, normal.dot(LIGHT));
        const weather = .042 * Math.sin(point.y * 9 + point.x * 4 + point.z * 2)
          * Math.cos(point.x * 2 - point.y * 3) + (seed - .5) * .08;
        const color = module.base.map((channel, c) => {
          const pigment = lerp(lerp(channel, WARM[c], crest), COOL[c], hollow);
          return clamp((pigment + weather) * (.70 + light * .45) - hollow * .036, 0, 1);
        });
        stroke.copy(bedding).addScaledVector(normal, -bedding.dot(normal));
        if (stroke.lengthSq() < .04) stroke.copy(xAxis);
        stroke.normalize();
        across.crossVectors(normal, stroke);
        const width = xAxis.length() / (delta * face.cols);
        const height = yAxis.length() / (delta * face.rows);
        const radius = Math.max(.017, Math.sqrt(width * height) * (.64 + seed * .14));
        splats.push({
          center: point.toArray(),
          axes: [stroke.multiplyScalar(radius * 1.34).toArray(),
            across.multiplyScalar(radius * .80).toArray(), normal.multiplyScalar(radius * .30).toArray()],
          color, opacity: .95, seed, material: 'stone',
        });
      }
    }
  }
}

function createKit() {
  const splats = MODULES.flatMap(module => createGouacheCliff(module.id, [module.x, 0, 0]));
  for (let row = 0; row < 72; row++) {
    for (let col = 0; col < 112; col++) {
      const seed = (Math.imul(row * 112 + col + 3, 2246822519) >>> 0) / 4294967296;
      const x = (col + .5 + .65 * (seed - .5)) * .23 - 12.9;
      const z = (row + .5 + .38 * Math.sin(col * 6 + row * 5)) * .23 - 8.3;
      let shadow = 0;
      for (const module of MODULES) {
        const distance = Math.hypot((x - module.x - .3) / (module.width * .58), (z + .27) / 1.25);
        shadow = Math.max(shadow, 1 - smoothstep(distance, .45, 1.36));
      }
      const wash = Math.cos(x * .66 - z * .32) * .015 + (seed - .5) * .02;
      splats.push({
        center: [x, -.075, z], axes: [[.17, 0, 0], [0, 0, .18], [0, .016, 0]],
        color: [.272, .261, .305].map(channel => (channel + wash) * (1 - shadow * .37)),
        opacity: .98, seed, material: 'stone',
      });
    }
  }
  return {
    splats, background: '#43414d', orbitMin: 9, orbitLimit: 36,
    atmosphere: {color: '#43414d', start: 18, density: .05, max: .85},
    lighting: {
      irradiance: new Float32Array(splats.length * 3),
      shadow: new Float32Array(splats.length),
      stats: {},
    },
  };
}

let cliffData;

export async function loadGouacheCliffs(fetcher = globalThis.fetch) {
  if (cliffData) return;
  const response = await fetcher(`${import.meta.env?.BASE_URL ?? '/'}gouache-cliff-kit/cliffs.bin`);
  if (!response.ok) throw new Error('Could not load the LibreTerrain cliff kit bake.');
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.length !== MODULES.length * SIDE ** 2 * 4) throw new Error('Invalid LibreTerrain cliff kit bake.');
  cliffData = data;
}

export function createGouacheCliff(id, origin = [0, 0, 0]) {
  if (!cliffData) throw new Error('Load the gouache cliff kit before creating a module.');
  const index = MODULES.findIndex(module => module.id === id);
  if (index < 0) throw new Error(`Unknown cliff module: ${id}`);
  const splats = [];
  paintCliff(cliffData, index, splats, origin);
  return splats;
}

export const gouacheCliffKitScene = {
  id: 'gouache-cliff-kit',
  label: 'Gouache cliff kit',
  title: 'Gouache cliff kit',
  description: 'A split buttress, a fluted wall, and a stepped shelf. Two LibreTerrain masks guide warm ridges and cool recesses.',
  caption: 'Three cliff modules · two paint scales',
  swatch: 'gouache-cliff-kit',
  splatBudget: 125_000,
  camera: {position: [1.35, 5.5, 15.7], target: [0, 2.02, 0], fov: 40},
  styleOnVisit: true,
  initialStyle: {
    quality: 'studio', mode: 'ghibli', brushScale: 1.03, coverage: 1.25, softness: .25,
    gouacheTexture: .55, gouacheBlend: .52, gouacheTone: .29,
    indirect: false, tintedShadows: false, sun: false, lensDirt: false, lensFlare: false,
    painterlyVignette: false, foregroundDOF: false,
  },
  prepare: loadGouacheCliffs,
  create() {
    return createKit();
  },
};
