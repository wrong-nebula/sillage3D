import * as THREE from 'three';
import {solarDirection,solarRadius} from './PainterlySun.js';

// Adapted from Lego homeworld/client/js/render/post.js, analytic sun flare.
// Copyright (c) 2026 abouchedidxcode, MIT. See docs/third-party-notices.md.
export const FLARE_DEFAULTS=Object.freeze({lensFlare:true,lensFlareStrength:.65,lensFlareScale:1,lensFlareBloom:.6});
export const FLARE_GHOSTS=Object.freeze([
  [.42,.016],[.78,.034],[1.22,.012],[1.46,.055],[1.9,.024],[2.6,.085],
].map(Object.freeze));

/** Reflections along source -> optical center; radii are in viewport-height units. */
export function flareGhosts(sunUV,scale=1){
  return FLARE_GHOSTS.map(([offset,radius],i)=>{
    const t=(i*.618)%1;
    return {center:sunUV.map(v=>v+(.5-v)*offset),radius:radius*scale,
      tint:[.55+.45*t,.8-.08*t,1-.55*t]};
  });
}

/** Project the distant sun and its tangent axes, including oblique foreshortening. */
export function projectSolarDisc(camera,options){
  if(!options.sun||!(options.sunIntensity>0))return null;
  camera.updateMatrixWorld(true);
  const direction=new THREE.Vector3(...solarDirection(options.sunAzimuth,options.sunElevation));
  const u=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),direction).normalize();
  const v=new THREE.Vector3().crossVectors(direction,u);
  const rotation=new THREE.Matrix3().setFromMatrix4(camera.matrixWorldInverse);
  direction.applyMatrix3(rotation);u.applyMatrix3(rotation);v.applyMatrix3(rotation);
  const d=-direction.z;
  if(d<=.001)return null;
  const p=camera.projectionMatrix.elements;
  const radius=solarRadius(1,options.sunSize);
  const project=axis=>[.5*p[0]*radius*(axis.x/d+direction.x*axis.z/(d*d)),
    .5*p[5]*radius*(axis.y/d+direction.y*axis.z/(d*d))];
  return {center:[.5+.5*p[0]*direction.x/d,.5+.5*p[5]*direction.y/d],u:project(u),v:project(v)};
}

// A disc of visibility taps, as in the source model, reads our inverse solar
// coverage instead of mesh depth. Evaluated only three times by the fullscreen
// triangle vertex shader; no readback or per-pixel occlusion loops.
export const FLARE_VERTEX_SHADER=`
varying vec2 vUv;
varying float vSunVisibility;
uniform sampler2D source;
uniform vec2 flareSunUV,flareSunU,flareSunV;
uniform float flareStrength;
void main(){
  vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);
  vSunVisibility=0.;
  if(flareStrength<=0.)return;
  for(int i=0;i<24;i++){
    float a=float(i)*2.399963,r=sqrt((float(i)+.5)/24.);
    vec2 uv=flareSunUV+r*(cos(a)*flareSunU+sin(a)*flareSunV);
    if(uv.x>=0.&&uv.x<=1.&&uv.y>=0.&&uv.y<=1.)
      vSunVisibility+=1.-texture2D(source,uv).a;
  }
  vSunVisibility/=24.;
}`;

export const FLARE_FRAGMENT_GLSL=`
varying float vSunVisibility;
uniform vec2 flareSunUV;
uniform float flareStrength,flareScale,aspect,flarePixelHeight;
const vec2 FLARE_GHOSTS[6]=vec2[6](${FLARE_GHOSTS.map(([k,s])=>`vec2(${k.toFixed(3)},${s.toFixed(3)})`).join(',')});
float roundSplat(vec2 q){
  float r2=dot(q,q);
  if(r2>=2.6)return 0.;
  return exp(-2.*r2)*(1.-smoothstep(2.,2.6,r2));
}
float softDab(vec2 q,float aa){
  // A circular Gaussian core blends smoothly into its antialiased outer tail.
  float radius=length(q);
  return exp(-1.65*radius*radius)*(1.-smoothstep(1.45-aa,2.05+aa,radius));
}
float paintedGhostSupport(float pixel){
  // Enclose each offset ellipse after both axes expand to its pixel footprint.
  // Rotation preserves this radius; softDab is zero beyond 2.05 + aa.
  float minAxis=max(.43,pixel*1.4);
  float maxAxis=max(.52,pixel*1.4);
  float aa=max(.025,pixel*.55/minAxis);
  return .47+(2.05+aa)*maxAxis;
}
vec3 paintedGhost(vec2 q,float seed,float pixel){
  vec3 pigmentSum=vec3(0.);
  float weightSum=0.,transmittance=1.;
  // Three distinct round daubs share soft tails without adding a white center.
  for(int j=0;j<3;j++){
    float f=float(j),a=f*2.094395+seed*.73;
    float distance=.36+.055*f;
    vec2 center=vec2(cos(a),sin(a))*distance;
    float turn=.55+seed*.61+.42*sin(f*2.3);
    mat2 rotation=mat2(cos(turn),-sin(turn),sin(turn),cos(turn));
    vec2 size=max(vec2(.45+.07*fract(f*.618+seed*.27),.43+.07*fract(f*.37+seed*.19)),vec2(pixel*1.4));
    vec2 local=rotation*(q-center)/size;
    float mark=softDab(local,max(.025,pixel*.55/min(size.x,size.y)));
    float pigment=.86+.12*fract(f*.618+seed*.31+.23);
    // Low-frequency density variation keeps each rounded dab softly painted.
    // It only reduces density, so the analytic support remains conservative.
    float density=.94+.06*sin(local.x*4.7+seed)*cos(local.y*4.1+f);
    float alpha=min(.97,mark*pigment*density);
    vec3 tint=mix(vec3(.86,.96,1.),vec3(1.,.94,.82),fract(f*.43+seed*.17));
    pigmentSum+=alpha*tint;weightSum+=alpha;
    transmittance*=1.-alpha;
  }
  // Optical union caps overlap brightness; averaged pigment retains the colors.
  return pigmentSum/max(weightSum,.00001)*(1.-transmittance);
}
vec3 splatLensFlare(vec2 uv){
  float energy=flareStrength*vSunVisibility*clamp(sunStrength/8.,0.,3.);
  if(energy<=.00001)return vec3(0.);
  vec2 metric=vec2(aspect,1.),d=(uv-flareSunUV)*metric;
  // Three quiet optical splats replace the dense field of illuminated dirt.
  // The independent lens-dirt effect retains its own mask and controls.
  vec3 color=vec3(1.,.94,.84)*(.65*roundSplat(d/.042)
    +.20*roundSplat((d-vec2(-.045,.026))/vec2(.055,.032))
    +.14*roundSplat((d-vec2(.052,-.018))/vec2(.06,.028)));
  vec2 axis=vec2(.5)-flareSunUV;
  for(int i=0;i<6;i++){
    vec2 center=flareSunUV+axis*FLARE_GHOSTS[i].x;
    float radius=FLARE_GHOSTS[i].y*flareScale;
    vec2 q=(uv-center)*metric/radius;
    float pixel=flarePixelHeight/radius;
    float support=paintedGhostSupport(pixel);
    if(dot(q,q)>support*support)continue;
    vec3 body=paintedGhost(q,float(i)+1.,pixel);
    vec3 tint=mix(vec3(.55,.8,1.),vec3(1.,.72,.45),fract(float(i)*.618));
    color+=body*tint*(i==3?.90:.68);
  }
  return color*energy;
}`;
