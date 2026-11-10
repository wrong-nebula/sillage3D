/** Atelier geometry: every primitive of a painting spec becomes one or more
 * parametric patches S(u,v) over the unit square. Strokes are laid in that
 * parametrization, and the same patches are tessellated for ray casting
 * (visibility, colour fitting, pixel-to-surface lookups). Pure JS, no Three. */

export const RAD = Math.PI / 180;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const unit = a => { const l = len(a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; };
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a || 1e-9)); return t * t * (3 - 2 * t); };
/** Unit vector at azimuth `a` degrees: 0 faces +Z (the viewer), 90 faces +X. */
export const around = a => [Math.sin(a * RAD), 0, Math.cos(a * RAD)];

/** Rotation by degrees about X, then Y, then Z (world axes), as three rows. */
export function rotation([x = 0, y = 0, z = 0] = []) {
  const [cx, sx, cy, sy, cz, sz] = [x, y, z].flatMap(v => [Math.cos(v * RAD), Math.sin(v * RAD)]);
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}
const rotate = (m, v) => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
function placement(object) {
  const m = rotation(object.rotation), position = object.position ?? [0, 0, 0];
  const scale = typeof object.scale === 'number' ? [object.scale, object.scale, object.scale] : object.scale ?? [1, 1, 1];
  return p => add(position, rotate(m, [p[0] * scale[0], p[1] * scale[1], p[2] * scale[2]]));
}

function catmull(points, t) {
  const n = points.length - 1, s = clamp(t) * n, i = Math.min(n - 1, Math.floor(s)), f = s - i;
  const q = j => points[clamp(j, 0, n)];
  const [a, b, c, d] = [q(i - 1), q(i), q(i + 1), q(i + 2)];
  return b.map((_, k) => .5 * (2 * b[k] + (c[k] - a[k]) * f + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * f * f + (3 * b[k] - a[k] - 3 * c[k] + d[k]) * f ** 3));
}
const rangeCells = (us, vs) => us.slice(0, -1).flatMap((u0, i) => vs.slice(0, -1).map((v0, j) => ({u0, u1: us[i + 1], v0, v1: vs[j + 1]})));
const steps = n => Array.from({length: n + 1}, (_, i) => i / n);

function planePatch(name, center, size, normal, up, place = p => p) {
  normal = unit(normal);
  let U = cross(up, normal);
  if (len(U) < 1e-6) U = cross([0, 0, -1], normal);
  if (len(U) < 1e-6) U = [1, 0, 0];
  U = unit(U);
  const V = unit(cross(normal, U));
  return {name, at: (u, v) => place(add(center, add(mul(U, (u - .5) * size[0]), mul(V, (v - .5) * size[1])))), nu: 1, nv: 1, cells: [{u0: 0, u1: 1, v0: 0, v1: 1}]};
}

/** Radius and height along a lathe profile at v in [0,1] (by arc length). */
function profileSampler(profile) {
  const lengths = [0];
  for (let i = 1; i < profile.length; i++) lengths.push(lengths[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const total = lengths.at(-1) || 1, stops = lengths.map(l => l / total);
  return {stops, at(v) {
    v = clamp(v);
    let i = 0;
    while (i < stops.length - 2 && v > stops[i + 1]) i++;
    const f = (v - stops[i]) / (stops[i + 1] - stops[i] || 1);
    return [profile[i][0] + (profile[i + 1][0] - profile[i][0]) * f, profile[i][1] + (profile[i + 1][1] - profile[i][1]) * f];
  }};
}
/** A point on an n-gon (or circle when sides is 0) of circumradius r. */
function ringPoint(u, r, h, sides, turn) {
  if (!sides) return [...mul(around(turn + 360 * u), r).map((v, i) => i === 1 ? h : v)];
  const s = (((u % 1) + 1) % 1) * sides, k = Math.min(sides - 1, Math.floor(s)), f = s - k;
  const a = around(turn + 360 * k / sides), b = around(turn + 360 * (k + 1) / sides);
  return [(a[0] + (b[0] - a[0]) * f) * r, h, (a[2] + (b[2] - a[2]) * f) * r];
}

const BUILDERS = {
  plane(o) {
    return [planePatch('face', o.center ?? [0, 0, 0], o.size, o.normal ?? [0, 0, 1], o.up ?? [0, 1, 0])];
  },
  quad(o) {
    const [bl, br, tr, tl] = o.points;
    return [{name: 'face', at: (u, v) => lerp(lerp(bl, br, u), lerp(tl, tr, u), v), nu: 1, nv: 1, cells: [{u0: 0, u1: 1, v0: 0, v1: 1}]}];
  },
  polygon(o) {
    const points = o.points, n = points.length, centre = mul(points.reduce(add), 1 / n);
    const rim = u => { const s = (((u % 1) + 1) % 1) * n, k = Math.min(n - 1, Math.floor(s)); return lerp(points[k], points[(k + 1) % n], s - k); };
    return [{name: 'face', at: (u, v) => lerp(centre, rim(u >= 1 ? .999999 : u), v), nu: n, nv: 1, cells: rangeCells(steps(n), [0, 1]), fan: true}];
  },
  box(o) {
    const [x, y, z] = o.size.map(v => v / 2), place = placement({...o, position: o.center ?? o.position});
    return [
      planePatch('front', [0, 0, z], [o.size[0], o.size[1]], [0, 0, 1], [0, 1, 0], place),
      planePatch('back', [0, 0, -z], [o.size[0], o.size[1]], [0, 0, -1], [0, 1, 0], place),
      planePatch('right', [x, 0, 0], [o.size[2], o.size[1]], [1, 0, 0], [0, 1, 0], place),
      planePatch('left', [-x, 0, 0], [o.size[2], o.size[1]], [-1, 0, 0], [0, 1, 0], place),
      planePatch('top', [0, y, 0], [o.size[0], o.size[2]], [0, 1, 0], [0, 0, -1], place),
      planePatch('bottom', [0, -y, 0], [o.size[0], o.size[2]], [0, -1, 0], [0, 0, 1], place),
    ];
  },
  lathe(o) {
    let profile = o.profile;
    if (o.smooth) profile = steps((profile.length - 1) * 6).map(t => catmull(profile, t));
    const sides = o.sides >= 3 ? Math.round(o.sides) : 0, turn = o.turn ?? 0, place = placement(o), sampler = profileSampler(profile);
    const us = steps(sides || 1), patches = [{
      name: 'side', wrapU: true, round: !sides, nu: sides || 40, vs: sampler.stops,
      at: (u, v) => { const [r, h] = sampler.at(v); return place(ringPoint(u, r, h, sides, turn)); },
      inner: (u, v) => place([0, sampler.at(v)[1], 0]),
      cells: rangeCells(us, sampler.stops),
    }];
    const caps = o.caps ?? 'none';
    for (const [name, [r, h], flip] of [['top', profile.at(-1), false], ['bottom', profile[0], true]]) {
      if (r < 1e-6 || !(caps === 'both' || caps === name)) continue;
      // v runs centre to rim; the bottom cap winds the other way to face down.
      patches.push({name, wrapU: true, round: !sides, fan: true, nu: sides || 40, nv: 1,
        at: (u, v) => place(ringPoint(flip ? 1 - u : u, r * v, h, sides, turn)), cells: rangeCells(us, [0, 1])});
    }
    return patches;
  },
  sphere(o) {
    const radii = o.radii ?? [o.radius, o.radius, o.radius], place = placement({...o, position: o.center ?? o.position});
    return [{name: 'surface', wrapU: true, round: true, nu: 32, nv: 16, volume: o.type === 'blob',
      at: (u, v) => { const lat = (v - .5) * 180 * RAD, a = around(360 * u + (o.turn ?? 0)); return place([a[0] * Math.cos(lat) * radii[0], Math.sin(lat) * radii[1], a[2] * Math.cos(lat) * radii[2]]); },
      inner: () => place([0, 0, 0]), cells: rangeCells([0, 1], [0, 1])}];
  },
  tube(o) {
    const path = o.path, n = path.length - 1, place = placement(o), flat = o.flat ?? 1;
    const radius = v => { if (!Array.isArray(o.radius)) return o.radius; const s = clamp(v) * n, i = Math.min(n - 1, Math.floor(s)); return o.radius[i] + (o.radius[i + 1] - o.radius[i]) * (s - i); };
    const frame = v => {
      const centre = catmull(path, v), tangent = unit(sub(catmull(path, Math.min(1, v + .01)), catmull(path, Math.max(0, v - .01))));
      // The wide axis lies in the curve's plane unless the spec names one.
      let wide = o.wide ? sub(o.wide, mul(tangent, dot(o.wide, tangent))) : cross(tangent, [0, 0, 1]);
      if (len(wide) < 1e-4) wide = cross(tangent, [1, 0, 0]);
      wide = unit(wide);
      return {centre, wide, thin: unit(cross(wide, tangent))};
    };
    return [{name: 'side', wrapU: true, round: true, nu: 10, nv: n * 4,
      at: (u, v) => { const f = frame(v), r = radius(v), a = 360 * u * RAD; return place(add(f.centre, add(mul(f.wide, Math.cos(a) * r), mul(f.thin, Math.sin(a) * r * flat)))); },
      inner: (u, v) => place(frame(v).centre), cells: rangeCells([0, 1], steps(n))}];
  },
};
BUILDERS.blob = BUILDERS.sphere;
export const OBJECT_TYPES = Object.keys(BUILDERS);

/** Position, unit tangents and outward normal of a patch at (u,v). */
export function frameAt(patch, u, v) {
  const e = 1e-3, p = patch.at(u, v);
  const u0 = patch.wrapU ? u - e : Math.max(0, u - e), u1 = patch.wrapU ? u + e : Math.min(1, u + e);
  // Fans collapse at v = 0; take the tangents a little way out.
  const vv = patch.fan ? Math.max(v, .02) : v, v0 = Math.max(0, vv - e), v1 = Math.min(1, vv + e);
  const su = mul(sub(patch.at(u1, vv), patch.at(u0, vv)), 1 / (u1 - u0)), sv = mul(sub(patch.at(u, v1), patch.at(u, v0)), 1 / (v1 - v0));
  let n = cross(su, sv);
  if (len(n) < 1e-12) n = [0, 0, 1];
  n = unit(n);
  // Fans wind against their normal; closed shapes face away from their axis.
  if (patch.inner ? dot(n, sub(p, patch.inner(u, v))) < 0 : patch.fan) n = mul(n, -1);
  return {p, n, tu: unit(su), tv: unit(sv), su: len(su), sv: len(sv)};
}

export function buildPatches(object) {
  const build = BUILDERS[object.type];
  if (!build) throw new Error(`Unknown object type "${object.type}"`);
  return build(object);
}

/** Camera helper: normalized image coordinates run 0..1 from the top left. */
export function cameraModel({position, target, fov}, aspect = 1) {
  const forward = unit(sub(target, position));
  let right = cross(forward, [0, 1, 0]);
  if (len(right) < 1e-6) right = [1, 0, 0];
  right = unit(right);
  const up = cross(right, forward), tan = Math.tan(fov * RAD / 2);
  return {position, forward, right, up,
    ray(x, y) { return unit(add(forward, add(mul(right, (x * 2 - 1) * tan * aspect), mul(up, (1 - y * 2) * tan)))); },
    project(p) { const v = sub(p, position), z = dot(v, forward); return {x: (dot(v, right) / (z * tan * aspect) + 1) / 2, y: (1 - dot(v, up) / (z * tan)) / 2, depth: z}; },
  };
}

/** Triangle soup over all patches, with a bounding sphere per object. */
export function tessellate(objects) {
  const groups = [];
  objects.forEach((object, objectIndex) => {
    const triangles = [];
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    object.patches.forEach((patch, patchIndex) => {
      const us = patch.us ?? steps(patch.nu), vs = patch.vs ?? steps(patch.nv);
      const grid = vs.map(v => us.map(u => patch.at(u, v)));
      for (let j = 0; j < vs.length - 1; j++) for (let i = 0; i < us.length - 1; i++) {
        const corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => ({p: grid[b][a], uv: [us[a], vs[b]]}));
        for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
          const e1 = sub(corners[b].p, corners[a].p), e2 = sub(corners[c].p, corners[a].p);
          if (len(cross(e1, e2)) < 1e-12) continue;
          triangles.push({p: corners[a].p, e1, e2, uv: [corners[a].uv, corners[b].uv, corners[c].uv], patchIndex});
        }
        for (const {p} of corners) { min = min.map((v, k) => Math.min(v, p[k])); max = max.map((v, k) => Math.max(v, p[k])); }
      }
    });
    const centre = lerp(min, max, .5);
    groups.push({objectIndex, triangles, centre, radius: len(sub(max, centre)) + 1e-6});
  });
  return groups;
}

/** Nearest hit along a ray: {t, objectIndex, patchIndex, u, v} or null. */
export function raycast(groups, origin, dir, maxT = Infinity) {
  let best = null;
  for (const group of groups) {
    const oc = sub(group.centre, origin), along = dot(oc, dir), d2 = dot(oc, oc) - along * along;
    if (d2 > group.radius * group.radius || along + group.radius < 0 || along - group.radius > (best?.t ?? maxT)) continue;
    for (const tri of group.triangles) {
      const h = cross(dir, tri.e2), det = dot(tri.e1, h);
      if (Math.abs(det) < 1e-12) continue;
      const s = sub(origin, tri.p), a = dot(s, h) / det;
      if (a < 0 || a > 1) continue;
      const q = cross(s, tri.e1), b = dot(dir, q) / det;
      if (b < 0 || a + b > 1) continue;
      const t = dot(tri.e2, q) / det;
      if (t < 1e-6 || t > (best?.t ?? maxT)) continue;
      const w = 1 - a - b;
      best = {t, objectIndex: group.objectIndex, patchIndex: tri.patchIndex,
        u: tri.uv[0][0] * w + tri.uv[1][0] * a + tri.uv[2][0] * b, v: tri.uv[0][1] * w + tri.uv[1][1] * a + tri.uv[2][1] * b};
    }
  }
  return best;
}
