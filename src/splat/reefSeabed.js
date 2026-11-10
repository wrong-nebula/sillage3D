import {Euler, MathUtils, Quaternion, Vector3} from 'three';
import {buildRockSplats} from './rockFracture.js';

const {clamp, lerp, smoothstep} = MathUtils;
const SIDE = 513;
const SPAN = 11.2;
const SAND_SPAN = 38;
const DATUM = -2.43;
const LIGHT = new Vector3(-.55, .79, .28).normalize();
const BEDDING = new Vector3(.86, 0, .51).normalize();
const SAND_CREST = new Vector3(.95, 0, -.31).normalize();
const SILT = [.22, .35, .36];
const SAND = [.43, .49, .44];
const BASALT = [.24, .32, .39];
const CREST = [.52, .57, .54];
const DISTANT_WATER = [.057, .183, .237];

export function paintReefLightShafts(splats, bed) {
  const direction = new Vector3(-.54 * .48, .79, .29 * .48).normalize();
  const across = new Vector3().crossVectors(direction, new Vector3(0, 0, 1)).normalize();
  const depthAxis = new Vector3().crossVectors(across, direction).normalize();
  for (let z = 0; z < 11; z++) {
    for (let x = 0; x < 11; x++) {
      const seed = seedFor(z * 11 + x, 1581);
      if (seed < .63) continue;
      const surfaceX = (x - 5) * 1.06 + (seed - .5) * .44;
      const surfaceZ = (z - 5) * 1.06 + (seedFor(x * 11 + z, 518) - .5) * .44;
      if (Math.hypot(surfaceX, surfaceZ) > 6.3) continue;
      // Continue each column beyond the highest allowed camera position.
      for (let layer = 0; layer < 30; layer++) {
        const strokeSeed = seedFor((z * 11 + x) * 37 + layer, 629);
        const depth = 5.9 - layer;
        const center = [surfaceX - direction.x / direction.y * depth, 3.3 - depth,
          surfaceZ - direction.z / direction.y * depth];
        if (center[1] < bed.height(center[0], center[2]) + .28) continue;
        splats.push({
          center, axes: [across.toArray().map(value => value * (.39 + .10 * strokeSeed)),
            direction.toArray().map(value => value * (.72 + .16 * strokeSeed)),
            depthAxis.toArray().map(value => value * (.38 + .08 * strokeSeed))],
          color: [.53, .81, .83], opacity: .012 + .003 * strokeSeed,
          seed: strokeSeed, reefRay: true, material: 'reef-light-shaft',
        });
      }
    }
  }
}

function gridSampler(span, at) {
  return (x, z, channel = 0) => {
    const u = clamp(x / span + .5, 0, 1) * (SIDE - 1);
    const v = clamp(z / span + .5, 0, 1) * (SIDE - 1);
    const col = Math.min(Math.floor(u), SIDE - 2);
    const row = Math.min(Math.floor(v), SIDE - 2);
    return lerp(lerp(at(col, row, channel), at(col + 1, row, channel), u - col),
      lerp(at(col, row + 1, channel), at(col + 1, row + 1, channel), u - col), v - row);
  };
}

export function decodeReefSeabed(buffer, sandBuffer) {
  if (buffer.byteLength !== SIDE ** 2 * 5 || sandBuffer.byteLength !== SIDE ** 2 * 2) {
    throw new Error('Invalid LibreTerrain seabed bake.');
  }
  const data = new Uint8Array(buffer);
  const sand = new DataView(sandBuffer);
  const sample = gridSampler(SPAN, (x, z, channel) => {
    const offset = (z * SIDE + x) * 5;
    return channel === 0 ? (data[offset] + data[offset + 1] * 256) * (2.2 / 65535)
      : data[offset + channel] / 255;
  });
  const dune = gridSampler(SAND_SPAN, (x, z) => sand.getUint16((z * SIDE + x) * 2, true) * (.45 / 65535));
  return {
    sample, dune,
    height(x, z) {
      const stone = sample(x, z);
      const distance = Math.hypot(x, z);
      const duneScale = lerp(1, .52, smoothstep(distance, 6.5, 12.5));
      return DATUM + stone + dune(x, z) * duneScale * (1 - smoothstep(stone, .08, .46));
    },
  };
}

function seedFor(index, salt) {
  let bits = Math.imul(index + salt, 0x45d9f3b);
  bits = Math.imul(bits ^ (bits >>> 16), 0x45d9f3b);
  return ((bits ^ (bits >>> 16)) >>> 0) / 2 ** 32;
}

export function paintReefSeabed(splats, bed, contactShadow) {
  const normal = new Vector3();
  const tangent = new Vector3();
  const across = new Vector3();
  const strata = new Vector3();
  function stone(x, z, spacing, seed, densityWeight) {
    const angle = Math.atan2(z, x);
    const border = Math.hypot(x, z) + .28 * Math.sin(angle * 4) + .20 * Math.cos(angle * 7 + .8);
    const fade = smoothstep(border, 4.2, 12.8);
    const baseOpacity = .99 * (1 - fade) ** 2.25;
    const opacity = 1 - (1 - baseOpacity) ** densityWeight;
    if (opacity < .006) return;
    const y = bed.height(x, z);
    const distance = Math.max(.035, spacing * .55);
    const dx = (bed.height(x + distance, z) - bed.height(x - distance, z)) / (2 * distance);
    const dz = (bed.height(x, z + distance) - bed.height(x, z - distance)) / (2 * distance);
    const slope = Math.hypot(dx, dz);
    normal.set(-dx, 1, -dz).normalize();
    const crack = bed.sample(x, z, 2);
    const signed = bed.sample(x, z, 3) * 2 - 1;
    const talus = bed.sample(x, z, 4);
    const relief = bed.sample(x, z);
    const sand = 1 - smoothstep(relief, .08, .46);
    const dune = bed.dune(x, z);
    const exposure = smoothstep(relief, .16, .63);
    const slopeRock = smoothstep(slope, .18, 1.25);
    const rock = Math.max(exposure * .87, slopeRock * .87 * (1 - sand));
    const lamina = (y + .054 * x - .042 * z) * 4.4 + .10 * Math.sin(2.1 * z - x);
    const band = lamina - Math.floor(lamina);
    const ledge = (1 - smoothstep(band, .18, .36)) * rock * (.38 + .62 * slopeRock);
    const seam = smoothstep(band, .82, .96) * rock;
    const crest = clamp(.50 * Math.max(0, signed) * (1 - sand) + .22 * ledge + .13 * talus, 0, .75);
    const light = Math.max(0, normal.dot(LIGHT));
    const shadow = Math.max(0, -signed) * .20 * (1 - sand) + crack * .34 + seam * .14;
    const contact = contactShadow(x, z);
    const variation = (seed - .5) * .05 + .025 * Math.sin(4.2 * x + 3.5 * z);
    const lee = smoothstep(-(.31 * dx + .95 * dz), .07, .48);
    const sandRidge = smoothstep(dune, .047, .235);
    const color = SILT.map((base, c) => {
      const sediment = lerp(base, SAND[c] + sandRidge * [.15, .115, .070][c], sand * (.69 + .24 * sandRidge));
      const pigment = lerp(lerp(sediment, BASALT[c], rock), CREST[c], crest);
      const diffuse = .63 + .46 * light - shadow - .19 * sand * lee;
      const local = clamp((pigment + variation) * diffuse * (1 - .34 * contact), 0, 1);
      return lerp(local, DISTANT_WATER[c], fade * .77);
    });
    // The wide axis follows the bedding. The cross-strata footprint expands on
    // steep scarps to keep the sampled surface continuous.
    tangent.copy(BEDDING).lerp(SAND_CREST, sand);
    strata.set(-tangent.z, 0, tangent.x);
    tangent.addScaledVector(normal, -tangent.dot(normal)).normalize();
    across.crossVectors(normal, tangent);
    const climb = Math.abs(dx * strata.x + dz * strata.z);
    const width = spacing * (.76 + .14 * rock + .08 * seed);
    const rise = spacing * .69 * Math.hypot(1, Math.min(climb, 3));
    splats.push({
      center: [x, y, z],
      axes: [tangent.multiplyScalar(width).toArray(), across.multiplyScalar(rise).toArray(),
        normal.multiplyScalar(spacing * .15).toArray()],
      color, opacity, seed, material: 'reef-rock',
      reefRock: rock > .22,
      reefSeabed: true,
      celPaint: crest > .32 && rock > .5,
    });
  }

  const nearSpan = 14;
  const count = 167;
  const spacing = nearSpan / count;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      const index = row * count + col;
      const seed = seedFor(index, 149), jitter = seedFor(index, 57821);
      const x = (col + .19 + .62 * seed) * spacing - nearSpan / 2;
      const z = (row + .19 + .62 * jitter) * spacing - nearSpan / 2;
      stone(x, z, spacing, seed, 1 - smoothstep(Math.hypot(x, z), 5.6, 6.9));
    }
  }

  // A broader sediment wash hides the edge of the authored relief as you orbit.
  const outerSpacing = .45;
  for (let row = -36; row <= 36; row++) {
    for (let col = -36; col <= 36; col++) {
      if (Math.hypot(row, col) > 36) continue;
      const index = (row + 36) * 73 + col + 36;
      const seed = seedFor(index, 74), jitter = seedFor(index, 389);
      const x = (col + (seed - .5) * .64) * outerSpacing;
      const z = (row + (jitter - .5) * .64) * outerSpacing;
      stone(x, z, outerSpacing, seed, smoothstep(Math.hypot(x, z), 5.6, 6.9));
    }
  }
}

export function paintReefSandGlitter(splats, bed, contactShadow, {count = 2800, radius = 6.8, center = [0, 0], sizeScale = 1} = {}) {
  const normal = new Vector3(), tangent = new Vector3(), across = new Vector3();
  for (let i = 0; i < count; i++) {
    const seed = seedFor(i, 7621), facet = seedFor(i, 3701), pearl = seedFor(i, 71189);
    const angle = i * 2.39996323;
    const distance = radius * Math.sqrt((i + seed) / count);
    const x = center[0] + Math.cos(angle) * distance, z = center[1] + Math.sin(angle) * distance;
    const exposedSand = 1 - smoothstep(bed.sample(x, z), .09, .24);
    if (exposedSand < .30 || contactShadow(x, z) > .30) continue;
    const step = .035;
    const dx = (bed.height(x + step, z) - bed.height(x - step, z)) / (2 * step);
    const dz = (bed.height(x, z + step) - bed.height(x, z - step)) / (2 * step);
    const turn = Math.PI * 2 * facet;
    const tilt = .18 + .93 * pearl;
    // Each mineral face tips differently, so an orbit reveals a different
    // handful of glints without moving any of the grains.
    normal.set(-dx + Math.cos(turn) * tilt, 1, -dz + Math.sin(turn) * tilt).normalize();
    tangent.set(normal.y, -normal.x, 0).normalize();
    across.crossVectors(normal, tangent);
    const size = (.0049 + .0075 * seed ** 2) * sizeScale;
    const fade = 1 - smoothstep(distance, radius * (4.6 / 6.8), radius);
    splats.push({
      center: [x, bed.height(x, z) + .016, z],
      axes: [tangent.multiplyScalar(size * 1.13).toArray(), across.multiplyScalar(size).toArray(),
        normal.multiplyScalar(size * .43).toArray()],
      color: [.64 + .17 * pearl, .69 + .12 * pearl, .76 - .08 * pearl],
      opacity: (.25 + .28 * seed) * exposedSand * (.14 + .86 * fade), seed,
      material: 'reef-sand-glint', sandGlint: true,
    });
  }
}

export function paintReefDebris(splats, bed, placements) {
  const rotation = new Quaternion(), templateRotation = new Quaternion();
  const point = new Vector3(), euler = new Euler(), up = new Vector3(0, 1, 0);
  const templates = new Map(), contacts = new Map();
  const mossSites = [];
  const cellSize = .48;
  for (const [i, [x, z, yaw, diameter]] of placements.entries()) {
    const ground = bed.height(x, z);
    const scale = diameter / 16;
    euler.set(.14 * Math.sin(i * 2.13), -MathUtils.degToRad(yaw), .18 * Math.cos(i * 1.69), 'YXZ');
    rotation.setFromEuler(euler);
    const count = diameter < .055 ? 23 : diameter < .08 ? 32 : diameter < .12 ? 44
      : diameter < .18 ? 64 : diameter < .32 ? 156 : 240;
    const variant = 1 + i % 7;
    const heading = Math.round(yaw / 45) % 8;
    const key = `${count}/${variant}/${heading}`;
    if (!templates.has(key)) {
      templateRotation.setFromAxisAngle(up, MathUtils.degToRad(heading * 45));
      templates.set(key, buildRockSplats({count, variant, inverseRotation: templateRotation}));
    }
    const marks = templates.get(key);
    let bottom = Infinity;
    const centers = marks.map(mark => {
      const center = point.fromArray(mark.center).applyQuaternion(rotation).multiplyScalar(scale).toArray();
      bottom = Math.min(bottom, center[1]);
      return center;
    });
    const burial = diameter * lerp(.22, .13, smoothstep(diameter, .06, .39));
    const crest = bed.sample(x, z, 3);
    const lighter = .08 * seedFor(i, 943);
    const material = diameter < .08 ? 'reef-pebble' : diameter < .18 ? 'reef-chip' : 'reef-talus';
    let crown = null;
    for (const [j, mark] of marks.entries()) {
      const center = centers[j];
      center[0] += x;
      center[1] += ground - bottom - burial;
      center[2] += z;
      const axes = mark.axes.map(axis => point.fromArray(axis).applyQuaternion(rotation).multiplyScalar(scale).toArray());
      const color = mark.color.map((channel, c) =>
        clamp(lerp(channel * [.81, .94, 1.02][c], BASALT[c], .30) + lighter + .043 * (crest - .5), 0, 1));
      splats.push({...mark, center, axes, color, material, reefRock: true});
      if (!crown || center[1] > crown[1]) crown = center;
    }
    const cell = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
    if (!contacts.has(cell)) contacts.set(cell, []);
    contacts.get(cell).push({x, z, radius: diameter * .69});
    if (diameter > .27 && mossSites.length < 9 && seedFor(i, 8745) > .69) {
      mossSites.push({center: crown, radius: diameter * .25});
    }
  }
  function contactShadow(x, z) {
    const col = Math.floor(x / cellSize), row = Math.floor(z / cellSize);
    let shadow = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const rock of contacts.get(`${col + dx},${row + dz}`) ?? []) {
          const distance = Math.hypot(x - rock.x, z - rock.z) / rock.radius;
          shadow = Math.max(shadow, 1 - smoothstep(distance, .30, 1.38));
        }
      }
    }
    return shadow;
  }
  return {contactShadow, mossSites};
}

export function paintReefMoss(splats, bed, clasts) {
  const shelves = [
    [-1.94, -.31, .26], [-1.73, .53, .18], [-2.39, -.84, .19],
    [1.65, -.22, .24], [1.82, .57, .20], [1.19, 1.13, .16], [-.46, -1.88, .22],
  ];
  const patches = shelves.map(([x, z, radius]) => ({center: [x, bed.height(x, z), z], radius, shelf: true}));
  patches.push(...clasts);
  const tangent = new Vector3(), across = new Vector3(), normal = new Vector3();
  const mossShadow = [.075, .21, .185], mossTip = [.37, .55, .32];

  for (const [i, patch] of patches.entries()) {
    const [cx, cy, cz] = patch.center;
    const count = Math.ceil(58 * patch.radius);
    const phase = 2 * Math.PI * seedFor(i, 814), current = .55 + .28 * seedFor(i, 713);
    for (let frond = 0; frond < count; frond++) {
      const index = i * 83 + frond;
      const seed = seedFor(index, 674), variety = seedFor(index, 18743);
      const angle = frond * 2.39996323 + phase;
      const radius = patch.radius * Math.sqrt((frond + .32) / count) * (.73 + .27 * variety);
      const x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius;
      if (patch.shelf && bed.sample(x, z) < .29) continue;
      const ground = patch.shelf ? bed.height(x, z) : cy - .58 * radius;
      const length = (.064 + .13 * seed) * (patch.shelf ? 1 : .72);
      const heading = current + (variety - .5) * 1.42;
      const dx = Math.cos(heading), dz = Math.sin(heading);
      const bladeWidth = .008 + .013 * variety;
      for (let row = 0; row < 7; row++) {
        const t = row / 6;
        const curl = t * t * (.38 + .61 * variety);
        const drift = curl * length;
        const bend = .81 * t - .13 * t * t * t;
        const anchor = [x + dx * drift, ground + length * bend + .004, z + dz * drift];
        tangent.set(dx * (t + .15), .88 - .32 * t, dz * (t + .15)).normalize();
        across.set(dz, 0, -dx).applyAxisAngle(tangent, .23 * Math.sin(phase + t * 3.7));
        normal.crossVectors(tangent, across).normalize();
        if (normal.y < 0) normal.negate();
        const taper = .19 + .81 * Math.sin(Math.PI * (.09 + .91 * t));
        const newGrowth = clamp(.21 + t * .59 + (variety - .5) * .30 + Math.max(0, normal.dot(LIGHT)) * .18, 0, 1);
        const color = mossShadow.map((value, c) => lerp(value, mossTip[c], newGrowth));
        const mark = {
          center: anchor.slice(),
          axes: [tangent.multiplyScalar(length * .18).toArray(),
            across.multiplyScalar(bladeWidth * taper).toArray(), normal.multiplyScalar(.004).toArray()],
          color, opacity: .83 + .14 * seed, seed: seedFor(index + row * 1171, 914),
          material: 'reef-seaweed',
          reefMoss: true,
        };
        // Holdfasts stay on the rock. Only the rising blade samples move.
        if (row > 0) {
          const sway = length * t * t;
          mark.sporeMotion = {anchor, phase: phase + variety * .49 - .55 * t, rate: .36 + seed * .08,
            amplitude: [sway * .27, sway * .055, sway * .19]};
        }
        splats.push(mark);
      }
    }
  }
}

export function paintReefWater(splats) {
  // A surrounding water wash stays behind the sorted coral at any orbit angle.
  const radius = 25;
  for (let row = 0; row < 18; row++) {
    for (let column = 0; column < 44; column++) {
      const seed = seedFor(row * 44 + column, 791);
      const angle = 2 * Math.PI * (column + .5 * (row % 2)) / 44;
      const y = -13 + 2.12 * row + .74 * (seed - .5);
      const rise = smoothstep(y, -6, 12);
      const glimmer = rise * (.55 + .45 * Math.cos(angle + .62));
      const color = [.048, .163, .218].map((channel, c) =>
        channel + glimmer * [.103, .299, .29][c] + (seed - .5) * .019);
      splats.push({
        center: [Math.sin(angle) * radius, y, Math.cos(angle) * radius],
        axes: [[Math.cos(angle) * 2.45, 0, -Math.sin(angle) * 2.45], [0, 1.57, 0],
          [Math.sin(angle) * .38, 0, Math.cos(angle) * .38]],
        color, opacity: .91, seed, material: 'water-wash', skyBackground: true, noFog: true,
      });
    }
  }
}

export function paintReefParticles(splats, bed) {
  const count = 252;
  for (let i = 0; i < count; i++) {
    const seed = seedFor(i, 819), shade = seedFor(i, 41713);
    const angle = 2 * Math.PI * seedFor(i, 739);
    const radius = 5.75 * Math.sqrt(seedFor(i, 691));
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const y = lerp(bed.height(x, z) + .36, 2.97, seedFor(i, 481));
    const anchor = [x, y, z];
    const size = .0055 + .0061 * seed ** 2;
    splats.push({
      center: anchor.slice(),
      axes: [[size * 1.17, 0, 0], [0, size, 0], [0, 0, size * .84]],
      color: [.25 + .25 * shade, .44 + .24 * shade, .49 + .20 * shade],
      opacity: .092 + .13 * seed, seed, softParticle: true, material: 'reef-particle',
      sporeMotion: {
        anchor, phase: 2 * Math.PI * shade, rate: .24 + .21 * seed,
        amplitude: [.13 + .11 * seed, .036 + .066 * shade, .14 + .06 * shade],
      },
    });
  }
}
