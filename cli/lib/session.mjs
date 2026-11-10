/** A headless Sillage: the real renderer in a headless browser, driven from Node.
 *
 *   const session = await openSession({width: 1280, height: 800});
 *   await session.load('alpine', {style: {mode: 'gouache'}, motion: false});
 *   await session.orbit(40, 10);
 *   const {png} = await session.capture({width: 1024});   // Buffer
 *   await session.close();
 *
 * The page is /sillage.html, served by a running dev server if there is one
 * and by a private Vite server otherwise.
 *
 * A session is always in one state, `session.state`:
 *
 *   closed    nothing is running                    open() -> opening
 *   opening   starting the server, browser and page -> open, or back to closed
 *   open      calls work                            close() -> closed
 *   broken    the page stalled, crashed or lost
 *             its GPU; every call throws CLOSED     close() -> closed
 *
 * A session that fails to open releases everything it started. */
import {readFile, access} from 'node:fs/promises';
import {dirname, extname, isAbsolute, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SillageError, didYouMean} from '../../src/sillage/errors.js';
import {createMachine, SESSION_STATES} from '../../src/sillage/machine.js';
import {isSceneDocument, sceneFiles, validateScene} from '../../src/sillage/scene.js';
import {sceneIds, currentSceneId} from '../../src/sillage/catalog.js';
import {rendererStyle} from '../../src/splat/atelier/media.js';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MARKER = 'sillage-host';
const exists = path => access(path).then(() => true, () => false);
/** Reject if a step takes longer than it ever should. */
function within(promise, ms, what) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new SillageError('PAGE_TIMEOUT', `${what} took longer than ${ms / 1000} seconds.`)), ms); })]).finally(() => clearTimeout(timer));
}

/** Turn what a caller named into something the page can load:
 * a built-in id, a scene document (object or .json path), an Atelier painting
 * spec, or a .splat file. Returns {scene, files, name, baseDir, kind}. */
export async function resolveScene(input, {cwd = process.cwd()} = {}) {
  let scene = input, baseDir = cwd, name = 'scene', kind = 'document';
  if (typeof input === 'string') {
    if (sceneIds().includes(currentSceneId(input))) return {scene: currentSceneId(input), files: {}, name: currentSceneId(input), baseDir, kind: 'built-in'};
    const path = isAbsolute(input) ? input : resolve(cwd, input);
    if (!await exists(path)) {
      const looksLikePath = /[\\/.]/.test(input);
      throw new SillageError(looksLikePath ? 'MISSING_FILE' : 'UNKNOWN_SCENE', looksLikePath ? `No file at ${path}.` : `"${input}" is not a built-in scene or a file.`,
        {hint: looksLikePath ? 'Give a path to a scene .json or a .splat file, or a built-in scene id ("sillage scenes").' : `${didYouMean(input, sceneIds())} "sillage scenes" lists the built-in scenes; a path to a scene .json also works.`});
    }
    baseDir = dirname(path); name = path.split(/[\\/]/).at(-1).replace(/\.[^.]+$/, '').replace(/\.scene$/, '');
    if (extname(path).toLowerCase() === '.splat') { scene = {sillage: 1, title: name, background: '#20242b', lighting: 'flat', content: [{type: 'splatFile', file: path}]}; kind = 'splat file'; }
    else {
      try { scene = JSON.parse(await readFile(path, 'utf8')); }
      catch (error) { throw new SillageError('INVALID_SCENE', `${path} is not valid JSON: ${error.message}`, {hint: 'A scene file is a JSON object with a "content" list. "sillage new scene.json" writes a starting point.'}); }
    }
  }
  // An Atelier painting spec renders as a one-item scene in its own medium.
  if (scene && typeof scene === 'object' && Array.isArray(scene.objects) && scene.medium && !scene.content) {
    scene = {sillage: 1, title: scene.title ?? name, background: scene.background, camera: scene.camera, style: rendererStyle(scene), lighting: 'flat', content: [{type: 'painting', spec: scene}]};
    kind = 'painting spec';
  }
  if (!isSceneDocument(scene)) throw new SillageError('INVALID_SCENE', 'That is not a scene: it has no "content" list.', {hint: 'A scene is a built-in id, or a JSON object like {"content": [{"type": "ellipsoid", "radius": 1}]}. See "sillage schema".'});
  const {errors} = validateScene(scene);
  if (errors.length) throw new SillageError('INVALID_SCENE', `The scene has ${errors.length} problem${errors.length > 1 ? 's' : ''}: ${errors.slice(0, 6).map(error => `${error.path}: ${error.message}`).join(' ')}`, {hint: errors.find(error => error.hint)?.hint ?? null, details: errors});
  const files = {};
  for (const file of sceneFiles(scene)) {
    const path = isAbsolute(file) ? file : resolve(baseDir, file);
    try { files[file] = await readFile(path); }
    catch { throw new SillageError('MISSING_FILE', `The scene refers to "${file}", but there is no file at ${path}.`, {hint: 'Paths in a scene are relative to the scene file.'}); }
  }
  return {scene, files, name: typeof scene.title === 'string' && name === 'scene' ? scene.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || name : name, baseDir, kind};
}

async function findServer(candidates) {
  for (const url of candidates) {
    const ok = await fetch(`${url}/sillage.html`, {signal: AbortSignal.timeout(1500)}).then(async response => response.ok && (await response.text()).includes(MARKER), () => false);
    if (ok) return url;
  }
  return null;
}

export {SESSION_STATES};

export class Session {
  constructor() {
    this.page = this.browser = this.server = this.launched = null; this.url = null; this.startedServer = false; this.pageErrors = []; this.callTimeout = 180000;
    this.life = createMachine('The session', 'closed', SESSION_STATES); this.brokenBy = null; this.loaded = null;
  }
  /** 'closed', 'opening', 'open' or 'broken'; see SESSION_STATES. */
  get state() { return this.life.state; }

  /** @param {{width?: number, height?: number, url?: string, headed?: boolean}} options
   * `url` is the origin of a running Sillage dev server; without it, ports 5180 and 5181 are tried and then a private server is started. */
  async open(options = {}) {
    // A broken session is closed first, so "close it and open a new one" can be the same object.
    if (this.life.is('broken')) await this.close();
    if (!this.life.is('closed')) throw new SillageError('ALREADY_OPEN', `This session is already ${this.state}.`, {hint: 'Call close() first, or openSession() for a second one.'});
    this.life.go('opening'); this.brokenBy = null; this.pageErrors = [];
    try {
      await this.start(options);
      // close() may have been called while the browser was starting.
      if (!this.life.is('opening')) throw new SillageError('CLOSED', 'The session was closed while it was opening.');
      this.life.go('open');
      return this;
    } catch (error) {
      // Whatever started is stopped: a server or browser left running would keep the process alive.
      await this.release();
      if (this.life.is('opening')) this.life.go('closed');
      throw error;
    }
  }
  async start({width = 1280, height = 800, url = process.env.SILLAGE_URL ?? null, headed = false} = {}) {
    if (!(Number.isInteger(width) && Number.isInteger(height) && width >= 64 && height >= 64 && width <= 3840 && height <= 2400)) throw new SillageError('INVALID_SIZE', `A viewport of ${width} x ${height} is not supported.`, {hint: 'Use whole numbers from 64 to 3840 wide and 64 to 2400 tall, for example 1280x800.'});
    if (url) {
      this.url = await findServer([url.replace(/\/$/, '')]);
      if (!this.url) throw new SillageError('NO_SERVER', `No Sillage page answers at ${url}/sillage.html.`, {hint: 'Start one with "sillage serve", or drop --url to let the command start its own.'});
    } else this.url = await findServer(['http://127.0.0.1:5180', 'http://127.0.0.1:5181']);
    if (!this.url) {
      const {createServer} = await import('vite');
      this.server = await createServer({root: ROOT, logLevel: 'error', server: {host: '127.0.0.1', port: 5183, strictPort: false}});
      await this.server.listen();
      this.url = `http://127.0.0.1:${this.server.config.server.port}`; this.startedServer = true;
    }
    let chromium;
    try { ({chromium} = await import('playwright')); }
    catch { throw new SillageError('NO_BROWSER', 'Playwright is not installed.', {hint: `Run "npm install" in ${ROOT}.`}); }
    // Installed Chrome has the GPU path the renderer needs. It occasionally
    // stalls right after launch without failing, so every step is timed and a
    // stalled browser is killed and replaced.
    let failure;
    for (const channel of ['chrome', 'chrome', null]) {
      let launched = null;
      try {
        launched = await chromium.launchServer({headless: !headed, ...(channel ? {channel} : {}), args: ['--ignore-gpu-blocklist', '--enable-gpu'], timeout: 25000});
        this.browser = await within(chromium.connect(launched.wsEndpoint()), 15000, 'Connecting to the browser');
        this.page = await within(this.browser.newPage({viewport: {width, height}, deviceScaleFactor: 1}), 15000, 'Opening a page');
        this.launched = launched;
        break;
      } catch (error) {
        failure = error; this.browser = this.page = null;
        await launched?.kill().catch(() => {});
      }
    }
    if (!this.page) throw new SillageError('NO_BROWSER', `Could not start a headless browser: ${String(failure?.message).split('\n')[0]}`, {hint: 'Install Google Chrome, or run "npx playwright install chromium".'});
    this.size = {width, height};
    // A file saved mid-render would hot-reload the page: drop those messages.
    await within(this.page.routeWebSocket('**', socket => {
      const server = socket.connectToServer();
      server.onMessage(message => { let event; try { event = JSON.parse(String(message)); } catch {} if (!['update', 'full-reload', 'prune'].includes(event?.type)) socket.send(message); });
    }), 15000, 'Preparing the page');
    this.page.on('pageerror', error => this.pageErrors.push(error.message));
    // A page that goes away by itself leaves the session broken, not silently unusable.
    const page = this.page, browser = this.browser, gone = reason => () => { if (this.page === page) this.break(reason); };
    page.on('crash', gone('the page crashed')); page.on('close', gone('the page was closed')); browser.on('disconnected', gone('the browser quit'));
    await this.page.goto(`${this.url}/sillage.html?headless=1`);
    try { await this.page.waitForFunction(() => window.sillage?.ready || window.sillage?.error, null, {timeout: 60000}); }
    catch { throw new SillageError('PAGE_TIMEOUT', 'The Sillage page did not start within 60 seconds.', {hint: this.pageErrors.length ? `Page errors: ${this.pageErrors.slice(0, 3).join(' | ')}` : `Open ${this.url}/sillage.html in a browser to see what it reports.`}); }
    const error = await this.page.evaluate(() => window.sillage.error);
    if (error) throw new SillageError(error.code ?? 'PAGE_ERROR', error.message, {hint: error.hint});
  }

  /** The page can no longer be trusted to answer: every later call says so at once. */
  break(reason) { if (this.life.is('open')) { this.brokenBy = reason; this.life.go('broken'); } }
  requireOpen() {
    if (this.life.is('broken')) throw new SillageError('CLOSED', `The session is broken: ${this.brokenBy}.`, {hint: 'Close it and open a new one. The command line and the MCP server do so by themselves on the next call.'});
    if (!this.life.is('open')) throw new SillageError('CLOSED', `The session is ${this.state}, not open.`, {hint: 'Open one with openSession().'});
  }

  /** Call one method of the page API; see `src/sillage/host.js`. */
  async call(method, parameters = {}) {
    this.requireOpen();
    // The largest scenes load in about ten seconds; nothing legitimate takes minutes.
    const reply = await within(this.page.evaluate(([method, parameters]) => window.sillage.call(method, parameters), [method, parameters]), this.callTimeout, `"${method}"`).catch(error => {
      if (error instanceof SillageError) {
        this.break('the page stopped answering');
        throw new SillageError(error.code, error.message, {hint: 'The page stopped answering, so this session is now broken. Close it and open a new one (the command line and the MCP server do so on the next call); if it repeats, try a smaller size or scene.'});
      }
      // The page API never throws across this boundary: this is the page itself going away.
      if (this.life.is('open') && (this.page?.isClosed() || !this.browser?.isConnected() || /crash|closed|destroyed|detached/i.test(String(error?.message)))) this.break('the page went away');
      if (!this.life.is('open')) throw new SillageError('CLOSED', `The session ${this.life.is('broken') ? `is broken: ${this.brokenBy}` : 'was closed'} before "${method}" finished.`, {hint: 'Open a new one. The command line and the MCP server do so by themselves on the next call.'});
      throw error;
    });
    if (!reply.ok) {
      if (reply.error.code === 'GPU_LOST') this.break('the page lost its GPU context');
      throw new SillageError(reply.error.code, reply.error.message, {hint: reply.error.hint, details: reply.error.details});
    }
    return reply.result;
  }

  /** Load a built-in id, a document, or a path to a .json / .splat file. Returns the description. */
  async load(input, {style, camera, motion = false, cwd} = {}) {
    const resolved = await resolveScene(input, {cwd});
    const files = Object.fromEntries(Object.entries(resolved.files).map(([path, bytes]) => [path, Buffer.from(bytes).toString('base64')]));
    const description = await this.call('load', {scene: resolved.scene, style, camera, files, motion});
    // What the page is in fact showing: a load that failed leaves the scene before it.
    this.loaded = resolved;
    return description;
  }
  describe() { return this.call('describe'); }
  setStyle(style) { return this.call('setStyle', {style}); }
  setCamera(camera) { return this.call('setCamera', {camera}); }
  orbit(yaw = 0, pitch = 0, zoom = 1) { return this.call('orbit', {yaw, pitch, zoom}); }
  setMotion(playing) { return this.call('setMotion', {playing}); }
  setParameters(parameters) { return this.call('setParameters', {parameters}); }
  project(points) { return this.call('project', {points}); }
  wait(seconds) { return this.call('wait', {seconds}); }
  async resize(width, height) { this.requireOpen(); await this.page.setViewportSize({width, height}); this.size = {width, height}; return this.call('resize', {width, height}); }

  /** {width?, height?, scale?} -> {png: Buffer, width, height} */
  async capture(options = {}) {
    const {image, width, height} = await this.call('capture', options);
    return {png: Buffer.from(image.slice(image.indexOf(',') + 1), 'base64'), width, height};
  }
  /** Several orbit views in one labelled image: {views, columns?, cellWidth?} -> {png, width, height, views} */
  async sheet(options) {
    const {image, ...rest} = await this.call('sheet', options);
    return {png: Buffer.from(image.slice(image.indexOf(',') + 1), 'base64'), ...rest};
  }

  /** Safe in any state, and more than once. */
  async close() {
    await this.release();
    this.life.go('closed'); this.loaded = null;
  }
  /** Stop the browser and the private server, whichever of them started. */
  async release() {
    const {browser, launched, server} = this;
    // Cleared first, so the page going away below is not mistaken for a crash.
    this.page = this.browser = this.server = this.launched = null; this.startedServer = false;
    await within(Promise.resolve(browser?.close()), 5000, 'Closing the browser').catch(() => {});
    await launched?.kill().catch(() => {});
    await server?.close().catch(() => {});
  }
}

export async function openSession(options) { return new Session().open(options); }
