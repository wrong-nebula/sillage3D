import {DataTexture, LinearFilter, MathUtils, RedFormat, RGFormat, Vector3} from 'three';
import {CLIFF_PERIMETER_GLSL} from './cliffPerimeter.js';
import {SeasonalCameraLUT} from './SeasonalCameraLUT.js';
import {FOG_DYNAMICS_GLSL,fogDynamicsUniforms} from './FogDynamics.js';

const {clamp, smoothstep} = MathUtils;
const DURATION = 58;
// Ease the season clock through a slightly longer midwinter hold.
export function advanceCliffSeason(position, dt) {
  const winter = smoothstep(position, .40, .44) * (1 - smoothstep(position, .56, .60));
  return (position + Math.max(0, dt) / (DURATION + 28 * winter)) % 1;
}
const SUMMER_BLOOM = .29;
const PHASES = [
  ['Summer', .13], ['Autumn', .31], ['Snowfall', .43],
  ['Winter', .57], ['Thaw', .71], ['Spring', .94], ['Summer', 1],
];

export class CliffSeasons {
  constructor(data, playing, fogMap, windMap, wetMap, terrainSnow) {
    const width = 1024;
    const height = Math.ceil(data.length / (width * 4));
    const padded = new Uint8Array(width * height * 4);
    padded.set(data);
    this.texture = new DataTexture(padded, width, height);
    this.texture.needsUpdate = true;
    const fogSide = fogMap ? 513 : 1;
    this.fogTexture = new DataTexture(fogMap ?? new Uint8Array(4), fogSide, fogSide);
    this.fogTexture.minFilter = LinearFilter;
    this.fogTexture.magFilter = LinearFilter;
    this.fogTexture.needsUpdate = true;
    const windSide = windMap ? 513 : 1;
    this.windTexture = new DataTexture(windMap ?? new Uint8Array([0]), windSide, windSide, RedFormat);
    this.windTexture.minFilter = LinearFilter;
    this.windTexture.magFilter = LinearFilter;
    this.windTexture.needsUpdate = true;
    const wetSide = wetMap ? 513 : 1;
    this.wetTexture = new DataTexture(wetMap ?? new Uint8Array(4), wetSide, wetSide);
    this.wetTexture.minFilter = LinearFilter;
    this.wetTexture.magFilter = LinearFilter;
    this.wetTexture.needsUpdate = true;
    const snowSide = terrainSnow ? 513 : 1;
    this.terrainSnowTexture = new DataTexture(terrainSnow ?? new Uint8Array(2), snowSide, snowSide, RGFormat);
    this.terrainSnowTexture.minFilter = LinearFilter;
    this.terrainSnowTexture.magFilter = LinearFilter;
    this.terrainSnowTexture.needsUpdate = true;
    this.state = new Vector3();
    this.meadow = new Vector3();
    this.melt = new Vector3();
    this.uniforms = {
      snowSeasonState: {value: this.state},
      meadowSeasonState: {value: this.meadow},
      snowData: {value: this.texture},
      snowDataWidth: {value: width},
      winterFogMap: {value: this.fogTexture},
      vegetationWindMap: {value: this.windTexture},
      meltWetMap: {value: this.wetTexture},
      snowmeltState: {value: this.melt},
      snowTerrainMap: {value: this.terrainSnowTexture},
      vegetationGustSeason: {value: 1},
      cliffPhysicsGust: {value: 0},
      winterFogStrength: {value: 1},
      winterFogSpeed: {value: 1},
      ...fogDynamicsUniforms(),
    };
    this.position = 0;
    this.cameraLUT = new SeasonalCameraLUT();
    this.setPlaying(playing);
    this.seek(0);
  }

  setPlaying(playing) {
    this.playing = playing;
    this.lastTime = null;
  }

  seek(position) {
    this.position = clamp(position, 0, 1);
    const p = this.position;
    this.cameraLUT.setSeason(p);
    this.phase = PHASES.find(([, end]) => p < end)?.[0] ?? 'Summer';
    const cold = smoothstep(p, .29, .42) * (1 - smoothstep(p, .61, .75));
    const snowfall = smoothstep(p, .32, .43);
    const thaw = smoothstep(p, .57, .72);
    this.state.set(cold, snowfall, thaw);
    const autumn = smoothstep(p, .11, .22) * (1 - smoothstep(p, .31, .43));
    const spring = smoothstep(p, .69, .77) * (1 - smoothstep(p, .88, .99));
    const bloom = p < .4
      ? SUMMER_BLOOM * (1 - smoothstep(p, .12, .28))
      : smoothstep(p, .70, .82) * (1 - (1 - SUMMER_BLOOM) * smoothstep(p, .87, .99));
    this.meadow.set(autumn, spring, bloom);
    const flow = smoothstep(p, .575, .625) * (1 - smoothstep(p, .68, .745));
    const wet = smoothstep(p, .58, .65) * (1 - smoothstep(p, .75, .89));
    this.melt.set(flow, wet, smoothstep(p, .58, .72));
    this.uniforms.vegetationGustSeason.value = Math.max(
      1 - smoothstep(p, .10, .22), smoothstep(p, .69, .78));
  }

  advance(now) {
    const dt = this.lastTime === null ? 0 : clamp((now - this.lastTime) / 1000, 0, .1);
    this.lastTime = now;
    if (dt > 0) this.seek(advanceCliffSeason(this.position, dt));
    return dt > 0;
  }

  dispose() {
    this.cameraLUT.dispose();
    this.texture.dispose();
    this.fogTexture.dispose();
    this.windTexture.dispose();
    this.wetTexture.dispose();
    this.terrainSnowTexture.dispose();
  }
}

export const SEASONAL_SNOW_GLSL = /* glsl */`
uniform vec3 snowSeasonState;
uniform vec3 meadowSeasonState;
uniform sampler2D snowData;
uniform int snowDataWidth;
uniform sampler2D winterFogMap;
uniform sampler2D vegetationWindMap;
uniform sampler2D meltWetMap;
uniform vec3 snowmeltState;
uniform sampler2D snowTerrainMap;
uniform float vegetationGustSeason;
uniform float cliffPhysicsGust;
uniform float winterFogStrength;
uniform float winterFogSpeed;
${FOG_DYNAMICS_GLSL}
const vec3 WINTER_SUN = vec3(-.797, .343, .494);
${CLIFF_PERIMETER_GLSL}

float snowDriftPhase(float seed) {
  // Integrate a positive gust speed so the flakes surge without reversing.
  float clock = windTime - .52 * sin(windTime * 1.35);
  return fract(clock / (2.4 + 1.2 * seed) + seed);
}

vec3 snowDriftOffset(vec3 point, vec4 wind) {
  float t = snowDriftPhase(wind.z);
  vec2 uv = (point.xz / vec2(118., 108.) + .5) * (512. / 513.) + .5 / 513.;
  float exposure = textureLod(vegetationWindMap, uv, 0.).r;
  float travel = (10. + 10. * exposure) * t;
  float arc = sin(t * 3.14159265);
  float flutter = .5 * sin(t * 11. + wind.z * 6.28) * arc;
  vec2 drift = vec2(.6, .8) * travel + vec2(-.8, .6) * flutter;
  vec2 groundUV = ((point.xz + drift) / vec2(118., 108.) + .5) * (512. / 513.) + .5 / 513.;
  vec4 terrain = textureLod(winterFogMap, groundUV, 0.);
  float ground = (terrain.z + 256. * terrain.w) * (255. * 50. / 65535.);
  float lift = .08 + (.18 + .55 * wind.z) * arc * arc;
  return vec3(drift.x, ground + lift - point.y, drift.y);
}

float meltwaterPhase(vec4 flow) {
  return fract(windTime * .28 + flow.z);
}

vec3 meltwaterOffset(vec3 point, vec4 flow) {
  if (flow.w > 13.5) return vec3(0., .012 * sin(windTime * 1.3 + flow.z * 6.), 0.);
  float t = meltwaterPhase(flow);
  float y = mix(flow.x, flow.y, t * t);
  return vec3(.014 * sin(t * 5. + flow.z * 9.), y - point.y, .035 * t);
}

vec3 meltWetPigment(vec3 pigment, vec3 point, vec3 normal, float vegetation) {
  if (snowmeltState.y == 0.) return pigment;
  vec2 uv = (point.xz / vec2(118., 108.) + .5) * (512. / 513.) + .5 / 513.;
  vec4 field = textureLod(meltWetMap, uv, 0.);
  float front = smoothstep(field.y - .15, field.y + .13, snowmeltState.z);
  float retain = mix(snowmeltState.y * snowmeltState.y, snowmeltState.y, field.z);
  float flowing = field.w * snowmeltState.x;
  float pulse = 1. + flowing * .08 * sin(windTime * .52 - point.y * 2.3 + point.x * .6);
  float stain = .76 + .24 * atmosphereNoise(point.xz * .24 + point.y * .07);
  float wet = 1.65 * field.x * front * retain * stain * pulse * mix(1., .23, vegetation);
  vec3 dark = pigment * vec3(.46, .54, .61);
  vec3 sun = normalize(mix(vec3(-.57, .74, .44), WINTER_SUN, snowSeasonState.x));
  vec3 view = normalize(cameraPosition - point);
  float sheen = pow(max(0., dot(normal, normalize(sun + view))), 22.);
  dark += vec3(.22, .27, .30) * sheen * (.18 + flowing);
  return mix(pigment, dark, clamp(wet, 0., .88));
}

vec3 meadowWindForce(vec4 root) {
  vec2 anchor = root.xz;
  vec2 uv = (anchor / vec2(118., 108.) + .5) * (512. / 513.) + .5 / 513.;
  float exposure = textureLod(vegetationWindMap, uv, 0.).r;
  float along = dot(anchor, vec2(.6, .8));
  float across = dot(anchor, vec2(-.8, .6));
  float gust = .43 + .25 * sin(windTime * .72 - along * .22)
    + .12 * sin(windTime * 1.8 - along * .43 + across * .18);
  if (vegetationGustSeason > 0.) {
    float front = pow(max(0., sin((along - windTime * 3.6) * .11
      + .60 * sin(across * .045 + windTime * .12))), 5.);
    float surge = .38 + .62 * smoothstep(-.3, .8, sin(windTime * .20));
    gust += vegetationGustSeason * .58 * front * surge;
  }
  float flutter = .08 * sin(windTime * 3.3 + across * 1.1 + along * .7);
  gust += cliffPhysicsGust * .8;
  vec2 sway = vec2(.6, .8) * (gust + flutter)
    + vec2(-.8, .6) * .10 * sin(windTime * 1.15 - along * .18);
  return vec3(sway.x, -.10 * length(sway), sway.y) * exposure;
}

vec3 meadowWindOffset(vec3 point, vec4 root) {
  float above = max(0., point.y - root.y);
  return meadowWindForce(root) * (above * above);
}

vec3 meadowWindAxis(vec3 axis, float above, vec3 force) {
  float high = max(0., above + axis.y), low = max(0., above - axis.y);
  return axis + force * ((high * high - low * low) * .5);
}

vec4 winterFogField(vec2 point) {
  vec2 uv = (point / vec2(118., 108.) + .5) * (512. / 513.) + .5 / 513.;
  return textureLod(winterFogMap, uv, 0.);
}

vec3 winterFogOffset(vec3 point, vec4 wind) {
  float fogTime = windTime * winterFogSpeed;
  vec2 drift = .58 * vec2(sin(fogTime * .045 + wind.z), cos(fogTime * .033 + wind.z));
  vec4 field = winterFogField(point.xz + drift);
  float ground = (field.z + 256. * field.w) * (255. * 50. / 65535.);
  float shape = atmosphereNoise((point.xz - vec2(.18, .065) * fogTime) * .15);
  float top = field.y * 4. * (.72 + .48 * shape);
  vec3 vortex=fogVortexFlow(point.xz);
  return vec3(drift.x+vortex.x, ground + max(.08, wind.y * top) - point.y, drift.y+vortex.y);
}

float winterFogDensity(vec2 point) {
  float fogTime = windTime * winterFogSpeed;
  vec4 field = winterFogField(point);
  float winter = snowSeasonState.x * smoothstep(.06, .64, snowSeasonState.y)
    * (1. - smoothstep(.58, .97, snowSeasonState.z));
  // The map defines the reservoir. Advected broad noise and wisps shape it.
  float pocket = atmosphereNoise((point - vec2(.18, .065) * fogTime) * .13);
  return winter * field.x * field.y * 4. * (.38 + .92 * pocket) * winterFogStrength * fogVortexFlow(point).z;
}

vec4 snowSample(float index) {
  int address = int(index);
  return texelFetch(snowData, ivec2(address % snowDataWidth, address / snowDataWidth), 0);
}

float settledSnow(vec4 field, vec3 normal) {
  float exposure = field.y * (.55 + .45 * max(0., dot(normal, WINTER_SUN)));
  float thaw = snowSeasonState.z;
  // A growing ambient melt term eventually clears the deepest sheltered drift.
  float melt = thaw * (.26 + .56 * exposure) + .49 * thaw * thaw * thaw;
  return max(0., .7 * field.x * snowSeasonState.y - melt);
}

float localSnowDepth(vec2 point) {
  vec2 uv=(point/vec2(118.,108.)+.5)*(512./513.)+.5/513.;
  vec2 field=textureLod(snowTerrainMap,uv,0.).rg;
  return settledSnow(vec4(field.x*(.62/.7),field.y,0.,0.),vec3(0.,1.,0.));
}

vec3 rockGroundBounce(vec3 pigment, vec3 point, vec3 normal) {
  vec2 uv = (point.xz / vec2(118., 108.) + .5) * (512. / 513.) + .5 / 513.;
  float cover = 0.;
  if (snowSeasonState.y > snowSeasonState.z) {
    vec2 terrainSnow = textureLod(snowTerrainMap, uv, 0.).rg;
    vec4 surface = vec4(terrainSnow.x * (.62 / .7), terrainSnow.y, 0., 0.);
    cover = smoothstep(.015, .17, settledSnow(surface, vec3(0., 1., 0.)));
  }
  vec4 terrain = winterFogField(point.xz);
  float ground = (terrain.z + 256. * terrain.w) * (255. * 50. / 65535.);
  float above = max(0., point.y - ground);
  // A diffuse lower hemisphere receives reflected ground light. Preserve the
  // narrow contact shadow, and reduce the solid angle higher above the snow.
  float facing = clamp((1. - normal.y) * .5, 0., 1.);
  float contact = smoothstep(.025, .20, above);
  float reach = 1. / (1. + above * .38);
  float strength = (.075 + .39 * cover) * facing * contact * reach;
  vec3 groundLight = mix(vec3(.91, .94, .87), vec3(.94, .98, 1.035), cover);
  vec3 reflectance = clamp(pigment * 1.7 + .16, .30, .90);
  return pigment + reflectance * groundLight * strength;
}

vec3 winterPigment(vec3 pigment, vec3 normal, vec4 field, float depth, float seed, float dormancy, vec3 point) {
  float cold = snowSeasonState.x;
  float direct = max(0., dot(normal, WINTER_SUN));
  float summerDirect = max(0., dot(normal, vec3(-.553, .718, .427)));
  float sun = direct * smoothstep(.05, .53, field.y);
  float value = dot(pigment, vec3(.30, .49, .21));
  vec3 earth = mix(pigment, vec3(value), .35) * vec3(.82, .88, 1.04);
  earth *= .89 + .31 * sun - .19 * summerDirect;
  if (field.w > .8) {
    float straw = .19 + .64 * value + .06 * seed;
    earth = straw * mix(vec3(1.09, 1.025, .92), vec3(.97, .99, 1.04), cold * .54);
  }
  float damp = snowSeasonState.z * cold * smoothstep(.07, .48, field.x) * (1. - smoothstep(.015, .20, depth));
  earth *= 1. - .38 * damp;

  vec3 snow = mix(vec3(.64, .73, .85), vec3(.99, .965, .90), smoothstep(.02, .55, sun));
  snow += vec3(.11, .10, .08) * max(0., normal.y);
  snow += .069 * (seed - .5) + .13 * (value - .44);
  float thin = 1. - smoothstep(.04, .22, depth);
  snow *= 1. - thin * snowSeasonState.z * .12;
  float blanket = smoothstep(.017, .19 + .045 * (seed - .5), depth);
  if (field.w > .8) blanket = .38 * smoothstep(field.z * .7 * .45, .08 + field.z * .7, depth);
  float transition = field.w > .8 ? dormancy : cold;
  vec3 ground = mix(pigment, earth, transition);
  // The meadow wash beneath the blades dries as the grass dies back.
  if (field.w < .2) {
    vec3 litter = dot(ground, vec3(.30, .49, .21)) * vec3(1.12, 1.01, .90);
    ground = mix(ground, litter, .8 * dormancy * field.z);
  } else if (field.w < .8) {
    // Desaturate both the moss splats and the moss pigment on their host rocks.
    float moss = field.w > .3 ? 1. : field.z;
    vec3 mutedMoss = dot(ground, vec3(.30, .49, .21)) * vec3(1.055, 1.025, .93);
    ground = mix(ground, mutedMoss, .88 * dormancy * moss);
    vec3 autumnMoss = dot(ground, vec3(.30, .49, .21)) * vec3(1.16, 1.04, .83);
    ground = mix(ground, autumnMoss, .38 * meadowSeasonState.x * (1. - dormancy) * moss);
  }
  float autumn = meadowSeasonState.x * (1. - dormancy);
  float spring = meadowSeasonState.y * (1. - dormancy);
  float meadow = field.w > .8 ? 1. : field.w < .2 ? field.z : 0.;
  vec3 copper = (value * .85 + .19) * mix(vec3(1.23, .88, .54), vec3(1.14, 1.02, .65), seed);
  ground = mix(ground * mix(vec3(1.), vec3(1.075, 1.025, .92), autumn),
    copper, autumn * meadow * .85);
  ground = mix(ground, ground * vec3(1.02, 1.14, .94) + vec3(.014, .023, .009), spring * meadow);
  ground = meltWetPigment(ground, point, normal, field.w > .8 ? 1. : 0.);
  if (field.w > .2 && field.w < .58) ground = rockGroundBounce(ground, point, normal);
  return mix(ground, clamp(snow, 0., 1.), blanket);
}

vec3 seasonalActorPigment(vec3 pigment, vec3 normal, vec3 point) {
  float cold=snowSeasonState.x, autumn=meadowSeasonState.x, spring=meadowSeasonState.y;
  vec3 sun=normalize(mix(CLOUD_SUN,WINTER_SUN,cold));
  sun=normalize(mix(sun,vec3(-.72,.44,.53),autumn*.65));
  float direct=max(0.,dot(normal,sun));
  // Replace the courier's fixed mesh-sampling light with the seasonal key.
  float original=.72+.28*max(0.,dot(normal,normalize(vec3(-.8,1.1,.7))));
  vec3 sky=mix(vec3(.98,1.01,1.015),vec3(.81,.93,1.10),cold);
  sky=mix(sky,vec3(1.035,.99,.91),autumn*.5);
  vec3 key=mix(vec3(1.08,1.025,.91),vec3(1.04,1.025,.98),cold);
  key=mix(key,vec3(1.16,1.015,.82),autumn*.75);
  float down=max(0.,-normal.y), up=max(0.,normal.y);
  vec3 light=sky*(.67+.055*up)+key*direct*mix(.28,.24,cold);
  light+=vec3(.72,.90,.62)*down*(.055+.035*spring)*(1.-cold);
  vec3 lit=pigment/original*light;
  return rockGroundBounce(lit,point,normal);
}
`;
