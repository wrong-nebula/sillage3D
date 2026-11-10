/** Sillage: the public API of the splat engine, for a page.
 *
 *   import {createSillage} from './src/sillage/index.js';
 *   const sillage = await createSillage(canvas, {scene: 'alpine'});
 *   sillage.setStyle({mode: 'gouache', softness: 0.3});
 *   sillage.orbit(30, 10);
 *   const png = await sillage.capture({width: 1024});   // Blob
 *   console.log(sillage.describe());                    // plain JSON
 *
 * A scene is a built-in id ("sillage scenes"), a scene document (see
 * scene.js), or a raw engine definition. Every method validates its input
 * and throws a SillageError with a `code` and a `hint`. `sillage.engine` is
 * the underlying GaussianBrushRenderer for anything not covered here.
 *
 * An instance is always in one state, `sillage.state`, also in `describe()`:
 *
 *   empty     no scene yet                         load() -> loading
 *   loading   a load is in flight; a scene loaded
 *             before stays in use until it lands   -> ready, or back to empty
 *   ready     a scene is loaded                    load() -> loading
 *   lost      the GPU context is gone              every call throws GPU_LOST
 *   disposed  dispose() was called                 every call throws DISPOSED
 *
 * `onState(state, previous, sillage)` is called on every move. */
import {GaussianBrushRenderer} from '../splat/GaussianBrushRenderer.js';
import {SillageError, errorJSON, didYouMean} from './errors.js';
import {STYLE_KEYS, STYLE_OPTIONS, styleDefaults, styleNotes, validateStyle, toEngine, fromEngine} from './styles.js';
import {isSceneDocument, sceneDefinition} from './scene.js';
import {findScene, listScenes} from './catalog.js';
import {createMachine, SILLAGE_STATES} from './machine.js';

export {SillageError, errorJSON} from './errors.js';
export {STYLE_OPTIONS, STYLE_GROUPS, styleDefaults, validateStyle} from './styles.js';
export {validateScene, compileScene, inspectScene, sceneDefinition, sceneSchema, starterScene, CONTENT_TYPES, TEMPLATE_NAMES} from './scene.js';
export {createBrush, parseColor} from './brush.js';
export {listScenes, findScene} from './catalog.js';
export {createMachine, SILLAGE_STATES, HOST_STATES} from './machine.js';

const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;
const PARAMETERS = {
  season: 'Position in the year, 0 to 1 (0 summer, about 0.25 autumn, 0.5 winter, 0.8 spring). Scenes with seasons only.',
  night: 'true for night, false for day. Reef scenes only.',
};

/** The states in which the instance can still draw. */
const LIVE = ['empty', 'loading', 'ready'];

export class Sillage {
  /** @param {HTMLCanvasElement} canvas  @param {{loop?: boolean, onFrame?: Function, onError?: Function, onState?: Function}} options
   * With `loop` off nothing is drawn until `renderFrame` or `capture` is called.
   * `onError(error)` reports a frame that could not be drawn; `onState(state, previous, sillage)` every change of state. */
  constructor(canvas, {loop = true, onFrame = null, onError = null, onState = null} = {}) {
    if (!canvas?.getContext) throw new SillageError('INVALID_CANVAS', 'createSillage needs a <canvas> element.');
    this.canvas = canvas; this.onFrame = onFrame; this.onError = onError; this.onState = onState;
    // A listener that throws must not stop the move it was told about.
    this.life = createMachine('Sillage', 'empty', SILLAGE_STATES, (state, previous) => { try { this.onState?.(state, previous, this); } catch (error) { console.error(error); } });
    try { this.engine = new GaussianBrushRenderer(canvas, {sceneDefinitions: []}); }
    catch (error) { throw new SillageError('NO_WEBGL', `The renderer could not start: ${error.message}`, {hint: 'Sillage needs WebGL2 with float textures. In a headless browser, pass --ignore-gpu-blocklist.'}); }
    this.defaults = {...this.engine.options, oil: false, watercolor: false};
    this.definition = null; this.source = null; this.home = null; this.bounds = null; this.motion = true;
    this.frame = 0; this.lastRender = -Infinity;
    // Loads: `loads` numbers the calls, `commits` the ones that reached the engine, `inFlight` counts those not yet settled.
    this.loads = 0; this.commits = 0; this.inFlight = 0;
    // The draw loop: 'on', 'off' (draw on demand), or 'stopped' after a frame threw, until the next load.
    // Each capture in progress holds it. `turn` queues captures and scene swaps so they never overlap.
    this.loop = loop ? 'on' : 'off'; this.holds = 0; this.turn = Promise.resolve(); this.lostCause = null;
    // The engine reports a lost context through the same hook as a view that needs drawing.
    this.engine.onInvalidate = () => { if (this.gpuGone()) this.lose(); else this.schedule(); };
    this.draw = now => {
      this.frame = 0;
      if (!this.looping || document.hidden) return;
      const engine = this.engine;
      if (!engine.needsFrame) return;
      this.schedule();
      // The engine is paced to 30 frames a second; a busy GPU skips the frame.
      if (now - this.lastRender < 1000 / 30) return;
      try { if (engine.gpuReady() && engine.render(now)) { this.lastRender = now; this.onFrame?.(this); } }
      catch (error) {
        // Without its GPU context the instance is over. Any other failure stops the loop until the next load.
        if (this.gpuGone()) this.lose(error);
        else { this.loop = 'stopped'; this.onError?.(error); }
      }
    };
    this.onVisible = () => this.schedule();
    document.addEventListener('visibilitychange', this.onVisible);
    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.resize()) : null;
    this.observer?.observe(canvas);
    this.resize();
  }

  /** 'empty', 'loading', 'ready', 'lost' or 'disposed'; see SILLAGE_STATES. */
  get state() { return this.life.state; }
  get disposed() { return this.life.is('disposed'); }
  /** Whether the loop is drawing frames by itself right now. */
  get looping() { return this.loop === 'on' && this.holds === 0 && this.life.is(...LIVE); }

  schedule() { if (!this.frame && this.looping && !document.hidden) this.frame = requestAnimationFrame(this.draw); }
  /** True once the browser has taken the WebGL context away, even before the engine has been told. */
  gpuGone() { return this.engine.contextLost || Boolean(this.engine.gl?.isContextLost?.()); }
  /** The GPU context is gone: stop for good, and say so once through `onError`. */
  lose(cause = null) {
    if (!this.life.can('lost')) return;
    cancelAnimationFrame(this.frame); this.frame = 0;
    // The engine's own messages end with advice for its studio page; keep the cause only.
    this.lostCause = cause?.message ? String(cause.message).split('. ')[0].replace(/\.$/, '') : null;
    this.life.go('lost');
    this.onError?.(this.lostError());
  }
  lostError() {
    return new SillageError('GPU_LOST', `The renderer lost its GPU context${this.lostCause ? ` (${this.lostCause})` : ''}.`, {hint: 'This instance cannot draw again. Call dispose() and create a new one, or reload the page. The command line and the MCP server start a fresh browser on the next call.'});
  }
  /** Throw unless the instance can still be used. */
  requireLive() {
    if (this.life.is('disposed')) throw new SillageError('DISPOSED', 'This Sillage was disposed.', {hint: 'Create a new one with createSillage(canvas).'});
    if (this.gpuGone()) this.lose();
    if (this.life.is('lost')) throw this.lostError();
  }
  requireScene() { this.requireLive(); if (!this.definition) throw new SillageError('NO_SCENE', 'No scene is loaded.', {hint: 'Call load("alpine") or load(sceneDocument) first.'}); }
  /** Run `work` once every capture and scene swap asked for before it has finished. */
  exclusive(work) {
    const run = this.turn.then(work);
    this.turn = run.catch(() => {});
    return run;
  }

  /** Match the drawing size to the canvas's layout size, or to an explicit size in CSS pixels. */
  resize(width = this.canvas.clientWidth, height = this.canvas.clientHeight) {
    if (!(width > 0 && height > 0) || !this.life.is(...LIVE)) return;
    this.engine.resize(width, height);
  }

  /** Load a scene: a built-in id, a scene document, or an engine definition.
   * `style` and `camera` override the scene's own. `files` supplies the
   * contents of any file a document refers to. Returns `describe()`.
   *
   * A load that fails before its scene reaches the engine (bad input, missing
   * assets) leaves the scene loaded before in place. A newer load wins: the
   * one it overtakes rejects with SUPERSEDED. */
  async load(scene, {style = null, camera = null, files = {}, motion = true} = {}) {
    this.requireLive();
    const checkedStyle = validateStyle(style);
    let definition, source;
    if (typeof scene === 'string') { definition = findScene(scene); source = 'built-in'; }
    else if (isSceneDocument(scene)) { definition = sceneDefinition(scene, {files, aspect: this.canvas.clientWidth / this.canvas.clientHeight || 1.6}); source = 'document'; }
    else if (scene && typeof scene.create === 'function' && scene.camera) { definition = scene; source = 'definition'; }
    else throw new SillageError('INVALID_SCENE', 'A scene must be a built-in id, a scene document with "content", or an engine definition with "camera" and "create".', {hint: `Built-in ids include ${listScenes().slice(0, 5).map(entry => `"${entry.id}"`).join(', ')}.`});
    if (camera) this.checkCamera(camera);
    // Only a call that passed its checks counts as a load: a rejected one overtakes nothing.
    const load = ++this.loads, engine = this.engine;
    const superseded = () => new SillageError('SUPERSEDED', 'Another load started before this one finished.', {hint: 'The newer scene is the one in use. Await each load before starting the next to keep both.'});
    this.inFlight++; this.life.go('loading');
    try {
      try { await definition.prepare?.(); }
      catch (error) { throw new SillageError('ASSET_ERROR', `The scene's assets could not be loaded: ${error.message}`, {hint: 'Built-in scenes fetch models and terrain from the dev server\'s public/ folder. Is the page served by "sillage serve" or "npm run dev"?'}); }
      // The swap waits for a capture in progress, so a picture is never taken of half a scene.
      const commit = await this.exclusive(() => {
        this.requireLive();
        if (load !== this.loads) throw superseded();
        // From here a failure leaves no scene, rather than a description of the last one over a broken canvas.
        this.definition = null;
        engine.setAutoOrbit(false);
        engine.sceneDefinitions = [definition]; engine.cache.clear();
        engine.load(0);
        // Every load starts from the engine defaults, then the scene's own look, then the caller's.
        Object.assign(engine.options, this.defaults);
        this.applyStyle({...definition.initialStyle, ...checkedStyle});
        this.definition = definition; this.source = source; this.motion = true;
        this.home = {...definition.camera};
        this.bounds = this.measure();
        // A loop stopped by the last scene's failure starts again with this one.
        if (this.loop === 'stopped') this.loop = 'on';
        this.resize();
        engine.resetCamera();
        if (camera) this.setCamera(camera);
        return ++this.commits;
      });
      // A moving character arrives after the scenery. A failure leaves the scenery usable.
      await engine.actorReady?.catch(() => {});
      this.requireLive();
      if (commit !== this.commits) throw superseded();
      if (!motion) this.setMotion(false);
    } finally {
      this.inFlight--;
      if (this.life.is('loading') && !this.inFlight) this.life.go(this.definition ? 'ready' : 'empty');
    }
    this.schedule();
    return this.describe();
  }

  applyStyle(style) {
    const engine = this.engine, {autoFocus, ...rest} = style;
    for (const [key, value] of Object.entries(rest)) engine.setStyle(key, toEngine(key, value));
    // The distance first, then automatic or manual focus, as the studio does.
    if (autoFocus !== undefined) engine.setStyle('autoFocus', autoFocus);
    engine.applyStyle(); engine.colorDirty = true; engine.dirty = true;
  }

  /** Change render options. Returns the full style now in effect. */
  setStyle(patch) {
    this.requireScene();
    this.applyStyle(validateStyle(patch));
    this.schedule();
    return this.getStyle();
  }
  getStyle() {
    const options = this.engine.options;
    return Object.fromEntries(STYLE_KEYS.map(key => [key, fromEngine(key, options[key] ?? STYLE_OPTIONS[key].default)]));
  }
  /** Back to the scene's own look. */
  resetStyle() {
    this.requireScene();
    Object.assign(this.engine.options, this.defaults);
    this.applyStyle({...this.definition.initialStyle});
    this.schedule();
    return this.getStyle();
  }

  checkCamera(camera) {
    const problems = [];
    if (!camera || typeof camera !== 'object') problems.push('A camera is {position, target, fov}.');
    else {
      for (const key of ['position', 'target']) if (camera[key] !== undefined && !finite3(camera[key])) problems.push(`"${key}" must be [x, y, z].`);
      if (camera.fov !== undefined && !(camera.fov >= 5 && camera.fov <= 120)) problems.push('"fov" must be from 5 to 120 degrees.');
      if (camera.focalLength !== undefined && !(camera.focalLength >= 1 && camera.focalLength <= 1000)) problems.push('"focalLength" must be from 1 to 1000 mm.');
      for (const key of Object.keys(camera)) if (!['position', 'target', 'fov', 'focalLength'].includes(key)) problems.push(`Unknown camera field "${key}". ${didYouMean(key, ['position', 'target', 'fov', 'focalLength'])}`);
    }
    if (problems.length) throw new SillageError('INVALID_CAMERA', problems.join(' '), {hint: 'For example {"position": [4, 3, 8], "target": [0, 1, 0], "fov": 35}. "getCamera" returns the current one.'});
  }
  /** Move the camera. Any of {position, target, fov, focalLength}; the rest stay. */
  setCamera(camera) {
    this.requireScene(); this.checkCamera(camera);
    const engine = this.engine, current = this.getCamera();
    const position = camera.position ?? current.position, target = camera.target ?? current.target;
    if (Math.hypot(...position.map((v, i) => v - target[i])) < .01) throw new SillageError('INVALID_CAMERA', 'The camera position and target are the same point.', {hint: 'Move the position away from the target.'});
    if (engine.limitedOrbit) engine.limitedOrbit.restore({position, target});
    else { engine.camera.position.fromArray(position); engine.controls.target.fromArray(target); engine.camera.lookAt(...target); engine.controls.update(); }
    if (camera.focalLength !== undefined) engine.setFocalLength(camera.focalLength);
    else if (camera.fov !== undefined) engine.setCameraFov(camera.fov);
    engine.dirty = true; engine.sortDirty = true;
    this.schedule();
    return this.getCamera();
  }
  getCamera() {
    const engine = this.engine;
    return {position: engine.camera.position.toArray().map(v => round(v)), target: engine.controls.target.toArray().map(v => round(v)), fov: round(engine.camera.fov, 3), focalLength: round(engine.getFocalLength(), 2)};
  }
  /** The scene's authored view. */
  resetCamera() { this.requireScene(); this.engine.resetCamera(); this.schedule(); return this.getCamera(); }
  /** Swing around the authored view: degrees around (yaw) and above (pitch) its
   * target; `zoom` above 1 moves closer. orbit(0, 0) is the authored view. */
  orbit(yaw = 0, pitch = 0, zoom = 1) {
    this.requireScene();
    if (![yaw, pitch, zoom].every(Number.isFinite) || zoom <= 0) throw new SillageError('INVALID_CAMERA', 'orbit takes yaw and pitch in degrees and a zoom above 0.');
    this.engine.resetCamera();
    const home = this.getCamera(), offset = home.position.map((v, i) => v - home.target[i]), radius = Math.hypot(...offset);
    const azimuth = Math.atan2(offset[0], offset[2]) + yaw * Math.PI / 180;
    const elevation = Math.max(-1.5, Math.min(1.5, Math.asin(offset[1] / radius) + pitch * Math.PI / 180)), distance = radius / zoom;
    return this.setCamera({position: [home.target[0] + distance * Math.sin(azimuth) * Math.cos(elevation), home.target[1] + distance * Math.sin(elevation), home.target[2] + distance * Math.cos(azimuth) * Math.cos(elevation)]});
  }
  /** Where world points land in the frame: [{x, y, depth, inFrame}], x and y
   * from 0 to 1 with the origin at the top-left, depth in world units. */
  project(points) {
    this.requireScene();
    if (!Array.isArray(points) || !points.every(finite3)) throw new SillageError('INVALID_POINTS', 'project takes a list of world points [[x, y, z], ...].');
    const camera = this.engine.camera;
    camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const view = camera.matrixWorldInverse.elements, projection = camera.projectionMatrix.elements;
    return points.map(([x, y, z]) => {
      const v = [0, 1, 2].map(row => view[row] * x + view[row + 4] * y + view[row + 8] * z + view[row + 12]), depth = -v[2];
      const sx = projection[0] * v[0] / depth, sy = projection[5] * v[1] / depth;
      return {x: round(.5 + sx / 2), y: round(.5 - sy / 2), depth: round(depth), inFrame: depth > 0 && Math.abs(sx) <= 1 && Math.abs(sy) <= 1};
    });
  }

  /** Play or freeze everything that moves: wind, characters, water light, seasons, opening sequences. */
  setMotion(playing) {
    this.requireScene();
    const engine = this.engine, on = Boolean(playing);
    engine.setWindPlaying(on); engine.setSporesPlaying(on && !engine.reefCaustics); engine.setActorPlaying(on); engine.setThermalPlaying(on);
    engine.cliffSeasons?.setPlaying(on); engine.causticClouds?.setPlaying(on); engine.reefCaustics?.setPlaying(on);
    if (engine.reefSequence) {
      // A frozen reef is shown fully revealed, not part-way through its opening.
      if (!on && engine.reefSequence.time < 14) { engine.reefSequence.seek(14); engine.applyReefNight(engine.reefSequence.nightAmount); }
      engine.reefSequence.playing = on; engine.reefSequence.lastTime = null;
    }
    if (!on) engine.setAutoOrbit(false);
    this.motion = on; engine.dirty = true;
    this.schedule();
    return on;
  }
  /** Scene-specific parameters; see `describe().parameters` for the ones this scene has. */
  setParameters(parameters) {
    this.requireScene();
    const engine = this.engine, available = this.parameters();
    for (const [key, value] of Object.entries(parameters ?? {})) {
      if (!PARAMETERS[key]) throw new SillageError('UNKNOWN_PARAMETER', `Unknown scene parameter "${key}".`, {hint: didYouMean(key, Object.keys(PARAMETERS))});
      if (!(key in available)) throw new SillageError('UNSUPPORTED_PARAMETER', `This scene has no "${key}".`, {hint: Object.keys(available).length ? `It has: ${Object.keys(available).join(', ')}.` : 'It has no scene parameters.'});
      if (key === 'season') {
        if (!(value >= 0 && value <= 1)) throw new SillageError('INVALID_PARAMETER', '"season" must be from 0 to 1.', {hint: PARAMETERS.season});
        engine.cliffSeasons.setPlaying(false); engine.cliffSeasons.seek(value);
      } else if (key === 'night') {
        if (typeof value !== 'boolean') throw new SillageError('INVALID_PARAMETER', '"night" must be true or false.');
        engine.setReefNight(value);
      }
    }
    engine.dirty = true; this.schedule();
    return this.parameters();
  }
  parameters() {
    const engine = this.engine, parameters = {};
    if (engine.cliffSeasons) parameters.season = round(engine.cliffSeasons.position);
    if (engine.reefCaustics) parameters.night = Number(engine.reefCaustics.night.value) > .5;
    return parameters;
  }

  measure() {
    const centers = this.engine.centers;
    if (!centers?.length) return null;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < centers.length; i += 3) for (let c = 0; c < 3; c++) { const v = centers[i + c]; if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v; }
    return {min: min.map(v => round(v, 3)), max: max.map(v => round(v, 3))};
  }

  /** Draw until the view is at rest: pending resizes, detail changes and
   * supersampling are finished. Motion, if playing, keeps going afterwards. */
  async renderFrame({timeout = 8000} = {}) {
    this.requireScene();
    const engine = this.engine, deadline = performance.now() + timeout;
    engine.dirty = true;
    try {
      do {
        await engine.waitForGPU();
        engine.render(performance.now());
        await engine.waitForGPU();
      } while (!this.gpuGone() && (engine.dirty || engine.resizePending || engine.lod?.animating || engine.stillPending) && !this.motion && performance.now() < deadline);
    } catch (error) { this.requireGPU(error); throw error; }
    this.requireGPU();
    return {...engine.stats, lod: undefined};
  }
  /** Throw GPU_LOST if the context went while drawing; without it a frame would come back blank. */
  requireGPU(cause = null) { if (this.gpuGone()) { this.lose(cause); throw this.lostError(); } }

  /** A PNG of the current view, as a Blob. The frame is drawn at up to
   * 1920 x 1200 and `scale` (1 to 4) multiplies that by supersampling. Give
   * `width` and/or `height` to resample to an exact size; the other side
   * follows the viewport's aspect. */
  async capture({width = null, height = null, scale = 1} = {}) {
    this.requireScene();
    for (const [name, value] of [['width', width], ['height', height]]) if (value !== null && !(Number.isInteger(value) && value >= 16 && value <= 7680)) throw new SillageError('INVALID_SIZE', `"${name}" must be a whole number of pixels from 16 to 7680.`);
    if (![1, 2, 3, 4].includes(scale)) throw new SillageError('INVALID_SIZE', '"scale" must be 1, 2, 3 or 4.');
    // One capture at a time, and never across a scene swap: each takes over the canvas size and the loop.
    return this.exclusive(() => this.take({width, height, scale}));
  }
  async take({width, height, scale}) {
    this.requireScene();
    const engine = this.engine;
    this.holds++; cancelAnimationFrame(this.frame); this.frame = 0;
    try {
      await this.renderFrame();
      const blob = await engine.exportPNG({scale}).catch(error => { this.requireGPU(error); throw error; });
      this.requireGPU();
      if (width === null && height === null) return blob;
      const bitmap = await createImageBitmap(blob), aspect = bitmap.width / bitmap.height;
      const w = width ?? Math.round(height * aspect), h = height ?? Math.round(width / aspect);
      if (w === bitmap.width && h === bitmap.height) { bitmap.close(); return blob; }
      // Halve until near the target, so a large reduction does not alias.
      let source = bitmap, sw = bitmap.width, sh = bitmap.height;
      const step = (image, tw, th) => { const canvas = new OffscreenCanvas(tw, th), context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, tw, th); return canvas; };
      while (sw / 2 >= w && sh / 2 >= h) { sw = Math.round(sw / 2); sh = Math.round(sh / 2); source = step(source, sw, sh); }
      const result = await step(source, w, h).convertToBlob({type: 'image/png'});
      bitmap.close();
      return result;
    } finally { this.holds--; this.schedule(); }
  }

  /** Everything about the current state, as plain JSON. */
  describe() {
    const engine = this.engine, definition = this.definition;
    if (!definition) return {state: this.state, scene: null, hint: this.life.is(...LIVE) ? 'Call load("alpine") or load(sceneDocument).' : 'This instance is finished. Create a new one with createSillage(canvas).'};
    const style = this.getStyle();
    return {
      state: this.state,
      scene: {id: definition.id ?? null, title: definition.label ?? definition.title ?? null, description: definition.description ?? definition.subtitle ?? '', source: this.source, ...(definition.aspect ? {aspect: definition.aspect} : {})},
      splats: engine.stats.count, bounds: this.bounds,
      camera: this.getCamera(), homeCamera: {position: this.home.position, target: this.home.target, ...(this.home.fov ? {fov: this.home.fov} : {}), ...(this.home.focalLength ? {focalLength: this.home.focalLength} : {})},
      style, styleNotes: styleNotes(style),
      features: {wind: Boolean(engine.hasWind), character: Boolean(engine.actor) || Boolean(engine.actorLoading), water: Boolean(engine.water), reflection: Boolean(engine.reflectionConfig), refraction: Boolean(engine.refraction),
        seasons: Boolean(engine.cliffSeasons), reef: Boolean(engine.reefCaustics), adaptiveDetail: Boolean(engine.lod), lockedOrbit: Boolean(engine.limitedOrbit)},
      parameters: this.parameters(), motion: this.motion,
      viewport: {width: engine.size.width, height: engine.size.height, renderWidth: engine.stats.width, renderHeight: engine.stats.height},
      ...(definition.report ? {report: definition.report} : {}),
      ...(engine.actorError ? {warnings: [`The scene's character could not be loaded: ${engine.actorError.message}`]} : {}),
    };
  }

  dispose() {
    if (!this.life.go('disposed')) return;
    cancelAnimationFrame(this.frame); this.frame = 0;
    document.removeEventListener('visibilitychange', this.onVisible);
    this.observer?.disconnect();
    this.engine.dispose();
  }
}

/** Create the engine on a canvas and, if `scene` is given, load it. */
export async function createSillage(canvas, {scene = null, style = null, camera = null, files = {}, motion = true, ...options} = {}) {
  const sillage = new Sillage(canvas, options);
  if (scene !== null) {
    try { await sillage.load(scene, {style, camera, files, motion}); }
    catch (error) { sillage.dispose(); throw error; }
  }
  return sillage;
}
export const SCENE_PARAMETERS = PARAMETERS;
