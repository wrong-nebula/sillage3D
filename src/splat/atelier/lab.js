/** Atelier lab: the measuring instruments a painter-agent uses on a reference
 * image and on its own renders. Browser-only (canvas 2D). All coordinates are
 * normalized image coordinates: x and y run 0..1 from the top-left corner. */
import {compileScene} from './build.js';
import {fitColors} from './fit.js';
import {raycast, frameAt} from './geometry.js';
import {toHex} from './fields.js';

const WHOLE = [0, 0, 1, 1];
const TINTS = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#b8f35d', '#ff9f1c', '#c77dff', '#80ffdb', '#fefae0'];

export async function loadImage(url) {
  const image = new Image();
  image.decoding = 'sync'; image.src = url;
  await image.decode();
  return image;
}
function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height));
  return [canvas, canvas.getContext('2d', {willReadFrequently: true})];
}
/** RGBA pixels of a region of an image, resampled to width x height. */
function pixels(image, [x0, y0, x1, y1] = WHOLE, width, height) {
  const [canvas, ctx] = canvasOf(width, height), w = image.naturalWidth ?? image.width, h = image.naturalHeight ?? image.height;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, x0 * w, y0 * h, (x1 - x0) * w, (y1 - y0) * h, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
function fitSize(image, [x0, y0, x1, y1], size) {
  const w = (x1 - x0) * (image.naturalWidth ?? image.width), h = (y1 - y0) * (image.naturalHeight ?? image.height), scale = size / Math.max(w, h);
  return [Math.round(w * scale), Math.round(h * scale)];
}

/** Ruler ticks with normalized-coordinate labels along the top and left. */
function drawRuler(ctx, [x0, y0, x1, y1], left, top, width, height, lines = true) {
  const span = Math.max(x1 - x0, y1 - y0), step = span > .6 ? .1 : span > .3 ? .05 : span > .12 ? .02 : .01, digits = step < .1 ? 2 : 1;
  ctx.save();
  ctx.font = '10px ui-monospace, Menlo, monospace'; ctx.textBaseline = 'top'; ctx.lineWidth = 1;
  const label = (text, x, y) => { ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(x - 1, y - 1, ctx.measureText(text).width + 3, 12); ctx.fillStyle = '#fff'; ctx.fillText(text, x, y); };
  for (let k = Math.ceil(x0 / step - 1e-6); k * step <= x1 + 1e-6; k++) {
    const x = left + (k * step - x0) / (x1 - x0) * width;
    if (lines) { ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.moveTo(x + .5, top); ctx.lineTo(x + .5, top + height); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.moveTo(x + 1.5, top); ctx.lineTo(x + 1.5, top + height); ctx.stroke(); }
    if (x > left + 4 && x < left + width - 18) label((k * step).toFixed(digits), x + 2, top + 2);
  }
  for (let k = Math.ceil(y0 / step - 1e-6); k * step <= y1 + 1e-6; k++) {
    const y = top + (k * step - y0) / (y1 - y0) * height;
    if (lines) { ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.moveTo(left, y + .5); ctx.lineTo(left + width, y + .5); ctx.stroke(); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.moveTo(left, y + 1.5); ctx.lineTo(left + width, y + 1.5); ctx.stroke(); }
    if (y > top + 14 && y < top + height - 12) label((k * step).toFixed(digits), left + 2, y + 2);
  }
  ctx.restore();
}

// ---- colour science -------------------------------------------------------
const linear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
function toLab(r, g, b) {
  r = linear(r); g = linear(g); b = linear(b);
  const f = t => t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const x = f((.4124 * r + .3576 * g + .1805 * b) / .95047), y = f(.2126 * r + .7152 * g + .0722 * b), z = f((.0193 * r + .1192 * g + .9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function labPlanes(data) {
  const n = data.width * data.height, L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) [L[i], A[i], B[i]] = toLab(data.data[i * 4] / 255, data.data[i * 4 + 1] / 255, data.data[i * 4 + 2] / 255);
  return {L, A, B};
}
function boxBlur(source, width, height, radius) {
  if (radius < 1) return source;
  let from = source;
  for (const [stride, count, lines, lineStride] of [[1, width, height, width], [width, height, width, 1]]) {
    const out = new Float32Array(from.length);
    for (let line = 0; line < lines; line++) {
      let sum = 0, n = 0;
      for (let k = -radius; k < count + radius; k++) {
        const enter = k + radius, leave = k - radius - 1;
        if (enter < count) { sum += from[line * lineStride + enter * stride]; n++; }
        if (leave >= 0) { sum -= from[line * lineStride + leave * stride]; n--; }
        if (k >= 0 && k < count) out[line * lineStride + k * stride] = sum / n;
      }
    }
    from = out;
  }
  return from;
}
const rms = values => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
const difference = (a, b) => a.map((v, i) => v - b[i]);
function sobel(L, width, height) {
  const out = new Float32Array(L.length), at = (x, y) => L[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
    const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
    out[y * width + x] = Math.hypot(gx, gy);
  }
  return out;
}
function correlation(a, b) {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let ab = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
  return ab / (Math.sqrt(aa * bb) || 1);
}

/** Numbers that say how far a render is from the reference, split into
 * colour (are the tones right, where), drawing (are the edges in place) and
 * handling (is the brushwork as busy at each scale). */
export function measure(reference, render, region = WHOLE) {
  const [w, h] = fitSize(reference, region, 192), a = pixels(reference, region, w, h), b = pixels(render, region, w, h);
  const A = labPlanes(a), B = labPlanes(b), n = w * h, blur = (p, r) => boxBlur(p, w, h, r);
  const lowA = {L: blur(A.L, 3), A: blur(A.A, 3), B: blur(A.B, 3)}, lowB = {L: blur(B.L, 3), A: blur(B.A, 3), B: blur(B.B, 3)};
  const deltaLow = new Float32Array(n);
  let raw = 0;
  for (let i = 0; i < n; i++) {
    deltaLow[i] = Math.hypot(lowA.L[i] - lowB.L[i], lowA.A[i] - lowB.A[i], lowA.B[i] - lowB.B[i]);
    raw += Math.hypot(A.L[i] - B.L[i], A.A[i] - B.A[i], A.B[i] - B.B[i]) / n;
  }
  const toneError = deltaLow.reduce((s, v) => s + v, 0) / n;
  // Where the tones are off: a 5x5 table, and the worst cells with both colours.
  const N = 5, table = [], cells = [];
  for (let j = 0; j < N; j++) {
    const row = [];
    for (let i = 0; i < N; i++) {
      let sum = 0, count = 0; const ca = [0, 0, 0], cb = [0, 0, 0];
      for (let y = Math.floor(j * h / N); y < Math.floor((j + 1) * h / N); y++) for (let x = Math.floor(i * w / N); x < Math.floor((i + 1) * w / N); x++) {
        const k = y * w + x; sum += deltaLow[k]; count++;
        for (let c = 0; c < 3; c++) { ca[c] += a.data[k * 4 + c] / 255; cb[c] += b.data[k * 4 + c] / 255; }
      }
      const value = sum / count; row.push(Math.round(value * 10) / 10);
      const cx = region[0] + (region[2] - region[0]) * (i + .5) / N, cy = region[1] + (region[3] - region[1]) * (j + .5) / N;
      cells.push({at: [Math.round(cx * 100) / 100, Math.round(cy * 100) / 100], deltaE: Math.round(value * 10) / 10, reference: toHex(ca.map(v => v / count)), render: toHex(cb.map(v => v / count))});
    }
    table.push(row);
  }
  const band = (P, r0, r1) => rms(difference(r0 ? blur(P.L, r0) : P.L, blur(P.L, r1)));
  const ratio = (x, y) => Math.round((y / Math.max(x, .05)) * 100) / 100;
  const detail = {fine: ratio(band(A, 0, 1), band(B, 0, 1)), medium: ratio(band(A, 1, 4), band(B, 1, 4)), coarse: ratio(band(A, 4, 12), band(B, 4, 12))};
  const edges = correlation(sobel(blur(A.L, 1), w, h), sobel(blur(B.L, 1), w, h));
  const meanOf = p => p.reduce((s, v) => s + v, 0) / n, chroma = P => { let s = 0; for (let i = 0; i < n; i++) s += Math.hypot(P.A[i], P.B[i]); return s / n; };
  const std = p => { const m = meanOf(p); return Math.sqrt(p.reduce((s, v) => s + (v - m) ** 2, 0) / n); };
  const handling = 1 - Math.min(1, Object.values(detail).reduce((s, r) => s + Math.abs(Math.log2(Math.max(r, .01))), 0) / 3 / 1.5);
  const colour = Math.max(0, 1 - toneError / 22), drawing = Math.max(0, edges);
  return {
    score: Math.round((colour * .5 + drawing * .3 + handling * .2) * 1000) / 10,
    colour: Math.round(colour * 100), drawing: Math.round(drawing * 100), handling: Math.round(handling * 100),
    toneError: Math.round(toneError * 100) / 100, pixelError: Math.round(raw * 100) / 100,
    lightness: Math.round((meanOf(B.L) - meanOf(A.L)) * 10) / 10, chroma: ratio(chroma(A), chroma(B)), contrast: ratio(std(A.L), std(B.L)),
    detail, toneErrorTable: table, worst: cells.sort((p, q) => q.deltaE - p.deltaE).slice(0, 6),
  };
}

export function createLab(reference) {
  const lab = {
    size: {width: reference.naturalWidth, height: reference.naturalHeight, aspect: reference.naturalWidth / reference.naturalHeight},

    /** The reference (or a zoomed region of it) with a coordinate ruler. */
    view({region = WHOLE, size = 768, grid = true} = {}) {
      const [w, h] = fitSize(reference, region, size), [canvas, ctx] = canvasOf(w, h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(reference, region[0] * reference.naturalWidth, region[1] * reference.naturalHeight, (region[2] - region[0]) * reference.naturalWidth, (region[3] - region[1]) * reference.naturalHeight, 0, 0, w, h);
      if (grid) drawRuler(ctx, region, 0, 0, w, h);
      return canvas.toDataURL('image/png');
    },

    /** Mean colour in a small disc around each point. */
    sample(points, radius = .008) {
      const W = Math.min(512, reference.naturalWidth), H = Math.round(W / lab.size.aspect), data = pixels(reference, WHOLE, W, H), r = Math.max(1, Math.round(radius * W));
      return points.map(([x, y]) => {
        const sum = [0, 0, 0]; let count = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const px = Math.round(x * W) + dx, py = Math.round(y * H) + dy;
          if (dx * dx + dy * dy > r * r || px < 0 || py < 0 || px >= W || py >= H) continue;
          for (let c = 0; c < 3; c++) sum[c] += data.data[(py * W + px) * 4 + c] / 255;
          count++;
        }
        return {at: [x, y], color: count ? toHex(sum.map(v => v / count)) : null};
      });
    },

    /** Dominant colours of a region with their share of its area. */
    palette({region = WHOLE, colors = 8} = {}) {
      const data = pixels(reference, region, 72, 72), points = [];
      for (let i = 0; i < data.width * data.height; i++) points.push([data.data[i * 4] / 255, data.data[i * 4 + 1] / 255, data.data[i * 4 + 2] / 255]);
      const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
      // Farthest-point seeding keeps small accents from being averaged away.
      const centres = [points[0]];
      while (centres.length < colors) centres.push(points.reduce((best, p) => { const d = Math.min(...centres.map(c => d2(p, c))); return d > best.d ? {p, d} : best; }, {p: points[0], d: -1}).p);
      let counts = [];
      for (let pass = 0; pass < 10; pass++) {
        const sums = centres.map(() => [0, 0, 0]); counts = centres.map(() => 0);
        for (const p of points) { let k = 0; for (let c = 1; c < centres.length; c++) if (d2(p, centres[c]) < d2(p, centres[k])) k = c; counts[k]++; for (let c = 0; c < 3; c++) sums[k][c] += p[c]; }
        centres.forEach((_, k) => { if (counts[k]) centres[k] = sums[k].map(v => v / counts[k]); });
      }
      return centres.map((c, k) => ({color: toHex(c), share: Math.round(counts[k] / points.length * 1000) / 10})).filter(c => c.share > 0).sort((a, b) => b.share - a.share);
    },

    /** What lies under image points: object, patch, patch (u,v) and world position. */
    locate(spec, points) {
      const scene = compileScene(spec);
      return points.map(([x, y]) => {
        const hit = raycast(scene.groups, scene.camera.position, scene.camera.ray(x, y));
        if (!hit) return {at: [x, y], object: null};
        const object = scene.objects[hit.objectIndex], patch = object.patches[hit.patchIndex], world = frameAt(patch, hit.u, hit.v).p;
        return {at: [x, y], object: object.id, patch: patch.name, uv: [hit.u, hit.v].map(v => Math.round(v * 1000) / 1000), world: world.map(v => Math.round(v * 1000) / 1000)};
      });
    },
    /** Where world points land in the image. */
    project(spec, points) {
      const scene = compileScene(spec);
      return points.map(p => { const q = scene.camera.project(p); return {world: p, at: [Math.round(q.x * 1000) / 1000, Math.round(q.y * 1000) / 1000], inFront: q.depth > 0}; });
    },

    /** The spec's geometry drawn as coloured wireframe over the dimmed
     * reference: the fast way to line up camera and shapes before painting. */
    overlay(spec, {region = WHOLE, size = 768} = {}) {
      const scene = compileScene(spec), [w, h] = fitSize(reference, region, size), [canvas, ctx] = canvasOf(w, h);
      ctx.drawImage(reference, region[0] * reference.naturalWidth, region[1] * reference.naturalHeight, (region[2] - region[0]) * reference.naturalWidth, (region[3] - region[1]) * reference.naturalHeight, 0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillRect(0, 0, w, h);
      const toCanvas = p => { const q = scene.camera.project(p); return q.depth > 1e-3 ? [(q.x - region[0]) / (region[2] - region[0]) * w, (q.y - region[1]) / (region[3] - region[1]) * h] : null; };
      const summary = [];
      scene.objects.forEach((object, index) => {
        const tint = TINTS[index % TINTS.length], box = [Infinity, Infinity, -Infinity, -Infinity];
        ctx.strokeStyle = tint; ctx.lineWidth = 1.25;
        const line = at => {
          ctx.beginPath(); let pen = false;
          for (let k = 0; k <= 24; k++) {
            const world = at(k / 24), c = toCanvas(world);
            if (!c) { pen = false; continue; }
            const q = scene.camera.project(world);
            box[0] = Math.min(box[0], q.x); box[1] = Math.min(box[1], q.y); box[2] = Math.max(box[2], q.x); box[3] = Math.max(box[3], q.y);
            if (pen) ctx.lineTo(c[0], c[1]); else ctx.moveTo(c[0], c[1]); pen = true;
          }
          ctx.stroke();
        };
        for (const patch of object.patches) {
          const us = new Set(), vs = new Set();
          for (const cell of patch.cells) { us.add(cell.u0); us.add(cell.u1); vs.add(cell.v0); vs.add(cell.v1); }
          if (patch.round) for (let k = 0; k < 8; k++) us.add(k / 8);
          for (const u of us) line(t => patch.at(u, t));
          for (const v of vs) line(t => patch.at(t, v));
        }
        const cx = ((box[0] + box[2]) / 2 - region[0]) / (region[2] - region[0]) * w, cy = ((box[1] + box[3]) / 2 - region[1]) / (region[3] - region[1]) * h;
        if (Number.isFinite(cx)) {
          ctx.font = 'bold 11px ui-monospace, Menlo, monospace'; const tw = ctx.measureText(object.id).width;
          const lx = Math.min(w - tw - 4, Math.max(2, cx - tw / 2)), ly = Math.min(h - 14, Math.max(14, cy));
          ctx.fillStyle = 'rgba(0,0,0,.8)'; ctx.fillRect(lx - 2, ly - 10, tw + 4, 13); ctx.fillStyle = tint; ctx.fillText(object.id, lx, ly);
        }
        summary.push({object: object.id, type: object.spec.type, patches: object.patches.map(p => p.name), imageBox: box.map(v => Math.round(v * 1000) / 1000)});
      });
      drawRuler(ctx, region, 0, 0, w, h, false);
      return {image: canvas.toDataURL('image/png'), objects: summary};
    },

    /** Measure every `fit: true` grid of the spec from the reference. */
    fit(spec, {size = 256} = {}) {
      const [w, h] = fitSize(reference, WHOLE, size);
      return fitColors(spec, pixels(reference, WHOLE, w, h));
    },

    /** Reference, render and their difference side by side, plus the numbers. */
    async compare(renderURL, {region = WHOLE, size = 400} = {}) {
      const render = await loadImage(renderURL), [w, h] = fitSize(reference, region, size), gap = 8, head = 18, [canvas, ctx] = canvasOf(w * 3 + gap * 2, h + head);
      ctx.fillStyle = '#16181c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = '11px ui-monospace, Menlo, monospace'; ctx.fillStyle = '#d8dce2'; ctx.textBaseline = 'middle';
      ['reference', 'render', 'difference (bright = far off)'].forEach((text, i) => ctx.fillText(text, i * (w + gap) + 4, head / 2));
      const a = pixels(reference, region, w, h), b = pixels(render, region, w, h), diff = ctx.createImageData(w, h);
      for (let i = 0; i < w * h; i++) {
        const la = toLab(a.data[i * 4] / 255, a.data[i * 4 + 1] / 255, a.data[i * 4 + 2] / 255), lb = toLab(b.data[i * 4] / 255, b.data[i * 4 + 1] / 255, b.data[i * 4 + 2] / 255);
        const t = Math.min(1, Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]) / 40);
        diff.data.set([255 * Math.min(1, t * 2.2), 255 * Math.max(0, t * 2 - .7), 255 * Math.max(0, t * 3 - 2), 255], i * 4);
      }
      ctx.putImageData(a, 0, head); ctx.putImageData(b, w + gap, head); ctx.putImageData(diff, 2 * (w + gap), head);
      for (let i = 0; i < 3; i++) drawRuler(ctx, region, i * (w + gap), head, w, h, false);
      return {image: canvas.toDataURL('image/png'), metrics: measure(reference, render, region)};
    },
  };
  return lab;
}
