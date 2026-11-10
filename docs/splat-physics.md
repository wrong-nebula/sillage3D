# Cliff splat physics

Open `/physics.html` for the dedicated physics lab, or
`/splat.html?scene=physics-lab` in the studio. Its 60 × 56 m ground is a fresh
1,025² LibreTerrain blur/hydraulic/thermal build: a protected, nearly level
center surrounded by smooth rolling dunes. Terracing was removed. The editable
foundation, native EXRs and evaluated flow, wear, deposition, slope, curvature
and talus masks produce sand, dry silt and sparse exposed sandstone materials.
An unshaded 1,025² albedo map is baked from those native masks. Surface splats
use .25m spacing in the working basin and .5m at the perimeter; higher data
resolution does not add per-splat physics work.
It includes 48 authored cliff-family rocks, free orbit/pan/zoom, pause and reset.
The courier starts ready to use. The lab uses about 64,000 splats including
actors, instead of rendering the full cliff landscape.
Lab rocks now use compound collision lobes, selective swept collision detection,
and persistent local bond damage. Repeated impacts crack and chip a rock before
it fully shatters. The status line reports damaged rocks and detached pieces.

The original scene remains at `/cliff.html`, or `/splat.html?scene=cliff-talus`.
Its existing boulders are also destructible. Its controls unlock after the
courier's arrival. Both panels support pointer, touch and keyboard.

| Control | Effect |
| --- | --- |
| B / Drop rock | Drop a breakable rock ahead of the courier |
| X / Break nearby rock | Fracture the nearest intact authored or dropped rock within 14 units |
| H / Toggle fire | Start a fuel-limited fire ahead of the courier, or extinguish it |
| G / Gust | Apply three seconds of stronger wind to particles, debris and meadow grass |
| N / Toggle snow | Select midwinter or summer; the standalone view holds the selected season |
| L / Deposit pile ahead | Add the selected snow, sand or mud in the lab |
| Clear deposits | Clear ground, rock, cloth and falling snow; keep the LibreTerrain base |
| E / Explosion | Blast ahead of the courier |
| Alt-click | Blast the pointed rock or ground location |
| Left-drag a rock, then release | Grab, drag and throw; scroll while holding to change depth |
| Escape | Release the held rock without a throw boost |
| Shift-drag / drag empty ground | Orbit the camera; right-drag pans |
| Object motion blur | Adjust velocity-based splat stretching from 0 to 2 |
| V / View flexible rigs | Focus the camera on ropes, cloth and rooted plants |
| R / Reset flexible rigs | Restore flexible poses, intact links and clean materials |
| P / View water | Fit the larger pond and shoreline to the current viewport |
| U / Drop rock in water | Drop a pooled rock above the pond |
| I / Inspect physics | Toggle inspection in the standalone lab |
| . / Single step | While inspecting, pause and advance one 120 Hz tick |
| [ / ] | Select the previous/next enabled rigid body while inspecting |
| WASD, Shift, Space | Existing walk, run, jump and flight controls |

## Inspection

The standalone `/physics.html` has a non-modal inspector with labelled native
controls and keyboard navigation. A click selects a rigid body or a barycentric
point on cloth, rope or plants; dragging orbits the camera. The native selection
list also offers each flexible rig, so inspecting soft materials has a keyboard
path. Inspection clicks
do not grab or mobilize bodies. Closing with **I**, **Escape** or **Close** restores
normal grabbing. The action drawer folds while inspecting and restores on close.

Wireframes show the latest **solver pose**, which can lead interpolated splats
by a tick. Blue marks fixed proxies, amber awake bodies, green sleeping bodies,
pink active CCD, red contacts and cyan velocity vectors. Velocity arrows use a
0.15-second horizon capped at 4 metres. Selected compound cores also show live
fracture bonds. Optional flexible overlays show intact XPBD distance constraints.
The readout exposes world position/orientation, linear/angular velocity, mass, shape count,
friction, restitution, heat, wetness, snow, CCD and progressive damage. A
collapsed subsystem section exposes particle recycling, persistent paint
occupancy, water-cell counts and intact flexible links.

Pause and single stepping use the same simulation clock as water, particles,
character motion and flexible rigs. Each step consumes one fixed tick; ordinary
paused camera/selection changes consume none. Contact recording happens before
fracture changes ownership and includes swept terrain touches absent from the
final discrete manifold. JSON exports contain the current selection, solver
counters, contact records and impact history, rather than a full replay state.

`PhysicsInspection.js` is the read-only diagnostic model; `PhysicsInspector.js`
provides UI and a single optional `LineSegments` draw. Its position/color buffers
allocate only on first use and reuse 1.5 MiB, capped at 32,768 segments. It keeps
256 contact records and 16 impact events; per-tick contact omissions and line
caps are visible. Recording and drawing stop while inspection is off. No new
Gaussian slots are allocated.

## Pond and persistent traces

The pond is a roughly 15 × 12 m fixture beyond the outer rock rows, centered at
(-13, 18). Its graded bed and bank blend into the LibreTerrain surface, with the
same height function used for splats, rigid contacts and character navigation.
Overlapping clasts are moved back into the rock field, retaining all 48 authored
rock identities. The main court and flexible rigs remain outside the pond.

`WaterLab.js` keeps a 48² damped surface-wave grid and one 36 KiB height/normal/
wetness texture. Sphere-cap displaced volumes drive approximate buoyancy and
angular torque; submerged objects receive drag. The low-density wooden log
floats while stone sinks. Walking, rock entry and blasts disturb the surface;
splashes share the existing particle pool. Wet sand/rock shading, slowly drying
body wetness and soaked flexible-node mass/drag use the same fixed clock.
Submerged fire and embers are quenched. This is shallow surface motion, without
volumetric flow, spilling or freezing.

`SandTraces.js` retains detailed recent impressions, while `TerrainTraceAtlas.js`
accumulates their longer-lived pigment/relief on the ground. A 1,024² RGBA texture
stores sand and snow hollows/rims in 4 MiB without new Gaussian slots or passes.
Thousands of later contacts cannot evict marks elsewhere. Row-based aging holds
fresh paint before gradually fading it over minutes, with bounded wind infill;
uploads are limited to 10 Hz. Snow footsteps also archive into this cache.

## Physical ground accumulation

The standalone lab enables `GroundMaterials.js`: 241 × 225 surface columns
over the 60 × 56 m terrain, spaced .25 m apart. Snowfall is accelerated to
.012 loose-equivalent metres/second at full intensity. **N** changes weather;
existing deposits persist and thaw gradually in warm conditions. The material
selector and **L** add a local pile; **Clear deposits** resets these layers.

Each column stores snow/sand/mud amounts, snow/sand packing and moisture.
Snow depth is `amount / (1 + 1.8 * packing)`; sand uses `1 + .25 * packing`.
Amounts and reported volumes refer to loose material before compaction, not
calibrated mass. Foot plants and one terrain touch per rigid body compact the
layers; yielding mud moves sideways. Conservative neighbor fluxes settle steep
slopes. Blasts move loose material outward and strong gusts transport exposed,
unpacked snow/sand along the sampled wind. Volume counters account separately
for deposition, melt, drainage/clearing and rejected deposit attempts.

The summed depth is sampled bilinearly by rigid contacts, selective CCD,
particles, flexible collisions, character ground following and foot IK. Ground
friction and restitution vary with material/packing/moisture. Terrain revisions
invalidate cached contact normals; changing support heights wakes sleeping
bodies. Actual local snow depth selects footprint and rolling-track appearance,
so switching to summer does not immediately reveal sand beneath existing snow.
New snowfall dilutes packing and gradually fills compressed trails. Fire melts
nearby snow into moisture, and the pond excludes ground accumulation. A coarse
rock projection shelters precipitation at the ground, while the attached rock caps below receive the intercepted snow.

Eight rows (1,928 columns) receive weather/heat/relaxation work per fixed tick;
contact compression is capped at 192 bodies and local stencils at 4,096 cells.
The combined loose amount is capped at 1.2 m per column. Two textures hold
height/gradient/snow-depth and pigment/wetness/packing (1,084,500 bytes total).
They are prepared at most 10 Hz during simulation; explicit deposits, clearing
and blasts refresh immediately, including while paused. Two additional ground
vertex samples deform and tint existing terrain Gaussians, without additional
splats or render passes. Inspection exports field volumes and work budgets.

`scripts/profile-ground-materials.mjs` measures a 96-awake-rock / 768-slot
particle stress case. The latest local Node run adds .696 ms median / 1.350 ms
p95 per 60 Hz frame including CPU texture preparation; combined rigid,
particle and material simulation is 4.137 / 4.786 ms. GPU upload/rendering,
Gaussian packing and browser overhead are excluded. Evidence and browser
captures are in `output/ground-materials/`.

This is a surface-column model: it has no caves, overhangs, volumetric grains,
snow bridges or multi-layer avalanches. Fire melting/moisture and mud yielding
are bounded game approximations, not a calibrated thermodynamic soil model.
The original cliff retains its existing seasonal terrain/footprint treatment.

### Attached rock and cloth snow

`SurfaceSnow.js` stores six local-facing patches per rigid rock and one depth
per cloth triangle (396 for the lab banner). Upward rock faces catch snowfall;
the cloth catches a small amount on vertical fibres and deeper deposits on
upward folds. Stores persist after changing weather. Loose-volume stores use
64-bit CPU values so prolonged saturation and repeated shedding do not create
volume through quantization. Rock patches are capped at .24 m and cloth at
.18 m, with steeper cloth surfaces shedding excess. Geometry-area changes
conserve volume and release thickness that cannot be retained.

Rock snow adds effective mass/inertia without changing structural fracture
weights. Cloth node loads use area-weighted snow depth and increase effective
mass and collision thickness. Linear/angular motion, acceleration, impacts,
folding and nearby blasts release stores. Fracture releases the parent layer
once before binding fresh fragments; pool recycling starts the new rock clean.
Fire/water melt snow. R resets the rigs and releases their snow; Clear deposits
clears every store, including falling clumps and sub-clump carry.

Existing rock Gaussians use a small nearest-filtered body texture to read six
local depths plus the interpolated orientation. They displace/tint their normal
surfaces, including authored rocks that have never moved. Cloth Gaussians
thicken and whiten from their triangle depth, with a dedicated seasonal tag
that bypasses the old instant winter coating. The lab adds no Gaussian slots
or render passes. These remain coarse surface layers on the existing collision
proxies, without separately solved snow-grain contacts or volumetric bridges.

Released snow uses the existing 768-slot particle pool, with up to 24 emitted
clumps per fixed tick (48 for an explicit blast). Tiny dribbles coalesce in a
bounded scalar/vector carry. Clumps inherit surface velocity, fall under
gravity, interact with wind/proxies, and deposit their carried volume into the
physical ground. Saturated-pool recycling retires carried material explicitly;
heat/water melt and field-cap/out-of-bounds drainage have separate counters.
Ground transfers defer GPU preparation to the usual 10 Hz batch. Inspection
exports surface, cloth, airborne, pending, settled and melted volumes.

`scripts/profile-surface-snow.mjs` profiles 96 awake compound rocks, 24 fixed
rocks, all 358 flexible nodes / 396 cloth triangles and 768 particle slots with
ground accumulation, wind and repeated blasts. The latest local Node run used
.227 ms median / .346 ms p95 for surface stepping plus .004 / .015 ms for its
texture preparation per 60 Hz frame. Full rigid/flexible/particle/material CPU
simulation measured 5.028 / 6.562 ms. Surface-only timing excludes the existing
particle/ground-transfer solvers; the full timing includes them. Both exclude
GPU upload/rendering, Gaussian packing, skinning and browser overhead. Evidence
is under `output/surface-snow/`; run `tests/browser-surface-snow.mjs` with the
local Playwright module path to repeat real mouse/blast/landing checks.

## Architecture

`physics/SplatPhysicsWorld.js` is a standalone CPU solver with a Three.js vector
and quaternion interface. Bodies are dynamic, fixed, or driven by kinematic
targets. Sphere or compound-lobe proxies represent rigid groups of Gaussians.
The collision solver never visits the Gaussians themselves. Proxy contacts and sampled
heightfield normals produce sequential impulses, restitution, tangential
friction and angular response. Stationary supported bodies sleep and wake on
impact or explicit impulses. Kinematic movement is distributed over the fixed
ticks consumed by the current frame.

The simulation runs at 120 Hz, consumes at most 12 ticks per frame, and drops
excess elapsed time after stalls. Motion-based subdivision permits up to 16
substeps per tick. Separate numeric spatial hashes index moving and stationary
bodies. The stationary index is rebuilt only when membership, support state or
fixed poses change. Hash aliases are checked against exact cell coordinates.
Each index uses twice its largest proxy radius as its cell width. Broadphase
queries start from moving bodies rather than all the stationary landscape rocks.
Airborne bodies skip terrain-normal evaluation; tiny horizontal motions reuse
the last local tangent plane. Contact objects and hash buckets are reused.
`snapshot()` reports candidate pairs, contacts, sleeping/active bodies, dropped
time and motion-subdivision budget hits. Candidate/contact counts describe the
latest tick, not an aggregate over the whole frame.

Contact constraints warm-start coherent support impulses and clamp accumulated
normal and tangent impulses. A fixed restitution target prevents repeated
bounces across solver iterations. Position correction stays separate from
kinetic velocity. Gravity, linear damping and wind response use the closed-form
solution of `v' = gravity + response*wind - (drag+response)*v`, with `expm1` and
a small-step series to avoid cancellation. Quaternion rotations remain a
normalized incremental integration. These are sphere-proxy equations, not a
general convex rigid-body solver. Compound contacts use actual contact lever
arms and angular effective mass, with an approximate scalar inertia derived
from the lobes' volume and offsets.

### Lab collision and damage path

`RockShape.js` partitions each authored rock once at load, using farthest seeds
and four Lloyd iterations. Up to six sphere lobes approximate its surface;
detached authored cells use up to three lobes. A containing radius remains the
broadphase bound. `SplatPhysicsWorld.js` tests the lobes only for overlapping
body bounds and retains at most four body/body contacts per pair, with stable
lobe feature keys for warm-starting. Terrain has up to six lobe support contacts.
Simple spheres retain a separate particle/collision fast path. Particles and
mouse picking use the same lobe union, including the gaps left by removed cells.

`SelectiveCCD.js` activates when a rock's predicted translation exceeds half
its smallest lobe radius during a tick. Slow rocks use discrete contacts. Fast
rocks sweep their lobes through nearby stationary bins and the bounded moving
body list; relative sweeps catch moving/moving crossings. Earliest impacts are
resolved in time order before discrete contacts. Rotation uses endpoint chords
with angular padding; terrain uses bounded bracketing and bisection. Defaults
are 32 fast bodies, four impact events and 4,096 lobe/terrain probes per event,
plus at most 128 stationary-grid traversal steps. Overflow stops fast bodies at
their last safe pose, rather than spending unbounded work or advancing through
obstacles. `ccdBodies`, `ccdTests`, `ccdHits` and `ccdBudgetHits` expose this work.
This is translational CCD with rotational approximation, not exact rotational
or arbitrary triangle-mesh CCD.

`RockDamage.js` maintains a connected graph of up to six fracture cells. The
largest impact per body/tick loads bonds nearest the contact point; small support
impulses are ignored. Repeated moderate loads accumulate local fatigue, while
large loads can shatter all remaining cells. Disconnected components detach,
leaving the largest connected component as the core. Heat applies smaller
continuous loads and blasts feed the same damage path. Crack shading darkens
precomputed cell seams, with 5% visual quantization to skip redundant uploads.
Ownership metadata changes only on first activation or cell release.

Partial fracture removes released lobes and surface records from the core,
updates its mass/inertia, and transfers those exact records to fragment bodies.
Up to 6% of impact energy supplies a bounded separating kick (at most 1.5 m/s
relative speed), with opposite core impulses or a zero-mean fragment correction.
Linear momentum and displayed pose are preserved for mobile parents. A mouse
anchor releases if its cell detaches. There is no recursive fracture allocation:
authored rocks allocate at most six fragment bodies; spawned rocks recycle their
existing six. The original cliff retains its previous single-stage fracture
policy; the lab opts into this path with `advancedRocks`.

`AuthoredRock.js` fractures the cliff's existing rock ranges lazily. Ownership
tags include moss and survive perimeter compaction. Farthest-point seeds and
five bounded Lloyd iterations partition the actual surface marks into two to
six spatial chunks. The original proxy is disabled, its character-navigation
ellipse is marked destroyed, and the exact marks retain their GPU addresses.
Only those addresses are added to moving visibility/depth-sort membership.
Colors and all three covariance axes follow each chunk's interpolated pose,
using one rotation matrix per chunk. Partial texture uploads cover the affected
rock ranges. Sleeping chunks skip unchanged transforms and quantized material
updates. Source scene data is retained, so re-entering the scene restores it.

`BreakableSplatCluster.js` preallocates one intact proxy, six chunk proxies and
432 surface marks per rock. A qualifying impact or a manual fracture transfers
the same marks to the chunk bodies. Local centers and all three covariance axes
are transformed by the interpolated rigid pose. The intact proxy is disabled;
there is no duplicate intact rendering. Fragments inherit linear and angular
velocity, including the parent's angular contribution at each chunk center.
The symmetric mass distribution preserves linear momentum at transfer.

`CliffWindField.js` uses the cliff's wind exposure bake, prevailing direction
and advected gust frequencies. The particle pool, shed courier snow and debris
sample this CPU field. Triggered gusts also drive a uniform in the existing
meadow shader. The CPU field expresses velocities; the vegetation shader
expresses displacement, so they share weather structure rather than identical
numerical output. Distant vegetation and authored drifting snow remain on the GPU.

`RockGrab.js` applies a critically damped point constraint on fixed ticks, with
the sphere's effective mass at the clicked anchor, bounded acceleration and
angular response. A short pointer history estimates release velocity. Intact
authored rocks can move before fracturing; subsequent chunks inherit the current
pose and velocity. `PhysicsLabMouse.js` captures the pointer and draws a tether.
Pause, lost capture, focus loss and Escape cancel safely; fracture releases the
constraint. Picking uses compound lobes in the lab, or legacy ellipsoid/sphere proxies, at their
displayed poses, with ground occlusion.

### Ropes, cloth and flexible plants

The lab opts into `FlexibleLab.js`: two 25-node ropes, a 19 × 12 banner and ten
eight-node rooted stems. Four fixed compound posts also have courier navigation
footprints. The 358 nodes share one `XPBDFlexWorld.js`, with capacity 512, 1,713
distance/tether constraints, 60 vector-curvature constraints and six iterations.
The pool reserves 2,048 distance constraints and 256 bending constraints. Its
typed buffers use about 140 KB, and 2,430 persistent Gaussians render the rigs
and supports without another pass. The original cliff does not allocate them.

XPBD scales compliance by the fixed tick squared, accumulates multipliers over
iterations, and resets multipliers each tick. Rope stretch/bending and cloth
structural/shear/bending edges share the distance solver. Maximum-length tethers
help long objects resist mouse pulls without increasing iterations. Rooted stems
pin their first two nodes and solve a rest-curvature vector, allowing them to bend
and recover after contact. There is no resampling or topology allocation during
simulation. Render centres and all covariance axes follow interpolated nodes.

Wind is sampled once per rig per tick; cloth receives triangle-area pressure
from relative normal wind, while ropes and stems use node drag. Gravity/drag
integration uses the same exponential integral as rigid bodies. Node velocities
and accelerations are capped. Node collision probes use existing terrain and
compound-body hashes. Normal impulses are exchanged with dynamic rocks, with
a per-body reaction budget; static and kinematic objects supply external motion.
A lab-only three-lobe character proxy follows feet, torso and head, so actual
walking/jumping pushes both cloth and hanging rope. Blasts add bounded radial
velocity to every unpinned nearby node, including both ropes and cloth.

`FlexGrab.js` attaches the pointer to barycentric cloth faces or rope/stem
segments, using a compliant constraint and a bounded target speed. Release keeps
the solver's velocity. Escape, focus loss, reset and pause release the pointer
and restore orbit controls. Rock grabbing retains its existing solver. `V`
frames all rigs (and closes the panel on small screens); `R` restores their rest
pose, thermal/snow state and links in the same buffers. Pause also freezes the
manual `advanceTime` clock.

Heat darkens and consumes flexible marks, then severs links. A cut releases the
affected rig's coarse tethers/bending spans so hidden constraints cannot hold
severed pieces up. Snow coats marks, increases effective node mass and inhibits
burning. Fire still uses the existing fuel-limited source; this is not fire
spread or a thermodynamic cloth model.

Collision uses grid nodes, not continuous fabric triangles or cloth
self-collision. Small debris can pass between samples. Plant bending is a
clamped beam approximation; leaves follow their stem frame. Arbitrary rigid
attachments, cloth pressure volumes, exact rotational rod dynamics, tension
tearing and recursive topology changes remain outside this implementation.

`SplatParticles.js` keeps 768 slots in typed arrays for position, velocity, age,
lifetime, size, kind and liveness. Slots recycle rather than grow. Snow, dust and
embers project against terrain and nearby sphere proxies; smoke and flames rise
with buoyancy and wind. Particle collisions are one way and do not add rigid
contact constraints. Snow settles briefly and fades, and heat accelerates its
melting. Fire emits warm flame marks, smoke and embers, consumes fuel, and can be
extinguished by sustained snowfall. Heat can fracture nearby dropped clusters.
Heat also fractures authored stones. Debris receives wind drag scaled by
proxy area/mass. Snow particles deposit on debris, seasonal cover builds a
surface coating, snow reduces friction and slightly changes wind response, and
fire heats/darkens fragments while melting their coating. Rocks do not become
combustion fuel. A small spatial index limits intact-rock heat queries to the
fire's neighborhood.

Embers reflect against terrain normals and moving rock surfaces with bounded
substeps. `EmberTrails.js` retains up to 64 eight-point histories: 448 fixed
Gaussian segments, sampled at 25 ms intervals and at bounce contacts, fading
over 220 ms. Recycling clears a chain before reuse, avoiding distant streaks.

`ExplosionSolver.js` queries nearby proxies using a cached coarse stationary
hash and the moving-body index. Each blast affects at most 96 bodies. Pressure
impulse scales with proxy area and squared radial falloff, with a velocity cap
and sampled terrain attenuation. Fracture distributes the parent impulse by
chunk mass. Four pooled shock waves use 128 splats; burst particles reuse the
existing particle pool. Blasts also push live flame, smoke and ember particles.
A nearby active fire source receives a ground-following drift that decays
exponentially; ongoing emissions inherit that drift, and heat follows it.

`ObjectMotionBlur.js` adds lab object blur inside the existing splat draw. A
roughly 20 KiB pose/velocity texture supplies linear and angular velocity per body.
Existing metadata stores ownership, updated only when ownership changes. The
shader adds projected motion covariance over a 1/60 s shutter interval, clamps
stretch to 1.2 m and compensates opacity for expanded coverage. There is no
extra render pass. Stationary bodies remain sharp; pausing closes the shutter.
This covers rigid rocks and debris, not skinned courier bone motion.

`CliffPhysics.js` coordinates the shared fixed ticks. The default budget is eight
reusable rocks (56 allocated rigid proxies, at most 48 active fragments), one
kinematic courier proxy, authored fixed boulder proxies, and 768 particles.
It adds 4,800 dynamic splats to the actor, including trails and shock waves,
plus 2,430 flexible-rig/support splats in the lab. Reusing a rock slot replaces that
slot's old debris. Authored chunks allocate only when fractured, up to the
finite scene ownership budget. A default 192-body active debris budget parks
old fragments without removing their marks or collision proxies. Gusts can
wake nearby debris within the active budget. Authored rock ranges stay in
the environment buffer and add no duplicate actor splats. The continuous
landscape remains outside the rigid-body budget. The sphere proxies provide
coarse debris contacts; intact large rocks retain the courier's original
elliptical navigation checks until destroyed.

The courier already had two-bone IK. Its cliff integration now samples the
ground under each foot relative to the root's ground height, correcting slope
and seasonal snow height within a 0.3-unit reach adjustment. Existing contact
phases, animator rotations, airborne release and pose restoration are retained.

All simulation splats use the renderer's existing five-texel layout. Packing
updates centers, opacity, axes and color in place, preserves material tags and
auxiliary lighting channels, and updates the depth-sort center buffer. Actor
disposal releases the solver, with no additional listeners or timers.

## Validation

```sh
npm run test:physics
npm run profile:physics
node scripts/profile-explosions.mjs
node scripts/profile-compound-rocks.mjs
node scripts/profile-flexible-physics.mjs
npm run build
node tests/browser-cliff-physics.mjs /path/to/playwright
node tests/browser-physics-lab.mjs /path/to/playwright
node tests/browser-rock-grab.mjs /path/to/playwright
node tests/browser-physics-effects.mjs /path/to/playwright
node tests/browser-compound-rocks.mjs /path/to/playwright
node tests/browser-flexible-physics.mjs /path/to/playwright
```

The browser script follows the repository's existing Playwright harness pattern.
It checks both keyboard and panel controls, impact/manual fracture, fire and
snow coexistence, weather hold, desktop/mobile layout and console errors. It
captures screenshots and a JSON report under `output/`. Its separate 96-body
collision benchmark measures solver work only, with median/p95 timings; it is
not an end-to-end rendering benchmark or a Rapier comparison.
`window.render_game_to_text()` exposes physics and IK state, and
`window.advanceTime(ms)` advances the standalone view reproducibly.

The effects browser check verifies bouncing embers, trail capacity, blast-driven
fire displacement, pointer blasts, paused blur, mobile layout and shader errors.
GPU readback confirms moving-object blur changes pixels without adding draw
calls, while a stationary body produces identical pixels at strengths 0 and 2.

The separate explosion profiler measured 0.024 ms median / 0.039 ms p95 for hot
query and pressure work on 1,594 fixed plus 96 dynamic proxies (240 candidates
visited, 80 affected, one stationary-index build). Its first cold call took
4.77 ms. These local Node measurements exclude fracture allocation, particle
effects, packing and rendering; they are not total blast-frame timings.
See `output/explosion-profile.json` and rerun the script to measure your machine.

The compound stress profiler uses 1,594 stationary spheres and 96 dynamic
six-lobe bodies, two 120 Hz ticks per 60 Hz frame. This machine measured
1.22 ms median / 2.42 ms p95 for compounds; adding 768 snow particles measured
3.46 / 5.02 ms. The fast-rock scenario measured 2.61 / 4.10 ms and records any
CCD caps in its report. One thousand moderate damage loads took about 5 ms
while retaining seven allocated bodies in the recycled rock pool.
These are local CPU measurements excluding rendering, skinning, native splat
transforms and packing, not an FPS guarantee or comparison against Rapier.
Results are in `output/compound-rocks-profile.json`.

`profile:physics` defaults to the frozen v1 comparison; pass
`tests/fixtures/physics-world-v2.js` to compare the pre-compound sphere solver.
The latter run measured 0.96 → 1.04 ms collision median and 3.24 → 3.64 ms with
snow, reflecting the added contact math while retaining the sphere fast path.
The report records its baseline in `output/physics-solver-profile.json`.

The flexible profiler measured 1.54 ms median / 1.82 ms p95 simulation per 60 Hz
frame for the rigs, plus 0.57 ms median to transform/pack their 2,430 splats.
With 96 two-lobe rigid bodies, a moving character, 768 snow particles, gusts and
periodic blasts, simulation measured 5.31 / 9.38 ms and flexible packing 0.60 ms
median. GPU rendering and the rest of the scene are excluded. The benchmark
records peak stretch and contact/cap counts in `output/flexible-physics-profile.json`.
The flexible browser report verifies actual WASD cloth/rope contacts, separate
blast kicks to both, mouse pulls, burning/cuts, paused stepping, reset and mobile.

## Current scope

This is a first CPU implementation, not general-purpose rigid-body parity with
Rapier. It has sphere compounds and sampled terrain, without convex hulls, mesh
colliders, joints or rigid-body islands. Selective CCD is bounded and rotational
motion/terrain are approximations; non-CCD bodies can still tunnel beyond the
subdivision budget. High stacks and extreme mass ratios need further work.
Particle projection is discrete. Camera culling never pauses simulation bodies.

Destruction applies to both placed boulders and dropped objects. It does not cut
the continuous terrain escarpment. Fragments retain the existing surface marks;
their newly exposed cut interiors are not remeshed. Ground contact shading is
still baked. Fire uses particles, fuel and local
heat thresholds; it is not a fluid/combustion solver and does not spread through
the meadow. In the original cliff, snowfall particles collide and melt while
landscape coverage/footprints retain the seasonal bake. The lab instead uses
the physical ground layers described above; it leaves the base terrain intact.
There is no claim of
cross-platform bitwise determinism or a performance advantage over Rapier.

## Design references

The separation of bodies from collision representations, dynamic/fixed/kinematic
states and sleeping follows the concepts described in the official
[Rapier rigid-body guide](https://rapier.rs/docs/user_guides/javascript/rigid_bodies/).
Fixed integration budgets and keeping rendering updates focused on moving
objects were informed by Rapier's
[simulation structures](https://rapier.rs/docs/user_guides/javascript/simulation_structures/).
The renderer uses [Three.js](https://threejs.org/docs/) for vector/quaternion math
and its existing WebGL data texture pipeline. No Rapier runtime or new package
dependency is required.

Accumulated impulse clamping and warm-starting follow the approach explained
in Erin Catto's [Solver2D notes](https://box2d.org/posts/2024/02/solver2d/).
The terrain graph, input EXR, evaluated EXR and bake script live in
`experiments/libreterrain-fracture/physics-lab/`.
