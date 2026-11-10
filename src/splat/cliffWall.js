import {MathUtils} from 'three';

const {clamp, lerp, smoothstep} = MathUtils;

const BEDS = [
  {y: 12.8, rise: .92, x: -23, reach: 26, depth: .72},
  {y: 19.4, rise: 1.15, x: 13, reach: 34, depth: 1.2},
  {y: 27.8, rise: 1.22, x: -13, reach: 25, depth: .8},
  {y: 34.7, rise: 1.04, x: 25, reach: 25, depth: .95},
];
const JOINTS = [-36.5, -25, -17.3, -8.9, 1.7, 7.6, 18.9, 26.7, 39];
const SEAMS = [
  {y: 17.2, dip: -.42, x: -23, reach: 12},
  {y: 26.7, dip: .31, x: 4.8, reach: 14},
  {y: 31.1, dip: -.38, x: 25, reach: 13},
];
const LIMESTONE = [.625, .555, .485];
const MUDSTONE = [.46, .445, .465];
const FRESH = [.70, .62, .52];
const WEATHERED = [.475, .443, .42];

function interval(value, start, end, fade) {
  return smoothstep(value, start, start + fade) * (1 - smoothstep(value, end - fade, end));
}

function strataHeight(x, y, z) {
  const fault = .78 * smoothstep(x + .26 * z, -6, -4.2);
  return y - .057*x + .12*z - .61*Math.sin(x*.091 + z*.12) - fault;
}

function stoneColor(x, y, z) {
  const level = strataHeight(x, y, z);
  const band = .49 + .27 * Math.sin(level * .54) + .11 * Math.sin(level * 1.12 + z * .19);
  return MUDSTONE.map((channel, c) => lerp(channel, LIMESTONE[c], band));
}

function scar(x, y, z, originX, originY, width, height, lean) {
  const v = (y - originY) / height;
  const u = (x - originX + .16*z) / width - v * lean;
  const distance = Math.max(u + .26*v, -u - .22*v, v + .29*u, -.94*v + .10*u,
    .68*u + .87*v, -.78*u - .73*v);
  const chips = .025 * Math.sin(x * 2.8 - y * 1.7 + z * .41);
  return 1 - smoothstep(distance + chips, .68, 1.02);
}

function wallRelief(x, y, z) {
  const level = strataHeight(x, y, z);
  let offset = 0, under = 0, seam = 0, damp = 0;
  for (const bed of BEDS) {
    const interruption = smoothstep(Math.sin(x * .37 + bed.y * .44 + z * .32)
      + .52 * Math.sin(x * .72 - bed.y - z * .2), -.67, .85);
    const lateral = (1 - smoothstep(Math.abs(x - bed.x), bed.reach * .43, bed.reach)) * interruption;
    const d = level - bed.y + .16 * Math.sin(x * .81 + z * .78 + bed.y);
    const shelf = interval(d, -.26, .98 + .57 * interruption, .24);
    const recess = interval(d, -1.32 * bed.depth, -.21, .32);
    offset += lateral * bed.rise * (shelf - .31 * recess);
    under = Math.max(under, lateral * recess);
  }

  // These planes intersect the terrain in three dimensions, so a joint
  // turns with the face and moves across a bed as the slope recedes.
  for (let i = 0; i < JOINTS.length; i++) {
    const dip = i % 3 === 1 ? -.17 : .13;
    const u = x - dip*(y-23) + (i % 2 ? -.25 : .36)*z;
    const wander = .18 * Math.sin(y * .37 + z * .25 + i) + .09 * Math.cos(y * .92 - z * .51);
    const d = Math.abs(u - JOINTS[i] + wander);
    const active = interval(y, 10 + i % 4 * 2.3, 30.5 + i % 3 * 4.1, 3.7);
    const cut = active * (1 - smoothstep(d, .07, .26 + (i % 3) * .1));
    offset -= cut * (.39 + (i % 3) * .19);
    seam = Math.max(seam, cut);
    if (i % 3 === 0) {
      damp = Math.max(damp, interval(y, 8.9, 23 + i * .43, 4.2)
        * (1 - smoothstep(d, .15, .62 + .16 * Math.sin(y * .55))) * .67);
    }
  }
  for (const joint of SEAMS) {
    const d = Math.abs(y - joint.y - (x - joint.x) * joint.dip + .20*z + .13*Math.sin(x*.91 + z*.41));
    const extent = 1 - smoothstep(Math.abs(x-joint.x), joint.reach * .48, joint.reach);
    const cut = extent * (1 - smoothstep(d, .09, .32));
    offset -= cut * .39;
    seam = Math.max(seam, cut * .79);
  }

  const fresh = scar(x, y, z, -10, 26.2, 4.7, 4.4, -.23);
  const old = scar(x, y, z, 13.2, 17.8, 4.8, 3.3, .23);
  const cutPlane = -16.4 - .27*(y-26.2) + .20*(x+8);
  const cut = fresh * clamp(z - cutPlane, .25, 1.82);
  offset -= cut + old * (.63 + .16 * Math.cos(x * .67 + y));
  const facet = Math.sin(x * 1.21 + y * .48 + z * .95) * Math.cos(y * 1.06 - x * .53 + z * 1.5);
  const grain = Math.sin(x * 5.3 - y * 2.7 + z * 3.2) * Math.cos(y * 4.1 + x * 1.4 + z * .9);
  offset += .071 * facet + .026 * grain;
  return {offset, under, seam, damp, fresh, old, facet};
}

export function cliffExposure(y, gx, gz) {
  return smoothstep(y, 7, 15) * smoothstep(-gz, .43, 1.43)
    * smoothstep(Math.hypot(gx, gz), .85, 2.25);
}

export function cliffSurface(x, y, z, gx, gz, detail, runoff, out) {
  if (detail === 0) {
    out.set(x, y, z);
    return null;
  }
  const relief = wallRelief(x, y, z);
  const slope = Math.hypot(gx, gz);
  // Small channels cut the same surface that carries the beds and scars.
  relief.rill = runoff;
  relief.damp = Math.max(relief.damp, runoff * .67);
  const depth = (relief.offset - .51 * runoff) * detail / slope;
  out.set(x - gx * depth, y, z - gz * depth);
  return relief;
}

export function cliffSurfaceColor(x, y, z, relief, detail, host, diffuse, seed) {
  const bed = stoneColor(x, y, z);
  const light = .69 + .43 * diffuse - .11 * relief.under - .14 * relief.seam - .11 * relief.damp - .13 * relief.rill;
  const tint = .018 * relief.facet + (seed - .5) * .047;
  return host.map((channel, c) => {
    const stone = lerp(channel, bed[c], .46);
    const pigment = lerp(lerp(stone, WEATHERED[c], relief.old * .47), FRESH[c], relief.fresh * .62);
    return clamp((pigment + tint) * lerp(.69 + .43 * diffuse, light, detail), 0, 1);
  });
}

export function talusProvenance(x, seed, host) {
  const influence = 1 - smoothstep(Math.abs(x), 32, 50);
  const bed = stoneColor(x, 12 + 25 * seed, -11);
  const fresh = (1 - smoothstep(Math.abs(x + 8.6), 2, 10)) * smoothstep(seed, .63, .88);
  const old = (1 - smoothstep(Math.abs(x - 13.8), 3, 12)) * (1 - smoothstep(seed, .33, .54));
  return host.map((channel, c) => lerp(channel, lerp(lerp(bed[c], FRESH[c], fresh * .60),
    WEATHERED[c], old * .47), influence * .50));
}
