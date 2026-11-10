import {DataTexture, LinearFilter, MathUtils, RedFormat, RepeatWrapping, TextureLoader, Vector3} from 'three';

const ASSETS = import.meta.env?.BASE_URL ?? '/';
const GRID_STRIDE = 2;
const {clamp, lerp, smoothstep} = MathUtils;
const LIGHT = new Vector3(-.73, .57, -.38).normalize();
const GRASS = [.53, .53, .34];
const SCREE = [.65, .60, .51];
const SLATE = [.44, .46, .48];


function readGrid(meta, data, maskData) {
  const {width, height, sampleMeters, baseMeters, heightStepMeters} = meta;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4
    || width % GRID_STRIDE || height % GRID_STRIDE || data.byteLength !== width * height * 2
    || (maskData && maskData.byteLength !== width * height)
    || !Number.isFinite(baseMeters) || !(sampleMeters > 0) || !(heightStepMeters > 0)) {
    throw new Error('Invalid terrain elevation grid.');
  }
  const values = new DataView(data);
  const at = (x, z) => baseMeters + values.getUint16((z * width + x) * 2, true) * heightStepMeters;
  const sample = (x, z) => {
    x = clamp(x, 0, width - 1);
    z = clamp(z, 0, height - 1);
    const ix = Math.min(Math.floor(x), width - 2);
    const iz = Math.min(Math.floor(z), height - 2);
    return lerp(lerp(at(ix, iz), at(ix + 1, iz), x - ix),
      lerp(at(ix, iz + 1), at(ix + 1, iz + 1), x - ix), z - iz);
  };
  const mask = maskData && new Uint8Array(maskData);
  const snowAt = (x, z) => mask ? mask[Math.round(z) * width + Math.round(x)] / 255 : 0;
  return {width, height, sample, sampleMeters, snowAt, mask};
}

function buildTerrain({width, height, sample, sampleMeters, snowAt}, {
  metresPerUnit = 10, datum = 2429, background = '#97aab3', orbitLimit = 250,
  grass = GRASS, scree = SCREE, slate = SLATE, altitudeBand = [2440, 2730],
}) {
  const splats = [];
  const tangent = new Vector3(), normal = new Vector3(), across = new Vector3();
  const spacing = sampleMeters * GRID_STRIDE / metresPerUnit;
  for (let row = 0; row < height; row += GRID_STRIDE) {
    for (let col = 0; col < width; col += GRID_STRIDE) {
      const key = row * width + col;
      // Stagger the raster so the underlying brush lattice does not read as stripes.
      const seed = (Math.imul(key + 17, 1597334677) >>> 0) / 4294967296;
      const jitter = (Math.imul(key + 31, 3812015801) >>> 0) / 4294967296;
      const x = col + .5 + .68 * (seed - .5);
      const z = row + .5 + .68 * (jitter - .5);
      const elevation = sample(x, z);
      const left = Math.max(0, x - 2), right = Math.min(width - 1, x + 2);
      const top = Math.max(0, z - 2), bottom = Math.min(height - 1, z + 2);
      const dx = (sample(right, z) - sample(left, z)) / ((right - left) * sampleMeters);
      const dz = (sample(x, bottom) - sample(x, top)) / ((bottom - top) * sampleMeters);
      normal.set(-dx, 1, -dz).normalize();
      tangent.set(1, dx, 0).normalize();
      across.crossVectors(tangent, normal).normalize();

      const slope = Math.hypot(dx, dz);
      const noise = Math.sin(x * .087 + z * .093) * Math.sin(z * .055 - x * .04);
      const rock = smoothstep(slope + noise * .12, .28, 1.28);
      const high = smoothstep(elevation, ...altitudeBand);
      const diffuse = clamp(normal.dot(LIGHT), 0, 1);
      const hollow = clamp((sample(x - 7, z) + sample(x + 7, z)
        + sample(x, z - 7) + sample(x, z + 7) - 4 * elevation) / 22, 0, .20);
      const shade = .57 + .48 * diffuse - hollow + .045 * noise + .023 * (seed - .5);
      const snow = smoothstep(snowAt(x, z), .025, .32);
      const color = grass.map((channel, i) => {
        const base = lerp(channel, scree[i], Math.max(rock * .83, high * .5));
        const stone = lerp(base, slate[i], rock * high * .68);
        return lerp(stone, [.86, .91, .96][i], snow) * shade + (1 - diffuse) * [.012, .026, .059][i];
      });
      const reach = spacing * .69;
      const stretch = Math.hypot(1, dx);
      splats.push({
        center: [(x + .5 - width / 2) * sampleMeters / metresPerUnit,
          (elevation - datum) / metresPerUnit,
          (z + .5 - height / 2) * sampleMeters / metresPerUnit],
        axes: [tangent.setLength(reach * stretch).toArray(), across.setLength(reach * .91 * Math.hypot(1, dz / stretch)).toArray(),
          normal.setLength(spacing * .075).toArray()],
        color,
        opacity: .96,
        seed,
        material: 'stone',
      });
    }
  }
  return {
    splats,
    background,
    orbitLimit,
    lighting: {
      irradiance: new Float32Array(splats.length * 3),
      shadow: new Float32Array(splats.length),
      stats: {},
    },
  };
}

export function createHeightfieldScene({heightfield, mask = false, terrainSource, textures, ...scene}) {
  const root = `${ASSETS}${terrainSource ?? scene.id}/`;
  let terrain, terrainTexture;
  return {
    ...scene,
    async prepare(fetcher = globalThis.fetch) {
      if (terrain) return;
      const requests = ['terrain.json', 'terrain.u16'];
      if (mask) requests.push('snow.u8');
      const [responses, maps] = await Promise.all([
        Promise.all(requests.map(file => fetcher(root + file))),
        // Image maps decode through the DOM. Headless callers (tests, tools)
        // still get the complete terrain geometry, without its texture maps.
        textures && typeof document !== 'undefined' && loadTextures(`${ASSETS}${scene.id}/`, textures),
      ]);
      const [info, grid, snow] = responses;
      if (!info.ok || !grid.ok || (snow && !snow.ok)) throw new Error(`Could not load ${scene.label} terrain data.`);
      const parsed = readGrid(await info.json(), await grid.arrayBuffer(), await snow?.arrayBuffer());
      if (maps) {
        const metresPerUnit = heightfield?.metresPerUnit ?? 10;
        if (textures.kind === 'material') {
          const maskTexture = new DataTexture(parsed.mask, parsed.width, parsed.height, RedFormat);
          maskTexture.minFilter = maskTexture.magFilter = LinearFilter;
          maskTexture.needsUpdate = true;
          maps.terrainSnowMask = maskTexture;
        }
        terrainTexture = {kind: textures.kind, maps, metresPerUnit, washMetres: textures.washMetres,
          width: parsed.width * parsed.sampleMeters / metresPerUnit,
          depth: parsed.height * parsed.sampleMeters / metresPerUnit};
      }
      terrain = parsed;
    },
    create() {
      if (!terrain) throw new Error(`Load ${scene.label} terrain data before building the scene.`);
      return {...buildTerrain(terrain, heightfield ?? {}), terrainTexture};
    },
  };
}

async function loadTextures(root, {kind, files}) {
  const loader = new TextureLoader();
  const maps = await Promise.all(Object.entries(files).map(async ([key, file]) => {
    const map = await loader.loadAsync(root + file);
    map.flipY = false;
    if (kind === 'material') map.wrapS = map.wrapT = RepeatWrapping;
    return [key, map];
  }));
  return Object.fromEntries(maps);
}
