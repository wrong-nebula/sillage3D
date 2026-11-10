import {MathUtils, Vector3} from 'three';
import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {BluePlane} from './BluePlane.js';
import {COURIER_KEYS} from './CourierController.js';
import {SplatReveal} from './SplatReveal.js';
import {scenes} from './scenes.js';
import {loadTenguCourier} from './tenguCourier.js';

const canvas = document.querySelector('canvas');
const flightHint = document.querySelector('#flight-hint');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ENTRANCE = 2.35;
const HINT_END = ENTRANCE + 4.5;
const CAMERA_DISTANCE = 10.5;
const NEAR_DISTANCE = 9.2;
const FAR_DISTANCE = 14.6;
const STYLE = {mode: 'gaussian', brushScale: 1.1, coverage: 1.28};
const {smootherstep} = MathUtils;
const cameraOffset = new Vector3();
const projected = new Vector3();
const stage = new Vector3();
let engine, plane, reveal, raf, last;
let time = 0, washTime = 0, distanceScale = 1;
let ready = false, playing = false, manual = false, closed = false;

function resize() {
  engine?.resize(canvas.clientWidth, canvas.clientHeight);
}

function compose() {
  const aspect = engine.getViewportAspect();
  const scale = Math.max(1, .9 / aspect, aspect / 1.9);
  if (playing && scale === distanceScale) return;

  const {controls, camera} = engine;
  controls.minDistance = NEAR_DISTANCE * scale;
  controls.maxDistance = FAR_DISTANCE * scale;
  cameraOffset.copy(camera.position).sub(controls.target);
  if (playing) {
    cameraOffset.multiplyScalar(scale / distanceScale);
  } else {
    const pullback = reducedMotion ? 1 : smootherstep(time, .19, ENTRANCE);
    cameraOffset.setLength(MathUtils.lerp(CAMERA_DISTANCE, FAR_DISTANCE, pullback) * scale);
  }
  camera.position.copy(controls.target).add(cameraOffset);
  distanceScale = scale;
  controls.update();
}

function makeReveal(actor) {
  const arrivals = new Float32Array(actor.splats.length);
  for (let i = 0; i < arrivals.length; i++) {
    const {center: [x, y, z], seed} = actor.splats[i];
    if (i >= actor.shadow.bodyCount) {
      arrivals[i] = .16 + .3 * seed;
    } else {
      const height = smootherstep(y, 0, 3.6);
      const stroke = .5 + .5 * Math.sin(y * 5.2 - x * 3.8 + z * 3);
      arrivals[i] = seed > .94 ? .35 + height * 1.2 + .3 * stroke
        : .75 + height * 1.55 + .52 * stroke + .42 * seed;
    }
    arrivals[i] *= .53;
  }
  return new SplatReveal(engine, arrivals, {end: ENTRANCE, duration: .64, drift: [.64, .46, -.37]});
}

function step(dt) {
  washTime += dt;
  if (ready) time += dt;
  plane.material.uniforms.reveal.value = reducedMotion ? 1 : smootherstep(washTime, .02, .9);
  reveal?.update(time);
  compose();
  if (!ready) return;
  if (!playing && time >= ENTRANCE) {
    playing = true;
    engine.controls.enabled = true;
  }
  if (time >= ENTRANCE - .35 && time < HINT_END) {
    flightHint.hidden = false;
    const fadeIn = smootherstep(time, ENTRANCE - .35, ENTRANCE + .15);
    const fadeOut = 1 - smootherstep(time, HINT_END - .65, HINT_END);
    flightHint.style.opacity = String(reducedMotion ? 1 : fadeIn * fadeOut);
  } else if (!flightHint.hidden) {
    flightHint.hidden = true;
  }
  engine.actor.advance(dt);
}

function draw(now) {
  const actor = engine.actor;
  if (ready) {
    actor.writePacked(engine.texture.image.data, engine.centers, engine.actorStart);
    engine.textureUploads.mark(engine.actorStart * 20, actor.splats.length * 20);
    engine.sortDirty = true;
  }
  engine.dirty = true;
  engine.render(now);
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
    if (!engine.gpuReady()) return;
    const dt = last === undefined ? 0 : Math.min(.1, (now - last) / 1000);
    last = now;
    step(dt);
    draw(now);
  } catch (error) {
    fail(error);
  }
}

async function boot() {
  engine = new GaussianBrushRenderer(canvas);
  const index = scenes.findIndex(scene => scene.id === 'tengu-courier');
  const scene = scenes[index];
  engine.cache.set(index, {
    ...scene.create(),
    background: '#000000',
    loadActor: () => loadTenguCourier({count: 24000, shadowCount: 640, followHeight: .92, airplaneFlight: true}),
  });
  engine.load(index);
  engine.controls.enabled = false;
  engine.controls.enablePan = false;
  engine.controls.minPolarAngle = Math.PI * .32;
  engine.controls.maxPolarAngle = Math.PI * .49;
  engine.controls.zoomSpeed = .46;
  engine.controls.rotateSpeed = .53;
  engine.controls.target.y = 1.8;
  engine.controls.minDistance = NEAR_DISTANCE;
  engine.controls.maxDistance = FAR_DISTANCE;
  cameraOffset.copy(engine.camera.position).sub(engine.controls.target).setLength(CAMERA_DISTANCE);
  engine.camera.position.copy(engine.controls.target).add(cameraOffset);
  engine.controls.update();
  Object.assign(engine.options, scene.initialStyle, STYLE);
  engine.applyStyle();
  engine.setFocalLength(40);
  resize();
  plane = new BluePlane();
  engine.scene.add(plane);
  raf = requestAnimationFrame(frame);
  await engine.actorReady;
  if (closed) return;
  if (engine.actorError) throw engine.actorError;
  engine.setActorPlaying(false);
  engine.actor.audio.setActive(!document.hidden);
  engine.scene.add(plane);
  engine.actor.controller.yaw = .31;
  engine.actor.advance(0);
  if (reducedMotion) time = ENTRANCE;
  else reveal = makeReveal(engine.actor);
  ready = true;
}

function clearKeys() {
  engine?.actor?.controller.clearKeys();
}

function unlockAudio() {
  engine?.actor?.audio.unlock().catch(error => console.error(error));
}

window.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'KeyF' && !event.repeat) {
    const toggle = document.fullscreenElement ? document.exitFullscreen() : canvas.requestFullscreen?.();
    toggle?.catch(() => {});
  }
  if (!COURIER_KEYS.has(event.code)) return;
  event.preventDefault();
  if (event.repeat || !ready) return;
  unlockAudio();
  if (playing) engine.actor.controller.setKey(event.code, true);
});
window.addEventListener('keyup', event => engine?.actor?.controller.setKey(event.code, false));
function clearFlightInput() {
  engine?.actor?.controller.setFlightInput(null);
}

canvas.addEventListener('pointerdown', () => {
  clearFlightInput();
  unlockAudio();
});
canvas.addEventListener('pointerleave', clearFlightInput);
canvas.addEventListener('pointermove', event => {
  const controller = engine?.actor?.controller;
  if (!playing || !controller?.flying || event.pointerType !== 'mouse' || event.buttons) return;
  const bounds = canvas.getBoundingClientRect();
  const x = MathUtils.clamp(2 * (event.clientX - bounds.left) / bounds.width - 1, -1, 1);
  const y = MathUtils.clamp(1 - 2 * (event.clientY - bounds.top) / bounds.height, -1, 1);
  const deflect = value => Math.sign(value) * Math.max(0, Math.abs(value) - .09) / .91;
  controller.setFlightInput(deflect(x), deflect(y));
});
window.addEventListener('blur', clearKeys);
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  last = undefined;
  clearKeys();
  engine?.actor?.audio.setActive(!document.hidden);
});
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  closed = true;
  cancelAnimationFrame(raf);
  reveal?.dispose();
  plane?.dispose();
  engine?.dispose();
});

const booted = boot().catch(fail);
window.render_game_to_text = () => {
  const actor = engine?.actor;
  let onScreen = null;
  if (actor) {
    stage.copy(actor.root.position);
    stage.y += 1.8;
    projected.copy(stage).project(engine.camera);
    onScreen = Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1;
  }
  return JSON.stringify({
    scene: 'crow-plane', coordinates: 'Y is height above the infinite X/Z plane',
    phase: playing ? 'playing' : ready ? 'assembling' : 'loading', time,
    camera: engine ? {azimuth: engine.controls.getAzimuthalAngle(), polar: engine.controls.getPolarAngle(),
      distance: engine.controls.getDistance()} : null,
    style: engine ? {mode: engine.options.mode, brushScale: engine.options.brushScale, coverage: engine.options.coverage} : null,
    player: actor?.controller.snapshot() ?? null, flightAltitude: actor?.controller.flightAltitude ?? null, flightInput: actor?.controller.flightInput ?? null, onScreen, audio: actor?.audio.snapshot() ?? null,
  });
};
window.advanceTime = async ms => {
  manual = true;
  await booted;
  if (!ready || closed) return;
  await engine.waitForGPU();
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) step(ms / 1000 / steps);
  draw();
  await engine.waitForGPU();
};
