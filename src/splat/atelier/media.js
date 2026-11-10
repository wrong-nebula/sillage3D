/** Media the splat renderer can paint convincingly. Each is one brush-mark
 * shader plus defaults for how paint is loaded and layered. A reference in
 * any other style is translated to the nearest of these. */

const NEUTRAL = {quality: 'studio', mode: 'ghibli', brushScale: 1, coverage: 1, indirect: false, tintedShadows: false,
  sun: false, lensDirt: false, lensFlare: false, painterlyVignette: false, foregroundDOF: false};

export const MEDIA = {
  oil: {
    label: 'Oil, alla prima',
    mark: 'A loaded flat brush: squared heel, crisp parallel sides, bristle tracks, a tail that runs dry only when thin.',
    use: 'Opaque lay-in strokes at opacity ~.98, then thin wet drags at .1-.3 that blend into soft gradients, then a few loaded accents. Edges are found with stroke ends, lost with thin drags.',
    style: {...NEUTRAL, oil: true, softness: .15, gouacheTexture: .35, gouacheBlend: .45, gouacheTone: 0},
    opacity: .98, maxOpacity: .995,
  },
  gouache: {
    label: 'Gouache / poster colour',
    mark: 'A matte, opaque dab with a broken dry edge, fine pigment grain and a translucent underpainting halo.',
    use: 'Flat opaque shapes built from overlapping dabs at .9-.98, lighter scumbles at .3-.6 on top. Shapes read as cut paper with soft broken edges.',
    style: {...NEUTRAL, softness: .2, gouacheTexture: .55, gouacheBlend: .6, gouacheTone: 0},
    opacity: .95, maxOpacity: .995,
  },
  watercolor: {
    label: 'Watercolour / ink wash',
    mark: 'A transparent wash: flat inside, a wandering edge where pigment pools as it dries, granulation in the paper.',
    use: 'Set the background to the paper colour and leave it showing for lights. Large pale washes at .15-.35 first, darker glazes at .3-.55 over them, never opaque. Raise softness for wet-in-wet.',
    style: {...NEUTRAL, watercolor: true, softness: .35, gouacheTexture: .8, gouacheBlend: .3, gouacheTone: 0},
    opacity: .4, maxOpacity: .8,
  },
  pastel: {
    label: 'Soft pastel / chalk',
    mark: 'The gouache dab at full grain with soft edges: dry pigment dragged over toothed paper.',
    use: 'Many short directional strokes at .5-.85 over a toned ground; let the ground show between them. Blend little.',
    style: {...NEUTRAL, softness: .5, gouacheTexture: 1, gouacheBlend: .15, gouacheTone: 0},
    opacity: .7, maxOpacity: .9,
  },
};

const STYLE_KEYS = {brushScale: 'brushScale', softness: 'softness', texture: 'gouacheTexture', blend: 'gouacheBlend', tone: 'gouacheTone', coverage: 'coverage'};

/** Renderer options for a spec: the medium preset plus bounded overrides. */
export function rendererStyle(spec) {
  const medium = MEDIA[spec.medium];
  if (!medium) throw new Error(`Unknown medium "${spec.medium}". Use one of: ${Object.keys(MEDIA).join(', ')}`);
  const style = {...medium.style};
  for (const [key, value] of Object.entries(spec.style ?? {})) {
    if (!STYLE_KEYS[key]) throw new Error(`Unknown style key "${key}". Use: ${Object.keys(STYLE_KEYS).join(', ')}`);
    if (!Number.isFinite(value)) throw new Error(`style.${key} must be a number`);
    style[STYLE_KEYS[key]] = key === 'brushScale' || key === 'coverage' ? Math.max(.25, Math.min(3, value)) : Math.max(0, Math.min(1, value));
  }
  return style;
}
