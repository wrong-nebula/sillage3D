import {Vector3, Quaternion} from 'three';
import {createHollowFractal, fractalBoundary, hollowFractalScene, FRACTAL_SIZE} from './hollowFractal.js';

const TAU = Math.PI * 2;
const gold = [1, .73, .29], ice = [.23, .91, 1], lilac = [.78, .55, 1];
const V = p => new Vector3(...p);
const colorMix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);
function mark(splats, center, normal, tangent, a, b, color, opacity = 1, luminous = false) {
  const n = normal.clone().normalize(), u = tangent.clone().normalize();
  const v = new Vector3().crossVectors(n, u).normalize();
  splats.push({center: center.toArray(), axes: [u.multiplyScalar(a).toArray(), v.multiplyScalar(b).toArray(), n.multiplyScalar(.006).toArray()],
    color, opacity, seed: ((Math.imul(splats.length + 71, 2654435761) >>> 0) / 4294967296), material: luminous ? 'light' : 'stone'});
}
function beam(splats, from, to, radius, color) {
  const along = to.clone().sub(from), length = along.length(); along.normalize();
  const across = new Vector3().crossVectors(along, Math.abs(along.y) > .9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)).normalize();
  const side = new Vector3().crossVectors(along, across).normalize();
  const count = Math.max(2, Math.ceil(length / (radius * 3.8)));
  for (let i = 0; i <= count; i++) {
    const p = from.clone().lerp(to, i / count);
    mark(splats, p, side, along, length / count * .68, radius, color, .98, true);
    mark(splats, p, across, along, length / count * .68, radius, color, .98, true);
  }
}
function triangle(splats, vertices, resolution, pigment) {
  const [a, b, c] = vertices;
  const u = b.clone().sub(a), v = c.clone().sub(a), n = new Vector3().crossVectors(u, v).normalize();
  const step = Math.max(u.length(), v.length()) / resolution;
  const light = .25 + .75 * Math.max(0, n.dot(new Vector3(-.4, .7, .6)));
  for (let i = 0; i < resolution; i++) for (let j = 0; j < resolution - i; j++) {
    const p = a.clone().addScaledVector(u, (i + .32) / resolution).addScaledVector(v, (j + .32) / resolution);
    mark(splats, p, n, u, step * .63, step * .55, pigment.map(c => c * light));
  }
}
function finish(splats, facts = {}) {
  return {splats, background: '#030710', canvasOnSubject: true, orbitMin: 5, orbitLimit: 45,
    lighting: {irradiance: new Float32Array(splats.length * 3), shadow: new Float32Array(splats.length), stats: {}}, fractal: facts};
}

export function createLuminousMenger() {
  const definition = createHollowFractal(), splats = definition.splats;
  for (const s of splats) {
    const light = Math.max(0, Math.min(1, (s.color[0] - .115) / .845));
    s.color = colorMix([.018, .031, .078], [.12, .32, .39], light);
  }
  // Only real creases: omit every edge shared by coplanar surface tiles.
  // Level-two edges remain readable instead of outlining all 8,000 cells.
  const faces = fractalBoundary(2), membership = new Set(faces.map(f => `${f.cell}/${f.axis}/${f.sign}`));
  const seen = new Set(), step = FRACTAL_SIZE / 9;
  for (const {cell, axis, sign} of faces) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (const edgeAxis of [u, v]) for (const side of [-1, 1]) {
      const adjacent = [...cell]; adjacent[edgeAxis] += side;
      if (membership.has(`${adjacent}/${axis}/${sign}`)) continue;
      const along = edgeAxis === u ? v : u;
      const start = cell.map(c => (c + .5) * step - FRACTAL_SIZE / 2);
      start[axis] += sign * step / 2; start[edgeAxis] += side * step / 2; start[along] -= step / 2;
      const end = [...start]; end[along] += step;
      const key = [start.map(v => v.toFixed(3)).join(','), end.map(v => v.toFixed(3)).join(',')].sort().join('/');
      if (seen.has(key)) continue; seen.add(key);
      const color = axis === 0 ? ice : gold;
      beam(splats, V(start), V(end), .019, color);
    }
  }
  return finish(splats, {...definition.fractal, type: 'Menger sponge', glowingEdges: seen.size});
}

const TETRA = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map(V);
export function createSierpinski() {
  const splats = [], leaves = [];
  function visit(center, scale, depth) {
    if (depth) for (const corner of TETRA) visit(center.clone().addScaledVector(corner, scale / 2), scale / 2, depth - 1);
    else leaves.push({center, scale});
  }
  visit(new Vector3(), 3.6, 3);
  for (const {center, scale} of leaves) {
    const corners = TETRA.map(v => center.clone().addScaledVector(v, scale));
    for (const ids of [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]]) triangle(splats, ids.map(i => corners[i]), 6, [.20, .075, .31]);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) beam(splats, corners[i], corners[j], .023, (i + j) % 2 ? lilac : gold);
  }
  return finish(splats, {type: 'Sierpiński tetrahedron', depth: 3, cells: leaves.length});
}

const OCTA = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(V);
export function createOctahedral() {
  const splats = [], leaves = [];
  function visit(center, scale, depth) {
    if (depth) for (const corner of OCTA) visit(center.clone().addScaledVector(corner, scale / 2), scale / 2, depth - 1);
    else leaves.push({center, scale});
  }
  visit(new Vector3(), 5.8, 3);
  for (const {center, scale} of leaves) {
    const corners = OCTA.map(v => center.clone().addScaledVector(v, scale));
    for (const x of [0, 1]) for (const y of [2, 3]) for (const z of [4, 5]) triangle(splats, [corners[x], corners[y], corners[z]], 3, [.035, .23, .24]);
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (Math.floor(i / 2) !== Math.floor(j / 2))
      beam(splats, corners[i], corners[j], .017, center.y > 0 ? ice : [.4, .53, 1]);
  }
  return finish(splats, {type: 'Octahedral lattice', depth: 3, cells: leaves.length});
}

export function createRecursiveTori() {
  const splats = [], identity = new Quaternion(), z = new Vector3(0, 0, 1);
  let rings = 0;
  function torus(center, radius, tube, rotation, depth, phase) {
    rings++;
    const around = depth === 2 ? 180 : depth === 1 ? 52 : 22, across = depth === 0 ? 6 : 9;
    for (let i = 0; i < around; i++) for (let j = 0; j < across; j++) {
      const a = TAU * i / around, b = TAU * j / across;
      const normal = new Vector3(Math.cos(a) * Math.cos(b), Math.sin(a) * Math.cos(b), Math.sin(b)).applyQuaternion(rotation);
      const tangent = new Vector3(-Math.sin(a), Math.cos(a), 0).applyQuaternion(rotation);
      const p = new Vector3((radius + tube * Math.cos(b)) * Math.cos(a), (radius + tube * Math.cos(b)) * Math.sin(a), tube * Math.sin(b)).applyQuaternion(rotation).add(center);
      const stripe = j === 0 || j === Math.floor(across / 2);
      const color = stripe ? (phase % 2 ? gold : ice) : colorMix([.055, .025, .15], [.25, .12, .31], .5 + .5 * Math.sin(b));
      mark(splats, p, normal, tangent, radius * TAU / around * .67, tube * TAU / across * .62, color, 1, stripe);
    }
    if (!depth) return;
    const children = depth === 2 ? 10 : 5;
    for (let i = 0; i < children; i++) {
      const angle = i * TAU / children + phase * .31;
      const direction = new Vector3(Math.cos(angle), Math.sin(angle), 0).applyQuaternion(rotation);
      const at = center.clone().addScaledVector(direction, radius);
      const twist = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), .55 + .3 * Math.sin(angle));
      const next = rotation.clone().multiply(new Quaternion().setFromAxisAngle(z, angle)).multiply(twist);
      torus(at, radius * .245, tube * .47, next, depth - 1, phase + i);
    }
  }
  for (let i = 0; i < 3; i++) {
    const rotation = i === 0 ? identity : new Quaternion().setFromAxisAngle(i === 1 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0), Math.PI / 2);
    torus(new Vector3(), 3.4, .14, rotation, 2, i);
  }
  return finish(splats, {type: 'Recursive linked tori', depth: 3, cells: rings});
}

export const fractalStudyScenes = [
  {...hollowFractalScene, label: 'Menger', caption: '01 / Menger sponge', splatBudget: 180000, create: createLuminousMenger},
  {...hollowFractalScene, id: 'sierpinski-fractal', label: 'Sierpiński', caption: '02 / Sierpiński tetrahedron',
    camera: {position: [11, 6, 15], target: [0, 0, 0], fov: 37}, create: createSierpinski},
  {...hollowFractalScene, id: 'octahedral-fractal', label: 'Octahedral', caption: '03 / Octahedral lattice', splatBudget: 120000,
    camera: {position: [11, 7, 16], target: [0, 0, 0], fov: 36}, create: createOctahedral},
  {...hollowFractalScene, id: 'toroidal-fractal', label: 'Linked tori', caption: '04 / Recursive linked tori',
    camera: {position: [11, 6, 15], target: [0, 0, 0], fov: 34}, create: createRecursiveTori},
];
