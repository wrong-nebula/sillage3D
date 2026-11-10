# Third-party notices

Sillage 3D includes code adapted from, and assets made by, other authors. Each keeps its own licence, not the [PolyForm Noncommercial licence](../LICENSE.md) that covers the rest of the repository. The records named in the tables are files in this repository and hold the exact sources, checksums and processing notes.

## Assets

| Where | What | Author and licence | Record |
|---|---|---|---|
| `public/cc0-demo/` | Bee, butterfly and potted-plant splat | Gobkit; Čestmír Dammer (CDmir) and TinyWorlds; Poly Haven, DX.GL and Innerscene. CC0 1.0 | `public/cc0-demo/LICENSES.txt`, `sources.json` |
| `public/hand-study/` | Realistic hand model | Dan Ulrich / Blender Studio. CC0 1.0 | `public/hand-study/SOURCE.txt` |
| `public/hollow-reef/` | Clownfish model | Grab3D. CC0 1.0; AI-assisted, as its record discloses | `public/hollow-reef/clownfish-LICENSE.txt`, `clownfish-source.json` |
| `public/hollow-reef/audio/` | Underwater ambience | Joseph Sardin and Axeline T., BigSoundBank. CC0 1.0 | `public/hollow-reef/audio/provenance.json` |
| `public/audio/`, `public/cliff-audio/` | Wind, birdsong, cicadas and other ambience | Listed per track; CC0 1.0 | `credits.json` in each folder |
| `public/hdri/` | Studio Small 09 environment | Sergej Majboroda, Poly Haven. CC0 1.0 | `public/hdri/LICENSE.txt` |
| `public/furka-pass/`, `public/furka-lidar/`, `public/furka-lidar-photo/` | Elevation, LiDAR and orthophotos of the Furka Pass | ©swisstopo: swissALTI3D, swissSURFACE3D, SWISSIMAGE | `terrain.json` in each folder |
| `public/tsarmine/`, `public/tsarmine-photo/` | Drone survey of the Tsarmine rock glacier, 3 October 2025 | Vivero et al. (2026). CC BY 4.0 | `terrain.json` in each folder |
| `public/libreterrain-alpine/`, `public/libreterrain-alpine-photo/` | Terrain built with LibreTerrain; cliff, scree, grass and snow materials | LibreTerrain build; materials from Poly Haven, CC0 1.0 | `terrain.json` in each folder |
| `public/tengu-courier/` | Courier character, its animations and foley | Made for this project with generative tools; the records name each model and request | `public/tengu-courier/provenance.json`, `audio/manifest.json` |

## Libraries

| Library | Licence |
|---|---|
| [three.js](https://threejs.org) | MIT |
| [DM Sans](https://github.com/googlefonts/dm-fonts), through `@fontsource/dm-sans` | SIL Open Font License 1.1 |
| [Vite](https://vite.dev), [Playwright](https://playwright.dev) (development and headless drawing) | MIT, Apache 2.0 |

## Adapted code

### Lens flare

`src/splat/lensFlare.js` adapts the analytic sun-flare layout, warm/cool tints, and disc visibility sampling from `Lego homeworld/client/js/render/post.js`. The Gaussian kernels, inverse-alpha visibility, and integration into this splat renderer are local adaptations. No source files or assets in Lego homeworld were changed.

MIT License

Copyright (c) 2026 abouchedidxcode

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
