/** Screen-space transmission for the sorted splat renderer. The submerged
 * capture stores color/coverage and coverage-weighted vertical depth in MRT.
 * It cannot recover surfaces outside the camera's captured view. */
export const REFRACTION_DEFAULTS={ior:1.333,strength:1,clarity:.72,maxDepth:16,absorption:[.30,.105,.065],resolution:640};
export function refractionSettings(config={}){
  const finite=(v,f)=>Number.isFinite(v)?v:f;
  const d=REFRACTION_DEFAULTS;
  return {enabled:config.enabled!==false,ior:Math.max(1,Math.min(2,finite(config.ior,d.ior))),
    strength:Math.max(0,Math.min(1,finite(config.strength,d.strength))),clarity:Math.max(0,Math.min(1,finite(config.clarity,d.clarity))),
    maxDepth:Math.max(.1,finite(config.maxDepth,d.maxDepth)),resolution:Math.max(128,Math.min(1024,finite(config.resolution,d.resolution))),
    absorption:d.absorption.map((v,i)=>Math.max(0,finite(config.absorption?.[i],v)))};
}

/** Keep the main view's far-to-near order. Fragment clipping handles splats
 * that cross the waterline; the CPU bounds must not discard those crossings. */
export function submergedOrder(order,centers,packed,wind,background,level,brushScale,output){
  let count=0;
  for(const i of order){
    const kind=wind?.[i*4+3]??0;
    if(background?.[i]||(kind>2.5&&kind<6.5))continue;
    const k=i*20,reach=3*brushScale*(Math.abs(packed[k+5])+Math.abs(packed[k+9])+Math.abs(packed[k+13]));
    if(centers[i*3+1]-reach>level+.02&&kind<.5)continue;
    output[count++]=i;
  }
  return count;
}

export const refractionVertexGLSL=(upper=false)=>`
uniform bool refractionPass;
uniform bool refractionReady;
uniform sampler2D waterRefraction;
uniform sampler2D waterRefractionDepth;
uniform mat4 refractionMatrix;
uniform vec4 refractionSettings; // IOR, bending strength, clarity, max depth
uniform vec3 waterAbsorption;
uniform float waterReflectionFloor;
out vec4 transmittedRay; // captured UV, optical path length, validity
out vec4 refractedReflection; // reflected pigment and Fresnel weight
${upper?`uniform float upperWaterLevel;
uniform bool reflectionReadyUpper;
uniform bool refractionReadyUpper;
uniform sampler2D waterReflectionUpper;
uniform sampler2D waterRefractionDepthUpper;
uniform mat4 reflectionMatrixUpper;
flat out int waterBody;`:''}
bool validWaterUV(vec2 uv){return all(greaterThanEqual(uv,vec2(.002)))&&all(lessThanEqual(uv,vec2(.998)));}
float waterFresnel(vec3 normal,vec3 incident){
  float f0=pow((refractionSettings.x-1.)/(refractionSettings.x+1.),2.);
  return f0+(1.-f0)*pow(1.-clamp(dot(normal,-incident),0.,1.),5.);
}
vec4 refractedRay(vec3 p,vec3 normal${upper?',bool upper':''}){
  vec4 clip=refractionMatrix*vec4(p,1.);if(clip.w<=0.)return vec4(0.);
  vec2 baseUV=clip.xy/clip.w;if(!validWaterUV(baseUV))return vec4(baseUV,0.,0.);
  vec4 depthSample=${upper?'upper?texture(waterRefractionDepthUpper,baseUV):':''}texture(waterRefractionDepth,baseUV);
  if(depthSample.a<.025)return vec4(baseUV,0.,0.);
  float baseDepth=depthSample.r/max(depthSample.a,.001)*refractionSettings.w;
  float depth=baseDepth;
  vec3 incident=normalize(p-cameraPosition);
  vec3 bent=refract(incident,normal,1./refractionSettings.x);
  vec3 ray=normalize(mix(incident,bent,refractionSettings.y));
  if(ray.y>=-.025)return vec4(baseUV,0.,0.);
  vec2 uv=baseUV;float path=0.;
  // Two fixed-point samples follow the captured depth under a refracted ray.
  // A missing/out-of-view hit falls back to the undistorted capture, never an edge smear.
  for(int i=0;i<2;i++){
    path=min(depth/max(-ray.y,.025),refractionSettings.w*4.);
    vec4 hit=refractionMatrix*vec4(p+ray*path,1.);
    if(hit.w<=0.){uv=baseUV;depth=baseDepth;break;}
    vec2 candidate=hit.xy/hit.w;
    if(!validWaterUV(candidate)||distance(candidate,baseUV)>.14){uv=baseUV;depth=baseDepth;break;}
    vec4 probe=${upper?'upper?texture(waterRefractionDepthUpper,candidate):':''}texture(waterRefractionDepth,candidate);
    if(probe.a<.025){uv=baseUV;depth=baseDepth;break;}
    uv=candidate;depth=probe.r/max(probe.a,.001)*refractionSettings.w;
  }
  path=min(depth/max(-ray.y,.025),refractionSettings.w*4.);
  return vec4(uv,path,1.);
}
`;

export const refractionFragmentGLSL=(upper=false)=>`
uniform bool refractionPass;
uniform float waterLevel;
uniform vec4 refractionSettings;
uniform sampler2D waterRefraction;
uniform vec3 waterAbsorption;
in vec4 transmittedRay;
in vec4 refractedReflection;
${upper?`uniform sampler2D waterRefractionUpper;
uniform vec3 waterAbsorptionUpper;
flat in int waterBody;`:''}
vec3 waterLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 waterDisplay(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
vec3 refractedPigment(vec3 waterColor){
  // Sample per fragment to preserve submerged detail. Interpolating the bent
  // ray across a water stroke avoids repeating depth tracing for every pixel.
  vec4 sampleColor=${upper?'waterBody==1?texture(waterRefractionUpper,transmittedRay.xy):':''}texture(waterRefraction,transmittedRay.xy);
  vec3 bottom=sampleColor.rgb/max(sampleColor.a,.001);
  vec3 absorption=${upper?'waterBody==1?waterAbsorptionUpper:':''}waterAbsorption;
  vec3 transmission=exp(-absorption*transmittedRay.z*mix(4.,.3,refractionSettings.z));
  vec3 transmitted=waterDisplay(waterLinear(bottom)*transmission+waterLinear(waterColor)*(1.-transmission));
  return mix(waterColor,transmitted,smoothstep(.025,.65,sampleColor.a)*clamp(transmittedRay.w,0.,1.));
}
#ifdef REFRACTION_CAPTURE
layout(location=1) out vec4 submergedDepth;
#endif
`;

export const REFRACTION_VERTEX_GLSL=refractionVertexGLSL();
export const REFRACTION_FRAGMENT_GLSL=refractionFragmentGLSL();
