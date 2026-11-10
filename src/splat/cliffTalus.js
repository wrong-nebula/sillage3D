import {Euler, MathUtils, Quaternion, Vector3} from 'three';
import {buildRockSplats, loadRockFractures} from './rockFracture.js';
import {cliffExposure, cliffSurface, cliffSurfaceColor, talusProvenance} from './cliffWall.js';
import {createCliffMaterial, createMeadowMaterial, MINERAL_BYTES, mottling} from './cliffMaterial.js';
import {addCliffClouds} from './cliffClouds.js';
import {addCliffMeltwater} from './cliffMeltwater.js';
import {loadCliffCourier} from './cliffCourier.js';
import {fadeCliffPerimeter} from './cliffPerimeter.js';
import {buildMarkClusters} from './MarkClusters.js';
import {paintReefSandGlitter} from './reefSeabed.js';
import {WATER_BASIN,waterBasinHeight} from './physics/WaterLab.js';

const {clamp, lerp, smoothstep, degToRad} = MathUtils;
const SIDE = 513;
const WIDTH = 118;
const DEPTH = 108;
const HEIGHT_RANGE = 50;
const LIGHT = new Vector3(-.57, .74, .44).normalize();
const ROCK = [.53, .49, .49];
const CREST = [.77, .63, .49];
const HOLLOW = [.31, .35, .47];
const SOIL = [.57, .50, .37];
const GRASS = [.43, .49, .33];
const SCREE = [.55, .51, .48];
const MOSS_DARK = [.215, .292, .132];
const MOSS_TIPS = [.55, .61, .295];
const GRASS_SUN = [.75, .73, .45];
const FLOWER_PIGMENTS = [[.96, .77, .25], [.62, .43, .85], [.98, .91, .83]];

function sampleNoise(value) {
  const bits = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  const mixed = Math.imul(bits ^ (bits >>> 16), 0x45d9f3b);
  return ((mixed ^ (mixed >>> 16)) >>> 0) / 4294967296;
}

function terrainSampler(data, runoff, meadow, winter, fog) {
  const at = (x, y, channel) => {
    if (channel >= 12) return fog[(y * SIDE + x) * 4 + channel - 12] / 255;
    if (channel === 5) return runoff[y * SIDE + x] / 255;
    if (channel >= 10) return winter[(y * SIDE + x) * 2 + channel - 10] / 255;
    if (channel >= 6) return meadow[(y * SIDE + x) * 4 + channel - 6] / 255;
    const i = (y * SIDE + x) * 5;
    return channel === 0 ? (data[i] + data[i + 1] * 256) * HEIGHT_RANGE / 65535 : data[i + channel] / 255;
  };
  return (x, z, channel = 0) => {
    const u = clamp(.5 + x / WIDTH, 0, 1) * (SIDE - 1);
    const v = clamp(.5 + z / DEPTH, 0, 1) * (SIDE - 1);
    const col = Math.min(u | 0, SIDE - 2), row = Math.min(v | 0, SIDE - 2);
    return lerp(lerp(at(col, row, channel), at(col + 1, row, channel), u - col),
      lerp(at(col, row + 1, channel), at(col + 1, row + 1, channel), u - col), v - row);
  };
}

function cliffPigment(sample, x, z, exposed = 1) {
  const broad = (sample(x, z, 2) - .5) * exposed;
  const fine = (sample(x, z, 3) - .5) * exposed;
  const warm = clamp(broad * .93 + fine * 1.1, 0, .82);
  const cool = clamp(-broad * 1.23 - fine * .91, 0, .87);
  return ROCK.map((channel, c) => lerp(lerp(channel, CREST[c], warm), HOLLOW[c], cool));
}

function mossCover(point, normal, diameter, ground, moisture, variant) {
  const contact = 1 - smoothstep(point.y - ground, diameter * .10, diameter * .52);
  const ledge = smoothstep(normal.y, .07, .82);
  const patch = mottling(point.x * 3.7 + variant, point.y * 4.9, point.z * 3.7 - variant);
  const thread = mottling(point.x * 10.1, point.y * 13.8 + variant, point.z * 10.1);
  const habitat = smoothstep(moisture, .28, .63) * (1 - smoothstep(ground, 12, 20));
  return smoothstep(.54 * patch + .16 * thread + .30 * moisture + .16 * contact, .49, .77)
    * clamp(.25 + .43 * ledge + .59 * contact, 0, 1) * habitat;
}

function addMoss(splats, center, axes, normal, color, size, coverage, seed) {
  const spread = .40 + .28 * seed + .12 * coverage;
  const lift = Math.min(.047, size * .22) * (.77 + .34 * seed);
  splats.push({
    center: center.map((value, c) => value + lift * normal.getComponent(c)
      + (seed - .5) * axes[0][c] * .35),
    axes: axes.map((axis, i) => axis.map(value => value * (i === 2 ? 1.12 : spread))),
    color, opacity: .73 + .23 * coverage, seed, material: 'foliage',
  });
}

export function placeBoulders(positions, height, sample, material, splats) {
  const rotation = new Quaternion(), templateRotation = new Quaternion();
  const point = new Vector3(), normal = new Vector3(), angle = new Euler(), up = new Vector3(0, 1, 0);
  const cache = new Map(), contacts = new Map();
  const colliders = [];
  const authoredRocks = [];
  const cellSize = 3;
  for (const [i, [x, z, yaw, diameter]] of positions.entries()) {
    const rockStart = splats.length;
    angle.set(.37 * Math.sin(i * 2.13), -degToRad(yaw), .33 * Math.cos(i * 1.69), 'YXZ');
    rotation.setFromEuler(angle);
    const scale = diameter / 16;
    const count = diameter < .57 ? 42 : diameter < .9 ? 62 : diameter < 1.35 ? 92 : diameter < 1.95 ? 142 : 212;
    const variant = 1 + i % 7;
    const heading = Math.round(yaw / 45) % 8;
    const key = `${count}/${variant}/${heading}`;
    if (!cache.has(key)) {
      templateRotation.setFromAxisAngle(up, degToRad(heading * 45));
      cache.set(key, buildRockSplats({count, variant, inverseRotation: templateRotation}));
    }
    const template = cache.get(key);
    let bottom = Infinity;
    const centers = template.map(mark => {
      const center = point.fromArray(mark.center).applyQuaternion(rotation).multiplyScalar(scale).toArray();
      bottom = Math.min(bottom, center[1]);
      return center;
    });
    const coarse = smoothstep(diameter, .24, 1.8);
    const ground = height(x, z);
    const base = ground - bottom - diameter * lerp(.23, .11, coarse);
    let rockCollider;
    if (diameter >= 1.8) {
      const xs = centers.map(p => p[0]), zs = centers.map(p => p[2]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
      rockCollider={x: x + (minX + maxX) / 2, z: z + (minZ + maxZ) / 2,
        radiusX: (maxX - minX) / 2, radiusZ: (maxZ - minZ) / 2,
        top: base + Math.max(...centers.map(p => p[1]))};
      colliders.push(rockCollider);
    }
    const moisture = .71 * mottling(x * .13 + 9, ground * .15, z * .15 + 21)
      + .21 * sample(x, z, 4) + .12 * sampleNoise(i + 737);
    const host = talusProvenance(x, (Math.imul(i + 9, 2246822519) >>> 0) / 4294967296,
      cliffPigment(sample, x, z));
    const streak = .065 * Math.sin(i * 2.372);
    for (const [j, mark] of template.entries()) {
      const center = centers[j];
      center[0] += x;
      center[1] += base;
      center[2] += z;
      const luma = mark.color[0] * .28 + mark.color[1] * .48 + mark.color[2] * .24;
      const color = mark.color.map((channel, c) => {
        const stone = host[c] * (.54 + luma * .99) + streak * (c === 2 ? .42 : 1);
        return clamp(lerp(stone, channel, .18 + coarse * .39), 0, 1);
      });
      const axes = mark.axes.map(axis => point.fromArray(axis).applyQuaternion(rotation).multiplyScalar(scale).toArray());
      normal.fromArray(axes[2]).normalize();
      point.fromArray(center);
      const size = Math.hypot(...axes[0]);
      const fresh = .42 * smoothstep(mark.seed + .30 * coarse, .65, .98);
      const pigment = material(color, point, normal, size, .75, fresh);
      const cover = mossCover(point, normal, diameter, ground, moisture, variant);
      const mossLight = .20 + .52 * Math.max(0, normal.dot(LIGHT)) + .27 * mark.seed;
      const moss = MOSS_DARK.map((channel, c) => lerp(channel, MOSS_TIPS[c], mossLight));
      splats.push({...mark, center, axes, mossCoverage: cover,
        color: pigment.map((channel, c) => lerp(channel, moss[c], cover * .74))});
      if (cover > .34 && center[1] >= ground - diameter * .06) {
        addMoss(splats, center, axes, normal, moss, size, cover, mark.seed);
      }
    }
    // Ownership survives perimeter compaction. Include attached moss marks.
    for(let index=rockStart;index<splats.length;index++)splats[index].cliffRockId=i;
    authoredRocks.push({id:i,x,z,diameter,collider:rockCollider});
    const cell = `${Math.floor(x/cellSize)},${Math.floor(z/cellSize)}`;
    if (!contacts.has(cell)) contacts.set(cell, []);
    contacts.get(cell).push({x, z, radius: diameter * .58});
  }

  const contactShadow = (x, z) => {
    const col = Math.floor(x/cellSize), row = Math.floor(z/cellSize);
    let shadow = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const rock of contacts.get(`${col+dx},${row+dz}`) ?? []) {
          const d = Math.hypot(x - rock.x, z - rock.z) / rock.radius;
          if (d < 1.46) shadow = Math.max(shadow, 1 - smoothstep(d, .38, 1.46));
        }
      }
    }
    return shadow;
  };
  contactShadow.colliders = colliders;
  contactShadow.authoredRocks = authoredRocks;
  return contactShadow;
}

function addFlower(splats, x, y, z, height, pigment, seed) {
  const size = lerp(.043, .083, seed);
  const angle = seed * Math.PI * 2;
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const top = y + height;
  const add = (center, axes, color) => {
    splats.push({center, axes, color, seed, opacity: .96, material: 'flower', wind: [x, y, z, 2]});
  };
  add([x, y + height * .55, z], [[.026, 0, 0], [0, height * .32, 0], [0, 0, .024]], [.39, .52, .23]);
  add([x, top, z], [[dx * size * 1.43, 0, dz * size * 1.43], [0, size * .61, 0],
    [-dz * size * .77, 0, dx * size * .77]], pigment);
  add([x, top + .012, z], [[-dz * size * 1.22, 0, dx * size * 1.22], [0, size * .55, 0],
    [dx * size * .65, 0, dz * size * .65]], pigment.map(channel => channel * .90));
  add([x, top + size * .40, z], [[size * .40, 0, 0], [0, size * .32, 0], [0, 0, size * .40]], [.97, .65, .18]);
}

function paintGrass(splats, height, sample, contactShadow) {
  const axis = new Vector3(), across = new Vector3(), normal = new Vector3();
  const cols = 236, rows = 147;
  const spacing = .50;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = row * cols + col;
      const seed = sampleNoise(id + 74681);
      const x = (col + seed) * spacing - cols * spacing / 2;
      const z = (row + sampleNoise(id + 3103)) * spacing + 2.5;
      const meadowZ = Math.min(z, DEPTH - z);
      const cover = sample(x, meadowZ, 6);
      if (cover < .035) continue;
      const clearance = 1 - smoothstep(contactShadow(x, z), .08, .55);
      const density = smoothstep(cover, .035, .77) * clearance;
      if (seed > density) continue;
      const pigment = [sample(x, meadowZ, 7), sample(x, meadowZ, 8), sample(x, meadowZ, 9)];
      const gx = (height(x + .42, z) - height(x - .42, z)) / .84;
      const gz = (height(x, z + .42) - height(x, z - .42)) / .84;
      const slopeLight = Math.max(0, (-gx * LIGHT.x + LIGHT.y - gz * LIGHT.z) / Math.hypot(gx, 1, gz));
      const heightM = .18 + .40 * cover + .17 * sampleNoise(id + 709);
      const patch = mottling(x * .24 + 2, 8, z * .24 + 3);
      if (sampleNoise(id + 53033) < .105 * smoothstep(patch, .35, .70) * clearance) {
        const family = Math.min(2, Math.floor(mottling(x * .14 + 4, 3, z * .14 + 7) * 3));
        const flowerSeed = sampleNoise(id + 20613);
        addFlower(splats, x, height(x, z), z, heightM * lerp(.85, 1.28, flowerSeed), FLOWER_PIGMENTS[family], flowerSeed);
      }
      const tuftCount = cover > .44 ? 3 : 2;
      for (let blade = 0; blade < tuftCount; blade++) {
        const index = id * 3 + blade;
        const fleck = sampleNoise(index + 9217);
        const a = sampleNoise(index + 2197) * Math.PI * 2;
        const reach = .07 + .21 * fleck;
        const x0 = x + Math.cos(a) * reach;
        const z0 = z + Math.sin(a) * reach;
        const h = heightM * (.65 + .44 * fleck);
        const lean = .19 + .33 * sampleNoise(index + 1251);
        const lx = .12 + Math.cos(a) * lean, lz = -.06 + Math.sin(a) * lean;
        axis.set(lx, 1, lz).normalize();
        across.set(Math.cos(a), 0, Math.sin(a)).addScaledVector(axis, -across.dot(axis)).normalize();
        normal.crossVectors(across, axis).normalize();
        const color = pigment.map((channel, c) => {
          const sun = .09 + .27 * fleck;
          return clamp(lerp(channel, GRASS_SUN[c], sun) * (.65 + .28 * fleck + .22 * slopeLight), 0, 1);
        });
        splats.push({
          center: [x0 + lx * h * .44, height(x0, z0) + h * .43, z0 + lz * h * .44],
          axes: [axis.setLength(h * .40).toArray(), across.setLength(.042 + .056 * fleck).toArray(),
            normal.setLength(.018 + .016 * fleck).toArray()],
          color, opacity: .91, seed: fleck, material: 'grass',
          wind: [x0, height(x0, z0), z0, 2],
        });
      }
    }
  }
}

function addCliffAtmosphere(splats, height, sample) {
  addCliffClouds(splats);
  // Keep the fog's random sequence independent of the cloud geometry.
  let index = 0;
  const random = () => sampleNoise(index++ + 854909);

  const spacing = 2.15;
  for (let row = 0; row < 48; row++) {
    for (let col = 0; col < 53; col++) {
      const seed = random();
      const x = -56 + (col + random()) * spacing;
      const z = -51 + (row + random()) * spacing;
      const density = sample(x, z, 12);
      if (density < .075) continue;
      const thickness = sample(x, z, 13) * 4;
      const ground = height(x, z);
      const relative = .14 + .77 * random();
      const radius = 1.2 + random() * 1.25;
      const light = .74 + .08 * seed;
      splats.push({
        center: [x, ground + thickness * relative, z],
        axes: [[radius, 0, 0], [0, .22 + thickness * .24, 0], [0, 0, radius * (.79 + random() * .35)]],
        color: [light, light + .055, light + .105],
        opacity: .13 + .075 * seed, seed, material: 'winter-fog', softParticle: true,
        wind: [ground, relative, seed * Math.PI * 2, 5],
      });
    }
  }
}

function addSnowGlitter(splats, height, contactShadow) {
  const start = splats.length;
  const normal = new Vector3(), tangent = new Vector3(), across = new Vector3();
  paintReefSandGlitter(splats, {
    height,
    sample(x, z) {
      const gx = (height(x + .3, z) - height(x - .3, z)) / .6;
      const gz = (height(x, z + .3) - height(x, z - .3)) / .6;
      return .30 * smoothstep(Math.hypot(gx, gz), .5, 1.7);
    },
  }, contactShadow, {count: 3600, radius: 58, center: [0, 20], sizeScale: 11});
  for (let i = start; i < splats.length; i++) {
    const splat = splats[i];
    const sizes = splat.axes.map(axis => Math.hypot(...axis));
    normal.fromArray(splat.axes[2]);
    normal.set(normal.x * 2, normal.y, normal.z * 2).normalize();
    tangent.fromArray(splat.axes[0]).addScaledVector(normal, -tangent.dot(normal)).normalize();
    across.crossVectors(normal, tangent);
    splat.axes = [tangent.multiplyScalar(sizes[0]).toArray(), across.multiplyScalar(sizes[1]).toArray(),
      normal.multiplyScalar(sizes[2]).toArray()];
    splat.material = 'snow-glint';
    splat.color = [.92, .97, 1.];
  }
}

function addWindblownSnow(splats, height, sample, contactShadow) {
  for (let i = 0; i < 2400; i++) {
    const seed = sampleNoise(i + 87133);
    const x = -52 + 104 * sampleNoise(i + 13481);
    const z = 3 + 46 * sampleNoise(i + 72910);
    const ground = height(x, z);
    if (ground > 7 || sample(x, z, 10) < .30 || contactShadow(x, z) > .28) continue;
    const size = .018 + .024 * seed;
    splats.push({
      center: [x, ground + .12, z],
      axes: [[size, 0, 0], [0, size * .82, 0], [0, 0, size]],
      color: [.94, .97, 1.], opacity: .48 + .22 * seed, seed,
      material: 'windblown-snow', softParticle: true, wind: [0, 0, seed, 15],
    });
  }
}

function winterSplats(splats, boulderEnd, sample, height) {
  const data = new Uint8Array(splats.length * 4);
  for (const [i, splat] of splats.entries()) {
    const [x, y, z] = splat.center;
    const normal = splat.axes[2];
    const up = normal[1] / Math.hypot(...normal);
    const retention = sample(x, z, 10);
    const exposure = sample(x, z, 11);
    const grass = splat.material === 'grass';
    const moss = splat.material === 'foliage';
    const offset = i * 4;
    if (splat.material === 'windblown-snow') {
      data[offset] = Math.round(retention * (.62 / .7) * 255);
      data[offset + 1] = Math.round(exposure * 255);
      data[offset + 3] = 112;
      continue;
    }
    if (splat.material === 'snow-glint') {
      data[offset] = Math.round(retention * (.62 / .7) * 255);
      data[offset + 1] = Math.round(exposure * 255);
      data[offset + 3] = 80;
      continue;
    }
    if (splat.material === 'meltwater') {
      data[offset + 3] = 160;
      continue;
    }
    if (splat.material === 'cloud' || splat.material === 'winter-fog') {
      data[offset + 3] = splat.material === 'cloud' ? 16 : 32;
      continue;
    }
    if (splat.material === 'flower') {
      data[offset + 2] = Math.round(splat.seed * 255);
      data[offset + 3] = 192;
      continue;
    }
    let depth = retention * .62;
    const boulder = i < boulderEnd;
    if (boulder) {
      // Rock caps retain snow on upward facets, with a dusting on rough flanks.
      depth = (.035 + depth * .62) * smoothstep(up + (splat.seed - .5) * .15, .19, .84);
    } else if (!grass) {
      const shelf = smoothstep(up, .44, .90);
      const altitude = smoothstep(y, 6, 24);
      depth = depth * (.12 + .88 * shelf) + .21 * shelf * altitude * (1 - retention);
      const dusting = smoothstep(up, -.01, .53) * (.018 + splat.seed * .045) * altitude;
      depth = Math.max(depth, dusting);
      const edge = smoothstep(y, 4, 11) * (1 - smoothstep(up, .82, .98));
      const grain = mottling(x * 2.7 + 9, y * 3.4, z * 2.7 + 3);
      const cluster = mottling(x * 1.05, y * 1.55 + 7, z * 1.05);
      const broken = smoothstep(.58 * grain + .42 * cluster, .41, .73);
      depth *= lerp(1, .22 + 1.08 * broken, edge);
      // Small sheltered pockets collect snow separately from the main apron.
      const middle = smoothstep(y, 10, 16) * (1 - smoothstep(y, 29, 37));
      const pocket = smoothstep(.56 * cluster + .44 * grain, .61 + .07 * middle, .80 + .06 * middle);
      const shelter = smoothstep(up, .025, .58) * (.83 + .17 * (1 - exposure));
      const fleck = .23 * pocket * shelter * smoothstep(y, 5, 12) * (1 - .35 * middle);
      depth = Math.max(depth, fleck * (1 - .35 * sample(x, z, 5)));
    }
    data[offset] = Math.round(clamp(depth / .7, 0, 1) * 255);
    data[offset + 1] = Math.round(exposure * 255);
    if (grass) {
      const tip = y - height(x, z) + splat.axes[0][1] * .54;
      data[offset + 2] = Math.round(clamp(tip / .7, 0, 1) * 255);
    } else if (boulder) {
      data[offset + 2] = Math.round((splat.mossCoverage ?? 0) * 255);
    } else if (y < 8) {
      const cover = sample(x, Math.min(z, DEPTH - z), 6);
      const field = smoothstep(z, 8, 20) * smoothstep(up, .48, .94) * (1 - smoothstep(y, 4, 8));
      data[offset + 2] = Math.round(smoothstep(cover, .06, .68) * field * 255);
    }
    // The material tag tells the shader how to interpret the third channel.
    data[offset + 3] = grass ? 255 : moss ? 128 : boulder ? 64 : 0;
  }
  return data;
}

function createCliff(data, positions, material, runoff, meadow, meadowMaterial, winter, fog, wind, wet, meltwater) {
  const sample = terrainSampler(data, runoff, meadow, winter, fog);
  const height = (x, z) => {
    const outside = Math.hypot(Math.max(0, Math.abs(x) - WIDTH / 2), Math.max(0, z - DEPTH / 2));
    const meadow = .38 + .22 * Math.sin(x * .084 + z * .057) * Math.cos(z * .11 - x * .03);
    return lerp(sample(x, z), meadow, smoothstep(outside, 0, 29));
  };
  const splats = [];
  const contactShadow = placeBoulders(positions, height, sample, material, splats);
  const boulderEnd = splats.length;

  function groundColor(x, y, z, gx, gz, grain) {
    const diffuse = Math.max(0, (-gx * LIGHT.x + LIGHT.y - gz * LIGHT.z) / Math.hypot(gx, 1, gz));
    const slope = Math.hypot(gx, gz);
    const rockWash = Math.sin(x * .56 + z * .38) * Math.cos(z * .29 - x * .42);
    const exposed = smoothstep(slope + .22 * rockWash, .43, 1.75);
    const cliff = cliffPigment(sample, x, z, exposed);
    const scree = sample(x, z, 4);
    const grit = scree * .044 * (Math.sin(x * 5.9 - z * 3.8) * Math.cos(z * 6.1 + x * 4.2));
    const meadowZ = Math.min(z, DEPTH - z);
    const cover = sample(x, meadowZ, 6);
    const bedding = .037 * Math.sin(y * 2.08 + x * .28 + rockWash * 1.1) * exposed;
    const shadow = Math.abs(x) < 54 && z > -20 && z < 51 ? contactShadow(x, z) : 0;
    const light = (.67 + .47 * diffuse) * (1 - .39 * shadow);
    const earth = SOIL.map((channel, c) => {
      const grass = lerp(GRASS[c], sample(x, meadowZ, 7 + c), .87);
      return lerp(channel, grass, smoothstep(cover, .03, .78) * .90);
    });
    const field = smoothstep(z, 8, 20) * (1 - exposed) * (1 - scree);
    const wash = field > 0 ? lerp(rockWash, mottling(x * .48 + 3, y * .54, z * .51 + 8) * 2 - 1, field) : rockWash;
    const textured = field > 0 ? meadowMaterial(earth, x, y, z, cover) : earth;
    return earth.map((channel, c) => {
      const ground = lerp(channel, textured[c], field);
      const talus = lerp(SCREE[c], cliff[c], .49);
      const pigment = lerp(lerp(ground, cliff[c], exposed), talus, Math.max(scree * .86, shadow * .22));
      return clamp((pigment + grit + bedding + .027 * wash + .055 * (grain - .5)) * light, 0, 1);
    });
  }

  const tangent = new Vector3(), across = new Vector3(), normal = new Vector3();
  const center = new Vector3(), near = new Vector3(), far = new Vector3(), downslope = new Vector3();
  const cols = 278, rows = 218, width = 164, depth = 150;
  const dx = width / cols, dz = depth / rows;

  function displaced(x, z, out) {
    const y = height(x, z);
    const gx = (height(x + .38, z) - height(x - .38, z)) / .76;
    const gz = (height(x, z + .38) - height(x, z - .38)) / .76;
    cliffSurface(x, y, z, gx, gz, cliffExposure(y, gx, gz), sample(x, z, 5), out);
  }

  for (let row = 0; row < rows; row++) {
    const firstZ = row * dz - 58;
    for (let col = 0; col < cols; col++) {
      const key = row * cols + col;
      const firstX = col * dx - width / 2;
      const middleX = firstX + dx * .5, middleZ = firstZ + dz * .5;
      const rise = height(middleX, firstZ) - height(middleX, firstZ + dz);
      const face = cliffExposure(height(middleX, middleZ),
        (height(firstX + dx, middleZ) - height(firstX, middleZ)) / dx, -rise / dz);
      const onPile = sample(middleX, middleZ, 4) > .27;
      const foreground = middleZ > 18 && middleZ < 55 && Math.abs(middleX) < 44;
      const columns = face > .26 || foreground ? 2 : 1;
      const bands = clamp(Math.ceil(Math.hypot(dz, rise) / (dz * lerp(1.42, .57, face))), onPile || foreground ? 2 : 1, 12);
      for (let sub = 0; sub < columns; sub++) {
        for (let band = 0; band < bands; band++) {
          const mark = (key * 2 + sub) * 12 + band;
          const seed = sampleNoise(mark + 31);
          const drift = sampleNoise(mark ^ 0x9e3779b9);
          const x = firstX + (sub + .5 + .58 * (drift - .5)) * dx / columns;
          const z = firstZ + (band + .5 + .64 * (seed - .5)) * dz / bands;
          const y = height(x, z);
          const gx = (height(x + .38, z) - height(x - .38, z)) / .76;
          const gz = (height(x, z + .38) - height(x, z - .38)) / .76;
          const detail = cliffExposure(y, gx, gz);
          const relief = cliffSurface(x, y, z, gx, gz, detail, sample(x, z, 5), center);
          tangent.set(1, gx, 0);
          downslope.set(0, gz, 1);
          if (relief) {
            const step = .13;
            displaced(x - step, z, near); displaced(x + step, z, far);
            tangent.subVectors(far, near).multiplyScalar(1 / (2 * step));
            displaced(x, z - step, near); displaced(x, z + step, far);
            downslope.subVectors(far, near).multiplyScalar(1 / (2 * step));
          }
          normal.crossVectors(downslope, tangent).normalize();
          const along = clamp(tangent.length(), .57, 3.4);
          tangent.normalize();
          across.crossVectors(normal, tangent);
          const spread = clamp(Math.abs(downslope.dot(across)), .57, 10.5);
          const base = groundColor(x, y, z, gx, gz, seed);
          let color = base;
          if (relief) {
            const pigment = cliffSurfaceColor(x, y, z, relief, detail,
              cliffPigment(sample, x, z, .74), Math.max(0, normal.dot(LIGHT)), seed);
            color = base.map((channel, c) => lerp(channel, pigment[c], detail * .88));
          }
          const horizontal = dx * .74 * along / columns;
          const vertical = dz * .77 * spread / bands;
          const size = Math.sqrt(horizontal * vertical);
          const aspect = clamp(Math.sqrt(horizontal / vertical), .69, 1.45);
          const mineral = Math.max(detail, smoothstep(sample(x, z, 4), .15, .74) * .76);
          if (mineral > 0) color = material(color, center, normal, size, mineral,
            relief?.fresh ?? 0, relief?.damp ?? 0);
          splats.push({
            center: center.toArray(),
            axes: [tangent.setLength(lerp(horizontal, size * aspect, detail)).toArray(),
              across.setLength(lerp(vertical, size / aspect, detail)).toArray(), normal.setLength(lerp(.068, .039, detail)).toArray()],
            color, opacity: .96, seed, material: 'stone',
          });
        }
      }
    }
  }
  paintGrass(splats, height, sample, contactShadow);
  addSnowGlitter(splats, height, contactShadow);
  addWindblownSnow(splats, height, sample, contactShadow);
  addCliffAtmosphere(splats, height, sample);
  for (const route of meltwater) addCliffMeltwater(splats, route, height, sample);
  const visibleBoulders = fadeCliffPerimeter(splats, boulderEnd);
  // Stand-ins for groups of distant stone and moss marks, sized for the
  // authored camera. They are appended here so the snow, lighting and physics
  // tables below cover them. Boulder and talus marks take part too: a
  // stand-in steps aside for its members as soon as physics moves one.
  const authored = cliffTalusScene.initialStyle, lod = cliffTalusScene.markLOD;
  const markClusters = buildMarkClusters(splats, {camera: cliffTalusScene.camera, height: lod.clusterHeight, pixels: lod.pixels,
    footprint: authored.brushScale * (1 + authored.gouacheBlend * .18)});
  const rockRanges = [];
  for(let i=0;i<visibleBoulders;i++){
    const id=splats[i].cliffRockId;
    const last=rockRanges.at(-1);
    if(last?.id===id)last.count++;
    else rockRanges.push({...contactShadow.authoredRocks[id],start:i,count:1});
  }
  return {
    splats, markClusters, seasonalSnow: winterSplats(splats, visibleBoulders, sample, height), snowTerrain: winter,
    revealMaps: {erosion: runoff, vegetation: meadow, surface: data},
    winterFog: fog, vegetationWind: wind, meltWetMap: wet,
    animation: {indices: splats.flatMap((splat, i) => splat.wind ? [i] : [])},
    actorLabel: 'crow and birds', loadActor: () => loadCliffCourier(height, contactShadow.colliders, {
      environmentSplats:splats, authoredRocks:rockRanges,
      exposure: (x, z) => {
        const col = Math.round(clamp(.5 + x / WIDTH, 0, 1) * (SIDE - 1));
        const row = Math.round(clamp(.5 + z / DEPTH, 0, 1) * (SIDE - 1));
        return wind[row * SIDE + col] / 255;
      },
    }),
    trample: {size: 384, bounds: [-60, 2, 120, 78], radius: .92, recovery: 19, intensity: 1.22},
    background: '#a8b9bd', causticClouds: {height: 84, strength: .86, modeled: true}, orbitMin: 25, orbitLimit: 156,
    atmosphere: {color: '#a8b9bd', start: 78, density: .011, max: .62},
    lighting: {
      irradiance: new Float32Array(splats.length * 3),
      shadow: new Float32Array(splats.length),
      stats: {},
    },
  };
}

let surface, boulders, mineralGrain, runoff, meadow, meadowGrain, winter, fog, wind, wet, meltwater;

/** Smaller LibreTerrain court for physics inspection. Shares the cliff's stone
 * family and material sources; ground geometry and collisions use the same
 * evaluated LibreTerrain heightfield at its exported resolution.
 */
export function createCliffPhysicsLab(grid,labSurface,desertSurface,albedo){
  const gridSide=Math.round(Math.sqrt(grid.length)),last=gridSide-1;
  if(gridSide*gridSide!==grid.length||gridSide<2)throw new Error('Invalid desert heightfield');
  const sample=terrainSampler(surface,runoff,meadow,winter,fog),sourceHeight=(x,z)=>{
    const u=clamp((x+30)/60,0,1)*last,v=clamp((z+28)/56,0,1)*last,col=Math.min(last-1,Math.floor(u)),row=Math.min(last-1,Math.floor(v));
    return lerp(lerp(grid[row*gridSide+col],grid[row*gridSide+col+1],u-col),lerp(grid[(row+1)*gridSide+col],grid[(row+1)*gridSide+col+1],u-col),v-row);
  };
  const waterConfig={...WATER_BASIN,level:sourceHeight(WATER_BASIN.x,WATER_BASIN.z)-.025};
  const height=(x,z)=>waterBasinHeight(x,z,sourceHeight(x,z),waterConfig.level);
  const layer=(x,z,channel,data=labSurface)=>{
    if(!data)return 0;
    const u=clamp((x+30)/60,0,1)*last,v=clamp((z+28)/56,0,1)*last,col=Math.min(last-1,Math.floor(u)),row=Math.min(last-1,Math.floor(v));
    const at=(a,b)=>data[(b*gridSide+a)*4+channel]/255;
    return lerp(lerp(at(col,row),at(col+1,row),u-col),lerp(at(col,row+1),at(col+1,row+1),u-col),v-row);
  };
  const splats=[],positions=[];
  // Authored props in four lanes, including larger impact targets and small
  // wind-responsive clasts. None of these are the spawned-rock pool.
  for(let row=0;row<4;row++)for(let col=0;col<4;col++)positions.push([-9+col*6+.25*Math.sin(row*7+col),-11+row*6+.25*Math.cos(col*3+row),(row*91+col*37)%360,1.4+.45*((row+col)%3)]);
  for(let i=0;i<32;i++)positions.push([i<18?(i%2?1:-1)*(16+sampleNoise(i+100)*8):(sampleNoise(i+100)-.5)*25,-15+sampleNoise(i+200)*29,i*47,.45+.65*sampleNoise(i+300)]);
  // Keep all authored rock IDs, but clear the larger pond and its bank.
  for(const p of positions){
    const margin=p[3]*.65+.8;
    if(Math.hypot((p[0]-waterConfig.x)/(waterConfig.rx+margin),(p[1]-waterConfig.z)/(waterConfig.rz+margin))<1)
      p[1]=Math.min(p[1],waterConfig.z-waterConfig.rz*1.3-margin);
  }
  const contact=placeBoulders(positions,height,sample,createCliffMaterial(mineralGrain),splats),boulderEnd=splats.length;
  // The original cliff material remains unchanged; these local rock marks use
  // dry sandstone bands and mineral crust instead of moss.
  for(let i=0;i<boulderEnd;i++){
    const mark=splats[i],[x,y,z]=mark.center,n=new Vector3(...mark.axes[2]).normalize();
    const strata=.5+.5*Math.sin(y*7.8+x*.24+z*.11),crust=Math.max(0,n.y)*(.12+.16*mark.seed);
    const pigment=[lerp(.66,.82,strata),lerp(.35,.56,strata),lerp(.20,.33,strata)],light=.60+.35*Math.max(0,n.dot(LIGHT))+.05*mark.seed;
    mark.color=pigment.map((c,k)=>lerp(c,[.86,.73,.51][k],crust)*light);mark.mossCoverage=0;mark.material='stone';
  }
  const normal=new Vector3(),tangent=new Vector3(),across=new Vector3();
  const cols=240,rows=224,spacing=.25;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const x0=(col+.5)*spacing-30,z0=(row+.5)*spacing-28,near=Math.hypot(x0/17,(z0-3)/16)<1.25;
    if(!near&&(col%2||row%2))continue;
    const sampleSpacing=near?spacing:spacing*2,footprint=sampleSpacing*.72;
    const seed=sampleNoise(row*cols+col+1),x=x0+.45*(seed-.5)*sampleSpacing,z=z0+.45*(sampleNoise(row*cols+col+97)-.5)*sampleSpacing,y=height(x,z);
    const gx=(height(x+.1,z)-height(x-.1,z))/.2,gz=(height(x,z+.1)-height(x,z-.1))/.2;
    normal.set(-gx,1,-gz).normalize();tangent.set(1,gx,0).normalize();across.crossVectors(normal,tangent);
    const flow=layer(x,z,0),deposit=layer(x,z,2),slope=Math.hypot(gx,gz),concave=layer(x,z,0,desertSurface),debris=layer(x,z,2,desertSurface);
    const ripple=Math.sin((x*.64+z*.77)*14+.8*mottling(x*.3,y*.4,z*.3));
    const shade=.70+.30*Math.max(0,normal.dot(LIGHT))+.035*(seed-.5)-contact(x,z)*.16-.04*concave;
    const base=albedo?[layer(x,z,0,albedo),layer(x,z,1,albedo),layer(x,z,2,albedo)]:[.81,.65,.43];
    const color=base.map((c,k)=>c*(1+.016*ripple*(1-smoothstep(slope,.1,.7))+.018*deposit-.018*debris));
    const edge=1-smoothstep(Math.max(Math.abs(x)/30,Math.abs(z)/28),.90,1);
    splats.push({center:[x,y,z],axes:[tangent.multiplyScalar(footprint*Math.hypot(1,gx)).toArray(),across.multiplyScalar(footprint*Math.hypot(1,gz)).toArray(),normal.multiplyScalar(.018).toArray()],color:color.map(c=>c*shade),opacity:Math.max(.0001,.98*edge),seed,material:'sand'});
    // Sparse dry stems at wash edges; the physical test clearing stays bare.
    const clearing=Math.hypot(x/13,(z-2)/12);
    if(seed>.986&&clearing>.95&&clearing<2.05&&slope<.48&&contact(x,z)<.35&&edge>.3&&(flow>.06||deposit>.08)){
      const length=.10+.16*sampleNoise(col*131+row*89),tilt=.06*Math.sin(seed*40);
      const stem=new Vector3(tilt,length*.52,.025),width=new Vector3(1,-tilt/(length*.52),0).normalize().multiplyScalar(.018),depth=new Vector3().crossVectors(width,stem).normalize().multiplyScalar(.015);
      splats.push({center:[x,y+length*.55,z],axes:[width.toArray(),stem.toArray(),depth.toArray()],color:[.59+seed*.08,.49+seed*.07,.29+seed*.06],opacity:.88*edge,seed,material:'dry-grass',wind:[x,y,z,2]});
    }
  }
  const ranges=[];for(let i=0;i<boulderEnd;i++){const id=splats[i].cliffRockId,last=ranges.at(-1);if(last?.id===id)last.count++;else ranges.push({...contact.authoredRocks[id],start:i,count:1});}
  const seasonalSnow=winterSplats(splats,boulderEnd,sample,height);
  for(let i=boulderEnd;i<splats.length;i++){
    seasonalSnow[i*4+2]=0;
    if(splats[i].material==='sand')seasonalSnow[i*4+3]=4;
  }
  return {splats,seasonalSnow,snowTerrain:winter,winterFog:fog,vegetationWind:wind,terrainResolution:gridSide,terrainBiome:'desert',
    revealMaps:{erosion:runoff,vegetation:meadow,surface},animation:{indices:splats.flatMap((s,i)=>s.wind?[i]:[])},
    actorLabel:'physics courier',loadActor:()=>loadCliffCourier(height,contact.colliders,{environmentSplats:splats,authoredRocks:ranges,playerStart:[0,0,14],exposure:()=>1,motionBlur:true,advancedRocks:true,flexibleLab:true,desert:true,water:waterConfig,accumulation:true}),
    background:'#c4d4d5',causticClouds:{height:84,strength:.3,modeled:true},orbitMin:5,orbitLimit:90,orbitMaxPolar:Math.PI/2-.05,orbitMinY:1.2,
    atmosphere:{color:'#dfc09c',start:45,density:.006,max:.18},
    lighting:{irradiance:new Float32Array(splats.length*3),shadow:new Float32Array(splats.length),stats:{}}};
}

export const cliffTalusScene = {
  id: 'cliff-talus',
  label: 'Cliff and talus',
  title: 'Cliff and talus',
  description: 'Fractured ledges rise above mossy talus and a meadow that blooms, dries, and snows over through the year.',
  caption: 'Gouache cliff · dense talus piles',
  swatch: 'cliff-talus',
  // 332,426 marks plus about 24,000 merged stand-ins for distant groups.
  splatBudget: 365_000,
  // Distant terrain and rock marks under two pixels across share the work of
  // a few enlarged ones.
  markLOD: {pixels: 2, clusterHeight: 688},
  vertexPrepass: true,
  camera: {
    position: [37.15380740393571, 5.402947660373462, 66.92255827991751],
    target: [-6.30438849194374, 7.018742148682245, 4.587595049295344],
    fov: 48, focalLength: 25.267913706422426,
  },
  styleOnVisit: true,
  initialStyle: {
    quality: 'studio', mode: 'ghibli', brushScale: 1.01, coverage: 1.28, softness: .24,
    gouacheTexture: .39, gouacheBlend: .44, gouacheTone: .25,
    indirect: false, tintedShadows: false, sun: false, lensDirt: true, lensDirtStrength: .28, lensDirtScale: 1.5, lensFlare: false,
    painterlyVignette: false, foregroundDOF: false,
  },
  async prepare(fetcher = globalThis.fetch) {
    if (surface) return;
    const root = `${import.meta.env?.BASE_URL ?? '/'}cliff-talus/`;
    const [terrain, rockfall, grain, channels, field, groundTexture, snow, mist, breeze, damp, stream] = await Promise.all([
      fetcher(root + 'surface.bin'), fetcher(root + 'rockfall.json'), fetcher(root + 'mineral-grain.u8'),
      fetcher(root + 'runoff.u8'), fetcher(root + 'meadow.u8'), fetcher(root + 'meadow-grain.u8'), fetcher(root + 'winter.u8'),
      fetcher(root + 'fog.u8'),
      fetcher(root + 'wind.u8'),
      fetcher(root + 'wet.u8'), fetcher(root + 'meltwater.json'),
      loadRockFractures(fetcher),
    ]);
    if (!terrain.ok || !rockfall.ok || !grain.ok || !channels.ok || !field.ok || !groundTexture.ok || !snow.ok || !mist.ok || !breeze.ok || !damp.ok || !stream.ok) throw new Error('Could not load the cliff and talus bake.');
    const [data, report, texture, drainage, vegetation, ground, snowMap, fogMap, windMap, wetMap, meltRoute] = await Promise.all([
      terrain.arrayBuffer(), rockfall.json(), grain.arrayBuffer(), channels.arrayBuffer(), field.arrayBuffer(),
      groundTexture.arrayBuffer(), snow.arrayBuffer(), mist.arrayBuffer(),
      breeze.arrayBuffer(),
      damp.arrayBuffer(), stream.json(),
    ]);
    const meltRoutes = meltRoute.routes ?? [meltRoute];
    if (data.byteLength !== SIDE ** 2 * 5 || texture.byteLength !== MINERAL_BYTES || drainage.byteLength !== SIDE ** 2 || vegetation.byteLength !== SIDE ** 2 * 4 || ground.byteLength !== MINERAL_BYTES
      || snowMap.byteLength !== SIDE ** 2 * 2
      || fogMap.byteLength !== SIDE ** 2 * 4
      || windMap.byteLength !== SIDE ** 2
      || wetMap.byteLength !== SIDE ** 2 * 4
      || !Array.isArray(meltRoutes) || !meltRoutes.length
      || !meltRoutes.every(route => Array.isArray(route?.points) && route.points.length >= 12
        && route.points.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)))
      || !Array.isArray(report.boulders) || !report.boulders.length
      || !report.boulders.every(rock => Array.isArray(rock) && rock.length === 4 && rock.every(Number.isFinite) && rock[3] > 0)) {
      throw new Error('Invalid cliff and talus bake.');
    }
    boulders = report.boulders;
    mineralGrain = new Uint8Array(texture);
    runoff = new Uint8Array(drainage);
    meadow = new Uint8Array(vegetation);
    meadowGrain = new Uint8Array(ground);
    winter = new Uint8Array(snowMap);
    fog = new Uint8Array(fogMap);
    wind = new Uint8Array(windMap);
    wet = new Uint8Array(wetMap);
    meltwater = meltRoutes;
    surface = new Uint8Array(data);
  },
  create() {
    return createCliff(surface, boulders, createCliffMaterial(mineralGrain), runoff, meadow,
      createMeadowMaterial(meadowGrain), winter, fog, wind, wet, meltwater);
  },
};
