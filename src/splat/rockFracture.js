import {MathUtils, Vector3} from 'three';

const {clamp, lerp, smoothstep} = MathUtils;
const SAMPLE_COUNT = 36_000;
const MAP_SIDE = 513;
const MAP_WIDTH_CM = 32;
const CUT_DEPTH_CM = .17;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LIGHT = new Vector3(-.57, .74, .44).normalize();
const FILL = new Vector3(.72, .35, -.6).normalize();
const BEDDING = new Vector3(-.28, .94, .2).normalize();
const SLATE = [.37, .42, .46];
const OXIDE = [.61, .43, .28];
const MICA = [.67, .67, .59];

// Intersect offset planes to define an irregular, closed stone with distinct faces.
const PLANES = [
  [1, .12, .13, 7.7], [-1, .03, -.22, 7.5],
  [.2, 1, -.16, 4.6], [-.09, -1, .09, 4.2],
  [.17, .07, 1, 5.7], [-.21, .12, -1, 5.8],
  [.54, .65, .55, 5.8], [-.69, .58, .36, 5.2],
  [.65, -.61, .29, 6.2], [-.46, -.66, -.63, 5.8],
  [.55, .42, -.69, 5.6], [-.62, .36, -.51, 5.9],
].map(([x, y, z, distance]) => ({normal: new Vector3(x, y, z).normalize(), distance}));

function mix(x, y, z) {
  return Math.sin(.79 * x + .47 * z) * Math.cos(.81 * y - .72 * z)
    + .46 * Math.sin(1.95 * x - 1.51 * y + 1.23 * z);
}

function fractureSampler(grid) {
  const sample = (x, y) => {
    const u = clamp((.5 + x / MAP_WIDTH_CM) * (MAP_SIDE - 1), 0, MAP_SIDE - 1);
    const v = clamp((.5 + y / MAP_WIDTH_CM) * (MAP_SIDE - 1), 0, MAP_SIDE - 1);
    const col = Math.min(u | 0, MAP_SIDE - 2), row = Math.min(v | 0, MAP_SIDE - 2);
    const i = row * MAP_SIDE + col;
    return lerp(lerp(grid[i], grid[i + 1], u - col),
      lerp(grid[i + MAP_SIDE], grid[i + MAP_SIDE + 1], u - col), v - row) / 255;
  };
  // Blend the same LibreTerrain mask from three axes to avoid a UV seam or poles.
  return ({x, y, z}, normal) => {
    const wx = Math.abs(normal.x) ** 3, wy = Math.abs(normal.y) ** 3, wz = Math.abs(normal.z) ** 3;
    return (wx * sample(z + 3, y - 1) + wy * sample(x - 2, z + 1) + wz * sample(x + 2, y + 2))
      / (wx + wy + wz);
  };
}

export function buildRockSplats({count = SAMPLE_COUNT, variant = 0, inverseRotation} = {}) {
  const fracture = fractureSampler(crackGrid);
  const planes = variant === 0 ? PLANES : PLANES.map((plane, i) => ({
    normal: plane.normal,
    distance: plane.distance * (1 + .21 * Math.sin(variant * 2.73 + i * 2.4)),
  }));
  const key = inverseRotation ? LIGHT.clone().applyQuaternion(inverseRotation) : LIGHT;
  const bounce = inverseRotation ? FILL.clone().applyQuaternion(inverseRotation) : FILL;
  const footprint = Math.sqrt(SAMPLE_COUNT / count);
  const splats = [];
  const surface = new Vector3(), face = new Vector3(), axis = new Vector3();
  const direction = new Vector3(), tangent = new Vector3(), across = new Vector3(), nearby = new Vector3();
  const plus = new Vector3(), u = new Vector3(), v = new Vector3(), normal = new Vector3();
  const colorAxis = new Vector3(), colorAcross = new Vector3();

  function sampleSurface(dir, out) {
    let radius = Infinity, second = Infinity;
    let primary = planes[0].normal, secondary = primary;
    for (const plane of planes) {
      const dot = dir.dot(plane.normal);
      if (dot <= 0) continue;
      const hit = plane.distance / dot;
      if (hit < radius) {
        second = radius; secondary = primary;
        radius = hit; primary = plane.normal;
      } else if (hit < second) {
        second = hit; secondary = plane.normal;
      }
    }
    const join = Math.max(0, 1 - (second - radius) / 1.45);
    face.copy(primary).lerp(secondary, join * .5).normalize();
    out.copy(dir).multiplyScalar(radius - join * join * .36);
    const {x, y, z} = out;
    const lay = out.dot(BEDDING) + mix(x, y, z) * .14;
    const band = Math.sin(lay * 11.5);
    const split = Math.sin(lay * 4.3 + x * .34);
    const erosion = mix(x * .72, y * .72, z * .72);
    const crack = fracture(out, face);
    const pit = smoothstep(mix(5.7 * x, 5.7 * y, 5.7 * z), .52, 1.28);
    const relief = .11 * erosion + .027 * band + .038 * split - .052 * pit - CUT_DEPTH_CM * crack;
    out.addScaledVector(dir, relief);
    return crack;
  }

  for (let i = 0; i < count; i++) {
    const y = 1 - 2 * (i + .5) / count;
    const a = i * GOLDEN_ANGLE, r = Math.sqrt(1 - y * y);
    direction.set(Math.cos(a) * r, y, Math.sin(a) * r);
    const crack = sampleSurface(direction, surface);
    axis.set(0, 1, 0);
    if (Math.abs(y) > .92) axis.set(1, 0, 0);
    tangent.crossVectors(axis, direction).normalize();
    across.crossVectors(direction, tangent);
    // Differentiate the displaced shell to light the walls of the cracks.
    sampleSurface(nearby.copy(direction).addScaledVector(tangent, .009).normalize(), plus);
    sampleSurface(nearby.copy(direction).addScaledVector(tangent, -.009).normalize(), u);
    u.subVectors(plus, u);
    sampleSurface(nearby.copy(direction).addScaledVector(across, .009).normalize(), plus);
    sampleSurface(nearby.copy(direction).addScaledVector(across, -.009).normalize(), v);
    v.subVectors(plus, v);
    normal.crossVectors(u, v).normalize();
    colorAxis.crossVectors(BEDDING, normal);
    if (colorAxis.lengthSq() < .01) colorAxis.copy(u);
    colorAxis.normalize();
    colorAcross.crossVectors(normal, colorAxis);

    const {x, y: h, z} = surface;
    const seed = (Math.imul(i + 13, 2654435761) >>> 0) / 4294967296;
    const strata = surface.dot(BEDDING) + .17 * mix(x, h, z);
    const mica = .46 * smoothstep(Math.sin(strata * 11.5 + .3), .72, .99)
      * smoothstep(mix(x * .42, h * .42, z * .42), -.6, .7);
    const weathering = smoothstep(mix(x * .37 + 5.2, h * .37, z * .37), .1, 1.08) * .66;
    const grit = mix(x * 7.8, h * 7.8, z * 7.8) * .031 + (seed - .5) * .065;
    const lit = Math.max(0, normal.dot(key));
    const fill = Math.max(0, normal.dot(bounce));
    const light = (.67 + lit * .42 + fill * .15) * (1 - crack * .64);
    const color = SLATE.map((channel, c) => {
      const pigment = lerp(lerp(channel, OXIDE[c], weathering), MICA[c], mica);
      return clamp((pigment + grit) * light + [.030, .016, -.007][c] * lit
        + [-.009, .012, .045][c] * fill, 0, 1);
    });
    const size = (.105 + seed * .026) * footprint;
    splats.push({
      center: surface.toArray(),
      axes: [colorAxis.multiplyScalar(size * 1.30).toArray(),
        colorAcross.multiplyScalar(size * .88).toArray(),
        normal.multiplyScalar(.029 * footprint).toArray()],
      color, opacity: .97, seed, material: 'stone',
    });
  }
  return splats;
}

let crackGrid;

export async function loadRockFractures(fetcher = globalThis.fetch) {
  if (crackGrid) return;
  const response = await fetcher(`${import.meta.env?.BASE_URL ?? '/'}rock-fracture/cracks.u8`);
  if (!response.ok) throw new Error('Could not load the LibreTerrain fracture bake.');
  const grid = new Uint8Array(await response.arrayBuffer());
  if (grid.length !== MAP_SIDE ** 2) throw new Error('Invalid LibreTerrain fracture bake.');
  crackGrid = grid;
}

export const rockFractureScene = {
  id: 'rock-fracture',
  label: 'Pocket boulder',
  title: 'Pocket boulder',
  description: 'A hand-sized stone with centimetre-scale LibreTerrain fractures. Drag to orbit and scroll to get closer.',
  caption: 'LibreTerrain fracture study · approx. 16 cm',
  swatch: 'rock-fracture',
  camera: {position: [16, 12, 21], target: [0, 0, 0], fov: 37},
  styleOnVisit: true,
  initialStyle: {
    quality: 'studio', mode: 'gaussian', brushScale: 1, coverage: 1.25, softness: .22,
    indirect: false, tintedShadows: false, sun: false, lensDirt: false, lensFlare: false,
    painterlyVignette: false, foregroundDOF: false,
  },
  prepare: loadRockFractures,
  create() {
    const splats = buildRockSplats();
    return {
      splats, background: '#242d35', orbitMin: 13, orbitLimit: 52, orbitPan: false,
      lighting: {
        irradiance: new Float32Array(splats.length * 3),
        shadow: new Float32Array(splats.length),
        stats: {},
      },
    };
  },
};
