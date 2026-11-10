/** Every render option the engine accepts, as data: type, range, default and
 * what it does. `setStyle` validates against this table, the CLI prints it,
 * and `tests/sillage-api.test.js` checks the defaults against the engine's
 * own so the table cannot drift. Pure data: safe to import in Node. */
import {SillageError, didYouMean} from './errors.js';

const number = (group, fallback, min, max, description, extra = {}) => ({type: 'number', group, default: fallback, min, max, description, ...extra});
const boolean = (group, fallback, description, extra = {}) => ({type: 'boolean', group, default: fallback, description, ...extra});

export const STYLE_GROUPS = {
  paint: 'How each splat is drawn as a brush mark.',
  gouache: 'The gouache, oil and watercolour marks. Only used when mode is "gouache".',
  light: 'How baked bounce light and shadow colour are applied to the authored colours.',
  sun: 'A painted sun disc in the sky.',
  lens: 'Lens dirt and flare. They need the sun to be visible.',
  vignette: 'A painterly vignette toward the corners.',
  focus: 'Depth of field.',
  occlusion: 'Screen-space ambient occlusion.',
  performance: 'Speed and detail trade-offs. They do not change the look at rest.',
};

export const STYLE_OPTIONS = {
  mode: {type: 'enum', group: 'paint', default: 'paint', values: ['paint', 'gaussian', 'gouache'], aliases: {ghibli: 'gouache'},
    description: 'Drawing method. "paint": layered dabs with defined edges and a visible direction. "gaussian": the same marks with a soft Gaussian falloff. "gouache": gouache with broken edges and pigment grain; also the base for "oil" and "watercolor".'},
  brushScale: number('paint', 1, .25, 3, 'Size of every mark relative to its authored size.'),
  coverage: number('paint', 1, .5, 1.5, 'Opacity multiplier for every mark. Below 1 thins the paint.'),
  softness: number('paint', .2, 0, 1, 'Edge softness of every mark. 0 is crisp, 1 dissolves.'),
  pixelFilter: boolean('paint', false, 'Keeps small marks from swelling when they shrink below a pixel. Fine detail looks lighter.'),

  oil: boolean('gouache', false, 'Draw each mark as a loaded flat oil brush: squared heel, bristle tracks, a tail that runs dry.', {requires: {mode: 'gouache'}}),
  watercolor: boolean('gouache', false, 'Draw each mark as a transparent wash with a pooled edge. Wins over "oil".', {requires: {mode: 'gouache'}}),
  gouacheTexture: number('gouache', .55, 0, 1, 'Pigment grain and bristle texture.', {requires: {mode: 'gouache'}}),
  gouacheBlend: number('gouache', .7, 0, 1, 'Wet merging of neighbouring strokes.', {requires: {mode: 'gouache'}}),
  gouacheTone: number('gouache', .65, 0, 1, 'Colour depth of the gouache grade. 0 leaves authored colours untouched.', {requires: {mode: 'gouache'}}),
  paperScale: number('gouache', 1, .02, 20, 'Size of the wash and grain shared across marks. 1 is as authored; smaller suits scenes of small marks.', {requires: {mode: 'gouache'}}),

  indirect: boolean('light', true, 'Apply the baked one-bounce light.'),
  bounceStrength: number('light', 1, 0, 2, 'Strength of the bounce light.', {requires: {indirect: true}}),
  tonePreservation: number('light', .8, 0, 1, 'How strongly authored tones are kept when bounce light is added.'),
  tintedShadows: boolean('light', true, 'Shift shadowed marks toward the shadow tint.'),
  shadowTint: {type: 'color', group: 'light', default: '#66759b', description: 'Shadow colour, "#rrggbb".', requires: {tintedShadows: true}},
  shadowTintStrength: number('light', .35, 0, 1, 'Amount of shadow tint.', {requires: {tintedShadows: true}}),

  sun: boolean('sun', true, 'Show the sun disc.'),
  sunAzimuth: number('sun', -35, -180, 180, 'Sun direction around the vertical axis, degrees.', {requires: {sun: true}}),
  sunElevation: number('sun', 16, -10, 85, 'Sun height above the horizon, degrees.', {requires: {sun: true}}),
  sunSize: number('sun', 1, 1, 8, 'Sun disc size. 1 is the physical half-degree disc.', {requires: {sun: true}}),
  sunIntensity: number('sun', 8, 0, 20, 'Sun brightness.', {requires: {sun: true}}),

  lensDirt: boolean('lens', true, 'Soft dirt bloom on bright areas.'),
  lensDirtStrength: number('lens', .3, 0, 1, 'Amount of lens dirt.', {requires: {lensDirt: true}}),
  lensDirtScale: number('lens', 1, .5, 2, 'Size of the dirt pattern.', {requires: {lensDirt: true}}),
  lensFlare: boolean('lens', true, 'Ghosts and bloom when the sun is in frame.'),
  lensFlareStrength: number('lens', .65, 0, 2, 'Amount of flare.', {requires: {lensFlare: true}}),
  lensFlareScale: number('lens', 1, .5, 2, 'Size of the flare ghosts.', {requires: {lensFlare: true}}),
  lensFlareBloom: number('lens', .6, 0, 1.5, 'Bloom around the sun.', {requires: {lensFlare: true}}),

  painterlyVignette: boolean('vignette', false, 'Smear and darken toward the corners.'),
  vignetteStrength: number('vignette', .65, 0, 1, 'Amount of vignette.', {requires: {painterlyVignette: true}}),
  vignetteSpread: number('vignette', .65, 0, 1, 'How far the vignette reaches inward.', {requires: {painterlyVignette: true}}),
  vignetteSwirl: number('vignette', .75, 0, 1, 'Rotational smear of the vignette.', {requires: {painterlyVignette: true}}),

  foregroundDOF: boolean('focus', false, 'Blur marks in front of and far behind the focus distance.'),
  autoFocus: boolean('focus', true, 'Focus on what the camera looks at. Setting focusDistance turns this off.', {requires: {foregroundDOF: true}}),
  focusDistance: number('focus', 12, .15, 600, 'Focus distance in world units.', {requires: {foregroundDOF: true}}),
  dofStrength: number('focus', .65, 0, 1, 'Amount of blur.', {requires: {foregroundDOF: true}}),
  dofRange: number('focus', .85, .3, .95, 'Depth of the sharp zone as a share of the focus distance.', {requires: {foregroundDOF: true}}),
  dofSwirl: number('focus', .3, 0, 1, 'Swirl of out-of-focus marks.', {requires: {foregroundDOF: true}}),

  ssao: boolean('occlusion', false, 'Darken creases and contacts. Adds three passes.'),
  ssaoStrength: number('occlusion', 1.15, 0, 3, 'Amount of occlusion.', {requires: {ssao: true}}),
  ssaoRadius: number('occlusion', .65, .08, 3, 'Occlusion radius in world units.', {requires: {ssao: true}}),
  ssaoBias: number('occlusion', .025, .005, .15, 'Depth bias that prevents self-occlusion.', {requires: {ssao: true}}),
  ssaoDebug: boolean('occlusion', false, 'Show only the occlusion term.', {requires: {ssao: true}}),

  quality: {type: 'enum', group: 'performance', default: 'draft', values: ['draft', 'studio'],
    description: 'Viewport resolution cap: "draft" 1100 px wide, "studio" 1600 px. Captures always render at export resolution.'},
  plantLOD: boolean('performance', true, 'Adaptive plant detail, in scenes that have it.'),
  markLOD: boolean('performance', true, 'Withhold marks too small to see, in scenes that enable it.'),
  occlusionCulling: boolean('performance', true, 'Skip marks hidden behind opaque paint.'),
  sortWorker: boolean('performance', true, 'Order and cull marks on a worker while the view is dragged or orbiting, in large scenes.'),
  vertexPrepass: boolean('performance', true, 'Compute each mark once instead of once per quad corner, in scenes that enable it.'),
  stillRefine: boolean('performance', true, 'Supersample the view once it is at rest.'),
};

export const STYLE_KEYS = Object.keys(STYLE_OPTIONS);

/** The engine's defaults, as one plain object. */
export function styleDefaults() {
  return Object.fromEntries(STYLE_KEYS.map(key => [key, STYLE_OPTIONS[key].default]));
}

function problemWith(key, value) {
  const option = STYLE_OPTIONS[key];
  if (!option) return {key, message: `Unknown style option "${key}".`, hint: didYouMean(key, STYLE_KEYS, 'a key from "sillage styles", such as')};
  if (option.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return {key, message: `"${key}" must be a number, got ${JSON.stringify(value)}.`, hint: `Use a number from ${option.min} to ${option.max}.`};
    if (value < option.min || value > option.max) return {key, message: `"${key}" is ${value}, outside ${option.min} to ${option.max}.`, hint: `Use a number from ${option.min} to ${option.max} (default ${option.default}).`};
  } else if (option.type === 'boolean') {
    if (typeof value !== 'boolean') return {key, message: `"${key}" must be true or false, got ${JSON.stringify(value)}.`, hint: 'Use true or false.'};
  } else if (option.type === 'enum') {
    if (!option.values.includes(value) && !(option.aliases && Object.hasOwn(option.aliases, value))) return {key, message: `"${key}" cannot be ${JSON.stringify(value)}.`, hint: didYouMean(value, option.values)};
  } else if (option.type === 'color') {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) return {key, message: `"${key}" must be a "#rrggbb" colour, got ${JSON.stringify(value)}.`, hint: 'Use six hex digits, for example "#66759b".'};
  }
  return null;
}

/** Problems in a style patch: [{key, message, hint}]. Empty when it is valid. */
export function styleProblems(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return [{key: null, message: 'A style must be an object of option names and values.', hint: 'For example {"mode": "gouache", "softness": 0.3}.'}];
  return Object.entries(patch).map(([key, value]) => problemWith(key, value)).filter(Boolean);
}

/** A checked copy of a style patch. Throws one SillageError naming every problem. */
export function validateStyle(patch) {
  if (patch === undefined || patch === null) return {};
  const problems = styleProblems(patch);
  if (problems.length) {
    throw new SillageError('INVALID_STYLE', problems.map(problem => problem.message).join(' '), {
      hint: problems.map(problem => problem.hint).filter(Boolean).join(' '), details: problems,
    });
  }
  const style = {...patch};
  if (style.shadowTint) style.shadowTint = style.shadowTint.toLowerCase();
  // A value's former name is accepted and answered with its current one.
  for (const [key, value] of Object.entries(style)) { const current = STYLE_OPTIONS[key].aliases?.[value]; if (current !== undefined) style[key] = current; }
  return style;
}

/** What the renderer calls a value that this table names differently. The
 * table is the public vocabulary; `toEngine` and `fromEngine` translate at
 * the edge, so the two can be renamed apart. */
const ENGINE_VALUES = {mode: {gouache: 'ghibli'}};
export const toEngine = (key, value) => ENGINE_VALUES[key]?.[value] ?? value;
export function fromEngine(key, value) {
  const found = Object.entries(ENGINE_VALUES[key] ?? {}).find(([, engine]) => engine === value);
  return found ? found[0] : value;
}

/** Options that are set but do nothing because another option is off. */
export function styleNotes(style) {
  const notes = [];
  for (const [key, value] of Object.entries(style)) {
    const option = STYLE_OPTIONS[key];
    if (!option?.requires || value === option.default || value === false) continue;
    for (const [need, wanted] of Object.entries(option.requires)) {
      if (style[need] !== wanted) notes.push(`"${key}" has no effect unless "${need}" is ${JSON.stringify(wanted)}.`);
    }
  }
  return notes;
}

/** Parse "key=value" pairs from a command line into a style patch. */
export function parseStylePairs(pairs) {
  const style = {};
  for (const pair of pairs) {
    const at = pair.indexOf('=');
    if (at < 1) throw new SillageError('INVALID_STYLE', `Expected key=value, got "${pair}".`, {hint: 'For example --style mode=gouache --style softness=0.3'});
    const key = pair.slice(0, at), text = pair.slice(at + 1), option = STYLE_OPTIONS[key];
    style[key] = option?.type === 'number' ? Number(text) : option?.type === 'boolean' ? (text === 'true' ? true : text === 'false' ? false : text) : text;
  }
  return validateStyle(style);
}

/** The style table as JSON Schema properties, for scene documents and tool inputs. */
export function styleSchema() {
  const properties = {};
  for (const [key, option] of Object.entries(STYLE_OPTIONS)) {
    properties[key] = option.type === 'number' ? {type: 'number', minimum: option.min, maximum: option.max, default: option.default, description: option.description}
      : option.type === 'boolean' ? {type: 'boolean', default: option.default, description: option.description}
      : option.type === 'enum' ? {type: 'string', enum: option.values, default: option.default, description: option.description}
      : {type: 'string', pattern: '^#[0-9a-fA-F]{6}$', default: option.default, description: option.description};
  }
  return {type: 'object', properties, additionalProperties: false};
}
