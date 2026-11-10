import {
  Data3DTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGFormat,
  Vector3,
} from 'three';
import {reefGlowTexture, reefGlowMapTexture} from './ReefBioluminescence.js';

const CELLS = [6, 6, 4];
const SIZE = [96, 96, 32];
let volumeData;

function makeVolume() {
  const data = new Uint8Array(SIZE[0] * SIZE[1] * SIZE[2] * 2);
  const sites = new Float32Array(CELLS[0] * CELLS[1] * CELLS[2] * 3);
  let seed = 14327;
  for (let i = 0; i < sites.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    sites[i] = .12 + .76 * seed / 2 ** 32;
  }
  const [cx, cy, cz] = CELLS;
  const [width, height, frames] = SIZE;
  let offset = 0;
  for (let z = 0; z < frames; z++) {
    const pz = (z + .5) / frames * cz, iz = Math.floor(pz);
    for (let y = 0; y < height; y++) {
      const py = (y + .5) / height * cy, iy = Math.floor(py);
      for (let x = 0; x < width; x++) {
        const px = (x + .5) / width * cx, ix = Math.floor(px);
        let first = Infinity, second = Infinity;
        for (let k = iz - 1; k <= iz + 1; k++) {
          const layer = (k + cz) % cz;
          for (let j = iy - 1; j <= iy + 1; j++) {
            const row = (layer * cy + (j + cy) % cy) * cx;
            for (let i = ix - 1; i <= ix + 1; i++) {
              const site = (row + (i + cx) % cx) * 3;
              const dx = i + sites[site] - px;
              const dy = j + sites[site + 1] - py;
              const dz = k + sites[site + 2] - pz;
              const d = dx * dx + dy * dy + dz * dz;
              if (d < first) {
                second = first;
                first = d;
              } else if (d < second) {
                second = d;
              }
            }
          }
        }
        const nearest = Math.sqrt(first);
        data[offset++] = Math.round(255 * Math.min(1, nearest));
        data[offset++] = Math.round(255 * Math.min(1, Math.sqrt(second) - nearest));
      }
    }
  }
  return data;
}

// Sea Bench combines moving Worley fields before angle and depth attenuation.
// The periodic 3D lookup keeps that time dimension without a cell search on
// every overlapping splat fragment. The second channel helps pick out folds.
export const REEF_CAUSTIC_FRAGMENT = /* glsl */`
uniform highp sampler3D reefLightVolume;
uniform vec3 reefLightState;
flat in vec4 reefLightReceiver;
flat in float reefFlowCoordinate;
const vec3 REEF_LIGHT_DIRECTION = normalize(vec3(-.54, .79, .29));

float reefCausticEnergy(vec3 point, float facing) {
  float depth = reefLightState.z - point.y;
  float reach = 1. - smoothstep(4.25, 7.2, length(point.xz));
  if (facing <= .001 || depth <= 0. || reach <= .001 || reefLightState.y <= 0.) return 0.;

  float time = reefLightState.x;
  // Project the light along the refracted key, then drift and curl the two
  // scales at different speeds. The texture is periodic in space and time.
  vec2 p = (point.xz + REEF_LIGHT_DIRECTION.xz / REEF_LIGHT_DIRECTION.y * depth * .48) * .64;
  p += .095 * sin(p.yx * vec2(1.66, 1.91) + time * vec2(.43, -.36));
  vec2 a = texture(reefLightVolume, vec3(p * .139 + vec2(.028, -.015) * time, time * .054)).rg;
  vec2 rotated = mat2(.80, .60, -.60, .80) * p;
  vec2 b = texture(reefLightVolume, vec3(rotated * .223 + vec2(.31, .67) - vec2(.012, .020) * time,
    .39 + time * .037)).rg;
  float pockets = smoothstep(.18, .54, a.r * b.r);
  float bandA = 1. - smoothstep(.025, .142, a.g);
  float bandB = 1. - smoothstep(.018, .115, b.g);
  float filaments = max(bandA * smoothstep(.35, .82, a.r), bandB * smoothstep(.39, .86, b.r) * .57);
  float focus = pockets * .56 + filaments * (.38 + .46 * pockets);
  float energy = focus * reefLightState.y * reach * sqrt(facing);
  return energy * mix(1.18, .63, smoothstep(.70, 5.90, depth));
}

vec3 reefCausticLight(vec3 pigment, vec3 point, float energy) {
  float depth = max(0., reefLightState.z - point.y);
  vec3 transmission = exp(-vec3(.093, .040, .027) * depth);
  vec3 lift = energy * transmission * (vec3(.10, .15, .145) + .57 * pigment);
  return clamp(pigment + lift, 0., 1.);
}

vec3 reefFishScaleLight(vec3 pigment, vec3 normal, vec3 view, float energy, float seed, float r2) {
  vec3 up=abs(normal.y)>.94?vec3(1.,0.,0.):vec3(0.,1.,0.);
  vec3 tangent=normalize(cross(up,normal)), across=cross(normal,tangent);
  float angle=seed*157.08;
  vec3 facet=normalize(normal+.31*(cos(angle)*tangent+sin(angle)*across));
  vec3 halfLight=normalize(REEF_LIGHT_DIRECTION+view);
  float specular=pow(max(0.,dot(facet,halfLight)),16.);
  float focus=smoothstep(.045,.32,energy);
  float shimmer=(.085+.84*focus)*specular*exp(-1.2*r2);
  return mix(pigment,vec3(.92,.98,.99),shimmer);
}
`;

export function reefCausticVolumeTexture(){
  const texture=new Data3DTexture(volumeData ??= makeVolume(),...SIZE);
  texture.format=RGFormat;
  texture.wrapS=texture.wrapT=texture.wrapR=RepeatWrapping;
  texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

export class ReefCaustics {
  constructor({strength, surfaceY, glow, glowMap, dayBackground}, playing) {
    this.texture = reefCausticVolumeTexture();
    this.state = new Vector3(0, strength, surfaceY);
    this.glow = glow ? reefGlowTexture(glow) : null;
    this.glowMap = glowMap ? reefGlowMapTexture(glowMap) : null;
    this.night = {value: false};
    this.nightAmount = {value: 0};
    this.glowEpoch = {value: 0};
    this.rays = {value: true};
    this.diffraction = {value: true};
    this.dayBackground = dayBackground;
    this.strength = strength;
    this.enabled = true;
    this.playing = playing;
    this.lastTime = null;
  }

  get animating() {
    return this.playing;
  }

  get diffractionActive() {
    return this.diffraction.value && !this.night.value;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.updateStrength();
  }

  setNight(night) {
    this.setNightAmount(night ? 1 : 0);
  }

  setNightAmount(amount) {
    if(amount>0&&!this.night.value)this.glowEpoch.value=this.state.x;
    this.nightAmount.value = Math.max(0, Math.min(1, amount));
    this.night.value = this.nightAmount.value > 0;
    this.updateStrength();
  }

  updateStrength() {
    this.state.y = this.enabled ? this.strength * (1 - .86 * this.nightAmount.value) : 0;
  }

  setPlaying(playing) {
    this.playing = playing;
    this.lastTime = null;
  }

  advance(now) {
    const previous = this.lastTime;
    this.lastTime = now;
    if (previous === null) return false;
    this.state.x += Math.max(0, Math.min((now - previous) / 1000, .10));
    return true;
  }

  dispose() {
    this.texture.dispose();
    this.glow?.dispose();
    this.glowMap?.dispose();
  }
}
