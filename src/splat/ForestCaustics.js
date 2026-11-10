import {Vector3} from 'three';
import {reefCausticVolumeTexture} from './ReefCaustics.js';

export class ForestCaustics{
  constructor({scale=8,speed=.18,strength=1.45}={}){
    this.texture=reefCausticVolumeTexture();
    this.settings=new Vector3(Math.max(1,scale),Math.max(0,speed),Math.max(0,strength));
    this.uniforms={forestLightVolume:{value:this.texture},forestLightSettings:{value:this.settings}};
  }
  dispose(){this.texture.dispose();}
}

// Coral's two drifting Worley fields, enlarged in world metres. Only explicitly
// tagged submerged surfaces receive them, at their own river elevation.
export const FOREST_CAUSTIC_GLSL=`
uniform highp sampler3D forestLightVolume;
uniform vec3 forestLightSettings;
vec3 forestCausticLight(vec3 pigment,vec3 point,vec3 normal,float level){
  float depth=level-point.y;
  vec3 light=normalize(vec3(.54,.79,-.29));
  float facing=max(0.,dot(normal,light));
  if(depth<=0.||facing<=.001||forestLightSettings.z<=0.)return pigment;
  float time=windTime*forestLightSettings.y;
  vec2 p=(point.xz+light.xz/light.y*depth*.48)*(.64/forestLightSettings.x);
  p+=.095*sin(p.yx*vec2(1.66,1.91)+time*vec2(.43,-.36));
  vec2 a=texture(forestLightVolume,vec3(p*.139+vec2(.028,-.015)*time,time*.054)).rg;
  vec2 rotated=mat2(.80,.60,-.60,.80)*p;
  vec2 b=texture(forestLightVolume,vec3(rotated*.223+vec2(.31,.67)-vec2(.012,.020)*time,.39+time*.037)).rg;
  float pockets=smoothstep(.18,.54,a.r*b.r);
  float bandA=1.-smoothstep(.025,.142,a.g),bandB=1.-smoothstep(.018,.115,b.g);
  float filaments=max(bandA*smoothstep(.35,.82,a.r),bandB*smoothstep(.39,.86,b.r)*.57);
  float focus=pockets*.56+filaments*(.38+.46*pockets);
  float energy=focus*forestLightSettings.z*sqrt(facing)*mix(1.18,.63,smoothstep(.70,18.,depth));
  vec3 transmission=exp(-vec3(.043,.018,.012)*depth);
  return clamp(pigment+energy*transmission*(vec3(.10,.15,.145)+.57*pigment),0.,1.);
}
`;
export const FOREST_CAUSTIC_APPLY_GLSL=`
  if(windKind>15.5&&windKind<16.5&&!reflectionPass){
    vec4 receiver=texelFetch(windData,ivec2(int(splatIndex)%windWidth,int(splatIndex)/windWidth),0);
    paintColor=forestCausticLight(paintColor,center.xyz,normalize(axisC),receiver.x);
  }
`;
