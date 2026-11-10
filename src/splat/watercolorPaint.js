/** Watercolour variant of the gouache mark, enabled with the `watercolor`
 * style option in gouache mode. A wash is transparent and flat inside, with a
 * wandering edge where pigment pools as it dries and granulation in the
 * paper's hollows. It never turns opaque, so the paper colour (the scene
 * background) and earlier washes show through.
 * Requires paintNoise and paintGrainNoise from GHIBLI_FRAGMENT_GLSL. Fine grain
 * runs at a frequency beyond the tabulated noise window, so it uses the
 * procedural field and does not repeat.
 */
export const WATERCOLOR_FRAGMENT_GLSL = `
vec4 watercolorMark(vec2 q,vec3 surface,vec3 pigment,float alpha,float markSeed,float edgeSoftness,vec3 settings){
  // The paper's tooth is shared in world space, so overlapping washes
  // granulate in the same hollows instead of each carrying its own noise.
  vec2 paper=vec2(surface.x+surface.z*.731,surface.y+surface.z*.417);
  vec2 grainUV=paper*61.;
  float grainFade=1.-smoothstep(.35,1.5,length(fwidth(grainUV)));
  float grain=0.;
  if(grainFade>0.)grain=(paintGrainNoise(grainUV)-.5)*grainFade;
  // Each wash wanders on its own: a slow bloom and a finer broken edge.
  float bloom=paintNoise(q*1.3+markSeed*47.)-.5;
  float fine=paintNoise(q*4.1+markSeed*13.)-.5;
  float wet=clamp(edgeSoftness,0.,1.);
  float edge=length(q*vec2(1.,1.+.1*sin(markSeed*19.)))+.4*bloom+.11*fine*(1.-wet);
  float feather=.04+.55*wet;
  float body=1.-smoothstep(1.5-feather,1.62+feather,edge);
  // Pigment is carried to the drying edge; wet-in-wet washes have no rim.
  float rim=smoothstep(1.02-feather,1.48-feather,edge)*body*(1.-wet);
  float density=clamp(alpha,0.,1.)*(1.+settings.x*(.7*rim-.9*grain));
  float markAlpha=(1.-exp(-1.9*density))*body;
  vec3 color=pigment*(1.-.12*settings.x*rim);
  return vec4(clamp(color,0.,1.),clamp(markAlpha,0.,.9));
}
`;
