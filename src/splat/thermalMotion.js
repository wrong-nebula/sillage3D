export const THERMAL_PALETTE = [
  [.055, .036, .095],
  [.15, .09, .36],
  [.36, .13, .66],
  [.68, .13, .52],
  [.90, .17, .31],
  [1, .41, .13],
  [1, .76, .20],
  [1, .98, .78],
];

export const THERMAL_MOTION_GLSL = `
uniform float thermalTime;
const vec3 heatPalette[8]=vec3[8](${THERMAL_PALETTE.map(color=>`vec3(${color.map(channel=>channel.toFixed(3)).join(',')})`).join(',')});
vec3 heatColor(float heat){
  float value=clamp(heat,0.,.999)*7.;
  int band=int(value);
  return mix(heatPalette[band],heatPalette[band+1],smoothstep(0.,1.,fract(value)));
}
// Shared by the palm highlight and the light seen between the bones.
float palmHotArea(float travel){
  float phase=mod(thermalTime,6.)*1.0471975512;
  float radius=.49+.105*sin(phase-.42);
  return 1.-smoothstep(radius-.135,radius+.13,travel);
}
vec3 palmHighlight(vec3 pigment,float area){
  vec3 amber=min(pigment,vec3(1.,.66,.26));
  vec3 warm=mix(vec3(1.,.80,.30),vec3(1.,.98,.82),smoothstep(.40,1.,area));
  return mix(amber,mix(pigment,warm,.63),area);
}
vec3 thermalPigment(vec3 pigment,vec3 heat,vec3 point){
  if(heat.z<=0.||thermalTime<=0.)return pigment;
  float phase=mod(thermalTime,12.)*.5235987756;
  float flow=.068*sin(phase*2.-heat.y*5.4);
  float texture=.016*sin(phase*3.-heat.y*9.2+point.x*3.+point.y*2.);
  vec3 delta=heatColor(heat.x+flow+texture)-heatColor(heat.x);
  return clamp(pigment+delta*heat.z*smoothstep(0.,1.4,thermalTime),0.,1.);
}
`;
