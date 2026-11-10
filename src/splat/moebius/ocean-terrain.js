/** Seeded, continuous ocean relief and sparse volcanic archipelagos. */
export const OCEAN_MIN_HEIGHT = -1800;
export const OCEAN_MAX_HEIGHT = 320;
export const OCEAN_RADIUS = 12000;

const DEG = Math.PI / 180;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
function smooth(min, max, value) {
  const t = clamp((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function hash(x, y, z, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function noise3(x, y, z, seed = 731) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
  const a = mix(hash(ix, iy, iz, seed), hash(ix + 1, iy, iz, seed), fx);
  const b = mix(hash(ix, iy + 1, iz, seed), hash(ix + 1, iy + 1, iz, seed), fx);
  const c = mix(hash(ix, iy, iz + 1, seed), hash(ix + 1, iy, iz + 1, seed), fx);
  const d = mix(hash(ix, iy + 1, iz + 1, seed), hash(ix + 1, iy + 1, iz + 1, seed), fx);
  return mix(mix(a, b, fy), mix(c, d, fy), fz);
}

function site(lat, lon, scale, peak, index) {
  const p = lat * DEG, t = lon * DEG;
  return Object.freeze({
    lat, lon, scale, peak,
    name: index === 0 ? 'The Porcelain Atoll' : `Outer atoll ${index}`,
    x: Math.cos(p) * Math.cos(t), y: Math.sin(p), z: Math.cos(p) * Math.sin(t),
    eastX: -Math.sin(t), eastZ: Math.cos(t),
  });
}
const primarySite = site(12, 15, 1, 164, 0);
const siteCache = new Map();
export function getOceanSites(seed = 731) {
  seed |= 0;
  if (siteCache.has(seed)) return siteCache.get(seed);
  const rotation = hash(83, 96, 91, seed) * Math.PI * 2;
  const result = [primarySite];
  for (let i = 0; i < 9; i++) {
    const y = 0.82 - 1.64 * (i + 0.5) / 9 + (hash(i, 2, 0, seed) - 0.5) * 0.09;
    const angle = i * GOLDEN_ANGLE + rotation + (hash(i, 6, 3, seed) - 0.5) * 0.32;
    const lat = Math.asin(y) / DEG;
    const lon = Math.atan2(Math.sin(angle), Math.cos(angle)) / DEG;
    const candidate = site(lat, lon, 0.56 + hash(i, 7, 8, seed) * 0.62, 70 + hash(i, 3, 6, seed) * 140, i + 1);
    if (candidate.x * primarySite.x + candidate.y * primarySite.y + candidate.z * primarySite.z < 0.96) result.push(candidate);
  }
  if (siteCache.size >= 24) siteCache.delete(siteCache.keys().next().value);
  const sites = Object.freeze(result);
  siteCache.set(seed, sites);
  return sites;
}

const colors = {
  abyss: [0.19, 0.30, 0.39], shelf: [0.46, 0.59, 0.57], sand: [0.84, 0.79, 0.63],
  coral: [0.66, 0.46, 0.49], algae: [0.42, 0.62, 0.48],
  coast: [0.90, 0.81, 0.64], island: [0.44, 0.59, 0.45], basalt: [0.50, 0.43, 0.49],
};
function blend(color, target, weight) {
  color[0] = mix(color[0], target[0], weight);
  color[1] = mix(color[1], target[1], weight);
  color[2] = mix(color[2], target[2], weight);
}

/** Depth is meters below sea level. Reef and shore are continuous 0–1 masks. */
export function sampleOceanTerrain(direction, seed = 731, profile = 'ocean', withColor = true) {
  const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const x = direction.x / len, y = direction.y / len, z = direction.z / len;
  const plate = noise3(x * 3.8 + 3, y * 3.8, z * 3.8, seed);
  const broad = noise3(x * 13 + 9, y * 13, z * 13, seed + 59);
  const trench = Math.pow(1 - Math.abs(noise3(x * 8, y * 8 - 9, z * 8, seed + 17) * 2 - 1), 5);
  const abyss = -325 - plate * 840 - broad * 260 - trench * 270;
  let height = abyss, reef = 0, substrate = broad;
  for (const basin of getOceanSites(seed)) {
    const dot = x * basin.x + y * basin.y + z * basin.z;
    // Even the largest supported shelf is entirely inside this early-out cap.
    if (dot < 0.975) continue;
    const distance = OCEAN_RADIUS * Math.sqrt(Math.max(0, 2 * (1 - dot))) / basin.scale;
    if (distance > 1950) continue;
    const warp = noise3(x * 55 + 31, y * 55, z * 55, seed + 97);
    const detail = noise3(x * 176, y * 176 - 7, z * 176, seed + 139);
    const tiny = noise3(x * 440 + 17, y * 440, z * 440, seed + 173);
    const windward = clamp((x * basin.eastX + z * basin.eastZ) * OCEAN_RADIUS / 1300, -1, 1);
    const d = distance * (0.93 + 0.14 * warp);
    const ring = 870 + (warp - 0.5) * 155 + windward * 95;
    const barrier = 1 - smooth(28, 191, Math.abs(d - ring));
    const lagoon = -15 - 11 * warp - 3 * detail - 8 * smooth(640, 910, d);
    const crest = (profile === 'ocean' ? -7.2 : -3.5) - 3.3 * (1 - tiny);
    const reefBelt = mix(lagoon, crest, barrier);
    const shelf = mix(reefBelt, -180 - broad * 160, smooth(960, 1470, d));
    let basinHeight = mix(shelf, abyss, smooth(1250, 1790, d));
    if (profile === 'archipelago' && d < 515) {
      // Eroded volcanic relief tapering into a narrow pale beach and the lagoon.
      const foothill = 1 - smooth(85, 515, d);
      const rills = Math.pow(Math.abs(detail * 2 - 1), 1.45) * 21;
      const islandHeight = -32 + foothill * (basin.peak + (warp - 0.45) * 47 + rills + tiny * 7);
      basinHeight = Math.max(basinHeight, islandHeight);
    }
    height = Math.max(height, basinHeight);
    reef = Math.max(reef, barrier * (0.46 + detail * 0.36 + tiny * 0.17) * (1 - smooth(985, 1150, d)));
    substrate = mix(substrate, tiny, 1 - smooth(970, 1680, d));
  }
  const top = profile === 'ocean' ? -6.25 : OCEAN_MAX_HEIGHT;
  height = clamp(height, OCEAN_MIN_HEIGHT, top);
  if (!withColor) return height;
  const depth = Math.max(0, -height), shore = 1 - smooth(2.5, 25, Math.abs(height));
  const temperature = clamp(1.03 - Math.abs(y) * 0.78 - Math.max(0, height) / 1700);
  const moisture = clamp(0.68 + plate * 0.24 - Math.max(0, height) / 750);
  let biome = 'seafloor';
  const color = [...colors.abyss];
  if (height > 0) {
    biome = height < 16 ? 'coast' : 'island';
    color.splice(0, 3, ...colors.coast);
    blend(color, colors.island, smooth(8, 31, height));
    blend(color, colors.basalt, smooth(100, 197, height) * (0.55 + substrate * 0.35));
  } else {
    if (reef > 0.35 && depth < 38) biome = 'reef';
    else if (depth < 65) biome = 'shoal';
    blend(color, colors.shelf, 1 - smooth(45, 625, depth));
    blend(color, colors.sand, 1 - smooth(12, 66, depth));
    blend(color, colors.coast, 1 - smooth(0, 8, depth));
    const coral = mix(0.65, 1, smooth(0.30, 0.75, substrate));
    blend(color, colors.coral, reef * coral * (1 - smooth(24, 65, depth)));
    blend(color, colors.algae, reef * (1 - coral) * 1.65);
  }
  // Semantic loose sand coverage: beaches and shallow sediment pockets, with
  // coral substrate and deep fine sediment excluded. Independent of pigment.
  const sandMask = clamp((1-smooth(8,28,Math.max(0,height))) * (1-smooth(50,190,depth))
    * (1-smooth(0.16,0.74,reef)) * (1-0.22*smooth(0.35,0.80,substrate)));
  return { height, depth, reef, shore, biome, temperature, moisture, color, sandMask };
}
