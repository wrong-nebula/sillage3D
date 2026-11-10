#!/usr/bin/env node
/** sillage: the splat engine from the command line.
 *
 *   sillage scenes
 *   sillage render alpine --orbit 40,10 --style mode=gouache -o alpine.png
 *   sillage new still.json && sillage inspect still.json && sillage views still.json
 *
 * Every command prints short text, or the full result as JSON with --json.
 * Errors carry a code and a hint. Exit status: 0 done, 1 failed, 2 bad input. */
import {readFile, access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {SillageError, errorJSON, didYouMean} from '../src/sillage/errors.js';
import {STYLE_OPTIONS} from '../src/sillage/styles.js';
import {TEMPLATE_NAMES} from '../src/sillage/scene.js';
import {ROOT} from './lib/session.mjs';
import {createContext, runTool, toolDefinitions} from './lib/tools.mjs';

const USAGE = `sillage: draw 3D scenes as brush-stroke Gaussian splats.

Scenes
  scenes                         List the built-in scenes.
  new <file> [--template t]      Write a starter scene document (${TEMPLATE_NAMES.join(', ')}). --force replaces a file.
  schema [--template t]          Print the scene document format as JSON Schema, or one starter scene.
  inspect <scene> [--load]       Check and measure a scene without drawing it. --load reads it in the engine.
  styles [key] [--group g]       List the render options: type, range, default, meaning.

Drawing (needs Google Chrome; starts a dev server if none is running)
  render <scene> [-o out.png]    Draw one view.
  views <scene> [-o out.png]     Draw several sides as one labelled sheet. --count 4, --pitch 0,
                                 or --views "0,0 90,0 180,20" (yaw,pitch[,zoom] each), --columns n, --cell 512.
  export <scene> -o out.splat    Write a scene document's marks as a standard .splat file.

  <scene> is a built-in id, a path to a scene .json or a .splat file, or - to read a scene document from stdin.

  --size 1280x800                Image size. Also --width and --height.
  --scale 2                      Supersampling, 1 to 4 (render only).
  --style key=value              A render option; repeat it, or pass one JSON object.
  --camera x,y,z/x,y,z[/fov]     Position / target / field of view. Or a JSON object.
  --orbit yaw,pitch[,zoom]       Swing around the scene's own view (render only).
  --set key=value                A scene parameter: season=0.5, night=true.
  --motion [--wait 2]            Let the scene move, and run it for some seconds first. Default: frozen.

Running
  serve [--port 5180]            Start the viewer: /sillage.html?scene=<id>, ?template=<name> or ?doc=<path>.
  mcp                            Run as an MCP server on stdio, for LLM clients.
  tools                          Print the tool definitions (name, description, input_schema) as JSON.
  guide                          Print the guide for agents (AGENTS.md).

Everywhere
  --json                         Print the full result as JSON. Errors become {"error": {code, message, hint}}.
  --url http://host:port         Use this running dev server instead of finding or starting one.
`;

/** Options each command takes. true: a flag; 'value': takes a value; 'list': may repeat. */
const GLOBAL = {json: true, url: 'value', help: true, headed: true};
const LOOK = {size: 'value', width: 'value', height: 'value', style: 'list', camera: 'value', set: 'list', motion: true, wait: 'value', output: 'value'};
const COMMANDS = {
  scenes: {tool: 'list_scenes', options: {}},
  styles: {tool: 'list_styles', options: {group: 'value'}},
  schema: {tool: 'scene_format', options: {template: 'value'}},
  new: {tool: 'new_scene', options: {template: 'value', force: true}},
  inspect: {tool: 'inspect_scene', options: {load: true}},
  validate: {tool: 'inspect_scene', options: {load: true}},
  render: {tool: 'render', options: {...LOOK, orbit: 'value', scale: 'value'}},
  views: {tool: 'render_views', options: {...LOOK, count: 'value', pitch: 'value', views: 'value', columns: 'value', cell: 'value'}},
  export: {tool: 'export_splat', options: {output: 'value'}},
  serve: {options: {port: 'value'}}, mcp: {options: {}}, tools: {options: {}}, guide: {options: {}}, help: {options: {}}, version: {options: {}},
};
const ALIASES = {o: 'output', out: 'output', h: 'help'};

function bad(message, hint) { return new SillageError('INVALID_INPUT', message, {hint}); }

function parse(argv, allowed) {
  const flags = {}, rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // A lone "-" is the stdin scene; negative numbers are values, not flags.
    if (arg === '-' || !arg.startsWith('-') || /^-\d/.test(arg)) { rest.push(arg); continue; }
    let [name, inline] = arg.replace(/^--?/, '').split(/=(.*)/s, 2);
    name = ALIASES[name] ?? name;
    const kind = allowed[name];
    if (!kind) throw bad(`Unknown option "${arg}".`, `${didYouMean(name, Object.keys(allowed))} Run "sillage help" for usage.`);
    if (kind === true) { flags[name] = true; continue; }
    const value = inline ?? argv[++i];
    if (value === undefined) throw bad(`Option --${name} needs a value.`);
    if (kind === 'list') (flags[name] ??= []).push(value); else flags[name] = value;
  }
  return {flags, rest};
}
const numberOf = (text, name) => { const value = Number(text); if (text === '' || !Number.isFinite(value)) throw bad(`--${name} must be a number, got "${text}".`); return value; };
const numbers = (text, name, min, max) => {
  const values = String(text).split(',').map(part => numberOf(part.trim(), name));
  if (values.length < min || values.length > max) throw bad(`--${name} takes ${min === max ? min : `${min} to ${max}`} comma-separated numbers, got "${text}".`);
  return values;
};
function typed(text, type) {
  if (type === 'number') return numberOf(text, 'style');
  if (type === 'boolean') { if (text === 'true') return true; if (text === 'false') return false; }
  return text;
}
function pairs(list, name, typeOf) {
  if (list.length === 1 && list[0].trim().startsWith('{')) {
    try { return JSON.parse(list[0]); } catch (error) { throw bad(`--${name} is not valid JSON: ${error.message}`); }
  }
  const result = {};
  for (const pair of list) {
    const at = pair.indexOf('=');
    if (at < 1) throw bad(`--${name} takes key=value, got "${pair}".`, `For example --${name} ${name === 'style' ? 'mode=gouache' : 'season=0.5'}.`);
    const key = pair.slice(0, at), text = pair.slice(at + 1);
    result[key] = typed(text, typeOf(key, text));
  }
  return result;
}
function cameraOf(text) {
  if (text.trim().startsWith('{')) { try { return JSON.parse(text); } catch (error) { throw bad(`--camera is not valid JSON: ${error.message}`); } }
  const parts = text.split('/');
  if (parts.length < 2 || parts.length > 3) throw bad(`--camera takes position/target[/fov], got "${text}".`, 'For example --camera 4,3,8/0,1,0/35.');
  return {position: numbers(parts[0], 'camera', 3, 3), target: numbers(parts[1], 'camera', 3, 3), ...(parts[2] !== undefined ? {fov: numberOf(parts[2], 'camera')} : {})};
}
async function stdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (error) { throw new SillageError('INVALID_SCENE', `The scene on stdin is not valid JSON: ${error.message}`); }
}

/** Command-line words to a tool input. */
async function toolInput(command, flags, rest) {
  const input = {}, sceneArg = async () => {
    if (!rest[0]) throw bad(`"${command}" needs a scene.`, 'Give a built-in id ("sillage scenes"), a path to a scene .json or .splat, or - for stdin.');
    return rest[0] === '-' ? stdin() : rest[0];
  };
  if (command === 'styles') { if (rest[0]) input.key = rest[0]; if (flags.group) input.group = flags.group; }
  else if (command === 'schema') { if (flags.template) input.template = flags.template; }
  else if (command === 'new') {
    if (!rest[0]) throw bad('"new" needs a file to write.', 'For example: sillage new scenes/still.json --template still-life');
    Object.assign(input, {path: rest[0]}, flags.template ? {template: flags.template} : {}, flags.force ? {force: true} : {});
  } else if (command === 'inspect' || command === 'validate') { input.scene = await sceneArg(); if (flags.load) input.load = true; }
  else if (command === 'export') {
    input.scene = await sceneArg();
    if (!flags.output) throw bad('"export" needs -o <file.splat>.');
    input.output = flags.output;
  } else if (command === 'render' || command === 'views') {
    input.scene = await sceneArg();
    if (flags.size) {
      const match = /^(\d+)x(\d+)$/i.exec(flags.size);
      if (!match) throw bad(`--size takes WIDTHxHEIGHT, got "${flags.size}".`, 'For example --size 1280x800.');
      input.width = Number(match[1]); input.height = Number(match[2]);
    }
    for (const key of ['width', 'height', 'scale', 'wait', 'count', 'pitch', 'columns']) if (flags[key] !== undefined) input[key] = numberOf(flags[key], key);
    if (flags.cell !== undefined) input.cellWidth = numberOf(flags.cell, 'cell');
    if (flags.style) input.style = pairs(flags.style, 'style', key => STYLE_OPTIONS[key]?.type);
    if (flags.set) input.parameters = pairs(flags.set, 'set', (key, text) => /^(true|false)$/.test(text) ? 'boolean' : 'number');
    if (flags.camera) input.camera = cameraOf(flags.camera);
    if (flags.motion) input.motion = true;
    if (flags.output) input.output = flags.output;
    if (flags.orbit) { const [yaw, pitch, zoom = 1] = numbers(flags.orbit, 'orbit', 2, 3); input.orbit = {yaw, pitch, zoom}; }
    if (flags.views) input.views = flags.views.trim().split(/\s+/).map(view => { const [yaw, pitch = 0, zoom = 1] = numbers(view, 'views', 1, 3); return {yaw, pitch, zoom}; });
  }
  return input;
}

async function serve(flags) {
  const port = flags.port ? numberOf(flags.port, 'port') : 5180, base = `http://127.0.0.1:${port}`;
  const running = await fetch(`${base}/sillage.html`, {signal: AbortSignal.timeout(1500)}).then(response => response.ok, () => false);
  if (running) { console.log(`A server is already running at ${base}\n  viewer:  ${base}/sillage.html?scene=alpine\n  studio:  ${base}/splat.html`); return; }
  const {createServer} = await import('vite');
  const server = await createServer({root: ROOT, server: {host: '127.0.0.1', port, strictPort: true}});
  await server.listen();
  console.log(`Sillage is serving at ${base}\n  viewer:  ${base}/sillage.html?scene=alpine   (also ?template=tree, ?doc=/path/under/public.json)\n  studio:  ${base}/splat.html\nPress Ctrl+C to stop.`);
  await new Promise(() => {});
}

async function main() {
  const [first, ...argv] = process.argv.slice(2), json = process.argv.includes('--json');
  const command = first === '--help' || first === '-h' || first === undefined ? 'help' : first === '--version' ? 'version' : first;
  try {
    if (command === 'atelier' && await access(join(ROOT, 'harness', 'atelier.mjs')).then(() => true, () => false)) {
      // The painting harness keeps its own command line. It is unfinished, so help and suggestions leave it out.
      const child = spawn(process.execPath, [join(ROOT, 'harness', 'atelier.mjs'), ...argv], {stdio: 'inherit', cwd: ROOT});
      child.on('close', code => { process.exitCode = code ?? 1; });
      return;
    }
    const spec = COMMANDS[command];
    if (!spec) throw bad(`Unknown command "${command}".`, `${didYouMean(command, Object.keys(COMMANDS))} Run "sillage help" for usage.`);
    const {flags, rest} = parse(argv, {...GLOBAL, ...spec.options});
    if (command === 'help' || flags.help) return void console.log(USAGE);
    const version = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version;
    if (command === 'version') return void console.log(version);
    if (command === 'guide') return void console.log(await readFile(join(ROOT, 'AGENTS.md'), 'utf8'));
    if (command === 'tools') return void console.log(JSON.stringify(toolDefinitions(), null, 2));
    if (command === 'serve') return void await serve(flags);
    if (command === 'mcp') { const {serveMCP} = await import('./lib/mcp.mjs'); return void await serveMCP({version, url: flags.url}); }

    const context = createContext({url: flags.url, headed: Boolean(flags.headed)});
    try {
      const result = await runTool(spec.tool, await toolInput(command, flags, rest), context);
      if (json) console.log(JSON.stringify(result.data, null, 2));
      else { console.log(result.text); for (const image of result.images) console.log(`image: ${image.path}`); }
      if (result.failed) process.exitCode = 2;
    } finally { await context.close(); }
  } catch (error) {
    const problem = errorJSON(error);
    if (json) console.log(JSON.stringify({error: problem}, null, 2));
    else console.error(`Error [${problem.code}]: ${problem.message}${problem.hint ? `\nHint: ${problem.hint}` : ''}`);
    process.exitCode = error instanceof SillageError && /^(INVALID|UNKNOWN|MISSING|UNSUPPORTED|FILE_EXISTS|TOO_MANY)/.test(problem.code) ? 2 : 1;
  }
}

await main();
