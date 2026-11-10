/** Oil variant of the gouache mark, enabled with the `oil` style option in
 * gouache mode. It reuses the gouache post pass for wet blending, but drops
 * the paper grain and the broken dry edge for a loaded flat brush.
 * Requires paintNoise from GHIBLI_FRAGMENT_GLSL.
 */
export const OIL_FRAGMENT_GLSL = `
// brush.x runs along the stroke and brush.y across it, both in standard
// deviations of the splat's own axes, so marks stay attached under orbit.
// The flat brush lands with a squared heel and crisp parallel sides; its tail
// runs dry bristle by bristle when the paint is thin, which also softens its
// edges as wet paint does.
vec4 oilMark(vec2 brush,vec3 pigment,float alpha,float markSeed,float edgeSoftness,vec3 settings){
  float along=brush.x,across=brush.y;
  float fibreUV=across*11.+markSeed*53.;
  float fibre=mix(.5,paintNoise(vec2(fibreUV,along*.45+markSeed*7.)),1.-smoothstep(.45,1.6,fwidth(fibreUV)));
  float fine=mix(.5,paintNoise(vec2(fibreUV*2.6,along*.8)),1.-smoothstep(.45,1.6,fwidth(fibreUV*2.6)));
  float soft=.035+.22*edgeSoftness+.45*(1.-clamp(alpha,0.,1.));
  float sides=1.-smoothstep(1.5-soft,1.5+soft,abs(across)+.04*sin(along*1.7+markSeed*31.));
  float heel=1.-smoothstep(1.5-soft,1.62+soft,-along+.1*across*across);
  // Only thin paint runs dry; a loaded brush lays an even, unbroken tail.
  float loaded=smoothstep(.75,.97,alpha);
  float reach=mix(1.25+.55*fibre+.2*fine,1.55+.12*fibre,loaded);
  float tail=1.-smoothstep(reach-.3-soft,reach+.1+soft,along);
  float dry=smoothstep(.1,1.5,along)*settings.x*(1.-loaded);
  float coverage=mix(1.,smoothstep(.22,.62,fibre*.7+fine*.3),dry*.8);
  float markAlpha=(1.-exp(-4.6*alpha))*sides*heel*tail*coverage;
  // Loaded paint levels out; thin paint keeps every bristle track.
  vec3 color=pigment*(1.+settings.x*(1.-.65*loaded)*((fibre-.5)*.07+(fine-.5)*.035));
  // Raised paint: one lit side wall, one shaded, and a lip where it landed.
  float wall=smoothstep(1.12,1.42,abs(across))*(1.-smoothstep(1.42,1.55,abs(across)));
  float lip=smoothstep(1.2,1.48,-along)*(1.-smoothstep(1.48,1.62,-along))*step(.62,fract(markSeed*7.31));
  color*=1.+settings.x*(wall*(across>0.?.05:-.035)+lip*.09);
  return vec4(clamp(color,0.,1.),clamp(markAlpha,0.,.995));
}
`;
