# Release notes

Each release of Sillage 3D, newest first. While the project is in alpha, names, options and the scene format may change between releases; every change that affects existing scenes or code is listed here.

## 0.1.0-alpha.1

10 November 2026 · the first public alpha

Sillage 3D is a 3D engine for the browser that draws every Gaussian splat as a brush mark. This is its first public alpha: usable and tested, and expected to change.

**Try it:** [sillage3d.vercel.app](https://sillage3d.vercel.app) · [Summer meadow](https://sillage3d.vercel.app/) · [Thermal hand](https://sillage3d.vercel.app/hand) · [Crow courier](https://sillage3d.vercel.app/bird) · [Four seasons](https://sillage3d.vercel.app/cliff) · [Coral reef](https://sillage3d.vercel.app/coral) · [Physics](https://sillage3d.vercel.app/physics)

### What is in it

- **The renderer.** WebGL2, brush-mark Gaussian splats, three drawing modes (`paint`, `gaussian`, `gouache`) with oil and watercolour variants, baked bounce light, depth of field, ambient occlusion, and 51 render options with documented ranges and defaults.
- **31 built-in scenes**, each addressable by id: painted landscapes, material and stone studies, terrain from survey data, a coral reef with day and night, a cliff that moves through four seasons, a physics lab and a playable courier.
- **Scene documents.** A scene is one JSON file. Ten content types (`ellipsoid`, `plane`, `box`, `disc`, `cylinder`, `cone`, `tube`, `blob`, `splats`, `splatFile`), colour ramps shaded by the light, strokes sized in world units, and three starter templates. A JSON Schema is included.
- **A page API.** `createSillage(canvas, {scene})`: load, style, camera, orbit, project, motion, scene parameters, capture to PNG.
- **A command line.** `scenes`, `new`, `schema`, `inspect`, `styles`, `render`, `views`, `export`, `serve`, `mcp`, `tools`, `guide`.
- **An MCP server** with eight tools, so an LLM client can list scenes, write and check a scene document, and get renders back as images.
- **A Node API.** `openSession()` drives the real renderer in headless Chrome.
- **A viewer** at `/sillage.html` and a studio at `/splat.html`.
- **A prompting guide** with worked examples for level, character, environment and prop design: [Prompting Sillage](docs/prompting.md).

### Built to be driven by people and by agents

- Every error has a stable `code`, a message that names the offending value, and a `hint` that says what to send instead. A mistyped name gets the nearest valid one.
- `inspect` validates and measures a scene document in milliseconds without a browser, and warns about what will look wrong: marks too small to cover a surface, a camera that misses the content, too many marks.
- An instance, the viewer page and a headless session are each always in one named state (`sillage.state`, `window.sillage.state`, `session.state`), with the allowed moves written down as tables in the source and in the reference.
- A headless browser that stalls, crashes or loses its GPU breaks only the call that hit it: the command line and the MCP server start a fresh one on the next call.
- Frames are frozen by default, so the same command draws the same image.

### Requirements

- Node 22.12 or newer.
- A browser with WebGL2 and float textures. Drawing from the command line uses installed Google Chrome in headless mode, and falls back to Playwright's Chromium.

### Known limits

- Names, options and the scene format may change between alpha releases.
- A render from the command line takes 2 to 4 seconds, most of it starting the browser, and about 7 for the largest built-in scenes.
- A lost GPU context is final for that instance: create a new one or reload the page.
- Scene documents use a small set of forms, so organic subjects are approximations.
- Built-in scenes cannot be exported to `.splat`, and their scene-specific controls beyond `season`, `night` and motion are reachable only through `sillage.engine`.
- Captures are at most 1920 x 1200 before supersampling.

### Names that changed before this release

- The gouache drawing mode is `mode: "gouache"`. Its earlier name is still accepted and is answered with the current one.
- The summer meadow scene's id is `summer-hillside`. Its earlier id still loads it.

### Licence

Not open source yet: all rights reserved, see [LICENSE.md](LICENSE.md). You may clone the repository and run it to evaluate it. Work by other authors keeps its own licence, listed in [docs/third-party-notices.md](docs/third-party-notices.md).
