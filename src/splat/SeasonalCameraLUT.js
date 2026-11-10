import {DataTexture, DataUtils, HalfFloatType, LinearFilter, MathUtils, Vector4} from 'three';

const SIZE = 32;
const PROFILES = [
  {name: 'Spring', balance: [1.005, 1.016, 1.006], exposure: .02, contrast: 1.045, saturation: .92,
    shadow: [.986, 1.002, 1.018], highlight: [1.014, 1.006, .985], shoulder: .035},
  {name: 'Summer', balance: [1.018, 1.004, .985], exposure: 0, contrast: 1.065, saturation: .90,
    shadow: [.978, 1.002, 1.025], highlight: [1.022, 1.008, .978], shoulder: .045},
  {name: 'Autumn', balance: [1.025, 1.002, .970], exposure: -.015, contrast: 1.055, saturation: .91,
    shadow: [.980, .995, 1.019], highlight: [1.032, 1.010, .976], shoulder: .045},
  {name: 'Winter', balance: [.995, 1.008, 1.016], exposure: 0, contrast: 1.035, saturation: .84,
    shadow: [.978, .995, 1.023], highlight: [1.014, 1.006, .990], shoulder: .055},
];
const STOPS = [[0, 1], [.10, 1], [.24, 2], [.46, 3], [.62, 3], [.81, 0], [1, 1]];
let atlas;

const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const display = value => value <= .0031308 ? value * 12.92 : 1.055 * Math.max(0, value) ** (1 / 2.4) - .055;
const luminance = color => color[0] * .2126 + color[1] * .7152 + color[2] * .0722;

function grade(input, profile) {
  const light = input.map(linear);
  const y = luminance(light);
  // Roll off the adaptation at white to retain neutral snow and cloud peaks.
  const adaptation = 1 - y * y;
  const balanced = light.map((channel, c) => channel
    * (1 + (profile.balance[c] - 1) * adaptation) * 2 ** (profile.exposure * adaptation));
  const value = luminance(balanced);
  const tone = MathUtils.clamp(display(value), 0, 1);
  const contrast = tone + (profile.contrast - 1) * (tone - .5) * 4 * tone * (1 - tone);
  const shoulder = profile.shoulder * MathUtils.smoothstep(tone, .65, 1) * (1 - tone);
  const mapped = linear(MathUtils.clamp(contrast - shoulder, 0, 1));
  return balanced.map((channel, c) => {
    const saturated = value + (channel - value) * profile.saturation;
    const split = 1 + (profile.shadow[c] - 1) * (1 - tone) ** 2
      + (profile.highlight[c] - 1) * tone ** 2 * (1 - tone);
    const output = saturated * mapped / Math.max(value, .000001) * split;
    return MathUtils.clamp(display(output), 0, 1);
  });
}

function makeAtlas() {
  const width = SIZE * SIZE, height = SIZE * PROFILES.length;
  const data = new Uint16Array(width * height * 4);
  for (const [season, profile] of PROFILES.entries()) {
    for (let b = 0; b < SIZE; b++) {
      for (let g = 0; g < SIZE; g++) {
        for (let r = 0; r < SIZE; r++) {
          const color = grade([r / (SIZE - 1), g / (SIZE - 1), b / (SIZE - 1)], profile);
          const offset = ((season * SIZE + g) * width + b * SIZE + r) * 4;
          for (let c = 0; c < 3; c++) data[offset + c] = DataUtils.toHalfFloat(color[c]);
          data[offset + 3] = DataUtils.toHalfFloat(1);
        }
      }
    }
  }
  return data;
}

export class SeasonalCameraLUT {
  constructor() {
    this.texture = new DataTexture(atlas ??= makeAtlas(), SIZE * SIZE, SIZE * PROFILES.length);
    this.texture.type = HalfFloatType;
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.needsUpdate = true;
    this.weights = new Vector4(0, 1, 0, 0);
  }

  setSeason(position) {
    const p = MathUtils.clamp(position, 0, 1);
    const end = STOPS.findIndex(([at], index) => index > 0 && p <= at);
    const [startAt, startGrade] = STOPS[end - 1];
    const [endAt, endGrade] = STOPS[end];
    const t = MathUtils.smoothstep(p, startAt, endAt);
    this.weights.set(0, 0, 0, 0);
    this.weights.setComponent(startGrade, 1 - t);
    this.weights.setComponent(endGrade, this.weights.getComponent(endGrade) + t);
  }

  dispose() {
    this.texture.dispose();
  }
}

export const SEASONAL_CAMERA_LUT_GLSL = /* glsl */`
uniform bool seasonalLUTEnabled;
uniform sampler2D seasonalLUT;
uniform vec4 seasonalLUTWeights;

vec3 seasonalLookup(vec3 color, float season) {
  vec3 p = clamp(color, 0., 1.) * 31.;
  float blue = floor(p.b);
  vec2 uv = vec2((blue * 32. + p.r + .5) / 1024., (season * 32. + p.g + .5) / 128.);
  vec3 low = texture2D(seasonalLUT, uv).rgb;
  uv.x += min(1., 31. - blue) * (32. / 1024.);
  return mix(low, texture2D(seasonalLUT, uv).rgb, fract(p.b));
}

vec3 seasonalCameraGrade(vec3 color) {
  if (!seasonalLUTEnabled) return color;
  vec3 graded = vec3(0.);
  if (seasonalLUTWeights.x > 0.) graded += seasonalLookup(color, 0.) * seasonalLUTWeights.x;
  if (seasonalLUTWeights.y > 0.) graded += seasonalLookup(color, 1.) * seasonalLUTWeights.y;
  if (seasonalLUTWeights.z > 0.) graded += seasonalLookup(color, 2.) * seasonalLUTWeights.z;
  if (seasonalLUTWeights.w > 0.) graded += seasonalLookup(color, 3.) * seasonalLUTWeights.w;
  return graded;
}
`;
