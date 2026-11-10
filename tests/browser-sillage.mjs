/** End-to-end check of the Sillage API in a real headless browser:
 *
 *   node tests/browser-sillage.mjs
 *
 * Uses a dev server on 5180/5181 if one is running (or SILLAGE_URL), else
 * starts its own. Writes its images to output/sillage/check/. */
import assert from 'node:assert/strict';
import {mkdir, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {inflateSync} from 'node:zlib';
import {openSession, starterScene, createContext, runTool, ROOT, serveMCP, Session} from '../cli/index.mjs';
import {createServer} from 'node:http';
import {PassThrough} from 'node:stream';

const out = join(ROOT, 'output', 'sillage', 'check');
await mkdir(out, {recursive: true});

/** Decode an 8-bit RGB/RGBA PNG far enough to read its pixels. */
function pixels(png) {
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), channels = png[25] === 6 ? 4 : 3, chunks = [];
  for (let at = 8; at < png.length;) { const size = png.readUInt32BE(at), type = png.toString('ascii', at + 4, at + 8); if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + size)); at += size + 12; }
  const raw = inflateSync(Buffer.concat(chunks)), stride = width * channels, data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[y * stride + x - channels] : 0, b = y ? data[(y - 1) * stride + x] : 0, c = x >= channels && y ? data[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c, paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      data[y * stride + x] = (line[x] + [0, a, b, (a + b) >> 1, paeth][filter]) & 255;
    }
  }
  return {width, height, channels, data, at: (x, y) => [...data.subarray((Math.round(y * (height - 1)) * width + Math.round(x * (width - 1))) * channels).subarray(0, 3)]};
}
const difference = (a, b) => { let sum = 0; for (let i = 0; i < a.data.length; i++) sum += Math.abs(a.data[i] - b.data[i]); return sum / a.data.length; };
const step = async (name, work) => { const started = performance.now(); await work(); console.log(`ok  ${name} (${Math.round(performance.now() - started)} ms)`); };

const session = await openSession({width: 800, height: 600});
console.log(`page: ${session.url}/sillage.html${session.startedServer ? ' (own server)' : ''}`);
try {
  let first;
  await step('a scene document loads and draws what it describes', async () => {
    const description = await session.load({background: '#102030', lighting: 'flat', camera: {position: [0, 0, 6], target: [0, 0, 0], fov: 40}, style: {mode: 'paint'},
      content: [{id: 'ball', type: 'ellipsoid', radius: 1, count: 1500, color: '#e03020'}]});
    assert.equal(description.splats, 1500);
    assert.deepEqual([description.scene.source, description.style.sun, description.motion], ['document', false, false]);
    const shot = await session.capture({width: 400});
    await writeFile(join(out, 'ball.png'), shot.png);
    first = pixels(shot.png);
    assert.deepEqual([first.width, first.height], [400, 300]);
    const centre = first.at(.5, .5), corner = first.at(.03, .03);
    assert.ok(centre[0] > 180 && centre[1] < 90 && centre[2] < 80, `the ball is red at the centre: ${centre}`);
    assert.ok(Math.abs(corner[0] - 16) < 6 && Math.abs(corner[1] - 32) < 6 && Math.abs(corner[2] - 48) < 6, `the background shows in the corner: ${corner}`);
  });

  await step('a frozen scene draws the same image twice', async () => {
    const again = pixels((await session.capture({width: 400})).png);
    assert.ok(difference(first, again) < .5, 'two captures of a still scene match');
  });

  await step('camera, orbit and projection agree', async () => {
    const [centre, right] = await session.project([[0, 0, 0], [1, 0, 0]]);
    assert.deepEqual([centre.x, centre.y, centre.depth, centre.inFrame], [.5, .5, 6, true]);
    assert.ok(right.x > .6 && right.y === .5);
    const side = await session.orbit(90, 0);
    assert.ok(Math.abs(side.position[0] - 6) < 1e-3 && Math.abs(side.position[2]) < 1e-3, `orbit 90 looks from +X: ${side.position}`);
    assert.ok(Math.abs((await session.project([[0, 0, 1]]))[0].x - .5) > .1);
    const moved = await session.setCamera({position: [0, 4, 8], fov: 30});
    assert.deepEqual([moved.position, moved.target, moved.fov], [[0, 4, 8], [0, 0, 0], 30]);
    await assert.rejects(session.setCamera({position: [0, 0, 0], target: [0, 0, 0]}), {code: 'INVALID_CAMERA'});
    await assert.rejects(session.setCamera({positon: [1, 2, 3]}), error => /"position"/.test(error.message));
    await session.orbit(0, 0);
  });

  await step('style changes are validated and change the picture', async () => {
    const style = await session.setStyle({mode: 'gaussian', softness: .6, brushScale: .4});
    assert.deepEqual([style.mode, style.softness, style.brushScale], ['gaussian', .6, .4]);
    const small = pixels((await session.capture({width: 400})).png);
    await writeFile(join(out, 'ball-small-marks.png'), (await session.capture({width: 400})).png);
    // Marks at 40% size no longer cover the ball: the picture changes where the ball is.
    assert.ok(difference(first, small) > 1.5, `small soft marks differ from full painted ones: ${difference(first, small)}`);
    assert.equal((await session.call('resetStyle')).brushScale, 1);
    assert.ok(difference(first, pixels((await session.capture({width: 400})).png)) < .5, 'resetStyle restores the scene\'s own look');
    await assert.rejects(session.setStyle({softnes: 1}), error => error.code === 'INVALID_STYLE' && /"softness"/.test(error.hint));
    await assert.rejects(session.setParameters({season: .5}), {code: 'UNSUPPORTED_PARAMETER'});
    await assert.rejects(session.load({content: [{type: 'cube'}]}), {code: 'INVALID_SCENE'});
    await assert.rejects(session.call('nope'), {code: 'UNKNOWN_METHOD'});
  });

  await step('a sheet shows several sides in one image', async () => {
    await session.load(starterScene('tree'));
    const sheet = await session.sheet({views: [{yaw: 0}, {yaw: 120}, {yaw: 240}], columns: 3, cellWidth: 256});
    await writeFile(join(out, 'tree-views.png'), sheet.png);
    assert.deepEqual([sheet.width, sheet.height, sheet.views.length], [3 * 256 + 12, 192, 3]);
    assert.deepEqual((await session.describe()).camera.position, (await session.describe()).homeCamera.position, 'the view is restored');
  });

  await step('a built-in scene loads with its own look, and its parameters work', async () => {
    const description = await session.load('cliff-talus');
    assert.ok(description.splats > 100000 && description.features.seasons && 'season' in description.parameters);
    assert.equal(description.scene.source, 'built-in');
    const summer = pixels((await session.capture({width: 320})).png);
    assert.equal((await session.setParameters({season: .5})).season, .5);
    const winter = pixels((await session.capture({width: 320})).png);
    await writeFile(join(out, 'cliff-winter.png'), (await session.capture({width: 640})).png);
    assert.ok(difference(summer, winter) > 8, 'winter looks different from summer');
    await assert.rejects(session.load('cliff'), error => error.code === 'UNKNOWN_SCENE' && /cliff-talus/.test(error.hint));
  });
  await step('the instance, the page and the session each say what state they are in', async () => {
    assert.equal((await session.describe()).state, 'ready');
    assert.deepEqual(await session.page.evaluate(() => [window.sillage.state, window.sillage.ready, window.sillage.error, window.sillage.api.state]), ['ready', true, null, 'ready']);
    assert.equal(session.state, 'open');
    // A load refused for its input leaves the scene before it loaded and described.
    await assert.rejects(session.call('load', {scene: 'cliff'}), {code: 'UNKNOWN_SCENE'});
    const after = await session.describe();
    assert.deepEqual([after.state, after.scene.id], ['ready', 'cliff-talus']);
    assert.match(await session.page.evaluate(() => document.querySelector('#caption').textContent), /marks/, 'the caption is back on the scene shown, not left on "Loading"');
  });

  await step('a looping instance survives overlapping captures and loads, and refuses calls once disposed', async () => {
    const result = await session.page.evaluate(async () => {
      const {createSillage, starterScene} = await import('/src/sillage/index.js');
      const canvas = Object.assign(document.createElement('canvas'), {style: 'position:fixed;left:0;top:0;width:320px;height:240px'});
      document.body.append(canvas);
      const states = [], code = promise => promise.then(() => 'ok', error => error.code), frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const sillage = await createSillage(canvas, {onState: (state, previous) => states.push(`${previous}>${state}`)});
      const out = {empty: [sillage.state, sillage.describe().state, await code(sillage.capture())]};
      await sillage.load(starterScene('minimal'));
      out.loaded = [...states];
      // Two captures asked for together used to leave the draw loop switched off for good.
      const [a, b] = await Promise.all([sillage.capture({width: 160}), sillage.capture({width: 160})]);
      let frames = 0; sillage.onFrame = () => frames++;
      sillage.orbit(30, 0); await frame(); await frame(); await new Promise(resolve => setTimeout(resolve, 400));
      out.captures = [a.size > 500, b.size > 500, sillage.looping, frames > 0];
      // A newer load wins and the one it overtakes says so.
      const slow = code(sillage.load(starterScene('tree'))), fast = sillage.load(starterScene('still-life'));
      out.overlap = [sillage.state, await slow, (await fast).scene.title, sillage.state];
      // A load refused for its input changes nothing, and does not overtake one in flight.
      const kept = sillage.load(starterScene('minimal')), refused = await code(sillage.load({content: [{type: 'cube'}]}));
      out.refused = [refused, (await kept).state, sillage.state];
      // A capture asked for while a scene is being swapped in waits for the whole scene.
      const next = sillage.load(starterScene('tree')), shot = sillage.capture({width: 160});
      out.swap = [(await next).scene.title, (await shot).size > 500, sillage.describe().scene.title];
      sillage.dispose();
      out.disposed = [sillage.state, sillage.describe().state, await code(sillage.load(starterScene('minimal'))), await code(Promise.resolve().then(() => sillage.setStyle({softness: .5}))), await code(sillage.capture()), states.at(-1)];
      sillage.dispose(); canvas.remove();
      return out;
    });
    const titles = Object.fromEntries(['minimal', 'tree', 'still-life'].map(name => [name, starterScene(name).title]));
    assert.deepEqual(result.empty, ['empty', 'empty', 'NO_SCENE']);
    assert.deepEqual(result.loaded, ['empty>loading', 'loading>ready']);
    assert.deepEqual(result.captures, [true, true, true, true], 'both captures arrive and the loop still draws');
    assert.deepEqual(result.overlap, ['loading', 'SUPERSEDED', titles['still-life'], 'ready']);
    assert.deepEqual(result.refused, ['INVALID_SCENE', 'ready', 'ready']);
    assert.deepEqual(result.swap, [titles.tree, true, titles.tree]);
    assert.deepEqual(result.disposed, ['disposed', 'disposed', 'DISPOSED', 'DISPOSED', 'DISPOSED', 'ready>disposed']);
  });
  assert.deepEqual(session.pageErrors, [], 'no page errors');
} finally { await session.close(); }
assert.equal(session.state, 'closed');
await assert.rejects(session.describe(), {code: 'CLOSED'});

await step('the render tools write images, through the command-line path and over MCP', async () => {
  const context = createContext({cwd: out});
  try {
    const rendered = await runTool('render', {scene: starterScene('still-life'), width: 640, height: 480, orbit: {yaw: 20, pitch: 5}, output: 'still.png'}, context);
    assert.deepEqual([rendered.data.width, rendered.data.height, rendered.data.image], [640, 480, join(out, 'still.png')]);
    assert.equal(pixels(rendered.images[0].png).width, 640);
    const views = await runTool('render_views', {scene: 'alpine', count: 3, cellWidth: 200, output: 'alpine-views.png'}, context);
    assert.deepEqual(views.data.views.map(view => view.yaw), [0, 120, 240]);
    assert.equal((await runTool('inspect_scene', {scene: 'hollow-reef', load: true}, context)).data.features.reef, true);
  } finally { await context.close(); }

  const input = new PassThrough(), output = new PassThrough();
  let text = '';
  output.on('data', chunk => { text += chunk; });
  const served = serveMCP({input, output, cwd: out});
  input.write(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'render', arguments: {scene: starterScene('minimal'), width: 320, height: 240, output: 'mcp.png'}}}) + '\n');
  input.end();
  await served;
  const reply = JSON.parse(text.trim()).result, image = reply.content.find(part => part.type === 'image');
  assert.equal(reply.isError, false);
  assert.equal(pixels(Buffer.from(image.data, 'base64')).width, 320);
  assert.equal(reply.structuredContent.splats > 500, true);
  await rm(join(out, 'mcp.png'));
});
await step('a page that loses its GPU fails that call with GPU_LOST, and the next call gets a fresh browser', async () => {
  const context = createContext({cwd: out});
  try {
    const input = {scene: starterScene('minimal'), width: 320, height: 240, output: 'lost.png'};
    await runTool('render', input, context);
    const doomed = await context.session({width: 320, height: 240});
    await doomed.page.evaluate(() => new Promise(resolve => {
      const {gl} = window.sillage.api.engine;
      gl.canvas.addEventListener('webglcontextlost', () => resolve(), {once: true});
      gl.getExtension('WEBGL_lose_context').loseContext();
    }));
    assert.deepEqual(await doomed.page.evaluate(() => [window.sillage.state, window.sillage.ready, window.sillage.error?.code, window.sillage.api.state, document.querySelector('#error').hidden]), ['failed', false, 'GPU_LOST', 'lost', false]);
    await assert.rejects(runTool('render', input, context), error => error.code === 'GPU_LOST' && /fresh browser/.test(error.hint));
    assert.equal(doomed.state, 'broken');
    await assert.rejects(doomed.describe(), error => error.code === 'CLOSED' && /lost its GPU context/.test(error.message));
    const rendered = await runTool('render', input, context), fresh = await context.session({width: 320, height: 240});
    assert.equal(pixels(rendered.images[0].png).width, 320);
    assert.deepEqual([fresh !== doomed, fresh.state, doomed.state], [true, 'open', 'closed']);
  } finally { await context.close(); await rm(join(out, 'lost.png'), {force: true}); }
});
await step('a page that cannot start leaves nothing running', async () => {
  // A stand-in for the viewer that reports it has no WebGL.
  const server = createServer((request, response) => { response.setHeader('content-type', 'text/html'); response.end('<!-- sillage-host --><script>window.sillage = {error: {code: "NO_WEBGL", message: "No WebGL here.", hint: "Use a GPU."}}</script>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const refused = new Session();
  try {
    await assert.rejects(refused.open({url: `http://127.0.0.1:${server.address().port}`}), error => error.code === 'NO_WEBGL' && error.hint === 'Use a GPU.');
    assert.deepEqual([refused.state, refused.page, refused.browser, refused.launched], ['closed', null, null, null]);
  } finally { await refused.close(); server.closeAllConnections(); server.close(); }
});
await step('a browser that stalls after launch is replaced', async () => {
  // Chrome sometimes starts and then never answers. Make the first connection hang.
  const {chromium} = await import('playwright'), connect = chromium.connect.bind(chromium);
  let attempts = 0;
  chromium.connect = (...args) => ++attempts === 1 ? new Promise(() => {}) : connect(...args);
  try {
    const recovered = await openSession({width: 320, height: 240});
    try { assert.equal((await recovered.load(starterScene('minimal'))).splats > 500, true); }
    finally { await recovered.close(); }
    assert.equal(attempts, 2);
  } finally { chromium.connect = connect; }
});
console.log(`All checks passed. Images: ${out}`);
