# Sillage 3D documentation

Start with the first two. The reference is one file on purpose: it is what `sillage guide` prints, and what an agent reads.

| | |
|---|---|
| [Getting started](getting-started.md) | Install, draw a built-in scene, then write, check and draw a scene of your own. About ten minutes. |
| [Reference](../AGENTS.md) | Every command and option, the scene document format, render options, the JavaScript API for a page and for Node, the MCP server, states and error codes. |
| [How the rendering works](gaussian-brush-method.md) | How a Gaussian splat becomes a brush mark: the kernel, sorting, light, the gouache, oil and watercolour marks, and what each optimisation measured. |
| [Physics](splat-physics.md) | The splat physics lab: rigid rocks, cloth, water, fire, and ground materials such as sand and snow. |
| [Release notes](../CHANGELOG.md) | What each release contains and what changed. |
| [Third-party notices](third-party-notices.md) | Code and assets from other authors, with licences and sources. |

## Where to look for what

| I want to... | Read |
|---|---|
| See it running | The [live demos](https://sillage3d.vercel.app) |
| Draw a built-in scene | [Getting started](getting-started.md#2-draw-a-built-in-scene) |
| Write a scene as JSON | [Getting started](getting-started.md#3-write-a-scene-of-your-own), then [Scene documents](../AGENTS.md#scene-documents) |
| Change how the paint looks | [Render options](../AGENTS.md#render-options), or `sillage styles` |
| Put the engine on my own page | [JavaScript API in a page](../AGENTS.md#javascript-api-in-a-page) |
| Render from a script | [JavaScript API in Node](../AGENTS.md#javascript-api-in-node) |
| Let an LLM draw scenes | [MCP](../AGENTS.md#mcp) |
| Understand an error | [Error codes](../AGENTS.md#error-codes) and [States](../AGENTS.md#states) |

## For agents

[`llms.txt`](../llms.txt) at the repository root indexes these files. `node cli/sillage.mjs guide` prints the reference, `node cli/sillage.mjs tools` prints the tool definitions as JSON, and `node cli/sillage.mjs schema` prints the scene format as JSON Schema.
