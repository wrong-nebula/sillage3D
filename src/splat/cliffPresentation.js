import {MathUtils} from 'three';
import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {COURIER_KEYS} from './CourierController.js';
import {CLIFF_PHYSICS_KEYS} from './CliffPhysics.js';
import {SplatReveal} from './SplatReveal.js';
import {makeCliffRevealField} from './cliffReveal.js';
import {advanceCliffSeason} from './CliffSeasons.js';
import {scenes} from './scenes.js';
import {PhysicsInspector} from './PhysicsInspector.js';

const canvas = document.querySelector('canvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const INTRO_END = 9.2;
const {smoothstep} = MathUtils;
let engine, reveal, raf, last, ready = false, closed = false, manual = false;
let time = 0, cycling = false, manualWeather = false;
const physicsButtons = [...document.querySelectorAll('[data-physics]')];
const physicsStatus = document.querySelector('#physics-status');
const minimalPhysics=document.body.dataset.presentation==='minimal';
const physicsHint=document.querySelector('#physics-hint .keyboard-hint'),physicsHintRunning=physicsHint?.textContent;
let statusTime = -1;
let paused=false,inspector;

function setPhysicsPaused(value){
  paused=Boolean(value);const button=document.querySelector('#physics-pause');if(button)button.textContent=paused?'Resume physics':'Pause physics';
  if(physicsHint)physicsHint.textContent=paused?'Paused · K to resume':physicsHintRunning;
  if(engine){engine.physicsPaused=paused;if(paused)engine.actor?.physics.mouse?.cancel();engine.dirty=true;}
  engine?.actor?.physics.motionBlur?.setPaused(paused);engine?.actor?.audio.setActive(!paused&&!document.hidden);last=undefined;inspector?.refresh(true);
}

function makeReveal() {
  const starts = new Float32Array(engine.activeSplats.length);
  const data = engine.cliffSeasons.texture.image.data;
  const birdsEnd = engine.actorStart + engine.actor.doves.splats.length;
  const field = makeCliffRevealField(engine.cache.get(engine.sceneIndex).revealMaps);
  for (let i = 0; i < starts.length; i++) {
    const splat = engine.activeSplats[i], [x, y, z] = splat.center;
    const seed = splat.seed ?? .5, kind = data[i * 4 + 3];
    if (i >= birdsEnd) starts[i] = 7.9;
    else if (i >= engine.actorStart) starts[i] = 4.7 + seed * .65;
    else if (kind === 16) starts[i] = 4.1 + seed * 1.0;
    else if ([32, 80, 112, 128, 160, 192, 255].includes(kind)) starts[i] = field(x, y, z, seed, true);
    else starts[i] = field(x, y, z, seed) + (kind === 64 ? .22 : 0);
  }
  return new SplatReveal(engine, starts, {end: INTRO_END, duration: 1.0, drift: [0, -.9, 0]});
}

function update(dt) {
  time += dt;
  reveal?.update(time);
  const sky = engine.causticClouds.sky.material;
  sky.uniforms.presentationReveal.value = smoothstep(time, 4.0, 6.4);
  engine.actor.entrancePaused = time < INTRO_END;
  engine.actor.ambience.reveal = smoothstep(time, 1.2, 6.4);
  engine.actor.advance(dt);
  engine.updateTrample(time);
  if (engine.actor.entranceComplete && !engine.actor.entrancePaused && !manualWeather) cycling = true;
  if (cycling) {
    engine.cliffSeasons.seek(advanceCliffSeason(engine.cliffSeasons.position, dt));
  }
  const canControl = engine.actor.entranceComplete && !engine.actor.entrancePaused;
  for (const button of physicsButtons) button.disabled = !canControl;
  if (physicsStatus && (time - statusTime > .35||paused)) {
    statusTime = time;
    const state = engine.actor.physics.snapshot();
    const deposits=state.materials,materialStatus=document.querySelector('#material-status');
    if(materialStatus&&deposits)materialStatus.textContent=`${deposits.peakDepth.toFixed(2)} m peak depth · Snow ${deposits.volume.snow.toFixed(1)} m³ · Sand ${deposits.volume.sand.toFixed(1)} m³ · Mud ${deposits.volume.mud.toFixed(1)} m³`;
    const clearMaterials=document.querySelector('#materials-clear');if(clearMaterials)clearMaterials.disabled=!canControl;
    physicsStatus.textContent = canControl
      ? `${engine.cliffSeasons.phase} · ${state.solver.active} bodies · ${state.particles.active} particles · ${state.progressive.enabled?`${state.progressive.damaged} damaged rocks · ${state.progressive.detached} pieces`:`${state.nativeFractures} cliff rocks broken`}${state.flexibles?` · ${state.flexibles.nodes} flexible nodes`:''} · ${state.cpuMs.toFixed(1)} ms physics`
      : 'Controls unlock when the courier arrives.';
  }
  engine.windTime += dt;
  engine.material.uniforms.windTime.value = engine.windTime;
  engine.causticClouds.state.x += dt;
  engine.dirty = true;
}
function draw(now) {
  engine.actor.writePacked(engine.texture.image.data, engine.centers, engine.actorStart);
  engine.textureUploads.mark(engine.actorStart * 20, engine.actor.splats.length * 20);
  engine.sortDirty = true;
  inspector?.update();
  engine.render(now);
}
function resize() { engine?.resize(canvas.clientWidth, canvas.clientHeight); }
function fail(error) {
  console.error(error); cancelAnimationFrame(raf);
  document.querySelector('#error').hidden = false;
}
function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!ready || document.hidden || manual) { last = undefined; return; }
  if(paused){last=undefined;if(engine.dirty&&engine.gpuReady())draw(now);return;}
  try {
    if (!engine.gpuReady()) return;
    const dt = last === undefined ? 0 : Math.min(.1, (now - last) / 1000);
    last = now; update(dt); draw(now);
  } catch (error) { fail(error); }
}
async function boot() {
  engine = new GaussianBrushRenderer(canvas);
  const index = scenes.findIndex(scene => scene.id === (document.body.dataset.scene??'cliff-talus')), scene = scenes[index];
  await scene.prepare();
  const definition = {...scene.create(),...(scene.physicsLab?{}:{cameraOrbit:{pivot:scene.camera.target,degrees:6,minHeight:3.5}})};
  engine.cache.set(index, definition); engine.load(index);
  Object.assign(engine.options, scene.initialStyle); engine.applyStyle(); resize();
  engine.setActorPlaying(false); engine.setWindPlaying(false);
  engine.cliffSeasons.setPlaying(false); engine.causticClouds.setPlaying(false);
  await engine.actorReady;
  if (closed) return;
  if (engine.actorError) throw engine.actorError;
  if(minimalPhysics&&canvas.clientWidth<600){
    const camera=engine.camera,target=engine.controls.target;
    target.set(0,1.2,10);camera.position.set(19,17,26);engine.controls.update();
  }
  // Loading an actor rebuilds the splat material, so install reveal hooks last.
  engine.setActorPlaying(false); engine.setWindPlaying(false);
  engine.cliffSeasons.setPlaying(false); engine.cliffSeasons.seek(0);
  if(minimalPhysics)setDepositMaterial('sand');
  engine.causticClouds.setPlaying(false); engine.actor.entrancePaused = true;
  engine.actor.audio.setActive(!document.hidden);
  const sky = engine.causticClouds.sky.material;
  sky.fragmentShader = 'uniform float presentationReveal;\n' + sky.fragmentShader
    .replace('fragColor = vec4(sky, 1.);', 'fragColor = vec4(sky * presentationReveal, 1.);');
  sky.uniforms.presentationReveal = {value: 0}; sky.needsUpdate = true;
  engine.renderer.setClearColor('#000000', 1);
  reveal = makeReveal();
  if (reducedMotion||scene.physicsLab) time = INTRO_END;
  if(scene.physicsLab){manualWeather=true;cycling=false;}
  if(scene.physicsLab&&document.querySelector('#physics-inspector'))inspector=new PhysicsInspector(engine,{getPaused:()=>paused,setPaused:setPhysicsPaused,step:async()=>{await engine.waitForGPU();update(engine.actor.physics.world.fixedDt);draw();await engine.waitForGPU();}});
  ready = true; update(0); draw(); raf = requestAnimationFrame(frame);
}
const booted = boot().catch(fail);
function unlock() { engine?.actor?.audio.unlock().catch(fail); }
function setDepositMaterial(material){
  engine.actor.physics.materials.material=material;
}
function physicsAction(code) {
  if (!ready || !engine.actor.entranceComplete || engine.actor.entrancePaused) return;
  unlock();
  statusTime=-1;
  // Weather selection stays fixed while inspecting physical snow and fire.
  if (code === 'KeyN') { cycling = false; manualWeather = true; }
  engine.actor.controller.setKey(code, true);
  if(minimalPhysics&&code==='KeyN')setDepositMaterial(engine.cliffSeasons.position>.2?'snow':'sand');
  if((code==='KeyV'||code==='KeyP')&&canvas.clientWidth<600){const panel=document.querySelector('#physics-controls');if(panel)panel.open=false;}
  if(paused){update(0);engine.dirty=true;}
}
for (const button of physicsButtons) button.addEventListener('click', () => physicsAction(button.dataset.physics));
document.querySelector('#physics-pause')?.addEventListener('click',event=>{
  setPhysicsPaused(!paused);
});
document.querySelector('#physics-reset')?.addEventListener('click',()=>location.reload());
document.querySelector('#ground-material')?.addEventListener('change',event=>{
  if(engine?.actor?.physics.materials)engine.actor.physics.materials.material=event.target.value;
});
document.querySelector('#materials-clear')?.addEventListener('click',()=>{
  engine?.actor?.physics.surfaceSnow?.clear();engine?.actor?.physics.materials?.clear();statusTime=-1;if(engine){update(0);engine.dirty=true;}
});
document.querySelector('#motion-blur-strength')?.addEventListener('input',event=>{
  engine?.actor?.physics.motionBlur?.setStrength(Number(event.target.value));
  const value=document.querySelector('#motion-blur-value');if(value)value.textContent=Number(event.target.value).toFixed(1);
});
window.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || !ready) return;
  if(event.target.closest('input,select,textarea,[contenteditable="true"]'))return;
  if(minimalPhysics&&!event.repeat){
    const feedback=document.querySelector('#physics-feedback');
    if(event.code==='KeyK'){
      event.preventDefault();setPhysicsPaused(!paused);if(feedback)feedback.textContent=paused?'Physics paused. Press K to resume.':'Physics resumed.';return;
    }
    if(['Digit1','Digit2','Digit3'].includes(event.code)){
      event.preventDefault();const material=['snow','sand','mud'][Number(event.code.at(-1))-1];setDepositMaterial(material);if(feedback)feedback.textContent=`${material} selected. Press L to deposit a pile.`;return;
    }
    if(event.code==='KeyC'){
      event.preventDefault();engine.actor.physics.surfaceSnow?.clear();engine.actor.physics.materials?.clear();if(feedback)feedback.textContent='Deposits cleared.';update(0);engine.dirty=true;return;
    }
  }
  if (event.code === 'KeyF' && !event.repeat) {
    (document.fullscreenElement ? document.exitFullscreen() : canvas.requestFullscreen())?.catch(() => {});
    event.preventDefault(); return;
  }
  if (event.target.closest('button,summary,input,select,textarea') && ['Space','Enter'].includes(event.code)) return;
  if (!COURIER_KEYS.has(event.code) && !CLIFF_PHYSICS_KEYS.has(event.code)) return;
  if (CLIFF_PHYSICS_KEYS.has(event.code) && event.repeat) return;
  if (CLIFF_PHYSICS_KEYS.has(event.code)) { event.preventDefault(); physicsAction(event.code); return; }
  event.preventDefault(); unlock();
  engine.actor.controller.setKey(event.code, true);
});
window.addEventListener('keyup', event => engine?.actor?.controller.setKey(event.code, false));
canvas.addEventListener('pointerdown', unlock);
window.addEventListener('blur', () => engine?.actor?.controller.clearKeys());
window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  last = undefined; engine?.actor?.controller.clearKeys();
  engine?.actor?.audio.setActive(!document.hidden);
});
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  closed = true; cancelAnimationFrame(raf); reveal?.dispose(); engine?.dispose();
});
window.render_game_to_text = () => JSON.stringify({
  scene: document.body.dataset.scene??'cliff-seasons', coordinates: 'Y up; X/Z terrain; movement relative to camera',
  phase: !ready ? 'loading' : time < 4.1 ? 'terrain-and-rocks' : time < 6.1 ? 'clouds-and-birds'
    : time < INTRO_END ? 'ground-cover' : !engine?.actor?.entranceComplete ? 'crow-entrance' : 'playing',
  time, cycling, season: engine?.cliffSeasons?.phase, seasonPosition: engine?.cliffSeasons?.position,
  camera: {yaw: engine?.limitedOrbit?.yaw, pitch: engine?.limitedOrbit?.pitch, limitDegrees: 6},
  player: engine?.actor?.controller.snapshot() ?? null, audio: engine?.actor?.audio.snapshot() ?? null,
  ambience: engine?.actor?.ambience.snapshot() ?? null,
  footprints: engine?.actor?.footprints.snapshot() ?? null,
  snowShedding: engine?.actor?.snowShedding.snapshot() ?? null,
  physics: engine?.actor?.physics.snapshot() ?? null,
  paused,
  ik: engine?.actor?.crow.footPlant.snapshot() ?? null,
  grassTrail: engine?.trample && engine.actor ? {radius: engine.trample.radius, recovery: engine.trample.recovery,
    strength: engine.trample.sample(engine.actor.root.position.x, engine.actor.root.position.z).strength} : null,
});
window.advanceTime = async ms => {
  manual = true; await booted;
  if (!ready || closed) return;
  await engine.waitForGPU();
  ms = paused?0:Math.max(0, ms);
  const steps = Math.max(1, Math.ceil(ms / 100));
  for (let i = 0; i < steps; i++) update(ms / 1000 / steps);
  draw(); await engine.waitForGPU();
};
if(document.body.dataset.scene==='physics-lab')window.physicsLab={get engine(){return engine;}};
