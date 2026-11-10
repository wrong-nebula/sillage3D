// Normalized 2D convolution from Mip-Splatting, equation 6:
// https://arxiv.org/abs/2311.16493 . This is the screen filter only, not the
// training-camera-dependent 3D smoothing stage of that paper.
//
// Every projected mark is widened by .3 px^2 so it cannot fall between
// pixels. Unfiltered, a mark much smaller than a pixel is therefore drawn as
// a full-strength dab about a pixel wide. The filter weights the widened mark
// by the share of its footprint the real mark occupies.
export const PIXEL_FILTER_HOOK='  // GAUSSIAN_PIXEL_FILTER: opt-in normalized screen-space convolution.';
/** Soft Gaussians are linear in opacity, so the weight scales opacity.
 * Painted and gouache kernels saturate (a loaded brush stays opaque at a
 * third of its opacity), so there the weight scales the finished alpha,
 * through the coverage factor every kernel already multiplies in. The tight
 * quad bounds and the occlusion capture read the same factor. */
export const pixelFilterVertexGLSL=mode=>`  if(!sky&&!groundFog&&!glint)${mode==='gaussian'?'opacity':'defocusCoverage'}*=gaussianFilterScale(xx,xy,yy);`;
export const GAUSSIAN_FILTER_GLSL=`
float gaussianFilterScale(float xx,float xy,float yy){
  // xx/yy already contain the legacy .3 pixel^2 dilation. Include the
  // existing defocus covariance, so large blurred marks keep their coverage.
  float rawDet=max(0.,(xx-.3)*(yy-.3)-xy*xy);
  return sqrt(clamp(rawDet/max(xx*yy-xy*xy,1e-12),0.,1.));
}
`;

/** CPU reference for numerical/energy tests; covariance excludes the filter. */
export function gaussianFilterScale([xx,xy,yy],variance=.3){
  if(![xx,xy,yy,variance].every(Number.isFinite)||xx<0||yy<0||variance<0)throw new RangeError('Invalid filter covariance.');
  const determinant=Math.max(0,xx*yy-xy*xy);
  return Math.sqrt(Math.min(1,determinant/Math.max((xx+variance)*(yy+variance)-xy*xy,1e-12)));
}
