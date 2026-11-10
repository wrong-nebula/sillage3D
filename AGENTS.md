# Sillage for agents

Sillage is a browser-based 3D Gaussian splat engine in which every splat is drawn as a brush mark. This file is the reference for driving it from code or from a model: the command line, the MCP server, the JavaScript API, and the scene document format. `sillage guide` prints it.

Everything below is one API seen four ways. The same eight tools back the command line, the MCP server and `sillage tools`; the same `Sillage` class backs the page and the headless session.

## Start here

```sh
npm install                                   # once; drawing also needs Google Chrome
node cli/sillage.mjs scenes                   # the 31 built-in scenes
node cli/sillage.mjs render alpine            # draw one; prints the PNG path
node cli/sillage.mjs new scenes/still.json    # write a starter scene document
node cli/sillage.mjs inspect scenes/still.json
node cli/sillage.mjs views scenes/still.json  # four sides in one labelled image
```

`npm run sillage -- <command>` and, after `npm link`, plain `sillage <command>` are the same thing. Images go to `output/sillage/` unless `-o` says otherwise. Open them to see the result.

The working loop for building a scene:

1. `schema --template still-life` to see the format on a real example, or `new` to start a file.
2. Edit the JSON.
3. `inspect` it. This takes milliseconds and needs no browser. Fix every error and read the warnings.
4. `render` it and look at the image. Then `views` to check it from all sides.
5. Change a few things and repeat from 3.

## Command line

| Command | What it does |
|---|---|
| `scenes` | List built-in scenes: id, title, description. |
| `new <file> [--template still-life\|tree\|minimal] [--force]` | Write a starter scene document. |
| `schema [--template t]` | The scene format as JSON Schema, or one starter scene in full. |
| `inspect <scene> [--load]` | Validate and measure without drawing. `--load` reads a built-in scene in the engine for its mark count, bounds, features and parameters. |
| `styles [key] [--group g]` | Render options: type, range, default, meaning. |
| `render <scene> [-o out.png]` | Draw one view. |
| `views <scene> [-o out.png]` | Several sides as one sheet: `--count 4 --pitch 0`, or `--views "0,0 90,0 180,20"`, `--columns`, `--cell 512`. |
| `export <scene> -o out.splat` | Write a document's marks as a standard 32-byte `.splat` (Y down, as captures are; a `splatFile` item reads it back upright). |
| `serve [--port 5180]` | Start the viewer at `/sillage.html`. |
| `mcp` | MCP server on stdio. |
| `tools` | Tool definitions as JSON (`name`, `description`, `input_schema`), for LLM tool use. |
| `guide` | Print this file. |

`<scene>` is a built-in id, a path to a scene `.json`, a path to a `.splat` file, or `-` to read a scene document from stdin.

Options for `render` and `views`:

| Option | Meaning |
|---|---|
| `--size 1280x800`, `--width`, `--height` | Image size, up to 1920 x 1200. Default 1280 x 800. |
| `--scale 2` | Supersampling, 1 to 4 (`render`). |
| `--style key=value` | A render option. Repeat it, or pass one JSON object. |
| `--camera x,y,z/x,y,z[/fov]` | Position / target / vertical field of view. Or a JSON object. |
| `--orbit yaw,pitch[,zoom]` | Swing around the scene's own view, in degrees (`render`). |
| `--set key=value` | Scene parameter: `season=0.5` (cliff-talus), `night=true` (hollow-reef). |
| `--motion [--wait 2]` | Let wind, water and characters move, and run the scene for some seconds first. |
| `--json` | Print the full result as JSON. |
| `--url http://host:port` | Use this dev server. Default: 5180, then 5181, then a private one. |

Frames are frozen by default, so the same command draws the same image. Exit status is 0 on success, 2 for bad input (unknown scene, invalid document, bad option) and 1 for anything else. Errors go to stderr as `Error [CODE]: message` and `Hint: what to send instead`; with `--json` they go to stdout as `{"error": {"code", "message", "hint", "details"}}`.

## MCP

```sh
claude mcp add sillage -- node "/absolute/path/to/experiments/gaussian-brush/cli/sillage.mjs" mcp
```

Tools: `list_scenes`, `list_styles`, `scene_format`, `new_scene`, `inspect_scene`, `render`, `render_views`, `export_splat`. Inputs match the command-line options (`sillage tools` prints the schemas); `scene` may be an id, a path, or the scene document itself as an object. `render` and `render_views` return the PNG inline as an image as well as its path. One browser stays open between calls, so only the first render pays the start-up cost.

## Scene documents

A scene is a JSON object. Only `content` is required.

```json
{
  "sillage": 1,
  "title": "Plum on a table",
  "background": "#5b7896",
  "palette": {"cloth": "#d8cdb6"},
  "camera": {"position": [1.6, 2.6, 7.2], "target": [0, 0.85, 0], "fov": 32},
  "light": [-0.7, 1.1, 0.8],
  "style": {"mode": "gouache", "softness": 0.15},
  "content": [
    {"id": "table", "type": "plane", "center": [0, 0, 0], "size": [9, 5], "color": ["#a99a84", "cloth", "#ebe2cf"]},
    {"id": "plum", "type": "ellipsoid", "center": [0.6, 0.4, 0.7], "radius": 0.4,
     "color": ["#2a1633", "#4d2456", "#7a3a7c", "#a8689f"], "stroke": {"direction": "around"}}
  ]
}
```

**Coordinates.** +Y is up. Put the viewer on the +Z side looking toward -Z, with +X to the right. Units are arbitrary: a subject 2 to 3 units tall with the camera 8 to 12 units away suits the default mark sizes. Angles are degrees.

**Top-level fields**

| Field | Meaning |
|---|---|
| `content` | The things in the scene, drawn together. Required. |
| `camera` | `{position, target, fov}` or `focalLength` in mm. Omit it and the content is framed automatically. |
| `background` | Colour behind all marks. It shows wherever no mark lands. |
| `style` | Render options (below). |
| `lighting` | `"baked"` (default): bounce light and shadow tint are computed from the marks. `"flat"`: colours exactly as written. |
| `light` | Direction toward the light. It shades colour ramps and casts the baked shadows. Default `[-0.8, 1.1, 0.7]`. |
| `atmosphere` | Distance fog: `{color, start, density, max, horizonColor, heightStart, heightDensity}`. |
| `palette` | Named colours, usable wherever a colour is expected. |
| `seed` | Whole number that fixes every random choice. Each item has its own stream, so editing one item leaves the others unchanged. |
| `title`, `description`, `sillage` | Labels, and the format version (1). |

**Content types.** Every item has a `type`. Forms take `color`, `opacity`, `count`, `stroke`, `material` and `unlit` (colours exactly as written, with no baked shadow or bounce: lamps, flames, skies); every item takes `id`, `position`, `rotation` and `scale`.

| `type` | Draws | Its own fields |
|---|---|---|
| `ellipsoid` | A sphere or ellipsoid shell: fruit, stones, heads, hills, domes. | `center`, `radius` or `radii` [x, y, z] |
| `plane` | A flat rectangle: ground, walls, water, table tops. | `center`, `size` [width, height], `normal` (default up; a back wall is `[0, 0, 1]`), `up` |
| `box` | A box painted on six faces: buildings, crates, steps, slabs. | `center`, `size` [x, y, z] |
| `disc` | A flat round disc: ponds, plates, lids, round rugs. | `center`, `radius`, `normal` (default up, lying flat) |
| `cylinder` | An upright round solid standing on its base, closed at both ends: towers, columns, drums, pots, stumps. | `base` (centre of the bottom face), `radius` (one number, or [bottom, top] for a taper), `height`, `axis` (default up), `caps` (default `"both"`) |
| `cone` | A cone standing on its base, closed underneath: roofs, spires, tips. | `base`, `radius`, `height`, `axis` (the way the tip points, default up) |
| `tube` | A tube along a path, open at the ends unless capped: trunks, branches, limbs, ropes, pipes. | `path` [[x, y, z], ...] (required), `radius` (one number, or one per point for a taper), `caps` (default `"none"`) |
| `blob` | A soft volume of loosely turned marks: foliage, cloud, smoke. | `center`, `radius` or `radii`, `fill` 0 to 1 |
| `splats` | Marks written out one by one. | `splats` (required): each `{at, normal, direction, size: [length, width, thickness], color, opacity}`, or a raw Gaussian `{center, axes: [[x,y,z] x 3], color, opacity}` |
| `splatFile` | A trained Gaussian splat in `.splat` format, drawn as paint. | `file` (required), `height` (default 3), `flipYZ` |

`caps` is `"none"`, `"start"`, `"end"` or `"both"`. There is no `sphere`, `cube` or `pyramid`: use `ellipsoid`, `box` and `cone`. The error for a wrong type names the right one.

**Colour.** One of:

- `"#rrggbb"`, a palette name, or `[r, g, b]` with values from 0 to 1.
- A list of colours from dark to light: `["#3b2a20", "#8a5a3c", "#d9a66f"]`. Each mark takes the tone for how its surface faces the light, in steps, which gives the painted look. Three to six tones work well. Use this for anything with form.
- `{"ramp": [...], "variation": 0.12}`: the same, with control over how broken the tone boundaries are.
- `{"gradient": {"axis": "y", "stops": [[0, "#2b3a55"], [3, "#9fb4d6"]]}}`: by world position along x, y or z.

**Strokes.** `stroke` is `{length, width, thickness, direction, spread, jitter}`. Sizes are painted sizes in world units: a mark of length 0.4 reads about 0.4 long on screen. Leave them out and marks are sized to cover the surface for the given `count`. `direction` is `[x, y, z]`, `"along"` (the form's own axis), `"around"`, `"up"`, `"down"` or `"random"`; `spread` adds a random deviation in degrees.

**Marks and coverage.** `count` sets how many marks an item gets. Coverage comes from mark size, not number: a few hundred to a few thousand marks per item is normal, 5,000 to 60,000 for a scene. `inspect` warns when marks are too small to cover their surface (the background shows between them), when the camera misses the content, and above 150,000 marks. 400,000 is refused.

**Transforms.** `rotation` and `scale` turn a form about its own centre (`center`, the middle of a `path`, or halfway up a `cylinder` or `cone`); `position` then moves it. Imported marks (`splats`, `splatFile`) turn about their own origin.

## Render options

`sillage styles` lists all 51 with ranges and defaults. The ones that matter most:

| Option | Values | Effect |
|---|---|---|
| `mode` | `paint`, `gaussian`, `gouache` | Layered dabs with defined edges; soft Gaussians; gouache with broken edges and grain. |
| `oil`, `watercolor` | boolean | Other marks, with `mode: "gouache"`: a loaded flat oil brush, or a transparent wash. |
| `brushScale` | 0.25 to 3 | Size of every mark. |
| `softness` | 0 to 1 | Edge softness of every mark. |
| `coverage` | 0.5 to 1.5 | Opacity of every mark. |
| `gouacheTexture`, `gouacheBlend`, `gouacheTone` | 0 to 1 | Grain, wet merging, colour grade. `gouacheTone: 0` leaves colours as written. |
| `paperScale` | 0.02 to 20 | Size of the wash and grain shared across marks. 1 is as authored; smaller suits scenes of small marks. |
| `indirect`, `bounceStrength`, `tintedShadows`, `shadowTint` | | How baked light is applied. |
| `sun`, `lensFlare`, `lensDirt` | boolean | Sky effects. Off by default in scene documents, on in most built-in landscapes. |
| `foregroundDOF`, `focusDistance` | | Depth of field. |
| `ssao`, `ssaoStrength`, `ssaoRadius` | | Ambient occlusion in creases and contacts. |

A scene document's `style` and the `--style` option take the same keys. An unknown key or an out-of-range value is an error that names the nearest valid one. `describe().styleNotes` lists options that are set but do nothing because another is off.

## JavaScript API in a page

```js
import {createSillage} from '/src/sillage/index.js';

const sillage = await createSillage(canvas, {scene: 'alpine'});   // or a scene document
sillage.setStyle({mode: 'gouache', softness: 0.3});
sillage.orbit(40, 10);
const blob = await sillage.capture({width: 1024});                // PNG
console.log(sillage.describe());
sillage.dispose();
```

| Method | Returns |
|---|---|
| `createSillage(canvas, {scene, style, camera, files, motion, loop, onFrame, onError, onState})` | A `Sillage`, loaded if `scene` is given. |
| `state` | `"empty"`, `"loading"`, `"ready"`, `"lost"` or `"disposed"`; see [States](#states). `onState(state, previous, sillage)` is called on every change. |
| `load(scene, {style, camera, files, motion})` | `describe()`. `scene` is an id, a document, or a raw engine definition. `files` maps each path a document refers to onto its bytes. |
| `describe()` | Plain JSON: state, scene, mark count, bounds, camera, home camera, style, features, parameters, viewport, compile report. |
| `setStyle(patch)`, `getStyle()`, `resetStyle()` | The full style in effect. |
| `setCamera({position, target, fov, focalLength})`, `getCamera()`, `resetCamera()` | The camera. Omitted fields stay. |
| `orbit(yaw, pitch, zoom)` | The camera, swung around the scene's own view. `orbit(0, 0)` is that view. |
| `project([[x, y, z], ...])` | `[{x, y, depth, inFrame}]`, x and y from 0 to 1 from the top-left. |
| `setMotion(playing)` | Play or freeze wind, characters, water light, seasons and opening sequences. |
| `setParameters({season, night})` | Scene parameters; `describe().parameters` shows which a scene has. |
| `renderFrame()` | Draws until the view is at rest. |
| `capture({width, height, scale})` | A PNG `Blob`. Drawn at up to 1920 x 1200 times `scale`, then resampled to the size asked for. Captures asked for together are taken one after another. |
| `resize(width, height)`, `dispose()` | |
| `sillage.engine` | The underlying `GaussianBrushRenderer`, for anything not covered here. |

Every method validates its input and throws a `SillageError` with `code`, `message`, `hint` and sometimes `details`. `/sillage.html` is this API on one canvas: `?scene=<id>`, `?template=<name>` or `?doc=<path>`, plus `style.<key>=<value>` and `motion=0`. On that page `window.sillage.api` is the instance, `window.sillage.call(method, params)` is the same API as JSON in, `{ok, result | error}` out, and `window.sillage.state` says whether it can be called yet.

Pure modules, usable in Node without a browser: `src/sillage/scene.js` (`validateScene`, `inspectScene`, `compileScene`, `sceneDefinition`, `sceneSchema`, `starterScene`), `src/sillage/styles.js` (`STYLE_OPTIONS`, `validateStyle`), `src/sillage/brush.js` (`createBrush`: `mark`, `ellipsoid`, `plane`, `box`, `tube`, `blob`), `src/sillage/catalog.js` (`listScenes`, `findScene`).

## JavaScript API in Node

```js
import {openSession, starterScene, inspectScene} from './cli/index.mjs';

console.log(inspectScene(starterScene('tree')).warnings);         // no browser

const session = await openSession({width: 1280, height: 800});    // headless Chrome
await session.load('cliff-talus');                                // id, document, or path
await session.setParameters({season: 0.5});
const {png} = await session.capture({width: 1024});               // Buffer
const sheet = await session.sheet({views: [{yaw: 0}, {yaw: 90}, {yaw: 180}, {yaw: 270}]});
await session.close();
```

A session has `load`, `describe`, `setStyle`, `setCamera`, `orbit`, `setMotion`, `setParameters`, `project`, `wait`, `resize`, `capture`, `sheet` and `close`, with the meanings above, and a `state` (see [States](#states)). `runTool(name, input, createContext())` runs any of the eight tools and returns `{text, data, images, failed}`. The package exports are `sillage` (page), `sillage/node`, `sillage/scene`, `sillage/styles` and `sillage/brush`.

## States

Three things have a life cycle. Each is always in exactly one named state, readable at any time, and each state allows a fixed set of moves. The tables are data in the source (`SILLAGE_STATES`, `HOST_STATES`, `SESSION_STATES`), built with `createMachine` from `src/sillage/machine.js`.

**A `Sillage`** (`sillage.state`, `describe().state`)

| State | Meaning | What works | Moves to |
|---|---|---|---|
| `empty` | No scene yet. | `load`, `describe`, `dispose`. Anything that needs a scene throws `NO_SCENE`. | `loading`, `lost`, `disposed` |
| `loading` | A load is in flight. A scene loaded before stays on screen and in use until the new one lands. | Everything; calls apply to the scene on screen. | `ready`, `empty`, `lost`, `disposed` |
| `ready` | A scene is loaded. | Everything. | `loading`, `lost`, `disposed` |
| `lost` | The GPU context is gone. Final. | `describe`, `dispose`. Everything else throws `GPU_LOST`. | `disposed` |
| `disposed` | `dispose()` was called. Final. | `describe`. Everything else throws `DISPOSED`. | |

A load that fails on its input or its assets leaves the scene loaded before in place, and the state goes back to `ready`. A load started while another is in flight wins; the one it overtakes rejects with `SUPERSEDED`. A frame that throws without losing the GPU stops the draw loop and is reported through `onError`; `renderFrame` and `capture` still work, and the next `load` starts the loop again.

**The `/sillage.html` page** (`window.sillage.state`)

| State | Meaning | Moves to |
|---|---|---|
| `booting` | The page is starting. Do not call it yet. | `ready`, `failed` |
| `ready` | `window.sillage.call` answers. `window.sillage.ready` is the same fact as a boolean. | `failed` |
| `failed` | It could not start, or lost its GPU. `window.sillage.error` is `{code, message, hint}`. Reload the page. | |

While a scene loads, the caption reads "Loading <scene>…" and the canvas has `aria-busy`.

**A Node `Session`** (`session.state`)

| State | Meaning | Moves to |
|---|---|---|
| `closed` | Nothing is running. Calls throw `CLOSED`. | `opening` |
| `opening` | The server, browser and page are starting. A failure here stops whatever had started and goes back to `closed`. | `open`, `closed` |
| `open` | Calls work. | `broken`, `closed` |
| `broken` | The page stalled, crashed or lost its GPU. Calls throw `CLOSED` and say why. `close()` it, then open another. | `closed` |

The command line and the MCP server replace a broken session by themselves: the call that hit the problem fails with a code and a hint, and the next call starts a fresh browser.

## Error codes

Bad input: `INVALID_SCENE`, `INVALID_STYLE`, `INVALID_CAMERA`, `INVALID_COLOR`, `INVALID_SIZE`, `INVALID_INPUT`, `INVALID_PARAMETER`, `INVALID_POINTS`, `INVALID_VIEWS`, `INVALID_CANVAS`, `UNKNOWN_SCENE`, `UNKNOWN_TOOL`, `UNKNOWN_TEMPLATE`, `UNKNOWN_PARAMETER`, `UNKNOWN_STYLE`, `UNKNOWN_METHOD`, `UNSUPPORTED_PARAMETER`, `UNSUPPORTED`, `MISSING_FILE`, `FILE_EXISTS`, `TOO_MANY_SPLATS`. `INVALID_SCENE` carries `details`: one `{path, message, hint}` per problem, with paths like `content[2].stroke.length`.

Wrong state (see [States](#states)): `NO_SCENE` (load one first), `SUPERSEDED` (a newer load took over), `DISPOSED`, `GPU_LOST`, `CLOSED`, `ALREADY_OPEN` (a session opened twice). `INVALID_STATE` means a move outside the tables above, which is a bug in Sillage rather than in the call.

Environment: `NO_SERVER`, `NO_BROWSER`, `NO_WEBGL`, `ASSET_ERROR`, `PAGE_TIMEOUT`, `PAGE_ERROR`. Anything unforeseen is `INTERNAL`.

## What to know before relying on it

- Drawing needs a GPU browser. The session uses installed Google Chrome in headless mode, falling back to Playwright's Chromium. A render takes 2 to 4 seconds, most of it start-up, and about 7 for the largest built-in scenes. Chrome sometimes stalls right after launch; the session notices within 15 seconds, kills it and starts another. A page that dies later breaks its session, and the next command or MCP call starts a new one.
- A running dev server on port 5180 or 5181 is reused. If it belongs to another checkout it serves that checkout's code: pass `--url` or stop it.
- Scene documents use a small set of forms. Organic subjects are approximations.
- Built-in scenes cannot be exported to `.splat`, and their scene-specific controls beyond `season`, `night` and motion (water ripples, the playable courier, physics) are reachable only through `sillage.engine`.
- Captures are at most 1920 x 1200 before `scale`. Marks are sized in world units, so a larger capture shows the same picture with finer edges.
- Edge softness, grain and lens effects are the renderer's. They are not part of an exported `.splat`.

## Where things are

| Path | What |
|---|---|
| `src/sillage/index.js` | `Sillage`, `createSillage`: the page API. |
| `src/sillage/scene.js` | Scene documents: validate, compile, schema, templates. |
| `src/sillage/brush.js` | The mark builder behind content types. |
| `src/sillage/styles.js` | The render option table. |
| `src/sillage/catalog.js`, `errors.js`, `host.js` | Built-in scene lookup, `SillageError`, the `/sillage.html` page. |
| `src/sillage/machine.js` | `createMachine`: the state tables behind [States](#states). |
| `cli/sillage.mjs`, `cli/lib/` | Command line, headless session, tools, MCP server. `cli/index.mjs` is the Node entry. |
| `src/splat/GaussianBrushRenderer.js`, `src/splat/scenes.js` | The renderer and the built-in scenes. |
| `tests/sillage-api.test.js`, `tests/browser-sillage.mjs` | Checks without and with a browser. |

```sh
npm run test:sillage             # 23 checks, no browser, about 2 seconds
node tests/browser-sillage.mjs   # end to end in headless Chrome
npm test                         # everything that needs no browser
```

When you add a render option to the engine, add it to `src/sillage/styles.js`: a test compares the table with the engine's defaults. When something gains a life cycle, give it a state table with `createMachine` instead of flags, and list it under States: a test compares this file with the tables and with every error code in the source. When you add a content type, add it to `CONTENT_TYPES` in `scene.js` and a method of the same name to the brush; validation, the schema and `scene_format` follow from the table.
