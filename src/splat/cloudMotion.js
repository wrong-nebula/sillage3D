/** Distant banks stay near their mountain anchors. Meadow clouds may wrap
 * across the valley; using that short wrap for the far ridge teleported the
 * leftmost banks 220 units forward at time zero. */
export function mountainCloudOffset(time,phase){
 const travel=5*Math.sin(time*.022);
 return [travel*.94,.10*(Math.sin(time*.08+phase)-Math.sin(phase)),travel*.34];
}
export const CLOUD_MOTION_GLSL=`
vec3 cloudDrift(float phase,bool distant) {
  float travel=distant?5.*sin(windTime*.022):mod(phase+windTime*.3+110.,220.)-110.-phase;
  float lift=distant?.10:.18;
  return vec3(travel*.94,lift*(sin(windTime*.08+phase)-sin(phase)),travel*.34);
}`;
