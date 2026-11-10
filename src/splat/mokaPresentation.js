import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {mokaStillScene} from './mokaStill.js';

const canvas = document.querySelector('canvas');
const reference = document.querySelector('#reference');
let engine, raf, closed = false, ready = false, lastRender = -Infinity;

function resize() { if (engine) engine.resize(canvas.clientWidth, canvas.clientHeight); }
function fail(error) { console.error(error); cancelAnimationFrame(raf); document.querySelector('#error').hidden = false; }
function frame(now) {
  if (closed) return;
  raf = requestAnimationFrame(frame);
  if (!ready || document.hidden || !engine.needsFrame || now - lastRender < 1000 / 30) return;
  try { if (engine.gpuReady() && engine.render(now)) lastRender = now; } catch (error) { fail(error); }
}
// The reference wipes in from the right edge, following the pointer.
function setWipe(x) {
  const box = canvas.getBoundingClientRect();
  reference.style.setProperty('--wipe', `${Math.round(100 * Math.min(1, Math.max(0, (x - box.left) / box.width)))}%`);
}
async function boot() {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  engine = new GaussianBrushRenderer(canvas, {sceneDefinitions: [mokaStillScene]});
  engine.load(0);
  Object.assign(engine.options, mokaStillScene.initialStyle);
  engine.applyStyle();
  resize();
  window.moka = {engine, ready: true, splats: engine.stats.count,
    async still() { await engine.waitForGPU(); engine.dirty = true; engine.render(performance.now()); await engine.waitForGPU(); return canvas.toDataURL('image/png'); }};
  ready = true;
  raf = requestAnimationFrame(frame);
}
window.addEventListener('keydown', event => {
  if (!engine || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'KeyR') { engine.resetCamera(); event.preventDefault(); }
  if (event.code === 'KeyC') { reference.hidden = !reference.hidden; event.preventDefault(); }
});
canvas.addEventListener('pointermove', event => { if (!reference.hidden) setWipe(event.clientX); });
window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => { closed = true; cancelAnimationFrame(raf); engine?.dispose(); }, {once: true});
boot().catch(fail);
