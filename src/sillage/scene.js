/** Scene documents: a whole Sillage scene as plain JSON.
 *
 *   {"sillage": 1, "background": "#8fb7cf",
 *    "camera": {"position": [4, 3, 8], "target": [0, 1, 0], "fov": 35},
 *    "content": [{"type": "ellipsoid", "center": [0, 1, 0], "radius": 1,
 *                 "color": ["#3b2a20", "#8a5a3c", "#d9a66f"]}]}
 *
 * A document is validated with a path and a hint for every problem, compiled
 * into splats, and handed to the renderer as an ordinary scene definition.
 * Everything here is pure: it runs in Node and in the page. */
import {SillageError, didYouMean} from './errors.js';
import {STYLE_OPTIONS, styleProblems, styleSchema} from './styles.js';
import {ALONG, ACROSS, DEFAULT_LIGHT, MATERIALS, createBrush, compileColor, parseColor, transformSplats, add, sub, mul, len, unit} from './brush.js';
import {bakeIrradiance} from '../splat/irradiance.js';
import {decodeNativeSplat} from '../splat/nativeSplat.js';
import {buildPainting, validateSpec} from '../splat/atelier/build.js';

export const SCENE_VERSION = 1;
/** A document may not compile to more marks than this; above the warning level it renders slowly. */
export const MAX_SPLATS = 400000, WARN_SPLATS = 150000;

const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const vector = (value, size) => Array.isArray(value) && value.length === size && value.every(finite);
const CAPS = ['none', 'start', 'end', 'both'];

/** Field kinds: a check that returns a complaint or null, and a JSON Schema fragment. */
const KINDS = {
  string: {check: v => typeof v === 'string' && v ? null : 'must be a non-empty string', schema: {type: 'string'}},
  boolean: {check: v => typeof v === 'boolean' ? null : 'must be true or false', schema: {type: 'boolean'}},
  number: {check: v => finite(v) ? null : 'must be a number', schema: {type: 'number'}},
  positive: {check: v => finite(v) && v > 0 ? null : 'must be a number above 0', schema: {type: 'number', exclusiveMinimum: 0}},
  unit: {check: v => finite(v) && v >= 0 && v <= 1 ? null : 'must be a number from 0 to 1', schema: {type: 'number', minimum: 0, maximum: 1}},
  count: {check: v => Number.isInteger(v) && v >= 1 && v <= MAX_SPLATS ? null : `must be a whole number from 1 to ${MAX_SPLATS}`, schema: {type: 'integer', minimum: 1, maximum: MAX_SPLATS}},
  vec3: {check: v => vector(v, 3) ? null : 'must be three numbers [x, y, z]', schema: {type: 'array', items: {type: 'number'}, minItems: 3, maxItems: 3}},
  direction: {check: v => vector(v, 3) && len(v) > 1e-9 ? null : 'must be a non-zero direction [x, y, z]', schema: {type: 'array', items: {type: 'number'}, minItems: 3, maxItems: 3}},
  size2: {check: v => vector(v, 2) && v.every(n => n > 0) ? null : 'must be two numbers above 0, [width, height]', schema: {type: 'array', items: {type: 'number', exclusiveMinimum: 0}, minItems: 2, maxItems: 2}},
  size3: {check: v => vector(v, 3) && v.every(n => n > 0) ? null : 'must be three numbers above 0, [x, y, z]', schema: {type: 'array', items: {type: 'number', exclusiveMinimum: 0}, minItems: 3, maxItems: 3}},
  scale: {check: v => (finite(v) && v > 0) || (vector(v, 3) && v.every(n => n > 0)) ? null : 'must be a number above 0, or [x, y, z] above 0', schema: {oneOf: [{type: 'number', exclusiveMinimum: 0}, {type: 'array', items: {type: 'number', exclusiveMinimum: 0}, minItems: 3, maxItems: 3}]}},
  radius: {check: v => (finite(v) && v > 0) || (Array.isArray(v) && v.length >= 2 && v.every(n => finite(n) && n >= 0) && v.some(n => n > 0)) ? null : 'must be a number above 0, or one radius per path point', schema: {oneOf: [{type: 'number', exclusiveMinimum: 0}, {type: 'array', items: {type: 'number', minimum: 0}, minItems: 2}]}},
  path: {check: v => Array.isArray(v) && v.length >= 2 && v.every(p => vector(p, 3)) ? null : 'must be a list of at least two points [[x, y, z], ...]', schema: {type: 'array', items: {type: 'array', items: {type: 'number'}, minItems: 3, maxItems: 3}, minItems: 2}},
  opacity: {check: v => (finite(v) && v > 0 && v <= 1) || (vector(v, 2) && v.every(n => n > 0 && n <= 1) && v[0] <= v[1]) ? null : 'must be a number above 0 up to 1, or a range [min, max]', schema: {oneOf: [{type: 'number', exclusiveMinimum: 0, maximum: 1}, {type: 'array', items: {type: 'number', exclusiveMinimum: 0, maximum: 1}, minItems: 2, maxItems: 2}]}},
  material: {check: v => MATERIALS.includes(v) ? null : `must be one of ${MATERIALS.join(', ')}`, schema: {type: 'string', enum: MATERIALS}},
  caps: {check: v => CAPS.includes(v) ? null : `must be one of ${CAPS.join(', ')}`, schema: {type: 'string', enum: ['none', 'start', 'end', 'both']}},
  taper: {check: v => (finite(v) && v > 0) || (vector(v, 2) && v.every(n => n >= 0) && v.some(n => n > 0)) ? null : 'must be a number above 0, or [bottom, top]', schema: {oneOf: [{type: 'number', exclusiveMinimum: 0}, {type: 'array', items: {type: 'number', minimum: 0}, minItems: 2, maxItems: 2}]}},
  object: {check: v => isObject(v) ? null : 'must be an object', schema: {type: 'object'}},
  // Checked in depth by their own validators below.
  color: {check: () => null, schema: {description: 'A colour: "#rrggbb", a palette name, a list of colours from dark to light (shaded by the light), {"ramp": [...], "variation": 0.12}, or {"gradient": {"axis": "y", "stops": [[0, "#223"], [3, "#9ab"]]}}.'}},
  stroke: {check: () => null, schema: {type: 'object', description: 'How the marks are laid.', additionalProperties: false, properties: {
    length: {type: 'number', exclusiveMinimum: 0, description: 'Painted length of a mark in world units. Default: about twice the spacing between marks.'},
    width: {type: 'number', exclusiveMinimum: 0, description: 'Painted width in world units.'},
    thickness: {type: 'number', exclusiveMinimum: 0, description: 'Depth of the mark off the surface.'},
    direction: {description: 'Stroke direction: [x, y, z], "along" (the form\'s own axis), "around", "up", "down" or "random".'},
    spread: {type: 'number', minimum: 0, maximum: 80, description: 'Random deviation of the direction, degrees.'},
    jitter: {type: 'number', minimum: 0, maximum: 1, description: 'Size variation between marks. Default 0.35.'},
  }}},
  splats: {check: () => null, schema: {type: 'array', minItems: 1, description: 'Marks written out one by one. Each is {"at", "normal", "direction", "size": [length, width, thickness]} or, as a raw Gaussian, {"center", "axes": [[x,y,z],[x,y,z],[x,y,z]]}; plus "color", "opacity", "material".', items: {type: 'object'}}},
};

const SURFACE = {
  color: ['color', 'Colour of the marks. A list of colours, dark to light, is shaded by how the surface faces the light.'],
  opacity: ['opacity', 'Opacity of each mark, or a [min, max] range. Default 0.95.'],
  count: ['count', 'Number of marks. Default: enough to cover the surface.'],
  stroke: ['stroke', 'Size and direction of the marks.'],
  material: ['material', 'What the marks are made of. It guides baked light and focus: "cloud" and "fog" cast no shadow.'],
  unlit: ['boolean', 'Keep the colours exactly as written, with no baked shadow or bounce: lamps, flames, signs, skies.'],
};
const PLACEMENT = {
  id: ['string', 'A name for this item, used in reports and error messages.'],
  position: ['vec3', 'Move the finished item by [x, y, z].'],
  rotation: ['vec3', 'Turn the finished item about its own centre, degrees around X, then Y, then Z.'],
  scale: ['scale', 'Scale the finished item about its own centre: one number or [x, y, z].'],
};

/** Every content type: what it is and the fields it takes. */
export const CONTENT_TYPES = {
  ellipsoid: {summary: 'A sphere or ellipsoid shell of marks: fruit, stones, heads, hills, domes.',
    fields: {center: ['vec3', 'Centre. Default [0, 0, 0].'], radius: ['positive', 'Radius of a sphere.'], radii: ['size3', 'Radii [x, y, z] of an ellipsoid. Wins over "radius".'], ...SURFACE, ...PLACEMENT}},
  plane: {summary: 'A flat rectangle of marks: ground, walls, water, table tops.',
    fields: {center: ['vec3', 'Centre. Default [0, 0, 0].'], size: ['size2', 'Width and height. Default [4, 4].'], normal: ['direction', 'The way it faces. Default [0, 1, 0], a floor. A back wall is [0, 0, 1].'], up: ['direction', 'Direction of its height. Default: away from the viewer for a floor, +Y for a wall.'], ...SURFACE, ...PLACEMENT}},
  box: {summary: 'A box painted on all six faces: buildings, crates, steps, slabs.',
    fields: {center: ['vec3', 'Centre. Default [0, 0, 0].'], size: ['size3', 'Size [x, y, z]. Default [1, 1, 1].'], ...SURFACE, ...PLACEMENT}},
  disc: {summary: 'A flat round disc of marks: ponds, plates, lids, round rugs.',
    fields: {center: ['vec3', 'Centre. Default [0, 0, 0].'], radius: ['positive', 'Radius. Default 1.'], normal: ['direction', 'The way it faces. Default [0, 1, 0], lying flat.'], ...SURFACE, ...PLACEMENT}},
  cylinder: {summary: 'An upright round solid standing on its base, closed at both ends: towers, columns, drums, pots, tree stumps.',
    fields: {base: ['vec3', 'Centre of the bottom face. Default [0, 0, 0].'], radius: ['taper', 'One radius, or [bottom, top] for a taper. Default 0.5.'], height: ['positive', 'Height along the axis. Default 1.'], axis: ['direction', 'Direction it stands in. Default [0, 1, 0], upright.'], caps: ['caps', 'Which ends are closed. Default "both".'], ...SURFACE, ...PLACEMENT}},
  cone: {summary: 'A cone standing on its base, closed underneath: roofs, spires, tips, party hats.',
    fields: {base: ['vec3', 'Centre of the bottom face. Default [0, 0, 0].'], radius: ['positive', 'Radius of the base. Default 0.5.'], height: ['positive', 'Height to the tip. Default 1.'], axis: ['direction', 'Direction the tip points. Default [0, 1, 0], up.'], ...SURFACE, ...PLACEMENT}},
  tube: {summary: 'A tube along a path of points, open at the ends unless capped: trunks, branches, limbs, ropes, pipes.',
    fields: {path: ['path', 'Points the centre line passes through.', true], radius: ['radius', 'One radius, or one per path point for a taper. Default 0.1.'], caps: ['caps', 'Which ends are closed with a disc. Default "none".'], ...SURFACE, ...PLACEMENT}},
  blob: {summary: 'A soft volume of loosely turned marks: foliage, cloud, smoke, hair.',
    fields: {center: ['vec3', 'Centre. Default [0, 0, 0].'], radius: ['positive', 'Radius of a round volume.'], radii: ['size3', 'Radii [x, y, z]. Wins over "radius".'], fill: ['unit', 'How deep the marks sit inside the volume, 0 (a shell) to 1 (filled). Default 0.6.'], ...SURFACE, ...PLACEMENT}},
  splats: {summary: 'Marks written out one by one, for accents, lines and imported data.',
    fields: {splats: ['splats', 'The marks.', true], ...PLACEMENT}},
  // Unfinished: it works, but stays out of the schema, the tools and the hints until Atelier ships.
  painting: {hidden: true, summary: 'An Atelier painting spec (objects with paint layers): the richest way to describe surfaces. See harness/GUIDE.md.',
    fields: {spec: ['object', 'The painting spec, inline.'], file: ['string', 'Path to a spec.json, relative to the scene file.'], ...PLACEMENT}},
  splatFile: {summary: 'A trained Gaussian splat in the 32-byte .splat format, drawn as paint.',
    fields: {file: ['string', 'Path to the .splat file, relative to the scene file.', true], height: ['positive', 'Height the model is scaled to, in world units. Default 3.'], flipYZ: ['boolean', 'Flip Y and Z, as most captures need. Default true.'], ...PLACEMENT}},
};
/** The types a scene author is told about. A type marked `hidden` is still drawn, but nothing lists or suggests it. */
export const PUBLIC_CONTENT_TYPES = Object.fromEntries(Object.entries(CONTENT_TYPES).filter(([, type]) => !type.hidden));
export const CONTENT_TYPE_NAMES = Object.keys(PUBLIC_CONTENT_TYPES);
/** Names people reach for first, and the type that draws them. */
const SYNONYMS = {sphere: 'ellipsoid', ball: 'ellipsoid', dome: 'ellipsoid', ground: 'plane', floor: 'plane', wall: 'plane', quad: 'plane', rect: 'plane', rectangle: 'plane', cube: 'box', cuboid: 'box',
  circle: 'disc', disk: 'disc', column: 'cylinder', tower: 'cylinder', pillar: 'cylinder', frustum: 'cylinder', pyramid: 'cone', spire: 'cone', line: 'tube', curve: 'tube', capsule: 'tube', pipe: 'tube', cloud: 'blob', foliage: 'blob', volume: 'blob', points: 'splats', marks: 'splats', mark: 'splats', gaussians: 'splats', splat: 'splatFile', file: 'splatFile', atelier: 'painting'};

const TOP = {
  sillage: 'Format version. Always 1.', title: 'A short title.', description: 'One sentence on what the scene shows.',
  background: 'Colour behind all marks, "#rrggbb".', camera: 'Where the scene is seen from. Omit it to frame the content automatically.',
  style: 'Render options; see "sillage styles".', lighting: '"baked" (default) adds bounce light and shadow tint computed from the marks. "flat" shows colours exactly as written.',
  light: 'Direction toward the light, [x, y, z]. It shades colour ramps and casts the baked shadows.', atmosphere: 'Distance fog.',
  palette: 'Named colours, usable wherever a colour is expected.', seed: 'Whole number that fixes every random choice.', content: 'The things in the scene.',
};
const CAMERA = {position: ['vec3', 'Where the camera is.', true], target: ['vec3', 'The point it looks at.', true], fov: ['positive', 'Vertical field of view, degrees. Default 40.'], focalLength: ['positive', 'Lens in 35 mm-equivalent millimetres. Wins over "fov".']};
const ATMOSPHERE = {color: ['string', 'Fog colour, "#rrggbb".', true], horizonColor: ['string', 'Fog colour toward the horizon.'], start: ['number', 'Distance at which fog begins.'], density: ['positive', 'Fog build-up per world unit past "start". Try 0.01 to 0.05.'], max: ['unit', 'Most a mark can be fogged, 0 to 1.'], heightStart: ['number', 'Height above which mist thickens.'], heightDensity: ['number', 'Mist build-up per world unit above "heightStart".']};

function checkFields(value, table, path, errors) {
  if (!isObject(value)) { errors.push({path, message: `${path} must be an object.`}); return; }
  const names = Object.keys(table);
  for (const key of Object.keys(value)) {
    if (key === 'type') continue;
    if (!table[key]) errors.push({path: `${path}.${key}`, message: `Unknown field "${key}".`, hint: didYouMean(key, names, 'one of')});
  }
  for (const [key, [kind, , required]] of Object.entries(table)) {
    if (value[key] === undefined) { if (required) errors.push({path: `${path}.${key}`, message: `"${key}" is required.`, hint: table[key][1]}); continue; }
    const complaint = KINDS[kind].check(value[key]);
    if (complaint) errors.push({path: `${path}.${key}`, message: `"${key}" ${complaint}; got ${JSON.stringify(value[key])?.slice(0, 80)}.`, hint: table[key][1]});
  }
}
function checkColor(spec, palette, path, errors) {
  try { compileColor(spec, {palette}); } catch (error) { errors.push({path, message: error.message, hint: error.hint}); }
}
function checkStroke(stroke, path, errors) {
  if (!isObject(stroke)) { errors.push({path, message: '"stroke" must be an object.', hint: 'For example {"length": 0.3, "width": 0.12, "direction": "around"}.'}); return; }
  const allowed = Object.keys(KINDS.stroke.schema.properties);
  for (const [key, value] of Object.entries(stroke)) {
    const at = `${path}.${key}`;
    if (!allowed.includes(key)) errors.push({path: at, message: `Unknown stroke field "${key}".`, hint: didYouMean(key, allowed)});
    else if (key === 'direction') {
      if (!(vector(value, 3) && len(value) > 1e-9) && !['along', 'around', 'up', 'down', 'random'].includes(value)) errors.push({path: at, message: `"direction" cannot be ${JSON.stringify(value)}.`, hint: 'Use [x, y, z], "along", "around", "up", "down" or "random".'});
    } else if (!finite(value) || value < 0 || (['length', 'width', 'thickness'].includes(key) && value === 0)) errors.push({path: at, message: `"${key}" must be a positive number; got ${JSON.stringify(value)}.`});
  }
}
function checkRawSplats(list, palette, path, errors) {
  if (!Array.isArray(list) || !list.length) { errors.push({path, message: '"splats" must be a non-empty list of marks.', hint: KINDS.splats.schema.description}); return; }
  const allowed = ['at', 'normal', 'direction', 'size', 'center', 'axes', 'color', 'opacity', 'material'];
  for (const [i, splat] of list.entries()) {
    const at = `${path}[${i}]`;
    if (!isObject(splat)) { errors.push({path: at, message: 'Each mark must be an object.'}); continue; }
    for (const key of Object.keys(splat)) if (!allowed.includes(key)) errors.push({path: `${at}.${key}`, message: `Unknown mark field "${key}".`, hint: didYouMean(key, allowed)});
    const raw = splat.center !== undefined || splat.axes !== undefined;
    if (raw) {
      if (!vector(splat.center, 3)) errors.push({path: `${at}.center`, message: '"center" must be [x, y, z].'});
      if (!(Array.isArray(splat.axes) && splat.axes.length === 3 && splat.axes.every(axis => vector(axis, 3) && len(axis) > 0))) errors.push({path: `${at}.axes`, message: '"axes" must be three non-zero vectors [[x,y,z],[x,y,z],[x,y,z]]: the half-extents of the Gaussian.', hint: 'Or describe the mark with "at", "normal", "direction" and "size" instead.'});
    } else {
      if (!vector(splat.at, 3)) errors.push({path: `${at}.at`, message: 'A mark needs "at": [x, y, z] (or "center" and "axes" for a raw Gaussian).'});
      if (splat.size !== undefined && !((vector(splat.size, 2) || vector(splat.size, 3)) && splat.size.every(n => n > 0))) errors.push({path: `${at}.size`, message: '"size" must be [length, width] or [length, width, thickness], all above 0.'});
      for (const key of ['normal', 'direction']) if (splat[key] !== undefined && KINDS.direction.check(splat[key])) errors.push({path: `${at}.${key}`, message: `"${key}" ${KINDS.direction.check(splat[key])}.`});
    }
    if (splat.color !== undefined) { try { parseColor(splat.color, palette); } catch (error) { errors.push({path: `${at}.color`, message: error.message, hint: error.hint}); } }
    if (splat.opacity !== undefined && !(finite(splat.opacity) && splat.opacity > 0 && splat.opacity <= 1)) errors.push({path: `${at}.opacity`, message: '"opacity" must be above 0 and at most 1.'});
    if (splat.material !== undefined && KINDS.material.check(splat.material)) errors.push({path: `${at}.material`, message: `"material" ${KINDS.material.check(splat.material)}.`});
    if (errors.length > 40) return;
  }
}

/** Structural check of a scene document. Returns {errors, warnings}, each
 * entry {path, message, hint}. Nothing is thrown and nothing is built. */
export function validateScene(doc) {
  const errors = [], warnings = [];
  if (!isObject(doc)) return {errors: [{path: '', message: 'A scene must be a JSON object.', hint: 'Start from "sillage new scene.json".'}], warnings};
  for (const key of Object.keys(doc)) if (!TOP[key]) errors.push({path: key, message: `Unknown field "${key}".`, hint: didYouMean(key, Object.keys(TOP))});
  if (doc.sillage !== undefined && doc.sillage !== SCENE_VERSION) errors.push({path: 'sillage', message: `Unsupported format version ${JSON.stringify(doc.sillage)}.`, hint: `Use "sillage": ${SCENE_VERSION}.`});
  for (const key of ['title', 'description']) if (doc[key] !== undefined && typeof doc[key] !== 'string') errors.push({path: key, message: `"${key}" must be text.`});
  if (doc.seed !== undefined && !Number.isInteger(doc.seed)) errors.push({path: 'seed', message: '"seed" must be a whole number.'});
  if (doc.lighting !== undefined && !['baked', 'flat'].includes(doc.lighting)) errors.push({path: 'lighting', message: `"lighting" cannot be ${JSON.stringify(doc.lighting)}.`, hint: 'Use "baked" or "flat".'});
  if (doc.light !== undefined && KINDS.direction.check(doc.light)) errors.push({path: 'light', message: `"light" ${KINDS.direction.check(doc.light)}.`, hint: TOP.light});

  let palette = {};
  if (doc.palette !== undefined) {
    if (!isObject(doc.palette)) errors.push({path: 'palette', message: '"palette" must be an object of names and colours.', hint: 'For example {"skin": "#d9a66f"}.'});
    else for (const [name, colour] of Object.entries(doc.palette)) {
      try { parseColor(colour); palette[name] = colour; } catch (error) { errors.push({path: `palette.${name}`, message: error.message, hint: 'Palette entries are "#rrggbb" colours.'}); }
    }
  }
  if (doc.background !== undefined) { try { parseColor(doc.background, palette); } catch (error) { errors.push({path: 'background', message: error.message, hint: error.hint}); } }
  if (doc.camera !== undefined) {
    checkFields(doc.camera, CAMERA, 'camera', errors);
    if (vector(doc.camera?.position, 3) && vector(doc.camera?.target, 3) && len(sub(doc.camera.position, doc.camera.target)) < .01) errors.push({path: 'camera', message: 'The camera position and target are the same point.', hint: 'Move the position back from the target, for example 8 units along +Z.'});
    if (finite(doc.camera?.fov) && (doc.camera.fov < 5 || doc.camera.fov > 120)) errors.push({path: 'camera.fov', message: `"fov" is ${doc.camera.fov}, outside 5 to 120 degrees.`});
  }
  if (doc.atmosphere !== undefined) {
    checkFields(doc.atmosphere, ATMOSPHERE, 'atmosphere', errors);
    for (const key of ['color', 'horizonColor']) if (typeof doc.atmosphere?.[key] === 'string') { try { parseColor(doc.atmosphere[key], palette); } catch (error) { errors.push({path: `atmosphere.${key}`, message: error.message, hint: error.hint}); } }
  }
  if (doc.style !== undefined) for (const problem of styleProblems(doc.style)) errors.push({path: problem.key ? `style.${problem.key}` : 'style', message: problem.message, hint: problem.hint});

  if (!Array.isArray(doc.content) || !doc.content.length) errors.push({path: 'content', message: '"content" must be a non-empty list of items.', hint: `Each item has a "type": ${CONTENT_TYPE_NAMES.join(', ')}.`});
  else for (const [i, item] of doc.content.entries()) {
    const path = `content[${i}]`;
    if (!isObject(item)) { errors.push({path, message: 'Each content item must be an object.'}); continue; }
    const type = CONTENT_TYPES[item.type];
    if (!type) {
      const near = SYNONYMS[String(item.type).toLowerCase()];
      errors.push({path: `${path}.type`, message: item.type === undefined ? 'The item has no "type".' : `Unknown content type "${item.type}".`, hint: near ? `Use "${near}": ${CONTENT_TYPES[near].summary}` : didYouMean(String(item.type ?? ''), CONTENT_TYPE_NAMES)});
      continue;
    }
    checkFields(item, type.fields, path, errors);
    if (item.color !== undefined && type.fields.color) checkColor(item.color, palette, `${path}.color`, errors);
    if (item.stroke !== undefined && type.fields.stroke) checkStroke(item.stroke, `${path}.stroke`, errors);
    if (item.type === 'splats' && item.splats !== undefined) checkRawSplats(item.splats, palette, `${path}.splats`, errors);
    if (item.type === 'tube' && Array.isArray(item.radius) && Array.isArray(item.path) && item.radius.length !== item.path.length) errors.push({path: `${path}.radius`, message: `"radius" lists ${item.radius.length} values for ${item.path.length} path points.`, hint: 'Give one radius per path point, or a single number.'});
    if (item.type === 'painting') {
      if ((item.spec === undefined) === (item.file === undefined)) errors.push({path, message: 'A painting needs exactly one of "spec" (inline) or "file".'});
      else if (isObject(item.spec)) for (const message of validateSpec(item.spec).errors) errors.push({path: `${path}.spec`, message, hint: 'The painting spec format is described in harness/GUIDE.md ("sillage atelier guide").'});
    }
    if (errors.length > 60) { errors.push({path, message: 'Too many problems; the rest are not listed.'}); break; }
  }
  return {errors, warnings};
}

function invalid(errors) {
  const shown = errors.slice(0, 8).map(error => `${error.path ? error.path + ': ' : ''}${error.message}`).join(' ');
  return new SillageError('INVALID_SCENE', `The scene has ${errors.length} problem${errors.length > 1 ? 's' : ''}. ${shown}`, {hint: errors.find(error => error.hint)?.hint ?? null, details: errors});
}

/** Paths of the files a document refers to, in order. */
export function sceneFiles(doc) {
  return (Array.isArray(doc?.content) ? doc.content : []).filter(item => isObject(item) && ['painting', 'splatFile'].includes(item.type) && typeof item.file === 'string').map(item => item.file);
}
function fileBytes(files, path) {
  const data = files?.[path];
  if (data === undefined) throw new SillageError('MISSING_FILE', `The scene refers to "${path}", which was not provided.`, {hint: 'Paths are relative to the scene file. From the API, pass {files: {[path]: ArrayBuffer | text}}.'});
  // A Node Buffer or any typed array stands in for its bytes.
  return ArrayBuffer.isView(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data;
}

/** Count, bounds, materials and typical mark size of a list of splats. */
export function splatStats(splats) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], materials = {};
  let length = 0, opacity = 0;
  for (const splat of splats) {
    const reach = Math.max(...splat.axes.map(len));
    for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], splat.center[c] - reach); max[c] = Math.max(max[c], splat.center[c] + reach); }
    const material = splat.material ?? 'stone';
    materials[material] = (materials[material] ?? 0) + 1;
    length += reach * ALONG; opacity += splat.opacity;
  }
  const round = v => Math.round(v * 1000) / 1000, count = splats.length;
  if (!count) return {splats: 0, bounds: null, center: null, radius: 0, materials, meanMarkLength: 0, meanOpacity: 0};
  const center = min.map((v, c) => (v + max[c]) / 2);
  return {splats: count, bounds: {min: min.map(round), max: max.map(round)}, center: center.map(round), radius: round(len(sub(max, min)) / 2), materials, meanMarkLength: round(length / count), meanOpacity: round(opacity / count)};
}

/** A camera that frames a bounding sphere: yaw and pitch in degrees around it. */
export function frameCamera({center, radius}, {fov = 35, yaw = 24, pitch = 14, fill = .92} = {}) {
  const a = yaw * Math.PI / 180, e = pitch * Math.PI / 180, distance = Math.max(.5, radius) / Math.sin(fov * Math.PI / 360) / fill;
  const round = v => Math.round(v * 1000) / 1000;
  return {position: add(center, mul([Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)], distance)).map(round), target: center.map(round), fov};
}

/** Where an item's bounding box lands in the picture: {box: [x0, y0, x1, y1]
 * in 0..1 from the top-left, clipped to the frame, share: how much of the
 * frame it spans}, or {box: null, where} when none of it is in view. */
export function itemFrame(bounds, camera, aspect = 1.6) {
  const forward = unit(sub(camera.target, camera.position)), right = unit(cross3(forward, Math.abs(forward[1]) > .999 ? [0, 0, -1] : [0, 1, 0])), up = cross3(right, forward);
  const fov = camera.fov ?? 2 * Math.atan(12 / camera.focalLength) * 180 / Math.PI, tan = Math.tan(fov * Math.PI / 360);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ahead = 0;
  for (let corner = 0; corner < 8; corner++) {
    const p = [0, 1, 2].map(c => corner >> c & 1 ? bounds.max[c] : bounds.min[c]), to = sub(p, camera.position), depth = to[0] * forward[0] + to[1] * forward[1] + to[2] * forward[2];
    if (depth <= 1e-3) continue;
    ahead++;
    const x = .5 + (to[0] * right[0] + to[1] * right[1] + to[2] * right[2]) / (depth * tan * aspect) / 2, y = .5 - (to[0] * up[0] + to[1] * up[1] + to[2] * up[2]) / (depth * tan) / 2;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  if (!ahead) return {box: null, where: 'behind the camera'};
  // A box that straddles the camera plane reaches the frame edge on that side.
  if (ahead < 8) { x0 = Math.min(x0, 0); x1 = Math.max(x1, 1); y1 = Math.max(y1, 1); }
  if (x1 < 0 || x0 > 1 || y1 < 0 || y0 > 1) return {box: null, where: x1 < 0 ? 'off the left' : x0 > 1 ? 'off the right' : y1 < 0 ? 'above the frame' : 'below the frame'};
  const clip = v => Math.round(Math.max(0, Math.min(1, v)) * 100) / 100, box = [clip(x0), clip(y0), clip(x1), clip(y1)];
  return {box, share: Math.round((box[2] - box[0]) * (box[3] - box[1]) * 100) / 100};
}

/** Build a document into splats. Throws INVALID_SCENE with every problem.
 * `files` maps each referenced path to its contents (ArrayBuffer or text). */
export function compileScene(doc, {files = {}, aspect = 1.6} = {}) {
  const {errors} = validateScene(doc);
  if (errors.length) throw invalid(errors);
  const palette = doc.palette ?? {}, light = doc.light ?? DEFAULT_LIGHT, splats = [], items = [], warnings = [];
  for (const [index, item] of doc.content.entries()) {
    // Each item draws from its own seed, so editing one leaves the others unchanged.
    const brush = createBrush({seed: (doc.seed ?? 1) * 7919 + index * 104729 + 1, palette, light}), first = splats.length;
    const {type, id, position, rotation, scale, unlit, ...shape} = item;
    let made, flat = unlit === true;
    try {
      if (type === 'splats') {
        for (const splat of item.splats) {
          if (splat.center) brush.splats.push({center: [...splat.center], axes: splat.axes.map(axis => [...axis]), color: parseColor(splat.color ?? '#808080', palette), opacity: splat.opacity ?? .95, seed: brush.random(), material: splat.material ?? 'stone'});
          else brush.mark({...splat, color: splat.color ?? '#808080'});
        }
        made = brush.splats;
      } else if (type === 'painting') {
        let spec = item.spec ?? fileBytes(files, item.file);
        if (typeof spec === 'string') spec = JSON.parse(spec);
        else if (spec instanceof ArrayBuffer) spec = JSON.parse(new TextDecoder().decode(spec));
        const problems = validateSpec(spec).errors;
        if (problems.length) throw new SillageError('INVALID_SCENE', `The painting spec is invalid: ${problems.slice(0, 5).join(' ')}`, {hint: 'See "sillage atelier guide" for the painting spec format.'});
        made = buildPainting(spec).splats; flat = true;
      } else if (type === 'splatFile') {
        const bytes = fileBytes(files, item.file);
        made = decodeNativeSplat(bytes, {height: item.height ?? 3, flipYZ: item.flipYZ ?? true}); flat = true;
      } else {
        brush[type](shape);
        made = brush.splats;
      }
    } catch (error) {
      if (error instanceof SillageError && error.code !== 'INVALID_COLOR') throw error;
      throw new SillageError('INVALID_SCENE', `content[${index}]${id ? ` ("${id}")` : ''}: ${error.message}`, {hint: error.hint ?? null});
    }
    if (position || rotation || scale !== undefined) {
      // A form turns about its own middle; imported marks about their own origin.
      const pivot = item.center ?? (item.path ? mul(item.path.reduce(add, [0, 0, 0]), 1 / item.path.length)
        : type === 'cylinder' || type === 'cone' ? add(item.base ?? [0, 0, 0], mul(unit(item.axis ?? [0, 1, 0]), (item.height ?? 1) / 2)) : [0, 0, 0]);
      transformSplats(made, {position, rotation, scale, pivot});
    }
    for (const splat of made) splats.push(splat);
    for (const note of new Set(brush.notes)) warnings.push(`content[${index}]${id ? ` ("${id}")` : ''}: ${note}`);
    const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
    for (const splat of made) for (let c = 0; c < 3; c++) { if (splat.center[c] < low[c]) low[c] = splat.center[c]; if (splat.center[c] > high[c]) high[c] = splat.center[c]; }
    items.push({index, id: id ?? null, type, first, splats: made.length, flat, bounds: made.length ? {min: low, max: high} : null});
    if (splats.length > MAX_SPLATS) throw new SillageError('TOO_MANY_SPLATS', `The scene passed ${MAX_SPLATS} marks at content[${index}].`, {hint: 'Lower "count", or use larger strokes: coverage comes from mark size, not number.'});
  }
  for (const [i, splat] of splats.entries()) {
    if (![...splat.center, ...splat.axes.flat(), ...splat.color, splat.opacity].every(Number.isFinite)) throw new SillageError('INVALID_SCENE', `Mark ${i} is not finite: check for zero sizes, zero-length directions or coincident path points.`);
  }
  if (splats.length > WARN_SPLATS) warnings.push(`${splats.length} marks: expect slow frames. Under ${WARN_SPLATS} is comfortable.`);
  const stats = splatStats(splats), camera = doc.camera ? {fov: 40, ...doc.camera} : frameCamera(stats);
  if (camera.focalLength) delete camera.fov;
  if (doc.camera) {
    // Angular size of the content from the camera, against the field of view.
    const toCentre = sub(stats.center, camera.position), distance = len(toCentre), forward = unit(sub(camera.target, camera.position));
    const fov = camera.fov ?? 2 * Math.atan(12 / camera.focalLength) * 180 / Math.PI;
    const offAxis = Math.acos(Math.max(-1, Math.min(1, toCentre[0] * forward[0] / distance + toCentre[1] * forward[1] / distance + toCentre[2] * forward[2] / distance))) * 180 / Math.PI;
    const angular = distance > stats.radius ? Math.asin(stats.radius / distance) * 180 / Math.PI : 90;
    if (offAxis - angular > fov * .9) warnings.push('The camera does not look at the content: nothing may be in frame. Omit "camera" to frame it automatically, or point "target" near ' + JSON.stringify(stats.center) + '.');
    else if (angular < fov * .06) warnings.push(`The content fills under a tenth of the frame from this camera. Move it closer than ${Math.round(distance)} units or narrow "fov".`);
    // Inside a closed form the picture is its inner surface.
    for (const item of items) {
      if (!item.bounds || !['ellipsoid', 'box', 'cylinder', 'cone', 'blob'].includes(item.type)) continue;
      const inside = camera.position.every((v, c) => { const margin = (item.bounds.max[c] - item.bounds.min[c]) * .12; return v > item.bounds.min[c] + margin && v < item.bounds.max[c] - margin; });
      if (inside) warnings.push(`The camera is inside ${item.id ? `"${item.id}"` : `content[${item.index}]`}. Move it out, or omit "camera" to frame the scene automatically.`);
    }
  }
  const round = v => Math.round(v * 1000) / 1000;
  for (const item of items) {
    item.frame = item.bounds ? itemFrame(item.bounds, camera, aspect) : null;
    if (item.bounds) item.bounds = {min: item.bounds.min.map(round), max: item.bounds.max.map(round)};
  }
  if (doc.camera && items.length > 1) {
    const missed = items.filter(item => item.frame && item.frame.box === null);
    if (missed.length && missed.length < items.length) warnings.push(`Out of frame from this camera: ${missed.map(item => `${item.id ? `"${item.id}"` : `content[${item.index}]`} (${item.frame.where})`).join(', ')}.`);
  }
  return {splats, items, stats, camera, light, background: doc.background ? '#' + parseColor(doc.background, palette).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('') : '#8fb7cf', warnings};
}

/** Bounce light and shadow for compiled splats. "flat", and items that carry
 * their own finished colour (paintings, trained splats), stay neutral. */
export function sceneLighting(compiled, mode = 'baked') {
  const count = compiled.splats.length;
  if (mode === 'flat' || compiled.items.every(item => item.flat)) return {irradiance: new Float32Array(count * 3), shadow: new Float32Array(count), stats: {patchCount: 0, bakeMs: 0}};
  const lighting = bakeIrradiance(compiled.splats, {sunDirection: compiled.light});
  for (const item of compiled.items) if (item.flat) {
    lighting.irradiance.fill(0, item.first * 3, (item.first + item.splats) * 3);
    lighting.shadow.fill(0, item.first, item.first + item.splats);
  }
  return lighting;
}

/** Render options a document starts from: the engine defaults without the
 * sky effects, which belong to authored landscapes. */
export const DOCUMENT_STYLE = {sun: false, lensDirt: false, lensFlare: false};

/** An engine scene definition for a document: what `GaussianBrushRenderer`
 * loads. The document is compiled once, here, so problems surface early. */
export function sceneDefinition(doc, {files = {}, aspect = 1.6} = {}) {
  const compiled = compileScene(doc, {files, aspect}), flat = doc.lighting === 'flat' || compiled.items.every(item => item.flat);
  const distance = len(sub(compiled.camera.position, compiled.camera.target));
  return {
    id: 'document', label: doc.title ?? 'Scene', title: doc.title ?? 'Scene', description: doc.description ?? '', document: true,
    camera: compiled.camera, initialStyle: {...DOCUMENT_STYLE, ...(flat ? {indirect: false, tintedShadows: false} : {}), ...(doc.style ?? {})},
    report: {items: compiled.items.map(({flat: _, first: __, ...item}) => item), stats: compiled.stats, warnings: compiled.warnings},
    create() {
      const atmosphere = doc.atmosphere ? {max: .9, start: 0, ...doc.atmosphere} : undefined;
      return {splats: compiled.splats, background: compiled.background, atmosphere, lighting: sceneLighting(compiled, doc.lighting ?? 'baked'),
        orbitLimit: Math.max(distance * 4, compiled.stats.radius * 6), orbitMin: Math.max(.05, distance * .05)};
    },
  };
}

/** Validate, build and measure a document without rendering it. */
export function inspectScene(doc, {files = {}, aspect = 1.6} = {}) {
  const {errors} = validateScene(doc);
  if (errors.length) return {valid: false, errors, warnings: []};
  try {
    const compiled = compileScene(doc, {files, aspect});
    return {valid: true, errors: [], warnings: compiled.warnings, title: doc.title ?? null, ...compiled.stats, camera: compiled.camera, cameraIsAutomatic: !doc.camera,
      items: compiled.items.map(({flat: _, first: __, ...item}) => item), background: compiled.background, lighting: doc.lighting ?? 'baked'};
  } catch (error) {
    if (!(error instanceof SillageError)) throw error;
    return {valid: false, errors: error.details ?? [{path: '', message: error.message, hint: error.hint}], warnings: []};
  }
}

const fieldSchema = table => ({
  type: 'object', additionalProperties: false,
  properties: Object.fromEntries(Object.entries(table).map(([key, [kind, description]]) => [key, {...KINDS[kind].schema, description: KINDS[kind].schema.description ? `${description} ${KINDS[kind].schema.description}` : description}])),
  required: Object.entries(table).filter(([, [, , required]]) => required).map(([key]) => key),
});

/** JSON Schema (draft-07) of a scene document. */
export function sceneSchema() {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#', title: 'Sillage scene', type: 'object', additionalProperties: false, required: ['content'],
    properties: {
      sillage: {const: SCENE_VERSION, description: TOP.sillage}, title: {type: 'string', description: TOP.title}, description: {type: 'string', description: TOP.description},
      background: {type: 'string', description: TOP.background}, camera: {...fieldSchema(CAMERA), description: TOP.camera}, style: {...styleSchema(), description: TOP.style},
      lighting: {enum: ['baked', 'flat'], default: 'baked', description: TOP.lighting}, light: {...KINDS.direction.schema, default: DEFAULT_LIGHT, description: TOP.light},
      atmosphere: {...fieldSchema(ATMOSPHERE), description: TOP.atmosphere}, palette: {type: 'object', additionalProperties: {type: 'string'}, description: TOP.palette},
      seed: {type: 'integer', default: 1, description: TOP.seed},
      content: {type: 'array', minItems: 1, description: TOP.content, items: {oneOf: Object.entries(PUBLIC_CONTENT_TYPES).map(([type, {summary, fields}]) => {
        const schema = fieldSchema(fields);
        return {...schema, description: summary, properties: {type: {const: type}, ...schema.properties}, required: ['type', ...schema.required]};
      })}},
    },
  };
}

/** Starting points for a new scene file. */
export const TEMPLATES = {
  'still-life': {
    sillage: 1, title: 'Pear and plum on a cloth', description: 'Two fruit and a small box on a table, against a blue wall.', background: '#5b7896',
    palette: {wall: '#5f7fa8', wallDark: '#46607f', cloth: '#d8cdb6', clothShade: '#a99a84'},
    camera: {position: [1.6, 2.6, 7.2], target: [0, .85, 0], fov: 32}, light: [-.7, 1.1, .8],
    style: {mode: 'gouache', softness: .15, gouacheTone: 0},
    content: [
      {id: 'wall', type: 'plane', center: [0, 2.2, -2], size: [9, 5], normal: [0, 0, 1], color: ['wallDark', 'wall', '#7391b8'], stroke: {length: .7, width: .28, direction: 'up', spread: 8}},
      {id: 'table', type: 'plane', center: [0, 0, .4], size: [9, 5], color: ['clothShade', 'cloth', '#ebe2cf'], stroke: {length: .6, width: .24, direction: [1, 0, .25], spread: 10}},
      {id: 'pear-body', type: 'ellipsoid', center: [-.55, .62, .3], radii: [.55, .62, .55], color: ['#5f5a23', '#8f8a2f', '#bdb646', '#dcd876'], stroke: {direction: 'around'}},
      {id: 'pear-neck', type: 'ellipsoid', center: [-.55, 1.2, .3], radii: [.3, .42, .3], color: ['#6b6628', '#a39c38', '#cdc75a', '#e2de86'], stroke: {direction: 'around'}},
      {id: 'pear-stem', type: 'tube', path: [[-.55, 1.58, .3], [-.5, 1.78, .3], [-.42, 1.88, .32]], radius: [.03, .025, .02], color: '#4a3524'},
      {id: 'plum', type: 'ellipsoid', center: [.62, .4, .75], radius: .4, color: ['#2a1633', '#4d2456', '#7a3a7c', '#a8689f'], stroke: {direction: 'around'}},
      {id: 'box', type: 'box', center: [1.5, .3, -.5], size: [.9, .6, .7], rotation: [0, 24, 0], color: ['#6e3b22', '#a35b34', '#c98753'], stroke: {direction: 'along'}},
    ],
  },
  tree: {
    sillage: 1, title: 'A tree on a rise', description: 'One broad tree on a grassy rise under a pale sky.', background: '#bcd3dc', seed: 4,
    camera: {position: [5.5, 3.4, 13.5], target: [-.2, 2.9, 0], fov: 36},
    atmosphere: {color: '#cfdfe4', start: 12, density: .03, max: .7},
    content: [
      {id: 'rise', type: 'ellipsoid', center: [0, -2.4, 0], radii: [11, 2.5, 11], count: 6000, color: ['#3e703c', '#4e873d', '#609c42', '#8cbb64', '#aed18b'], stroke: {direction: [1, .1, .3], spread: 14}, material: 'grass'},
      {id: 'trunk', type: 'tube', path: [[0, 0, 0], [.08, 1.3, .05], [-.1, 2.5, 0], [.15, 3.4, .1]], radius: [.34, .26, .2, .12], color: ['#302f27', '#5b5541', '#918970'], material: 'wood'},
      {id: 'branch', type: 'tube', path: [[-.05, 2.3, 0], [-.9, 3.1, .2], [-1.5, 3.5, .3]], radius: [.14, .09, .05], color: ['#302f27', '#5b5541', '#918970'], material: 'wood'},
      {id: 'crown', type: 'blob', center: [0, 4.4, 0], radii: [2.6, 1.7, 2.3], count: 3200, color: ['#1d301f', '#273e24', '#406333', '#6b9648', '#94b963', '#c0d88c'], stroke: {length: .42, width: .2}},
      {id: 'crown-left', type: 'blob', center: [-1.9, 3.8, .4], radii: [1.3, 1, 1.2], count: 1100, color: ['#1d301f', '#324e2a', '#527d3c', '#94b963'], stroke: {length: .38, width: .18}},
    ],
  },
  minimal: {
    sillage: 1, title: 'One sphere', background: '#2b3140',
    content: [{type: 'ellipsoid', center: [0, 1, 0], radius: 1, color: ['#5a2d1c', '#a4532c', '#e39a5a', '#f6d39a']}],
  },
};
export const TEMPLATE_NAMES = Object.keys(TEMPLATES);
export function starterScene(name = 'still-life') {
  if (!TEMPLATES[name]) throw new SillageError('UNKNOWN_TEMPLATE', `No template named "${name}".`, {hint: didYouMean(name, TEMPLATE_NAMES)});
  return structuredClone(TEMPLATES[name]);
}

/** Is this a scene document (as opposed to a built-in scene id)? */
export const isSceneDocument = value => isObject(value) && Array.isArray(value.content);
export {STYLE_OPTIONS, ACROSS, ALONG};
