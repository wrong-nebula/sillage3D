# Gaussian brush experiment

This is an isolated copy of the existing renderer with a new splat pipeline. The original project outside `experiments/gaussian-brush/` is preserved. Its source, public assets, tests, documentation, and entry points were copied before development; `original-manifest.json` records their starting SHA-256 hashes. The copied earlier studios remain available at `/` and `/three.html`.

## Run

From this experiment directory:

```sh
npm install
npm run dev -- --port 5180
```

Open `http://127.0.0.1:5180/splat.html`. Use orbit to inspect the scene from different sides, and compare the paint and Gaussian modes. Run `npm test` and `npm run build` for validation.

## Representation and projection

The scene is manually authored, procedurally sampled 3D geometry represented by splats on all sides. Each mark has a world-space center, three scaled orthogonal axes, color, opacity, and a deterministic seed. Its nonzero thickness participates in projection. Geometry marks remain attached to the scene when the camera moves. The optional painterly vignette is a separate screen-space finishing layer described below.

For a matrix `A` containing the three scaled world-space axes, the 3D covariance is:

```text
Σ3 = A Aᵀ
B = J W A
Σ2 = B Bᵀ + ε I
G(δ) = exp(−½ δᵀ Σ2⁻¹ δ)
```

`W` is the camera's linear view transform; `J` is the perspective Jacobian at the mark center; `δ` is a pixel's displacement from its projected center. A small pixel-space filter `ε` prevents disappearing subpixel marks. In Three.js camera coordinates, `d = −z > 0`, with pixel focal lengths `fx, fy`:

```text
J = [ fx/d    0     fx·x/d² ]
    [   0   fy/d    fy·y/d² ]
```

Instanced quads bound the projected ellipses. Splats are composited back to front, sorted by view-space center depth when the view changes. Depth writes are disabled so translucent marks accumulate. The covariance construction follows the [original 3D Gaussian Splatting rasterizer](https://github.com/graphdeco-inria/diff-gaussian-rasterization/blob/main/cuda_rasterizer/forward.cu) and [3DGS paper](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/).

## Paint appearance

Gaussian mode exposes the ordinary soft kernel for comparison. Paint mode reshapes its density into fuller, more opaque strokes with visible edges and restrained bristle variation. This is an artistic extension of Gaussian splatting, not the unmodified 3DGS appearance model. Broad underlying marks establish color masses; smaller directional marks describe foliage, grass, and rock. Stable seeds keep their variation repeatable under orbit.

Brush direction follows 3D surface tangents. Color and mark placement carry the base stylization; the Cathedral also enables the optional lower-image painterly vignette. Per-primitive appearance is also explored in [Textured Gaussians](https://textured-gaussians.github.io/); this experiment does not implement that paper's trained texture optimization or ray-intersection renderer.

## Cathedral in mist

The third study (`?scene=cathedral`, keyboard **3**) draws inspiration from the supplied Monet cathedral reference. Its portals are recessed behind the facade, with depth-bearing jambs, layered archivolts, rose-window tracery, unequal bell towers, side buttresses, a nave, roof and rear apse. The massive background spire at x −33.3, z −22 reaches height 57.5 and uses 1,744 larger pale blue/ivory marks. It has grounded masonry on all four sides. Six low houses fill the marked space on the left, with complete walls, pitched roofs, chimneys and muted recesses. These volumes remain visible from the sides and rear. A seeded generator preserves the same geometry and pigments when the study is rebuilt in the same runtime.

Broad blue-violet stone masses carry shorter broken pigment marks, with warmer upper-left notes and deeper cobalt lower-right tones. The square is level throughout: broad slate/lavender underpainting, smaller stone patches, 3,600 additional short diagonal pigment marks, and 900 cream, gold and pale-blue reflected-light touches in loose clusters. The outer apron extends to radius 110 and fades toward the sky color.

The background uses 24,000 tiny round splats on a complete radius-120 sphere and 1,510 isotropic Gaussian cloud volumes in nine diffuse banks inside it. Gradient colors follow height with subtle seeded pigment variation. Cloud candidates are excluded when their full three-sigma support would overlap the authored solar disc, plus a two-degree margin. Sky and cloud marks always use the smooth Gaussian kernel, with no brush silhouette, bristles or pigment noise, including in Painted splats mode. They are excluded from the GI bake. The supplied painting is available in the reference comparison only; the renderer never samples it.

Scene-local atmosphere mixes each mark toward mist by camera distance, adds a gentle high-level veil above the towers, and softens the paint edge with increasing haze. Low distant haze shifts toward the warm horizon color. The sky bypasses this fog so its gradient survives: an encoded negative seed carries the exemption without another data texel, and the original seed is recovered in the vertex shader. Alpine defaults to zero fog and retains its earlier brush response. Switching studies preserves paint and optical controls; Cathedral limits orbit zoom-out to 90 units to keep the composed view inside its sky.

The gradient dome is a separate instance batch drawn before the sun; cloud volumes, buildings and pavement are drawn afterward and retain solar occlusion. Both batches share their packed data and material, and are partitioned from the same depth order. This costs one additional scene draw only in studies with an explicit background layer. The sun is positioned at the marked upper-left location (azimuth −49.1°, elevation 31.6°, size 3.5×).

The Cathedral startup profile retains the user's 90% tone preservation, 165% bounce, 20% shadow tint and Studio quality, plus 80% lens-dirt strength and a 65% painterly vignette. Global reset defaults remain unchanged. The authored camera is locked by default; unlocking permits orbit/pan/zoom and locking saves the resulting composition without changing the viewport aspect. `main.js` saves validated paint/sun options and per-scene camera positions to local storage, flushes on page hide/HMR, and restores them on startup. Scene switching retains current style; Reset view returns to the authored composition. Storage failures do not prevent rendering.

Implementation: `cathedral.js`, `cathedralArchitecture.js`, `cathedralEnvironment.js`, plus optional fog in `GaussianBrushRenderer.js`. `tests/cathedral.test.js` checks layer accounting, full sky coverage, round cloud volumes, flat pavement, architectural depth and seed packing. `tests/browser-cathedral.mjs` checks front/side/rear views, repeatability and view reset, fog and sky-kernel behavior, scene switching, reference loading, mobile layout, and PNG export. This is an art-directed atmosphere, not a physical participating-media simulation.

## Limits

- The references guide palette, composition, and mark character. These are authored 3D studies, not trained Gaussian reconstructions, recovered geometry, or pixel-identical reproductions of the images. A single illustration does not specify its unseen sides.
- All-sided splat placement supports unrestricted viewing, but it does not make the scene a watertight mesh or provide collision geometry.
- Center-depth ordering approximates visibility. Large intersecting splats can change ordering during orbit. [StopThePop](https://arxiv.org/abs/2402.00525) addresses this class of artifact with more precise sorting.
- Jacobian projection approximates perspective locally; very large close-up splats can distort. [3DGUT](https://research.nvidia.com/labs/toronto-ai/3DGUT/) discusses alternatives for nonlinear projections.
- Lighting and shadow colors are art-directed. This is not a physically relightable reconstruction, and the splats do not automatically reproduce mesh-renderer shadows, water, or reflections.
- This experiment authors its own splats; it does not include a training pipeline or a general `.ply`/`.splat` importer.

The experiment's implementation is in `src/splat/GaussianBrushRenderer.js` and `src/splat/math.js`.

## Pixel filtering

Every projected mark is widened by 0.3 px² so that it cannot fall between pixels. A mark much smaller than a pixel is therefore drawn as a full-strength dab about a pixel wide: distant birds, flowers and thin strokes carry more weight in the preview than in a larger export of the same view.

**Pixel filtering** (off by default, in the paint controls) weights each widened mark by the share of its footprint the real mark occupies, following the screen filter of [Mip-Splatting](https://arxiv.org/abs/2311.16493). Soft Gaussians scale their opacity. Painted and gouache kernels saturate, so there the weight scales the finished alpha instead; scaling opacity would leave a loaded dab nearly opaque. Sky washes, ground fog and glints are exempt.

Measured against a 3x supersampled render of the same paused view at 1100 x 688, the filter lowered the RMS error of the cliff from 1.26 to 0.90 in gouache and from 2.51 to 1.88 in painted splats, the meadow from 1.63 to 1.36, and two studies not in this release from 3.69 to 2.62 and from 0.86 to 0.74 (display steps out of 255). Pixels more than 12 steps from the reference roughly halved on the cliff. Dense surfaces look the same either way, because layered paint saturates; what changes is isolated small marks, which get lighter. It did not measurably reduce frame-to-frame shimmer under wind or a slow orbit (2-4%), and it costs no GPU time.

## Skipping painted-over gouache

Splats are blended back to front with no depth test, so a dense view shades far more paint than it shows: about 130 layers per pixel in a dense foliage study, of which roughly 85% lie behind paint that is already opaque. In gouache the brush kernel dominates the frame, so those hidden fragments are most of the cost.

`src/splat/SplatOcclusion.js` adds one half-resolution pass before the beauty pass. It reuses the complete splat vertex shader and, for sixteen nested sets holding the nearest N submitted splats, adds up optical depth per pixel into four half-float targets. A second tiny pass records the smallest set that leaves under 0.2% transmittance. The beauty pass reads that byte first and discards every fragment of a splat that is blended before the set, before any brush work.

The test never guesses:

- Order is the submitted blend order (`gl_InstanceID`), so it agrees with the sort even where wind or snow moves a mark away from its sorted center.
- Wind, seasons, reveals and every other vertex-stage change apply to the occluders exactly as rendered, because the capture is the same vertex program with one define.
- Each occluder contributes a lower bound of its alpha over the whole capture cell: the kernel at the farthest radius the cell reaches, with the broken edge, tooth and dry brush at their thinnest. `tests/splat-occlusion.test.js` checks the bound against the kernel on 200,000 samples and fails if the kernel terms it relies on change.
- Cel paint, oil and watercolor strokes, defocused marks and LOD fades have no cheap bound. They never occlude, but can be occluded. Reef scenes rewrite alpha per receiver after the kernel and keep every fragment.

Culled and unculled frames of a paused view differ by at most 2/255, on under 0.04% of channel values, in the scenes checked (alpine, meadow, blue forest, cathedral and a dense foliage study).

The pass costs a second vertex stage, so it is gated. It runs only in gouache, and only while the third-quartile projected stroke width of the submitted marks is at least 2.7 px; narrower marks cannot certify a half-resolution cell and the pass would cost more than it saves. On an Apple M1 at 1100 x 688, GPU time per gouache frame fell from 98 to 47 ms in a dense foliage study, 57 to 33 ms in the alpine scene, 47 to 36 ms in the meadow, 210 to 179 ms in the blue forest and 41 to 38 ms in the cathedral. Fine-mark scenes such as the cliff and the physics lab fall below the gate and are unchanged; stroke width scales with the viewport, so a scene near the gate can cross it when the window is resized. Set `occlusionCulling: false` in the style options to disable it; `stats.occlusion` reports whether it ran and the measured stroke width.

## Tabulated paint noise

Wash, brush tooth, terrain strokes and reef glow all sample one value noise. Evaluated in the shader it is four hashes per sample, several times per fragment, on every layer of paint. `src/splat/PaintNoiseMap.js` writes the noise lattice once per renderer into a 4096 x 4096 single-channel map, using the same `paintHash` source on the GPU, and `paintNoise` reads the interpolated field with one filtered fetch. Hardware bilinear filtering between texel centers with the smoothstep weight is the original `mix()`.

The pattern is the same field, not a substitute: the map holds the hash for cells -2048 to 2047, which at the gouache wash's 4.5 cells per world unit covers 455 units from the origin in each direction. Beyond that the window repeats. Lattice values are rounded to 8 bits and filter weights to 1/256. Fine pigment grain runs at 83 cells per unit and is only evaluated up close, so it stays procedural and is unchanged everywhere. The map costs 16 MB of GPU memory.

Against the procedural version on the same paused view, gouache frames differ by at most 2/255 on under 0.7% of channel values (cliff, blue forest, Furka pass, the Tsarmine aerial terrain texture, and two studies not in this release). GPU time per gouache frame on an Apple M1 at 1100 x 688 fell by 10-23% on the cliff across runs, 16% in the blue forest and 24% on the Tsarmine terrain. `tests/paint-noise-map.test.js` checks the lookup against the procedural field and bounds the quantization.

## One exponential for the stroke's taper

The gouache kernel tapers each stroke with `tanh`. Through Chrome's Metal translation on an Apple M1 that one built-in took about a fifth of a gouache frame. The kernel now calls `paintTanh(x) = 1 - 2 / (exp(2x) + 1)`, the same function with one exponential; it saturates to 1 and -1 where the exponential overflows or vanishes.

The frames are the same pixels: on the cliff, the hand study and two other studies not one byte of an 1100 x 688 frame differed, and on a fifth 2 bytes of 3 million differed by one step. GPU time per gouache frame, old over new (medians of back-to-back pairs): cliff 0.80 (31.5 to 23.2 ms, 13 pairs), hand study 0.78, and 0.84, 0.85 and 0.90 on the other three (7 pairs each).

It was found while measuring something else: a plain dab for strokes under two pixels wide, on the reasoning that they cannot show bristle, tooth or grain. A round dab made the cliff frame 0.70 times as long, but almost all of that came from skipping `tanh`. With the taper fixed, a dab that keeps the stroke's outline saves 5% and a round one 8%, and both change the picture (0.2 to 0.5 display steps RMS on the cliff, 1.1 on a dense interior study, whose thin strokes are near the camera). It was not kept. Two things learned on the way: no other single term of the kernel stands out (tooth 3%, bristle 6%, the power functions 7%, grain 2%, wash up to 10%), and a choice between two kernels written as a nested conditional expression runs both, so such a choice must be an `if` statement.

## Level of detail for small terrain marks

A terrain sheet is sampled at a fixed world spacing, so far from the camera many marks fall within a few pixels of each other, and each still costs a vertex stage, a quad and its share of brush work. A scene can opt in with `markLOD: {pixels: 2}` (the cliff does). Where a plain, wind-free environment mark projects smaller than that threshold, only a share of such marks is kept, `(size / pixels)²` and never under one in sixteen, and the kept ones are enlarged so the sheet stays covered.

Which marks stay is fixed per mark by a low-discrepancy rank, so the kept set is evenly spread and does not change from frame to frame; a mark fades over the last quarter of its range as the camera moves. The vertex shader measures the real footprint and decides; the CPU only withholds marks the shader is certain to drop, once a view has repeated, so a moving camera pays no CPU cost and a disagreement can never leave a hole. Actors, plants, water, sky, fog, glints and specially lit surfaces are never touched. Exports keep every mark, and the pass stays off with ambient occlusion, refraction and plant LOD, which redraw the list at other resolutions.

On the cliff at 1100 x 688 on an Apple M1, a steady view submits about 240,000 splats instead of 319,000. GPU time per frame fell from 40.7 to 33.9 ms in gouache and from 17.1 to 13.6 ms in painted splats (30 interleaved samples each), for about 1.6 ms more CPU. The frame changes by 1.7 display steps RMS; against a 3x supersampled render its error rises from 1.26 to 2.2. Distant texture is slightly softer; the crow, grass and near ground are unchanged. `markLOD: false` in the style options turns it off, and `stats.markLOD` reports the withheld count.

### Merged stand-ins for the authored view

A kept mark carries one member's color and shape, enlarged. With `clusterHeight` in the scene's `markLOD` (the cliff uses 688, its draft preview height), `MarkClusters.js` also groups small neighbors when the scene is built and adds one stand-in mark per group: the area-weighted center and color of its members, a shape fitted to the whole group, and their total painted area. Groups are formed in cells sized for the scene's own camera, on two grids half a cell apart, within one material, and only from marks well under the threshold there.

For each view the renderer draws a group's stand-in or its members, never both. The stand-in is used while it projects under 1.15 thresholds and released above 1.45, so the choice does not flicker; zooming in hands back to the members, and the remaining small marks still go through the drop-and-enlarge pass above. A group whose member has been moved by physics shows its members. Stand-ins are hidden whenever the level of detail is off, exports included.

On the cliff this adds 23,827 stand-ins for 82,688 members (about 24,000 more splats in memory and 0.3 s of scene build). At 1139 x 712 on an Apple M1 the authored view shows 21,142 of them. Against the full render the frame changes by 1.32 display steps RMS, where dropping alone changes it by 1.61; GPU time is the same within noise (40.6 against 41.8 ms, 45.3 ms with every mark, 8 interleaved samples). It costs about 2.5 ms of CPU when the view changes and nothing while it holds. So it buys fidelity, not speed, and only near the authored view: at 1600 x 1000 about half the stand-ins are in use. `stats.markClusters` reports groups and how many show their stand-in.

## Per-mark vertex work done once

Each mark is a quad, so its vertex shader runs four times, and almost all of that work gives the same result at every corner. On the cliff, whose shader carries seasons, cloud light and snow, the vertex stage took 10 to 13 ms of a 41 ms gouache frame at 1100 x 688 on an Apple M1, while a shader that only fetched data took 2.5 ms. Leaving the shader early for three corners out of four saved nothing measurable, so the work is moved instead (`SplatPrepass.js`):

1. A pre-pass runs the splat shader's own `main` once per submitted mark, as plain points with rasterization off, and records with transform feedback everything the fragment shader is handed, plus the clip position and the 2 x 2 screen transform.
2. The quads are drawn by a thin vertex shader that reads those values as per-instance attributes and only places the corner.

Both shaders are derived from the text of the ordinary vertex shader, so there is still one source for every scene variant and style. The derivation checks that the quad corner enters only through the statements it knows; where it cannot show that (the refracted water of the blue forest) it declines and the ordinary shader draws the scene. The fragment shader, blending, draw order and uniforms are unchanged. With the split forced on, all 35 built-in scenes matched the ordinary path to within one display step in both painted splats and gouache, as did a moved mid-season view of the cliff and a 2x export.

It is a scene opt-in (`vertexPrepass: true` in the scene entry), because recording costs about as much per mark as a light shader saves: the cliff gains, while the terrain studies and the meadow measured slightly slower with it. On the cliff a steady frame takes a median 0.72 times the GPU time in gouache and 0.73 in painted splats (11 interleaved pairs each; single runs drift between 0.4 and 1.35). While orbiting, the frame interval falls from 65 to 56 ms in gouache and from 38 to 33 ms in painted splats. `vertexPrepass: false` in the style options turns it off; `stats.prepass` reports whether it is in use and why not.

Two other forms of the pre-pass were built and measured first, and both cost several times what the thin shader saves in this browser's Metal translation: one point per mark rasterized into float color targets (about 43 ms), and transform feedback over instanced points (about 64 ms). Plain points, one vertex per mark, cost about 7 ms. three.js has no transform feedback, so the module wraps two calls of the WebGL context (linking, and the pre-pass draw) and mirrors the index list into a per-vertex attribute.

## Main-thread work while the camera moves

A frame is prepared on the main thread only after the GPU has finished the previous one, so CPU time adds to the frame interval. Orbiting the cliff cost 25 ms of it per frame. The depth sort was 3.9 ms of that; the rest was mostly submission culling (6.9 ms), the courier and physics step (6.6 ms) and choosing between stand-ins and members (2.9 ms). Two of these are now cheaper, with identical results:

- Culling a changing view tested each mark while walking the depth order, which reads centers, sizes and wind out of memory order. It now tests all marks in memory order into a byte mask and the depth-ordered walk only looks the byte up: 6.9 to 4.1 ms.
- Stand-in selection read every member's position to see whether physics had moved it. Physics names the marks it has ever moved, so a moving camera rechecks only their groups, and every member is read once when the view repeats: 2.9 to 1.8 ms.

That brought the cliff's orbit to about 18 to 20 ms of CPU per frame, of which ordering, culling and stand-in selection were still about 10.

### Ordering and culling on a worker while the view moves

Those three steps now run on a worker while the view is being dragged, zoomed or auto-orbited (`SplatSortJob.js`, `SplatSortWorker.js`, `SplatSortClient.js`). The worker runs the same code as the main thread: the radix depth order of every mark, the frustum test, and the choice between stand-ins and members. For each job the main thread copies the mark centers into a buffer that travels to the worker and back together with the lists it fills, so nothing is allocated per job and the worker always orders the centers as they are, whatever moved them. A job takes about 13 ms on the cliff, so the list drawn is about one frame behind the view.

Two things keep that lag from showing. The worker's frustum is 20% wider on each side, so marks about to swing into view are already listed. And the worker only serves a view in motion: an answer for a view that has moved on asks for the current one at once, while an answer for the current view hands back to the main thread, which builds the exact list on the next frame as before. A view at rest, an export, and every camera change that does not come from the pointer or auto-orbit (the API, scripts, tests) never use the worker.

It applies to scenes of 60,000 marks or more that draw one list from one camera; scenes with mirrors, reflecting or refracting water, or plant level of detail keep the main-thread path. Checked on eleven such scenes: after an orbit, the settled list and image are identical to a main-thread build of the same view. During an orbit of the cliff, frames drawn from the worker's list differed from the exact frame of the same view by 0.2 to 0.5 display steps RMS, with 0.1 to 0.2% of pixels off by more than one step. Marks closer to the camera than their own size can enter one frame late; the wider frustum does not cover that case.

On the cliff with the courier and its physics running, the orbit frame interval falls from about 59 to 32 ms in painted splats and from 66 to 82 ms down to 54 to 60 ms in gouache; main-thread time per frame falls from about 40 to 17 to 22 ms, most of the remainder being the courier and physics step. `sortWorker: false` in the style options turns it off; `stats.sortWorker` says whether the list on screen came from the worker.

### A view at rest with a moving actor

With the camera still and the cliff's crow idling, each frame still cost about 15 ms on the main thread, and physics was not the reason (0.5 ms). Two things were.

The draw list was rebuilt every frame, because the crow's 20,560 marks change depth as it breathes: every mark merged in depth order, walked for visibility, then walked again for stand-ins and level of detail, 6 to 10 ms in all. At an unchanged view none of that changes for the environment. `SteadyList.js` keeps the environment's part of the finished list with its depth keys, and each frame only sorts the actor's marks and merges them in: about 1 ms. It gives the list the full rebuild gives (same Float32 keys, same tie rule), and is used only once the same view has been built three times running, so culling, the stand-in choice and the level-of-detail verdicts have settled. A changed view or style, a rebuilt depth cache, a cleared visibility key, moving environment marks, or a scene that draws a second list (mirrors, water, plant level of detail) all fall back to the full rebuild. On the cliff, the dog field, the bee and butterfly gardens, the courier stage and the physics lab, every frame of a few seconds of animation matched a full rebuild of the same frame.

The crow's own update was the other part: about 5 to 6 ms to move 14,000 marks. Each triangle's surface frame was built with a dozen small vector calls and a temporary array, read through several objects per mark; the feather highlight loop destructured a pair and spread an array into `Math.hypot` for 5,668 marks. The frames are now computed in one pass over flat arrays with the same arithmetic in the same order, and the mark loop reads those arrays. The results are the same doubles: a test compares them with the vector-call version bit for bit, stretched and unstretched, including collapsed triangles. The update takes about 3.7 ms, of which skinning 37,606 vertices is 1.3.

Together, the cliff at rest in gouache went from about 15 to about 5.4 ms of main-thread time per frame; with only the list rebuild switched back on it is 10.8 ms, and the frame interval 43.5 ms against 38.3.

## Paper scale

The gouache wash (4.5 cells per world unit) and grain (83 per unit), and the watercolor grain, are fields over the surface, shared by neighboring marks. Their size is fixed in world units while scenes differ widely in mark size: a painted dab spans about 7 wash cells in the alpine study, 2 to 5 in most landscapes, and under 1 in `hand-study` and `botanical-splat`.

`paperScale` sizes these fields: 1 is as authored, 0.5 halves the wash and grain. It is a style option (the "Paper scale" slider in the gouache settings) and a scene entry may carry its own `paperScale`, which multiplies it. Every scene is unchanged at the default. `stats.paper` reports the scene's median dab, the wash cells it spans, and the scale that would give it as many cells as the broad-mark studies (about 7); the studio shows that figure under the slider. It is a hint, not a recommendation: at the matched value the hand study's grain becomes too fine to see, so the choice is made by eye per scene.

## Sharper stills and larger exports

The preview draws fewer pixels than a high-density display shows (at most 1100 or 1600 wide), and an export was capped at 1920 x 1200 so that one frame never overloads the GPU. Both limits are lifted the same way, in `src/splat/StillAccumulator.js`: the view is drawn several times, each shifted by a fraction of a pixel, and the frames are interleaved. For a factor of two, four frames shifted by a quarter pixel fill the four pixels of every 2 x 2 block.

**At rest.** Once nothing is animating, the renderer draws the four phases and shows the interleaved image at twice the preview resolution; any change returns to ordinary frames at the preview size. It only runs when the canvas is displayed with more device pixels than it draws. On the cliff at 1100 x 688 the four frames took 0.43 s, and the still carried 82% more fine detail than the upscaled preview (87% of a native 2x render), while averaging back to the preview within 0.5 display steps RMS. `stillRefine: false` in the style options turns it off.

**Export.** `exportPNG({scale})` accepts 1, 2 or 4, chosen beside the Export button: up to 1920 x 1200, 3840 x 2400 or 7680 x 4800. A 2x export of the cliff took 2.1 s. A 4x export is sixteen ordinary frames, never one enormous one.

Every phase is a complete frame, so brush sizes, paint texture and lens effects are those of the preview, sampled more finely, and effects that span the image have no seams (which a tiled render would). The trade is that a native render at the larger size would draw marks relatively thinner; this keeps the look composed on screen. Plain averaging of shifted frames was tried first and dropped: against a 3x supersampled reference it moved the error only from 1.37 to 1.24, because every mark is already at least a pixel wide.

## Baked diffuse color bleeding

The indirect-light experiment uses the existing splat field as its source geometry. Each splat is tagged as grass, stone, wood, foliage, or cloud. The third covariance axis supplies its surface normal. Clouds are excluded from the local bounce volume.

Oriented splat footprints are deposited into a bounded voxel field. Voxel colors are averaged in linear RGB, so overlapping brush marks do not act as additive light sources. A deterministic cosine-weighted hemisphere gather at each receiving splat traces to nearby occupied voxels; first-hit visibility blocks transport from hidden surfaces. The resulting mean incoming radiance approximates diffuse irradiance divided by pi. The field is baked once per scene and cached. Camera motion and paint/Gaussian mode changes reuse it.

Incoming RGB is stored in the previously unused `w` components of the three axis texels. This adds no draw call or extra scene texture. A cached color-response stage combines it with an approximate diffuse reflectance derived from the authored pigment, in linear RGB. It updates only pigment RGB in the packed texture when controls change; orbit does not rerun it. **Color bleed** disables the contribution completely; **Bounce strength** adjusts it without rebaking. Turning off both Color bleed and Tinted shadows restores the original authored pigment exactly.

This is an artistic one-bounce approximation. The starting colors already contain authored lighting, so they are proxies for radiance and reflectance, not calibrated physical material properties. Finite voxel size, a limited gather distance, and a small fixed sample count can soften occlusion and miss thin geometry. The bake does not update for animated geometry or live material edits.

### Relationship to Three.js

The installed dependency is Three.js 0.187.0. [LightMapper](https://threejs.org/docs/pages/LightMapper.html) bakes an irradiance function into a mesh UV atlas using WebGPU. [VXGIVolume](https://threejs.org/docs/pages/VXGIVolume.html) supplies voxel GI using mesh triangles and WebGPU compute; [vxgiIrradiance](https://threejs.org/docs/pages/global.html#vxgiIrradiance) queries it at a world position and normal. Our custom WebGL splat shader has neither mesh surface triangles nor a light-map UV atlas, so the experiment adapts the world-space transport idea instead of importing those modules directly.

Three's `lensDirt` is a postprocessing camera effect based on blurred screen luminance and a dirt texture. Its separate painterly adaptation is described below; the world-space GI bake remains responsible for grass color transferred onto nearby objects.


## Preserving painted tones and tinting shadows

**Tone preservation** defaults to 80% (80% of the value-preserving response, 20% additive). Indirect illumination is separated into hue change and brightness lift. At 100% preservation, a rational shoulder limits additional luminance to 10% of the original linear luminance plus .002, with a separate limit near white. This keeps grass-to-grass bounce from turning into neon exposure while still letting neutral rocks pick up grass color. Chromaticity is compressed toward the same-luminance neutral axis when necessary to stay in the display gamut; channels are not independently clipped. Lowering preservation blends toward the earlier additive response.

**Tinted shadows** uses five deterministic sun-cone visibility samples through the existing voxel field, combined with the normal's orientation to the authored sun. Both cast shadows and unlit sides can receive the selected tint. The default is a muted blue (`#66759b`) at 35%. Tint preserves luminance rather than adding brightness or imposing another layer of dark shading. White is a neutral tint; turning the feature off leaves indirect light independently available.

The directional mask is static and uses the same bounded voxel volume. Its bias avoids self-shadow acne but omits sub-voxel contact shadows. Five cone rays and a 20-world-unit trace distance approximate soft shadows; this is not a high-resolution dynamic shadow-map system.

Implementation: `src/splat/colorResponse.js` (response and gamut handling), `src/splat/irradiance.js` (visibility and incoming radiance), and `src/splat/GaussianBrushRenderer.js` (cached texture updates).


### Protecting complementary bounce colors

Before applying shadow tint, the response compares luminance-free bounce and tint colors using a luminance-weighted chroma cosine. Opposing hues reduce the effective tint locally. The attenuation grows smoothly with visible bounce energy and chroma, capped at 65%; it leaves some shadow tint in place. Gray light, gray tint, zero bounce, and matching hues retain their original behavior. This protects green reflected light from an opposing purple/blue shadow without changing the selected tint globally or changing luminance.

## Painterly lens dirt

The WebGL implementation adapts the installed Three r187 [`lensDirt`](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/tsl/display/lensDirt.js) principle: blurred bright light multiplied by a lens texture and strength. It uses a deterministic 512² grayscale texture of rounded brush dabs, subtle bristle gaps, broad faint smears, and longer strokes. Marks crossing the texture boundary wrap seamlessly. No photographic dirt texture or reference artwork enters this pass.

Scene RGB is captured at the current render resolution. Extraction decodes the existing display RGB to linear light and selects highlights with a smooth luminance gate from .50 to .85. A separable Gaussian blur runs at quarter resolution, capped at 400 pixels on either axis. The resulting light reveals the mask. The linear composite `base + (1 - base) × clamp(light × mask × strength × 2.4, 0, 1)` gives the addition a gentle shoulder near white. The scene itself is never blurred. This is a restrained optical approximation, not an HDR physical lens simulation or extra indirect illumination.

The lens layer is intentionally screen-attached: camera movement changes which bright surfaces illuminate it, while each dirt mark keeps its position on the lens. Centered, aspect-correct UVs retain mark proportions in landscape, portrait, and PNG exports. **Strength** defaults to 30%; **Mark size** scales the texture. Tone preservation remains 80%, and complementary-shadow attenuation is unchanged.

The custom scene shader already writes display RGB, so its RGBA8 scene target uses `NoColorSpace`. Three normally changes clear-color conversion when rendering offscreen; this pass explicitly matches the original canvas clear bytes and restores the renderer state afterward. Highlight extraction and composition alone convert to linear RGB and back. The small light targets use RGBA16F when supported to retain faint solar halo values; RGBA8 is a functional fallback with less precision. With both optical effects and the painterly vignette disabled or at zero strength, the renderer bypasses all postprocessing. Lens dirt adds four fullscreen draws (extraction, two blur passes, composite) and three bounded targets. Flare without bloom needs only the scene target and composite draw; flare bloom adds three draws and two small targets. Viewport and PNG export use the same path. Rendering remains on demand with one GPU frame in flight; targets, mask, and materials are disposed with the renderer.

Implementation: `src/splat/LensDirtPass.js` and `src/splat/lensDirtMask.js`. Unit tests cover mask determinism, coverage, seamless wrapping, allocation limits, and aspect mapping. `tests/browser-lens-dirt.mjs` checks a forced offscreen zero-strength copy against the direct frame, live strength changes, off/zero bypass, stable frames, orbit, Gaussian mode, portrait sizing, export bounds, both studies, and UI reset/disabled states.

## A painted sun for optical testing

`src/splat/PainterlySun.js` draws a distant emissive disc behind the splat field. At size 1×, its angular diameter is .533°, matching the Sun's approximate apparent size ([NASA solar environment course](https://ntrs.nasa.gov/api/citations/20220013453/downloads/TFAWS-2022-Short%20Course-Environments_Vector_Shading_MERGED.pptx.pdf)). Radius is `distance × tan(diameter / 2)`. The disc follows camera translation at a fixed world direction, so it has no scene-scale parallax. Azimuth 0° faces −Z, positive angles turn toward +X, and elevation is measured above the horizon. Orbit changes its screen position naturally.

The sun now consists of exactly seven isotropic Gaussian kernels: one center and six tightly overlapping kernels around it. Optical-density addition joins them into a circular warm-white disc with soft cream falloff. There are no bristles, angular edge noise, directional strokes, or decorative halo shapes on the sun. The 50%-coverage contour defines the nominal angular diameter. The 1–8× size control is an explicit artistic enlargement. Brightness is an optical multiplier rather than a calibrated solar radiance or physical atmospheric model.

No light object is created. Sun controls do not update authored pigment, irradiance, the shadow bake, or scene exposure. Instead, the offscreen target's alpha starts at 1; the sun's separate alpha blending reduces it by the disc coverage. Normal foreground source-over blending raises alpha toward 1 again. Therefore `1 − finalAlpha` is the visible solar coverage after every overlapping splat, including partially transparent clouds and leaves. This channel is blurred alongside the ordinary highlights, then multiplied by sun brightness and a warm light color in the lens composite. Brightness is applied after blur so the disc's clipped display RGB cannot limit the optical driver. The final display alpha is opaque; direct rendering restores normal alpha blending.

The visible sun costs one background draw. Sun off removes that draw. Tests check angular projection, translation invariance, resource reuse, circularity, inverse-alpha composition, and actual GPU visibility under fully opaque/half-transparent blockers and with the sun behind the camera. Browser validation also verifies that changing the sun leaves the packed splat pigments byte-for-byte unchanged.

## Splat lens flare adapted from Lego homeworld

`src/splat/lensFlare.js` adapts the analytic sun-flare portion of `Lego homeworld/client/js/render/post.js`; that project's `lens.js` implements a different telescope effect. The six source-to-center reflection positions, height-relative radii, warm/cool tint interpolation, and 24-tap visibility pattern come from its sun model. [Attribution and license](third-party-notices.md) are included. The separate multi-pass HDR flare used for ships, engines, and bolts is not imported, nor is Lego's exposure or tone grading.

Each aperture ghost is a sparse cluster of three near-round Gaussian splats with close, distinct centers and slight pigment variation. A bounded optical union and normalized pigment colors retain the three lobes without collapsing their overlap into a white orb. A broad Gaussian falloff gives each mark a very soft edge. There are no bristles or edge noise. The separated splats stay attached to each moving ghost, and pixel-aware minimum widths keep small marks readable.

Three soft optical highlights around the source replace the dense dirt-pattern glare; the independently controlled lens-dirt effect retains its original mask. The sun geometry itself remains seven round splats. Aperture polygons, hard rings, diffraction spokes, and temporal noise are omitted. Reflection positions still follow `sunUV + (0.5 - sunUV) × offset`, and the ghost distance metric uses viewport-height units for consistent proportions. **Strength** defaults to 65%; **Ghost size** defaults to 1×.

**Bloom** defaults to 60% and ranges from 0–150%. A separate emission pass renders only the visible flare into a half-resolution HDR target, capped at 512 pixels on either axis. A smooth brightness gate selects the bright cores, then horizontal and vertical Gaussian passes spread their light. The original soft splats and this blurred emission are combined in linear RGB. No grass, foliage, stone, or cloud pigments enter the flare-bloom pass. Sun visibility is applied before blur, so full occlusion removes the halo as well as the direct reflections. Setting Bloom to zero skips all three bloom draws. Its two targets are allocated lazily, resized for the viewport/export, and disposed with the renderer.

The final-pass vertex shader samples visible solar coverage from `1 − sceneAlpha` over the projected solar disc; the tangent projection includes perspective foreshortening. This adapts Lego's depth sampling to transparent, depth-disabled splats. Offscreen taps count as blocked, and the entire effect disappears when the sun is behind the camera or switched off. A partially covered sun attenuates all reflected ghosts together. Unlike the source game, this renderer has no offscreen geometry visibility test, so the flare fades away as the solar disc leaves the frame.

Flare and dirt share one linear-light composite with a bounded shoulder toward white. Flare can run with dirt off, avoiding dirt's three extraction/blur draws. Unsupported Gaussian regions are rejected before evaluating exponentials. The effect changes only camera output; authored pigments, GI, the tint response, and its 80% tone-preservation setting are unchanged. Unit tests check projection against numerical differentiation and source-model ghost placement. Browser checks cover independent toggles, zero-strength identity, stable frames, resized ghosts, complete and partial occlusion, behind-camera rejection, mobile controls, and PNG export. Bloom checks additionally verify target bounds, its zero-cost bypass, positive light contribution, and reset/disabled controls.

## Petzval-inspired painterly vignette

The Cathedral combines additional flat world-space pavement pigment with an optional projected paint finish. Its visual reference is the clearer center and swirling periphery described in [Lomography’s explanation of the Petzval effect](https://www.lomography.com/school/what-is-the-petzval-effect-fa-redda2e5). `PainterlyVignettePass.js` creates 54,000 deterministic anchors: 36,000 on an all-sided world-space shell and 18,000 sampled from the scene’s splat centers and footprints. Without scene data it uses the shell alone. `LensDirtPass` supplies both the current camera and the scene splat array. Camera or viewport changes update projection uniforms without regenerating the field; changing the scene replaces it. Returning to the same camera pose and settings produces the same marks.

Mark centers are reprojected from 3D, while their footprint size, orientation and softly bowed shape are evaluated in image space. Five nearby samples from the current rendered frame supply each mark’s pigment, with restrained value variation and blue-violet or warm notes. An aspect-correct circular field keeps the center clear and strengthens the finish toward the periphery, with a modest lower-image bias. **Strength** controls pigment coverage and **Spread** controls how far the edge treatment reaches inward; both default to 65%. **Swirl** (`vignetteSwirl`, default 75%) aligns marks toward the field’s tangent, stretches them along it, narrows them across it, and bends their soft footprint. Broad, medium and fine marks share this treatment.

The finish costs two draws: an exact source copy followed by one instanced brush batch into a lazy full-resolution RGBA8 target. It uses raw display RGB and preserves every source alpha byte using separate alpha blending, so the solar visibility mask remains exact. Optical extraction and flare bloom sample the original scene; the final light composite samples the painted result. Zero strength or a disabled vignette bypasses its allocation and draws. Height-relative sizing keeps marks proportioned in viewport and PNG exports.

This is an artistic finish, not a ray-traced Petzval lens or physical depth-of-field simulation. It has no depth buffer, focus plane or circle-of-confusion calculation. A projected anchor can lie behind the visible surface at its image location, and its pigment comes from the currently visible pixels rather than that anchor’s material. Thus the field gives stable camera-driven motion without guaranteeing surface-depth attachment or correct optical occlusion. The separate pavement strokes remain actual 3D scene geometry.

`tests/painterly-vignette.test.js` checks deterministic fields, anchor persistence across camera/viewport changes, replacement and disposal on scene changes, alpha blend configuration, bypass and renderer-state restoration. `tests/browser-vignette.mjs` checks GPU alpha preservation, zero/off identity, repeatability, center protection, camera-responsive marks, unchanged world data, added draw count and export.
