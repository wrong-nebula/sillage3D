import {BackSide, Color, GLSL3, Mesh, ShaderMaterial, SphereGeometry, Vector3} from 'three';
import {ReefCaustics} from './ReefCaustics.js';

export const CLOUD_VOLUME_GLSL = /* glsl */`
uniform highp sampler3D cloudLightVolume;
uniform vec3 cloudLightState;
const vec3 CLOUD_SUN = vec3(-.57, .74, .44);
const vec2 CLOUD_WIND = vec2(.6, .8) * .55;

vec3 causticCloudOffset(vec3 point, vec4 bank) {
  float time = cloudLightState.x;
  vec2 drift = time * CLOUD_WIND;
  vec2 anchor = bank.xy;
  // Wrap complete banks beyond the field, preserving every lobe's shape.
  vec2 next = mod(anchor + drift + vec2(192., 184.), vec2(384., 320.)) - vec2(192., 184.);
  vec3 local = vec3(point.x - anchor.x, point.y - 84., point.z - anchor.y);
  // Long spatial waves reshape connected lobes without separating the core.
  vec3 morph = vec3(
    .85 * sin(time * .085 + local.z * .12 + bank.z),
    .72 * sin(time * .11 + local.x * .09 + local.z * .07 + bank.z),
    .64 * sin(time * .073 + local.x * .11 - bank.z));
  return vec3(next.x - anchor.x, 0., next.y - anchor.y) + morph;
}

float cloudCover(vec2 point) {
  float time = cloudLightState.x;
  vec2 p = (point - time * CLOUD_WIND) * .0029;
  float evolution = time * .38;
  p += .023 * sin(p.yx * vec2(15.1, 16.6) + evolution * vec2(.071, -.059));
  // Reuse the two drifting caustic fields, sampling their broad pockets.
  float a = textureLod(cloudLightVolume, vec3(p + vec2(.21, .33), .22 + evolution * .009), 1.).r;
  vec2 q = mat2(.80, .60, -.60, .80) * p * 1.58;
  float b = textureLod(cloudLightVolume, vec3(q + vec2(.52, .16) + evolution * vec2(.0017, .0024),
    .63 + evolution * .006), 1.).r;
  return 1. - smoothstep(.31, .60, mix(a, b, .28));
}

vec3 cloudFilteredLight(vec3 pigment, vec3 point, float cold) {
  float height = max(0., cloudLightState.z - point.y);
  vec3 sun = mix(CLOUD_SUN, vec3(-.797, .343, .494), cold);
  vec2 overhead = point.xz + sun.xz / sun.y * height;
  float shade = cloudCover(overhead) * cloudLightState.y;
  vec3 shadeTint = mix(vec3(.59, .65, .72), vec3(.73, .80, .91), cold);
  return mix(pigment, pigment * shadeTint + vec3(.017, .023, .032), shade);
}
`;

const skyVertex = /* glsl */`
out vec3 worldPoint;
void main() {
  worldPoint = (modelMatrix * vec4(position, 1.)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
`;

const skyFragment = /* glsl */`
precision highp float;
in vec3 worldPoint;
out vec4 fragColor;
uniform vec3 horizonColor;
uniform vec3 zenithColor;
uniform vec3 cloudColor;
uniform vec3 snowSeasonState;
uniform vec3 meadowSeasonState;
uniform bool modeledClouds;
${CLOUD_VOLUME_GLSL}
void main() {
  vec3 ray = normalize(worldPoint - cameraPosition);
  float elevation = max(0., ray.y);
  float cold = snowSeasonState.x;
  vec3 winterHorizon = mix(vec3(.73, .80, .87), vec3(.94, .87, .77),
    pow(max(0., dot(ray, vec3(-.797, .343, .494))), 8.));
  vec3 sky = mix(mix(horizonColor, winterHorizon, cold), mix(zenithColor, vec3(.47, .61, .75), cold),
    smoothstep(.04, .57, elevation));
  float autumn = meadowSeasonState.x * (1. - cold);
  float spring = meadowSeasonState.y;
  sky = mix(sky, mix(vec3(.85, .77, .65), vec3(.49, .62, .72), smoothstep(.02, .55, elevation)), autumn * .64);
  sky = mix(sky, sky * vec3(1.01, 1.04, 1.09), spring * .7);
  // A deeper upper sky, broad sunward scattering and a pale horizon wash.
  vec3 upperBlue = mix(vec3(.35, .58, .75), vec3(.39, .55, .73), cold);
  sky = mix(sky, upperBlue, smoothstep(.28, .92, elevation) * .65);
  vec3 sun = normalize(mix(CLOUD_SUN, vec3(-.797, .343, .494), cold));
  sun = normalize(mix(sun, vec3(-.72, .44, .53), autumn * .55));
  float forward = max(0., dot(ray, sun));
  float sunHaze = pow(forward, 5.);
  float horizonHaze = exp(-max(0., ray.y) * 8.);
  vec3 haze = mix(vec3(.85, .89, .86), vec3(.82, .85, .89), cold);
  haze = mix(haze, vec3(.93, .84, .69), autumn * .55);
  sky = mix(sky, haze, horizonHaze * .34);
  sky += sunHaze * mix(vec3(.16, .125, .065), vec3(.15, .11, .06), cold);
  if (!modeledClouds && elevation > .12 && cameraPosition.y < cloudLightState.z) {
    vec2 projected = ray.xz / elevation;
    vec2 atCloud = cameraPosition.xz + projected * (cloudLightState.z - cameraPosition.y);
    float body = cloudCover(atCloud);
    float crown = cloudCover(atCloud + 12. * projected + CLOUD_SUN.xz * 5.);
    float cover = max(body, .69 * crown);
    vec3 cloud = mix(cloudColor, vec3(.57, .64, .69), body * .33);
    cloud += vec3(.14, .13, .10) * max(0., crown - body);
    cloud = mix(cloud, cloud * vec3(.94, .99, 1.07), cold);
    cloud = mix(cloud, cloud * vec3(1.05, 1.0, .89), autumn);
    sky = mix(sky, cloud, cover * smoothstep(.12, .36, elevation));
  }
  fragColor = vec4(sky, 1.);
}
`;

export class CausticClouds extends ReefCaustics {
  constructor({height, strength, horizon, modeled = false}, playing, seasons) {
    super({surfaceY: height, strength}, playing);
    this.uniforms = {
      cloudLightVolume: {value: this.texture},
      cloudLightState: {value: this.state},
    };
    const geometry = new SphereGeometry(405, 20, 12);
    const material = new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: skyVertex, fragmentShader: skyFragment,
      uniforms: {...this.uniforms, modeledClouds: {value: modeled},
        snowSeasonState: seasons?.snowSeasonState ?? {value: new Vector3()},
        meadowSeasonState: seasons?.meadowSeasonState ?? {value: new Vector3()},
        horizonColor: {value: new Color(horizon).convertLinearToSRGB()},
        zenithColor: {value: new Color('#87adbc').convertLinearToSRGB()},
        cloudColor: {value: new Color('#e9e9dc').convertLinearToSRGB()}},
      side: BackSide, depthTest: false, depthWrite: false,
    });
    this.sky = new Mesh(geometry, material);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
  }

  dispose() {
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    super.dispose();
  }
}
