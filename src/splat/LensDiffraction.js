// Circular-pupil Fraunhofer PSF, I(r) = [2 J1(pi r) / (pi r)]^2.
// Merge the diffraction wings into one annulus for a coarse five-tap RGB kernel.
// https://www.telescope-optics.net/diffraction.htm
export const GOGGLE_F_NUMBER = 128;
export const FOREGROUND_F_NUMBER = 2;

function besselJ1(x) {
  let sum = 0;
  const steps = 96;
  for (let i = 0; i < steps; i++) {
    const angle = Math.PI * (i + .5) / steps;
    sum += Math.cos(angle - x * Math.sin(angle));
  }
  return sum / steps;
}

export function diffractionWeights() {
  const rings = [[0, .5, 1], [.5, 2.4, 4]];
  const wavelengths = [650, 550, 460];
  const weights = rings.map(() => [0, 0, 0]);
  for (let channel = 0; channel < 3; channel++) {
    const ratio = 550 / wavelengths[channel];
    for (let ring = 0; ring < rings.length; ring++) {
      const [lo, hi] = rings[ring], step = (hi - lo) / 192;
      for (let i = 0; i < 192; i++) {
        const radius = lo + (i + .5) * step, argument = Math.PI * radius * ratio;
        const amplitude = 2 * besselJ1(argument) / argument;
        weights[ring][channel] += amplitude * amplitude * radius * step * ratio * ratio;
      }
    }
    const total = weights.reduce((sum, ring) => sum + ring[channel], 0);
    for (let ring = 0; ring < rings.length; ring++) weights[ring][channel] /= total * rings[ring][2];
  }
  return weights;
}

export const DIFFRACTION_GLSL = /* glsl */`
uniform bool lensDiffraction;
uniform vec2 lensTexel;
uniform float lensAiryScale;
uniform float lensBlurStrength;
uniform float lensFringeStrength;
uniform vec3 lensPSF[2];
uniform bool lensParticleMaskEnabled;
uniform sampler2D lensParticleMask;

vec3 diffractedColor(vec2 uv, vec3 center) {
  vec2 position = (uv - .5) * vec2(aspect, 1.);
  float edge = smoothstep(.20, .62, length(position));
  if (!lensDiffraction || edge <= 0.) return center;
  float blurEdge=edge;
  if(lensParticleMaskEnabled)blurEdge*=1.-texture2D(lensParticleMask,uv).r;
  // Field-angle weighting is an artistic goggle treatment. The spectral
  // weights and wavelength-scaled Airy radius come from the circular pupil.
  vec2 delta = lensTexel * lensAiryScale * mix(.85, 1.85, edge);
  vec3 filtered = center * lensPSF[0];
  vec2 radial=normalize(position),tangent=vec2(-radial.y,radial.x);
  vec3 outward=toLinear(texture2D(source,uv+delta*.95*radial).rgb);
  vec3 inward=toLinear(texture2D(source,uv-delta*.95*radial).rgb);
  vec3 sideA=toLinear(texture2D(source,uv+delta*1.15*tangent).rgb);
  vec3 sideB=toLinear(texture2D(source,uv-delta*1.15*tangent).rgb);
  filtered+=(outward+inward+sideA+sideB)*lensPSF[1];
  // Lateral chromatic aberration reuses the same radial samples.
  vec3 blurred=mix(center,filtered,blurEdge*lensBlurStrength);
  vec3 fringe=vec3(outward.r,blurred.g,inward.b);
  float fringeEdge=smoothstep(.30,.72,length(position));
  return mix(blurred,fringe,fringeEdge*lensFringeStrength);
}
`;

/** Keep the original underwater optics as the default. The dedicated optics
 * study can compare diffraction and lateral chromatic aberration separately. */
export function lensOpticsSettings(options={},diffraction=false){
  const bounded=(value,fallback,min,max)=>Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
  return {enabled:diffraction||options.chromaticAberration===true,
    blur:diffraction?bounded(options.diffractionStrength,1,0,1):0,
    fringe:options.chromaticAberration===false?0:bounded(options.fringeStrength,.48,0,1),
    scale:bounded(options.diffractionScale,1,.25,3)};
}
