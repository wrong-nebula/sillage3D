/** Measure the tones of a reference image onto the fit grids of a spec.
 * Each grid cell takes the mean colour of the reference pixels that see it
 * through the spec's camera. The result is a small table of mixed tones per
 * surface, written into the spec: the image is never a texture at runtime. */
import {compileScene} from './build.js';
import {raycast} from './geometry.js';
import {visitGrids, parseColor, toHex} from './fields.js';

/** `image` is {width, height, data} with RGBA bytes, any resolution. */
export function fitColors(spec, image) {
  const fitted = structuredClone(spec), scene = compileScene(fitted), {camera, env, groups} = scene;
  const {width, height, data} = image, bindings = new Map(), cells = new Map();
  scene.objects.forEach(object => (object.spec.paint ?? []).forEach((layer, k) => {
    const wanted = layer.on === undefined || layer.on === '*' ? null : [layer.on].flat();
    const fields = [layer.color, ...(layer.accents ?? []).map(a => a.color)];
    fields.forEach(field => visitGrids(field, env, grid => {
      if (!grid.fit) return;
      if (!cells.has(grid)) cells.set(grid, {where: `${object.id}/${layer.name ?? k}`, samples: Array.from({length: grid.cols * grid.rows}, () => ({inner: [], edge: []}))});
      object.patches.forEach((patch, patchIndex) => {
        if (wanted && !wanted.includes(patch.name)) return;
        const key = `${object.index}/${patchIndex}`;
        if (!bindings.has(key)) bindings.set(key, new Set());
        bindings.get(key).add(grid);
      });
    }));
  }));
  if (!cells.size) return {spec: fitted, report: [], message: 'No grid has "fit": true, so nothing was measured.'};

  const hits = new Array(width * height), id = h => h ? h.objectIndex * 64 + h.patchIndex : -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) hits[y * width + x] = raycast(groups, camera.position, camera.ray((x + .5) / width, (y + .5) / height));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const hit = hits[y * width + x];
    if (!hit) continue;
    const grids = bindings.get(`${hit.objectIndex}/${hit.patchIndex}`);
    if (!grids) continue;
    // Pixels on a silhouette mix two surfaces: keep them as a last resort.
    const here = id(hit), edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < width && ny < height && id(hits[ny * width + nx]) !== here; });
    const k = (y * width + x) * 4, color = [data[k] / 255, data[k + 1] / 255, data[k + 2] / 255];
    for (const grid of grids) {
      const i = Math.min(grid.cols - 1, Math.max(0, Math.floor(hit.u * grid.cols))), j = Math.min(grid.rows - 1, Math.max(0, Math.floor(hit.v * grid.rows)));
      cells.get(grid).samples[j * grid.cols + i][edge ? 'edge' : 'inner'].push(color);
    }
  }

  const report = [];
  for (const [grid, {where, samples}] of cells) {
    const mean = list => list.reduce((s, c) => [s[0] + c[0], s[1] + c[1], s[2] + c[2]], [0, 0, 0]).map(v => v / list.length);
    const colors = samples.map(({inner, edge}) => {
      const list = inner.length >= 2 ? inner : [...inner, ...edge];
      if (!list.length) return null;
      // Drop outliers (a highlight, a stray dark line) before the final mean.
      const first = mean(list), distance = c => Math.hypot(c[0] - first[0], c[1] - first[1], c[2] - first[2]);
      const spread = Math.sqrt(list.reduce((s, c) => s + distance(c) ** 2, 0) / list.length), kept = list.filter(c => distance(c) <= 2 * spread + 1e-6);
      return mean(kept.length ? kept : list);
    });
    const seen = colors.filter(Boolean).length, fallback = grid.fallback !== undefined && typeof grid.fallback === 'string' ? (() => { try { return parseColor(grid.fallback, env.palette); } catch { return null; } })() : null;
    if (seen) {
      // Cells the camera never sees take their nearest measured neighbour,
      // or the authored fallback when they are far from anything measured.
      const filled = colors.map((color, index) => {
        if (color) return color;
        const i = index % grid.cols, j = Math.floor(index / grid.cols);
        let best = null, bestDistance = Infinity;
        colors.forEach((other, k) => { if (!other) return; const d = Math.hypot(k % grid.cols - i, Math.floor(k / grid.cols) - j); if (d < bestDistance) { bestDistance = d; best = other; } });
        return fallback && bestDistance > 1.5 ? fallback : best;
      });
      grid.colors = filled.map(toHex);
    }
    report.push({layer: where, grid: `${grid.cols}x${grid.rows}`, measured: seen, cells: colors.length});
  }
  return {spec: fitted, report};
}
