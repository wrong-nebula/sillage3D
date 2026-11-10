import {Data3DTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, RedFormat, RepeatWrapping, RGBAFormat} from 'three';

const SIZE = [48, 32, 48];
const MIN = [-6, -3.5, -6];
const SPAN = [12, 7.5, 12];

export function readReefGlow(buffer) {
  if (![257 ** 2, 1025 ** 2].includes(buffer.byteLength)) throw new Error('Invalid LibreTerrain coral glow map.');
  return new Uint8Array(buffer);
}

export function reefGlowMapTexture(map) {
  const side = Math.sqrt(map.length);
  const texture = new DataTexture(map, side, side, RedFormat);
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

export function sampleReefGlow(map, point, normal, group) {
  const side = Math.sqrt(map.length);
  const p = point.toArray().map((value, axis) => value * (axis === 1 ? .23 : .17) + group * .137);
  const weights = normal.toArray().map(value => value ** 4);
  const total = weights.reduce((sum, value) => sum + value, 0);
  function sample(u, v) {
    const x = (u - Math.floor(u)) * side - .5, y = (v - Math.floor(v)) * side - .5;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const at = (x, y) => map[((y + side) % side) * side + (x + side) % side] / 255;
    return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy)
      + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
  }
  return (sample(p[1], p[2]) * weights[0] + sample(p[0], p[2]) * weights[1]
    + sample(p[0], p[1]) * weights[2]) / Math.max(total, .0001);
}

export function bakeReefGlow(sources) {
  const field = new Float32Array(SIZE.reduce((count, size) => count * size, 4));
  const step = SPAN.map((span, axis) => span / SIZE[axis]);
  for (const {center, group, radius, strength} of sources) {
    const first = center.map((c, axis) => Math.max(0, Math.floor((c - radius - MIN[axis]) / step[axis])));
    const last = center.map((c, axis) => Math.min(SIZE[axis] - 1, Math.floor((c + radius - MIN[axis]) / step[axis])));
    for (let z = first[2]; z <= last[2]; z++) {
      const dz = MIN[2] + (z + .5) * step[2] - center[2];
      for (let y = first[1]; y <= last[1]; y++) {
        const dy = MIN[1] + (y + .5) * step[1] - center[1];
        for (let x = first[0]; x <= last[0]; x++) {
          const dx = MIN[0] + (x + .5) * step[0] - center[0];
          const falloff = Math.max(0, 1 - (dx * dx + dy * dy + dz * dz) / (radius * radius));
          const voxel = ((z * SIZE[1] + y) * SIZE[0] + x) * 4;
          field[voxel + group] += strength * falloff ** 3;
        }
      }
    }
  }
  return Uint8Array.from(field, energy => Math.round(255 * (1 - Math.exp(-energy))));
}

export function reefGlowTexture(data) {
  const texture = new Data3DTexture(data, ...SIZE);
  texture.format = RGBAFormat;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export const REEF_GLOW_FRAGMENT = /* glsl */`
uniform highp sampler3D reefGlowVolume;
uniform sampler2D reefGlowMap;
uniform bool reefNight;
uniform float reefNightAmount;
uniform float reefGlowEpoch;
const vec3 REEF_GLOW_MIN = vec3(${MIN.map(value => value.toFixed(1)).join(', ')});
const vec3 REEF_GLOW_SPAN = vec3(${SPAN.map(value => value.toFixed(1)).join(', ')});
const vec3 REEF_GLOW_COLORS[4] = vec3[4](
  vec3(.13, .89, .81), vec3(.29, .62, 1.), vec3(.70, .34, .94), vec3(.17, .82, .97)
);

vec4 reefFlowPulse(vec3 point, float travel) {
  // Fill the whole vascular tree, hold every tip lit, then fade together.
  float time = max(0., reefLightState.x - reefGlowEpoch);
  float cycle = mod(time, 20.);
  float heartbeat = .015*sin(cycle*2.7)+.007*sin(cycle*5.55);
  float meniscus = .012*(paintNoise(point.xz*7.1+point.y*.8)-.5);
  vec4 age = cycle/6.8-.10+heartbeat+meniscus
    -travel*vec4(1.,1.025,.975,1.015)-vec4(0.,.035,.065,.02);
  vec4 filled = smoothstep(vec4(-.035),vec4(.045),age);
  float fade = 1.-smoothstep(14.,17.,cycle);
  return filled*fade;
}

vec4 reefGlowPulse(vec3 point) {
  // The coarse surroundings volume follows the same fill/hold envelope.
  return reefFlowPulse(point,clamp((point.y+2.25)/5.4,0.,1.));
}

vec3 reefNightAmbient(vec3 pigment) {
  return pigment * vec3(.25, .37, .51) + vec3(.012, .021, .035);
}

float reefCoralMask(vec3 point, vec3 normal, float group) {
  vec3 p = point * vec3(.17, .23, .17) + group * .137;
  vec3 weights = pow(abs(normal), vec3(4.));
  vec3 mask = vec3(texture(reefGlowMap, p.yz).r, texture(reefGlowMap, p.xz).r, texture(reefGlowMap, p.xy).r);
  return dot(mask, weights) / max(dot(weights, vec3(1.)), .0001);
}

vec4 reefCoralEmission(vec3 point, vec3 normal, float kind, vec4 pulse) {
  if (!reefNight || kind < 5. || kind > 8.) return vec4(0.);
  int group = int(kind) - 5;
  vec2 tissue = point.xy + point.z * vec2(.731, .417);
  vec2 drift = vec2(.12, -.08) * reefLightState.x;
  float flare = paintNoise(tissue * 4.3 + drift + float(group) * 13.);
  float detail = paintNoise(tissue * 7.1 - drift * .61 + 19.);
  float variation = smoothstep(.24, .79, flare * .72 + detail * .28);
  float activity = pulse[group] * (.55 + .45 * variation * variation);
  vec3 luminous = mix(REEF_GLOW_COLORS[group], vec3(.88, .98, 1.), .30 * activity);
  float mask = reefCoralMask(point, normal, float(group));
  float core = smoothstep(.70, .97, mask) * smoothstep(.55, .82, flare * .72 + detail * .28);
  luminous = mix(luminous, vec3(1.3, 1.5, 1.6), core * .8);
  return vec4(luminous, mask * activity);
}

vec3 reefNightLight(vec3 pigment, vec3 point, vec3 normal, float kind, bool waterWash, float travel) {
  vec3 ambient = reefNightAmbient(pigment);
  if (waterWash) return mix(pigment, ambient, reefNightAmount);
  // During the dark rest all bounce, rims, fish light and emission are zero.
  // Avoid volume/map samples and organic noise for every overlapping stroke.
  if(mod(max(0.,reefLightState.x-reefGlowEpoch),20.)>=17.)
    return mix(pigment,clamp(ambient,0.,1.),reefNightAmount);

  vec4 pulse = reefGlowPulse(point);
  vec3 uvw = (point - REEF_GLOW_MIN) / REEF_GLOW_SPAN;
  vec4 localLight = texture(reefGlowVolume, uvw);
  vec4 energy = localLight * pulse;
  // A second sample biases the bounce toward faces aimed at the coral.
  vec4 towardLight = texture(reefGlowVolume, uvw + normal * .28 / REEF_GLOW_SPAN);
  energy = mix(energy, towardLight * pulse, .55);
  vec3 bounce = energy.x * REEF_GLOW_COLORS[0] + energy.y * REEF_GLOW_COLORS[1]
    + energy.z * REEF_GLOW_COLORS[2] + energy.w * REEF_GLOW_COLORS[3];
  vec3 color = ambient + bounce * (.065 + .12 * sqrt(clamp(pigment, 0., 1.)));
  if(kind==11.||kind==3.||kind==4.){
    // The directional derivative of the existing light volume identifies the
    // faces pointing toward emitting coral, without another volume lookup.
    vec4 incoming=max(vec4(0.),towardLight-localLight*.98)*pulse;
    vec3 faceLight=incoming.x*REEF_GLOW_COLORS[0]+incoming.y*REEF_GLOW_COLORS[1]
      +incoming.z*REEF_GLOW_COLORS[2]+incoming.w*REEF_GLOW_COLORS[3];
    color+=faceLight*(.7+.8*sqrt(clamp(pigment,0.,1.)))*3.;
  }
  if (kind == 10.) {
    vec3 view = normalize(cameraPosition - point);
    float edge = pow(1. - abs(dot(normal, view)), 2.6);
    vec4 incoming = max(vec4(0.), towardLight - localLight * .75) * pulse;
    vec3 rim = incoming.x * REEF_GLOW_COLORS[0] + incoming.y * REEF_GLOW_COLORS[1]
      + incoming.z * REEF_GLOW_COLORS[2] + incoming.w * REEF_GLOW_COLORS[3];
    color += rim * edge * 2.;
  }
  vec4 emission = vec4(0.);
  if(kind>=5.&&kind<=8.)emission=reefCoralEmission(point,normal,kind,reefFlowPulse(point,travel));
  color = mix(color, emission.rgb, emission.a);
  return mix(pigment, clamp(color, 0., 1.), reefNightAmount);
}
`;
