/** Painterly defocus around the camera's measured or selected subject plane. */
export const DOF_DEFAULTS=Object.freeze({foregroundDOF:false,autoFocus:true,focusDistance:12,dofStrength:.65,dofRange:.85,dofSwirl:.3});
const clamp=v=>Math.max(0,Math.min(1,v));
export function foregroundDefocus(depth,focusDistance,options={}){
  if(!options.foregroundDOF||!Number.isFinite(focusDistance)||focusDistance<=0)return 0;
  const near=focusDistance*.18,far=focusDistance*(options.dofRange??DOF_DEFAULTS.dofRange);
  const t=clamp((depth-near)/Math.max(.001,far-near));
  const range=options.dofRange??DOF_DEFAULTS.dofRange;
  const behind=clamp((depth/focusDistance-(2-range))/(2-range));
  const distant=behind*behind*(3-2*behind)*.5;
  return Math.max(1-t*t*(3-2*t),distant)*clamp(options.dofStrength??DOF_DEFAULTS.dofStrength);
}
export const foregroundDefocusGLSL=`
float foregroundDefocus(float depth,vec4 settings){
  float nearDistance=settings.y*.18;
  float farDistance=settings.y*settings.z;
  float foreground=1.-smoothstep(nearDistance,max(nearDistance+.001,farDistance),depth);
  float distant=smoothstep(settings.y*(2.-settings.z),settings.y*(4.-2.*settings.z),depth)*.5;
  return max(foreground,distant)*settings.x;
}
`;
