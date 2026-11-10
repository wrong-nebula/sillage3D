/** Three recursive subtractions, sampled only on the remaining solid's boundary. */
export const FRACTAL_DEPTH = 3;
export const FRACTAL_SIZE = 8.1;

export function mengerOccupied(x, y, z, depth = FRACTAL_DEPTH) {
  const width = 3 ** depth;
  if (![x, y, z].every(v => Number.isInteger(v) && v >= 0 && v < width)) return false;
  for (let i = 0; i < depth; i++) {
    if (Number(x % 3 === 1) + Number(y % 3 === 1) + Number(z % 3 === 1) >= 2) return false;
    x = Math.floor(x / 3); y = Math.floor(y / 3); z = Math.floor(z / 3);
  }
  return true;
}

export function fractalBoundary(depth = FRACTAL_DEPTH) {
  if (!Number.isInteger(depth) || depth < 1 || depth > 3) throw new RangeError('Fractal depth must be 1–3.');
  const width = 3 ** depth, faces = [];
  for (let x = 0; x < width; x++) for (let y = 0; y < width; y++) for (let z = 0; z < width; z++) {
    if (!mengerOccupied(x, y, z, depth)) continue;
    for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
      const neighbor = [x, y, z]; neighbor[axis] += sign;
      if (!mengerOccupied(...neighbor, depth)) faces.push({cell: [x, y, z], axis, sign});
    }
  }
  return faces;
}

function hash(i, seed) {
  let t = Math.imul(i + seed, 1597334677);
  t = Math.imul(t ^ t >>> 16, 2246822507);
  return ((t ^ t >>> 13) >>> 0) / 4294967296;
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const LIGHT = [-.45, .73, .51];

export function createHollowFractal({seed = 73129} = {}) {
  const width = 3 ** FRACTAL_DEPTH, cellSize = FRACTAL_SIZE / width;
  const faces = fractalBoundary(), splats = [];
  const occupiedAt = p => mengerOccupied(...p.map(v => Math.floor((v + FRACTAL_SIZE / 2) / cellSize)));
  for (const [faceIndex, {cell, axis, sign}] of faces.entries()) {
    const normal = [0, 0, 0]; normal[axis] = sign;
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const face = cell.map(c => (c + .5) * cellSize - FRACTAL_SIZE / 2);
    face[axis] += sign * cellSize / 2;
    // A short world-space visibility march gives actual tunnels dark interiors.
    const origin = face.map((p, i) => p + normal[i] * .012);
    let visible = 1;
    for (let t = .11; t < FRACTAL_SIZE * 1.75; t += cellSize * .44) {
      const p = origin.map((value, i) => value + LIGHT[i] * t);
      if (p.some(value => Math.abs(value) > FRACTAL_SIZE / 2 + .01)) break;
      if (occupiedAt(p)) { visible = 0; break; }
    }
    const exterior = Math.abs(face[axis]) > FRACTAL_SIZE / 2 - .001;
    const direct = Math.max(0, normal.reduce((sum, n, i) => sum + n * LIGHT[i], 0));
    const skylight = .5 + .5 * normal[1];
    const light = Math.min(1, .08 + .68 * direct * visible + .19 * skylight + (exterior ? .13 : 0));
    const pigment = mix([.115, .235, .32], [.96, .865, .66], light);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const index = faceIndex * 4 + a * 2 + b, grain = hash(index, seed);
      const center = [...face];
      center[u] += ((a + .5) / 2 - .5) * cellSize;
      center[v] += ((b + .5) / 2 - .5) * cellSize;
      const axes = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      axes[0][u] = cellSize * .345;
      axes[1][v] = cellSize * .345;
      axes[2][axis] = sign * cellSize * .019;
      const mineral = .025 * Math.sin(center[0] * 3.1 + center[1] * 5.7 + center[2] * 2.2) + (grain - .5) * .027;
      splats.push({center, axes, color: pigment.map(c => Math.max(0, Math.min(1, c + mineral))),
        opacity: 1, seed: grain, material: 'stone', surfaceNormal: normal});
    }
  }
  return {
    splats, background: '#0b151e', canvasOnSubject: true,
    orbitMin: 5, orbitLimit: 45, orbitPan: true,
    lighting: {irradiance: new Float32Array(splats.length * 3), shadow: new Float32Array(splats.length), stats: {}},
    fractal: {depth: FRACTAL_DEPTH, cells: 20 ** FRACTAL_DEPTH, boundaryFaces: faces.length, seed},
  };
}

export const hollowFractalScene = {
  id: 'hollow-fractal', label: 'Hollow fractal', title: 'An architecture of absence',
  description: 'A hollow mineral cube, with open tunnels repeated at three scales.',
  caption: 'A three-dimensional Menger sponge',
  camera: {position: [13, 8.5, 18], target: [0, 0, 0], fov: 37},
  splatBudget: 73000, styleOnVisit: true, lockStyle: true,
  initialStyle: {
    quality: 'studio', mode: 'paint', brushScale: .87, coverage: 1.3, softness: .07,
    gouacheTexture: .13, gouacheBlend: .22, gouacheTone: .04,
    indirect: false, tintedShadows: false, sun: false, foregroundDOF: false,
    lensDirt: false, lensFlare: false, painterlyVignette: false,
  },
  create: createHollowFractal,
};
