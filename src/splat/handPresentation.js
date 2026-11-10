import {Color, MathUtils, Vector3} from 'three';
import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {SplatReveal} from './SplatReveal.js';
import {scenes} from './scenes.js';

const {lerp, smootherstep} = MathUtils;
const INTRO_END = 8.4;
const LOOP = 68;
const shots = [
  {time: [5, 10, 14, 20], distance: 2.35, yaw: .20, turn: .36, pitch: .11, roll: -.31, focus: [.13, .36, -.21]},
  {time: [25, 30, 34, 40], distance: 3.0, yaw: .19, turn: .23, pitch: .07, roll: .20, focus: [-.12, .18, -.63]},
  {time: [48, 53, 57, 63], distance: 2.25, yaw: .20, turn: .35, pitch: -.23, roll: .32, focus: [.29, .17, -.20]},
];
const canvas = document.querySelector('canvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wideTarget = new Vector3(.14, .19, 0);
const target = new Vector3();
const orb = new Vector3();
const point = new Vector3();
const clear = new Color();
let engine, reveal, ground, raf, last, elapsed = 0, closed = false, manual = false;

function makeReveal(definition) {
  const {splats, emission: {start}} = definition;
  const starts = new Float32Array(splats.length);
  for (let i = 0; i < start; i++) {
    const {center: [x, y, z], seed} = splats[i];
    const along = smootherstep(x * .77 + y * .63, -1.65, 1.65);
    const patch = .5 + .5 * Math.sin(x * 8 + y * 5 + Math.sin(z * 6));
    starts[i] = .32 + 4.9 * along + .65 * patch + .55 * seed;
  }
  for (let i = start; i < splats.length; i++) {
    const {center, seed} = splats[i];
    starts[i] = 5.7 + .86 * smootherstep(center[1] - orb.y, -.39, .39) + .45 * seed;
  }
  return new SplatReveal(engine, starts, {end: INTRO_END, duration: 1.32});
}

function compose(time) {
  const t = Math.max(0, time - INTRO_END) % LOOP;
  const introProgress = Math.min(time / INTRO_END, 1);
  // Ease into the orbit with the same angular speed at the handoff.
  const lead = (introProgress ** 2 - 1) * INTRO_END / 2;
  const turn = (t + lead) * 2 * Math.PI / LOOP;
  const intro = 1 - smootherstep(time, 0, INTRO_END);
  let yaw = .04 + turn;
  let pitch = .095 + .055 * Math.sin(turn * 2) + .10 * intro;
  let distance = 8.1 + .34 * Math.sin(turn) + .7 * intro;
  let roll = -.035 * Math.sin(turn);
  target.copy(wideTarget);

  for (const shot of shots) {
    const [start, inEnd, outStart, end] = shot.time;
    if (t <= start || t >= end) continue;
    const amount = smootherstep(t, start, inEnd) * (1 - smootherstep(t, outStart, end));
    const drift = (t - start) / (end - start) - .5;
    yaw += amount * (shot.yaw + shot.turn * drift);
    pitch += amount * shot.pitch;
    roll += amount * (shot.roll + .2 * drift);
    distance = lerp(distance, shot.distance, amount);
    target.lerp(point.fromArray(shot.focus).add(orb), amount);
  }

  const aspect = engine.getViewportAspect();
  distance *= Math.max(1, .81 / aspect, aspect / 1.8);
  const horizontal = distance * Math.cos(pitch);
  engine.camera.position.set(
    target.x + horizontal * Math.sin(yaw),
    target.y + distance * Math.sin(pitch),
    target.z + horizontal * Math.cos(yaw),
  );
  engine.camera.lookAt(target);
  engine.camera.rotateZ(roll);
  engine.sortDirty = true;
  engine.dirty = true;
}

function draw(dt, now) {
  elapsed += dt;
  const time = reducedMotion ? INTRO_END : elapsed;
  reveal?.update(time);
  const background = reducedMotion ? 1 : smootherstep(time, .6, 7.3);
  engine.renderer.setClearColor(clear.copy(ground).multiplyScalar(background), 1);
  if (!reducedMotion) engine.advanceThermal(dt);
  compose(time);
  engine.render(now);
}

function resize() {
  if (engine) engine.resize(canvas.clientWidth, canvas.clientHeight);
}

function fail(error) {
  console.error(error);
  cancelAnimationFrame(raf);
  document.querySelector('#error').hidden = false;
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (document.hidden || manual) {
    last = undefined;
    return;
  }
  try {
    if (reducedMotion && !engine.dirty) return;
    if (!engine.gpuReady()) return;
    const dt = last === undefined ? 0 : Math.min(.1, (now - last) / 1000);
    last = now;
    draw(dt, now);
  } catch (error) {
    fail(error);
  }
}

async function boot() {
  const index = scenes.findIndex(scene => scene.id === 'hand-study');
  const scene = scenes[index];
  await scene.prepare();
  if (closed) return;
  engine = new GaussianBrushRenderer(canvas);
  engine.load(index);
  engine.controls.enabled = false;
  engine.setThermalPlaying(false);
  Object.assign(engine.options, scene.initialStyle);
  engine.applyStyle();
  resize();

  const definition = engine.cache.get(index);
  ground = new Color(definition.background);
  const start = definition.emission.start;
  for (let i = start; i < definition.splats.length; i++) {
    orb.add(point.fromArray(definition.splats[i].center));
  }
  orb.divideScalar(definition.splats.length - start);
  if (!reducedMotion) reveal = makeReveal(definition);
  raf = requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { last = undefined; });
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  closed = true;
  cancelAnimationFrame(raf);
  reveal?.dispose();
  engine?.dispose();
});

const booted = boot().catch(fail);
if (new URLSearchParams(location.search).has('verify')) {
  manual = true;
  window.advanceTime = async ms => {
    await booted;
    await engine.waitForGPU();
    draw(ms / 1000);
    await engine.waitForGPU();
    return {elapsed, camera: engine.camera.position.toArray(), orientation: engine.camera.quaternion.toArray(),
      target: target.toArray(), orb: orb.toArray(), constructed: !reveal || reveal.finished};
  };
}
