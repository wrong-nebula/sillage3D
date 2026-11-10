import {MathUtils} from 'three';

export function cliffPerimeterFade(x, z, y = 0) {
  const u = x / 82, v = (z - 17) / 75;
  const radius = Math.hypot(u, v);
  const back = MathUtils.smoothstep(-z, 23, 53) * MathUtils.smoothstep(y, 25, 36);
  if (radius < .69) return back;
  const angle = Math.atan2(v, u);
  const edge = radius + .015 * Math.sin(angle * 4) + .010 * Math.cos(angle * 7 + .8);
  const perimeter = MathUtils.smoothstep(edge, .72, .99);
  return 1 - (1 - perimeter) * (1 - back);
}

export function fadeCliffPerimeter(splats, boulderEnd) {
  let count = 0, boulders = 0;
  for (let i = 0; i < splats.length; i++) {
    const splat = splats[i];
    const fade = splat.material === 'cloud' ? 0
      : cliffPerimeterFade(splat.center[0], splat.center[2], splat.center[1]);
    splat.opacity *= (1 - fade) ** 2.25;
    if (splat.opacity < .00001) continue;
    if (i < boulderEnd) boulders++;
    splats[count++] = splat;
  }
  splats.length = count;
  return boulders;
}

export const CLIFF_PERIMETER_GLSL = /* glsl */`
float cliffPerimeterFade(vec3 point) {
  vec2 p = (point.xz - vec2(0.,17.)) / vec2(82.,75.);
  float radius = length(p);
  float back = smoothstep(23.,53.,-point.z)*smoothstep(25.,36.,point.y);
  if (radius < .69) return back;
  float angle = atan(p.y,p.x);
  float edge = radius + .015*sin(angle*4.) + .010*cos(angle*7.+.8);
  float perimeter = smoothstep(.72,.99,edge);
  return 1.-(1.-perimeter)*(1.-back);
}
`;
