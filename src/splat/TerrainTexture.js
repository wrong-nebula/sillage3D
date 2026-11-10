import {Vector2} from 'three';

export const terrainVertexVarying = 'flat out vec3 terrainNormal;';
const washFragment = `
uniform float terrainMetresPerUnit;
uniform float terrainWashMetres;

vec3 terrainWash(vec3 pigment, vec3 point, vec3 n) {
  vec2 p = point.xz * terrainMetresPerUnit / terrainWashMetres;
  float brush = paintNoise(vec2(p.x * .24 + p.y * .28, p.y * 1.6 - p.x * .38));
  float wet = paintNoise(p * .19);
  float dry = paintNoise(vec2(p.x * .64 + p.y * .43, p.y * 3.6 - p.x * .56));
  float value = dot(pigment, vec3(.2126, .7152, .0722));
  float bands = .22 * smoothstep(.16, .30, value)
              + .28 * smoothstep(.29, .46, value)
              + .28 * smoothstep(.46, .66, value)
              + .22 * smoothstep(.64, .86, value);
  float light = clamp(mix(value, bands, .59) + .08 * dot(n, normalize(vec3(-.6, .75, .2))), 0., 1.);
  vec3 stone = mix(vec3(.14, .23, .36), vec3(.95, .86, .70), light);
  float green = smoothstep(.006, .095, pigment.g - pigment.r + .33 * (pigment.g - pigment.b));
  vec3 meadow = mix(vec3(.16, .32, .31), vec3(.77, .85, .48), light);
  vec3 color = mix(stone, meadow, green * .90);
  color = mix(color, pigment, .31);
  color += (brush - .5) * .083 + (wet - .5) * .062;
  color += smoothstep(.61, .88, dry) * vec3(.037, .031, .016);
  return clamp(color, 0., 1.);
}
`;

const aerialFragment = `
uniform sampler2D terrainPhoto;
vec3 terrainColor(vec3 point, vec3 n) {
  vec2 uv = point.xz * terrainMapScale + .5;
  vec3 photo = texture(terrainPhoto, uv).rgb;
  if (ghibli > .5) {
    vec2 size = terrainMapScale * terrainWashMetres / terrainMetresPerUnit;
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    if (length(dx) < size.x) dx = vec2(size.x, 0.);
    if (length(dy) < size.y) dy = vec2(0., size.y);
    vec2 stroke = vec2(.70, -.37) * size * (paintNoise(point.xz * 2.1) - .5);
    vec3 underpaint = textureGrad(terrainPhoto, uv + stroke, dx, dy).rgb;
    vec3 edge = textureGrad(terrainPhoto, uv, dx * .45, dy * .45).rgb;
    photo = mix(underpaint, edge, .28);
  }
  // The ortho already contains daylight. Add only a little local relief.
  return photo * (.89 + .17 * max(0., dot(n, normalize(vec3(-.65, .71, -.27)))));
}
`;

const materialFragment = `
uniform sampler2D terrainGrass;
uniform sampler2D terrainScree;
uniform sampler2D terrainRock;
uniform sampler2D terrainRockNormal;
uniform sampler2D terrainSnow;
uniform sampler2D terrainSnowMask;
vec3 triplanar(sampler2D map, vec3 p, vec3 weight) {
  float wash = ghibli * 2.2;
  return texture(map, p.zy, wash).rgb * weight.x
       + texture(map, p.xz, wash).rgb * weight.y
       + texture(map, p.xy, wash).rgb * weight.z;
}

vec3 terrainColor(vec3 point, vec3 n) {
  vec3 p = point * terrainMetresPerUnit;
  vec3 weight = pow(abs(n), vec3(5.));
  weight /= max(dot(weight, vec3(1.)), .0001);
  float macro = .5 + .5 * sin(p.x * .022 + sin(p.z * .046)) * sin(p.z * .035 - p.x * .039);
  vec3 grass = triplanar(terrainGrass, p / 18., weight);
  vec3 scree = triplanar(terrainScree, p / 58., weight);
  vec3 cracked = p + 2.7 * sin(p.zxy * .076 + p.yzx * .043);
  vec3 rock = triplanar(terrainRock, cracked / 10.5, weight);
  vec3 second = triplanar(terrainRock, cracked.zxy / 19. + .37, weight.zxy);
  rock = mix(rock, second, .26 + .30 * macro);
  float neutral = dot(rock, vec3(.2126, .7152, .0722));
  rock = mix(vec3(neutral) * vec3(.99, 1.03, 1.10), rock, .42);
  float steep = 1. - n.y;
  float stone = smoothstep(.10, .42, steep + .15 * macro);
  float cliff = smoothstep(.22, .58, steep);
  float altitude = smoothstep(62., 172., p.y);
  vec3 ground = mix(grass, scree, max(stone, altitude * .92));
  vec3 pigment = mix(ground, rock, cliff);

  vec3 uv = cracked / 10.5;
  vec2 bumpX = texture(terrainRockNormal, uv.zy).rg * 2. - 1.;
  vec2 bumpY = texture(terrainRockNormal, uv.xz).rg * 2. - 1.;
  vec2 bumpZ = texture(terrainRockNormal, uv.xy).rg * 2. - 1.;
  vec3 bump = vec3(0., bumpX.y, bumpX.x) * weight.x
            + vec3(bumpY.x, 0., bumpY.y) * weight.y
            + vec3(bumpZ.x, bumpZ.y, 0.) * weight.z;
  vec3 litNormal = normalize(n + (bump - n * dot(n, bump)) * cliff * mix(.46, .08, ghibli));
  float snowWeight = smoothstep(.025, .32, texture(terrainSnowMask, point.xz * terrainMapScale + .5).r);
  vec3 snow = triplanar(terrainSnow, p / 8.5, weight);
  pigment = mix(pigment, snow, snowWeight);
  float sun = max(0., dot(litNormal, normalize(vec3(-.58, .65, .49))));
  return pigment * (.59 + .58 * sun) * (.90 + .18 * macro) + (1. - sun) * vec3(.015, .022, .034);
}
`;

export function terrainFragmentGLSL(kind) {
  if (!kind) return '';
  return `flat in vec3 terrainNormal;
uniform vec2 terrainMapScale;
${washFragment}
${kind === 'aerial' ? aerialFragment : materialFragment}`;
}

export function terrainTextureUniforms(definition, renderer) {
  if (!definition) return {};
  const {width, depth, maps, metresPerUnit, washMetres} = definition;
  const uniforms = {
    terrainMapScale: {value: new Vector2(1 / width, 1 / depth)},
    terrainMetresPerUnit: {value: metresPerUnit},
    terrainWashMetres: {value: washMetres},
  };
  for (const [key, value] of Object.entries(maps)) {
    if (value.generateMipmaps) value.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    uniforms[key] = {value};
  }
  return uniforms;
}
