import {CatmullRomCurve3, MathUtils, Vector3} from 'three';
import {
  decodeReefSeabed, paintReefDebris, paintReefMoss, paintReefParticles,
  paintReefSandGlitter, paintReefSeabed, paintReefWater, paintReefLightShafts,
} from './reefSeabed.js';
import {loadRockFractures} from './rockFracture.js';
import {readReefFish, ReefFish} from './ReefFish.js';
import {bakeReefGlow, readReefGlow, sampleReefGlow} from './ReefBioluminescence.js';
import {reefFlowCoordinates} from './ReefFlow.js';

const {clamp, lerp, smoothstep} = MathUtils;
const TAU = Math.PI * 2;
const KEY = new Vector3(-.61, .71, .51).normalize();
const FILL = new Vector3(.45, .27, -.78).normalize();
const COLONIES = [
  {yaw: 1.16, height: 3.89, spread: .91, bulk: .99, lean: .21, tone: 0},
  {yaw: -1.02, height: 4.40, spread: -.92, bulk: 1.06, lean: -.13, tone: 1},
  {yaw: 2.62, height: 4.65, spread: -.80, bulk: .84, lean: .21, tone: 2},
  {yaw: -2.36, height: 4.15, spread: .78, bulk: .92, lean: -.23, tone: 0},
  {yaw: 1.95, height: 2.87, spread: .79, bulk: .63, lean: -.15, tone: 1},
  {yaw: -1.90, height: 2.52, spread: -.71, bulk: .62, lean: .10, tone: 2},
];
const PIGMENTS = [
  [[.42, .19, .27], [.86, .37, .31], [1, .72, .51]],
  [[.47, .21, .28], [.93, .48, .35], [.99, .80, .62]],
  [[.33, .20, .34], [.66, .37, .47], [.92, .67, .65]],
];

function mapNode([u, v], colony, i) {
  const turn = colony.yaw + colony.spread * (u * .87 - v * .18) + .096 * Math.sin(v * 5.1 + i);
  const radius = 1.42 + .94 * Math.sin(v * 2.63) + .25 * u
    + .082 * Math.sin(i * 1.6 + 7 * v + 2 * u) + colony.lean * v;
  const y = -2 + v * colony.height + .32 * u * Math.sin(v * 2.9) + .16 * v * Math.sin(4.2 * u + i);
  return new Vector3(Math.sin(turn) * radius, y, Math.cos(turn) * radius);
}

function paintPolyp(splats, root, axis, stem, size, phase, pigment, glowGroup, flow) {
  const cross = new Vector3().crossVectors(axis, stem).normalize();
  const radial = new Vector3(), rim = new Vector3(), flank = new Vector3(), depth = new Vector3();
  const center = new Vector3();
  // A flared outer wall and a recessed inner wall share the rim.
  for (const inside of [false, true]) {
    for (let row = 0; row < 5; row++) {
      const f = row / 4;
      const radius = size * (inside ? .22 + .78 * f : .52 + .48 * f ** 1.45);
      const rise = size * (inside ? .10 + .49 * f : .59 * f);
      const segments = Math.max(7, Math.round(TAU * radius / .034));
      for (let i = 0; i < segments; i++) {
        const angle = TAU * (i + .39 * (row % 2)) / segments;
        const seed = (Math.imul(splats.length + 19, 2246822519) >>> 0) / 4294967296;
        const u = Math.cos(angle), v = Math.sin(angle);
        radial.copy(stem).multiplyScalar(u).addScaledVector(cross, v);
        rim.copy(stem).multiplyScalar(-v).addScaledVector(cross, u);
        flank.copy(axis).addScaledVector(radial, inside ? 1.1 : .49).normalize();
        depth.crossVectors(rim, flank).normalize().multiplyScalar(inside ? -1 : 1);
        const scallop = 1 + .15 * Math.sin(angle * 6 + phase) * f;
        center.copy(root).addScaledVector(axis, rise * scallop).addScaledVector(radial, radius * scallop);
        const lip = smoothstep(f, .46, 1);
        const shade = .70 + .36 * Math.max(0, depth.dot(KEY));
        const color = pigment[1].map((channel, c) => {
          const wall = inside ? pigment[0][c] * .66 : channel * .92;
          return clamp(lerp(wall, pigment[2][c], lip * .72) * shade, 0, 1);
        });
        splats.push({
          center: center.toArray(),
          axes: [rim.multiplyScalar(.68 * TAU * radius / segments).toArray(),
            flank.multiplyScalar(size * .23).toArray(), depth.multiplyScalar(.011).toArray()],
          color, opacity: .96, seed, material: 'coral-polyp',
          reefGlow: glowGroup,
          reefFlow: [flow + f * .009, 0, 0],
        });
      }
    }
  }
}

function paintTube(splats, glow, glowMap, points, widths, phase, palette, group, arrivals) {
  const curve = new CatmullRomCurve3(points);
  const length = curve.getLength();
  if (length < .017) return;
  const steps = Math.max(2, Math.ceil(length / .034));
  const frames = curve.computeFrenetFrames(steps, false);
  const radial = new Vector3(), around = new Vector3(), center = new Vector3(), spot = new Vector3();
  const n = new Vector3(), b = new Vector3();
  const [base, coral, tip] = palette;
  const taperLength = Math.min(.34, length * .76);
  function basis(row) {
    const tangent = frames.tangents[row];
    const frame = frames.normals[row];
    n.copy(frame).addScaledVector(tangent, -frame.dot(tangent)).normalize();
    b.crossVectors(tangent, n).normalize();
    return tangent;
  }
  for (let row = 0; row < steps; row++) {
    const f = row / steps, along = curve.getUtoTmapping(f) * (widths.length - 1);
    const i = Math.min(Math.floor(along), widths.length - 2);
    const flow = lerp(arrivals[i], arrivals[i + 1], along - i);
    const newTip = smoothstep(length * f, length - taperLength, length);
    const reach = lerp(widths[i], widths[i + 1], along - i) * (1 - .72 * newTip);
    const tangent = basis(row);
    curve.getPointAt(f, center);
    if (reach > .079 && row % 6 === 2 && newTip < .5 && Math.sin(row * 1.77 + phase * 2.4) > -.39) {
      const angle = phase * 5 + row * 2.39;
      radial.copy(n).multiplyScalar(Math.cos(angle)).addScaledVector(b, Math.sin(angle));
      spot.copy(center).addScaledVector(radial, reach * .95);
      const size = Math.min(.063, reach * .43) * (.76 + .22 * Math.sin(row * .61 + phase));
      const mask = sampleReefGlow(glowMap, spot, radial, group);
      glow.push({center: spot.toArray(), group, radius: 1.35, strength: .10 * mask});
      paintPolyp(splats, spot, radial, tangent, size, phase, palette, group, flow);
    }
    const segments = Math.max(7, Math.ceil(reach * TAU / .043));
    for (let j = 0; j < segments; j++) {
      const seed = (Math.imul(splats.length + 17, 2654435761) >>> 0) / 4294967296;
      const a = (j + .38 * (row % 2) + .43 * (seed - .5)) / segments * TAU;
      const cos = Math.cos(a), sin = Math.sin(a);
      radial.copy(n).multiplyScalar(cos).addScaledVector(b, sin);
      around.copy(n).multiplyScalar(-sin).addScaledVector(b, cos);
      const along = f * length;
      const rib = Math.sin(a * 5 + phase + along * 4) * Math.cos(a * 3 - along * 7 + phase);
      const pores = smoothstep(Math.sin(a * 8 + phase + along * 15) * Math.cos(along * 61 - a * 2), .47, .99);
      const rough = 1 + .082 * rib + .035 * Math.sin(along * 54 + phase) - .079 * pores;
      spot.copy(center).addScaledVector(radial, reach * rough);
      spot.addScaledVector(tangent, (seed - .5) * .015);
      const light = Math.max(0, radial.dot(KEY));
      const cool = Math.max(0, radial.dot(FILL));
      const height = smoothstep(center.y, -1.75, 2.46);
      const blush = clamp(.42 + .18 * rib + height * .39 + .13 * Math.sin(center.x * 3 + center.z), 0, 1);
      const newGrowth = clamp(height * .14 + newTip * .60 + .10 * rib, 0, .80);
      const rootShade = .15 * (1 - smoothstep(center.y, -2.1, -.85));
      const color = base.map((channel, c) => {
        const pigment = lerp(lerp(channel, coral[c], blush), tip[c], newGrowth);
        return clamp((pigment + (seed - .5) * .09) * (.72 + .41 * light - .16 * pores - rootShade)
          + cool * [.021, .064, .093][c], 0, 1);
      });
      const width = Math.max(.012, reach * TAU / segments * .76);
      const stripe = .026 + .019 * seed;
      if (row % 4 === 0 && j % 4 === 0) {
        const mask = sampleReefGlow(glowMap, spot, radial, group);
        glow.push({center: spot.toArray(), group, radius: 1.25, strength: .055 * mask});
      }
      splats.push({
        center: spot.toArray(),
        axes: [around.multiplyScalar(width).toArray(), tangent.toArray().map(value => value * stripe),
          radial.multiplyScalar(.013).toArray()],
        color, opacity: .97, seed, material: 'coral-skeleton',
        reefGlow: group,
        reefFlow: [flow, 0, 0],
      });
    }
  }
  const t = basis(steps);
  const end = points.at(-1);
  const reach = Math.max(.012, widths.at(-1) * .43);
  const tipMask = sampleReefGlow(glowMap, end, t, group);
  glow.push({center: end.toArray(), group, radius: 1.5, strength: .22 * tipMask});
  splats.push({
    center: end.toArray(),
    axes: [n.multiplyScalar(reach).toArray(), b.multiplyScalar(reach).toArray(),
      t.toArray().map(value => value * .015)],
    color: tip, opacity: .97, seed: .83, material: 'coral-skeleton', reefGlow: group,
    reefFlow: [arrivals.at(-1), 0, 0],
  });
}

// At each drainage junction the larger contributing path continues the stem.
// The remaining paths attach at the original joint, preserving the D8 tree.
function joinStems(paths) {
  const key = point => point.slice(0, 2).join(',');
  const outgoing = new Map();
  for (const path of paths) {
    const start = key(path[0]);
    if (!outgoing.has(start) || path[1][2] > outgoing.get(start)[1][2]) outgoing.set(start, path);
  }
  const next = new Map(paths.map(path => [path, outgoing.get(key(path.at(-1)))]));
  const continuations = new Set(next.values());
  const visited = new Set();
  const stems = paths.filter(path => !continuations.has(path)).map(path => {
    const stem = path.slice();
    visited.add(path);
    for (let link = next.get(path); link; link = next.get(link)) {
      if (visited.has(link)) throw new Error('The LibreTerrain branch graph does not form a tree.');
      visited.add(link);
      stem.push(...link.slice(1));
    }
    return stem;
  });
  if (visited.size !== paths.length) throw new Error('The LibreTerrain branch graph contains a cycle.');
  return stems;
}

function buildReef({branches, bed, debris, fish, glowMap}) {
  const splats = [];
  const glow = [];
  paintReefWater(splats);
  const {contactShadow, mossSites} = paintReefDebris(splats, bed, debris);
  paintReefSeabed(splats, bed, contactShadow);
  paintReefSandGlitter(splats, bed, contactShadow);
  paintReefMoss(splats, bed, mossSites);
  const stems = joinStems(branches);
  for (const [i, colony] of COLONIES.entries()) {
    const root = mapNode(branches[0][0], colony, i);
    const lift = bed.height(root.x, root.z) - root.y - .13;
    const mapPoint = node => {
      const position = mapNode(node, colony, i);
      position.y += lift * (1 - smoothstep(node[1], 0, .35));
      return position;
    };
    const flow = reefFlowCoordinates(branches, mapPoint);
    for (const [j, path] of stems.entries()) {
      const points = path.map(mapPoint);
      const widths = path.map(([, v, area], k) => {
        // The smaller branch tapers from its own area as it leaves the joint.
        const contributingArea = k === 0 ? Math.min(area, 1.22 * path[1][2]) : area;
        return (.019 + .249 * contributingArea ** .52) * (1 - .43 * v) * colony.bulk;
      });
      paintTube(splats, glow, glowMap, points, widths, i * 2.15 + j * .37, PIGMENTS[colony.tone], i % 4, path.map(flow));
    }
  }
  paintReefParticles(splats, bed);
  paintReefLightShafts(splats, bed);
  return {
    splats, background: '#153b48', orbitMin: 5.5, orbitLimit: 18, orbitPan: false,
    orbitMaxPolar: Math.PI / 2 + .12, orbitMinY: -1.3,
    atmosphere: {color: '#1c4757', start: 8, density: .038, max: .72},
    reefCaustics: {strength: 1.17, surfaceY: 3.3, glow: bakeReefGlow(glow), glowMap},
    spores: true,
    actorLabel: 'clownfish',
    loadActor: () => new ReefFish(fish),
    lighting: {
      irradiance: new Float32Array(splats.length * 3),
      shadow: new Float32Array(splats.length),
      stats: {},
    },
  };
}

let reef;
let pending;

export const hollowReefScene = {
  id: 'hollow-reef',
  label: 'Hollow reef',
  title: 'Hollow reef',
  description: 'Six coral colonies rooted in fractured rock shelves around an open chamber.',
  caption: 'Reversed drainage · carved seabed',
  swatch: 'hollow-reef',
  splatBudget: 120_000,
  camera: {position: [1.68, 2.65, 10.75], target: [0, -.33, 0], fov: 39},
  styleOnVisit: true,
  initialStyle: {
    quality: 'studio', mode: 'ghibli', brushScale: 1.02, coverage: 1.14, softness: .27,
    gouacheTexture: .57, gouacheBlend: .54, gouacheTone: .35,
    indirect: false, tintedShadows: false, sun: false, lensDirt: true, lensDirtStrength: .65, lensFlare: false,
    painterlyVignette: false, foregroundDOF: false,
  },
  async prepare(fetcher = globalThis.fetch) {
    if (reef) return;
    pending ??= (async () => {
      const root = `${import.meta.env?.BASE_URL ?? '/'}hollow-reef/`;
      const [paths, seabed, stones, sand, fish, glow] = await Promise.all([
        fetcher(root + 'branches.json'), fetcher(root + 'seabed.bin'), fetcher(root + 'talus.json'), fetcher(root + 'sand.u16'),
        fetcher(root + 'clownfish-surface.f32'),
        fetcher(root + 'glow.u8'),
        loadRockFractures(fetcher),
      ]);
      if (!paths.ok || !seabed.ok || !stones.ok || !sand.ok) throw new Error('Could not load the LibreTerrain reef data.');
      const branches = await paths.json();
      if (!Array.isArray(branches) || !branches.length || !branches.every(path => Array.isArray(path)
        && path.length >= 2 && path.every(point => Array.isArray(point) && point.length === 3
          && point.every(Number.isFinite)))) {
        throw new Error('Invalid LibreTerrain reef paths.');
      }
      const {clasts: debris} = await stones.json();
      if (!Array.isArray(debris) || !debris.length || debris.length > 560 || !debris.every(point =>
        Array.isArray(point) && point.length === 4 && point.every(Number.isFinite)
        && point[3] >= .025 && point[3] <= .60)) throw new Error('Invalid LibreTerrain reef talus.');
      if (!fish.ok) throw new Error('Could not load the clownfish splats.');
      if (!glow.ok) throw new Error('Could not load the LibreTerrain coral glow map.');
      reef = {branches, bed: decodeReefSeabed(await seabed.arrayBuffer(), await sand.arrayBuffer()),
        debris, fish: readReefFish(await fish.arrayBuffer()), glowMap: readReefGlow(await glow.arrayBuffer())};
    })().finally(() => { pending = null; });
    await pending;
  },
  create() {
    if (!reef) throw new Error('Load the LibreTerrain reef before opening the scene.');
    return buildReef(reef);
  },
};
