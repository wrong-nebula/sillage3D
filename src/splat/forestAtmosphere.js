/** Small, deterministic vertex-stage fields. No simulation textures or passes. */
export const FOREST_ATMOSPHERE_GLSL=`
float atmosphereHash(float n){return fract(sin(n*127.1+311.7)*43758.5453);}
float atmosphereNoise(vec2 p){
  vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  float n=cell.x+cell.y*57.;
  return mix(mix(atmosphereHash(n),atmosphereHash(n+1.),f.x),
    mix(atmosphereHash(n+57.),atmosphereHash(n+58.),f.x),f.y);
}
float forestDensity(vec2 position,float time){
  vec2 drift=vec2(.94,.34)*time*.12;
  vec2 p=(position-drift)*.19;
  float broad=atmosphereNoise(p+vec2(atmosphereNoise(p*.6),0.)*.7);
  float wisps=atmosphereNoise((position-drift*1.7)*.48+vec2(7.,13.));
  return .26+1.1*smoothstep(.18,.82,broad*.72+wisps*.28);
}
float waterTwinkle(float seed,float time){
  // Each stationary dot gets unrelated event timing, duration, and missed flashes.
  float clock=time*(.72+atmosphereHash(seed*53.)*1.5)+atmosphereHash(seed*97.)*19.;
  float event=floor(clock),t=fract(clock),h=atmosphereHash(seed*163.+event*17.);
  float start=.04+atmosphereHash(seed*31.+event*47.)*.28;
  float duration=.22+atmosphereHash(seed*83.+event*7.)*.38;
  float pulse=smoothstep(start,start+.07,t)*(1.-smoothstep(start+duration*.6,start+duration,t));
  return pulse*step(.28,h)*(.62+.38*atmosphereHash(seed*7.+event*91.));
}
`;
