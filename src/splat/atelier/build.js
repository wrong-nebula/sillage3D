/** Painting spec -> brush-stroke splats. The spec is plain JSON: a camera, a
 * medium, simple 3D objects, and paint layers that say how each surface is
 * covered in strokes. Deterministic: the same spec gives the same splats. */
import {add, sub, mul, dot, cross, len, unit, lerp, clamp, RAD, buildPatches, frameAt, cameraModel, tessellate, raycast, OBJECT_TYPES} from './geometry.js';
import {compileField, parseColor, mixColor} from './fields.js';
import {MEDIA, rendererStyle} from './media.js';

export const SPEC_VERSION = 1;
export const MAX_STROKES = 60000;
// The marks paint about 3.15 deviations along the stroke and 3 across it.
const HEEL = 1.55, ALONG = 3.15, ACROSS = 3;
const COVERAGE = ['bands', 'grid', 'scatter'];
const REQUIRED = {plane: ['size'], quad: ['points'], polygon: ['points'], box: ['size'], lathe: ['profile'], sphere: [], blob: [], tube: ['path', 'radius']};

const isVec = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);
const hash = text => { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const random = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
const range = (value, fallback) => value === undefined ? fallback : Array.isArray(value) ? value : [value, value];
const pick = ([a, b], rnd) => a + (b - a) * rnd();

/** Structural problems in a spec, as readable messages with their path. */
export function validateSpec(spec) {
  const errors = [], warnings = [], fail = (path, message) => errors.push(`${path}: ${message}`);
  if (!spec || typeof spec !== 'object') return {errors: ['spec: must be a JSON object'], warnings};
  if (!MEDIA[spec.medium]) fail('medium', `must be one of ${Object.keys(MEDIA).join(', ')}`);
  const camera = spec.camera ?? {};
  if (!isVec(camera.position)) fail('camera.position', 'needs [x, y, z]');
  if (!isVec(camera.target)) fail('camera.target', 'needs [x, y, z]');
  if (!(camera.fov > 1 && camera.fov < 120)) fail('camera.fov', 'needs the vertical field of view in degrees (1-120)');
  if (spec.background !== undefined) try { parseColor(spec.background, spec.palette); } catch (e) { fail('background', e.message); }
  for (const [name, value] of Object.entries(spec.palette ?? {})) try { parseColor(value); } catch { fail(`palette.${name}`, 'must be #rrggbb'); }
  if (!Array.isArray(spec.objects) || !spec.objects.length) fail('objects', 'needs at least one object');
  const ids = new Set();
  (Array.isArray(spec.objects) ? spec.objects : []).forEach((o, i) => {
    const path = `objects/${o?.id ?? i}`;
    if (!o || typeof o !== 'object') return fail(path, 'must be an object');
    if (typeof o.id !== 'string' || !/^[\w-]+$/.test(o.id)) fail(path, 'needs an "id" of letters, digits, - or _');
    else if (ids.has(o.id)) fail(path, 'duplicate id');
    ids.add(o.id);
    if (!OBJECT_TYPES.includes(o.type)) return fail(`${path}.type`, `must be one of ${OBJECT_TYPES.join(', ')}`);
    for (const key of REQUIRED[o.type]) if (o[key] === undefined) fail(`${path}.${key}`, `is required for a ${o.type}`);
    if (o.type === 'plane' && o.size && !isVec(o.size, 2)) fail(`${path}.size`, 'needs [width, height]');
    if (o.type === 'box' && o.size && !isVec(o.size)) fail(`${path}.size`, 'needs [x, y, z]');
    if (o.type === 'quad' && o.points && !(o.points.length === 4 && o.points.every(p => isVec(p)))) fail(`${path}.points`, 'needs four [x, y, z] corners: bottom-left, bottom-right, top-right, top-left');
    if (o.type === 'polygon' && o.points && !(o.points.length >= 3 && o.points.every(p => isVec(p)))) fail(`${path}.points`, 'needs three or more [x, y, z] points');
    if (o.type === 'lathe' && o.profile && !(o.profile.length >= 2 && o.profile.every(p => isVec(p, 2) && p[0] >= 0))) fail(`${path}.profile`, 'needs two or more [radius, height] pairs, bottom to top');
    if ((o.type === 'sphere' || o.type === 'blob') && !(o.radius > 0) && !isVec(o.radii)) fail(path, 'needs "radius" or "radii": [x, y, z]');
    if (o.type === 'tube' && o.path && !(o.path.length >= 2 && o.path.every(p => isVec(p)))) fail(`${path}.path`, 'needs two or more [x, y, z] points');
    if (o.type === 'tube' && Array.isArray(o.radius) && o.radius.length !== o.path?.length) fail(`${path}.radius`, 'as a list needs one radius per path point');
    if (!Array.isArray(o.paint) || !o.paint.length) warnings.push(`${path}: has no "paint" layers, so it only blocks the view`);
    (o.paint ?? []).forEach((layer, k) => {
      const at = `${path}/paint/${layer?.name ?? k}`;
      if (!layer || typeof layer !== 'object') return fail(at, 'must be an object');
      if (!COVERAGE.includes(layer.coverage)) fail(`${at}.coverage`, `must be one of ${COVERAGE.join(', ')}`);
      if (layer.color === undefined) fail(`${at}.color`, 'is required');
      if (layer.coverage !== 'bands' && (layer.length === undefined || layer.width === undefined)) fail(at, 'needs "length" and "width" (painted size in world units)');
      if (layer.coverage === 'scatter' && layer.count === undefined && layer.density === undefined) fail(at, 'scatter needs "count" or "density"');
      if (o.type === 'blob' && layer.coverage !== 'scatter') fail(`${at}.coverage`, 'a blob is a volume: use "scatter"');
    });
  });
  (Array.isArray(spec.marks) ? spec.marks : []).forEach((mark, i) => {
    if (!mark || typeof mark !== 'object' || (!mark.line && !mark.dab)) return fail(`marks/${i}`, 'needs "line": {from, to} or "dab": {at, size}');
    if (mark.color === undefined) fail(`marks/${i}.color`, 'is required');
    if (mark.on !== undefined && !ids.has(String(mark.on).split('.')[0])) fail(`marks/${i}.on`, `names an unknown object "${String(mark.on).split('.')[0]}"`);
  });
  return {errors, warnings};
}

/** Resolve a spec into patches, ray-cast groups and the camera. */
export function compileScene(spec) {
  const {errors} = validateSpec(spec);
  if (errors.length) throw new Error(`Invalid painting spec:\n- ${errors.join('\n- ')}`);
  const aspect = spec.source?.aspect ?? 1, camera = cameraModel(spec.camera, aspect);
  const objects = spec.objects.map((o, index) => ({id: o.id, index, spec: o, patches: buildPatches(o)}));
  const env = {palette: spec.palette ?? {}, fields: spec.fields ?? {}};
  return {spec, aspect, camera, objects, env, groups: tessellate(objects), unit: len(sub(spec.camera.target, spec.camera.position)) / 10};
}

function patchMetrics(patch) {
  // Mean world length of the u and v directions, and area, from a coarse sample.
  const n = 8;
  let area = 0, lu = 0, lv = 0;
  const rows = [];
  for (let j = 0; j < n; j++) {
    const v = (j + .5) / n;
    let rowU = 0, rowV = 0;
    for (let i = 0; i < n; i++) { const f = frameAt(patch, (i + .5) / n, v); rowU += f.su / n; rowV += f.sv / n; }
    rows.push(rowU); lu += rowU / n; lv += rowV / n; area += rowU * rowV / n;
  }
  return {area, lu, lv, rows, maxRow: Math.max(...rows)};
}

function strokeDirection(option, f, rnd, camera, spread) {
  let d;
  if (Array.isArray(option)) d = option;
  else if (typeof option === 'number') d = add(mul(f.tu, Math.cos(option * RAD)), mul(f.tv, Math.sin(option * RAD)));
  else if (option === 'u' || option === 'around') d = f.tu;
  else if (option === '-u') d = mul(f.tu, -1);
  else if (option === 'v' || option === 'along') d = f.tv;
  else if (option === '-v') d = mul(f.tv, -1);
  else if (option === 'up') d = [0, 1, 0];
  else if (option === 'away') d = camera.forward;
  else if (option === 'toward') d = mul(camera.forward, -1);
  else if (option === 'random') { const a = rnd() * 2 * Math.PI; d = add(mul(f.tu, Math.cos(a)), mul(f.tv, Math.sin(a))); }
  else if (option === undefined || option === 'down') d = [0, -1, 0];
  else throw new Error(`Unknown direction ${JSON.stringify(option)}: use down, up, u, -u, v, -v, around, along, away, toward, random, degrees, or [x, y, z]`);
  d = sub(d, mul(f.n, dot(d, f.n)));
  if (len(d) < 1e-4) d = mul(f.tv, -1);
  d = unit(d);
  if (spread) {
    const a = (rnd() - .5) * 2 * spread * RAD, side = cross(f.n, d);
    d = unit(add(mul(d, Math.cos(a)), mul(side, Math.sin(a))));
  }
  return d;
}

/** Build every stroke of a painting. `visibility: false` skips the ray-cast
 * trimming (faster, for tests that only need the layout). */
export function buildPainting(spec, {visibility = true, maxStrokes = MAX_STROKES} = {}) {
  const scene = compileScene(spec), {camera, env, groups, unit: U} = scene, medium = MEDIA[spec.medium];
  const splats = [], report = {objects: {}, strokes: 0, trimmed: 0, hidden: 0, warnings: validateSpec(spec).warnings};
  const cameraPosition = spec.camera.position;

  const occluded = p => {
    const to = sub(p, cameraPosition), distance = len(to);
    return Boolean(raycast(groups, cameraPosition, mul(to, 1 / distance), distance - Math.max(.004 * distance, U * .03)));
  };
  function dab(center, normal, along, sigmaL, sigmaW, color, opacity, depth, seed) {
    normal = unit(normal);
    let tangent = sub(along, mul(normal, dot(along, normal)));
    if (len(tangent) < 1e-6) tangent = cross(normal, [1, 0, 0]);
    if (len(tangent) < 1e-6) tangent = cross(normal, [0, 1, 0]);
    tangent = unit(tangent);
    const bitangent = unit(cross(normal, tangent));
    if (splats.length >= maxStrokes) throw new Error(`The painting passed ${maxStrokes} strokes. Use larger strokes, a wider grid "spacing", or fewer scatter marks.`);
    splats.push({center, axes: [mul(tangent, sigmaL), mul(bitangent, sigmaW), mul(normal, depth)], color: color.map(v => clamp(v)),
      opacity: clamp(opacity, .01, medium.maxOpacity), seed, material: 'stone'});
  }

  for (const object of scene.objects) {
    const stats = report.objects[object.id] = {strokes: 0, layers: {}};
    (object.spec.paint ?? []).forEach((layer, layerIndex) => {
      const where = `objects/${object.id}/paint/${layer.name ?? layerIndex}`;
      let field;
      try { field = compileField(layer.color, env); } catch (e) { throw new Error(`${where}.color: ${e.message}`); }
      const accents = (layer.accents ?? []).map(a => ({field: compileField(a.color, env), chance: a.chance ?? .2, amount: range(a.amount, [.1, .4])}));
      const rnd = random(hash(`${spec.seed ?? 1}/${object.id}/${layer.name ?? layerIndex}`));
      const opacity = range(layer.opacity, [medium.opacity, medium.opacity]), jitter = layer.jitter ?? .03;
      const lift = (layer.lift ?? layerIndex * .006) * (layer.lift === undefined ? U : 1), spread = layer.spread ?? 0;
      const wanted = layer.on === undefined || layer.on === '*' ? null : [layer.on].flat();
      const region = {u: layer.region?.u ?? [0, 1], v: layer.region?.v ?? [0, 1]};
      // Bands are whole strokes by intent; grid and scatter marks are cut at colour edges.
      const edgeAware = layer.edgeAware ?? layer.coverage !== 'bands';
      let count = 0;

      for (const patch of object.patches) {
        if (wanted && !wanted.includes(patch.name)) continue;
        const point = (u, v) => frameAt(patch, patch.wrapU ? ((u % 1) + 1) % 1 : clamp(u), clamp(v));
        const colorAt = (f, u, v) => field({u: patch.wrapU ? ((u % 1) + 1) % 1 : clamp(u), v: clamp(v), p: f.p, n: f.n, wrapU: patch.wrapU});

        const rateOf = (f, d) => [dot(d, f.tu) / (f.su || 1e-9), dot(d, f.tv) / (f.sv || 1e-9)];
        const emit = (u, v, d, L, W, centre, f) => {
          let color = colorAt(f, u, v);
          for (const accent of accents) if (rnd() < accent.chance) color = mixColor(color, accent.field({u, v, p: f.p, n: f.n, wrapU: patch.wrapU}), pick(accent.amount, rnd));
          color = color.map(c => c * (1 + (rnd() - .5) * jitter) + (rnd() - .5) * jitter * .25);
          const sigmaW = W / ACROSS;
          dab(centre, f.n, d, L / ALONG, sigmaW, color, pick(opacity, rnd), layer.thickness ?? Math.min(sigmaW * .25, U * .02), rnd());
          count++;
        };
        // Lay one stroke centred at (u,v), running along world direction d.
        // A stroke is one colour and one depth, so it is cut where its colour
        // field changes under it, and where it passes behind something: the
        // pieces together still cover what the whole stroke would have.
        // `walk(t)` gives the surface point t world units along the stroke from its centre.
        const lay = (walk, d, L, W, depth = 0) => {
          if (edgeAware && depth < 3 && L > W * .6) {
            const a = walk(-L * .45), b = walk(L * .45), ca = colorAt(a.f, a.u, a.v), cb = colorAt(b.f, b.u, b.v);
            if (Math.hypot(ca[0] - cb[0], ca[1] - cb[1], ca[2] - cb[2]) >= (layer.edgeTolerance ?? .1)) {
              lay(t => walk(t - L / 4), d, L * .52, W, depth + 1); lay(t => walk(t + L / 4), d, L * .52, W, depth + 1);
              return;
            }
          }
          const lifted = s => add(s.f.p, mul(s.f.n, lift)), surface = t => lifted(walk(t));
          if (!visibility) { const s = walk(0); return emit(s.u, s.v, d, L, W, lifted(s), s.f); }
          // Seen from the painting's camera each piece is wholly visible or
          // wholly hidden: splats sort by centre, so a mark that ran under a
          // nearer object would be drawn over it.
          const ts = [-.5, -.25, 0, .25, .5], seen = ts.map(t => !occluded(surface(t * L))), cuts = [-.5];
          for (let i = 1; i < ts.length; i++) if (seen[i] !== seen[i - 1]) {
            let inside = ts[i - 1], outside = ts[i];
            for (let k = 0; k < 3; k++) { const mid = (inside + outside) / 2; if (!occluded(surface(mid * L)) === seen[i - 1]) inside = mid; else outside = mid; }
            cuts.push((inside + outside) / 2);
          }
          cuts.push(.5);
          if (cuts.length > 2) report.trimmed++;
          for (let i = 0; i < cuts.length - 1; i++) {
            const t0 = cuts[i], t1 = cuts[i + 1], s = walk((t0 + t1) / 2 * L);
            let centre = lifted(s), width = W;
            const visible = !occluded(centre), length = Math.max((t1 - t0) * L * (cuts.length > 2 ? .96 : 1), Math.min(L, W * .3));
            if (!visible) report.hidden++;
            else {
              // The same across the stroke: narrow it away from a hidden side.
              const side = unit(cross(s.f.n, d)), hiddenSide = [-1, 1].filter(sign => occluded(add(centre, mul(side, sign * W * .45))));
              if (hiddenSide.length === 1) { width = W * .55; centre = add(centre, mul(side, -hiddenSide[0] * W * .22)); }
            }
            emit(s.u, s.v, d, length, width, centre, s.f);
          }
        };
        const onPatch = (u, v, d) => { const [ru, rv] = rateOf(point(u, v), d); return t => { const uu = u + ru * t, vv = v + rv * t; return {u: uu, v: vv, f: point(uu, vv)}; }; };
        // Grid and scatter marks are slid onto their patch, and shortened if they span it.
        const stroke = (u, v, d, L, W, {fixed = false} = {}) => {
          if (!fixed && !layer.bleed) {
            const [ru, rv] = rateOf(point(u, v), d);
            for (const [axis, r, wraps] of [['u', ru, patch.wrapU], ['v', rv, false]]) {
              if (wraps) continue;
              const reach = Math.abs(r) * L / 2, low = region[axis][0], high = region[axis][1], span = high - low;
              if (2 * reach > span) L *= span / (2 * reach) * .98;
              const half = Math.min(Math.abs(r) * L / 2, span / 2), value = axis === 'u' ? u : v, moved = clamp(value, low + half, high - half);
              if (axis === 'u') u = moved; else v = moved;
            }
          }
          lay(onPatch(u, v, d), d, L, W);
        };

        if (patch.volume) {
          // A blob is paint hanging in a volume: marks face the viewer loosely.
          const total = layer.count ?? Math.round(layer.density * patchMetrics(patch).area), fill = clamp(layer.fill ?? .6);
          for (let i = 0; i < total; i++) {
            const u = rnd(), v = Math.acos(1 - 2 * rnd()) / Math.PI, shell = point(u, v), inner = patch.inner(u, v);
            const p = lerp(inner, shell.p, 1 - fill * (1 - Math.cbrt(rnd()))), toward = unit(sub(cameraPosition, p));
            const n = unit(add(mul(shell.n, .6), toward)), f = {p, n, tu: unit(cross([0, 1, 0], n)), tv: unit(cross(n, cross([0, 1, 0], n)))};
            const d = strokeDirection(layer.direction ?? 'random', f, rnd, camera, spread), L = pick(range(layer.length), rnd), W = pick(range(layer.width), rnd);
            let color = field({u, v, p, n: shell.n, wrapU: true});
            for (const accent of accents) if (rnd() < accent.chance) color = mixColor(color, accent.field({u, v, p, n: shell.n, wrapU: true}), pick(accent.amount, rnd));
            color = color.map(c => c * (1 + (rnd() - .5) * jitter) + (rnd() - .5) * jitter * .25);
            dab(p, n, d, L / ALONG, W / ACROSS, color, pick(opacity, rnd), layer.thickness ?? W / ACROSS * .5, rnd());
            count++;
          }
          continue;
        }

        if (layer.coverage === 'bands' && patch.fan) {
          // A flat outline is filled with parallel strokes, each as long as
          // the shape is wide there, so it narrows to clean corners.
          const outline = Array.from({length: patch.nu}, (_, k) => patch.at(k / patch.nu, 1)), centre = patch.at(0, 0), base = frameAt(patch, .125, .6);
          const d = strokeDirection(layer.direction, base, rnd, camera, 0), across = unit(cross(base.n, d));
          const flat = q => { const r = sub(q, centre); return [dot(r, d), dot(r, across)]; }, ring = outline.map(flat);
          // Invert the fan: which sector holds a point, and how far out it is.
          const locate = ([x, y]) => {
            for (let k = 0; k < ring.length; k++) {
              const A = ring[k], B = ring[(k + 1) % ring.length], det = A[0] * B[1] - A[1] * B[0];
              if (Math.abs(det) < 1e-12) continue;
              const a = (x * B[1] - y * B[0]) / det, b = (A[0] * y - A[1] * x) / det;
              if (a >= -1e-6 && b >= -1e-6) return [(k + (a + b > 1e-9 ? b / (a + b) : 0)) / ring.length, clamp(a + b)];
            }
            return [0, 0];
          };
          const lo = Math.min(...ring.map(q => q[1])), hi = Math.max(...ring.map(q => q[1])), strips = Math.max(1, Math.round(layer.cols ?? 8)), step = (hi - lo) / strips;
          for (let i = 0; i < strips; i++) {
            const y = lo + step * (i + .5), hits = [];
            ring.forEach((A, k) => { const B = ring[(k + 1) % ring.length]; if ((A[1] > y) !== (B[1] > y)) hits.push(A[0] + (B[0] - A[0]) * (y - A[1]) / (B[1] - A[1])); });
            hits.sort((p, q) => p - q);
            for (let h = 0; h + 1 < hits.length; h += 2) {
              const L = hits[h + 1] - hits[h];
              if (L < 1e-6) continue;
              const x0 = hits[h] + L * HEEL / ALONG;
              lay(t => { const x = x0 + t, [u, v] = locate([x, y]); return {u, v, f: {p: add(centre, add(mul(d, x), mul(across, y))), n: base.n}}; }, d, L, step * (layer.overlap ?? 1.12));
            }
          }
          continue;
        }
        if (layer.coverage === 'bands') {
          // Full-length strokes side by side in each cell, heel on the edge
          // they start from: this is what keeps facets and planes crisp.
          const cols = Math.max(1, Math.round(layer.cols ?? (patch.round ? 24 : 3))), rows = Math.max(1, Math.round(layer.rows ?? 1));
          for (const cell of patch.cells) {
            const mid = point((cell.u0 + cell.u1) / 2, (cell.v0 + cell.v1) / 2), want = strokeDirection(layer.direction, mid, rnd, camera, 0);
            const alongV = Math.abs(dot(want, mid.tv)) >= Math.abs(dot(want, mid.tu)), forward = dot(want, alongV ? mid.tv : mid.tu) >= 0;
            const [a0, a1] = alongV ? [cell.u0, cell.u1] : [cell.v0, cell.v1], [b0, b1] = alongV ? [cell.v0, cell.v1] : [cell.u0, cell.u1];
            const lo = (alongV ? region.u : region.v), hi = (alongV ? region.v : region.u);
            if (a1 <= lo[0] || a0 >= lo[1] || b1 <= hi[0] || b0 >= hi[1]) continue;
            const at = (a, b) => alongV ? patch.at(a, b) : patch.at(b, a);
            // A stroke is straight: split the run until each piece hugs a curved surface.
            let pieces = rows;
            const bow = n => { const am = (a0 + a1) / 2, s1 = b0 + (b1 - b0) / n, chord = lerp(at(am, b0), at(am, s1), .5); return len(sub(at(am, (b0 + s1) / 2), chord)) / (len(sub(at(am, s1), at(am, b0))) || 1e-9); };
            while (pieces < 32 && bow(pieces) > .05) pieces *= 2;
            for (let c = 0; c < cols; c++) for (let r = 0; r < pieces; r++) {
              const a = a0 + (a1 - a0) * (c + .5) / cols, s0 = b0 + (b1 - b0) * r / pieces, s1 = b0 + (b1 - b0) * (r + 1) / pieces;
              const start = at(a, forward ? s0 : s1), end = at(a, forward ? s1 : s0), drag = sub(end, start), L = len(drag);
              if (L < 1e-6) continue;
              // Wide enough for the strip's widest part, so tapering cells leave no gaps.
              const W = Math.max(...[s0, (s0 + s1) / 2, s1].map(b => len(sub(at(a0 + (a1 - a0) * (c + 1) / cols, b), at(a0 + (a1 - a0) * c / cols, b))))) * (layer.overlap ?? 1.12);
              if (W < 1e-6) continue;
              // The mark's own centre sits a heel's length in from its start.
              const t = HEEL / ALONG, centreB = (forward ? s0 : s1) + ((forward ? s1 : s0) - (forward ? s0 : s1)) * t;
              stroke(alongV ? a : centreB, alongV ? centreB : a, unit(drag), L, W, {fixed: true});
            }
          }
          continue;
        }

        const metrics = patchMetrics(patch), lengths = range(layer.length), widths = range(layer.width);
        const spanU = region.u[1] - region.u[0], spanV = region.v[1] - region.v[0];
        const place = (u, v) => {
          const f = point(u, v), d = strokeDirection(layer.direction, f, rnd, camera, spread);
          stroke(u, v, d, pick(lengths, rnd), pick(widths, rnd));
        };
        if (layer.coverage === 'grid') {
          // A jittered lattice, denser where the surface is larger, so the
          // layer covers without gaps or piles.
          const cell = Math.sqrt((lengths[0] + lengths[1]) / 2 * (widths[0] + widths[1]) / 2) * (layer.spacing ?? .7);
          const nv = Math.max(1, Math.round(metrics.lv * spanV / cell));
          for (let j = 0; j < nv; j++) {
            const vRow = region.v[0] + spanV * (j + .5) / nv, rowLength = frameAt(patch, .5, clamp(vRow)).su;
            let around = 0;
            for (let i = 0; i < 6; i++) around += frameAt(patch, (i + .5) / 6, clamp(vRow)).su / 6;
            const nu = Math.max(1, Math.round((around || rowLength) * spanU / cell));
            for (let i = 0; i < nu; i++) place(region.u[0] + spanU * (i + .2 + rnd() * .6) / nu, region.v[0] + spanV * (j + .2 + rnd() * .6) / nv);
          }
        } else {
          const total = Math.round(layer.count ?? layer.density * metrics.area * spanU * spanV);
          for (let i = 0; i < total; i++) {
            // Rejection on the row length keeps the density even on cones and spheres.
            let u, v, tries = 0;
            do { u = region.u[0] + spanU * rnd(); v = region.v[0] + spanV * rnd(); } while (++tries < 12 && rnd() > metrics.rows[Math.min(7, Math.floor(v * 8))] / metrics.maxRow);
            place(u, v);
          }
        }
      }
      stats.layers[layer.name ?? layerIndex] = count; stats.strokes += count;
    });

    // A dark core keeps closed solids from showing the wall through gaps.
    if (object.spec.core) {
      const color = parseColor(object.spec.core, env.palette), rnd = random(hash(`${object.id}/core`));
      for (const patch of object.patches) {
        if (!patch.inner) continue;
        const metrics = patchMetrics(patch), reach = [.25, .5, .75].map(v => len(sub(frameAt(patch, .125, v).p, patch.inner(.125, v)))).reduce((x, y) => x + y) / 3;
        // Each dab reaches about 1.6 deviations: sized to stay inside the shell.
        const size = reach * .2, total = clamp(Math.round(metrics.area / (size * size) * .35), 40, 900);
        for (let i = 0; i < total; i++) {
          const u = rnd(), v = rnd(), shell = frameAt(patch, u, v), inner = patch.inner(u, v), local = len(sub(shell.p, inner)), sigma = Math.min(size, local * .2);
          if (sigma < 1e-5) continue;
          dab(lerp(inner, shell.p, Math.sqrt(rnd()) * .6), shell.n, [0, 1, 0], sigma, sigma, color.map(c => c * (1 + (rnd() - .5) * .08)), .98, sigma * .8, rnd());
        }
      }
    }
  }

  // Explicit marks: thin lines and single dabs for highlights and drawn edges.
  (spec.marks ?? []).forEach((mark, index) => {
    const where = `marks/${index}`, rnd = random(hash(`${spec.seed ?? 1}/mark/${index}`));
    try {
      const color = compileField(mark.color, env), opacity = mark.opacity ?? .9;
      let resolve = p => ({p, n: null});
      if (mark.on) {
        const [id, patchName] = mark.on.split('.'), object = scene.objects.find(o => o.id === id);
        if (!object) throw new Error(`unknown object "${id}"`);
        const patch = object.patches.find(p => p.name === (patchName ?? object.patches[0].name));
        if (!patch) throw new Error(`"${id}" has no patch "${patchName}" (it has ${object.patches.map(p => p.name).join(', ')})`);
        resolve = ([u, v]) => { const f = frameAt(patch, u, v); return {p: add(f.p, mul(f.n, mark.lift ?? U * .012)), n: f.n, u, v}; };
      }
      const facing = p => unit(sub(cameraPosition, p));
      if (mark.line) {
        const a = resolve(mark.line.from), b = resolve(mark.line.to), along = sub(b.p, a.p), dir = unit(along), mid = lerp(a.p, b.p, .5);
        let normal = a.n ?? facing(mid);
        normal = sub(normal, mul(dir, dot(normal, dir)));
        const width = mark.width ?? U * .01;
        dab(mid, normal, along, len(along) / ALONG, width / ACROSS, color({u: a.u ?? 0, v: a.v ?? 0, p: mid, n: unit(normal)}), opacity, Math.min(width / ACROSS, U * .006), rnd());
      } else if (mark.dab) {
        const at = resolve(mark.dab.at), normal = mark.dab.normal ?? at.n ?? facing(at.p), [length, width] = mark.dab.size;
        dab(at.p, normal, mark.dab.direction ?? [0, -1, 0], length / ALONG, width / ACROSS, color({u: at.u ?? 0, v: at.v ?? 0, p: at.p, n: unit(normal)}), opacity, Math.min(width / ACROSS * .5, U * .01), rnd());
      } else throw new Error('needs "line": {from, to} or "dab": {at, size}');
    } catch (e) { throw new Error(`${where}: ${e.message}`); }
  });

  for (const s of splats) for (const value of [...s.center, ...s.axes.flat(), ...s.color, s.opacity]) if (!Number.isFinite(value)) throw new Error('The spec produced a non-finite stroke: check for zero sizes or coincident points.');
  report.strokes = splats.length;
  return {splats, report, scene, background: spec.background ?? '#808080', style: rendererStyle(spec)};
}

/** A scene definition the GaussianBrushRenderer can load. */
export function paintingScene(spec, options) {
  const distance = len(sub(spec.camera.target, spec.camera.position));
  return {
    id: 'atelier', label: spec.title ?? 'Painting', title: spec.title ?? 'Painting', description: spec.description ?? '',
    camera: {position: spec.camera.position, target: spec.camera.target, fov: spec.camera.fov},
    initialStyle: rendererStyle(spec),
    create() {
      const built = buildPainting(spec, options), count = built.splats.length;
      return {splats: built.splats, background: built.background, orbitLimit: distance * 3, orbitMin: distance * .3, canvasOnSubject: true, report: built.report,
        // Colour is fully authored, so bounce and shadow tint stay neutral.
        lighting: {irradiance: new Float32Array(count * 3), shadow: new Float32Array(count), stats: {patchCount: 0, bakeMs: 0}}};
    },
  };
}
