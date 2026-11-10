import {MathUtils} from 'three';

const {clamp, lerp, smoothstep} = MathUtils;
const SIDE = 256;
export const MINERAL_BYTES = SIDE * SIDE * 2;
const OXIDE = [.65, .45, .30];
const LICHEN = [.55, .56, .39];
const CLAY = [.31, .33, .40];
const QUARTZ = [.83, .77, .65];

function lattice(x, y, z) {
  let n = Math.imul(x, 0x165667b1) ^ Math.imul(y, 0x27d4eb2d) ^ Math.imul(z, 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

export function mottling(x, y, z) {
  const a = Math.floor(x), b = Math.floor(y), c = Math.floor(z);
  const u = smoothstep(x - a, 0, 1), v = smoothstep(y - b, 0, 1), w = smoothstep(z - c, 0, 1);
  const lower = lerp(lerp(lattice(a, b, c), lattice(a + 1, b, c), u),
    lerp(lattice(a, b + 1, c), lattice(a + 1, b + 1, c), u), v);
  const upper = lerp(lerp(lattice(a, b, c + 1), lattice(a + 1, b, c + 1), u),
    lerp(lattice(a, b + 1, c + 1), lattice(a + 1, b + 1, c + 1), u), v);
  return lerp(lower, upper, w);
}

function textureSampler(bytes) {
  return (u, v, channel) => {
    const x = Math.floor(u), y = Math.floor(v);
    const col = x & (SIDE - 1), row = y & (SIDE - 1);
    const nextCol = (x + 1) & (SIDE - 1), nextRow = (y + 1) & (SIDE - 1);
    const a = row * SIDE, b = nextRow * SIDE;
    return lerp(lerp(bytes[(a + col) * 2 + channel], bytes[(a + nextCol) * 2 + channel], u - x),
      lerp(bytes[(b + col) * 2 + channel], bytes[(b + nextCol) * 2 + channel], u - x), v - y) / 255 - .5;
  };
}

export function createMeadowMaterial(bytes) {
  const texel = textureSampler(bytes);
  const exposedSoil = [.53, .405, .285];
  return (pigment, x, y, z, cover) => {
    const patch = mottling(x * .42 + 6, y * .39, z * .49 + 10);
    const fibers = texel(x * 51 + patch * 38, z * 56 - patch * 47, 0);
    const grit = texel(x * 46 + z * 7 + 142, z * 43 - x * 9 + patch * 52, 1);
    const dry = (1 - smoothstep(cover, .25, .73)) * smoothstep(patch + .31 * grit, .40, .82);
    const body = lerp(grit * .25, fibers * .24, cover) + (patch - .5) * .045;
    return pigment.map((channel, c) => clamp(lerp(channel, exposedSoil[c], dry * .68) + body, 0, 1));
  };
}

export function createCliffMaterial(bytes) {
  const texel = textureSampler(bytes);
  return function apply(color, point, normal, footprint, strength, fresh = 0, damp = 0) {
    const {x, y, z} = point;
    const nx = Math.abs(normal.x) ** 3, ny = Math.abs(normal.y) ** 3, nz = Math.abs(normal.z) ** 3;
    const weight = nx + ny + nz;
    const wx = nx / weight, wy = ny / weight, wz = nz / weight;
    // Use measured grain as a pigment signal. Vary scale and orientation
    // between axes so a stratum stays coherent as it turns around a rib.
    const warp = mottling(x * .26 + 8, y * .22 - 3, z * .26);
    const u = x * 19 + warp * 37, v = y * 21 - warp * 28, w = z * 18 + warp * 31;
    const clusters = texel(w + 57, v + 23, 0) * wx + texel(u, w + 126, 0) * wy
      + texel(u - v * .21, v + u * .17, 0) * wz;
    const grain = texel(w * 1.18 + 192, v + 52, 1) * wx + texel(u + 38, w * 1.32 + 4, 1) * wy
      + texel(u * 1.16 + 94, v * 1.19 - 30, 1) * wz;
    const detail = 1 - smoothstep(footprint, .11, .41);
    const wash = mottling(x * .27 + 26, y * .083, z * .31 + 8);
    const freckles = mottling(x * 1.16 + 2, y * 1.45 - 6, z * 1.32);
    const weathered = 1 - fresh * .85;
    const stain = smoothstep(wash + damp * .23 + clusters * .22, .54, .85) * .38 * weathered;
    const lichen = smoothstep(warp * .60 + freckles * .40 + damp * .17, .67, .91)
      * smoothstep(normal.y + damp * .50, .12, .70) * .50 * weathered;
    const mineral = smoothstep(clusters * .62 + grain * detail + .08 * fresh, .20, .47) * (.12 + fresh * .16);
    const cavity = smoothstep(-clusters - grain * detail * .33, .12, .36) * .25;
    const tone = .17 * clusters + .115 * grain * detail + .055 * (warp - .5);
    return color.map((channel, c) => {
      const aged = lerp(lerp(channel, OXIDE[c], stain), LICHEN[c], lichen);
      const pigment = lerp(lerp(aged, CLAY[c], cavity + damp * .10), QUARTZ[c], mineral);
      return clamp(lerp(channel, pigment + tone, strength), 0, 1);
    });
  };
}
