/** A brush that lays marks on simple forms. One mark is one splat: a full-rank
 * 3D Gaussian whose long axis is the stroke direction. This is the authoring
 * layer behind scene documents; it can also be used directly:
 *
 *   const brush = createBrush({seed: 7});
 *   brush.ellipsoid({center: [0, 1, 0], radius: 1, count: 900, color: ['#3b2a20', '#8a5a3c', '#d9a66f']});
 *   brush.cylinder({base: [2, 0, 0], radius: [.5, .4], height: 3, color: '#c9b9b0'});
 *   brush.splats   // -> [{center, axes, color, opacity, seed, material}]
 *
 * Sizes are painted sizes in world units: a mark of length 0.4 reads about
 * 0.4 long on screen. Pure math: safe to import in Node. */
import {SillageError, didYouMean} from './errors.js';

/** The marks paint about 3.15 deviations along the stroke and 3 across it. */
export const ALONG = 3.15, ACROSS = 3;
export const DEFAULT_LIGHT = [-.8, 1.1, .7];
export const MATERIALS = ['stone', 'wood', 'foliage', 'grass', 'cloud', 'fog', 'metal', 'rough-metal'];

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const unit = a => { const n = len(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Deterministic random numbers in [0, 1). */
export function randomSource(seed) {
  let state = (Number(seed) | 0) || 1;
  return () => {
    state = state + 0x6D2B79F5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const noise = (x, y, z) => .5 * Math.sin(x * 1.7 + Math.sin(z * 2.1)) + .3 * Math.sin(y * 2.9 + z * .8) + .2 * Math.sin(z * 3.9 + x * .7);

/** "#rgb", "#rrggbb", [r, g, b] in 0..1, or a palette name -> [r, g, b] in 0..1 (display RGB). */
export function parseColor(value, palette = {}) {
  if (Array.isArray(value) && value.length === 3 && value.every(v => typeof v === 'number' && Number.isFinite(v))) return value.map(v => clamp(v));
  if (typeof value === 'string') {
    if (Object.hasOwn(palette, value)) return parseColor(palette[value]);
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
    if (short) return short.slice(1).map(digit => parseInt(digit + digit, 16) / 255);
    const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
    if (long) return long.slice(1).map(pair => parseInt(pair, 16) / 255);
    const names = Object.keys(palette);
    throw new SillageError('INVALID_COLOR', `"${value}" is not a colour.`, {hint: names.length ? `Use "#rrggbb" or a palette name. ${didYouMean(value, names)}` : 'Use "#rrggbb", for example "#c2542d".'});
  }
  throw new SillageError('INVALID_COLOR', `${JSON.stringify(value)} is not a colour.`, {hint: 'Use "#rrggbb", a palette name, or [r, g, b] with each value from 0 to 1.'});
}
export const toHex = color => '#' + color.map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');

/** Compile a colour spec into a function of a surface point. A spec is one
 * colour; a list of colours, dark to light, picked by how the surface faces
 * the light; {ramp, variation}; or {gradient: {axis, stops: [[at, colour]]}}. */
export function compileColor(spec, {palette = {}, light = DEFAULT_LIGHT} = {}) {
  const toward = unit(light);
  if (spec && typeof spec === 'object' && !Array.isArray(spec) && spec.gradient) {
    const axis = {x: 0, y: 1, z: 2}[spec.gradient.axis ?? 'y'];
    const list = spec.gradient.stops;
    if (axis === undefined || !Array.isArray(list) || list.length < 2 || !list.every(stop => Array.isArray(stop) && stop.length === 2 && Number.isFinite(stop[0]))) throw new SillageError('INVALID_COLOR', 'A gradient needs an axis ("x", "y" or "z") and at least two stops [position, colour].', {hint: 'For example {"gradient": {"axis": "y", "stops": [[0, "#2b3a55"], [3, "#9fb4d6"]]}}.'});
    // A stop's colour is itself a colour spec, so a band can keep its light and shade.
    const stops = list.map(([at, colour]) => {
      if (colour && typeof colour === 'object' && !Array.isArray(colour) && colour.gradient) throw new SillageError('INVALID_COLOR', 'A gradient stop cannot be another gradient.', {hint: 'A stop is one colour or a list of colours from dark to light.'});
      return [at, compileColor(colour, {palette, light})];
    }).sort((a, b) => a[0] - b[0]);
    return context => {
      const t = context.p[axis];
      if (t <= stops[0][0]) return stops[0][1](context);
      for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
        const span = stops[i][0] - stops[i - 1][0];
        // Two stops at one position make a hard edge.
        return span > 0 ? lerp(stops[i - 1][1](context), stops[i][1](context), (t - stops[i - 1][0]) / span) : stops[i - 1][1](context);
      }
      return stops.at(-1)[1](context);
    };
  }
  const list = Array.isArray(spec) && !(spec.length === 3 && spec.every(v => typeof v === 'number')) ? spec : spec?.ramp;
  if (list) {
    if (!Array.isArray(list) || !list.length) throw new SillageError('INVALID_COLOR', 'A colour ramp needs at least one colour.', {hint: 'List colours from dark to light, for example ["#3b2a20", "#8a5a3c", "#d9a66f"].'});
    const ramp = list.map(colour => parseColor(colour, palette)), variation = spec?.variation ?? .12;
    // The engine's own painterly idiom: quantized tones, broken by a little noise.
    return ({p, n, random}) => {
      const lit = (dot(n, toward) + .35) / 1.2 + noise(p[0] * .7, p[1] * .7, p[2] * .7) * variation + (random() - .5) * variation * 1.3;
      return ramp[Math.min(ramp.length - 1, Math.floor(clamp(lit, 0, .9999) * ramp.length))];
    };
  }
  const flat = parseColor(spec, palette);
  return () => flat;
}

function rotation([x = 0, y = 0, z = 0] = []) {
  const [a, b, c] = [x, y, z].map(v => v * Math.PI / 180);
  const [sa, ca, sb, cb, sc, cc] = [Math.sin(a), Math.cos(a), Math.sin(b), Math.cos(b), Math.sin(c), Math.cos(c)];
  // Applied X, then Y, then Z.
  const m = [[cb * cc, sa * sb * cc - ca * sc, ca * sb * cc + sa * sc], [cb * sc, sa * sb * sc + ca * cc, ca * sb * sc - sa * cc], [-sb, sa * cb, ca * cb]];
  return v => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
}

/** Scale and turn finished splats about `pivot`, then move them:
 * {position, rotation (degrees XYZ), scale, pivot}. */
export function transformSplats(splats, {position = [0, 0, 0], rotation: degrees = [0, 0, 0], scale = 1, pivot = [0, 0, 0]} = {}) {
  const factors = typeof scale === 'number' ? [scale, scale, scale] : scale, turn = rotation(degrees);
  const apply = v => turn([v[0] * factors[0], v[1] * factors[1], v[2] * factors[2]]);
  for (const splat of splats) {
    splat.center = add(add(apply(sub(splat.center, pivot)), pivot), position);
    splat.axes = splat.axes.map(apply);
  }
  return splats;
}

function strokeDirection(direction, {p, n, axis, random, spread}) {
  let d = direction;
  if (d === 'random' || d === undefined && !axis) d = [random() - .5, random() - .5, random() - .5];
  else if (d === undefined || d === 'along') d = axis;
  else if (d === 'around') d = cross(axis ?? [0, 1, 0], n);
  else if (d === 'up') d = [0, 1, 0];
  else if (d === 'down') d = [0, -1, 0];
  if (spread) d = add(unit(d), mul([random() - .5, random() - .5, random() - .5], 2 * Math.tan(clamp(spread, 0, 80) * Math.PI / 180)));
  return d;
}

export function createBrush({seed = 1, palette = {}, light = DEFAULT_LIGHT} = {}) {
  const random = randomSource(seed), splats = [], notes = [], round = v => Math.round(v * 100) / 100;

  /** One mark. `size` is [length, width, thickness] as painted. */
  function mark({at, normal = [0, 1, 0], direction = [1, 0, 0], size = [.3, .12, .04], color = [.5, .5, .5], opacity = .95, material = 'stone'}) {
    const n = unit(normal);
    let tangent = sub(direction, mul(n, dot(direction, n)));
    if (len(tangent) < 1e-6) tangent = cross(n, Math.abs(n[1]) > .8 ? [1, 0, 0] : [0, 1, 0]);
    tangent = unit(tangent);
    const bitangent = unit(cross(n, tangent)), [length, width, thickness = Math.min(width * .5, length * .25)] = size;
    const splat = {center: [...at], axes: [mul(tangent, length / ALONG), mul(bitangent, width / ACROSS), mul(n, Math.max(1e-4, thickness / ACROSS))],
      color: Array.isArray(color) && typeof color[0] === 'number' ? color.map(v => clamp(v)) : parseColor(color, palette), opacity: clamp(opacity, .01, 1), seed: random(), material};
    splats.push(splat);
    return splat;
  }

  /** How many marks a surface gets and how big they are. Marks never run
   * longer than 40% of the surface's smallest extent, so a thin band or a
   * small face keeps its shape; the number rises to keep it covered. */
  function plan(area, {count, stroke = {}}, {density, least, most, extent = Infinity}) {
    let total = count ?? clamp(Math.round(area * density), least, most), spacing = Math.sqrt(area / total);
    let length = stroke.length ?? spacing * 2.1, width = stroke.width ?? spacing * 1.25;
    if (stroke.length === undefined && length > extent * .4) {
      length = extent * .4;
      if (stroke.width === undefined) width = Math.min(width, length * .7);
      if (count === undefined) total = clamp(Math.ceil(area / (length * width) * 2.6), least, most * 2);
    }
    return {count: total, stroke: {...stroke, length, width}};
  }

  /** Cover a surface: `sample(i, count)` returns {p, n, axis, scale?} for each mark. */
  function cover(sample, area, {count, color = '#808080', stroke = {}, opacity = .95, material = 'stone', loose = false}) {
    const total = Math.max(1, Math.round(count)), spacing = Math.sqrt(area / total), paint = compileColor(color, {palette, light});
    // Marks a little longer than their spacing overlap into continuous paint.
    const length = stroke.length ?? spacing * 2.1, width = stroke.width ?? spacing * 1.25, thickness = stroke.thickness ?? Math.min(width * .4, spacing * .5);
    const jitter = stroke.jitter ?? .35, first = splats.length;
    // Painted area per mark against the surface each mark has to cover.
    if (!loose && length * width < spacing * spacing * .9) notes.push(`its marks cover about ${Math.round(100 * length * width / (spacing * spacing))}% of the surface, so the background shows between them. Raise "count" to about ${Math.ceil(area / (length * width) * 1.6)}, or use larger strokes (default here: length ${round(spacing * 2.1)}, width ${round(spacing * 1.25)}).`);
    for (let i = 0; i < total; i++) {
      const {p, n, axis, scale = 1} = sample(i, total), vary = (1 - jitter * .5 + random() * jitter) * scale;
      mark({at: p, normal: n, direction: strokeDirection(stroke.direction, {p, n, axis, random, spread: stroke.spread}), size: [length * vary, width * vary, thickness],
        color: paint({p, n, random}), opacity: Array.isArray(opacity) ? opacity[0] + random() * (opacity[1] - opacity[0]) : opacity, material});
    }
    return splats.slice(first);
  }

  /** A sphere or ellipsoid shell, on an even spiral. */
  function ellipsoid({center = [0, 0, 0], radius = 1, radii = [radius, radius, radius], count, ...rest}) {
    const [a, b, c] = radii, area = 4 * Math.PI * (((a * b) ** 1.6 + (a * c) ** 1.6 + (b * c) ** 1.6) / 3) ** (1 / 1.6);
    const phase = random() * TAU;
    return cover((i, total) => {
      const y = 1 - 2 * (i + .5) / total, theta = i * 2.399963229728653 + phase, f = Math.sqrt(1 - y * y), u = [Math.cos(theta) * f, y, Math.sin(theta) * f];
      return {p: add(center, [u[0] * a, u[1] * b, u[2] * c]), n: unit([u[0] / a, u[1] / b, u[2] / c]), axis: [0, 1, 0]};
    }, area, {...rest, ...plan(area, {count, stroke: rest.stroke}, {density: 60, least: 200, most: 4000, extent: 2 * Math.min(a, b, c)})});
  }

  /** A flat rectangle. `up` is the direction of its height. */
  function plane({center = [0, 0, 0], size = [4, 4], normal = [0, 1, 0], up, count, ...rest}) {
    const n = unit(normal);
    let v = up ?? (Math.abs(n[1]) > .8 ? [0, 0, -1] : [0, 1, 0]);
    v = unit(sub(v, mul(n, dot(v, n))));
    const u = unit(cross(v, n)), area = size[0] * size[1], planned = plan(area, {count, stroke: rest.stroke}, {density: 40, least: 12, most: 8000, extent: Math.min(size[0], size[1])});
    const cols = Math.max(1, Math.round(Math.sqrt(planned.count * size[0] / size[1]))), rows = Math.max(1, Math.ceil(planned.count / cols));
    // Mark centres stay a little inside the outline, so strokes end near the edge instead of hanging over it.
    const reach = .3 * planned.stroke.length, inset = [Math.min(reach, size[0] * .2), Math.min(reach, size[1] * .2)];
    return cover(i => {
      const s = ((i % cols) + .15 + random() * .7) / cols - .5, t = (Math.floor(i / cols) + .15 + random() * .7) / rows - .5;
      return {p: add(center, add(mul(u, s * (size[0] - 2 * inset[0])), mul(v, t * (size[1] - 2 * inset[1])))), n, axis: u};
    }, area, {...rest, stroke: planned.stroke, count: cols * rows});
  }

  /** A flat round disc: pond, plate, lid, the end of a cylinder. */
  function disc({center = [0, 0, 0], radius = 1, normal = [0, 1, 0], count, ...rest}) {
    const n = unit(normal), u = unit(cross(n, Math.abs(n[1]) > .8 ? [1, 0, 0] : [0, 1, 0])), v = cross(n, u), area = Math.PI * radius * radius;
    const planned = plan(area, {count, stroke: rest.stroke}, {density: 50, least: 10, most: 6000, extent: radius * 1.4}), keep = Math.max(radius * .5, radius - .3 * planned.stroke.length), phase = random() * TAU;
    return cover((i, total) => {
      const r = keep * Math.sqrt((i + .5) / total), angle = i * 2.399963229728653 + phase;
      return {p: add(center, add(mul(u, r * Math.cos(angle)), mul(v, r * Math.sin(angle)))), n, axis: u};
    }, area, {...rest, ...planned});
  }

  /** A box painted on all six faces, marks shared out by face area. */
  function box({center = [0, 0, 0], size = [1, 1, 1], count, ...rest}) {
    const [x, y, z] = size, faces = [
      {normal: [0, 0, 1], up: [0, 1, 0], size: [x, y], offset: z / 2}, {normal: [0, 0, -1], up: [0, 1, 0], size: [x, y], offset: z / 2},
      {normal: [1, 0, 0], up: [0, 1, 0], size: [z, y], offset: x / 2}, {normal: [-1, 0, 0], up: [0, 1, 0], size: [z, y], offset: x / 2},
      {normal: [0, 1, 0], up: [0, 0, -1], size: [x, z], offset: y / 2}, {normal: [0, -1, 0], up: [0, 0, 1], size: [x, z], offset: y / 2},
    ], area = 2 * (x * y + y * z + x * z), first = splats.length;
    // With no count each face plans its own marks; a given count is shared out by area.
    for (const face of faces) plane({center: add(center, mul(face.normal, face.offset)), size: face.size, normal: face.normal, up: face.up, ...rest,
      count: count === undefined ? undefined : Math.max(4, Math.round(count * face.size[0] * face.size[1] / area))});
    return splats.slice(first);
  }

  /** A tube along a path of points: trunks, branches, limbs, ropes.
   * `caps` closes its ends with discs: "none", "start", "end" or "both". */
  function tube({path, radius = .1, count, caps = 'none', ...rest}) {
    const radii = Array.isArray(radius) ? radius : path.map(() => radius), lengths = path.slice(1).map((point, i) => len(sub(point, path[i])));
    const total = lengths.reduce((sum, value) => sum + value, 0), mean = radii.reduce((sum, value) => sum + value, 0) / radii.length, side = TAU * mean * total;
    const ends = [caps === 'start' || caps === 'both' ? {at: path[0], normal: sub(path[0], path[1]), radius: radii[0]} : null, caps === 'end' || caps === 'both' ? {at: path.at(-1), normal: sub(path.at(-1), path.at(-2)), radius: radii.at(-1)} : null].filter(end => end && end.radius > 1e-6);
    const area = side + ends.reduce((sum, end) => sum + Math.PI * end.radius ** 2, 0), first = splats.length;
    const planned = plan(side, {count: count === undefined ? undefined : Math.max(1, Math.round(count * side / area)), stroke: rest.stroke}, {density: 80, least: 40, most: 4000, extent: Math.min(total, TAU * mean)});
    // Marks stop short of open ends, and shrink where the tube narrows.
    const inset = Math.min(.3 * planned.stroke.length, total * .15);
    cover(() => {
      let along = inset + random() * (total - 2 * inset), k = 0;
      while (k < lengths.length - 1 && along > lengths[k]) along -= lengths[k++];
      const f = clamp(along / (lengths[k] || 1)), axis = unit(sub(path[k + 1], path[k]));
      const u = unit(cross(axis, Math.abs(axis[1]) > .8 ? [1, 0, 0] : [0, 1, 0])), v = cross(axis, u), angle = random() * TAU;
      const n = add(mul(u, Math.cos(angle)), mul(v, Math.sin(angle))), r = radii[k] * (1 - f) + radii[k + 1] * f;
      return {p: add(lerp(path[k], path[k + 1], f), mul(n, r)), n, axis, scale: clamp(Math.sqrt(r / mean), .3, 1.5)};
    }, side, {...rest, ...planned});
    for (const end of ends) disc({center: end.at, normal: end.normal, radius: end.radius, ...rest, stroke: {...rest.stroke, direction: rest.stroke?.direction === 'along' || rest.stroke?.direction === 'around' ? undefined : rest.stroke?.direction},
      count: count === undefined ? undefined : Math.max(4, Math.round(count * Math.PI * end.radius ** 2 / area))});
    return splats.slice(first);
  }

  /** An upright solid of revolution on its base: columns, towers, drums, pots.
   * `radius` is one number, or [bottom, top] for a taper. Closed at both ends. */
  function cylinder({base = [0, 0, 0], radius = .5, height = 1, axis = [0, 1, 0], caps = 'both', ...rest}) {
    const [bottom, top] = Array.isArray(radius) ? radius : [radius, radius];
    return tube({path: [base, add(base, mul(unit(axis), height))], radius: [bottom, top], caps, ...rest});
  }
  /** A cone on its base, closed underneath: roofs, spires, tips. */
  function cone({base = [0, 0, 0], radius = .5, height = 1, axis = [0, 1, 0], ...rest}) {
    return cylinder({base, radius: [radius, 0], height, axis, caps: 'start', ...rest});
  }

  /** A soft volume of loosely oriented marks: foliage, cloud, smoke. */
  function blob({center = [0, 0, 0], radius = 1, radii = [radius, radius, radius], count, fill = .6, material = 'foliage', stroke = {}, ...rest}) {
    const [a, b, c] = radii, area = 4 * Math.PI * ((a * b + a * c + b * c) / 3);
    return cover(() => {
      const y = 1 - 2 * random(), theta = random() * TAU, f = Math.sqrt(1 - y * y), u = [Math.cos(theta) * f, y, Math.sin(theta) * f];
      const depth = 1 - fill * random() ** 2, n = unit(add([u[0] / a, u[1] / b, u[2] / c], mul([random() - .5, random() - .5, random() - .5], .7)));
      return {p: add(center, [u[0] * a * depth, u[1] * b * depth, u[2] * c * depth]), n};
    }, area * 1.6, {count: count ?? clamp(Math.round(area * 70), 150, 5000), material, stroke: {direction: 'random', ...stroke}, ...rest, loose: true});
  }

  return {splats, notes, random, mark, cover, ellipsoid, plane, disc, box, tube, cylinder, cone, blob};
}
