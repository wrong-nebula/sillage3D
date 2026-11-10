export const CRYSTAL_STUDIO_FRAGMENT = /* glsl */`
uniform sampler2D fruit;
uniform mat4 rayFromClip;
uniform mat4 clipFromWorld;
uniform vec3 eye;
uniform vec3 peachCenter;
uniform vec3 peachRadius;
uniform vec2 resolution;
uniform vec2 paintSettings;
in vec2 imageUV;
out vec4 fragColor;

const float ICE_IOR = 1.31;
const float FAR = 100.;
const float EPS = .0025;
const vec3 ICE_CENTER = vec3(0., 1.44, -.10);
const vec3 CHIP_A = vec3(-.83, .18, 1.79);
const vec3 CHIP_B = vec3(-.46, .20, 2.00);
const vec3 CHIP_C = vec3(-.97, .075, 1.99);

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float pigmentNoise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(cell), hash(cell + vec2(1., 0.)), f.x),
             mix(hash(cell + vec2(0., 1.)), hash(cell + 1.), f.x), f.y);
}

// A loaded flat brush, with unequal ends, a skipped edge and visible bristles.
float dryBrush(vec2 uv) {
  vec2 cell = floor(uv);
  float id = hash(cell);
  vec2 p = fract(uv) - vec2(.40 + .20 * id, .36 + .28 * hash(cell + 19.));
  p.x += (.43 * id - .2) * p.y;
  vec2 shape = abs(p) / vec2(.47, .26 + .12 * id);
  float edge = max(shape.x, shape.y) + .31 * (pigmentNoise(uv * 9.) - .5);
  float belly = 1. - smoothstep(.70, 1.11, edge);
  float bristles = .52 + .48 * pigmentNoise(vec2(uv.x * 7. + id, uv.y * 42.));
  return belly * bristles * (2. * id - 1.);
}

mat2 rotate(float angle) {
  float c = cos(angle), s = sin(angle);
  return mat2(c, s, -s, c);
}

float roundedBox(vec3 p, vec3 extents, float radius) {
  vec3 q = abs(p) - extents + radius;
  return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - radius;
}

vec3 chipPosition(int piece) {
  return piece == 1 ? CHIP_A : piece == 2 ? CHIP_B : CHIP_C;
}

float chipShape(vec3 point, int piece) {
  vec3 p = point - chipPosition(piece);
  p.xz = rotate(piece == 1 ? -.46 : .47) * p.xz;
  p.xy = rotate(piece == 1 ? .12 : -.30) * p.xy;
  vec3 size = piece == 1 ? vec3(.235, .175, .180) :
              piece == 2 ? vec3(.221, .205, .190) : vec3(.10, .074, .085);
  float shape = roundedBox(p, size, .045);
  float breakFace = dot(p, normalize(vec3(.68, .84, .53))) - size.y * .34;
  float corner = dot(p, normalize(vec3(-.76, .72, -.34))) - size.y * .49;
  float cleave = dot(p, normalize(vec3(.14, .88, -.72))) - size.y * .55;
  return max(shape, max(breakFace, max(corner, cleave)));
}

float blockShape(vec3 point) {
  vec3 p = point - ICE_CENTER;
  float crown = smoothstep(-.96, 1.25, p.y);
  float left = 1. - smoothstep(-1.3, .24, p.x);
  p.y += .128 * p.x * crown;
  p.x -= .63 * crown * left;
  // The face toward the peach recedes as it rises. Preserve the vertical back
  // corner and allow the exposed skin to interrupt the long front plane.
  float bank = smoothstep(-.19, .58, p.x - .47 * p.y);
  float lip = .32 * bank * exp(-2.3 * pow(p.y + .32, 2.));
  float lean = .29 * (p.y + 1.40) + .32 * crown * left - lip;
  p.z += (lean - .53 * p.x * (.48 + .52 * crown)) * smoothstep(-.72, .95, p.z);
  float warp = sin(8. * p.x + 3. * p.y - 4. * p.z)
             * sin(9. * p.y + 4. * p.z + 3. * sin(p.x * 4.));
  float edge = smoothstep(1.02, 1.36, abs(p.x)) + smoothstep(1.09, 1.40, abs(p.y));
  return roundedBox(p, vec3(1.45, 1.44, 1.15), .073) + warp * (.005 + edge * .008);
}

float iceShape(vec3 p, int piece) {
  return piece == 0 ? blockShape(p) : chipShape(p, piece);
}

vec2 boxInterval(vec3 ro, vec3 rd, vec3 center, vec3 span) {
  vec3 inv = sign(rd + 1e-8) / max(abs(rd), vec3(1e-7));
  vec3 near = (center - span - ro) * inv;
  vec3 far = (center + span - ro) * inv;
  vec3 lo = min(near, far), hi = max(near, far);
  return vec2(max(lo.x, max(lo.y, lo.z)), min(hi.x, min(hi.y, hi.z)));
}

float enterIce(vec3 ro, vec3 rd, int piece, float limit) {
  vec3 span = piece == 0 ? vec3(1.54, 1.69, 1.71) : vec3(.34, .29, .33);
  vec3 center = piece == 0 ? ICE_CENTER : chipPosition(piece);
  vec2 bounds = boxInterval(ro, rd, center, span);
  float travel = max(0., bounds.x);
  float last = min(bounds.y, limit);
  for (int step = 0; step < 62; step++) {
    if (travel >= last) break;
    float distance = iceShape(ro + rd * travel, piece);
    if (distance < EPS) return travel;
    travel += max(.0035, distance * .71);
  }
  return FAR;
}

float exitIce(vec3 p, vec3 direction, int piece) {
  float travel = .010;
  for (int step = 0; step < 35; step++) {
    float distance = iceShape(p + direction * travel, piece);
    if (distance >= -EPS) return travel;
    travel += max(.006, -distance * .78);
  }
  return travel;
}

vec3 geometricNormal(vec3 p, int piece) {
  vec2 e = vec2(.003, 0.);
  return normalize(vec3(
    iceShape(p + e.xyy, piece) - iceShape(p - e.xyy, piece),
    iceShape(p + e.yxy, piece) - iceShape(p - e.yxy, piece),
    iceShape(p + e.yyx, piece) - iceShape(p - e.yyx, piece)
  ));
}

vec3 opticalNormal(vec3 p, vec3 normal, int piece) {
  // Frozen folds compress toward the edges and interrupt the reflected cards.
  vec3 edge = abs(p - ICE_CENTER) / vec3(1.45, 1.44, 1.15);
  float shoulder = edge.x + edge.y + edge.z - max(edge.x, max(edge.y, edge.z));
  float rim = smoothstep(.72, 1.40, shoulder);
  float a = sin(16. * p.x + 8. * p.z + 2.1 * sin(8. * p.y - 4. * p.z) + sin(23. * p.y));
  float b = sin(21. * p.y - 12. * p.z + 1.5 * sin(9. * p.x + 6. * p.z) + 2. * sin(10. * p.y + 16. * p.z));
  float c = sin(14. * p.z + 10. * p.x + 1.2 * sin(11. * p.y) + 1.2 * sin(29. * p.z));
  vec3 fold = vec3(.8 * a + .32 * b, .62 * b - .2 * a, .81 * c + .24 * b);
  float strength = piece == 0 ? .044 + rim * .23 : .16;
  return normalize(normal + strength * (fold - normal * dot(normal, fold)));
}

vec2 ellipsoidInterval(vec3 ro, vec3 rd, vec3 center, vec3 radius) {
  vec3 origin = (ro - center) / radius;
  vec3 ray = rd / radius;
  float aa = dot(ray, ray);
  float bb = dot(origin, ray);
  float disc = bb * bb - aa * (dot(origin, origin) - 1.);
  if (disc < 0.) return vec2(FAR);
  float root = sqrt(disc);
  return vec2(-bb - root, -bb + root) / aa;
}

vec2 peachInterval(vec3 ro, vec3 rd) {
  return ellipsoidInterval(ro, rd, peachCenter, peachRadius);
}

vec4 sampleFruit(vec3 p) {
  // Reproject the transmitted point into the live, sorted splat capture.
  vec4 clip = clipFromWorld * vec4(p, 1.);
  vec2 uv = .5 + .5 * clip.xy / clip.w;
  if (clip.w <= 0. || any(lessThan(uv, vec2(0.))) || any(greaterThan(uv, vec2(1.)))) return vec4(0.);
  return texture(fruit, uv);
}

float waterEdge(vec2 p) {
  vec2 q = p - vec2(.08, .52);
  float angle = atan(q.y, q.x);
  vec2 shape = abs(q / vec2(1.75, 1.52));
  float waviness = .027 * sin(12. * angle + .1) + .015 * sin(23. * angle + 1.5);
  return pow(dot(shape * shape, shape * shape), .25) - 1. + waviness;
}

vec3 stage(vec3 ro, vec3 rd) {
  vec3 porcelain = vec3(.993, .952, .924);
  vec3 blue = vec3(.37, .59, .78);
  float rise = smoothstep(-.40, -.19, rd.y);
  float halo = .57 * exp(-22. * pow(rd.x + .55, 2.) - 74. * pow(rd.y + .39, 2.));
  float blueWash = clamp(rise - halo, 0., 1.);
  vec3 color = mix(porcelain, blue, blueWash);
  if (paintSettings.x > 0.) {
    vec2 washUV = vec2(9. * rd.x + 2.1 * rd.y, 12. * rd.y - 1.2 * rd.x);
    float bloom = pigmentNoise(washUV) * .65 + .35 * pigmentNoise(washUV * 3.1);
    float granulation = pigmentNoise(washUV * vec2(9., 15.)) - .5;
    float stroke = dryBrush(washUV * vec2(1.75, 2.2));
    vec3 lavender = vec3(.69, .66, .78);
    color = mix(color, lavender, 1.55 * blueWash * (1. - blueWash) * paintSettings.x);
    color += paintSettings.x * (bloom - .52) * vec3(.087, .095, .102);
    color += paintSettings.y * (granulation * .026 + stroke * .041) * (.38 + .62 * blueWash);
  }
  if (rd.y >= -.012) return color;
  float t = -ro.y / rd.y;
  if (t <= 0.) return color;
  vec2 p = (ro + rd * t).xz;
  vec2 contact = abs((p - vec2(.12, .06)) / vec2(1.50, 1.13));
  float shadow = exp(-4. * pow(max(0., max(contact.x, contact.y) - .66), 1.32));
  color -= vec3(.078, .093, .106) * shadow;
  float puddle = waterEdge(p);
  float wet = 1. - smoothstep(-.025, .012, puddle);
  float lip = exp(-pow((puddle + .009) / .014, 2.));
  float reflected = exp(-3. * abs(p.x - .69)) * exp(-2.8 * abs(p.y - 1.32));
  color = mix(color, color * vec3(.97, .91, .92) + vec3(.084, .058, .044) * reflected, wet);
  float dryEdge = 1. - .48 * paintSettings.y * pigmentNoise(p * 42.);
  color += dryEdge * (vec3(.102, .083, .081) * lip - vec3(.060, .049, .056) * exp(-pow((puddle - .014) / .011, 2.)));

  const vec3 beads[4] = vec3[4](
    vec3(1.61, 1.30, .082), vec3(1.86, 1.73, .057),
    vec3(1.40, 1.76, .122), vec3(1.44, 2.00, .030)
  );
  for (int i = 0; i < 4; i++) {
    vec3 bead = beads[i];
    vec2 d = (p - bead.xy) / vec2(bead.z * 1.45, bead.z);
    float r = length(d);
    float dome = 1. - smoothstep(.86, 1.01, r);
    float glint = exp(-28. * dot(d + vec2(.31, .39), d + vec2(.31, .39)));
    color = mix(color, color * vec3(.93, .86, .86) + .17 * glint, dome);
  }
  float chipShadow = exp(-7. * length((p - CHIP_A.xz) * vec2(1.0, 1.75)));
  chipShadow += exp(-7. * length((p - CHIP_B.xz) * vec2(1.0, 1.75)));
  return color - vec3(.09, .11, .15) * chipShadow;
}

float card(vec3 ray, vec3 axis, vec3 right, vec2 size) {
  float facing = dot(ray, axis);
  vec3 up = cross(axis, right);
  vec2 q = abs(vec2(dot(ray, right), dot(ray, up))) / max(facing, .001);
  vec2 edge = 1. - smoothstep(size * .88, size, q);
  return edge.x * edge.y * smoothstep(.01, .12, facing);
}

vec3 studioReflection(vec3 ray) {
  float cool = smoothstep(-.65, .48, ray.y);
  vec3 light = mix(vec3(.78, .60, .51), vec3(.49, .67, .87), cool);
  float flag = card(ray, normalize(vec3(.69, .18, -.71)), normalize(vec3(.71, 0., .69)), vec2(.46, 1.04));
  float side = card(ray, normalize(vec3(-.88, .08, .46)), normalize(vec3(.46, 0., .88)), vec2(.34, 1.36));
  light = mix(light, vec3(.067, .135, .248), max(flag, .80 * side));
  float key = card(ray, normalize(vec3(-.53, .79, .29)), normalize(vec3(.48, 0., .88)), vec2(.76, .46));
  float strip = card(ray, normalize(vec3(.72, .61, .33)), normalize(vec3(.42, 0., -.91)), vec2(.09, 1.12));
  float rim = card(ray, normalize(vec3(-.34, .43, -.84)), normalize(vec3(.93, 0., -.38)), vec2(.45, .25));
  return mix(light, vec3(1.14, 1.08, 1.04), max(max(key, strip), rim * .95));
}

vec3 refractedSet(vec3 p, vec3 ray, float maxDistance, out float fruitCoverage) {
  fruitCoverage = 0.;
  vec2 hit = peachInterval(p, ray);
  if (hit.y <= 0. || hit.x >= maxDistance) return vec3(0.);
  vec3 q = p + ray * max(0., hit.x);
  vec4 sampled = sampleFruit(q);
  fruitCoverage = sampled.a;
  if (fruitCoverage < .04) return vec3(0.);
  vec3 skin = sampled.rgb / fruitCoverage;
  // Pale amber forward scatter through the wet skin and the illuminated ice.
  return min(vec3(1.08), skin * vec3(1.14, 1.15, .97) + vec3(.12, .22, .055));
}

vec4 amberImage(vec3 p, vec3 incident, vec3 boundary) {
  // The thick front lip acts as a lens. Use a world-space virtual image to
  // approximate its magnification with the same splat capture as the direct ray.
  vec3 center = peachCenter + vec3(.85, -.18, -.17);
  vec3 radius = peachRadius * vec3(.84, .98, .94);
  vec2 hit = ellipsoidInterval(eye, incident, center, radius);
  if (hit.x >= FAR || hit.y <= 0.) return vec4(0.);
  vec3 shape = (eye + incident * hit.x - center) / radius;
  vec3 q = peachCenter + .88 * shape * peachRadius;
  q.y += .022 * sin(17. * p.z + 14. * p.y);
  q.z += .036 * sin(13. * p.x + 17. * p.y);
  vec4 sampleColor = sampleFruit(q);
  if (sampleColor.a <= .02) return vec4(0.);
  float edge = smoothstep(.01, .24, hit.y - hit.x);
  float front = smoothstep(.06, .57, boundary.z) * smoothstep(-.54, .18, p.x);
  float amberAlpha = edge * front * sampleColor.a;
  vec3 skin = sampleColor.rgb / sampleColor.a;
  vec3 color = vec3(1.04, .17 + skin.g * .91, .046 + skin.b * .80);
  float glow = smoothstep(-.7, .84, shape.x + .61 * shape.y);
  color = mix(color, vec3(1.06, .79, .41), .42 * glow);
  return vec4(color, amberAlpha);
}

vec3 wetSkin(vec3 color, vec3 p, vec3 ray) {
  vec3 normal = normalize((p - peachCenter) / (peachRadius * peachRadius));
  vec2 pores = vec2(p.x + .39 * p.z, p.y - .31 * p.z) * vec2(5.6, 5.1);
  vec2 cell = floor(pores);
  float id = hash(cell);
  vec2 center = vec2(.24 + .49 * id, .25 + .49 * hash(cell + 21.));
  vec2 size = vec2(.069, .15) * (.57 + .57 * hash(cell + 37.));
  vec2 local = (fract(pores) - center) / size;
  local.x += .24 * local.y;
  float r = length(local);
  float wet = step(.70, id) * smoothstep(.34, .72, -dot(ray, normal)) * (.70 + .3 * id);
  float rim = smoothstep(.64, .89, r) * (1. - smoothstep(.94, 1.17, r));
  float glint = exp(-9. * dot(local - vec2(-.30, .43), local - vec2(-.30, .43)));
  color += wet * (glint * vec3(.45, .57, .62) - rim * vec3(.12, .20, .19));
  float shine = pow(max(0., dot(normal, normalize(vec3(-.17, .45, .88)))), 16.);
  vec2 brush = vec2(p.y + .49 * p.x + .25 * p.z, p.x - .49 * p.y + .38 * p.z);
  float loaded = dryBrush(brush * vec2(7., 13.));
  float scumble = dryBrush(brush * vec2(19., 40.) + vec2(6.1, 2.7));
  float pigment = (.12 * loaded + .055 * scumble) * paintSettings.y;
  return color + (shine * .066 + pigment) * vec3(.76, 1., .83);
}

vec3 paintIce(vec3 color, vec3 p, vec3 n, float amber, float sheen) {
  vec2 surface = vec2(p.x + .67 * p.z, p.y - .37 * p.z);
  vec2 brush = rotate(.51 + .42 * n.x - .41 * n.y) * surface;
  float body = dryBrush(brush * vec2(6.7, 13.7) + 4.2);
  float dry = dryBrush(brush * vec2(15., 31.) + vec2(14., 1.7));
  float wash = pigmentNoise(surface * vec2(11.8, 8.5)) - .5;
  float luminance = dot(color, vec3(.25, .60, .15));
  vec3 coolGlaze = mix(vec3(.24, .34, .51), vec3(.71, .77, .87), smoothstep(.05, .86, luminance));
  vec3 washPigment = mix(coolGlaze, vec3(1., .70, .34), amber);
  float dryLight = max(0., body) * .26 + max(0., dry) * .12;
  vec3 scumble = mix(vec3(.92, .91, 1.), vec3(1., .94, .77), amber);
  color = mix(color, washPigment, paintSettings.x * (.21 + wash * .16));
  color = mix(color, scumble, paintSettings.y * dryLight * (.44 + .56 * max(luminance, sheen)));
  return color + paintSettings.y * (.056 * body + .032 * dry + .032 * wash);
}

vec3 shadeIce(vec3 p, vec3 incident, int piece) {
  vec3 boundary = geometricNormal(p, piece);
  vec3 normal = opticalNormal(p, boundary, piece);
  vec3 transmitted = refract(incident, normal, 1. / ICE_IOR);
  if (dot(transmitted, boundary) >= -.045) transmitted = refract(incident, boundary, 1. / ICE_IOR);
  float facing = clamp(-dot(incident, normal), 0., 1.);
  float fresnel = .024 + .976 * pow(1. - facing, 5.);
  vec3 reflection = studioReflection(reflect(incident, normal));
  vec3 start = p + transmitted * .009;
  float distance = exitIce(start, transmitted, piece);
  vec3 exitPoint = start + transmitted * distance;

  float fruitAlpha;
  vec3 skin = refractedSet(start, transmitted, distance + .023, fruitAlpha);
  vec3 exitBoundary = geometricNormal(exitPoint, piece);
  vec3 exitNormal = opticalNormal(exitPoint, exitBoundary, piece);
  vec3 escaped = refract(transmitted, -exitNormal, ICE_IOR);
  float critical = 1. - smoothstep(.61, .73, dot(transmitted, exitNormal));
  vec3 insideReflection = reflect(transmitted, exitNormal);
  vec3 light = studioReflection(insideReflection);
  vec3 through;
  if (dot(escaped, escaped) > .001) {
    through = stage(exitPoint + exitBoundary * .012, escaped);
    through = mix(through, light, critical * .35);
  } else {
    if (dot(insideReflection, exitBoundary) > -.02) insideReflection = reflect(transmitted, exitBoundary);
    vec3 bounce = exitPoint + .013 * insideReflection;
    float secondDistance = exitIce(bounce, insideReflection, piece);
    vec3 secondPoint = bounce + secondDistance * insideReflection;
    vec3 secondNormal = opticalNormal(secondPoint, geometricNormal(secondPoint, piece), piece);
    vec3 secondEscape = refract(insideReflection, -secondNormal, ICE_IOR);
    through = dot(secondEscape, secondEscape) > .001 ?
      mix(stage(secondPoint + .012 * secondNormal, secondEscape), light, .58) : light;
    if (fruitAlpha < .97) {
      float bounceAlpha;
      vec3 bounceFruit = refractedSet(bounce, insideReflection, secondDistance, bounceAlpha);
      skin = mix(skin, bounceFruit, bounceAlpha * (1. - fruitAlpha));
      fruitAlpha = max(fruitAlpha, bounceAlpha * .66);
    }
  }
  through *= exp(-vec3(.036, .023, .009) * distance);
  through = mix(through, skin, fruitAlpha * .90);
  if (piece == 0) {
    vec4 amber = amberImage(p, incident, boundary);
    through = mix(through, amber.rgb, amber.a * .91);
    fruitAlpha = max(fruitAlpha, amber.a);
  }
  float veins = pow(1. - abs(sin(10. * p.y + 5. * p.z + 2.3 * sin(5. * p.x + 4. * p.z))), 19.);
  float sheen = max(0., max(reflection.r, reflection.g) - .79);
  vec3 color = mix(through, reflection, min(.98, fresnel + .07 + critical * .09));
  color += vec3(.17, .19, .23) * veins * sheen * (1. - fruitAlpha * .65);
  float nearFruit = abs(length((p - peachCenter) / peachRadius) - 1.);
  float melt = (1. - smoothstep(.015, .105, nearFruit)) * smoothstep(.12, .90, boundary.z);
  float sparkle = max(0., sin(21. * p.y + 13. * p.x + 1.7 * sin(21. * p.z)));
  color += vec3(.20, .24, .25) * melt * (.35 + .65 * sparkle) * (piece == 0 ? 1. : 0.);
  color += sheen * .11;
  if (paintSettings.x > 0.) color = paintIce(color, p, normal, fruitAlpha, sheen);
  return color;
}

void main() {
  vec4 farPoint = rayFromClip * vec4(imageUV * 2. - 1., .5, 1.);
  vec3 ray = normalize(farPoint.xyz / farPoint.w - eye);
  vec4 visibleFruit = texture(fruit, imageUV);
  vec2 fruitHit = peachInterval(eye, ray);
  float distance = enterIce(eye, ray, 0, FAR);
  int piece = 0;
  for (int i = 1; i <= 3; i++) {
    float chip = enterIce(eye, ray, i, distance);
    if (chip < distance) {
      distance = chip;
      piece = i;
    }
  }

  vec3 color = distance == FAR ? stage(eye, ray) : shadeIce(eye + ray * distance, ray, piece);
  if (distance == FAR || (piece == 0 && fruitHit.x + .007 < distance)) {
    vec3 direct = visibleFruit.rgb;
    if (visibleFruit.a > .01 && fruitHit.x < FAR) {
      direct = wetSkin(direct / visibleFruit.a, eye + ray * fruitHit.x, ray) * visibleFruit.a;
    }
    color = color * (1. - visibleFruit.a) + direct;
  }

  // Fine print grain is applied once after the optical resolve and scales
  // with the final render, including the exported PNG.
  vec2 paper = imageUV * 1200.;
  float grain = hash(floor(paper)) - .5;
  grain += .39 * (hash(floor(imageUV * resolution) + 17.) - .5);
  float fibres = pigmentNoise(paper * vec2(.72, .29)) - .5;
  float tooth = grain * (.032 + .046 * paintSettings.y) + fibres * .044 * paintSettings.y;
  fragColor = vec4(clamp(color + tooth, 0., 1.), 1.);
}
`;
