/** The page behind /sillage.html: one canvas and the Sillage API.
 *
 *   /sillage.html?scene=alpine                 a built-in scene
 *   /sillage.html?template=tree                a starter document
 *   /sillage.html?doc=/scenes/mine.json        a scene document served by this site
 *   ...&style.mode=gouache&style.softness=0.3  render options
 *   ...&motion=0                               start frozen
 *
 * `window.sillage.api` is the Sillage instance. `window.sillage.call(method,
 * params)` is the same API as JSON in, JSON out, which is what the command
 * line and the MCP server drive in a headless browser.
 *
 * `window.sillage.state` is where the page is: "booting" until the API can be
 * called, then "ready", or "failed" with `window.sillage.error` if it could
 * not start or lost its GPU context. The scene's own state is `api.state`. */
import {createSillage, Sillage} from './index.js';
import {SillageError, errorJSON} from './errors.js';
import {STYLE_OPTIONS, validateStyle} from './styles.js';
import {starterScene} from './scene.js';
import {createMachine, HOST_STATES} from './machine.js';

const canvas = document.querySelector('canvas'), caption = document.querySelector('#caption'), errorElement = document.querySelector('#error');
const params = new URLSearchParams(location.search), headless = params.has('headless');

const dataURL = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
const decode = files => Object.fromEntries(Object.entries(files ?? {}).map(([path, base64]) => [path, Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer]));

const page = createMachine('The Sillage page', 'booting', HOST_STATES);

function show(description) {
  canvas.removeAttribute('aria-busy');
  if (!caption) return;
  // Nothing loaded: say nothing rather than leave "Loading" up.
  if (!description.scene) { caption.textContent = ''; return; }
  const title = description.scene.title ?? 'Sillage';
  document.title = `${title} · Sillage`;
  caption.textContent = `${title} · ${description.splats.toLocaleString()} marks · Drag to orbit, scroll to zoom, R resets the view`;
  canvas.setAttribute('aria-label', `${title}. ${description.scene.description ?? ''} Drag to orbit, scroll to zoom. R restores the view.`.replace(/\s+/g, ' '));
}
/** The largest scenes take several seconds to arrive: say what is coming meanwhile. */
function showLoading(scene) {
  canvas.setAttribute('aria-busy', 'true');
  const name = typeof scene === 'string' ? scene : typeof scene?.title === 'string' ? scene.title : 'the scene';
  if (caption) caption.textContent = `Loading ${name}…`;
}
function fail(error) {
  console.error(error);
  errorElement.textContent = [error?.message ?? String(error), error?.hint].filter(Boolean).join('\n');
  errorElement.hidden = false;
  // Without its GPU context the page cannot draw again.
  if (error?.code === 'GPU_LOST' && page.can('failed')) { host.error = errorJSON(error); page.go('failed'); }
}

const methods = {
  /** {scene: id | document, style?, camera?, files?: {path: base64}, motion?} */
  async load({scene, style, camera, files, motion = true}) {
    showLoading(scene);
    // A load that fails or is overtaken leaves the caption on whatever is in fact shown.
    const description = await host.api.load(scene, {style, camera, files: decode(files), motion}).catch(error => { if (host.api.state !== 'loading') show(host.api.describe()); throw error; });
    show(description); errorElement.hidden = true;
    return description;
  },
  describe: () => host.api.describe(),
  setStyle: ({style}) => host.api.setStyle(style),
  resetStyle: () => host.api.resetStyle(),
  setCamera: ({camera}) => host.api.setCamera(camera),
  resetCamera: () => host.api.resetCamera(),
  orbit: ({yaw = 0, pitch = 0, zoom = 1}) => host.api.orbit(yaw, pitch, zoom),
  setMotion: ({playing}) => host.api.setMotion(playing),
  setParameters: ({parameters}) => host.api.setParameters(parameters),
  project: ({points}) => host.api.project(points),
  resize: ({width, height}) => { host.api.resize(width, height); return host.api.describe().viewport; },
  /** Let a moving scene run for a while before a capture. */
  async wait({seconds = 1}) {
    const end = performance.now() + Math.max(0, Math.min(30, seconds)) * 1000, engine = host.api.engine;
    while (performance.now() < end) { await engine.waitForGPU(); engine.render(performance.now()); await new Promise(resolve => setTimeout(resolve, 33)); }
    return {waited: seconds};
  },
  /** {width?, height?, scale?} -> {image: PNG data URL, width, height} */
  async capture(options = {}) {
    const blob = await host.api.capture(options), bitmap = await createImageBitmap(blob), size = {width: bitmap.width, height: bitmap.height};
    bitmap.close();
    return {image: await dataURL(blob), ...size};
  },
  /** One image of several orbit views, labelled: {views: [{yaw, pitch, zoom?}], columns?, cellWidth?}. */
  async sheet({views, columns = null, cellWidth = 512}) {
    if (!Array.isArray(views) || !views.length || views.length > 16) throw new SillageError('INVALID_VIEWS', 'A sheet takes 1 to 16 views.', {hint: 'For example [{"yaw": 0}, {"yaw": 90}, {"yaw": 180}, {"yaw": 270}].'});
    const cells = [], home = host.api.getCamera();
    for (const {yaw = 0, pitch = 0, zoom = 1} of views) {
      host.api.orbit(yaw, pitch, zoom);
      cells.push({yaw, pitch, zoom, bitmap: await createImageBitmap(await host.api.capture({width: cellWidth}))});
    }
    host.api.setCamera(home);
    const cols = columns ?? Math.ceil(Math.sqrt(cells.length)), rows = Math.ceil(cells.length / cols), w = cells[0].bitmap.width, h = cells[0].bitmap.height, gap = 6;
    const sheet = new OffscreenCanvas(cols * w + (cols - 1) * gap, rows * h + (rows - 1) * gap), context = sheet.getContext('2d');
    context.fillStyle = '#16181c'; context.fillRect(0, 0, sheet.width, sheet.height);
    context.font = '600 15px system-ui, sans-serif'; context.textBaseline = 'top';
    for (const [i, cell] of cells.entries()) {
      const x = (i % cols) * (w + gap), y = Math.floor(i / cols) * (h + gap), label = `${i + 1}  yaw ${cell.yaw}°  pitch ${cell.pitch}°${cell.zoom !== 1 ? `  zoom ${cell.zoom}×` : ''}`;
      context.drawImage(cell.bitmap, x, y); cell.bitmap.close();
      context.fillStyle = 'rgba(12, 14, 18, .78)'; context.fillRect(x, y, context.measureText(label).width + 16, 26);
      context.fillStyle = '#f2efe6'; context.fillText(label, x + 8, y + 6);
    }
    return {image: await dataURL(await sheet.convertToBlob({type: 'image/png'})), width: sheet.width, height: sheet.height, views: cells.map(({yaw, pitch, zoom}) => ({yaw, pitch, zoom}))};
  },
};

const host = window.sillage = {
  /** "booting", "ready" or "failed". `ready` is the same fact as a boolean. */
  get state() { return page.state; },
  get ready() { return page.is('ready'); },
  error: null, api: null, methods: Object.keys(methods),
  /** Run one API method. Never throws: {ok: true, result} or {ok: false, error: {code, message, hint}}. */
  async call(method, parameters = {}) {
    try {
      if (!methods[method]) throw new SillageError('UNKNOWN_METHOD', `No method "${method}".`, {hint: `Methods: ${Object.keys(methods).join(', ')}.`});
      return {ok: true, result: await methods[method](parameters ?? {})};
    } catch (error) { return {ok: false, error: errorJSON(error)}; }
  },
};

function styleFromURL() {
  const style = {};
  for (const [name, text] of params) {
    if (!name.startsWith('style.')) continue;
    const key = name.slice(6), type = STYLE_OPTIONS[key]?.type;
    style[key] = type === 'number' ? Number(text) : type === 'boolean' ? text === 'true' || text === '1' : text;
  }
  return validateStyle(style);
}

async function boot() {
  // Let layout settle so the canvas has its size. A page opened in a hidden tab
  // gets no animation frames, and must still load: do not wait for them long.
  await Promise.race([new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise(resolve => setTimeout(resolve, 150))]);
  // The headless driver draws on demand and loads its own scene.
  host.api = headless ? new Sillage(canvas, {loop: false, onError: fail}) : await createSillage(canvas, {onError: fail});
  if (!headless) {
    let scene = params.get('scene');
    if (params.get('doc')) {
      const response = await fetch(params.get('doc'), {cache: 'no-store'});
      if (!response.ok) throw new SillageError('MISSING_FILE', `No scene document at ${params.get('doc')}.`, {hint: 'Put the file under public/ and give its path from the site root.'});
      scene = await response.json();
    } else if (!scene) scene = starterScene(params.get('template') ?? 'still-life');
    await methods.load({scene, style: styleFromURL(), motion: params.get('motion') !== '0'});
  }
  page.go('ready');
}
window.addEventListener('keydown', event => {
  if (!host.api?.definition || !['ready', 'loading'].includes(host.api.state) || event.altKey || event.ctrlKey || event.metaKey || event.code !== 'KeyR') return;
  host.api.resetCamera(); event.preventDefault();
});
window.addEventListener('pagehide', () => host.api?.dispose(), {once: true});
boot().catch(error => { host.error = errorJSON(error); if (page.can('failed')) page.go('failed'); canvas.removeAttribute('aria-busy'); if (caption) caption.textContent = ''; fail(error); });
