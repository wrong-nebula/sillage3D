/** Colour fields of a painting spec. A field maps a point on a surface
 * (patch u,v, world position p, normal n) to an sRGB triple in 0..1. */
import {clamp, smooth, dot, unit, RAD} from './geometry.js';

export const mixColor = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const toHex = c => '#' + c.map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');

export function parseColor(value, palette = {}) {
  if (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)) return value.map(v => clamp(v));
  if (typeof value !== 'string') throw new Error(`Expected a colour, got ${JSON.stringify(value)}`);
  if (Object.hasOwn(palette, value)) return parseColor(palette[value]);
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())?.[1];
  if (!hex) throw new Error(`Unknown colour "${value}": use #rrggbb or a palette name`);
  const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
}

const FIELD_KEYS = ['gradient', 'grid', 'angle', 'facets', 'split', 'light', 'mix', 'tints', 'ref'];
const azimuth = n => Math.atan2(n[0], n[2]) / RAD;
const angleGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function pointInPolygon([x, y], points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i], [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polygonDistance([x, y], points) {
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, ay] = points[j], [bx, by] = points[i], dx = bx - ax, dy = by - ay;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1e-9));
    best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return best;
}
/** Coverage 0..1 of a soft shape in patch uv; `feather` is in uv units. */
function shapeCoverage(shape, u, v) {
  const feather = Math.max(1e-4, shape.feather ?? .05);
  if (shape.ellipse) {
    const {center, radii, angle = 0} = shape.ellipse, c = Math.cos(angle * RAD), s = Math.sin(angle * RAD);
    const dx = u - center[0], dy = v - center[1], x = (dx * c + dy * s) / radii[0], y = (-dx * s + dy * c) / radii[1];
    const d = Math.hypot(x, y), scale = feather / Math.min(radii[0], radii[1]);
    return 1 - smooth(d, 1 - scale, 1 + scale);
  }
  if (shape.polygon) {
    const points = shape.polygon, d = polygonDistance([u, v], points) * (pointInPolygon([u, v], points) ? -1 : 1);
    return 1 - smooth(d, -feather, feather);
  }
  if (shape.band) {
    // A soft-edged strip between two values of u or v.
    const {along = 'v', from, to} = shape.band, t = along === 'u' ? u : v;
    return smooth(t, from - feather, from + feather) * (1 - smooth(t, to - feather, to + feather));
  }
  throw new Error('A tint shape needs "ellipse", "polygon" or "band"');
}

export function gridLookup(grid, colors, u, v, wrapU) {
  const {cols, rows} = grid, hard = grid.hard === true ? 'both' : grid.hard;
  let fu = u * cols - .5, fv = v * rows - .5;
  if (hard === 'u' || hard === 'both') fu = Math.round(fu);
  if (hard === 'v' || hard === 'both') fv = Math.round(fv);
  const i0 = Math.floor(fu), j0 = Math.floor(fv), a = fu - i0, b = fv - j0;
  const col = i => wrapU ? ((i % cols) + cols) % cols : clamp(i, 0, cols - 1), row = j => clamp(j, 0, rows - 1);
  const at = (i, j) => colors[row(j) * cols + col(i)];
  return mixColor(mixColor(at(i0, j0), at(i0 + 1, j0), a), mixColor(at(i0, j0 + 1), at(i0 + 1, j0 + 1), a), b);
}

/** Compile a field definition into ctx => [r,g,b]. `env` holds the palette
 * and the spec's named fields; ctx is {u, v, p, n, wrapU}. */
export function compileField(def, env, depth = 0) {
  if (depth > 12) throw new Error('Colour fields are nested too deeply (a "ref" cycle?)');
  const sub = d => compileField(d, env, depth + 1);
  if (typeof def === 'string' || Array.isArray(def)) {
    if (typeof def === 'string' && env.fields && Object.hasOwn(env.fields, def) && !Object.hasOwn(env.palette ?? {}, def) && !def.startsWith('#')) return sub(env.fields[def]);
    const color = parseColor(def, env.palette);
    return () => color;
  }
  if (!def || typeof def !== 'object') throw new Error(`Invalid colour field ${JSON.stringify(def)}`);
  if (def.ref) {
    if (!env.fields || !Object.hasOwn(env.fields, def.ref)) throw new Error(`Unknown field "${def.ref}"`);
    return sub(env.fields[def.ref]);
  }
  if (def.gradient) {
    const {along = 'v', stops} = def.gradient, axis = {x: 0, y: 1, z: 2}[along];
    if (!Array.isArray(stops) || stops.length < 2) throw new Error('A gradient needs at least two stops [t, colour]');
    const compiled = stops.map(([t, c]) => [t, sub(c)]).sort((a, b) => a[0] - b[0]);
    return ctx => {
      const t = axis === undefined ? ctx[along] : ctx.p[axis];
      if (t <= compiled[0][0]) return compiled[0][1](ctx);
      for (let i = 1; i < compiled.length; i++) if (t <= compiled[i][0]) {
        const [t0, a] = compiled[i - 1], [t1, b] = compiled[i];
        return mixColor(a(ctx), b(ctx), def.gradient.ease === false ? (t - t0) / (t1 - t0 || 1) : smooth(t, t0, t1));
      }
      return compiled.at(-1)[1](ctx);
    };
  }
  if (def.grid) {
    const grid = def.grid, count = grid.cols * grid.rows;
    if (!(grid.cols >= 1 && grid.rows >= 1 && count <= 4096)) throw new Error('A grid needs cols and rows of at least 1, and at most 4096 cells');
    if (!grid.colors) {
      if (!grid.fit) throw new Error('A grid needs "colors", or "fit": true so fit_colors can measure them');
      return sub(grid.fallback ?? '#808080');
    }
    if (grid.colors.length !== count) throw new Error(`A ${grid.cols}x${grid.rows} grid needs ${count} colours, got ${grid.colors.length}`);
    const colors = grid.colors.map(c => parseColor(c, env.palette));
    return ctx => gridLookup(grid, colors, ctx.u, ctx.v, ctx.wrapU);
  }
  if (def.angle || def.facets) {
    // Colour by the azimuth the surface faces: 0 is toward +Z, 90 toward +X.
    const stops = (def.angle ?? def.facets).map(([a, c]) => [a, sub(c)]).sort((a, b) => a[0] - b[0]);
    if (def.facets) return ctx => { const a = azimuth(ctx.n); return stops.reduce((best, s) => angleGap(s[0], a) < angleGap(best[0], a) ? s : best)[1](ctx); };
    return ctx => {
      const a = azimuth(ctx.n);
      for (let i = 0; i < stops.length; i++) {
        const [a0, c0] = stops[i], [a1, c1] = stops[(i + 1) % stops.length], span = ((a1 - a0 + 360) % 360) || 360, t = ((a - a0 + 360) % 360) / span;
        if (t <= 1) return mixColor(c0(ctx), c1(ctx), t);
      }
      return stops[0][1](ctx);
    };
  }
  if (def.split) {
    const {axis = 'x', at = 0, soft = .02, below, above} = def.split, index = {x: 0, y: 1, z: 2}[axis], a = sub(below), b = sub(above);
    return ctx => { const t = index === undefined ? ctx[axis] : ctx.p[index]; return mixColor(a(ctx), b(ctx), smooth(t, at - soft, at + soft)); };
  }
  if (def.light) {
    const {from, lit, shade, wrap = .15, soft = .25} = def.light, direction = unit(from), a = sub(lit), b = sub(shade);
    return ctx => mixColor(b(ctx), a(ctx), smooth(dot(ctx.n, direction) + wrap, -soft, soft));
  }
  if (def.mix) {
    const [a, b, t] = def.mix, fa = sub(a), fb = sub(b);
    return ctx => mixColor(fa(ctx), fb(ctx), t);
  }
  if (def.tints) {
    const base = sub(def.tints.base), shapes = (def.tints.shapes ?? []).map(s => ({...s, field: sub(s.color)}));
    return ctx => shapes.reduce((color, s) => mixColor(color, s.field(ctx), shapeCoverage(s, ctx.u, ctx.v) * (s.strength ?? 1)), base(ctx));
  }
  throw new Error(`Unknown colour field: ${JSON.stringify(def).slice(0, 120)}. Use a colour, or one of ${FIELD_KEYS.join(', ')}`);
}

/** Visit every grid reachable from a field definition, following refs. */
export function visitGrids(def, env, visit, seen = new Set()) {
  if (typeof def === 'string') {
    if (env.fields && Object.hasOwn(env.fields, def) && !Object.hasOwn(env.palette ?? {}, def)) visitGrids(env.fields[def], env, visit, seen);
    return;
  }
  if (!def || typeof def !== 'object' || seen.has(def)) return;
  seen.add(def);
  if (Array.isArray(def)) { def.forEach(item => visitGrids(item, env, visit, seen)); return; }
  if (def.ref) { visitGrids(env.fields?.[def.ref], env, visit, seen); return; }
  if (def.grid) { visit(def.grid); visitGrids(def.grid.fallback, env, visit, seen); return; }
  Object.values(def).forEach(value => visitGrids(value, env, visit, seen));
}
