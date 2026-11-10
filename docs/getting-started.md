# Getting started

From nothing to a scene of your own, drawn in brush marks. About ten minutes.

## 1. Install

You need Node 22.12 or newer. Drawing also needs Google Chrome: the command line runs the real renderer in it, headless.

```sh
git clone https://github.com/wrong-nebula/sillage3D.git
cd sillage3D
npm install
```

Every command below is `node cli/sillage.mjs <command>`. `npm run sillage -- <command>` is the same thing, and after `npm link` so is plain `sillage <command>`.

## 2. Draw a built-in scene

```sh
node cli/sillage.mjs scenes                 # the built-in scenes: id, title, description
node cli/sillage.mjs render alpine          # draw one
```

`render` prints the path of a PNG under `output/sillage/`. Open it. The first render takes a few seconds, most of it starting the browser.

Look from another side, change the paint, or change the scene itself:

```sh
node cli/sillage.mjs render alpine --orbit 40,10
node cli/sillage.mjs render alpine --style mode=gouache --style softness=0.3
node cli/sillage.mjs render cliff-talus --set season=0.5      # winter
node cli/sillage.mjs render hollow-reef --set night=true
```

`node cli/sillage.mjs styles` lists every render option with its range and default.

To look around a scene yourself, start the viewer and open the address it prints:

```sh
node cli/sillage.mjs serve                  # then open /sillage.html?scene=alpine
```

Drag to orbit, scroll to zoom, and press R to restore the view.

## 3. Write a scene of your own

A scene is a JSON document. Start from a template:

```sh
node cli/sillage.mjs new scenes/still.json  # the still-life template
```

Open `scenes/still.json`. Only `content` is required: a list of things, each with a `type`. This is a plum on a table:

```json
{
  "sillage": 1,
  "background": "#5b7896",
  "style": {"mode": "gouache", "softness": 0.15},
  "content": [
    {"id": "table", "type": "plane", "size": [9, 5], "color": ["#a99a84", "#d8cdb6", "#ebe2cf"]},
    {"id": "plum", "type": "ellipsoid", "center": [0.6, 0.4, 0.7], "radius": 0.4,
     "color": ["#2a1633", "#4d2456", "#7a3a7c"], "stroke": {"direction": "around"}}
  ]
}
```

Three things to know:

- **+Y is up.** Put the viewer on the +Z side looking toward -Z. A subject 2 to 3 units tall suits the default mark sizes.
- **A list of colours is a ramp**, from dark to light. Each mark takes the tone for how its surface faces the light, in steps. That is what makes it look painted, so use a ramp for anything with form.
- **Leave the camera out** and the content is framed for you.

The forms are `ellipsoid`, `plane`, `box`, `disc`, `cylinder`, `cone`, `tube` and `blob`. There is no `sphere` or `cube`: if you write one, the error names the form to use.

## 4. Check it, then draw it

```sh
node cli/sillage.mjs inspect scenes/still.json
```

`inspect` needs no browser and answers in milliseconds. It lists every problem with the path to it and what to write instead, then the mark count, the bounds, the camera in use, and warnings about what will look wrong: marks too small to cover their surface, a camera that misses the content, too many marks.

```sh
node cli/sillage.mjs render scenes/still.json
node cli/sillage.mjs views scenes/still.json     # four sides in one labelled image
```

The working loop is: edit the JSON, `inspect`, `render`, look, repeat. Frames are frozen by default, so the same command draws the same image and you can compare one edit with the next.

## 5. Go further

- **On your own page.** `createSillage(canvas, {scene})` gives you the same engine with a small API: see [JavaScript API in a page](../AGENTS.md#javascript-api-in-a-page).
- **From a script.** `openSession()` drives the renderer from Node: see [JavaScript API in Node](../AGENTS.md#javascript-api-in-node).
- **From an LLM client.** Add the MCP server, and the model can list scenes, write and check a scene document, and see its renders:

  ```sh
  claude mcp add sillage -- node "/absolute/path/to/sillage3D/cli/sillage.mjs" mcp
  ```

- **Into another viewer.** `node cli/sillage.mjs export scenes/still.json -o still.splat` writes a standard `.splat` file. The brush styling is the renderer's and is not part of the file.

When something goes wrong, the error has a `code` and a `hint`. The [reference](../AGENTS.md) lists every code, and what state each part of the system can be in.
