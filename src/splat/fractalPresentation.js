import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {fractalStudyScenes} from './fractalShapes.js';
import {scenes} from './scenes.js';
import {HyperbolicFractal} from './HyperbolicFractal.js';
import {FractalAtmosphere} from './FractalAtmosphere.js';
import '../site/sceneMenu.js';

const canvas = document.querySelector('canvas');
let engine, space, atmosphere, current = 0, raf = 0, closed = false, ready = false, last = null, time = 0, lastFrame = -Infinity;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let moving = !reducedMotion;

function schedule() {
  if (!closed && !raf && !document.hidden) raf = requestAnimationFrame(frame);
}
function fail(error) {
  console.error(error); cancelAnimationFrame(raf); raf = 0; closed = true;
  document.querySelector('#error').hidden = false;
}
function frame(now) {
  raf = 0;
  if (closed || document.hidden) return;
  try {
    if (now - lastFrame < 1000 / 30) { schedule(); return; }
    if (!engine.gpuReady()) { schedule(); return; }
    if (moving && last !== null) time += Math.min(.1, (now - last) / 1000);
    last = now;
    if (moving && space.enabled) space.update(time);
    const rendered = engine.render(now);
    if (rendered) lastFrame = now;
    if (rendered && !ready) {
      ready = true; window.rendered = canvas;
      document.dispatchEvent(new CustomEvent('genart:done'));
    }
    if (engine.needsFrame || moving) schedule();
  } catch (error) { fail(error); }
}
function resize() {
  if (!engine) return;
  engine.resize(canvas.clientWidth, canvas.clientHeight);
  // Keep the complete sculpture in view on narrow portrait screens.
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const fov = fractalStudyScenes[current].camera.fov;
  engine.setCameraFov(aspect < 1 ? fov + (1 - aspect) * 34 : fov);
  schedule();
}
function pauseOrbit() {
  moving = false; engine.autoOrbit = false; engine.lastOrbitTime = null; last = null;
}
function boot() {
  engine = new GaussianBrushRenderer(canvas);
  const requested = new URLSearchParams(location.search).get('shape');
  current = Math.max(0, fractalStudyScenes.findIndex(scene => scene.id === requested));
  selectShape(current);
  atmosphere = new FractalAtmosphere(engine);
  engine.autoOrbit = moving;
  engine.onInvalidate = schedule; resize(); schedule();
}
canvas.addEventListener('pointerdown', () => { pauseOrbit(); canvas.focus({preventScroll: true}); });
canvas.addEventListener('wheel', pauseOrbit, {passive: true});
window.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || /BUTTON|A|INPUT/.test(document.activeElement?.tagName)) return;
  if (event.code === 'Space') {
    event.preventDefault(); moving = !moving; engine.autoOrbit = moving; engine.lastOrbitTime = null; last = null; schedule();
  } else if (event.code === 'KeyH') {
    toggleSpace();
  } else if (/^Digit[1-4]$/.test(event.code)) {
    selectShape(Number(event.code.at(-1)) - 1);
  } else if (event.code === 'KeyR') {
    pauseOrbit(); time = 0; space.update(0); engine.resetCamera(); resize();
  } else if (event.code === 'KeyF') {
    (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())?.catch(() => {});
  }
});
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
  else { engine.lastOrbitTime = null; last = null; schedule(); }
});
function dispose() {
  closed = true; cancelAnimationFrame(raf); atmosphere?.dispose(); space?.dispose(); engine?.dispose();
}
window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
if (import.meta.hot) import.meta.hot.dispose(dispose);
function toggleSpace() {
  space.enabled = !space.enabled; space.update(time);
  const button = document.querySelector('#geometry');
  button.textContent = space.enabled ? 'Hyperbolic space' : 'Euclidean space';
  button.setAttribute('aria-pressed', String(space.enabled)); schedule();
}
function selectShape(index) {
  const enabled = space?.enabled ?? true;
  space?.dispose(); current = index; time = 0; last = null;
  const definition = fractalStudyScenes[index];
  engine.load(scenes.findIndex(scene => scene.id === definition.id));
  Object.assign(engine.options, definition.initialStyle); engine.applyStyle();
  space = new HyperbolicFractal(engine); space.enabled = enabled; space.update(0);
  engine.autoOrbit = moving; engine.lastOrbitTime = null;
  document.querySelector('#shape-name').textContent = definition.caption;
  document.querySelectorAll('[data-shape]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.shape) === index)));
  const url = new URL(location.href); url.searchParams.set('shape', definition.id); history.replaceState(null, '', url);
  resize(); schedule();
}
document.querySelector('#geometry').addEventListener('click', toggleSpace);
document.querySelectorAll('[data-shape]').forEach(button => button.addEventListener('click', () => selectShape(Number(button.dataset.shape))));
window.fractalScene = {get engine() { return engine; }, get ready() { return ready; }, pause: pauseOrbit,
  get space() { return space; }, get current() { return current; }, definitions: fractalStudyScenes, selectShape, toggleSpace,
  seek(value) { pauseOrbit(); time = value; space.update(time); schedule(); }};
window.$features = {Structure: 'Menger sponge', Space: 'Poincaré ball', Recursion: 3, Cells: 8000, Palette: 'Ivory and blue mineral'};
try { boot(); } catch (error) { fail(error); }
