import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {PassThrough} from 'node:stream';
import {SillageError, suggest} from '../src/sillage/errors.js';
import {STYLE_OPTIONS, styleDefaults, styleNotes, styleSchema, validateStyle, toEngine, fromEngine} from '../src/sillage/styles.js';
import {CONTENT_TYPES, PUBLIC_CONTENT_TYPES, TEMPLATE_NAMES, compileScene, frameCamera, inspectScene, sceneDefinition, sceneSchema, starterScene, validateScene} from '../src/sillage/scene.js';
import {createBrush, parseColor, transformSplats, ALONG} from '../src/sillage/brush.js';
import {listScenes, findScene} from '../src/sillage/catalog.js';
import {packSplats} from '../src/splat/math.js';
import {encodeTreeSplats} from '../src/splat/proceduralTrees.js';
import {COLOR_DEFAULTS} from '../src/splat/colorResponse.js';
import {LENS_DIRT_DEFAULTS} from '../src/splat/LensDirtPass.js';
import {SUN_DEFAULTS} from '../src/splat/PainterlySun.js';
import {FLARE_DEFAULTS} from '../src/splat/lensFlare.js';
import {VIGNETTE_DEFAULTS} from '../src/splat/PainterlyVignettePass.js';
import {DOF_DEFAULTS} from '../src/splat/ForegroundDOF.js';
import {GHIBLI_DEFAULTS, RENDER_MODES} from '../src/splat/ghibliPaint.js';
import {SSAO_DEFAULTS} from '../src/splat/SplatSSAO.js';
import {OCCLUSION_DEFAULTS} from '../src/splat/SplatOcclusion.js';
import {MARK_LOD_DEFAULTS} from '../src/splat/MarkLOD.js';
import {PREPASS_DEFAULTS} from '../src/splat/SplatPrepass.js';
import {SORT_WORKER_DEFAULTS} from '../src/splat/SplatSortJob.js';
import {STILL_DEFAULTS} from '../src/splat/StillAccumulator.js';
import {TOOLS, createContext, inputProblem, runTool, toolDefinitions} from '../cli/lib/tools.mjs';
import {resolveScene, ROOT, Session} from '../cli/lib/session.mjs';
import {createMachine, SILLAGE_STATES, HOST_STATES, SESSION_STATES} from '../src/sillage/machine.js';
import {readdirSync} from 'node:fs';
import {serveMCP} from '../cli/lib/mcp.mjs';

const cli = (...args) => new Promise(resolve => execFile(process.execPath, [join(ROOT, 'cli', 'sillage.mjs'), ...args], {cwd: ROOT}, (error, stdout, stderr) => resolve({code: error?.code ?? 0, stdout, stderr})));
const thrown = work => { try { work(); } catch (error) { return error; } assert.fail('expected an error'); };

test('the style table lists every engine option with the engine\'s own default', () => {
  // The renderer builds its options from these objects; the table must agree with each.
  const engine = {mode: 'paint', brushScale: 1, coverage: 1, softness: .2, quality: 'draft', plantLOD: true, pixelFilter: false, indirect: true, bounceStrength: 1,
    ...COLOR_DEFAULTS, ...LENS_DIRT_DEFAULTS, ...SUN_DEFAULTS, ...FLARE_DEFAULTS, ...VIGNETTE_DEFAULTS, ...DOF_DEFAULTS, ...GHIBLI_DEFAULTS, ...SSAO_DEFAULTS, ...OCCLUSION_DEFAULTS, ...MARK_LOD_DEFAULTS, ...PREPASS_DEFAULTS, ...SORT_WORKER_DEFAULTS, ...STILL_DEFAULTS};
  const table = styleDefaults();
  for (const [key, value] of Object.entries(engine)) assert.equal(table[key], value, `default of ${key}`);
  // If the renderer gains a group of options, this list and the table must follow.
  const source = readFileSync(join(ROOT, 'src', 'splat', 'GaussianBrushRenderer.js'), 'utf8'), options = /this\.options=\{([^}]*)\}/.exec(source)[1];
  assert.deepEqual(options.match(/\.\.\.[A-Z_]+/g), ['COLOR', 'LENS_DIRT', 'SUN', 'FLARE', 'VIGNETTE', 'DOF', 'GHIBLI', 'SSAO', 'OCCLUSION', 'MARK_LOD', 'PREPASS', 'SORT_WORKER', 'STILL'].map(name => `...${name}_DEFAULTS`));
  assert.deepEqual(options.split(',...')[0].split(',').map(pair => pair.split(':')[0]), ['mode', 'brushScale', 'coverage', 'softness', 'quality', 'plantLOD', 'pixelFilter', 'indirect', 'bounceStrength']);
  // The table names the modes; the renderer's own names sit behind toEngine.
  assert.deepEqual(STYLE_OPTIONS.mode.values.map(value => toEngine('mode', value)), Object.keys(RENDER_MODES));
  for (const [key, option] of Object.entries(STYLE_OPTIONS)) {
    assert.ok(option.description.length > 10 && option.group, key);
    if (option.type === 'number') assert.ok(option.min <= option.default && option.default <= option.max, `${key} default lies in its range`);
    assert.deepEqual(validateStyle({[key]: option.default}), {[key]: option.default});
  }
  assert.deepEqual(Object.keys(styleSchema().properties), Object.keys(STYLE_OPTIONS));
});

test('a bad style names every problem and what to send instead', () => {
  const error = thrown(() => validateStyle({softnes: .3, mode: 'oil', brushScale: 9, sun: 'yes', shadowTint: 'blue'}));
  assert.ok(error instanceof SillageError);
  assert.equal(error.code, 'INVALID_STYLE');
  assert.equal(error.details.length, 5);
  assert.match(error.details.find(problem => problem.key === 'softnes').hint, /"softness"/);
  assert.match(error.details.find(problem => problem.key === 'brushScale').hint, /0\.25 to 3/);
  assert.match(error.details.find(problem => problem.key === 'mode').hint, /paint.*gaussian.*gouache/);
  assert.deepEqual(validateStyle({shadowTint: '#AABBCC'}), {shadowTint: '#aabbcc'});
  assert.deepEqual(validateStyle(undefined), {});
  assert.deepEqual(styleNotes({oil: true, mode: 'paint'}), ['"oil" has no effect unless "mode" is "gouache".']);
  assert.deepEqual(styleNotes({oil: true, mode: 'gouache'}), []);
  assert.deepEqual(suggest('alpin', ['alpine', 'cathedral', 'meadow']), ['alpine']);
});

test('every template is a valid scene that compiles to finite, full-rank, repeatable marks', () => {
  for (const name of TEMPLATE_NAMES) {
    const doc = starterScene(name), a = compileScene(doc), b = compileScene(doc);
    assert.deepEqual(validateScene(doc).errors, [], name);
    assert.ok(a.splats.length > 500, name);
    assert.deepEqual(a.splats, b.splats, `${name} is deterministic`);
    assert.deepEqual(a.warnings, [], `${name} has no warnings`);
    for (const splat of a.splats) {
      const [u, v, w] = splat.axes, volume = u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
      assert.ok(Math.abs(volume) > 0 && splat.opacity > 0 && splat.opacity <= 1 && splat.color.every(c => c >= 0 && c <= 1));
    }
    // The renderer's own packer accepts them.
    assert.equal(packSplats(a.splats).centers.length, a.splats.length * 3);
    assert.equal(a.items.reduce((sum, item) => sum + item.splats, 0), a.splats.length);
  }
  assert.throws(() => starterScene('nope'), {code: 'UNKNOWN_TEMPLATE'});
});

test('scene problems come with a path and a hint', () => {
  const {errors} = validateScene({backgroud: '#fff', camera: {position: [0, 0, 0]}, style: {softnes: 2}, light: [0, 0, 0],
    content: [{type: 'sphere', radius: 1}, {type: 'ellipsoid', radus: 2, color: 'red', stroke: {lenght: 1}, opacity: 2}, {type: 'tube', path: [[0, 0, 0], [0, 1, 0]], radius: [1, 2, 3]}, {type: 'splats', splats: [{at: [0, 0, 0], size: [1]}]}, {type: 'painting'}]});
  const at = path => errors.find(error => error.path === path);
  assert.match(at('backgroud').hint, /"background"/);
  assert.match(at('camera.target').message, /required/);
  assert.match(at('style.softnes').hint, /"softness"/);
  assert.match(at('content[0].type').hint, /Use "ellipsoid"/);
  assert.match(at('content[1].radus').hint, /"radius"/);
  assert.match(at('content[1].color').message, /"red" is not a colour/);
  assert.match(at('content[1].stroke.lenght').hint, /"length"/);
  assert.ok(at('content[1].opacity') && at('light') && at('content[2].radius') && at('content[3].splats[0].size') && at('content[4]'));
  assert.equal(validateScene([]).errors.length, 1);
  assert.equal(validateScene({content: []}).errors[0].path, 'content');
  const error = thrown(() => compileScene({content: [{type: 'cube'}]}));
  assert.equal(error.code, 'INVALID_SCENE');
  assert.match(error.hint, /"box"/);
});

test('inspectScene measures a scene and warns about what will look wrong', () => {
  const report = inspectScene(starterScene('still-life'));
  assert.equal(report.valid, true);
  assert.equal(report.items.length, 7);
  assert.equal(report.items.find(item => item.id === 'plum').type, 'ellipsoid');
  assert.ok(report.bounds.min[0] < -4 && report.bounds.max[0] > 4 && report.meanMarkLength > .1);
  assert.equal(report.cameraIsAutomatic, false);

  // No camera: one is framed around the content.
  const framed = inspectScene({content: [{type: 'ellipsoid', center: [10, 2, -5], radius: 2}]});
  assert.equal(framed.cameraIsAutomatic, true);
  assert.deepEqual(framed.camera.target.map(Math.round), [10, 2, -5]);
  const distance = Math.hypot(...framed.camera.position.map((v, i) => v - framed.camera.target[i]));
  assert.ok(distance > framed.radius * 2 && distance < framed.radius * 6);
  assert.deepEqual(frameCamera({center: [0, 0, 0], radius: 1}, {yaw: 0, pitch: 0, fov: 60, fill: 1}).position.map(v => Math.round(v * 100) / 100), [0, 0, 2]);

  const away = inspectScene({camera: {position: [0, 0, 10], target: [0, 0, 20]}, content: [{type: 'ellipsoid', radius: 1}]});
  assert.match(away.warnings[0], /does not look at the content/);
  const far = inspectScene({camera: {position: [0, 0, 900], target: [0, 0, 0]}, content: [{type: 'ellipsoid', radius: 1}]});
  assert.match(far.warnings[0], /under a tenth of the frame/);
  const sparse = inspectScene({content: [{id: 'floor', type: 'plane', size: [10, 10], count: 100, stroke: {length: .2, width: .1}}]});
  assert.match(sparse.warnings[0], /content\[0\] \("floor"\).*background shows between them/);
  assert.equal(inspectScene({content: [{type: 'nope'}]}).valid, false);
});

test('marks have the painted size asked for, and forms turn about their own centre', () => {
  const brush = createBrush({seed: 3});
  const mark = brush.mark({at: [1, 2, 3], normal: [0, 1, 0], direction: [1, 0, 0], size: [.63, .3, .03], color: '#ff8000', opacity: .5});
  assert.deepEqual(mark.center, [1, 2, 3]);
  assert.ok(Math.abs(Math.hypot(...mark.axes[0]) * ALONG - .63) < 1e-9 && Math.abs(mark.axes[0][0]) > .19);
  assert.ok(Math.abs(mark.axes[2][1]) > 0 && mark.axes[2][0] === 0, 'the thin axis is the normal');
  assert.deepEqual(mark.color.map(v => Math.round(v * 255)), [255, 128, 0]);
  assert.deepEqual(parseColor('#fa0'), parseColor('#ffaa00'));
  assert.deepEqual(parseColor('skin', {skin: '#102030'}).map(v => Math.round(v * 255)), [16, 32, 48]);
  assert.throws(() => parseColor('skn', {skin: '#102030'}), {code: 'INVALID_COLOR'});

  // A colour list is a tone ramp: the lit side is lighter than the shaded side.
  const ball = createBrush({seed: 1, light: [0, 1, 0]}).ellipsoid({radius: 1, count: 600, color: ['#000000', '#808080', '#ffffff']});
  const mean = side => { const picked = ball.filter(splat => side * splat.center[1] > .6); return picked.reduce((sum, splat) => sum + splat.color[0], 0) / picked.length; };
  assert.ok(mean(1) > mean(-1) + .5);

  const turned = compileScene({content: [{type: 'box', center: [5, 0, 0], size: [2, 1, 1], rotation: [0, 90, 0], scale: 2, position: [0, 3, 0]}]}).stats;
  assert.deepEqual(turned.center.map(Math.round), [5, 3, 0], 'the box stays where it is and moves by "position"');
  assert.ok(turned.bounds.max[2] - turned.bounds.min[2] > 3.9 && turned.bounds.max[0] - turned.bounds.min[0] < 2.6, 'its long side now runs along z, at twice the size');
  const spun = transformSplats([{center: [1, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]]}], {rotation: [0, 0, 90]})[0];
  assert.deepEqual(spun.center.map(v => Math.round(v * 1e6) / 1e6), [0, 1, 0]);
});

test('a scene becomes an engine definition with light that matches its marks', () => {
  const definition = sceneDefinition(starterScene('tree')), built = definition.create(), count = built.splats.length;
  assert.equal(definition.camera.fov, 36);
  assert.deepEqual({sun: definition.initialStyle.sun, lensFlare: definition.initialStyle.lensFlare}, {sun: false, lensFlare: false});
  assert.equal(built.lighting.irradiance.length, count * 3);
  assert.equal(built.lighting.shadow.length, count);
  assert.ok(built.lighting.shadow.some(v => v > 0), 'baked light casts some shadow');
  assert.equal(built.atmosphere.color, '#cfdfe4');
  assert.match(built.background, /^#[0-9a-f]{6}$/);
  assert.equal(definition.report.stats.splats, count);

  const flat = sceneDefinition({...starterScene('minimal'), lighting: 'flat', style: {softness: .4}});
  assert.ok(flat.create().lighting.irradiance.every(v => v === 0));
  assert.deepEqual({indirect: flat.initialStyle.indirect, softness: flat.initialStyle.softness}, {indirect: false, softness: .4});
});

test('paintings and .splat files are scene content, and scenes export to .splat', () => {
  const spec = {medium: 'gouache', background: '#404040', camera: {position: [0, 2, 8], target: [0, 1, 0], fov: 30},
    objects: [{id: 'ball', type: 'sphere', center: [0, 1, 0], radius: 1, paint: [{name: 'skin', coverage: 'bands', cols: 10, color: '#aa3322'}]}]};
  const painted = compileScene({content: [{type: 'painting', spec, position: [3, 0, 0]}]});
  assert.ok(painted.splats.length > 20 && Math.abs(painted.stats.center[0] - 3) < .3);
  assert.equal(validateScene({content: [{type: 'painting', spec: {medium: 'crayon', objects: []}}]}).errors.length > 0, true);

  const source = compileScene(starterScene('minimal')), bytes = encodeTreeSplats(source.splats);
  assert.equal(bytes.byteLength, source.splats.length * 32);
  const doc = {content: [{type: 'splatFile', file: 'ball.splat', height: 2}]};
  // Node hands files over as Buffers; the page as ArrayBuffers.
  for (const data of [bytes, Buffer.from(bytes)]) {
    const loaded = compileScene(doc, {files: {'ball.splat': data}});
    assert.equal(loaded.splats.length, source.splats.length);
    assert.ok(Math.abs(loaded.stats.bounds.max[1] - loaded.stats.bounds.min[1] - 2) < .4, 'scaled to the requested height');
  }
  assert.throws(() => compileScene(doc), {code: 'MISSING_FILE'});
  assert.ok(sceneDefinition(doc, {files: {'ball.splat': bytes}}).create().lighting.shadow.every(v => v === 0), 'imported marks keep their own colour');
});

test('the schema covers every content type and field', () => {
  const schema = sceneSchema(), variants = schema.properties.content.items.oneOf;
  assert.deepEqual(variants.map(variant => variant.properties.type.const), Object.keys(PUBLIC_CONTENT_TYPES));
  for (const variant of variants) {
    const fields = CONTENT_TYPES[variant.properties.type.const].fields;
    assert.deepEqual(Object.keys(variant.properties).slice(1), Object.keys(fields));
    for (const property of Object.values(variant.properties)) assert.ok(property.const || property.description);
  }
  assert.ok(schema.properties.style.properties.softness && schema.required.includes('content'));
  JSON.stringify(schema);
});

test('built-in scenes are listed and found by id', () => {
  const scenes = listScenes(), ids = scenes.map(scene => scene.id);
  assert.ok(scenes.length >= 30 && new Set(ids).size === ids.length);
  for (const scene of scenes) assert.ok(scene.title && scene.camera.position.length === 3, scene.id);
  assert.equal(typeof findScene('alpine').create, 'function');
  const error = thrown(() => findScene('cliff'));
  assert.equal(error.code, 'UNKNOWN_SCENE');
  assert.match(error.hint, /cliff-talus/);
});

test('scenes resolve from ids, files, painting specs and .splat files', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'sillage-'));
  try {
    assert.equal((await resolveScene('alpine')).kind, 'built-in');
    await writeFile(join(folder, 'tree.json'), JSON.stringify(starterScene('tree')));
    const fromFile = await resolveScene('tree.json', {cwd: folder});
    assert.deepEqual([fromFile.kind, fromFile.name], ['document', 'tree']);

    const bytes = Buffer.from(encodeTreeSplats(compileScene(starterScene('minimal')).splats));
    await writeFile(join(folder, 'ball.splat'), bytes);
    const fromSplat = await resolveScene(join(folder, 'ball.splat'));
    assert.equal(fromSplat.kind, 'splat file');
    assert.equal(Object.values(fromSplat.files)[0].length, bytes.length);

    await writeFile(join(folder, 'with-file.json'), JSON.stringify({content: [{type: 'splatFile', file: 'ball.splat'}, {type: 'splatFile', file: 'missing.splat'}]}));
    await assert.rejects(resolveScene('with-file.json', {cwd: folder}), {code: 'MISSING_FILE'});

    const painting = await resolveScene({medium: 'oil', background: '#203040', camera: {position: [0, 2, 8], target: [0, 1, 0], fov: 30}, objects: [{id: 'b', type: 'sphere', center: [0, 1, 0], radius: 1, paint: [{name: 'p', coverage: 'bands', cols: 8, color: '#aa3322'}]}]});
    assert.equal(painting.kind, 'painting spec');
    assert.equal(painting.scene.style.oil, true);
    validateStyle(painting.scene.style);

    await assert.rejects(resolveScene('alpin'), error => error.code === 'UNKNOWN_SCENE' && /"alpine"/.test(error.hint));
    await assert.rejects(resolveScene('nowhere/scene.json', {cwd: folder}), {code: 'MISSING_FILE'});
    await assert.rejects(resolveScene({title: 'empty'}), {code: 'INVALID_SCENE'});
    await writeFile(join(folder, 'broken.json'), '{nope');
    await assert.rejects(resolveScene('broken.json', {cwd: folder}), {code: 'INVALID_SCENE'});
  } finally { await rm(folder, {recursive: true, force: true}); }
});

test('tools check their input and answer in text and data', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'sillage-')), context = createContext({cwd: folder});
  try {
    for (const tool of toolDefinitions()) assert.ok(/^[a-z_]+$/.test(tool.name) && tool.description.length > 40 && tool.input_schema.type === 'object', tool.name);
    assert.equal((await runTool('list_scenes', {}, context)).data.scenes.length, listScenes().length);
    assert.deepEqual((await runTool('list_styles', {key: 'softness'}, context)).data.options.map(option => option.key), ['softness']);
    assert.ok((await runTool('list_styles', {group: 'sun'}, context)).data.options.every(option => option.group === 'sun'));
    assert.equal((await runTool('scene_format', {template: 'tree'}, context)).data.template.title, starterScene('tree').title);

    const written = await runTool('new_scene', {path: 'a/still.json'}, context);
    assert.deepEqual(JSON.parse(await readFile(written.data.path, 'utf8')), starterScene('still-life'));
    await assert.rejects(runTool('new_scene', {path: 'a/still.json'}, context), {code: 'FILE_EXISTS'});
    const inspected = await runTool('inspect_scene', {scene: 'a/still.json'}, context);
    assert.equal(inspected.data.valid && inspected.failed, false);
    assert.match(inspected.text, /Valid document: \d+ marks/);
    const invalid = await runTool('inspect_scene', {scene: {content: [{type: 'sphere'}]}}, context);
    assert.equal(invalid.failed, true);
    assert.match(invalid.text, /content\[0\]\.type/);
    assert.equal((await runTool('inspect_scene', {scene: 'alpine'}, context)).data.id, 'alpine');

    const exported = await runTool('export_splat', {scene: 'a/still.json', output: 'still.splat'}, context);
    assert.equal(exported.data.bytes, exported.data.splats * 32);
    // An exported file reads back the right way up and the right way round.
    const original = inspectScene(starterScene('still-life')), height = original.bounds.max[1] - original.bounds.min[1];
    const back = (await runTool('inspect_scene', {scene: {content: [{type: 'splatFile', file: 'still.splat', height}]}}, context)).data;
    // Where the pear sits within the scene's bounds, on each axis, must survive the round trip.
    const pear = splats => splats.filter(splat => splat.color[1] > splat.color[2] + .25 && splat.color[0] > .5);
    const place = splats => [0, 1, 2].map(axis => {
      const values = splats.map(splat => splat.center[axis]), low = Math.min(...values), high = Math.max(...values), picked = pear(splats);
      return (picked.reduce((sum, splat) => sum + splat.center[axis], 0) / picked.length - low) / (high - low);
    });
    const source = compileScene(starterScene('still-life')).splats;
    const reread = compileScene({content: [{type: 'splatFile', file: 'still.splat', height}]}, {files: {'still.splat': await readFile(exported.data.path)}}).splats;
    assert.equal(back.splats, original.splats);
    assert.ok(pear(source).length > 100 && pear(reread).length === pear(source).length);
    for (const [axis, value] of place(source).entries()) assert.ok(Math.abs(value - place(reread)[axis]) < .03, `the pear is in the same place along ${'xyz'[axis]}`);
  await assert.rejects(runTool('export_splat', {scene: 'alpine', output: 'x.splat'}, context), {code: 'UNSUPPORTED'});

    await assert.rejects(runTool('rendr', {}, context), error => error.code === 'UNKNOWN_TOOL' && /"render"/.test(error.hint));
    const render = TOOLS.find(tool => tool.name === 'render');
    assert.match(inputProblem(render, {}), /"scene" is required/);
    assert.match(inputProblem(render, {scene: 'alpine', widht: 3}), /Did you mean "width"/);
    assert.match(inputProblem(render, {scene: 'alpine', width: 99999}), /outside/);
    assert.match(inputProblem(render, {scene: 'alpine', scale: 1.5}), /whole number/);
    assert.equal(inputProblem(render, {scene: 'alpine', width: 800, style: {mode: 'gouache'}, orbit: {yaw: 30}}), null);
    // A bad style is refused before any browser is started.
    await assert.rejects(runTool('render', {scene: 'alpine', style: {softnes: 1}}, context), {code: 'INVALID_STYLE'});
  } finally { await context.close(); await rm(folder, {recursive: true, force: true}); }
});

test('the command line prints text or JSON and exits 2 on bad input', async () => {
  const scenes = await cli('scenes', '--json');
  assert.equal(scenes.code, 0);
  assert.equal(JSON.parse(scenes.stdout).scenes[0].id, 'alpine');
  assert.match((await cli('styles', 'softness')).stdout, /softness\s+0 to 1\s+default 0\.2/);
  assert.match((await cli('help')).stdout, /sillage render|render <scene>/);
  assert.equal(JSON.parse((await cli('schema')).stdout).title, 'Sillage scene');
  assert.equal(JSON.parse((await cli('tools')).stdout).length, TOOLS.length);

  const typo = await cli('rendr', 'alpine');
  assert.deepEqual([typo.code, typo.stdout], [2, '']);
  assert.match(typo.stderr, /Error \[INVALID_INPUT\]: Unknown command "rendr"\.\nHint: Did you mean "render"\?/);
  const unknown = await cli('inspect', 'alpin', '--json');
  assert.equal(unknown.code, 2);
  assert.equal(JSON.parse(unknown.stdout).error.code, 'UNKNOWN_SCENE');
  assert.match((await cli('render', 'alpine', '--siez', '3')).stderr, /Did you mean "size"/);
  assert.match((await cli('render', 'alpine', '--style', 'softnes=1')).stderr, /INVALID_STYLE.*softnes/s);
  assert.match((await cli('render', 'alpine', '--camera', '1,2')).stderr, /position\/target/);
  assert.match((await cli('render')).stderr, /needs a scene/);
});

test('the MCP server lists the tools and runs them', async () => {
  const input = new PassThrough(), output = new PassThrough(), replies = [];
  let buffered = '';
  output.on('data', chunk => { buffered += chunk; const lines = buffered.split('\n'); buffered = lines.pop(); for (const line of lines) replies.push(JSON.parse(line)); });
  const served = serveMCP({input, output, version: '9.9.9'});
  const send = message => input.write(JSON.stringify({jsonrpc: '2.0', ...message}) + '\n');
  send({id: 1, method: 'initialize', params: {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'test', version: '1'}}});
  send({method: 'notifications/initialized'});
  send({id: 2, method: 'tools/list'});
  send({id: 3, method: 'tools/call', params: {name: 'list_styles', arguments: {key: 'mode'}}});
  send({id: 4, method: 'tools/call', params: {name: 'inspect_scene', arguments: {scene: 'alpin'}}});
  send({id: 5, method: 'tools/call', params: {name: 'inspect_scene', arguments: {scene: {content: [{type: 'cube'}]}}}});
  send({id: 6, method: 'nope/nope'});
  input.write('not json\n');
  input.end();
  await served;
  const reply = id => replies.find(message => message.id === id);
  assert.deepEqual([reply(1).result.protocolVersion, reply(1).result.serverInfo], ['2025-03-26', {name: 'sillage', version: '9.9.9'}]);
  assert.deepEqual(reply(2).result.tools.map(tool => tool.name), TOOLS.map(tool => tool.name));
  assert.ok(reply(2).result.tools.every(tool => tool.inputSchema.type === 'object'));
  assert.match(reply(3).result.content[0].text, /paint \| gaussian \| gouache/);
  assert.equal(reply(3).result.isError, false);
  assert.deepEqual([reply(4).result.isError, /UNKNOWN_SCENE.*Hint: Did you mean "alpine"/s.test(reply(4).result.content[0].text)], [true, true]);
  assert.equal(reply(5).result.isError, true);
  assert.equal(reply(6).error.code, -32601);
  assert.equal(replies.find(message => message.id === null).error.code, -32700);
  assert.equal(replies.length, 7, 'the notification got no reply');
});

test('a state machine moves only along its table and says what is allowed', () => {
  const seen = [], door = createMachine('The door', 'closed', {closed: ['open'], open: ['closed', 'locked'], locked: []}, (state, previous) => seen.push(`${previous}>${state}`));
  assert.deepEqual([door.state, door.is('closed'), door.is('open', 'locked'), door.can('open'), door.can('locked')], ['closed', true, false, true, false]);
  assert.equal(door.go('closed'), false, 'already there: no move, no callback');
  assert.equal(door.go('open'), true);
  assert.equal(door.go('locked'), true);
  const refused = thrown(() => door.go('open'));
  assert.deepEqual([refused.code, door.state], ['INVALID_STATE', 'locked']);
  assert.match(refused.message, /The door cannot go from "locked" to "open"/);
  assert.match(refused.hint, /"locked" is final/);
  assert.match(thrown(() => createMachine('A', 'closed', {closed: ['open'], open: ['closed']}).go('ajar')).hint, /From "closed" it can go to: "open"/);
  assert.deepEqual(seen, ['closed>open', 'open>locked']);
  // A table that names a state it does not define is refused when it is built.
  assert.throws(() => createMachine('Bad', 'a', {a: ['b']}), /"b", which is not a state/);
  assert.throws(() => createMachine('Bad', 'z', {a: []}), /initial state "z"/);
  // Every state of the three life cycles can be reached, and all but the first can be left or are final by design.
  for (const [table, first, final] of [[SILLAGE_STATES, 'empty', ['disposed']], [HOST_STATES, 'booting', ['failed']], [SESSION_STATES, 'closed', []]]) {
    const reached = new Set([first]);
    for (let grew = true; grew;) { grew = false; for (const from of [...reached]) for (const to of table[from]) if (!reached.has(to)) { reached.add(to); grew = true; } }
    assert.deepEqual([...reached].sort(), Object.keys(table).sort());
    assert.deepEqual(Object.keys(table).filter(state => !table[state].length), final);
  }
});

/** A session whose browser is a stand-in: `answer(method)` is what the page replies. */
class FakeSession extends Session {
  constructor(answer = () => ({ok: true, result: 'done'})) { super(); this.answer = answer; this.stopped = []; this.starts = 0; this.failStart = null; }
  async start({width = 1280, height = 800} = {}) {
    this.starts++;
    const stop = name => async () => { this.stopped.push(name); };
    this.server = {close: stop('server')}; this.launched = {kill: stop('launched')};
    this.browser = {close: stop('browser'), isConnected: () => true};
    this.page = {isClosed: () => false, setViewportSize: async () => {}, evaluate: async (_, [method]) => this.answer(method)};
    this.size = {width, height};
    if (this.failStart) throw this.failStart;
  }
}

test('a session is closed, opening, open or broken, and says so', async () => {
  const session = new FakeSession();
  assert.equal(session.state, 'closed');
  await assert.rejects(session.call('describe'), error => error.code === 'CLOSED' && /closed, not open/.test(error.message) && /openSession/.test(error.hint));
  await assert.rejects(session.resize(640, 480), {code: 'CLOSED'});
  await session.close();
  assert.equal(session.state, 'closed', 'closing a closed session is harmless');

  const opening = session.open();
  assert.equal(session.state, 'opening');
  await assert.rejects(session.open(), error => error.code === 'ALREADY_OPEN' && /already opening/.test(error.message));
  assert.equal(await opening, session);
  assert.equal(session.state, 'open');
  await assert.rejects(session.open(), {code: 'ALREADY_OPEN'});
  assert.equal(await session.call('describe'), 'done');

  // The page reports that its GPU is gone: this call fails with the page's own error, the session is broken from then on.
  session.answer = () => ({ok: false, error: {code: 'GPU_LOST', message: 'The renderer lost its GPU context.', hint: 'reload'}});
  await assert.rejects(session.call('capture'), {code: 'GPU_LOST'});
  assert.equal(session.state, 'broken');
  session.answer = () => assert.fail('a broken session does not reach the page');
  await assert.rejects(session.call('describe'), error => error.code === 'CLOSED' && /lost its GPU context/.test(error.message) && /open a new one/.test(error.hint));
  // An ordinary error from the page leaves the session open.
  session.answer = () => ({ok: true, result: 'again'});
  assert.equal(session.starts, 1);
  await session.open();
  assert.deepEqual([session.state, session.starts, await session.call('describe')], ['open', 2, 'again'], 'open() on a broken session closes it and starts over');
  session.answer = () => ({ok: false, error: {code: 'NO_SCENE', message: 'No scene is loaded.'}});
  await assert.rejects(session.call('orbit'), {code: 'NO_SCENE'});
  assert.equal(session.state, 'open');

  // A page that stops answering breaks the session too.
  session.callTimeout = 20; session.answer = () => new Promise(() => {});
  await assert.rejects(session.call('capture'), error => error.code === 'PAGE_TIMEOUT' && /now broken/.test(error.hint));
  assert.equal(session.state, 'broken');
  // And so does one that goes away mid-call.
  await session.open(); session.answer = () => { throw new Error('Target page, context or browser has been closed'); };
  await assert.rejects(session.call('capture'), error => error.code === 'CLOSED' && /the page went away/.test(error.message));
  await session.close();
  assert.deepEqual([session.state, session.page, session.browser, session.server, session.launched], ['closed', null, null, null, null]);
});

test('a session that cannot open stops everything it started', async () => {
  const session = new FakeSession();
  session.failStart = new SillageError('NO_BROWSER', 'Could not start a headless browser.');
  await assert.rejects(session.open(), {code: 'NO_BROWSER'});
  // A server or browser left running would keep the command from exiting.
  assert.deepEqual([session.state, session.stopped.sort(), session.page, session.server, session.browser, session.launched], ['closed', ['browser', 'launched', 'server'], null, null, null, null]);
  session.failStart = null;
  await session.open();
  assert.equal(session.state, 'open', 'and it can be opened again');
  await session.close();
  // A real session refused for its size never starts anything.
  const real = new Session();
  await assert.rejects(real.open({width: 10, height: 10}), {code: 'INVALID_SIZE'});
  assert.equal(real.state, 'closed');
});

test('the tool context shares one session and replaces a broken one', async () => {
  const opened = [], open = async size => { const session = await new FakeSession().open(size); opened.push(session); return session; };
  const context = createContext({open});
  const [first, same] = await Promise.all([context.session({width: 640, height: 480}), context.session({width: 640, height: 480})]);
  assert.deepEqual([opened.length, first === same, first.state], [1, true, 'open'], 'two callers at once share one browser');
  assert.equal(await context.session({width: 800, height: 600}), first);
  assert.deepEqual(first.size, {width: 800, height: 600}, 'a new size resizes the same session');

  first.break('the page crashed');
  const second = await context.session({width: 800, height: 600});
  assert.deepEqual([second !== first, second.state, first.state, opened.length], [true, 'open', 'closed', 2], 'the broken session is closed and replaced');
  await context.close();
  assert.equal(second.state, 'closed');

  // A session that fails to open is not kept: the next call tries again.
  let attempts = 0;
  const flaky = createContext({open: async size => { if (++attempts === 1) throw new SillageError('NO_BROWSER', 'no browser'); return open(size); }});
  await assert.rejects(flaky.session({width: 640, height: 480}), {code: 'NO_BROWSER'});
  assert.equal((await flaky.session({width: 640, height: 480})).state, 'open');
  await flaky.close();
});

test('the guide lists every state and every error code in the source', () => {
  const guide = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8'), states = guide.slice(guide.indexOf('## States'), guide.indexOf('## Error codes'));
  for (const [name, table] of Object.entries({SILLAGE_STATES, HOST_STATES, SESSION_STATES})) {
    assert.ok(states.includes(`\`${name}\``), name);
    for (const [state, moves] of Object.entries(table)) {
      // One table row per state: | `state` | ... | `move`, `move` |
      const row = states.split('\n').find(line => line.startsWith(`| \`${state}\` |`) && moves.every(move => line.split('|').at(-2).includes(`\`${move}\``)) && (line.split('|').at(-2).match(/`/g)?.length ?? 0) === moves.length * 2);
      assert.ok(row, `${name}.${state} is documented with exactly its moves: ${moves.join(', ') || 'none'}`);
    }
  }
  const sources = [...readdirSync(join(ROOT, 'src', 'sillage')).map(file => join(ROOT, 'src', 'sillage', file)), join(ROOT, 'cli', 'sillage.mjs'), ...readdirSync(join(ROOT, 'cli', 'lib')).map(file => join(ROOT, 'cli', 'lib', file))];
  const codes = new Set(['INTERNAL', 'PAGE_ERROR']);
  for (const file of sources) for (const [call] of readFileSync(file, 'utf8').matchAll(/SillageError\([^,]*,/g)) for (const [, code] of call.matchAll(/'([A-Z_]+)'/g)) codes.add(code);
  assert.ok(codes.size > 30 && codes.has('MISSING_FILE') && codes.has('GPU_LOST'));
  const listed = guide.slice(guide.indexOf('## Error codes'), guide.indexOf('## What to know'));
  assert.deepEqual([...codes].filter(code => !listed.includes(`\`${code}\``)), [], 'error codes missing from AGENTS.md');
});

test('the unfinished Atelier harness works but is nowhere in the public surface', async () => {
  // Still drawn, for scenes that already use it.
  assert.equal(CONTENT_TYPES.painting.hidden, true);
  assert.equal('painting' in PUBLIC_CONTENT_TYPES, false);
  assert.ok(Object.keys(PUBLIC_CONTENT_TYPES).length === Object.keys(CONTENT_TYPES).length - 1 && PUBLIC_CONTENT_TYPES.ellipsoid && PUBLIC_CONTENT_TYPES.splatFile);
  // Not in the schema, the tools, the hints, the help or the guides.
  const context = createContext();
  let format;
  try { format = await runTool('scene_format', {}, context); } finally { await context.close(); }
  assert.equal('painting' in format.data.contentTypes, false);
  const surfaces = {
    schema: JSON.stringify(sceneSchema()), tools: JSON.stringify(toolDefinitions()), format: JSON.stringify(format.data),
    hints: JSON.stringify(validateScene({content: [{type: 'paintng'}, {}]}).errors) + JSON.stringify(validateScene({content: []}).errors),
    help: (await cli('help')).stdout, typo: (await cli('atelie')).stderr, scenes: (await cli('scenes')).stdout,
    guide: readFileSync(join(ROOT, 'AGENTS.md'), 'utf8'), llms: readFileSync(join(ROOT, 'llms.txt'), 'utf8'), readme: readFileSync(join(ROOT, 'README.md'), 'utf8'),
  };
  for (const [name, text] of Object.entries(surfaces)) {
    assert.ok(text.length > 40, name);
    assert.doesNotMatch(text, /atelier/i, name);
    if (name !== 'readme' && name !== 'scenes') assert.doesNotMatch(text, /"painting"|`painting`|painting spec/i, name);
  }
  assert.match(surfaces.typo, /Unknown command "atelie"/);
  // Where the harness is present (it is not published), it keeps its own entry and its own notes.
  if (existsSync(join(ROOT, 'harness', 'atelier.mjs'))) {
    assert.match((await cli('atelier')).stdout, /Atelier: rebuild one image/);
    assert.match(readFileSync(join(ROOT, 'harness', 'README.md'), 'utf8'), /not part of the Sillage alpha/);
  } else assert.match((await cli('atelier')).stderr, /Unknown command "atelier"/);
});

test('the guide\'s content-type table has a row for every public type, naming each of its own fields', () => {
  const guide = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8'), section = guide.slice(guide.indexOf('**Content types.**'), guide.indexOf('**Colour.**'));
  const rows = Object.fromEntries(section.split('\n').filter(line => /^\| `\w+` \|/.test(line) && !line.startsWith('| `type` | Draws')).map(line => [line.match(/^\| `(\w+)`/)[1], line]));
  assert.deepEqual(Object.keys(rows), Object.keys(PUBLIC_CONTENT_TYPES), 'one row per type, in the order of the table in scene.js');
  // Fields every form or every item takes are named once, above the table.
  const shared = ['color', 'opacity', 'count', 'stroke', 'material', 'unlit', 'id', 'position', 'rotation', 'scale'], intro = section.slice(0, section.indexOf('| `type`'));
  for (const field of shared) assert.ok(intro.includes(`\`${field}\``), `"${field}" is introduced above the table`);
  for (const [type, {fields}] of Object.entries(PUBLIC_CONTENT_TYPES)) {
    const own = Object.keys(fields).filter(field => !shared.includes(field)), cell = rows[type].split('|').at(-2);
    for (const field of own) assert.ok(cell.includes(`\`${field}\``), `${type}.${field} is in its row`);
    for (const [, named] of cell.matchAll(/`([a-zA-Z]+)`/g)) assert.ok(named in fields, `${type}: the guide names "${named}", which is not one of its fields`);
    for (const [field, [, , required]] of Object.entries(fields)) if (required) assert.match(cell, new RegExp(`\`${field}\`[^\`]*\\(required\\)`), `${type}.${field} is marked required`);
  }
  // Every name the guide says to avoid really is refused, with the type it points to.
  const [, avoid, instead] = section.match(/There is no (.+?): use (.+?)\./);
  const names = text => [...text.matchAll(/`(\w+)`/g)].map(match => match[1]), wrong = names(avoid), right = names(instead);
  assert.ok(wrong.length >= 2 && wrong.length === right.length);
  wrong.forEach((name, i) => assert.match(validateScene({content: [{type: name}]}).errors[0].hint, new RegExp(`^Use "${right[i]}"`), name));
});

test('names that changed still work, and only the current ones are shown', async () => {
  // The gouache mode: its former name is accepted and answered with the current one.
  assert.deepEqual(validateStyle({mode: 'ghibli', softness: .3}), {mode: 'gouache', softness: .3});
  assert.deepEqual(validateStyle({mode: 'gouache'}), {mode: 'gouache'});
  assert.deepEqual(styleNotes({oil: true, mode: 'gouache'}), []);
  assert.deepEqual([toEngine('mode', 'gouache'), toEngine('mode', 'paint'), toEngine('softness', .3)], ['ghibli', 'paint', .3]);
  assert.deepEqual([fromEngine('mode', 'ghibli'), fromEngine('mode', 'gaussian'), fromEngine('softness', .3)], ['gouache', 'gaussian', .3]);
  for (const mode of STYLE_OPTIONS.mode.values) assert.equal(fromEngine('mode', toEngine('mode', mode)), mode);
  assert.deepEqual(styleSchema().properties.mode.enum, ['paint', 'gaussian', 'gouache']);
  assert.equal(validateScene({style: {mode: 'ghibli'}, content: [{type: 'ellipsoid', radius: 1}]}).errors.length, 0);
  // The summer hillside: its former id finds it; the list shows the current id only.
  assert.equal(findScene('ghibli').id, 'summer-hillside');
  assert.deepEqual([(await resolveScene('ghibli')).scene, (await resolveScene('summer-hillside')).kind], ['summer-hillside', 'built-in']);
  const ids = listScenes().map(scene => scene.id);
  assert.ok(ids.includes('summer-hillside') && !ids.includes('ghibli'));
  const shown = JSON.stringify([toolDefinitions(), sceneSchema(), listScenes()]) + (await cli('help')).stdout + (await cli('styles')).stdout + readFileSync(join(ROOT, 'AGENTS.md'), 'utf8') + readFileSync(join(ROOT, 'README.md'), 'utf8') + readFileSync(join(ROOT, 'llms.txt'), 'utf8');
  assert.doesNotMatch(shown, /ghibli/i);
});

test('scenes kept on this machine are not in the catalog, the guides or the shipped scene list', () => {
  const local = ['canopy', 'nausicaa', 'sea-railway', 'peach-ice'], ids = listScenes().map(scene => scene.id);
  assert.deepEqual(local.filter(id => ids.includes(id)), []);
  for (const id of local) assert.throws(() => findScene(id), {code: 'UNKNOWN_SCENE'});
  // The shipped list must load without the local modules: it may not import them.
  const shipped = readFileSync(join(ROOT, 'src', 'splat', 'scenes.js'), 'utf8');
  assert.doesNotMatch(shipped, /nausicaa|seaRailway|peachIce|scenes\.local|id:'canopy'/);
  for (const file of ['AGENTS.md', 'README.md', 'llms.txt']) assert.doesNotMatch(readFileSync(join(ROOT, file), 'utf8'), /canopy|nausica|sea[- ]railway|peach/i, file);
  // The guide's count is the catalog's.
  assert.match(readFileSync(join(ROOT, 'AGENTS.md'), 'utf8'), new RegExp(`the ${ids.length} built-in scenes`));
});

test('the example scenes in the prompting guide are valid, clean and linked', () => {
  const folder = join(ROOT, 'docs', 'examples'), guide = readFileSync(join(ROOT, 'docs', 'prompting.md'), 'utf8');
  const files = readdirSync(folder).filter(file => file.endsWith('.json'));
  assert.ok(files.length >= 4);
  for (const file of files) {
    const report = inspectScene(JSON.parse(readFileSync(join(folder, file), 'utf8')));
    assert.deepEqual([report.valid, report.errors, report.warnings], [true, [], []], file);
    assert.ok(report.splats > 1000 && report.splats < 60000, `${file}: ${report.splats} marks`);
    assert.ok(guide.includes(`(examples/${file})`), `${file} is linked from the guide`);
    // The guide states each example's size: it must be the document's.
    const stated = new RegExp(`examples/${file.replace('.', '\\.')}\\)[^\\n]*?(\\d+) items`).exec(guide);
    assert.equal(Number(stated?.[1]), report.items.length, `${file}: item count in the guide`);
  }
});
