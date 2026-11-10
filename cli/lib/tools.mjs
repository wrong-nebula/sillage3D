/** Everything Sillage can do from outside a page, as tools: a name, a
 * description, a JSON Schema for the input, and `run(input, context)` that
 * returns {text, data, images: [{path, png}]}. The command line, the MCP
 * server and `sillage tools` (for LLM tool use) are all views of this list. */
import {mkdir, writeFile, access} from 'node:fs/promises';
import {dirname, isAbsolute, resolve} from 'node:path';
import {SillageError, didYouMean} from '../../src/sillage/errors.js';
import {STYLE_GROUPS, STYLE_OPTIONS, styleSchema, validateStyle} from '../../src/sillage/styles.js';
import {PUBLIC_CONTENT_TYPES, TEMPLATE_NAMES, compileScene, inspectScene, sceneSchema, starterScene} from '../../src/sillage/scene.js';
import {listScenes, describeScene} from '../../src/sillage/catalog.js';
import {encodeTreeSplats} from '../../src/splat/proceduralTrees.js';
import {ROOT, openSession, resolveScene} from './session.mjs';

const SCENE = {description: 'What to draw: a built-in scene id (see list_scenes), a path to a scene .json or a .splat file, or a scene document object.', oneOf: [{type: 'string'}, {type: 'object'}]};
const CAMERA = {type: 'object', description: 'Camera override. Any of position [x,y,z], target [x,y,z], fov (degrees), focalLength (mm). Omitted fields keep the scene\'s own.',
  properties: {position: {type: 'array', items: {type: 'number'}, minItems: 3, maxItems: 3}, target: {type: 'array', items: {type: 'number'}, minItems: 3, maxItems: 3}, fov: {type: 'number', minimum: 5, maximum: 120}, focalLength: {type: 'number', minimum: 1, maximum: 1000}}, additionalProperties: false};
const VIEW = {type: 'object', properties: {yaw: {type: 'number', description: 'Degrees around the target. 0 is the scene\'s own view, 90 looks from its right, 180 from behind.'}, pitch: {type: 'number', description: 'Degrees above the scene\'s own view.'}, zoom: {type: 'number', exclusiveMinimum: 0, description: 'Above 1 moves closer.'}}, additionalProperties: false};
const LOOK = {
  style: {...styleSchema(), description: 'Render options to change; see list_styles. Omitted options keep the scene\'s own look.'},
  camera: CAMERA,
  parameters: {type: 'object', description: 'Scene parameters, for scenes that have them: "season" 0-1 (cliff-talus), "night" true/false (hollow-reef).', properties: {season: {type: 'number', minimum: 0, maximum: 1}, night: {type: 'boolean'}}, additionalProperties: false},
  motion: {type: 'boolean', description: 'Let wind, water and characters move. Default false: a frozen, repeatable frame.'},
  wait: {type: 'number', minimum: 0, maximum: 30, description: 'With motion on, seconds to let the scene run before the frame is taken.'},
  width: {type: 'integer', minimum: 64, maximum: 1920, description: 'Image width in pixels. Default 1280 (or from the scene\'s aspect).'},
  height: {type: 'integer', minimum: 64, maximum: 1200, description: 'Image height in pixels. Default 800.'},
  output: {type: 'string', description: 'Where to write the PNG. Default output/sillage/<scene>.png.'},
};

const exists = path => access(path).then(() => true, () => false);
const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'scene';

/** Viewport for a scene: the requested size, or one that keeps a built-in scene's own aspect. */
function viewport(resolved, {width, height}) {
  const aspect = resolved.kind === 'built-in' ? describeScene(resolved.scene).aspect ?? null : null;
  if (width && height) return {width, height};
  if (width) return {width, height: Math.round(width / (aspect ?? 1.6))};
  if (height) return {width: Math.round(height * (aspect ?? 1.6)), height};
  return aspect ? (aspect >= 1.6 ? {width: 1280, height: Math.round(1280 / aspect)} : {width: Math.round(800 * aspect), height: 800}) : {width: 1280, height: 800};
}
async function prepare(context, input) {
  if (input.style !== undefined) validateStyle(input.style);
  const resolved = await resolveScene(input.scene, {cwd: context.cwd}), size = viewport(resolved, input);
  const session = await context.session(size);
  const description = await session.load(resolved.scene, {style: input.style, camera: input.camera, motion: false, cwd: resolved.baseDir});
  if (input.parameters && Object.keys(input.parameters).length) await session.setParameters(input.parameters);
  if (input.motion) { await session.setMotion(true); if (input.wait) await session.wait(input.wait); }
  return {session, resolved, size, description};
}
async function save(context, png, output, fallback) {
  const path = output ? (isAbsolute(output) ? output : resolve(context.cwd, output)) : resolve(ROOT, 'output', 'sillage', fallback);
  await mkdir(dirname(path), {recursive: true});
  await writeFile(path, png);
  return path;
}
const notes = description => [...(description.report?.warnings ?? []), ...(description.warnings ?? []), ...(description.styleNotes ?? [])];
const cameraLine = camera => `camera position ${JSON.stringify(camera.position)} target ${JSON.stringify(camera.target)} fov ${camera.fov}`;

export const TOOLS = [
  {
    name: 'list_scenes',
    description: 'List the built-in scenes: id, title, description and authored camera. Any id can be given to render, render_views and inspect_scene.',
    input_schema: {type: 'object', properties: {}, additionalProperties: false},
    async run() {
      const scenes = listScenes();
      return {data: {scenes}, text: `${scenes.length} built-in scenes:\n${scenes.map(scene => `  ${scene.id.padEnd(26)} ${scene.title}${scene.description ? ` - ${scene.description}` : ''}`).join('\n')}`};
    },
  },
  {
    name: 'list_styles',
    description: 'List the render options (the "style"): type, range, default and what each does. Give "group" or "key" to narrow it.',
    input_schema: {type: 'object', properties: {group: {type: 'string', enum: Object.keys(STYLE_GROUPS)}, key: {type: 'string', description: 'One option name.'}}, additionalProperties: false},
    async run({group, key}) {
      if (key !== undefined && !STYLE_OPTIONS[key]) throw new SillageError('UNKNOWN_STYLE', `No style option "${key}".`, {hint: didYouMean(key, Object.keys(STYLE_OPTIONS))});
      if (group !== undefined && !STYLE_GROUPS[group]) throw new SillageError('UNKNOWN_STYLE', `No style group "${group}".`, {hint: didYouMean(group, Object.keys(STYLE_GROUPS))});
      const options = Object.entries(STYLE_OPTIONS).filter(([name, option]) => (!key || name === key) && (!group || option.group === group)).map(([name, option]) => ({key: name, ...option}));
      const range = option => option.type === 'number' ? `${option.min} to ${option.max}` : option.type === 'enum' ? option.values.join(' | ') : option.type === 'boolean' ? 'true | false' : '#rrggbb';
      const groups = [...new Set(options.map(option => option.group))];
      return {data: {groups: Object.fromEntries(groups.map(name => [name, STYLE_GROUPS[name]])), options},
        text: groups.map(name => `${name}: ${STYLE_GROUPS[name]}\n${options.filter(option => option.group === name).map(option => `  ${option.key.padEnd(20)} ${range(option).padEnd(24)} default ${String(option.default).padEnd(9)} ${option.description}`).join('\n')}`).join('\n\n')};
    },
  },
  {
    name: 'scene_format',
    description: 'The scene document format: its JSON Schema, the content types with their fields, and the starter templates. Read this before writing a scene.',
    input_schema: {type: 'object', properties: {template: {type: 'string', enum: TEMPLATE_NAMES, description: 'Also return this starter scene in full.'}}, additionalProperties: false},
    async run({template}) {
      const types = Object.fromEntries(Object.entries(PUBLIC_CONTENT_TYPES).map(([type, {summary, fields}]) => [type, {summary, fields: Object.fromEntries(Object.entries(fields).map(([name, [, description, required]]) => [name, required ? `(required) ${description}` : description]))}]));
      const data = {schema: sceneSchema(), contentTypes: types, templates: TEMPLATE_NAMES, ...(template ? {template: starterScene(template)} : {})};
      return {data, text: JSON.stringify(template ? data.template : data.schema, null, 2)};
    },
  },
  {
    name: 'new_scene',
    description: 'Write a starter scene document to a file, to edit from there.',
    input_schema: {type: 'object', properties: {path: {type: 'string', description: 'File to write, for example scenes/still.json.'}, template: {type: 'string', enum: TEMPLATE_NAMES, description: 'Default "still-life".'}, force: {type: 'boolean', description: 'Replace an existing file.'}}, required: ['path'], additionalProperties: false},
    async run({path, template = 'still-life', force = false}, context) {
      const target = isAbsolute(path) ? path : resolve(context.cwd, path), scene = starterScene(template);
      if (await exists(target) && !force) throw new SillageError('FILE_EXISTS', `${target} already exists.`, {hint: 'Pass force (--force) to replace it, or choose another path.'});
      await mkdir(dirname(target), {recursive: true});
      await writeFile(target, JSON.stringify(scene, null, 2) + '\n');
      return {data: {path: target, template}, text: `Wrote the "${template}" template to ${target}\n  check it:   sillage inspect ${path}\n  draw it:    sillage render ${path}`};
    },
  },
  {
    name: 'inspect_scene',
    description: 'Check and measure a scene without drawing it. For a scene document: every problem with its path and a hint, then mark count, bounds, per-item counts, the camera in use and warnings (camera missing the content, too many marks). For a built-in id: its catalog entry, or with "load": true the live engine state (mark count, bounds, features, parameters, style).',
    input_schema: {type: 'object', properties: {scene: SCENE, load: {type: 'boolean', description: 'Load the scene in the engine and report its live state. Needed for mark counts of built-in scenes.'}}, required: ['scene'], additionalProperties: false},
    async run({scene, load = false}, context) {
      let resolved;
      try { resolved = await resolveScene(scene, {cwd: context.cwd}); }
      catch (error) {
        // An invalid document is a result here, not a failure of the tool.
        if (error.code !== 'INVALID_SCENE' || !error.details) throw error;
        return {failed: true, data: {valid: false, errors: error.details, warnings: []}, text: `Invalid: ${error.details.length} problem${error.details.length > 1 ? 's' : ''}\n${error.details.map(problem => `  ${problem.path || '(scene)'}: ${problem.message}${problem.hint ? `\n      ${problem.hint}` : ''}`).join('\n')}`};
      }
      if (load) {
        const session = await context.session({width: 1280, height: 800}), description = await session.load(resolved.scene, {motion: false, cwd: resolved.baseDir});
        return {data: description, text: `${description.scene.title}: ${description.splats} marks, bounds ${JSON.stringify(description.bounds)}\n${cameraLine(description.camera)}\nfeatures: ${Object.entries(description.features).filter(([, on]) => on).map(([name]) => name).join(', ') || 'none'}\nparameters: ${JSON.stringify(description.parameters)}${notes(description).map(note => `\nnote: ${note}`).join('')}`};
      }
      if (resolved.kind === 'built-in') {
        const entry = describeScene(resolved.scene);
        return {data: {valid: true, ...entry}, text: `${entry.id}: ${entry.title}. ${entry.description}\n${cameraLine({fov: entry.camera.fov ?? `(lens ${entry.camera.focalLength} mm)`, ...entry.camera})}\nPass load (--load) for mark count, bounds and features.`};
      }
      const report = inspectScene(resolved.scene, {files: resolved.files});
      if (!report.valid) return {failed: true, data: report, text: `Invalid:\n${report.errors.map(problem => `  ${problem.path || '(scene)'}: ${problem.message}${problem.hint ? `\n      ${problem.hint}` : ''}`).join('\n')}`};
      return {data: report, text: `Valid ${resolved.kind}: ${report.splats} marks, bounds ${JSON.stringify(report.bounds)}, typical mark ${report.meanMarkLength} long\n${cameraLine(report.camera)}${report.cameraIsAutomatic ? ' (framed automatically)' : ''}\nitems: ${report.items.map(item => `${item.id ?? `${item.type}#${item.index}`} ${item.splats}`).join(', ')}${report.warnings.map(warning => `\nwarning: ${warning}`).join('')}`};
    },
  },
  {
    name: 'render',
    description: 'Draw a scene with the real renderer and write a PNG. Returns the image path, the camera used, the mark count and any warnings. Use "orbit" to look from another side, "style" and "camera" to override the scene\'s own.',
    input_schema: {type: 'object', properties: {scene: SCENE, orbit: {...VIEW, description: 'Swing around the scene\'s own view before drawing.'}, scale: {type: 'integer', minimum: 1, maximum: 4, description: 'Supersampling. 1 is enough for review; 2 for a finished image.'}, ...LOOK}, required: ['scene'], additionalProperties: false},
    async run(input, context) {
      const {session, resolved, size, description} = await prepare(context, input);
      if (input.orbit) await session.orbit(input.orbit.yaw ?? 0, input.orbit.pitch ?? 0, input.orbit.zoom ?? 1);
      const {png, width, height} = await session.capture({width: size.width, height: size.height, scale: input.scale ?? 1});
      const camera = (await session.describe()).camera, path = await save(context, png, input.output, `${slug(resolved.name)}.png`);
      return {data: {image: path, width, height, scene: description.scene, splats: description.splats, bounds: description.bounds, camera, parameters: description.parameters, warnings: notes(description), server: session.url},
        text: `Rendered ${description.scene.title ?? resolved.name} (${description.splats} marks) at ${width}x${height}\n${cameraLine(camera)}${notes(description).map(note => `\nnote: ${note}`).join('')}`, images: [{path, png}]};
    },
  },
  {
    name: 'render_views',
    description: 'Draw a scene from several sides into one labelled contact sheet, to check it in the round. By default a turntable of "count" views evenly around the target; or give explicit "views".',
    input_schema: {type: 'object', properties: {scene: SCENE, count: {type: 'integer', minimum: 2, maximum: 16, description: 'Number of turntable views. Default 4.'}, pitch: {type: 'number', description: 'Pitch of every turntable view, degrees. Default 0.'},
      views: {type: 'array', items: VIEW, minItems: 1, maxItems: 16, description: 'Explicit views; wins over count.'}, columns: {type: 'integer', minimum: 1, maximum: 8}, cellWidth: {type: 'integer', minimum: 128, maximum: 1024, description: 'Width of each view in pixels. Default 512.'}, ...LOOK}, required: ['scene'], additionalProperties: false},
    async run(input, context) {
      const {session, resolved, description} = await prepare(context, input);
      const count = input.count ?? 4, views = input.views ?? Array.from({length: count}, (_, i) => ({yaw: Math.round(360 * i / count), pitch: input.pitch ?? 0}));
      const sheet = await session.sheet({views, columns: input.columns ?? null, cellWidth: input.cellWidth ?? 512});
      const path = await save(context, sheet.png, input.output, `${slug(resolved.name)}-views.png`);
      return {data: {image: path, width: sheet.width, height: sheet.height, views: sheet.views, scene: description.scene, splats: description.splats, homeCamera: description.homeCamera, warnings: notes(description)},
        text: `Rendered ${sheet.views.length} views of ${description.scene.title ?? resolved.name} (${description.splats} marks) at ${sheet.width}x${sheet.height}\nviews: ${sheet.views.map((view, i) => `${i + 1}: yaw ${view.yaw} pitch ${view.pitch}`).join(', ')}${notes(description).map(note => `\nnote: ${note}`).join('')}`, images: [{path, png: sheet.png}]};
    },
  },
  {
    name: 'export_splat',
    description: 'Compile a scene document and write its marks as a standard 32-byte .splat file (Y down, as captures are), for other Gaussian splat viewers. Brush-mark styling is the renderer\'s and is not part of the file. A "splatFile" item reads it back upright.',
    input_schema: {type: 'object', properties: {scene: SCENE, output: {type: 'string', description: 'The .splat file to write.'}}, required: ['scene', 'output'], additionalProperties: false},
    async run({scene, output}, context) {
      const resolved = await resolveScene(scene, {cwd: context.cwd});
      if (resolved.kind === 'built-in') throw new SillageError('UNSUPPORTED', 'Built-in scenes cannot be exported: they depend on shaders and assets a .splat file cannot hold.', {hint: 'Export a scene document instead.'});
      // .splat files follow the capture convention, Y down and Z away: a half turn about X.
      const flip = v => [v[0], -v[1], -v[2]], compiled = compileScene(resolved.scene, {files: resolved.files});
      const bytes = Buffer.from(encodeTreeSplats(compiled.splats.map(splat => ({...splat, center: flip(splat.center), axes: splat.axes.map(flip)}))));
      const path = isAbsolute(output) ? output : resolve(context.cwd, output);
      await mkdir(dirname(path), {recursive: true});
      await writeFile(path, bytes);
      return {data: {path, splats: compiled.splats.length, bytes: bytes.length}, text: `Wrote ${compiled.splats.length} marks (${bytes.length} bytes) to ${path}`};
    },
  },
];

export const toolByName = name => TOOLS.find(tool => tool.name === name);

/** A context owns the browser session tools share. Call `close()` when done.
 * `open` is how it gets a session: `openSession` unless you bring your own. */
export function createContext({cwd = process.cwd(), url = undefined, headed = false, open = openSession} = {}) {
  let session = null, opening = null;
  return {
    cwd,
    async session(size) {
      // A session whose page stalled, crashed or lost its GPU is replaced, so one bad call does not spoil the rest.
      if (session && session.state !== 'open') { await session.close(); session = null; }
      if (!session) {
        // Two callers asking at once share one browser.
        opening ??= Promise.resolve(open({...size, ...(url ? {url} : {}), headed})).finally(() => { opening = null; });
        session = await opening;
      }
      if (session.size.width !== size.width || session.size.height !== size.height) await session.resize(size.width, size.height);
      return session;
    },
    async close() { const closing = session ?? await opening?.catch(() => null); session = null; await closing?.close(); },
  };
}

/** Light check of a tool input against its schema: required keys, unknown keys, basic types. */
export function inputProblem(tool, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'The input must be a JSON object.';
  const properties = tool.input_schema.properties ?? {};
  for (const key of tool.input_schema.required ?? []) if (input[key] === undefined) return `"${key}" is required.`;
  for (const [key, value] of Object.entries(input)) {
    const schema = properties[key];
    if (!schema) return `Unknown input "${key}". ${didYouMean(key, Object.keys(properties))}`;
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : Number.isInteger(value) ? 'integer' : typeof value;
    if (schema.type && schema.type !== type && !(schema.type === 'number' && type === 'integer')) return `"${key}" must be ${schema.type === 'integer' ? 'a whole number' : `of type ${schema.type}`}, got ${JSON.stringify(value)}.`;
    if (typeof value === 'number' && ((schema.minimum !== undefined && value < schema.minimum) || (schema.maximum !== undefined && value > schema.maximum))) return `"${key}" is ${value}, outside ${schema.minimum ?? '-inf'} to ${schema.maximum ?? 'inf'}.`;
    if (schema.enum && !schema.enum.includes(value)) return `"${key}" cannot be ${JSON.stringify(value)}. ${didYouMean(String(value), schema.enum)}`;
  }
  return null;
}

/** Run one tool by name. Throws SillageError; returns {text, data, images, failed}. */
export async function runTool(name, input = {}, context) {
  const tool = toolByName(name);
  if (!tool) throw new SillageError('UNKNOWN_TOOL', `No tool "${name}".`, {hint: didYouMean(name, TOOLS.map(entry => entry.name))});
  const problem = inputProblem(tool, input);
  if (problem) throw new SillageError('INVALID_INPUT', `${name}: ${problem}`, {hint: `Inputs: ${Object.keys(tool.input_schema.properties ?? {}).join(', ') || 'none'}.`});
  const result = await tool.run(input, context);
  return {text: result.text ?? '', data: result.data ?? null, images: result.images ?? [], failed: Boolean(result.failed)};
}

/** The tools in the shape LLM APIs take: [{name, description, input_schema}]. */
export const toolDefinitions = () => TOOLS.map(({name, description, input_schema}) => ({name, description, input_schema}));
