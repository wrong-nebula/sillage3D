/** Moka pot still life after a small oil study: a blue wall, a table split
 * cream and pink, and an octagonal pot whose facets carry the two table colors.
 * Geometry, cast shadows and brush marks are authored 3D splats. The painting
 * is comparison-only, never sampled as a texture. */

const RAD = Math.PI / 180;
// The painting's viewpoint, solved from 14 edges measured on it.
const mokaCamera = {position: [0, 4.88, 8.897], target: [-.019, 1.393, 0], fov: 22.9};
const WALL_Z = -1.755;
// A broad lamp in front, right of the viewer. Its shadow runs back across the
// table and climbs the wall beside the pot. The painted shadows are not one
// light's: each surface bakes from its own lamp, fitted to the painting.
const WALL_LAMP = {position: [2.5, 6, 7], radius: 2};
const TABLE_LAMP = {position: [1.8, 3.5, 5], radius: 3};

const hex = s => s.replace('#', '').match(/../g).map(v => parseInt(v, 16) / 255);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => mul(a, 1 / (Math.hypot(...a) || 1));
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const around = a => [Math.sin(a * RAD), 0, Math.cos(a * RAD)];

const C = Object.fromEntries(Object.entries({
  wallTL: '#5f7fa8', wallTR: '#6281aa', wallML: '#5a7fac', wallMR: '#617ca4', wallBL: '#557590', wallBR: '#677a9e',
  wallShadow: '#334b61', wallShadowWarm: '#3a4f60',
  creamBack: '#9b9a8c', creamMid: '#bcb39e', creamFront: '#d0c7b1', creamShadow: '#3f4b51',
  pinkBack: '#c48397', pinkMid: '#cf879a', pinkFront: '#d892a4', pinkShadow: '#8f6f80',
  potCream: '#c0b8a4', potCreamLow: '#aaa490', potCreamEdge: '#a39b8d', potPink: '#bd8493', potPinkLight: '#c58b99',
  potPinkLow: '#b07f8d', potBlue: '#5a7698', potShade: '#3d5062', potShadeDeep: '#334353',
  baseCream: '#c6b9a4', baseCreamDark: '#ab9d89', basePink: '#bc8391', baseShade: '#43515a',
  gasket: '#303133', silver: '#c9cdd0', glint: '#eef2f3',
  lid: '#4e5e6e', lidDark: '#4d5b68', lidEdge: '#5a79a2', lidShade: '#46596a', lidRim: '#b4b0a0', lidRimPink: '#a99aa2',
  knob: '#232220', knobTop: '#3b3e43', knobGold: '#8a7647', neck: '#2f3a48',
  handle: '#2a2624', bracket: '#465460', bracketLight: '#6f808c', bracketDark: '#38434e', hingeLine: '#8c9aa4',
  spout: '#bdb7a4', spoutLip: '#2f3236', lipWarm: '#4a4440', lipCool: '#55606b',
  wallStreakCool: '#5577a6', wallStreakWarm: '#6a7fa0', fleck: '#d4dce6', rimCream: '#d5d0bf', rimPink: '#d6b3bc',
  edgeDark: '#5d5e59', knobSide: '#2f3237', knobRim: '#6a6e73', knobFlute: '#3d4045', neckDark: '#2b3139', shoulderCream: '#6f6b61', shoulderPink: '#8e6f78', shoulderGrey: '#676b6d', metalShade: '#6a7074', metalDark: '#4e5458', metalLit: '#8b9195', handleSheen: '#474d55',
}).map(([k, v]) => [k, hex(v)]));

function random(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}

// Coarse occluder for the baked lamp shadow: circular frusta stand in for the
// facets, capsules for the handle. Softness comes from the lamp's area.
const OCCLUDER = [
  {h0: 0, h1: .9, r0: .59, r1: .49},
  {h0: .9, h1: 1.1, r0: .47, r1: .45},
  {h0: 1.1, h1: 1.386, r0: .47, r1: .52},
  {h0: 1.386, h1: 2.093, r0: .49, r1: .57},
  {h0: 2.093, h1: 2.25, r0: .58, r1: .1},
  {h0: 2.25, h1: 2.661, r0: .1, r1: .12},
];
const HANDLE = [[-.5, 2.44], [-.6, 2.46], [-.71, 2.43], [-.77, 2.33], [-.779, 2.249], [-.763, 2.067], [-.723, 1.883], [-.66, 1.7], [-.62, 1.6], [-.6, 1.5]];
const HANDLE_WIDTH = [.05, .068, .08, .085, .088, .082, .07, .054, .03, .012];

function segmentDistance(p, a, b) {
  const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / dot(ab, ab));
  return Math.hypot(...sub(p, add(a, mul(ab, t))));
}
function inside(p) {
  const [x, y, z] = p, rho = Math.hypot(x, z);
  for (const s of OCCLUDER) {
    if (y < s.h0 || y > s.h1) continue;
    if (rho < s.r0 + (s.r1 - s.r0) * (y - s.h0) / (s.h1 - s.h0)) return true;
  }
  if (x < -.3 && y > 1.4 && y < 2.6 && Math.abs(z) < .1) {
    for (let i = 0; i < HANDLE.length - 1; i++) {
      const a = [HANDLE[i][0], HANDLE[i][1], 0], b = [HANDLE[i + 1][0], HANDLE[i + 1][1], 0];
      if (segmentDistance(p, a, b) < HANDLE_WIDTH[i]) return true;
    }
  }
  // Spout gusset.
  return x > .4 && x < .78 && y > 1.6 && y < 2.13 && Math.abs(z) < .45 && x - .4 < (y - 1.6) * 1.2;
}

const lampSamples = ({position, radius}) => Array.from({length: 40}, (_, i) => {
  const y = 1 - 2 * (i + .5) / 40, ring = Math.sqrt(1 - y * y), a = i * 2.3999632;
  return add(position, mul([Math.cos(a) * ring, y, Math.sin(a) * ring], radius));
});
/** Fraction of the lamp hidden by the pot, marched only inside its bounds. */
function lampShadow(p, samples) {
  let blocked = 0;
  for (const light of samples) {
    const d = sub(light, p), length = Math.hypot(...d), dir = mul(d, 1 / length);
    // Interval inside the vertical bounding cylinder rho < 1.
    const a = dir[0] ** 2 + dir[2] ** 2, b = 2 * (p[0] * dir[0] + p[2] * dir[2]), c = p[0] ** 2 + p[2] ** 2 - 1;
    const disc = b * b - 4 * a * c;
    if (a < 1e-9 || disc <= 0) continue;
    const root = Math.sqrt(disc);
    let t0 = Math.max(.02, (-b - root) / (2 * a)), t1 = Math.min(length, (-b + root) / (2 * a));
    if (dir[1] > 1e-6) t1 = Math.min(t1, (2.75 - p[1]) / dir[1]);
    for (let t = t0; t < t1; t += .018) {
      if (inside(add(p, mul(dir, t)))) { blocked++; break; }
    }
  }
  return blocked / samples.length;
}

/** The lamp shadow baked on a coarse grid over a plane, then blurred: paint
 * softens the penumbra beyond what the lamp's own size would give. */
function shadowGrid(lamp, point, [u0, u1], [v0, v1], cell, blur) {
  const samples = lampSamples(lamp);
  const nu = Math.ceil((u1 - u0) / cell) + 1, nv = Math.ceil((v1 - v0) / cell) + 1;
  let grid = new Float32Array(nu * nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) grid[j * nu + i] = lampShadow(point(u0 + i * cell, v0 + j * cell), samples);
  const radius = Math.ceil(blur * 2 / cell);
  const weights = Array.from({length: 2 * radius + 1}, (_, k) => Math.exp(-(((k - radius) * cell / blur) ** 2) / 2));
  // Separable passes: along u (stride 1), then along v (stride nu).
  for (const [stride, count, others, otherStride] of [[1, nu, nv, nu], [nu, nv, nu, 1]]) {
    const out = new Float32Array(grid.length);
    for (let o = 0; o < others; o++) for (let k = 0; k < count; k++) {
      let sum = 0, total = 0;
      for (let w = -radius; w <= radius; w++) {
        const m = k + w;
        if (m < 0 || m >= count) continue;
        sum += grid[o * otherStride + m * stride] * weights[w + radius];
        total += weights[w + radius];
      }
      out[o * otherStride + k * stride] = sum / total;
    }
    grid = out;
  }
  return (u, v) => {
    const fu = clamp((u - u0) / cell, 0, nu - 1.001), fv = clamp((v - v0) / cell, 0, nv - 1.001);
    const i = Math.floor(fu), j = Math.floor(fv), a = fu - i, b = fv - j, at = (x, y) => grid[y * nu + x];
    return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
  };
}

function createMokaStill() {
  const rnd = random(80417), splats = [];
  const jitter = (color, amount = .03) => color.map(v => clamp(v * (1 + (rnd() - .5) * amount) + (rnd() - .5) * amount * .25));

  function dab(center, normal, along, length, width, color, {depth = .008, opacity = .98} = {}) {
    normal = unit(normal);
    let tangent = sub(along, mul(normal, dot(along, normal)));
    if (Math.hypot(...tangent) < 1e-4) tangent = cross(normal, [1, 0, 0]);
    tangent = unit(tangent);
    const bitangent = unit(cross(normal, tangent));
    splats.push({center, axes: [mul(tangent, length), mul(bitangent, width), mul(normal, depth)],
      color: color.map(v => clamp(v)), opacity, seed: rnd(), material: 'stone'});
  }

  // A flat oil brush mark (see oilPaint.js): `along` is the drag direction,
  // with the squared heel where the brush lands. It paints about 2.8-3.2
  // deviations of `length` along the drag and 3 deviations of `width` across.
  const HEEL = 1.55;
  // Thin lines are no thicker than they are wide, or they read as bands
  // edge-on. The normal yields to the line, never the line to the normal.
  const line = (a, b, normal, width, color, opacity = .9) => {
    const along = sub(b, a), dir = unit(along);
    dab(mix(a, b, .5), sub(normal, mul(dir, dot(normal, dir))), along, Math.hypot(...along) / 3, width, color, {depth: Math.min(.006, width), opacity});
  };

  // ---- Wall: an opaque lay-in of short vertical strokes, then long thin
  // paint dragged down over it. The drags make the painting's vertical bands.
  function wallColor(x, y) {
    const u = smooth(x, -2.3, 2.3), v = smooth(y, 0, 2.8);
    const low = mix(C.wallBL, C.wallBR, u), mid = mix(C.wallML, C.wallMR, u), high = mix(C.wallTL, C.wallTR, u);
    return v < .45 ? mix(low, mid, v / .45) : mix(mid, high, (v - .45) / .55);
  }
  const wallShadow = shadowGrid(WALL_LAMP, (x, y) => [x, y, WALL_Z + .02], [-3, 3], [0, 4], .06, .1);
  const wallTone = (x, y) => mix(wallColor(x, y), mix(C.wallShadow, C.wallShadowWarm, smooth(y, 1.2, -.2)),
    smooth(wallShadow(x, y), .03, .62) * .96);
  const down = sway => [Math.sin(sway), -Math.cos(sway), 0];
  // Splats draw in depth order, and the wall leans away from the view, so a
  // higher stroke always lands on a lower one: what stays visible of a drag is
  // mostly its tail. Sampling the tone there keeps the painted shadow in place.
  const dragLength = (x, y, length) => Math.abs(wallShadow(x, y - 1.5 * length) - wallShadow(x, y + 1.5 * length)) > .3 ? length * .6 : length;
  const dragTone = (x, y, length) => {
    let sum = [0, 0, 0];
    for (const f of [.3, .7, 1.1]) sum = add(sum, wallTone(x, y - f * length));
    return mul(sum, 1 / 3);
  };
  // Opaque backing, laid only outside the framed wall: inside it the many
  // translucent drags cover fully. The wall leans away from the view, so a
  // backing stroke centred higher would sort in front and paint over them.
  const wallLayIn = (x0, x1, y0, y1, cw, ch, z) => {
    for (let x = x0; x < x1; x += cw) for (let y = y0; y < y1; y += ch) {
      const px = x + cw * (.5 + (rnd() - .5) * .5), py = y + ch * (.5 + (rnd() - .5) * .4);
      if (Math.abs(px) < 2.7 && py < 3.4) continue;
      dab([px, py, z], [0, 0, 1], down((rnd() - .5) * .1), ch / 3.15 * 1.35, cw / 3 * 1.35, jitter(dragTone(px, py, ch / 3.15 * 1.35), .05), {depth: .01});
    }
  };
  wallLayIn(-11, 11, 0, 12, .55, 1.2, WALL_Z - .03);
  // Thin paint blends wet into wet: many translucent drags average into soft
  // gradients, while their streaks keep the direction of the brush.
  for (let i = 0; i < 2000; i++) {
    let length = .16 + rnd() * .3;
    const width = .04 + rnd() * .07, x = -3 + rnd() * 6, y = HEEL * length + .02 + rnd() * (3.8 - HEEL * length);
    length = dragLength(x, y, length);
    const tone = mix(dragTone(x, y, length), rnd() > .5 ? C.wallStreakCool : C.wallStreakWarm, rnd() * .15);
    dab([x, y, WALL_Z + .01 + rnd() * .03], [0, 0, 1], down((rnd() - .5) * .12), length, width,
      jitter(tone, .04), {depth: .01, opacity: .1 + rnd() * .16});
  }
  // Dry-brush flecks where the brush skipped over the ground.
  for (let i = 0; i < 18; i++) {
    const x = -2.6 + rnd() * 5.2, y = .3 + rnd() * 3;
    dab([x, y, WALL_Z + .05], [0, 0, 1], down((rnd() - .5) * .3), .006 + rnd() * .018, .002 + rnd() * .002,
      jitter(C.fleck, .05), {depth: .004, opacity: .2 + rnd() * .2});
  }

  // ---- Table: cream left of the pot axis in diagonal strokes, pink right
  // in loose wet patches. Strokes stop at the split, keeping it a clean edge.
  function tableColor(x, z, shade) {
    const depth = smooth(z, WALL_Z, 1.6), pink = smooth(x, -.035, .035), near = smooth(z, WALL_Z, .3);
    const cream = near < .55 ? mix(C.creamBack, C.creamMid, near / .55) : mix(C.creamMid, C.creamFront, (near - .55) / .45);
    let rose = depth < .5 ? mix(C.pinkBack, C.pinkMid, depth / .5) : mix(C.pinkMid, C.pinkFront, (depth - .5) / .5);
    // The pot's dim reflection darkens the cloth just right of it.
    rose = mix(rose, C.pinkShadow, Math.exp(-(((x - .3) / .55) ** 2)) * smooth(z, WALL_Z, -.8) * (1 - smooth(z, .2, .9)) * .3);
    const creamLit = mix(cream, C.creamShadow, smooth(shade, .05, .9) * .95);
    const roseLit = mix(rose, C.pinkShadow, smooth(shade, .03, .75) * .6);
    return mix(creamLit, roseLit, pink);
  }
  const lampOnTable = shadowGrid(TABLE_LAMP, (x, z) => [x, .01, z], [-3, 3], [WALL_Z, 2.4], .06, .22);
  // The painted shade beside the base reaches further left than the lamp's,
  // then hands over to it.
  const tableShadow = (x, z) => {
    // Its soft side widens with depth: both edges measured from the painting.
    const d = clamp(z, -.72, .01), outer = -1.05 + .94 * d, inner = -.62 + .64 * d;
    const fan = smooth(x, outer, inner) * (1 - smooth(x, .05, .35)) * smooth(z, .32, .14) * (1 - smooth(-z, 1.3, 1.75));
    return 1 - (1 - lampOnTable(x, z)) * (1 - fan);
  };
  // Strokes recede into the table; seen in perspective they read as the
  // painting's broad diagonals rather than thin horizontal bars.
  const creamDrag = unit([1, 0, -3.5]);
  const tableStroke = (x, z, along, length, width, y, options) => {
    // Across a shadow edge the painter drags along the edge, not over it.
    const e = .05, gx = tableShadow(x + e, z) - tableShadow(x - e, z), gz = tableShadow(x, z + e) - tableShadow(x, z - e);
    const steep = smooth(Math.hypot(gx, gz) / (2 * e), .25, 1.1);
    if (steep > 0) {
      let edge = unit([-gz, 0, gx]);
      if (dot(edge, along) < 0) edge = mul(edge, -1);
      along = unit(mix(along, edge, steep));
    }
    // Push the stroke off the split by its half extent across X.
    const reach = HEEL * length * Math.abs(along[0]) + 1.5 * width * Math.abs(along[2]);
    const side = Math.sign(x) || 1;
    if (Math.abs(x) < reach) x = side * reach;
    // Nor may it run under the wall, where it would paint over the wall's foot.
    const back = 1.6 * length * Math.abs(along[2]) + 1.5 * width * Math.abs(along[0]);
    if (z - back < WALL_Z) z = WALL_Z + back;
    // A stroke that would cross a shadow edge is laid shorter, as a painter
    // would. Nearer strokes land on farther ones, so what shows of a stroke
    // is the part dragged back into the table: take its shade there.
    const reachShade = f => tableShadow(x + along[0] * f * length, z + along[2] * f * length);
    if (Math.abs(reachShade(1.5) - reachShade(-1.5)) > .25) length *= .5;
    let shade = 0;
    for (const f of [.3, .7, 1.1]) shade += tableShadow(x + along[0] * f * length, z + along[2] * f * length) / 3;
    dab([x, y, z], [0, 1, 0], along, length, width, jitter(tableColor(x, z, shade), options.jitter), {depth: .01, opacity: options.opacity});
  };
  const pinkDrag = () => { const a = (rnd() - .5) * 1.4; return [Math.sin(a), 0, -Math.cos(a)]; };
  for (let x = -11; x < 11; x += .6) for (let z = WALL_Z; z < 6; z += .6) {
    if (Math.abs(x + .3) < 2.7 && z + .3 < 2) continue;
    tableStroke(x + .3, z + .3, x < 0 ? creamDrag : [1, 0, 0], .3, .3, -.02, {jitter: .03, opacity: .98});
  }
  for (let x = -3; x < 3; x += .12) for (let z = WALL_Z; z < 2.4; z += .34) {
    const px = x + .06 + (rnd() - .5) * .05, pz = z + .17 + (rnd() - .5) * .14, cream = px < 0;
    tableStroke(px, pz, cream ? creamDrag : pinkDrag(), .2, cream ? .055 : .065, -.01, {jitter: .03, opacity: .98});
  }
  for (const side of [-1, 1]) for (let z = WALL_Z; z < 2.4; z += .2) {
    const along = [0, 0, -1], x = side * 1.5 * .022;
    dab([x, .004, z + .1], [0, 1, 0], along, .14, .022, jitter(tableColor(x, z + .1, tableShadow(x, z + .1)), .03), {depth: .01});
  }
  for (let i = 0; i < 2600; i++) {
    const x = -3 + rnd() * 2.95, z = WALL_Z + rnd() * (2.3 - WALL_Z);
    tableStroke(x, z, unit(add(creamDrag, [(rnd() - .5) * .5, 0, 0])), .14 + rnd() * .22, .03 + rnd() * .04, .006 + rnd() * .006,
      {jitter: .05, opacity: .1 + rnd() * .16});
  }
  for (let i = 0; i < 1400; i++) {
    const x = -2 + rnd() * 1.95, z = WALL_Z + rnd() * (1 - WALL_Z);
    tableStroke(x, z, unit(add(creamDrag, [(rnd() - .5) * .4, 0, 0])), .07 + rnd() * .1, .03 + rnd() * .03, .008 + rnd() * .006,
      {jitter: .04, opacity: .1 + rnd() * .14});
  }
  for (let i = 0; i < 1700; i++) {
    const x = .05 + rnd() * 2.95, z = WALL_Z + rnd() * (2.3 - WALL_Z);
    tableStroke(x, z, pinkDrag(), .18 + rnd() * .24, .06 + rnd() * .06, .006 + rnd() * .006, {jitter: .07, opacity: .1 + rnd() * .14});
  }
  // A few loaded strokes stand proud of the wet layer and catch the light.
  for (let i = 0; i < 160; i++) {
    const cream = i % 3 > 0, x = cream ? -2.8 + rnd() * 2.7 : .1 + rnd() * 2.7, z = -1.6 + rnd() * 3.8;
    tableStroke(x, z, cream ? creamDrag : pinkDrag(), .1 + rnd() * .1, .02 + rnd() * .02, .014, {jitter: .05, opacity: .5});
  }

  // ---- Pot. Angles are measured from the camera (+Z) toward +X; the spout
  // points to +X and the handle to -X. Facet color follows the painting:
  // left-facing planes hold the cream, right-facing planes the pink. Each
  // facet is painted in a few downward strokes whose heels land on its top
  // edge and whose sides meet its side edges, so facet edges stay crisp.
  function section({h0, h1, r0, r1, rot, cols = 3, color, accents = 4}) {
    const radius = h => r0 + (r1 - r0) * (h - h0) / (h1 - h0);
    const vertex = (a, h) => add(mul(around(a), radius(h)), [0, h, 0]);
    for (let k = 0; k < 8; k++) {
      const a0 = rot + 45 * k, a1 = a0 + 45;
      let c = (a0 + 22.5) % 360; if (c > 180) c -= 360;
      const facing = Math.abs(c) < 100;
      const n = Math.max(1, facing ? cols : 2);
      const paint = (u, widthScale, value, opacity) => {
        const top = mix(vertex(a0, h1), vertex(a1, h1), u), base = mix(vertex(a0, h0), vertex(a1, h0), u);
        const drag = sub(base, top), slant = Math.hypot(...drag), length = slant / 3.15;
        const mid = (h0 + h1) / 2, width = Math.hypot(...sub(vertex(a1, mid), vertex(a0, mid)));
        let normal = unit(cross(sub(vertex(a1, mid), vertex(a0, mid)), drag));
        if (dot(normal, around(c)) < 0) normal = mul(normal, -1);
        const p = add(top, mul(unit(drag), HEEL * length));
        const pigment = color({c, u, v: .5, h: mid, p});
        dab(p, normal, drag, length, width / n / 3 * widthScale, jitter(pigment.map(x => x * value), .02), {depth: .02, opacity});
      };
      for (let col = 0; col < n; col++) paint((col + .5) / n, 1.12, 1, .98);
      if (facing) for (let i = 0; i < accents; i++) paint(.15 + rnd() * .7, .6 + rnd() * .4, 1 + (rnd() - .4) * .09, .1 + rnd() * .12);
    }
    return vertex;
  }


  // Boiler: an octagonal frustum, turned a half facet from the collector as
  // the painter saw it screwed on. It narrows to a rounded shoulder at the
  // screw joint, under the collector's skirt.
  const base = section({h0: 0, h1: .9, r0: .627, r1: .52, rot: 22.5, cols: 4, color: ({c, p, u}) => {
    if (c < -100 || c > 150) return C.potShade;
    if (c < -60) return C.baseShade;
    const split = smooth(p[0], -.02, .02);
    const cream = c < -20 ? mix(C.baseCream, C.baseCreamDark, smooth(u, .8, 1) * .5) : mix(C.baseCream, C.baseCreamDark, .8);
    const pink = c > 60 ? mix(C.basePink, C.pinkMid, .45) : C.basePink;
    return mix(cream, pink, split);
  }});
  const ring = (h, r, count, width, color, opacity) => {
    for (let i = 0; i < count; i++) {
      const a = -180 + 360 * (i + .5) / count + h * 97, n = around(a);
      dab(add(mul(n, r), [0, h, 0]), n, [n[2], 0, -n[0]], r * 2 * Math.PI / count / 2.1, width, jitter(color(a), .03), {depth: .02, opacity});
    }
  };
  const behind = a => Math.abs(a) > 110;
  const metal = (from, to) => a => behind(a) ? C.potShadeDeep : mix(C.metalDark, C.metalShade, smooth(a, from, to));
  ring(.92, .505, 20, .016, metal(-30, 50), .9);
  ring(.965, .49, 20, .016, metal(-40, 40), .9);
  ring(1.005, .48, 18, .014, metal(-40, 40), .85);
  // The joint itself: a thin black seam in the skirt's shadow.
  ring(1.05, .475, 20, .014, a => behind(a) ? C.potShadeDeep : mix(C.gasket, C.metalDark, .35), .8);
  ring(1.08, .48, 20, .014, a => behind(a) ? C.potShadeDeep : C.gasket, .9);
  // Thick light paint where the shoulder catches the lamp.
  for (let i = 0; i < 60; i++) {
    const a = 6 + rnd() * 46, n = around(a), h = 1.02 - rnd() * .07 - .02 * smooth(a, 30, 52), r = .52 - (h - .9) * .3;
    dab(add(mul(n, r), [0, h, 0]), n, add([n[2], 0, -n[0]], [0, (rnd() - .4) * .4, 0]), .025 + rnd() * .05, .005 + rnd() * .009,
      rnd() > .4 ? C.glint : C.silver, {depth: .006, opacity: .85 + rnd() * .1});
  }
  // The boiler's top sits in the skirt's shadow.
  for (let k = -3; k <= 2; k++) {
    const a0 = -22.5 + 45 * k, a1 = a0 + 45, c = a0 + 22.5;
    for (const [h, opacity] of [[.87, .5], [.83, .25]]) {
      const r = .627 - (.627 - .52) * h / .9, a = add(mul(around(a0), r), [0, h, 0]), b = add(mul(around(a1), r), [0, h, 0]);
      const tone = c < 0 ? C.shoulderCream : c < 60 ? C.shoulderPink : C.potShade;
      dab(mix(a, b, .5), around(c), sub(b, a), Math.hypot(...sub(b, a)) / 2.7, .022, jitter(tone, .03), {depth: .015, opacity});
    }
  }
  // Safety valve: a hex nut on the boiler's facet toward the spout.
  {
    const center = add(mul(around(90), (.627 - .107 * .5 / .9) * Math.cos(22.5 * RAD) + .012), [0, .5, 0]);
    for (let k = 0; k < 6; k++) {
      const a0 = k * 60 * RAD, a1 = (k + 1) * 60 * RAD, rim = (a, r) => add(center, [0, Math.sin(a) * r, Math.cos(a) * r]);
      line(rim(a0, .045), rim(a1, .045), [1, 0, 0], .012, k < 3 ? C.silver : C.metalShade, .95);
    }
    dab(add(center, [.012, 0, 0]), [1, 0, 0], [0, 1, 0], .012, .012, C.metalShade, {depth: .01});
    dab(add(center, [.02, .005, .005]), [1, 0, 0], [0, 1, 0], .004, .004, C.glint, {depth: .004});
  }

  // Collector: a threaded skirt, then the faceted body.
  const collarColor = ({c, p}) => {
    if (c > 100 || c < -100) return C.potShadeDeep;
    if (c < -45) return C.potShade;
    if (c > 45) return mix(C.potPinkLow, C.potBlue, smooth(p[0], .3, .42));
    if (c < 0) return mix(C.potCreamLow, C.potCream, .55);
    return mix(C.potPinkLow, C.potPinkLight, .4);
  };
  // The skirt widens from the joint up to a crease, where the faceted body
  // steps in a little and flares to the rim.
  const collar = section({h0: 1.098, h1: 1.386, r0: .5, r1: .555, rot: 0, cols: 3, color: collarColor});
  const bodyColor = ({c, p}) => {
    if (c > 100 || c < -100) return C.potShadeDeep;
    if (c < -45) return mix(C.potShadeDeep, C.potShade, .5);
    if (c > 45) return mix(C.potPink, C.potBlue, smooth(p[0], .36, .46));
    if (c < 0) return C.potCream;
    return C.potPink;
  };
  const body = section({h0: 1.386, h1: 2.093, r0: .52, r1: .6, rot: 0, cols: 3, accents: 3, color: bodyColor});

  // Drawn edges: a lit rim, a dark line down the shaded side, the crease
  // where the skirt meets the body, the skirt's lip, and the boiler's corner.
  const lift = (p, a, d = .006) => add(p, mul(around(a), d));
  line(lift(body(-45, 2.093), -22.5), lift(body(0, 2.093), -22.5), [0, .3, 1], .005, C.rimCream, .8);
  line(lift(body(0, 2.093), 22.5), lift(mix(body(0, 2.093), body(45, 2.093), .62), 22.5), [0, .3, 1], .005, C.rimPink, .8);
  line(lift(body(-45, 2.08), -45), lift(body(-45, 1.4), -45), [-.7, 0, .7], .006, C.edgeDark, .8);
  line(lift(collar(-45, 1.381), -22.5), lift(collar(0, 1.381), -22.5), [0, .4, 1], .006, C.rimCream, .45);
  line(lift(collar(0, 1.381), 22.5), lift(collar(45, 1.381), 22.5), [0, .4, 1], .006, C.rimPink, .45);
  line(lift(collar(-45, 1.103), -22.5), lift(collar(45, 1.103), 22.5), [0, -.3, 1], .008, C.gasket, .85);
  line(lift(base(-67.5, .88), -67.5), lift(base(-67.5, .03), -67.5), [-.9, 0, .4], .007, C.edgeDark, .75);

  // Lid: a low straight-sided octagonal pyramid on a narrow lip, in the
  // wall's blue; only the knob's dark reflection runs down its front.
  const LID_LIP = .615, LID_BASE = 2.118, LID_TOP = 2.25, LID_FLAT = .1;
  const lidAt = (a0, u, s) => {
    s = clamp(s);
    const r = LID_LIP - (LID_LIP - LID_FLAT) * s;
    return add(mix(mul(around(a0), r), mul(around(a0 + 45), r), u), [0, LID_BASE + (LID_TOP - LID_BASE) * s, 0]);
  };
  for (let k = 0; k < 8; k++) {
    const a0 = 45 * k;
    let c = (a0 + 22.5) % 360; if (c > 180) c -= 360;
    const outward = around(c), n = unit(add(mul(outward, LID_TOP - LID_BASE), [0, LID_LIP - LID_FLAT, 0]));
    for (const u of [.12, .37, .63, .88]) for (const t of [.2, .5, .8]) {
      const p = lidAt(a0, u, t), drag = sub(lidAt(a0, u, t - .22), lidAt(a0, u, t + .22));
      const column = Math.exp(-((p[0] / .16) ** 2)) * smooth(p[2], 0, .25);
      const color = mix(mix(mix(C.lidEdge, c < 0 ? C.lidDark : C.lid, .12), C.lidShade, smooth(-p[0], .2, .45)), C.lidDark, column);
      dab(p, n, drag, Math.hypot(...drag) / 2, LID_LIP * .77 * (1 - t * .8) / 4 / 3 * 1.7, jitter(color, .03), {depth: .015, opacity: .6});
    }
    // The lip: a short vertical band standing just proud of the rim.
    const a = mul(around(a0), LID_LIP), b = mul(around(a0 + 45), LID_LIP), front = Math.abs(c) < 60;
    const lipTone = front ? mix(C.lidEdge, c < 0 ? C.lidRim : C.lidRimPink, .35) : mix(C.lidEdge, C.potShade, smooth(Math.abs(c), 60, 120) * .5);
    dab(add(mix(a, b, .5), [0, (2.096 + LID_BASE) / 2, 0]), outward, sub(b, a), Math.hypot(...sub(b, a)) / 2.9, .007, jitter(mix(lipTone, C.lidEdge, .65), .03), {depth: .006, opacity: .5});
    line(add(a, [0, LID_BASE, 0]), add(b, [0, LID_BASE, 0]), around(c), .005, mix(lipTone, C.lidEdge, .4), .35);
  }

  // Knob and its neck, with gold lines scratched through the dark paint.
  function cylinder(h0, h1, r0, r1, count, color, opacity = .75, spread = 1.3) {
    for (let i = 0; i < count; i++) {
      const a = 360 * (i + .5) / count, radial = around(a), top = add(mul(radial, r1), [0, h1, 0]), foot = add(mul(radial, r0), [0, h0, 0]);
      // The cone's own normal, so each stroke keeps the taper.
      const n = unit(add(mul(radial, h1 - h0), [0, r0 - r1, 0])), length = Math.hypot(...sub(foot, top)) / 2.75;
      dab(add(top, mul(unit(sub(foot, top)), HEEL * length)), n, sub(foot, top), length, (r0 + r1) * Math.PI / count / 3 * spread,
        jitter(color(a), .03), {depth: .015, opacity});
    }
  }
  // The knob tapers to its foot and dissolves into its dark reflection; its
  // top reads as a dark ellipse inside a thin grey lip. The gold is scratched
  // through the paint in fine, faint lines.
  cylinder(LID_TOP - .02, 2.36, .05, .058, 10, () => C.neckDark, .8);
  cylinder(2.32, 2.661, .074, .108, 20, a => mix(C.knob, C.knobSide, smooth(Math.abs(a), 60, 120)), .78, 1.05);
  // Shallow flutes run up the knob, as on a moulded Bialetti knob.
  for (let i = 0; i < 10; i++) {
    const a = -80 + i * 16;
    line(add(mul(around(a), .11), [0, 2.64, 0]), add(mul(around(a), .08), [0, 2.36, 0]), around(a), .003, C.knobFlute, .35);
  }
  for (const [r, count] of [[.028, 5], [.057, 9], [.086, 13]]) for (let i = 0; i < count; i++) {
    const a = 360 * (i + .5) / count + r * 900, n = around(a);
    dab(add(mul(n, r), [0, 2.662, 0]), [0, 1, 0], [n[2], 0, -n[0]], r * 2 * Math.PI / count / 2.4, .016, jitter(C.knobTop, .04), {depth: .01, opacity: .9});
  }
  for (let i = 0; i < 12; i++) {
    const a = i * 30;
    line(add(mul(around(a), .107), [0, 2.664, 0]), add(mul(around(a + 30), .107), [0, 2.664, 0]), [0, 1, 0], .002, C.knobRim, .45);
  }
  const scratch = (a0, a1, h0, h1) => line(add(mul(around(a0), .106), [0, h0, 0]), add(mul(around(a1), .106), [0, h1, 0]),
    around((a0 + a1) / 2), .0011, C.knobGold, .2);
  scratch(5, 3, 2.64, 2.44);
  scratch(10, 9, 2.6, 2.5);
  scratch(-4, 9, 2.585, 2.58);
  scratch(0, 11, 2.55, 2.548);
  scratch(14, 22, 2.6, 2.598);
  scratch(-14, 2, 2.66, 2.655);

  // A dark core fills the shell, so grazing views never see the wall through it.
  for (let i = 0; i < 700; i++) {
    const h = .08 + rnd() * 2.12, a = rnd() * 360, s = OCCLUDER.find(o => h >= o.h0 && h <= o.h1);
    const r = Math.sqrt(rnd()) * ((s.r0 + (s.r1 - s.r0) * (h - s.h0) / (s.h1 - s.h0)) * .82 - .06);
    dab(add(mul(around(a), r), [0, h, 0]), around(a), [0, 1, 0], .06, .05, jitter(C.potShadeDeep, .05), {depth: .05});
  }

  // Handle: a flattened black loop in the X/Y plane, painted in long strokes
  // that follow it down from the hinge.
  const handleAt = t => {
    const s = t * (HANDLE.length - 1), i = Math.min(HANDLE.length - 2, Math.floor(s)), f = s - i;
    const q = j => HANDLE[clamp(j, 0, HANDLE.length - 1)];
    const cr = (a, b, c, d) => .5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f ** 3);
    return {
      x: cr(q(i - 1)[0], q(i)[0], q(i + 1)[0], q(i + 2)[0]), y: cr(q(i - 1)[1], q(i)[1], q(i + 1)[1], q(i + 2)[1]),
      w: HANDLE_WIDTH[i] + (HANDLE_WIDTH[i + 1] - HANDLE_WIDTH[i]) * f,
    };
  };
  // A flat bar: three strokes across its front and back, edge strokes for
  // its thickness. The inner flank keeps a warm sheen near the top; the
  // outer flank is thin paint, so it softens into the wall's shadow.
  const SEGMENTS = 18;
  for (let i = 0; i < SEGMENTS * 2; i++) {
    const t = (i / 2 + .5) / SEGMENTS, a = handleAt(t), b = handleAt(Math.min(1, t + .5 / SEGMENTS)), prev = handleAt(Math.max(0, t - .5 / SEGMENTS));
    const tangent = unit([b.x - prev.x, b.y - prev.y, 0]), side = [-tangent[1], tangent[0], 0];
    const span = Math.hypot(b.x - prev.x, b.y - prev.y), inner = side[0] > 0 ? 1 : -1;
    for (const k of [-2 / 3, 0, 2 / 3]) for (const face of [1, -1]) {
      const p = [a.x + side[0] * k * a.w, a.y + side[1] * k * a.w, face * .035];
      const sheen = face > 0 ? smooth(k * inner, .3, .65) * smooth(t, .04, .14) * (1 - smooth(t, .22, .42)) * .8 : 0;
      dab(p, [side[0] * k * .4, side[1] * k * .4, face], tangent, span / 1.5, a.w / 3 * 1.18,
        jitter(mix(C.handle, C.handleSheen, sheen), .03), {depth: .015, opacity: k * inner < -.5 ? .5 : .85});
    }
    for (const e of [-1, 1]) {
      dab([a.x + side[0] * e * a.w, a.y + side[1] * e * a.w, 0], mul(side, e), tangent, span / 1.5, .035 / 3 * 1.2,
        jitter(C.handle, .03), {depth: .01, opacity: .6});
    }
  }
  // The bracket: a strap riveted to the body's corner below the rim, its arm
  // rising to the hinge that carries the handle and the lid.
  for (const face of [1, -1]) {
    dab([-.597, 2.0, face * .022], [-1, 0, face * .3], [0, 1, 0], .045, .012, jitter(C.bracketDark, .03), {depth: .008});
    dab([-.615, 2.2, face * .022], [-1, 0, face * .3], [.05, 1, 0], .045, .012, jitter(C.bracket, .03), {depth: .008});
  }
  dab([-.603, 1.975, 0], [-1, 0, 0], [0, 1, 0], .008, .008, C.metalShade, {depth: .006});
  // Hinge: a grey plate where the handle's head meets the lid, ringed by two
  // thin scratched arcs and one bright glint.
  for (const [h, tone, opacity] of [[2.445, C.bracketLight, .8], [2.405, C.bracket, .9], [2.36, C.bracket, .85], [2.315, C.bracketDark, .7]]) {
    dab([-.49, h, .03], unit([0, .4, 1]), [1, -.15, 0], .065, .016, jitter(tone, .03), {depth: .012, opacity: opacity * .85});
    dab([-.5, h, -.03], unit([0, .4, -1]), [1, -.15, 0], .08, .016, jitter(C.bracketDark, .03), {depth: .015, opacity});
  }
  for (const [r, t0, t1] of [[.045, 90, 250], [.03, 110, 230]]) {
    for (let k = 0; k < 4; k++) {
      const a0 = (t0 + (t1 - t0) * k / 4) * RAD, a1 = (t0 + (t1 - t0) * (k + 1) / 4) * RAD;
      line([-.61 + Math.cos(a0) * r, 2.31 + Math.sin(a0) * r, .05], [-.61 + Math.cos(a1) * r, 2.31 + Math.sin(a1) * r, .05], [0, 0, 1], .0025, C.hingeLine, .7);
    }
  }
  line([-.53, 2.43, .055], [-.43, 2.462, .055], [0, .3, 1], .0035, C.glint, .95);
  line([-.58, 2.37, .055], [-.5, 2.39, .055], [0, .3, 1], .0025, C.hingeLine, .6);

  // Spout: the rim pinched out at the corner opposite the handle. Its front
  // flank in shadow, its back flank and, seen from above, the dark channel
  // between them read together as the painting's dark lip; light runs along
  // the lip's edges.
  // Both flanks run down to one ridge under the beak, on the corner's line.
  const spoutTip = [.74, 2.108, 0], spoutTop = add(mul(around(40), .6), [0, 2.093, 0]), spoutFoot = add(mul(around(86), .565), [0, 1.74, 0]);
  const outside = p => {
    const a = Math.atan2(p[0], Math.abs(p[2])) / RAD, rho = Math.hypot(p[0], p[2]);
    const r = .52 + .08 * clamp((p[1] - 1.386) / .707), support = r * Math.cos(22.5 * RAD) / Math.cos((((a % 45) + 45) % 45 - 22.5) * RAD);
    return rho < support + .015 ? [p[0] * (support + .015) / rho, p[1], p[2] * (support + .015) / rho] : p;
  };
  const gussetNormal = unit(cross(sub(spoutFoot, spoutTop), sub(spoutTip, spoutTop)));
  const n = dot(gussetNormal, [1, 0, 1]) < 0 ? mul(gussetNormal, -1) : gussetNormal;
  // Splats sort by centre depth, and the faces behind are painted in larger
  // strokes, so the spout's flank sits a little proud toward the viewer.
  const proud = mul(unit(sub(mokaCamera.position, mokaCamera.target)), .05);
  const flank = (p, along, length, width) => {
    for (const side of [1, -1]) {
      let q = outside(p);
      if (side > 0) q = add(q, proud);
      else q[2] = -q[2];
      dab(q, side > 0 ? n : [n[0], n[1], -n[2]], side > 0 ? along : [along[0], along[1], -along[2]], length, width,
        jitter(side > 0 ? mix(C.spoutLip, C.lipCool, .35) : C.potBlue, .025), {depth: .02});
    }
  };
  // Each flank is filled in stacked strokes laid across it, each as long as
  // the triangle is wide there, so it narrows to a clean point.
  const ROWS = 18;
  for (let i = 0; i < ROWS; i++) {
    const v = (i + .5) / ROWS, from = mix(spoutTop, spoutFoot, v), to = mix(spoutTip, spoutFoot, v);
    const across = sub(to, from), length = Math.hypot(...across) / 3.15 + .003;
    flank(add(from, mul(unit(across), HEEL * length)), across, length, Math.hypot(...sub(spoutFoot, mix(spoutTop, spoutTip, .5))) / ROWS / 3 * 1.6);
  }
  // A stroke along each lower edge straightens the row ends.
  for (const [from, width] of [[spoutTop, .012], [spoutTip, .012]]) {
    const edge = sub(spoutFoot, from), length = Math.hypot(...edge) / 3.15;
    let inward = sub(mix(spoutTop, spoutTip, .5), from);
    inward = unit(sub(inward, mul(unit(edge), dot(inward, unit(edge)))));
    flank(add(add(from, mul(unit(edge), HEEL * length)), mul(inward, 1.5 * width)), edge, length, width);
  }
  line(add(spoutTip, proud), add(outside(spoutFoot), proud), n, .004, C.lipCool, .6);
  // The facet beside the spout reflects the cream cloth in a sharp triangle,
  // laid in the same stacked strokes just over the pink.
  {
    const on = (u, h) => mix(body(0, h), body(45, h), u), faceNormal = unit(cross(sub(on(1, 2), on(0, 2)), sub(on(.5, 1.5), on(.5, 2))));
    const facing = dot(faceNormal, around(22.5)) < 0 ? mul(faceNormal, -1) : faceNormal;
    const lift = add(mul(facing, .008), mul(proud, .5)), top = on(.62, 2.088), corner = on(.995, 2.088), foot = on(.97, 1.6);
    const rows = 16, rowWidth = Math.hypot(...sub(foot, mix(top, corner, .5))) / rows / 3 * 1.6;
    for (let i = 0; i < rows; i++) {
      const v = (i + .5) / rows, from = mix(top, foot, v), to = mix(corner, foot, v), across = sub(to, from), length = Math.hypot(...across) / 3.15 + .002;
      dab(add(add(from, mul(unit(across), HEEL * length)), lift), facing, across, length, rowWidth, jitter(C.spout, .025), {depth: .015});
    }
    line(add(top, lift), add(foot, lift), facing, .004, C.rimPink, .55);
  }
  // The channel: the spout's dark inside, dipping below the lip's two edges.
  const backTop = [spoutTop[0], spoutTop[1], -spoutTop[2]];
  for (let i = 0; i < 26; i++) {
    const f = .1 + .85 * ((i * .618) % 1), w = ((i * .382) % 1 - .5) * (1 - f) * .85;
    const edge = mix(mix(spoutTop, backTop, .5 + w), spoutTip, f), p = add(edge, [0, -.025 * (1 - f) * (1 - 4 * w * w), 0]);
    dab(add(p, mul(proud, .6)), [0, 1, 0], sub(spoutTip, mix(spoutTop, backTop, .5)), .02 + .015 * (1 - f), .016 + .012 * (1 - f),
      jitter(i % 7 === 3 ? C.lipCool : i % 5 ? C.spoutLip : C.lipWarm, .04), {depth: .01, opacity: .9});
  }
  line(add(spoutTop, [0, .012, 0]), add(spoutTip, [0, .012, 0]), [0, .7, .7], .0035, C.glint, .85);
  line(add(spoutTip, [-.03, .006, .02]), add(spoutTip, [.004, -.01, 0]), [.6, .3, .7], .004, C.glint, .9);
  line(add(backTop, [0, .01, 0]), add(spoutTip, [0, .01, 0]), [0, .7, -.7], .003, C.silver, .5);

  const count = splats.length;
  return {
    splats, background: '#5a7aa2', orbitLimit: 26, orbitMin: 4, orbitMinY: .25, canvasOnSubject: true,
    // Color is fully authored, so the bounce and shadow tint stay neutral.
    lighting: {irradiance: new Float32Array(count * 3), shadow: new Float32Array(count), stats: {patchCount: 0, bakeMs: 0}},
  };
}

export const mokaStillScene = {
  id: 'moka-still',
  label: 'Moka still life',
  title: 'Moka pot on a split cloth',
  description: 'An octagonal moka pot against a blue wall, on a table divided cream and pink.',
  caption: 'Painted still life, rebuilt in 3D',
  camera: mokaCamera,
  initialStyle: {
    quality: 'studio', mode: 'ghibli', oil: true, brushScale: 1, coverage: 1, softness: .15,
    gouacheTexture: .35, gouacheBlend: .45, gouacheTone: 0,
    indirect: false, tintedShadows: false,
    sun: false, lensDirt: false, lensFlare: false, painterlyVignette: false, foregroundDOF: false,
  },
  create: createMokaStill,
};
