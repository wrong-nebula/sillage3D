/** Terrestrial habitat fields for fictional botanical design.
 * Units: metres, °C, annual mm, bar, radians; resource/affinity fields are 0–1.
 * These are deterministic art-direction proxies, not drainage, weather, soil,
 * atmospheric chemistry or ecosystem simulations. Clock time is intentionally absent.
 */
import { noise3 } from './ocean-terrain.js';

const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const mix = (a, b, t) => a + (b - a) * t;
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
const smooth = (a, b, n) => { const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t); };
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export const LAND_ENVIRONMENTS = freeze({
  balanced: { name: 'Eden · temperate mosaic', planetType: 'temperate terrestrial', equatorC: 30, poleDropC: 39,
    rainfall: 1, transmission: .9, starPAR: 1, pressureBar: 1, oxygenFraction: .21, co2Fraction: .00042,
    gravity: 1, soilScale: 1, organicScale: 1, nitrogen: .68, phosphorus: .62, salt: .05, metals: .12,
    bedrocks: ['sandstone', 'granite', 'basalt', 'limestone', 'alluvium'] },
  arid: { name: 'Sirocco · dry sandstone world', planetType: 'arid terrestrial', equatorC: 40, poleDropC: 40,
    rainfall: .3, transmission: .96, starPAR: 1.08, pressureBar: .78, oxygenFraction: .19, co2Fraction: .0007,
    gravity: .86, soilScale: .55, organicScale: .32, nitrogen: .3, phosphorus: .42, salt: .18, metals: .12,
    bedrocks: ['sandstone', 'sandstone', 'granite', 'evaporite'] },
  glacial: { name: 'Nacre · cold silicate uplands', planetType: 'cold terrestrial', equatorC: 14, poleDropC: 31,
    rainfall: .72, transmission: .87, starPAR: .87, pressureBar: .88, oxygenFraction: .23, co2Fraction: .0005,
    gravity: 1.08, soilScale: .48, organicScale: .66, nitrogen: .48, phosphorus: .44, salt: .025, metals: .14,
    bedrocks: ['granite', 'granite', 'basalt', 'alluvium'] },
  ferruginous: { name: 'Ferrum · iron-rich volcanic soil', planetType: 'ferruginous terrestrial', equatorC: 34, poleDropC: 37,
    rainfall: .88, transmission: .64, starPAR: 1, pressureBar: 1.45, oxygenFraction: .16, co2Fraction: .0012,
    gravity: 1.16, soilScale: .7, organicScale: .63, nitrogen: .43, phosphorus: .37, salt: .08, metals: .72,
    bedrocks: ['basalt', 'basalt', 'basalt', 'sandstone'] },
  limestone: { name: 'Calcaire · pale karst and springs', planetType: 'carbonate terrestrial', equatorC: 28, poleDropC: 35,
    rainfall: 1.22, transmission: .88, starPAR: .98, pressureBar: 1.08, oxygenFraction: .22, co2Fraction: .00048,
    gravity: .94, soilScale: .78, organicScale: .88, nitrogen: .62, phosphorus: .42, salt: .045, metals: .07,
    bedrocks: ['limestone', 'limestone', 'limestone', 'alluvium'] },
  twilight: { name: 'Umbra · humid dim-light world', planetType: 'hazy terrestrial', equatorC: 25, poleDropC: 28,
    rainfall: 1.5, transmission: .37, starPAR: .63, pressureBar: 1.65, oxygenFraction: .17, co2Fraction: .0018,
    gravity: .8, soilScale: 1.16, organicScale: 1.25, nitrogen: .78, phosphorus: .52, salt: .025, metals: .11,
    bedrocks: ['alluvium', 'basalt', 'sandstone', 'granite'] },
  sterile: { name: 'Cinder · airless mineral world', planetType: 'airless terrestrial', equatorC: 70, poleDropC: 100,
    rainfall: 0, transmission: 1, starPAR: 1.2, pressureBar: 0, oxygenFraction: 0, co2Fraction: 0,
    gravity: .38, soilScale: .1, organicScale: 0, nitrogen: 0, phosphorus: .2, salt: .3, metals: .65,
    bedrocks: ['basalt', 'granite'] },
});

const ROCKS = freeze({
  basalt: { pH: 6.3, sand: .3, clay: .35, depth: .8, iron: .83, silica: .49, carbonate: .12, sulfur: .34, phosphorus: .75 },
  granite: { pH: 5.25, sand: .68, clay: .15, depth: .58, iron: .21, silica: .94, carbonate: .06, sulfur: .07, phosphorus: .32 },
  sandstone: { pH: 6.35, sand: .82, clay: .06, depth: .8, iron: .27, silica: .83, carbonate: .18, sulfur: .06, phosphorus: .26 },
  limestone: { pH: 7.9, sand: .25, clay: .4, depth: .43, iron: .12, silica: .24, carbonate: .97, sulfur: .08, phosphorus: .3 },
  alluvium: { pH: 6.85, sand: .31, clay: .24, depth: 1.6, iron: .3, silica: .57, carbonate: .42, sulfur: .08, phosphorus: .68 },
  evaporite: { pH: 8.45, sand: .57, clay: .17, depth: .42, iron: .08, silica: .29, carbonate: .62, sulfur: .45, phosphorus: .17 },
});

/** A custom profile may extend a preset for a scenario; no unrequested clock fields are read. */
export function sampleLandEnvironment(direction, terrainData = {}, options = {}) {
  const seed = finite(options.seed, 731) | 0;
  const key = typeof options.environment === 'string' && Object.hasOwn(LAND_ENVIRONMENTS, options.environment)
    ? options.environment : 'balanced';
  const planet = typeof options.environment === 'object' && options.environment !== null
    ? { ...LAND_ENVIRONMENTS.balanced, ...options.environment } : LAND_ENVIRONMENTS[key];
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < 1e-12) throw new RangeError('Land habitat requires a finite nonzero direction.');
  const x = direction.x / length, y = direction.y / length, z = direction.z / length;
  const field = (f, salt) => noise3(x * f + 19, y * f - 7, z * f + 11, seed + salt);
  const regional = field(7, 2421), geological = field(17, 5501), local = field(91, 8263);
  const altitude = finite(terrainData.height, 0);
  const latitude = Math.asin(clamp(y, -1, 1)) * 180 / Math.PI;
  const slope = clamp(finite(options.slope, finite(terrainData.slope, 0)), 0, Math.PI / 2);
  const climateMoisture = clamp(finite(terrainData.moisture, .2 + regional * .65));
  const rainfallMm = Math.max(0, (90 + 2200 * climateMoisture ** 1.4) * planet.rainfall * (.82 + regional * .36));
  const temperature = planet.equatorC - planet.poleDropC * Math.abs(y) ** 1.12
    - Math.max(0, altitude) * .0065 + (regional - .5) * 6;
  const rocks = planet.bedrocks;
  let bedrock = rocks[Math.min(rocks.length - 1, Math.floor(geological * rocks.length))];
  // Existing authored biomes retain their geological character on the default planet.
  if (key === 'balanced' && typeof options.environment !== 'object') {
    bedrock = { dunes: 'sandstone', mesas: 'sandstone', salt: 'evaporite', highlands: 'granite', polar: 'granite', island: 'basalt', coast: 'alluvium' }[terrainData.biome] ?? bedrock;
  }
  if (Object.hasOwn(ROCKS, terrainData.bedrock)) bedrock = terrainData.bedrock;
  const rock = ROCKS[bedrock];
  // A continuous wet-corridor proxy, explicitly not a rendered river or drainage solution.
  const drainage = Math.abs(field(35, 9817) - .5) * 2;
  const waterDistance = Math.max(0, finite(terrainData.waterDistance,
    (terrainData.shore > .1 ? Math.abs(altitude) * 5 : drainage ** 2 * (240 + 900 / Math.max(.2, planet.rainfall)))));
  const waterSource = Number.isFinite(terrainData.waterDistance) ? 'terrain hydrology' : terrainData.shore > .1 ? 'shore-height proxy' : 'seeded wet-corridor proxy';
  const groundwater = Math.exp(-waterDistance / 65) * clamp(planet.rainfall * .72);
  const soilDepth = clamp(finite(terrainData.soilDepth,
    rock.depth * planet.soilScale * (.55 + local * .9) * (1 - .8 * Math.sin(slope)) + groundwater * .28), .005, 6);
  const sand = clamp(rock.sand + (local - .5) * .12, .02, .9);
  const clay = clamp(rock.clay + (regional - .5) * .08, .02, .95 - sand);
  const texture = { sand, clay, silt: 1 - sand - clay };
  const evaporation = clamp((temperature + 10) / 55) * (.4 + .6 * sand);
  const moisture = clamp(finite(terrainData.availableWater,
    rainfallMm / (rainfallMm + 730) * (1 - .32 * evaporation) + groundwater * .34 - Math.sin(slope) * .14));
  const organicMatter = clamp(planet.organicScale * (.14 + .65 * moisture) * (.65 + .35 * local));
  const nitrogen = clamp(planet.nitrogen * (.28 + .72 * organicMatter) + groundwater * .08);
  // High carbonate and iron can bind phosphate: minerals are not interchangeable fertility.
  const phosphorus = clamp(planet.phosphorus * (.55 + .45 * rock.phosphorus)
    * (1 - .24 * rock.carbonate) * (1 - .2 * planet.metals));
  const salinity = clamp(planet.salt + (bedrock === 'evaporite' ? .45 : 0)
    + .12 * (1 - moisture) - groundwater * .055);
  const metals = clamp(planet.metals * (.55 + .45 * rock.iron) * (.8 + .4 * geological));
  const pH = clamp(finite(terrainData.pH, rock.pH - .5 * organicMatter + (local - .5) * .4), 3, 10);
  const minerals = { iron: clamp(rock.iron * (.8 + .2 * geological) + planet.metals * .2),
    silica: rock.silica, carbonate: rock.carbonate, sulfur: rock.sulfur };
  const canopyShade = clamp(finite(options.canopyShade, finite(terrainData.canopyShade, 0)));
  const openSky = clamp(finite(options.openSky, finite(terrainData.openSky, 1)));
  const incidentPAR = Math.max(0, planet.starPAR * planet.transmission * (.38 + .62 * Math.sqrt(1 - y * y)));
  const dailyPAR = incidentPAR * (.12 + .88 * openSky) * (1 - .94 * canopyShade);
  const pressureBar = Math.max(0, planet.pressureBar * Math.exp(-Math.max(0, altitude) / 8400));
  const oxygenFraction = clamp(planet.oxygenFraction), co2Fraction = clamp(planet.co2Fraction);
  const oxygenPartialBar = pressureBar * oxygenFraction;
  const liquidWater = temperature > -28 && temperature < 65 && pressureBar >= .06 && moisture > .005;
  const submerged = finite(terrainData.depth, 0) > .08;
  const habitable = !submerged && liquidWater && oxygenPartialBar >= .003 && pressureBar * co2Fraction >= 1e-7;
  return { environment: typeof options.environment === 'object' ? 'custom' : key, name: planet.name,
    planetType: planet.planetType, latitude, altitude, temperature, rainfallMm, moisture, waterDistance, waterSource,
    bedrock, soilDepth, texture, pH, nitrogen, phosphorus, organicMatter, salinity, metals, minerals, slope,
    wind: clamp(.2 + field(43, 3371) * .52 + Math.sin(slope) * .2 + Math.max(0, altitude) / 4500),
    canopyShade, openSky, incidentPAR, dailyPAR, light: dailyPAR,
    pressureBar, oxygenFraction, co2Fraction, oxygenPartialBar, gravity: planet.gravity,
    liquidWater, submerged, habitable, frostDays: Math.round(365 * (1 - smooth(-12, 16, temperature))),
    waterTableDepth: waterDistance / 45 + .15,
  };
}

/** Hard niche boundaries with a soft interior; values inside a boundary stay viable. */
function rangeFitness(value, range) {
  if (!range) return 1;
  const [lo, hi] = range;
  if (!Number.isFinite(value) || value < lo || value > hi) return 0;
  const margin = Math.max(1e-8, (hi - lo) * .16);
  return .35 + .65 * Math.min(smooth(lo, lo + margin, value), 1 - smooth(hi - margin, hi, value));
}

/** Establishment score. Species rules are designed ecological envelopes, not measured biology. */
export function landSuitability(spec, environment) {
  const e = environment, n = spec.ecology ?? {};
  if (e.submerged || e.habitable === false || e.liquidWater === false) return 0;
  if (e.pressureBar < .06 || e.oxygenPartialBar < .003 || e.pressureBar * e.co2Fraction < 1e-7) return 0;
  if (e.temperature < -28 || e.temperature > 65) return 0;
  const minLight = Math.max(.0005, n.lightMin ?? .04);
  if (e.dailyPAR < minLight || e.moisture < .005) return 0;
  if (e.slope > (n.slopeMax ?? 1.25) || e.salinity > (n.salinityMax ?? .65) || e.metals > (n.metalTolerance ?? .9)) return 0;
  // Exposed root anatomy belongs to a physical site, not every member of a genus.
  // Bedrock alone can lie beneath deep soil; require an actually shallow/steep proxy.
  const roots = spec.traits?.roots ?? 'buried';
  if (roots === 'rock-clasp' && (!['granite', 'basalt', 'limestone', 'sandstone'].includes(e.bedrock)
    || e.soilDepth > .85 || !(e.soilDepth <= .32 || e.slope >= .42))) return 0;
  if (roots === 'eroded-bank' && (e.soilDepth > .75 || e.slope < .18 || e.waterDistance > 120)) return 0;
  let score = 1;
  for (const [value, range] of [[e.temperature, n.temperature], [e.moisture, n.moisture], [e.pH, n.pH],
    [e.soilDepth, n.soilDepth], [e.waterDistance, n.waterDistance], [e.altitude, n.altitude], [e.pressureBar, n.pressure]]) {
    const fitness = rangeFitness(value, range);
    if (!fitness) return 0;
    score *= fitness;
  }
  const bedrocks = Array.isArray(n.bedrock) ? n.bedrock : [n.bedrock ?? 'any'];
  if (!bedrocks.includes('any') && !bedrocks.includes(e.bedrock)) {
    if (n.bedrockStrict) return 0;
    score *= .16;
  }
  const need = n.nutrientNeed ?? [.12, .1];
  // Liebig-style limiting resource proxy; extra nitrogen does not substitute for phosphorus.
  const nutrients = Math.min(1, e.nitrogen / Math.max(.001, need[0]), e.phosphorus / Math.max(.001, need[1]));
  if (nutrients < .08) return 0;
  score *= nutrients * (.5 + .5 * smooth(minLight, Math.min(1.5, minLight * 4 + .1), e.dailyPAR));
  if (n.mineral && n.mineral !== 'any') score *= .25 + .75 * (e.minerals[n.mineral] ?? 0);
  if (n.windMax !== undefined && e.wind > n.windMax) score *= .2;
  return clamp(score);
}
