/** Reconstruct the original fixed three-sigma, uniform-mode shader path.
 * Keep unrelated scene/water features from the loaded shader so concurrent
 * work cannot be mistaken for a regression in these optimizations.
 */
export function referenceShaders(current){
  const restoreMode=shader=>shader.replace(/const float (ghibli|painted)=[01]\.;/g,'uniform float $1;');
  const vertex=restoreMode(current.vertexShader);
  const vertexShader=vertex.replace(/  \/\/ Bound only fragments[\s\S]*?  localCoord=position\.xy\*support;/,'  localCoord=position.xy*3.;');
  if(vertexShader===vertex&&!vertex.includes('localCoord=position.xy*3.;'))throw new Error('Could not reconstruct the original fixed splat support.');
  return {vertexShader,fragmentShader:restoreMode(current.fragmentShader)};
}
