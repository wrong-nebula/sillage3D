import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {LimitedPondOrbit} from './LimitedPondOrbit.js';
import {scenes} from './scenes.js';
import {packSplats,depthOrder,DynamicDepthOrder} from './math.js';
import {bakeIrradiance} from './irradiance.js';
import {COLOR_DEFAULTS,prepareColorResponse,applyColorResponse} from './colorResponse.js';
import {LENS_DIRT_DEFAULTS,LensDirtPass} from './LensDirtPass.js';
import {SUN_DEFAULTS,PainterlySun} from './PainterlySun.js';
import {PaintNoiseMap} from './PaintNoiseMap.js';
import {STILL_DEFAULTS,STILL_SCALE,stillPhases,writeStillPhase,StillAccumulator} from './StillAccumulator.js';
import {selectMarkClusters,clusterOwners,refreshClusterStill} from './MarkClusters.js';
import {SplatPrepass,PREPASS_DEFAULTS} from './SplatPrepass.js';
import {SORT_WORKER_DEFAULTS,SORT_WORKER_MIN_SPLATS,SORT_WORKER_SLACK,SORT_WORKER_LINGER,standInRows} from './SplatSortJob.js';
import {SplatSortClient} from './SplatSortClient.js';
import {SteadyList} from './SteadyList.js';
import {MARK_LOD_DEFAULTS,MARK_LOD_MAX_SCALE,MARK_LOD_VERTEX_DECLARATION,MARK_LOD_VERTEX_ELIGIBLE,MARK_LOD_VERTEX_GLSL,markLodDrops} from './MarkLOD.js';
import {FLARE_DEFAULTS} from './lensFlare.js';
import {VIGNETTE_DEFAULTS} from './PainterlyVignettePass.js';
import {PlantLOD} from './PlantLOD.js';
import {DOF_DEFAULTS,foregroundDefocusGLSL} from './ForegroundDOF.js';
import {GHIBLI_DEFAULTS,GHIBLI_FRAGMENT_GLSL,GHIBLI_COLOR_GLSL,PAPER_SCALE_RANGE,paperFit} from './ghibliPaint.js';
import {OIL_FRAGMENT_GLSL} from './oilPaint.js';
import {WATERCOLOR_FRAGMENT_GLSL} from './watercolorPaint.js';
import {CameraFocus} from './CameraFocus.js';
import {GAUSSIAN_FILTER_GLSL,PIXEL_FILTER_HOOK,pixelFilterVertexGLSL} from './GaussianFilter.js';
import {SplatVisibility} from './SplatVisibility.js';
import {SporeDrift} from './SporeDrift.js';
import {DesertEcosystem,desertShader} from './DesertEcosystem.js';
import {SplatTextureUploads} from './SplatTextureUploads.js';
const OCCLUSION_MIN_SPLATS=4096;
const COLOR_STYLE_KEYS=new Set(['indirect','bounceStrength','tonePreservation','tintedShadows','shadowTint','shadowTintStrength']);
import {FOREST_ATMOSPHERE_GLSL} from './forestAtmosphere.js';
import {TrampleTrail,TRAMPLE_GLSL} from './TrampleTrail.js';
import {DynamicWater,DYNAMIC_WATER_GLSL} from './DynamicWater.js';
import {WATERFALL_OFFSET_GLSL} from './ForestWaterfalls.js';
import {refractionSettings,submergedOrder,refractionVertexGLSL,refractionFragmentGLSL} from './WaterRefraction.js';
import {makeUpperWater,disposeUpperWater,upperWaterUniforms,renderUpperWater,waterPlaneVisible} from './UpperWater.js';
import {makeFossilMirrors,disposeFossilMirrors,fossilUniforms,renderFossilMirrors,FOSSIL_UNIFORMS_GLSL,FOSSIL_FINISH_GLSL} from './FossilSurfaces.js';
import {PAINTED_WATER_OVERSCAN,PAINTED_WATER_UV_GLSL,PAINTED_WATER_COLOR_GLSL} from './PaintedWater.js';
import {CLOUD_MOTION_GLSL} from './cloudMotion.js';
import {THERMAL_MOTION_GLSL} from './thermalMotion.js';
import {THERMAL_SKELETON_GLSL} from './thermalSkeleton.js';
import {terrainVertexVarying, terrainFragmentGLSL, terrainTextureUniforms} from './TerrainTexture.js';
import {CrystalStudioPass} from './CrystalStudioPass.js';
import {ReefCaustics, REEF_CAUSTIC_FRAGMENT} from './ReefCaustics.js';
import {ForestCaustics,FOREST_CAUSTIC_GLSL,FOREST_CAUSTIC_APPLY_GLSL} from './ForestCaustics.js';
import {REEF_GLOW_FRAGMENT} from './ReefBioluminescence.js';
import {ReefSequence} from './ReefSequence.js';
import {ReefAudio} from './ReefAudio.js';
import {FOREGROUND_F_NUMBER} from './LensDiffraction.js';
import {CausticClouds, CLOUD_VOLUME_GLSL} from './CausticClouds.js';
import {CliffSeasons, SEASONAL_SNOW_GLSL} from './CliffSeasons.js';
import {FogDynamics} from './FogDynamics.js';
import {SPLAT_MATERIAL_GLSL,splatMaterialUniforms,materialSettings} from './SplatMaterialResponse.js';
import {StudioEnvironment} from './StudioEnvironment.js';
import {SSAO_DEFAULTS,ssaoSettings,SplatSSAO,SSAO_VERTEX_DECLARATION,SSAO_VERTEX_CAPTURE,SSAO_FRAGMENT_DECLARATION,SSAO_FRAGMENT_CAPTURE} from './SplatSSAO.js';
import {OCCLUSION_DEFAULTS,OCCLUSION_MIN_STROKE,strokeWidth,SplatOcclusion,OCCLUSION_VERTEX_DECLARATION,OCCLUSION_VERTEX_RANK,OCCLUSION_VERTEX_CAPTURE,occlusionFragmentDeclaration,OCCLUSION_FRAGMENT_TEST,occlusionFragmentCapture,OCCLUSION_FRAGMENT_END} from './SplatOcclusion.js';

const supportGLSL=`  // Bound only fragments the existing kernels would discard. Gouache's
  // loaded brush and animated fog/glints keep their original support.
  float support=3.;
  if(!groundFog&&!glint&&(ghibli<.5||sky||softParticle)){
    float peak=max(0.,opacity*coverage*defocusCoverage);
    float gaussianSupport=sqrt(max(0.,2.*log(max(1.,peak/.004))));
    if(painted>.5&&!sky&&!softParticle){
      float edgeSoftness=softness+max(0.,fogRange.z)*.7+defocusAmount*2.+(1.-lodWeight)*.25;
      // The two silhouette perturbations sum to at most .09. The loaded
      // paint alpha is bounded by 7.5 * peak * exp(-r^2/2).
      float paintSupport=min(1.75+.5*edgeSoftness+.09,sqrt(max(0.,2.*log(max(1.,7.5*peak/.004)))));
      support=painted==1.&&defocusAmount==0.?paintSupport:max(paintSupport,gaussianSupport);
    }else support=gaussianSupport;
    support=min(3.,support+.001); // Conservative margin for shader rounding.
  }
  localCoord=position.xy*support;`;

const vertexShader = (refraction=false,shoreGlitter=false,celPaint=false,paintedWater=false,waterfalls=false,upperWater=false,fossils=false,thermal=false,terrainKind=null,reefLight=false,cloudLight=false,seasonalSnow=false,forestCaustics=false,splatMaterials=false) => `
uniform sampler2D splatData;
uniform int dataWidth;
uniform bool emissionCapture;
uniform float emissionStart;
uniform vec2 viewport;
uniform float brushScale;
uniform float coverage;
uniform float painted;
uniform float softness;
uniform float ghibli;
uniform vec3 gouacheSettings;
uniform vec4 dofSettings;
uniform bool hasLodBlend;
uniform float lodProgress;
uniform vec3 fogRange;
uniform vec2 fogHeight;
uniform vec3 fogColor;
uniform vec3 fogHorizonColor;
uniform sampler2D windData;
uniform int windWidth;
uniform float windTime;
uniform bool hasWind;
uniform bool reflectionPass;
uniform bool reflectionReady;
uniform float waterLevel;
uniform sampler2D waterReflection;
uniform mat4 reflectionMatrix;
uniform vec4 reflectionSettings;
uniform float reflectionBlur;
uniform float reflectionBlurY;
uniform vec3 reflectionTint;
uniform vec2 reflectionRippleScale;
uniform float waterWaveAmplitude;
uniform int lowCloudCount;
uniform vec4 lowCloudForms[4];
uniform vec4 lowCloudPhases;
in float splatIndex;
out vec2 localCoord;
out vec3 paintColor;
out float opacity;
out float seed;
out float mist;
out vec3 mistColor;
out float pigmentStrength;
out float skyKernel;
${celPaint?'out float celKernel;':''}
out vec2 localU;
out vec2 localV;
out float defocusAmount;
out float defocusCoverage;
out float lodWeight;
out vec3 paintSurface;
${reefLight?'flat out vec4 reefLightReceiver;':''}
${reefLight?'flat out float reefFlowCoordinate;':''}
${reefLight?'uniform bool reefDiffraction; uniform vec3 reefLensOptics;':''}
${reefLight?'uniform vec4 reefOpening; uniform float reefActorStart;':''}
${terrainKind?terrainVertexVarying:''}
out float fogKernel;
${SSAO_VERTEX_DECLARATION}
${OCCLUSION_VERTEX_DECLARATION}
${MARK_LOD_VERTEX_DECLARATION}
// Sub-pixel shift of the whole frame, in clip units; zero except while a
// view at rest is being supersampled or exported in sub-pixel phases.
uniform vec2 frameJitter;
${foregroundDefocusGLSL}
${GHIBLI_COLOR_GLSL}
${FOREST_ATMOSPHERE_GLSL}
${cloudLight?CLOUD_VOLUME_GLSL:''}
${seasonalSnow?SEASONAL_SNOW_GLSL:''}
${TRAMPLE_GLSL}
${DYNAMIC_WATER_GLSL}
${refraction?refractionVertexGLSL(upperWater):''}
${fossils?FOSSIL_UNIFORMS_GLSL:''}
${forestCaustics?FOREST_CAUSTIC_GLSL:''}
${thermal?THERMAL_MOTION_GLSL+THERMAL_SKELETON_GLSL:''}
${splatMaterials?SPLAT_MATERIAL_GLSL:''}
vec4 readSplat(int offset) {
  int address=int(splatIndex)*5+offset;
  return texelFetch(splatData,ivec2(address%dataWidth,address/dataWidth),0);
}
vec2 projectAxis(vec3 axis,vec3 p,vec2 focal) {
  float d=-p.z;
  vec2 limit=1.3*viewport/(2.*focal);
  vec2 slope=clamp(p.xy/d,-limit,limit);
  return focal*(axis.xy/d+slope*axis.z/d);
}
${CLOUD_MOTION_GLSL}
${waterfalls?'uniform vec4 waterfallPaths[16];uniform vec2 waterfallWidths[16];':''}
vec3 windOffset(vec3 p,vec4 wind) {
  ${forestCaustics?'if(wind.w>15.5&&wind.w<16.5)return vec3(0.);':''}
  ${fossils?'if(wind.w>10.5&&wind.w<14.5)return vec3(0.);':''}
  ${waterfalls?WATERFALL_OFFSET_GLSL:''}
  if(wind.w<.5)return vec3(0.);
  ${seasonalSnow?'if(wind.w>14.5&&wind.w<15.5)return snowDriftOffset(p,wind);':''}
  ${seasonalSnow?'if(wind.w>12.5)return meltwaterOffset(p,wind);':''}
  ${seasonalSnow?'if(wind.w>1.5&&wind.w<2.5)return meadowWindOffset(p,wind);':''}
  if(wind.w>3.5&&wind.w<4.5)return ${seasonalSnow&&cloudLight?'causticCloudOffset(p,wind)':'cloudDrift(wind.z,wind.x<0.)'};
  if(wind.w>6.5){
    // Folded shrine paper shares the breeze but keeps its angular silhouette.
    float weight=clamp((wind.x-p.y)/max(wind.y,.01),0.,1.);
    float flutter=.11+.14*sin(windTime*1.65+wind.z)+.035*sin(windTime*3.8+wind.z-weight*2.);
    return vec3(.94*weight*flutter,.035*weight*weight*(1.+sin(windTime*1.65+wind.z)),.34*weight*flutter);
  }
  if(wind.w>5.5)return vec3(0.);
  if(wind.w>4.5)return ${seasonalSnow?'winterFogOffset(p,wind)':'vec3(0.,.025*sin(windTime*.17+wind.z),0.)'};
  if(wind.w>2.5)return vec3(0.,dynamicWater?dynamicWaterHeight(p.xz):waterWaveAmplitude*sin(windTime*1.3+p.x*.8+p.z*.7+wind.z),0.);
  bool cloth=wind.w<1.5;
  float weight=clamp((cloth?wind.x-p.y:p.y-wind.x)/max(wind.y,.01),0.,1.);
  float phase=windTime*1.65+wind.z+p.x*.42+p.z*.16;
  if(cloth){
    float billow=sin(phase)*.35+sin(windTime*3.1+p.x*4.-weight*4.+wind.z)*.11;
    return vec3(weight*(.28+billow)*.94,weight*weight*(.12+.1*sin(phase)),weight*(.28+billow)*.34+.04*sin(phase)*weight);
  }
  float amplitude=wind.y>3.? .095:.12;
  return weight*weight*vec3(amplitude*.94*sin(phase),0.,amplitude*.34*sin(phase));
}
vec3 windAxis(vec3 p,vec3 axis,vec4 wind) {
  return axis+(windOffset(p+axis,wind)-windOffset(p-axis,wind))*.5;
}
void main() {
${OCCLUSION_VERTEX_RANK}
  ${refraction?'transmittedRay=vec4(0.);refractedReflection=vec4(0.);':''}
  ${upperWater?'waterBody=0;':''}
  vec4 center=readSplat(0);
  vec4 pigment=readSplat(4);paintColor=pigment.rgb;opacity=center.w;
  ${thermal?`if(!emissionCapture){
    vec3 heat=vec3(readSplat(1).w,readSplat(2).w,readSplat(3).w);
    paintColor=thermalPigment(paintColor,heat,center.xyz);
    if(heat.z>0.)paintColor=thermalTissuePigment(paintColor,center.xyz,cameraPosition,palmHotArea(heat.y));
  }`:''}
  ${celPaint?`bool sky=pigment.a<0.,cel=pigment.a>=4.&&pigment.a<5.,softParticle=pigment.a>=2.&&pigment.a<4.;
  seed=sky?-1.-pigment.a:cel?pigment.a-4.:softParticle?pigment.a-2.:pigment.a;celKernel=cel?1.:0.;`:'bool sky=pigment.a<0.,softParticle=pigment.a>=2.&&pigment.a<4.;seed=sky?-1.-pigment.a:softParticle?pigment.a-2.:pigment.a;'}
  ${reefLight?`bool sandGlint=pigment.a>=3.&&pigment.a<4.;
  bool fishScale=pigment.a>=5.&&pigment.a<6.,fishCatchlight=pigment.a>=6.&&pigment.a<7.;
  bool coralGlow=pigment.a>=7.&&pigment.a<11.;
  bool reefRay=pigment.a>=11.&&pigment.a<12.;
  bool reefBed=pigment.a>=15.&&pigment.a<17.;
  bool reefRock=(pigment.a>=12.&&pigment.a<14.)||reefBed;
  bool reefMoss=pigment.a>=14.&&pigment.a<15.;
  reefFlowCoordinate=coralGlow?readSplat(1).w:0.;
  if(sandGlint||fishScale||fishCatchlight||coralGlow||reefRay||reefRock||reefMoss)seed=fract(pigment.a);
  ${celPaint?'if((pigment.a>=13.&&pigment.a<14.)||(pigment.a>=16.&&pigment.a<17.)){cel=true;celKernel=1.;}':''}
  if(fishCatchlight||reefRay)softParticle=true;`:''}
  ${seasonalSnow?'if(pigment.a>=3.&&pigment.a<4.)seed=fract(pigment.a);':''}
  ${splatMaterials?'bool specialSurface=pigment.a>=17.&&pigment.a<26.;if(specialSurface)seed=fract(pigment.a);':''}
  ${fossils?'if(pigment.a>=3.&&pigment.a<4.)seed=fract(pigment.a);':''}
  lodWeight=1.;float transitionScale=1.;
  if(hasLodBlend){
    float role=readSplat(1).w;
    if(abs(role)>.5){
      float delay=readSplat(2).w+fract(seed*17.13)*.04;
      float blend=smoothstep(delay,delay+.84,lodProgress);
      lodWeight=role>0.?blend:1.-blend;
      transitionScale=role>0.?mix(.94,1.,blend):mix(1.,1.08,blend);
    }
  }
  if(lodWeight<.0001){gl_Position=vec4(2.,2.,2.,1.);return;}
  float windKind=0.,trampled=0.,glintFloor=0.;
  ${shoreGlitter?'float glintTime=windTime;':''}
  vec2 surfaceWaterSlope=vec2(0.);
  vec3 axisA=readSplat(1).xyz,axisB=readSplat(2).xyz,axisC=readSplat(3).xyz;
  ${reefLight?`{
    float reveal=1.;
    bool fish=splatIndex>=reefActorStart;
    if(fish)reveal=reefOpening.w;
    else if(coralGlow){
      float pulse=.015*sin(reefOpening.z*18.)+.007*sin(reefOpening.z*37.);
      float meniscus=.008*sin(dot(center.xyz,vec3(13.1,7.3,17.7)));
      float front=mix(-.10,1.15,reefOpening.z)+pulse+meniscus;
      reveal=smoothstep(reefFlowCoordinate-.045,reefFlowCoordinate+.045,front);
      // Marks unfurl behind a pulsating front along the connected veins.
      transitionScale*=mix(.3,1.,reveal);
    }else if((reefRock&&!reefBed)||reefMoss){
      float radius=clamp(length(center.xz)/9.,0.,1.);
      reveal=smoothstep(radius-.1,radius+.1,mix(-.15,1.15,reefOpening.y));
    }else if(softParticle&&!sandGlint&&!reefRay)reveal=reefOpening.w;
    else if(reefRay)reveal=reefOpening.x;
    else {
      float radius=clamp(length(center.xz)/14.,0.,1.);
      float brushEdge=.025*sin(center.x*4.1+center.z*2.7)+.015*sin(center.z*7.3);
      reveal=smoothstep(radius-.07,radius+.07,mix(-.15,1.15,reefOpening.x)+brushEdge);
    }
    lodWeight*=reveal;
    if(reveal<.0001){gl_Position=vec4(2.,2.,2.,1.);return;}
  }`:''}
  ${seasonalSnow?'float cliffEdge=0.;':''}
  ${seasonalSnow?`{
    vec4 field=snowSample(splatIndex);
    if(field.w<.035||field.w>.16)cliffEdge=cliffPerimeterFade(center.xyz);
    if(field.w>.04&&field.w<.09){
      paintColor*=mix(vec3(1.),vec3(.90,.95,1.04),snowSeasonState.x);
      paintColor*=mix(vec3(1.),vec3(1.045,1.,.91),meadowSeasonState.x);
    }else if(field.w>.09&&field.w<.16){
      opacity*=winterFogDensity(center.xz);
      if(opacity<.0002){gl_Position=vec4(2.,2.,2.,1.);return;}
    }else if(field.w>.29&&field.w<.34){
      float depth=settledSnow(field,vec3(0.,1.,0.));
      float cover=smoothstep(.025,.16,depth);
      vec3 sun=normalize(mix(CLOUD_SUN,WINTER_SUN,snowSeasonState.x));
      vec3 halfLight=normalize(sun+normalize(cameraPosition-center.xyz));
      float specular=pow(max(0.,dot(normalize(axisC),halfLight)),12.);
      vec2 overhead=center.xz+sun.xz/sun.y*max(0.,cloudLightState.z-center.y);
      float daylight=1.-cloudCover(overhead)*.55;
      float shimmer=.76+.24*sin(windTime*.70+seed*53.);
      opacity*=cover*min(6.,.065+16.*specular)*daylight*shimmer;
      center.y+=min(.085,depth*.15)+.012;
      paintColor=mix(vec3(.95,.98,1.),vec3(1.),smoothstep(.005,.12,specular));
      if(opacity<.0005){gl_Position=vec4(2.,2.,2.,1.);return;}
    }else if(field.w>.34&&field.w<.41){
      cliffEdge=0.;
      if(!softParticle)paintColor=seasonalActorPigment(paintColor,normalize(axisC),center.xyz);
      else opacity*=mix(1.,.78,snowSeasonState.x);
    }else if(field.w>.42&&field.w<.46){
      cliffEdge=0.;
      float depth=settledSnow(field,vec3(0.,1.,0.));
      float t=snowDriftPhase(seed);
      float life=smoothstep(.015,.13,t)*(1.-smoothstep(.55,.98,t));
      opacity*=smoothstep(.025,.15,depth)*life;
      if(opacity<.0005){gl_Position=vec4(2.,2.,2.,1.);return;}
    }else if(field.w>.46&&field.w<.49){
      cliffEdge=0.;
      vec3 normal=normalize(axisC);
      paintColor=seasonalActorPigment(paintColor,normal,center.xyz);
      float season=smoothstep(.05,.65,snowSeasonState.y)*(1.-smoothstep(.05,.75,snowSeasonState.z));
      float coating=season*field.x*smoothstep(.12,.67,normal.y);
      coating*=mix(.72,1.,smoothstep(.15,.65,seed));
      float sun=max(0.,dot(normal,WINTER_SUN));
      vec3 snow=mix(vec3(.69,.78,.90),vec3(1.,.98,.94),smoothstep(.08,.6,sun));
      paintColor=mix(paintColor,snow,coating*.94);
      center.xyz+=normal*(.018*coating);
    }else if(field.w>.52&&field.w<.58){
      cliffEdge=0.;
      opacity*=smoothstep(.018,.105,localSnowDepth(center.xz));
      if(opacity<.0005){gl_Position=vec4(2.,2.,2.,1.);return;}
    }else if(field.w>.58&&field.w<.65){
      opacity*=snowmeltState.x;
      if(opacity<.004){gl_Position=vec4(2.,2.,2.,1.);return;}
    }else if(field.w>.65&&field.w<.8){
      float bloom=meadowSeasonState.z;
      opacity*=smoothstep(0.,.08,bloom)*smoothstep(field.z-.1,field.z+.07,bloom);
      if(opacity<.004){gl_Position=vec4(2.,2.,2.,1.);return;}
    }else if(snowSeasonState.x>0.||snowSeasonState.y>snowSeasonState.z||meadowSeasonState.x+meadowSeasonState.y>0.||(field.w>.2&&field.w<.58)){
      vec3 normal=normalize(axisC);
      float depth=settledSnow(field,normal);
      float dormancy=smoothstep(.015,.36,snowSeasonState.x);
      if(field.w>.8){
        // The cold arrives before deep snow. Dead stems shorten from the tip.
        float dieback=dormancy*mix(.30,.56,seed);
        center.xyz-=axisA*dieback*.90;
        axisA*=1.-dieback;
        field.z*=1.-dieback*.78;
        opacity*=(1.-.22*dormancy*seed)*(1.-smoothstep(field.z*.7-.022,field.z*.7+.082,depth));
      }else if(field.w>.3) opacity*=1.-smoothstep(.024,.135,depth);
      else center.y+=min(.085,depth*.15);
      if(opacity==0.){gl_Position=vec4(2.,2.,2.,1.);return;}
      paintColor=winterPigment(paintColor,normal,field,depth,seed,dormancy,center.xyz);
    }
  }`:''}
  if(hasWind){
    int address=int(splatIndex);
    vec4 wind=texelFetch(windData,ivec2(address%windWidth,address/windWidth),0);
    windKind=wind.w;
    ${waterfalls?`if(windKind>7.5&&windKind<8.5){
      float flow=fract(wind.z+floor(windTime/.09+.0001)*.09/1.62);
      opacity*=smoothstep(0.,.045,flow)*(1.-smoothstep(.96,1.,flow))*smoothstep(.55,.86,flow*flow);
    }`:''}
    if(windKind>5.5&&windKind<6.5)glintFloor=wind.x;
    ${shoreGlitter?`if(windKind>5.5&&windKind<6.5){
      glintTime*=wind.y;
      // Sand grains stay on land; water glints follow the animated surface.
      if(wind.z>.5&&dynamicWater)center.y+=dynamicWaterHeight(center.xz);
    }`:''}
    if(${refraction?'(reflectionPass||refractionPass)':'reflectionPass'}&&windKind>2.5&&windKind<3.5){gl_Position=vec4(2.,2.,2.,1.);return;}
    ${seasonalSnow?`if(windKind>1.5&&windKind<2.5){
      vec3 force=meadowWindForce(wind);
      float above=center.y-wind.y;
      axisA=meadowWindAxis(axisA,above,force);
      axisB=meadowWindAxis(axisB,above,force);
      axisC=meadowWindAxis(axisC,above,force);
      float reach=max(0.,above);
      center.xyz+=force*(reach*reach);
    }else `:''}if(dynamicWater&&windKind>2.5&&windKind<3.5){
      surfaceWaterSlope=dynamicWaterSlope(center.xz);
      axisA.y+=dot(surfaceWaterSlope,axisA.xz);axisB.y+=dot(surfaceWaterSlope,axisB.xz);axisC.y+=dot(surfaceWaterSlope,axisC.xz);
      center.y+=dynamicWaterHeight(center.xz);
    }else{
      ${seasonalSnow?'if((windKind<4.5||windKind>5.5)&&windKind<12.5){':''}
      axisA=windAxis(center.xyz,axisA,wind);axisB=windAxis(center.xyz,axisB,wind);axisC=windAxis(center.xyz,axisC,wind);
      ${seasonalSnow?'}':''}
      center.xyz+=windOffset(center.xyz,wind);
      ${waterfalls?`if(windKind>7.5&&windKind<8.5){
        for(int i=0;i<12;i++){
          if(i>=waterObstacleCount)break;
          opacity*=smoothstep(waterObstacles[i].z-.15,waterObstacles[i].z+.18,distance(center.xz,waterObstacles[i].xy));
        }
      }`:''}
    }
    if(hasTrample&&windKind>1.5&&windKind<2.5&&${seasonalSnow?'true':'wind.y<.8'}){
      vec3 trail=grassTrail(center.xz);trampled=trail.z;
      vec2 direction=trail.xy/max(length(trail.xy),.0001);
      float above=max(0.,center.y-${seasonalSnow?'wind.y':'wind.x'});
      center.xz+=direction*above*trampled*.95;center.y-=above*trampled*.78;
      axisA=flattenGrassAxis(axisA,direction,trampled);axisB=flattenGrassAxis(axisB,direction,trampled);axisC=flattenGrassAxis(axisC,direction,trampled);
      paintColor*=1.-trampled*.22;
    }
  }
  bool water=windKind>2.5&&windKind<3.5;
  ${seasonalSnow?`if(windKind>12.5&&windKind<14.5){
    vec4 flow=texelFetch(windData,ivec2(int(splatIndex)%windWidth,int(splatIndex)/windWidth),0);
    float t=meltwaterPhase(flow);
    if(windKind<13.5)opacity*=smoothstep(0.,.09,t)*(1.-smoothstep(.83,1.,t));
    else opacity*=.38+.62*pow(.5+.5*sin(windTime*2.6-flow.x*3.7+flow.z*5.),2.);
  }`:''}
  ${seasonalSnow&&cloudLight?`if(windKind>3.5&&windKind<4.5){
    opacity*=smoothstep(.12,.65,cloudCover(center.xz));
    vec3 sun=normalize(mix(CLOUD_SUN,WINTER_SUN,snowSeasonState.x));
    vec3 view=normalize(cameraPosition-center.xyz);
    float silver=pow(max(0.,dot(-view,sun)),7.)*pow(1.-abs(dot(normalize(axisC),view)),2.);
    paintColor=mix(paintColor,vec3(1.,.96,.85),silver*.3);
  }`:''}
  ${seasonalSnow?'if(opacity==0.){gl_Position=vec4(2.,2.,2.,1.);return;}':''}
  ${upperWater?'if(water)waterBody=center.y>(waterLevel+upperWaterLevel)*.5?1:0;':''}
  bool glint=windKind>5.5&&windKind<6.5;
  bool groundFog=windKind>4.5&&windKind<5.5;
  fogKernel=groundFog?1.:0.;
  ${refraction?'if(refractionPass&&(sky||softParticle||glint||groundFog)){gl_Position=vec4(2.,2.,2.,1.);return;}':''}
  if(reflectionPass&&(water||glint||(${fossils?'fossilCapture?dot(fossilClipPlane,vec4(center.xyz,1.))<-.06:':''}center.y<waterLevel-.06))) {gl_Position=vec4(2.,2.,2.,1.);return;}
  vec3 p=(modelViewMatrix*vec4(center.xyz,1.)).xyz;
  float sigma=max(length(readSplat(1).xyz),max(length(readSplat(2).xyz),length(readSplat(3).xyz)))*brushScale;
  float d=-p.z;
  defocusAmount=sky||reflectionPass${refraction?'||refractionPass':''}?0.:foregroundDefocus(d,dofSettings);
  float footprintScale=transitionScale*(1.+defocusAmount*1.5);
  if(!sky&&!softParticle${celPaint?'&&!cel':''})footprintScale*=1.+ghibli*gouacheSettings.y*.18;
  float blurSigma=viewport.y*.024*defocusAmount;
  defocusCoverage=1.;
  if(defocusAmount>.0001){
    float retention=1.-.58*defocusAmount,width=.1*defocusAmount;
    // Seeded thinning fades continuously as depth changes; no per-frame noise.
    defocusCoverage=(1.-smoothstep(retention-width,retention+width,fract(seed*73.31)))/(1.+1.1*defocusAmount);
    if(defocusCoverage<.0001){gl_Position=vec4(2.,2.,2.,1.);return;}
  }
  vec2 focal=vec2(projectionMatrix[0][0],projectionMatrix[1][1])*viewport*.5;
  vec2 tanFov=vec2(1./projectionMatrix[0][0],1./projectionMatrix[1][1]);
${MARK_LOD_VERTEX_ELIGIBLE}
  vec2 guard=d*tanFov+3.*sigma*footprintScale*(markLodEligible?${MARK_LOD_MAX_SCALE}:1.)*sqrt(vec2(1.)+tanFov*tanFov)+6.*blurSigma*d/focal;
  ${reefLight?'if(reefDiffraction)guard+=18.*d/focal;':''}
  if(d<max(.08,sigma*1.5)||abs(p.x)>guard.x||abs(p.y)>guard.y) {gl_Position=vec4(2.,2.,2.,1.);return;}
  mat3 viewRotation=mat3(modelViewMatrix);
  vec2 a=projectAxis(viewRotation*axisA*brushScale*footprintScale,p,focal);
  vec2 b=projectAxis(viewRotation*axisB*brushScale*footprintScale,p,focal);
  vec2 c=projectAxis(viewRotation*axisC*brushScale*footprintScale,p,focal);
${MARK_LOD_VERTEX_GLSL}
  vec2 screen=p.xy/max(d,.08)*focal;
  vec2 tangent=vec2(-screen.y,screen.x)/max(length(screen),.001);
  float edge=smoothstep(0.,.55,length(screen)/viewport.y);
  float radialSigma=blurSigma*.8,tangentSigma=blurSigma*(.8+1.3*dofSettings.w*edge);
  float swirlVariance=tangentSigma*tangentSigma-radialSigma*radialSigma;
  xx+=radialSigma*radialSigma+swirlVariance*tangent.x*tangent.x;
  xy+=swirlVariance*tangent.x*tangent.y;
  yy+=radialSigma*radialSigma+swirlVariance*tangent.y*tangent.y;
  ${reefLight?`if(reefDiffraction&&!sky&&!softParticle){
    // Thin-lens circle of confusion in metres, converted to sensor pixels.
    // Match the second moment of the circular blur with added covariance.
    float f=reefLensOptics.x,focus=max(reefLensOptics.y,f+.01);
    float diameter=f*f*max(0.,focus-d)/(reefLensOptics.z*max(d,.08)*(focus-f));
    float radius=min(12.,diameter*.5*focal.y/max(f,.001));
    float variance=radius*radius*.25;
    float determinant=max(xx*yy-xy*xy,.0001);
    xx+=variance;yy+=variance;
    defocusCoverage*=sqrt(determinant/max(xx*yy-xy*xy,.0001));
  }`:''}
  // GAUSSIAN_PIXEL_FILTER: opt-in normalized screen-space convolution.
  // Principal positive square root, expressed in the projected brush frame.
  // T*T^T equals the complete projected 3D covariance, including thickness.
  mat2 covariance=mat2(xx,xy,xy,yy);
${OCCLUSION_VERTEX_CAPTURE}
  float rootDet=sqrt(max(xx*yy-xy*xy,.0001));
  mat2 root=(covariance+mat2(rootDet,0.,0.,rootDet))/sqrt(xx+yy+2.*rootDet);
  vec2 u=length(a)>.001?normalize(a):vec2(1.,0.);
  mat2 frame=mat2(u,vec2(-u.y,u.x));
  mat2 transform=root*frame;
${supportGLSL}
  ${reefLight?'if(reefRay&&ghibli>.5)localCoord=position.xy*2.2;':''}
  vec2 delta=transform*localCoord;
  vec4 clip=projectionMatrix*vec4(p,1.);
  // Avoid pathological fills while the camera intersects a large splat.
  if(length(transform[0])+length(transform[1])>max(viewport.x,viewport.y)*2.) {
    gl_Position=vec4(2.,2.,2.,1.);return;
  }
  gl_Position=clip;gl_Position.xy+=(delta*2./viewport+frameJitter)*clip.w;
  mat2 invCov=mat2(yy,-xy,-xy,xx)/max(xx*yy-xy*xy,.0001);
  // B^T Sigma^-1 delta: object-attached conditional brush coordinates.
  localU=vec2(dot(a,invCov*transform[0]),dot(a,invCov*transform[1]));
  localV=vec2(dot(b,invCov*transform[0]),dot(b,invCov*transform[1]));
  // Reconstruct a conditional surface point in the undeformed brush frame.
  // Neighboring strokes share pigment grain, and wind carries it with the plant.
  paintSurface=readSplat(0).xyz+(readSplat(1).xyz*dot(localU,localCoord)+readSplat(2).xyz*dot(localV,localCoord))*brushScale*footprintScale;
${SSAO_VERTEX_CAPTURE}
  ${reefLight?'reefLightReceiver=vec4(normalize(axisC),reefRock?10.:reefRay?9.:coralGlow?floor(pigment.a)-2.:fishCatchlight?4.:fishScale?3.:sandGlint?2.:softParticle?1.:splatIndex>=reefActorStart?11.:0.);':''}
  ${terrainKind?'terrainNormal=normalize(axisC);':''}
  ${refraction?`vec3 waterNormal=normalize(vec3(-surfaceWaterSlope.x,1.,-surfaceWaterSlope.y));
  if(water&&!dynamicWater){
    float slope=waterWaveAmplitude*cos(windTime*1.3+center.x*.8+center.z*.7);
    waterNormal=normalize(vec3(-slope*.8,1.,-slope*.7));
  }
  bool transmissionReady=${upperWater?'waterBody==1?refractionReadyUpper:':''}refractionReady;
  if(water&&transmissionReady&&!reflectionPass&&!refractionPass){
    vec3 surface=center.xyz+(axisA*dot(localU,localCoord)+axisB*dot(localV,localCoord))*brushScale*footprintScale;
    transmittedRay=refractedRay(surface,waterNormal${upperWater?',waterBody==1':''});
  }`:''}
  if(water&&${upperWater?'(waterBody==1?reflectionReadyUpper:reflectionReady)':'reflectionReady'}&&!reflectionPass${refraction?'&&!refractionPass':''}){
    vec4 reflected=${upperWater?'(waterBody==1?reflectionMatrixUpper:reflectionMatrix)':'reflectionMatrix'}*vec4(center.xyz,1.);
    vec2 uv=reflected.xy/reflected.w;
    ${paintedWater?PAINTED_WATER_UV_GLSL:'uv+=vec2(sin(center.z*reflectionRippleScale.x+windTime*.9),cos(center.x*reflectionRippleScale.y+windTime*.7))*reflectionSettings.zw;'}
    vec2 waterSlope=surfaceWaterSlope;
    if(dynamicWater)uv+=waterSlope*vec2(.027,.018);
    if(reflected.w>0.&&all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){
      float fresnel=reflectionSettings.x+reflectionSettings.y*pow(1.-abs(normalize(cameraPosition-center.xyz).y),3.);
      if(dynamicWater)fresnel=clamp(reflectionSettings.x+reflectionSettings.y*pow(1.-max(0.,dot(normalize(vec3(-waterSlope.x,1.,-waterSlope.y)),normalize(cameraPosition-center.xyz))),3.),0.,.97);
      ${refraction?'if(transmissionReady)fresnel=max(waterReflectionFloor,waterFresnel(waterNormal,normalize(center.xyz-cameraPosition)));':''}
      ${upperWater?'vec3 reflectedColor=waterBody==1?texture(waterReflectionUpper,uv).rgb:texture(waterReflection,uv).rgb;':paintedWater?PAINTED_WATER_COLOR_GLSL:`vec3 reflectedColor=texture(waterReflection,uv).rgb;
      if(reflectionBlur>0.)reflectedColor=reflectedColor*.5+(texture(waterReflection,uv+vec2(reflectionBlur,0.)).rgb+texture(waterReflection,uv-vec2(reflectionBlur,0.)).rgb)*.25;
      if(reflectionBlurY>0.)reflectedColor=reflectedColor*.5+(texture(waterReflection,uv+vec2(0.,reflectionBlurY)).rgb+texture(waterReflection,uv-vec2(0.,reflectionBlurY)).rgb)*.25;
      if(any(notEqual(reflectionTint,vec3(1.))))reflectedColor*=reflectionTint;`}
      ${refraction?'if(transmissionReady)refractedReflection=vec4(reflectedColor,fresnel);else ':''}paintColor=mix(paintColor,reflectedColor,fresnel);
    }
  }
  if(glint){float pulse=waterTwinkle(seed,${shoreGlitter?'glintTime':'windTime'});if(glintFloor>0.)pulse=mix(glintFloor,1.,pulse);opacity*=pulse;}
  ${fossils?FOSSIL_FINISH_GLSL:''}
  ${forestCaustics?FOREST_CAUSTIC_APPLY_GLSL:''}
  if(groundFog){
    ${seasonalSnow?'opacity*=forestDensity(center.xz,windTime);':`float cosine=max(abs(dot(normalize(axisC),normalize(cameraPosition-center.xyz))),.4);
    opacity*=forestDensity(center.xz,windTime)/cosine;`}
    opacity*=smoothstep(1.,5.,distance(cameraPosition,center.xyz));
  }
  if(!sky&&!glint){
    float shadow=0.;
    for(int i=0;i<4;i++){
      if(i>=lowCloudCount)break;
      vec4 form=lowCloudForms[i];vec3 cloud=form.xyz+cloudDrift(lowCloudPhases[i],false);
      vec2 offset=center.xz-cloud.xz-vec2(.52,.35)*max(0.,cloud.y-center.y);
      vec2 aligned=vec2(dot(offset,vec2(.94,.34)),dot(offset,vec2(-.34,.94)));
      float footprint=length(aligned/vec2(form.w*1.8,form.w*.7));
      shadow=max(shadow,(1.-smoothstep(.35,1.3,footprint))*step(center.y,cloud.y+1.));
    }
    paintColor*=1.-shadow*.21;
  }
  ${cloudLight?`if(!sky&&!glint&&!softParticle)paintColor=cloudFilteredLight(paintColor,center.xyz,${seasonalSnow?'snowSeasonState.x':'0.'});`:''}
  ${seasonalSnow?`if(cliffEdge>0.&&!sky&&!softParticle){
    vec3 horizon=mix(fogColor,vec3(.72,.79,.86),snowSeasonState.x);
    paintColor=mix(paintColor,horizon,cliffEdge*.77);
  }`:''}
  ${splatMaterials?'if(specialSurface)paintColor=splatMaterialPigment(floor(pigment.a),paintColor,axisC,cameraPosition-center.xyz,axisA,seed,vec3(readSplat(1).w,readSplat(2).w,readSplat(3).w));':''}
  pigmentStrength=sky||softParticle?0.:((windKind>.5&&windKind<1.5)||windKind>6.5${forestCaustics?'&&windKind<15.5':''}?.15:1.);skyKernel=sky||softParticle?1.:0.;
  if(ghibli>.5&&!sky&&!softParticle${celPaint?'&&!cel':''})paintColor=gouacheColor(paintColor,gouacheSettings.z);
  // The sorted dark splats still attenuate any emitter behind them.
  if(emissionCapture)paintColor=splatIndex>=emissionStart?pow(paintColor,vec3(2.2)):vec3(0.);
  // View-relative atmospheric depth, applied to each 3D mark. The painted
  // sky supplies its own gradient and must not collapse into one fog color.
  float fogDepth=max(0.,length(p)-fogRange.x)*fogRange.y;
  ${seasonalSnow?'fogDepth*=1.+.38*snowSeasonState.x;':''}
  float upperMist=max(0.,center.y-fogHeight.x)*fogHeight.y;
  mist=sky${seasonalSnow?'||groundFog':''}?0.:min(fogRange.z,1.-exp(-pow(fogDepth,1.25)-upperMist));
  // Low distant haze joins the level square to the warm sky without a cut edge.
  float horizon=smoothstep(55.,110.,length(p))*exp(-max(center.y,0.)*.25);
  mistColor=mix(fogColor,fogHorizonColor,horizon);
  ${seasonalSnow?`mistColor=mix(mistColor,vec3(.72,.79,.86),snowSeasonState.x);
  float hazeSun=pow(max(0.,dot(normalize(center.xyz-cameraPosition),normalize(mix(vec3(-.57,.74,.44),WINTER_SUN,snowSeasonState.x)))),5.);
  mistColor+=hazeSun*vec3(.095,.061,.019)*(1.-snowSeasonState.x*.4);`:''}
}`;

const fragmentShader = (refraction=false,celPaint=false,upperWater=false,terrainKind=null,reefLight=false) => `
precision highp float;
${SSAO_FRAGMENT_DECLARATION}
uniform float painted;
uniform float coverage;
uniform float softness;
uniform float ghibli;
uniform float oilPaint;
// The shared wash and grain are fields over the surface; this is their
// frequency relative to the authored one (the inverse of the paper scale).
uniform float paperFrequency;
uniform vec3 gouacheSettings;
in vec2 localCoord;
in vec3 paintColor;
in float fogKernel;
in float opacity;
in float seed;
in float mist;
in vec3 mistColor;
in float pigmentStrength;
in float skyKernel;
${celPaint?'in float celKernel;':''}
in vec2 localU;
in vec2 localV;
in float defocusAmount;
in float defocusCoverage;
in float lodWeight;
in vec3 paintSurface;
${occlusionFragmentDeclaration(refraction)}
${GHIBLI_FRAGMENT_GLSL}
${OIL_FRAGMENT_GLSL}
${WATERCOLOR_FRAGMENT_GLSL}
${terrainFragmentGLSL(terrainKind)}
${reefLight?REEF_CAUSTIC_FRAGMENT+REEF_GLOW_FRAGMENT:''}
${reefLight?'uniform bool reefRays;':''}
${refraction?refractionFragmentGLSL(upperWater):''}
void main() {
${OCCLUSION_FRAGMENT_TEST}
  ${refraction?'if(refractionPass&&paintSurface.y>=waterLevel-.012)discard;':''}
  float r2=dot(localCoord,localCoord);
  if(r2>9.) discard;
${occlusionFragmentCapture(celPaint)}
  float gaussian=exp(-.5*r2);
  float baseAlpha=fogKernel>.5?1.-exp(-opacity*coverage*gaussian):min(.995,opacity*coverage*gaussian);
  vec2 brush=vec2(dot(localU,localCoord),dot(localV,localCoord));
  float edgeSoftness=softness+mist*.7+defocusAmount*2.+(1.-lodWeight)*.25;
  // The overcast sky uses round diffuse Gaussians in either rendering mode;
  // brush silhouettes and bristles belong to the architecture and pavement.
  float blurMix=smoothstep(0.,.6,defocusAmount);
  float alpha=baseAlpha*defocusCoverage;
  vec3 surfaceColor=${terrainKind?'terrainColor(paintSurface,normalize(terrainNormal))':'paintColor'};
  ${terrainKind?'if(ghibli>.5)surfaceColor=terrainWash(surfaceColor,paintSurface,normalize(terrainNormal));':''}
  ${refraction?'if(transmittedRay.w>0.||refractedReflection.a>0.)surfaceColor=mix(transmittedRay.w>0.?refractedPigment(paintColor):paintColor,refractedReflection.rgb,refractedReflection.a);':''}
  ${celPaint?`if(ghibli>.5&&celKernel>.5){
    // Cel-painted subjects keep authored color and a firm, opaque edge over
    // the gouache background. Covariance, depth sorting and reflections are
    // still those of the same 3D splats; there is no image/overlay pass.
    vec2 q=abs(localCoord);
    float edge=pow(pow(q.x,4.)+pow(q.y,4.),.25);
    float body=1.-smoothstep(1.38,1.62,edge);
    float celAlpha=(1.-exp(-7.*opacity*coverage))*body;
    alpha=mix(celAlpha,baseAlpha,blurMix)*defocusCoverage;
  }else `:''}if(ghibli>.5&&skyKernel<.5){
    vec3 settings=gouacheSettings;settings.x*=1.-blurMix;
    // oilPaint selects the mark: 0 gouache, 1 oil, 2 watercolour.
    vec4 mark=oilPaint>1.5?watercolorMark(localCoord,paintSurface*paperFrequency,${refraction||terrainKind?'surfaceColor':'paintColor'},opacity*coverage,seed,edgeSoftness,settings)
      :oilPaint>.5?oilMark(brush,${refraction||terrainKind?'surfaceColor':'paintColor'},opacity*coverage,seed,edgeSoftness,settings)
      :gouacheMark(localCoord,brush,paintSurface*paperFrequency,${refraction||terrainKind?'surfaceColor':'paintColor'},opacity*coverage,seed,edgeSoftness,settings);
    alpha=mix(mark.a,baseAlpha,blurMix)*defocusCoverage;
    surfaceColor=mark.rgb;
  }else if(painted>.5&&skyKernel<.5&&blurMix<1.){
    // Only the original painted mode needs this second brush kernel.
    float wobble=.055*sin(brush.x*5.+seed*61.)+.035*sin(brush.y*8.+seed*29.);
    float radius=sqrt(r2)+wobble;
    float silhouette=1.-smoothstep(1.60-.3*edgeSoftness,1.75+.5*edgeSoftness,radius);
    float bristles=.985+.015*sin(brush.y*14.+seed*117.+.65*sin(brush.x*2.8));
    float paintAlpha=(1.-exp(-7.5*opacity*coverage*gaussian))*silhouette*bristles;
    alpha=mix(baseAlpha,paintAlpha,painted*(1.-skyKernel)*(1.-blurMix))*defocusCoverage;
  }
  // Interpolate optical thickness so overlapping levels keep their coverage.
  if(lodWeight<.99999)alpha=1.-pow(max(1.-alpha,.00001),lodWeight);
  if(alpha<.004${reefLight?'&&reefLightReceiver.w!=9.':''}) discard;
${SSAO_FRAGMENT_CAPTURE}
  ${reefLight?`if(reefLightReceiver.w==9.){
    if(!reefRays||reefLightState.y<=0.)discard;
    float depth=reefLightState.z-paintSurface.y;
    // Evaluate the same caustic column below the nominal water plane. The
    // shafts continue overhead without a horizontal cap at that plane.
    vec2 projected=paintSurface.xz+REEF_LIGHT_DIRECTION.xz/REEF_LIGHT_DIRECTION.y*(depth-1.5)*.48;
    float energy=reefCausticEnergy(vec3(projected.x,reefLightState.z-1.5,projected.y),.9);
    float focus=energy/max(reefLightState.y,.001);
    float envelope=(1.-smoothstep(5.0,6.0,depth))*exp(-.07*max(0.,depth));
    alpha*=smoothstep(.065,.36,focus)*sqrt(reefLightState.y)*envelope*1.9;
    surfaceColor=mix(vec3(.59,.85,.87),vec3(.30,.51,.67),reefNightAmount);
    if(ghibli>.5){
      vec4 stroke=gouacheMark(localCoord,brush,paintSurface*paperFrequency,surfaceColor,opacity*coverage,seed,.7,gouacheSettings);
      vec2 column=paintSurface.xz+REEF_LIGHT_DIRECTION.xz/REEF_LIGHT_DIRECTION.y*depth*.48;
      float dryBrush=mix(.56,1.06,paintNoise(column*17.+vec2(depth*.11,-depth*.08)));
      alpha*=mix(.70,stroke.a/max(baseAlpha,.0001)*.60,.7)*dryBrush;
      surfaceColor=stroke.rgb;
    }
  }else if(reefLightReceiver.w==4.){
    vec3 viewDirection=normalize(cameraPosition-paintSurface);
    alpha*=smoothstep(.18,.59,dot(reefLightReceiver.xyz,viewDirection));
  }else if(reefLightReceiver.w==3.){
    vec3 normal=reefLightReceiver.xyz;
    float energy=reefCausticEnergy(paintSurface,max(0.,dot(normal,REEF_LIGHT_DIRECTION)));
    surfaceColor=reefCausticLight(surfaceColor,paintSurface,energy);
    surfaceColor=reefFishScaleLight(surfaceColor,normal,normalize(cameraPosition-paintSurface),energy,seed,r2);
  }else if(reefLightReceiver.w==2.){
    vec3 halfLight=normalize(REEF_LIGHT_DIRECTION+normalize(cameraPosition-paintSurface));
    float specular=pow(max(0.,dot(reefLightReceiver.xyz,halfLight)),12.);
    float focused=smoothstep(.065,.30,reefCausticEnergy(paintSurface,.86));
    {
      float originalAlpha=alpha;
      float sparkle=.045*specular+focused*(.30+3.45*specular);
      vec3 mineral=mix(vec3(.86,.96,1.),vec3(1.,.98,.88),seed);
      surfaceColor=mix(surfaceColor,mineral,min(.96,sparkle));
      alpha=min(.93,alpha*(.025+4.65*sparkle));
      if(reefNight){
        surfaceColor=mix(surfaceColor,mix(vec3(.22,.47,.86),vec3(.40,.71,.98),seed),reefNightAmount);
        float sparse=mix(.25,1.,smoothstep(.48,.88,seed));
        float nightAlpha=min(.22,originalAlpha*(.12+.46*specular+.34*focused)*sparse);
        alpha=mix(alpha,nightAlpha,reefNightAmount);
      }
    }
  }else if(reefLightState.y>0.){
    if(reefLightReceiver.w==1.){
      float light=reefCausticEnergy(paintSurface,.78);
      surfaceColor=mix(surfaceColor,vec3(.78,.94,.97),min(.65,light*1.22));
      alpha=min(.66,alpha*(1.+light*1.62));
    }else if(skyKernel<.5){
      float facing=max(0.,dot(reefLightReceiver.xyz,REEF_LIGHT_DIRECTION));
      surfaceColor=reefCausticLight(surfaceColor,paintSurface,reefCausticEnergy(paintSurface,facing));
    }
  }
  if(reefNight&&reefLightReceiver.w!=9.&&reefLightReceiver.w!=2.)surfaceColor=reefNightLight(surfaceColor,paintSurface,reefLightReceiver.xyz,reefLightReceiver.w,skyKernel>.5,reefFlowCoordinate);`:''}
  // Pigment modulation remains attached to each 3D mark, never screen noise.
  float pigment=1.;
  if(painted>.5&&ghibli<.5&&pigmentStrength>0.&&blurMix<1.)pigment+=painted*(1.-ghibli)*pigmentStrength*(1.-blurMix)*(.13*(fract(seed*137.1)-.5)+.012*sin(brush.y*10.+seed*41.));
  vec3 distanceColor=${reefLight?'mix(mistColor,reefNightAmbient(mistColor),reefNightAmount)':'mistColor'};
  vec3 color=mix(surfaceColor*pigment,distanceColor,mist);
  ${refraction?'if(refractionPass)color=surfaceColor*pigment;':''}
  fragColor=vec4(color,alpha);
${refraction?`#ifdef REFRACTION_CAPTURE
  float depth=clamp((waterLevel-paintSurface.y)/refractionSettings.w,0.,1.);
  submergedDepth=vec4(depth,depth,depth,alpha);
#endif`:''}
${OCCLUSION_FRAGMENT_END}
}`;

/** Median longest sigma of a scene's painted marks: the foreground marks with
 * an ordinary seed, or every foreground mark when a scene has none. At most
 * about 20,000 marks are sampled. */
function medianMarkSigma(data,sigma,background,count){
  if(!sigma||!count)return 0;
  const step=Math.max(1,Math.floor(count/20000)),plain=[],all=[];
  for(let index=0;index<count;index+=step){
    if(background?.[index]||!(data[index*20+3]>.05))continue;
    const seed=data[index*20+19];all.push(sigma[index]);if(seed>=0&&seed<1)plain.push(sigma[index]);
  }
  const values=plain.length?plain:all;if(!values.length)return 0;
  values.sort((a,b)=>a-b);return values[values.length>>1];
}
function createSplatGeometry(count){
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
  geometry.setIndex([0,1,2,0,2,3]);
  const indexAttribute=new THREE.InstancedBufferAttribute(new Float32Array(count),1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('splatIndex',indexAttribute);geometry.instanceCount=count;
  return {geometry,indexAttribute};
}

/** Full-rank 3D Gaussians, perspective covariance projection, sorted alpha. */
export class GaussianBrushRenderer {
  constructor(canvas,{sceneDefinitions=scenes}={}) {
    this.sceneDefinitions=sceneDefinitions;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
    this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;
    this.camera=new THREE.PerspectiveCamera(45,1,.08,600);this.camera.filmGauge=36;
    // Authored vertical FOV is resolved to millimeters only once the actual
    // viewport is known. Thereafter resize/export preserve the physical lens.
    this.focalLength=null;
    this.controls=new OrbitControls(this.camera,canvas);
    this.controls.enableDamping=false;this.controls.minDistance=2;this.controls.maxDistance=160;
    this.controls.maxPolarAngle=Math.PI-.04;this.controls.enablePan=true;
    this.controls.addEventListener('change',()=>{this.constrainOrbit();this.dirty=true;this.sortDirty=true;this.onInvalidate?.();});
    // A view the user is dragging or zooming is ordered on a worker (sortThroughWorker).
    this.lastPointerTime=-Infinity;this.sortClient=null;this.sortMoving=false;this.sortStreak=false;this.sortedOnce=false;this.sortEpoch=0;this.lastSortView=null;this.sortRequest=null;
    this.pointerTouch=event=>{if(event.type!=='pointermove'||event.buttons)this.lastPointerTime=performance.now();};
    for(const type of ['pointerdown','pointermove','wheel'])canvas.addEventListener?.(type,this.pointerTouch,{passive:true});
    this.options={mode:'paint',brushScale:1,coverage:1,softness:.2,quality:'draft',plantLOD:true,pixelFilter:false,indirect:true,bounceStrength:1,...COLOR_DEFAULTS,...LENS_DIRT_DEFAULTS,...SUN_DEFAULTS,...FLARE_DEFAULTS,...VIGNETTE_DEFAULTS,...DOF_DEFAULTS,...GHIBLI_DEFAULTS,...SSAO_DEFAULTS,...OCCLUSION_DEFAULTS,...MARK_LOD_DEFAULTS,...PREPASS_DEFAULTS,...SORT_WORKER_DEFAULTS,...STILL_DEFAULTS};
    this.sun=new PainterlySun();this.sun.mesh.renderOrder=-1;
    this.scene=new THREE.Scene();this.cache=new Map();this.size={width:1280,height:800};
    this.dirty=true;this.sortDirty=true;this.resizePending=true;this.disposed=false;
    this.autoOrbit=false;this.lastOrbitTime=null;this.pendingFence=null;this.fenceTime=0;
    this.gl=this.renderer.getContext();this.stats={count:0,calls:0,sortMs:0,width:0,height:0};
    this.contextLost=false;
    this.onContextLost=e=>{e.preventDefault();this.contextLost=true;this.onInvalidate?.();};
    canvas.addEventListener('webglcontextlost',this.onContextLost);
  }
  get needsFrame(){return !this.disposed&&!this.contextLost&&(this.dirty||this.sortMoving||this.lod?.animating||(this.options.foregroundDOF&&this.focus?.moving)||this.autoOrbit||this.windPlaying||this.sporesPlaying||this.actorPlaying||this.thermalPlaying||this.reefSequence?.playing||this.reefCaustics?.animating||this.causticClouds?.animating||this.cliffSeasons?.playing||!!this.pendingFence||this.stillPending);}
  /** A view at rest still has supersampling frames to draw. */
  get stillPending(){return this.options.stillRefine!==false&&!this.exporting&&Boolean(this.mesh)&&this.stillSamples<STILL_SCALE*STILL_SCALE&&this.stillSupported!==false&&this.stillWorthwhile();}
  load(index) {
    const definitions=this.sceneDefinitions??scenes;
    if(!definitions[index]) throw new Error('Unknown scene');
    this.limitedOrbit?.dispose();this.limitedOrbit=null;
    this.controls.enabled=true;
    const generation=this.loadGeneration=(this.loadGeneration??0)+1;
    this.reefSequence=null;
    this.reefAudio?.dispose();this.reefAudio=null;
    this.actor?.dispose();this.actor=null;this.actorPlaying=false;this.lastActorTime=null;this.actorError=null;
    this.sceneIndex=index;
    if(!this.cache.has(index)) this.cache.set(index,definitions[index].create());
    const definition=this.cache.get(index);
    this.actorLabel=definition.actorLabel??'dog';
    this.controls.minDistance=definition.orbitMin??2;
    this.controls.maxDistance=definition.orbitLimit??160;
    this.orbitMaxPolar=definition.orbitMaxPolar??Math.PI-.04;
    this.orbitMinY=definition.orbitMinY??-Infinity;
    this.controls.maxPolarAngle=this.orbitMaxPolar;
    this.controls.enablePan=definition.orbitPan??true;
    this.buildScene(definition);this.resetCamera();
    if(definition.cameraOrbit)this.limitedOrbit=new LimitedPondOrbit(this.camera,this.controls,this.renderer.domElement,definition.cameraOrbit,()=>{
      this.dirty=true;this.sortDirty=true;this.onInvalidate?.();
    });
    this.actorLoading=Boolean(definition.loadActor);this.onActorChange?.();
    this.actorReady=definition.loadActor?this.loadActor(definition,generation):Promise.resolve();
  }
  async loadActor(definition,generation){
    let actor;
    try{
      actor=await definition.loadActor();
      if(this.disposed||generation!==this.loadGeneration){actor.dispose();return;}
      // The environment bake stays immutable; moving surfaces use live normal lighting.
      const splats=[...definition.splats,...actor.splats],irradiance=new Float32Array(splats.length*3);
      irradiance.set(definition.lighting.irradiance);
      const windState={playing:this.windPlaying,time:this.windTime};
      const seasonState=this.cliffSeasons?{position:this.cliffSeasons.position,playing:this.cliffSeasons.playing}:null;
      const cloudState=this.causticClouds?{playing:this.causticClouds.playing,time:this.causticClouds.state.x}:null;
      let seasonalSnow=definition.seasonalSnow;
      if(seasonalSnow){
        seasonalSnow=new Uint8Array(splats.length*4);
        seasonalSnow.set(definition.seasonalSnow);
        if(actor.seasonalSnow)seasonalSnow.set(actor.seasonalSnow,definition.splats.length*4);
      }
      const reefState=this.reefCaustics?{night:this.reefCaustics.night.value,
        enabled:this.reefCaustics.enabled,playing:this.reefCaustics.playing,time:this.reefCaustics.state.x,glowEpoch:this.reefCaustics.glowEpoch.value,
        rays:this.reefCaustics.rays.value,diffraction:this.reefCaustics.diffraction.value}:null;
      this.buildScene({...definition,splats,seasonalSnow,physicsMotion:actor.physics?.motionBlur??null,physicsTraces:actor.physics?.sand?.atlas??null,physicsWater:actor.physics?.water??null,physicsMaterials:actor.physics?.materials??null,physicsSurfaceSnow:actor.physics?.surfaceSnow??null,reefActorStart:definition.splats.length,lighting:{...definition.lighting,irradiance},colorResponse:definition.colorResponse});
      this.windPlaying=windState.playing;this.windTime=windState.time;this.material.uniforms.windTime.value=this.windTime;
      if(seasonState){this.cliffSeasons.seek(seasonState.position);this.cliffSeasons.setPlaying(seasonState.playing);}
      if(cloudState){this.causticClouds.setPlaying(cloudState.playing);this.causticClouds.state.x=cloudState.time;}
      if(reefState){
        this.applyReefNight(this.reefSequence?.nightAmount??Number(reefState.night));
        this.reefCaustics.setEnabled(reefState.enabled);this.reefCaustics.setPlaying(reefState.playing);
        this.reefCaustics.state.x=reefState.time;
        this.reefCaustics.glowEpoch.value=reefState.glowEpoch;
        this.reefCaustics.rays.value=reefState.rays;
        this.reefCaustics.diffraction.value=reefState.diffraction;
      }
      this.actor=actor;actor.attachEngine?.(this);this.actorStart=definition.splats.length;this.actorPlaying=actor.autoplay!==false;this.lastActorTime=null;
      this.reefSequence?.setReady();
      this.actorLoading=false;this.onActorChange?.();this.onInvalidate?.();
    }catch(error){
      actor?.dispose();
      if(this.disposed||generation!==this.loadGeneration)return;
      this.actorLoading=false;this.actorError=error;this.onActorChange?.();this.onInvalidate?.();
      this.reefSequence?.setReady();
    }
  }
  async prepareMaterialEnvironment(url){
    if(!url)return;
    this.studioEnvironment??=new StudioEnvironment();
    await this.studioEnvironment.prepare(this.renderer,url);
    if(this.disposed)return;
    this.dirty=true;this.onInvalidate?.();
  }
  buildScene(definition){
    this.ssaoPass?.releaseCapture();this.stats.ssao={enabled:false,passes:0};
    this.occlusionPass?.releaseCapture();this.stats.occlusion={enabled:false};this.occlusionKey=null;this.occlusionStroke=null;
    this.markLodConfig=definition.markLOD??(this.sceneDefinitions??scenes)[this.sceneIndex]?.markLOD??null;this.prepassConfig=definition.vertexPrepass??(this.sceneDefinitions??scenes)[this.sceneIndex]?.vertexPrepass??false;this.paperConfig=definition.paperScale??(this.sceneDefinitions??scenes)[this.sceneIndex]?.paperScale??1;
    this.sortedOnce=false;this.sortMoving=false;this.sortStreak=false;this.lastSortView=null;this.sortEpoch++;this.steadyList?.clear();this.steadyRuns=0;this.steadySeen=null;
    this.markClusters=definition.markClusters??null;this.clusterHidden=null;this.clusterShown=null;this.clusterKey=null;this.stats.markClusters=null;this.markLodDrop=null;this.markLodKey=null;this.stats.markLOD={enabled:false};
    this.materialEnvironmentEnabled=Boolean(definition.materialEnvironment);
    this.fogDynamics=definition.interactiveFog?new FogDynamics(definition.interactiveFog):null;
    this.desert?.dispose();this.desert=definition.desert?new DesertEcosystem(definition):null;
    this.crystalStudio?.dispose();
    this.crystalStudio=definition.crystalStudio?new CrystalStudioPass(definition.crystalStudio):null;
    this.reefCaustics?.dispose();
    this.reefCaustics=definition.reefCaustics
      ?new ReefCaustics({...definition.reefCaustics,dayBackground:definition.background},!matchMedia('(prefers-reduced-motion: reduce)').matches):null;
    this.cliffSeasons?.dispose();
    const animateWeather=!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.reefSequence=this.reefCaustics?(this.reefSequence??new ReefSequence({reducedMotion:!animateWeather})):null;
    if(this.reefCaustics&&!this.reefAudio){
      this.reefAudio=new ReefAudio();this.reefAudio.onChange=()=>this.onReefLightChange?.();
    }
    if(this.reefSequence&&!definition.loadActor)this.reefSequence.setReady();
    this.reefDayColor=this.reefCaustics?new THREE.Color(definition.background):null;
    this.reefNightColor=this.reefCaustics?new THREE.Color('#081722'):null;
    this.reefClearColor=this.reefCaustics?new THREE.Color():null;
    this.cliffSeasons=definition.seasonalSnow?new CliffSeasons(definition.seasonalSnow,animateWeather,definition.winterFog,definition.vegetationWind,definition.meltWetMap,definition.snowTerrain):null;
    this.causticClouds?.dispose();
    this.causticClouds=definition.causticClouds
      ?new CausticClouds({...definition.causticClouds,horizon:definition.background},
        animateWeather,this.cliffSeasons?.uniforms):null;
    this.terrainKind=definition.terrainTexture?.kind??null;
    this.canvasOnSubject=definition.canvasOnSubject===true;
    this.emission=definition.emission;
    this.thermalMotion=definition.thermalMotion===true;
    this.thermalPlaying=this.thermalMotion&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.thermalTime=0;this.lastThermalTime=null;
    disposeUpperWater(this);
    disposeFossilMirrors(this);
    this.fossilMirrors=makeFossilMirrors(definition.refraction?definition.fossilMirrors:null,definition.splats.length);
    this.forestCaustics?.dispose();
    this.forestCaustics=definition.forestCaustics?new ForestCaustics(definition.forestCaustics):null;
    this.upperWater=definition.refraction&&definition.reflection?makeUpperWater(definition.upperWater,definition.splats.length):null;
    this.waterfalls=Boolean(definition.waterfalls);
    this.shoreGlitter=Boolean(definition.shoreGlitter);
    this.hasCelPaint=definition.splats.some(s=>s.celPaint&&!s.softParticle&&!s.noFog);
    this.hasSplatMaterials=definition.splatMaterials===true||definition.splats.some(s=>s.iridescent||s.jade||s.anisotropic||(s.surfaceType>=17&&s.surfaceType<=25));
    this.paintedWater=Boolean(definition.reflection?.paint);
    this.depthCache=null;this.nativeMovingCache=null;this.physicsMotion=definition.physicsMotion??null;this.physicsTraces=definition.physicsTraces??null;this.physicsWater=definition.physicsWater??null;this.physicsMaterials=definition.physicsMaterials??null;this.physicsSurfaceSnow=definition.physicsSurfaceSnow??null;
    this.water=definition.dynamicWater?new DynamicWater(definition.dynamicWater):null;
    this.focus??=new CameraFocus();this.focus.setScene(definition.splats);
    this.spores=definition.spores?new SporeDrift(definition.splats):null;
    this.lensParticleIndices=this.reefCaustics?this.spores?.records.filter(index=>definition.splats[index].material==='reef-particle'):null;
    this.sporesPlaying=Boolean(this.spores?.count)&&!this.reefCaustics;this.sporeTime=0;this.lastSporeTime=null;
    this.lod?.dispose();this.lod=null;this.stats.lod=null;this.lodCenterStorage=null;
    this.activeSplats=definition.splats;
    this.trampleTexture?.dispose();this.trampleTexture=null;this.trample=null;
    if(definition.trample){
      this.trample=new TrampleTrail(definition.trample);
      this.trampleTexture=new THREE.DataTexture(this.trample.data,this.trample.size,this.trample.size,THREE.RGBAFormat,THREE.FloatType);
      this.trampleTexture.minFilter=THREE.NearestFilter;this.trampleTexture.magFilter=THREE.NearestFilter;
      this.trampleTexture.generateMipmaps=false;this.trampleTexture.needsUpdate=true;
    }
    this.reflectionTarget?.dispose();this.reflectionTarget=null;this.reflectionConfig=definition.reflection;
    this.refractionTarget?.dispose();this.refractionTarget=null;
    this.refractionMaterial?.dispose();this.refractionMaterial=null;
    this.refraction=definition.refraction&&definition.reflection?refractionSettings(definition.refraction):null;
    if(this.refraction){
      this.refractionTarget=new THREE.WebGLRenderTarget(1,1,{count:2,depthBuffer:false,stencilBuffer:false});
      this.refractionIndices=new Uint32Array(definition.splats.length);
    }else this.refractionIndices=null;
    if(this.reflectionConfig){
      this.reflectionTarget=new THREE.WebGLRenderTarget(640,400,{depthBuffer:false,stencilBuffer:false});
      this.reflectionTarget.texture.generateMipmaps=false;
      this.reflectionCamera=this.camera.clone();this.reflectionOrder=Uint32Array.from({length:definition.splats.length},(_,i)=>i);this.reflectionViewKey=null;
    }
    if(!definition.lighting)definition.lighting=bakeIrradiance(definition.splats);
    this.stats.gi=definition.lighting.stats;
    if(!definition.colorResponse)definition.colorResponse=prepareColorResponse(definition.splats,definition.lighting);
    this.colorResponse=definition.colorResponse;
    this.geometry?.dispose();this.backgroundGeometry?.dispose();this.material?.dispose();this.textureUploads?.dispose();this.texture?.dispose();this.windTexture?.dispose();this.scene.clear();
    let packed=packSplats(definition.splats,this.renderer.capabilities.maxTextureSize,definition.lighting.irradiance);
    if(definition.lod){
      const capacity=Math.min(definition.lod.maxActiveSplats,Math.floor(packed.width*this.renderer.capabilities.maxTextureSize/5));
      const lod={...definition.lod,maxActiveSplats:capacity,draftMaxActiveSplats:Math.min(capacity,definition.lod.draftMaxActiveSplats)};
      this.lod=new PlantLOD({...definition,lod},packed,()=>{this.dirty=true;this.onInvalidate?.();});
      this.stats.lod=this.lod.stats;
      const height=Math.ceil(capacity*5/packed.width),data=new Float32Array(packed.width*height*4);
      data.set(packed.data);packed={...packed,data,height};
      this.lodCenterStorage=new Float32Array(capacity*3);this.lodCenterStorage.set(packed.centers);
    }
    this.centers=packed.centers;this.order=Uint32Array.from({length:definition.splats.length},(_,i)=>i);
    this.visibility=new SplatVisibility(packed.data,this.order.length);this.visibilityKey=null;
    this.texture=new THREE.DataTexture(packed.data,packed.width,packed.height,THREE.RGBAFormat,THREE.FloatType);
    this.texture.minFilter=THREE.NearestFilter;this.texture.magFilter=THREE.NearestFilter;this.texture.needsUpdate=true;this.texture.generateMipmaps=false;
    this.textureUploads=new SplatTextureUploads(this.renderer,this.texture);
    this.hasWind=Boolean(definition.animation?.indices.length||this.physicsMotion);this.windPlaying=this.hasWind&&(!this.cliffSeasons||animateWeather);this.windTime=0;this.lastWindTime=null;
    const windWidth=this.hasWind?Math.min(1024,this.renderer.capabilities.maxTextureSize):1;
    const windHeight=this.hasWind?Math.ceil(definition.splats.length/windWidth):1;
    const windData=new Float32Array(windWidth*windHeight*4);
    if(this.hasWind)for(const i of definition.animation?.indices??[])windData.set(definition.splats[i].wind,i*4);
    this.windTexture=new THREE.DataTexture(windData,windWidth,windHeight,THREE.RGBAFormat,THREE.FloatType);
    this.windTexture.minFilter=THREE.NearestFilter;this.windTexture.magFilter=THREE.NearestFilter;this.windTexture.generateMipmaps=false;this.windTexture.needsUpdate=true;
    // A distant sky wash sits behind the optical sun. Actual cloud volumes,
    // architecture and ground remain normal foreground occluders. Both batches
    // reference the same packed splats; noFog alone never implies background.
    this.backgroundFlags=Uint8Array.from(definition.splats,s=>s.skyBackground===true?1:0);
    const backgroundCount=this.backgroundFlags.reduce((sum,flag)=>sum+flag,0);
    ({geometry:this.geometry,indexAttribute:this.indexAttribute}=createSplatGeometry(this.lod?.capacity??(this.order.length-backgroundCount)));
    this.geometry.instanceCount=this.order.length-backgroundCount;
    this.backgroundGeometry=null;this.backgroundIndexAttribute=null;this.backgroundMesh=null;
    if(backgroundCount)({geometry:this.backgroundGeometry,indexAttribute:this.backgroundIndexAttribute}=createSplatGeometry(backgroundCount));
    this.updateSplatIndices();
    const atmosphere=definition.atmosphere;
    // Custom pigment shaders operate in display RGB, including the mist.
    const fogColor=new THREE.Color(atmosphere?.color||'#ffffff').convertLinearToSRGB();
    const fogHorizonColor=atmosphere?.horizonColor?new THREE.Color(atmosphere.horizonColor).convertLinearToSRGB():fogColor.clone();
    this.paperSigma=medianMarkSigma(packed.data,this.visibility?.sigma,this.backgroundFlags,definition.splats.length);
    const shaders=this.splatShaders();
    this.material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,...shaders,
      uniforms:{splatData:{value:this.texture},dataWidth:{value:packed.width},viewport:{value:new THREE.Vector2(1280,800)},brushScale:{value:1},painted:{value:1},coverage:{value:1},softness:{value:.2},fogColor:{value:fogColor},fogHorizonColor:{value:fogHorizonColor},fogRange:{value:new THREE.Vector3(atmosphere?.start??0,atmosphere?.density??0,atmosphere?.max??0)},fogHeight:{value:new THREE.Vector2(atmosphere?.heightStart??0,atmosphere?.heightDensity??0)}},
      transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,blending:THREE.NormalBlending});
    Object.assign(this.material.uniforms,terrainTextureUniforms(definition.terrainTexture,this.renderer),
      this.causticClouds?.uniforms,this.cliffSeasons?.uniforms,this.fogDynamics?.uniforms,this.desert?.uniforms,this.forestCaustics?.uniforms);
    if(this.hasSplatMaterials)Object.assign(this.material.uniforms,splatMaterialUniforms(this.options));
    if(this.reefCaustics)Object.assign(this.material.uniforms,{
      reefLightVolume:{value:this.reefCaustics.texture},reefLightState:{value:this.reefCaustics.state},
      reefGlowVolume:{value:this.reefCaustics.glow??this.reefCaustics.texture},reefNight:this.reefCaustics.night,
      reefNightAmount:this.reefCaustics.nightAmount,
      reefGlowEpoch:this.reefCaustics.glowEpoch,
      reefOpening:{value:this.reefSequence.stages},reefActorStart:{value:definition.reefActorStart??1e9},
      reefGlowMap:{value:this.reefCaustics.glowMap??this.texture},
      reefRays:this.reefCaustics.rays,
      reefDiffraction:{value:this.reefCaustics.diffractionActive},reefLensOptics:{value:new THREE.Vector3()},
    });
    Object.assign(this.material.uniforms,{windData:{value:this.windTexture},windWidth:{value:windWidth},windTime:{value:0},hasWind:{value:this.hasWind}});
    if(this.physicsMotion)Object.assign(this.material.uniforms,this.physicsMotion.uniforms);
    if(this.physicsSurfaceSnow)Object.assign(this.material.uniforms,this.physicsSurfaceSnow.uniforms);
    if(this.physicsMaterials)Object.assign(this.material.uniforms,this.physicsMaterials.uniforms);
    if(this.physicsTraces)Object.assign(this.material.uniforms,this.physicsTraces.uniforms);
    if(this.physicsWater)Object.assign(this.material.uniforms,this.physicsWater.uniforms);
    Object.assign(this.material.uniforms,{hasTrample:{value:Boolean(this.trample)},trampleData:{value:this.trampleTexture??this.texture},
      trampleBounds:{value:new THREE.Vector4(...(this.trample?.bounds??[0,0,1,1]))},trampleTime:{value:0},trampleRecovery:{value:this.trample?.recovery??1},trampleIntensity:{value:definition.trample?.intensity??1}});
    Object.assign(this.material.uniforms,{dofSettings:{value:new THREE.Vector4()},hasLodBlend:{value:false},lodProgress:{value:1}});
    Object.assign(this.material.uniforms,{ghibli:{value:0},oilPaint:{value:0},paperFrequency:{value:1},gouacheSettings:{value:new THREE.Vector3()}});
    Object.assign(this.material.uniforms,{paintNoiseMap:{value:this.paintNoise?.texture??null}});
    Object.assign(this.material.uniforms,{emissionCapture:{value:false},emissionStart:{value:this.emission?.start??-1}});
    Object.assign(this.material.uniforms,SplatOcclusion.uniforms());
    Object.assign(this.material.uniforms,{markLod:{value:new THREE.Vector2(0,1e9)}});
    Object.assign(this.material.uniforms,{frameJitter:{value:new THREE.Vector2()}});this.leaveStill();this.stillSamples=0;this.stats.still={samples:0,of:STILL_SCALE*STILL_SCALE};
    if(this.thermalMotion){
      const skeleton=definition.thermalSkeleton;
      Object.assign(this.material.uniforms,{
        thermalTime:{value:0},thermalDorsal:{value:skeleton.dorsal},
        thermalBoneStarts:{value:skeleton.starts.map(value=>new THREE.Vector4().fromArray(value))},
        thermalBoneEnds:{value:skeleton.ends.map(value=>new THREE.Vector4().fromArray(value))},
      });
    }
    const cloudForms=Array.from({length:4},(_,i)=>{const c=definition.lowClouds?.[i];return c?new THREE.Vector4(...c.center,c.radius):new THREE.Vector4();});
    Object.assign(this.material.uniforms,{
      reflectionPass:{value:false},reflectionReady:{value:false},waterLevel:{value:definition.reflection?.level??0},
      waterfallPaths:{value:Array.from({length:16},(_,i)=>new THREE.Vector4(...(definition.waterfallPaths?.[i]??[0,0,0,0])))},
      waterfallWidths:{value:Array.from({length:16},(_,i)=>new THREE.Vector2(...(definition.waterfallWidths?.[i]??[0,1])))},
      waterReflection:{value:this.texture},reflectionMatrix:{value:new THREE.Matrix4()},
      reflectionSettings:{value:new THREE.Vector4(...(definition.reflection?.blend??[.56,.27]),...(definition.reflection?.distortion??[.0018,.0018]))},reflectionBlur:{value:definition.reflection?.blur??0},
      reflectionBlurY:{value:definition.reflection?.blurY??0},reflectionTint:{value:new THREE.Vector3(...(definition.reflection?.tint??[1,1,1]))},
      reflectionRippleScale:{value:new THREE.Vector2(...(definition.reflection?.rippleScale??[2.3,1.7]))},
      waterWaveAmplitude:{value:definition.reflection?.waveAmplitude??.012},
      refractionPass:{value:false},refractionReady:{value:false},waterRefraction:{value:this.texture},waterRefractionDepth:{value:this.texture},refractionMatrix:{value:new THREE.Matrix4()},
      refractionSettings:{value:new THREE.Vector4(this.refraction?.ior??1.333,this.refraction?.strength??1,this.refraction?.clarity??.72,this.refraction?.maxDepth??16)},
      waterAbsorption:{value:new THREE.Vector3(...(this.refraction?.absorption??[.3,.105,.065]))},
      waterReflectionFloor:{value:definition.reflection?.minReflectance??0},
      dynamicWater:{value:Boolean(this.water)},waterDynamics:{value:new THREE.Vector4(this.water?.amplitude??0,this.water?.speed??0,...(this.water?.flow??[0,0]))},
      waterRipples:{value:Array.from({length:8},(_,i)=>new THREE.Vector4(...(this.water?.ripples[i]??[0,0,-100,0])))},
      waterObstacles:{value:Array.from({length:12},(_,i)=>new THREE.Vector3(...(this.water?.obstacles[i]??[0,0,0])))},waterObstacleCount:{value:this.water?.obstacles.length??0},
      lowCloudCount:{value:Math.min(4,definition.lowClouds?.length??0)},lowCloudForms:{value:cloudForms},
      lowCloudPhases:{value:new THREE.Vector4(...Array.from({length:4},(_,i)=>definition.lowClouds?.[i]?.phase??0))},
    });
    Object.assign(this.material.uniforms,upperWaterUniforms(this.upperWater,this.texture));
    Object.assign(this.material.uniforms,fossilUniforms(this.fossilMirrors,this.texture));
    if(this.refraction)this.refractionMaterial=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,...shaders,defines:{REFRACTION_CAPTURE:1},uniforms:this.material.uniforms,
      transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,blending:THREE.NormalBlending});
    if(this.backgroundGeometry){
      this.backgroundMesh=new THREE.Mesh(this.backgroundGeometry,this.material);
      this.backgroundMesh.frustumCulled=false;this.backgroundMesh.renderOrder=-2;this.scene.add(this.backgroundMesh);
      // The sky wash is blended before every foreground splat.
      this.backgroundMesh.onBeforeRender=(renderer,scene,camera,geometry,material)=>{material.uniforms.occlusionCount.value=-1;material.uniformsNeedUpdate=true;};
    }
    if(this.causticClouds)this.scene.add(this.causticClouds.sky);
    this.sun.mesh.renderOrder=-1;
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=0;this.scene.add(this.sun.mesh,this.mesh);
    this.mesh.onBeforeRender=(renderer,scene,camera,geometry,material)=>{material.uniforms.occlusionCount.value=geometry.instanceCount;material.uniformsNeedUpdate=true;};
    // The thin material reads what the pre-pass records for this very view.
    // It runs before the frame's pass opens, so that pass is never split.
    this.scene.onBeforeRender=(renderer,scene,camera)=>{
      if(this.prepass&&this.mesh?.visible&&this.mesh.material===this.prepass.draw)this.prepass.capture(renderer,camera,this.mesh);
    };
    this.renderer.setClearColor(definition.background||'#70b8d3',1);
    this.stats.count=this.order.length;this.resizePending=true;this.applyStyle();this.colorDirty=true;this.dirty=true;this.sortDirty=true;this.onInvalidate?.();
  }
  resetCamera(){
    const config=(this.sceneDefinitions??scenes)[this.sceneIndex??0].camera;
    if(this.limitedOrbit){
      this.limitedOrbit.reset();this.setCameraFov(config.fov||45);
      if(config.focalLength)this.setFocalLength(config.focalLength);
      return;
    }
    this.camera.position.fromArray(config.position);this.controls.target.fromArray(config.target);this.setCameraFov(config.fov||45);
    if(config.fitAspect){
      const fit=Math.max(1,config.fitAspect/this.getViewportAspect());
      this.camera.position.sub(this.controls.target).multiplyScalar(fit).add(this.controls.target);
    }
    if(config.focalLength)this.setFocalLength(config.focalLength);
    this.camera.lookAt(this.controls.target);this.camera.updateProjectionMatrix();this.controls.update();
    this.dirty=true;this.sortDirty=true;this.onInvalidate?.();
  }
  getViewportAspect(){
    const width=this.size?.width,height=this.size?.height;
    return Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0?width/height:this.camera.aspect;
  }
  getFocalLength(){
    if(Number.isFinite(this.focalLength)&&this.focalLength>0)return this.focalLength;
    // A pre-render UI read must not freeze a provisional/default aspect ratio.
    const filmHeight=36/Math.max(this.getViewportAspect(),1);
    return .5*filmHeight/Math.tan(THREE.MathUtils.degToRad(this.camera.fov)*.5);
  }
  applyLensAspect(aspect){
    this.camera.filmGauge=36;this.camera.aspect=aspect;
    if(!Number.isFinite(this.focalLength)||this.focalLength<=0){
      this.focalLength=this.camera.getFocalLength();this.camera.updateProjectionMatrix();
    }else this.camera.setFocalLength(this.focalLength);
  }
  setFocalLength(mm){
    if(!Number.isFinite(mm)||mm<=0)throw new RangeError('Focal length must be a positive finite number.');
    // The UI offers 18–135mm. Saved authored FOVs at unusually wide aspect
    // ratios may lie outside that range, so their exact framing remains valid.
    this.focalLength=Math.min(1000,Math.max(1,mm));this.applyLensAspect(this.getViewportAspect());
    this.dirty=true;this.onInvalidate?.();
  }
  setCameraFov(fov){
    if(!Number.isFinite(fov)||fov<=0||fov>=180)throw new RangeError('Camera FOV must be between 0 and 180 degrees.');
    this.camera.filmGauge=36;this.camera.fov=fov;this.camera.aspect=this.getViewportAspect();this.camera.updateProjectionMatrix();
    this.focalLength=null;this.dirty=true;this.onInvalidate?.();
  }
  resize(width,height){this.size={width:Math.max(1,width),height:Math.max(1,height)};this.resizePending=true;this.dirty=true;this.onInvalidate?.();}
  splatShaders(){
    const refraction=Boolean(this.refraction),upperWater=Boolean(this.upperWater),reefLight=Boolean(this.reefCaustics);
    return {
      vertexShader:(shader=>{if(this.physicsMotion)shader=this.physicsMotion.shader(shader);if(this.physicsSurfaceSnow)shader=this.physicsSurfaceSnow.shader(shader);if(this.physicsMaterials)shader=this.physicsMaterials.shader(shader);if(this.physicsTraces)shader=this.physicsTraces.shader(shader,{physical:Boolean(this.physicsMaterials)});return this.physicsWater?this.physicsWater.shader(shader):shader;})((this.desert?desertShader:shader=>shader)(vertexShader(refraction,this.shoreGlitter,this.hasCelPaint,this.paintedWater,
        this.waterfalls,upperWater,Boolean(this.fossilMirrors?.length),this.thermalMotion,this.terrainKind,reefLight,Boolean(this.causticClouds),Boolean(this.cliffSeasons),Boolean(this.forestCaustics),this.hasSplatMaterials))),
      fragmentShader:fragmentShader(refraction,this.hasCelPaint,upperWater,this.terrainKind,reefLight),
    };
  }
  applyStyle(){
    if(!this.material)return;const u=this.material.uniforms,o=this.options;
    // Compile away the expensive gouache kernel in the two simpler modes.
    // Three caches these three programs across style switches; other controls
    // remain uniforms. Preserve the separate refraction material's defines.
    for(const material of [this.material,this.refractionMaterial])if(material){
      material.userData??={};
      const pixelFilter=o.pixelFilter===true;
      if(material.userData.splatMode!==o.mode||material.userData.pixelFilter!==pixelFilter){
        // Gouache showed no repeatable bounds win. Refracted rays and the hard
        // waterline clip also need the original interpolation in both passes.
        const specialize=shader=>(o.mode==='ghibli'||this.refraction)?shader.replace(supportGLSL,'  localCoord=position.xy*3.;'):shader
          .replace('uniform float ghibli;','const float ghibli=0.;')
          .replace('uniform float painted;',`const float painted=${o.mode==='gaussian'?0:1}.;`);
        const shaders=this.splatShaders();
        material.vertexShader=specialize(shaders.vertexShader);material.fragmentShader=specialize(shaders.fragmentShader);
        if(pixelFilter)material.vertexShader=GAUSSIAN_FILTER_GLSL+material.vertexShader.replace(PIXEL_FILTER_HOOK,pixelFilterVertexGLSL(o.mode));
        material.userData.pixelFilter=pixelFilter;
        material.userData.splatMode=o.mode;material.needsUpdate=true;
      }
    }
    u.brushScale.value=o.brushScale;u.painted.value=o.mode==='gaussian'?0:1;u.coverage.value=o.coverage;u.softness.value=o.softness;
    u.ghibli.value=o.mode==='ghibli'?1:0;u.oilPaint.value=o.mode!=='ghibli'?0:o.watercolor===true?2:o.oil===true?1:0;
    u.gouacheSettings.value.set(o.gouacheTexture??GHIBLI_DEFAULTS.gouacheTexture,o.gouacheBlend??GHIBLI_DEFAULTS.gouacheBlend,o.gouacheTone??GHIBLI_DEFAULTS.gouacheTone);
    const paper=this.paperScale();u.paperFrequency.value=1/paper;
    (this.stats??={}).paper=paperFit(this.paperSigma,o.brushScale*(o.mode==='ghibli'?1+(o.gouacheBlend??GHIBLI_DEFAULTS.gouacheBlend)*.18:1),paper);
  }
  updateColors(){
    if(!this.colorDirty||!this.colorResponse)return;
    this.texture.clearUpdateRanges();
    applyColorResponse(this.colorResponse,this.options,this.texture.image.data);
    this.actor?.physics?.writeNativePacked(this.texture.image.data,this.centers,this.textureUploads,true);
    this.texture.needsUpdate=true;this.colorDirty=false;
  }
  updatePlantLOD(now){
    if(!this.lod)return;
    const selection=this.lod.update(this.camera,{...this.options,height:this.stats.height,focusDistance:this.getFocusDistance(),enabled:this.options.plantLOD!==false},now);
    this.material.uniforms.hasLodBlend.value=Boolean(this.lod.transition);
    this.material.uniforms.lodProgress.value=this.lod.progress;
    if(!selection)return;
    const result=this.lod.write(selection,this.texture.image.data,this.lodCenterStorage);
    this.activeSplats=result.splats;this.colorResponse=result.response;
    this.spores?.setSplats(result.splats);
    this.centers=this.lodCenterStorage.subarray(0,selection.count*3);
    this.visibility.update(this.texture.image.data,selection.count);this.visibilityKey=null;
    this.order=Uint32Array.from({length:selection.count},(_,i)=>i);
    this.geometry.instanceCount=selection.count;this.stats.count=selection.count;
    this.texture.needsUpdate=true;this.colorDirty=true;this.sortDirty=true;
  }
  setStyle(key,value){
    if(this.options[key]===value&&key!=='autoFocus'&&key!=='focusDistance')return;
    if(key==='autoFocus'){
      if(!value&&this.options.autoFocus)this.options.focusDistance=this.getFocusDistance();
      this.focus?.release();
    }
    if(key==='focusDistance'){this.focus?.release();this.options.autoFocus=false;}
    if(key==='quality')this.resizePending=true;
    this.options[key]=value;
    if(COLOR_STYLE_KEYS.has(key))this.colorDirty=true;
    if(['mode','pixelFilter','brushScale','coverage','softness','gouacheTexture','gouacheBlend','gouacheTone'].includes(key))this.applyStyle();
    this.dirty=true;this.onInvalidate?.();
  }
  getFocusDistance(){return this.focus?.current??this.camera.position.distanceTo(this.controls.target);}
  setWaterMotion(key,value){
    if(!this.water||!['amplitude','speed'].includes(key)||!Number.isFinite(value))return;
    this.water[key]=Math.max(0,Math.min(key==='amplitude'?.12:2,value));
    this.material.uniforms.waterDynamics.value.set(this.water.amplitude,this.water.speed,...this.water.flow);
    this.dirty=true;this.onInvalidate?.();
  }
  setWaterRefraction(key,value){
    if(!this.refraction)return;
    if(key==='enabled')this.refraction.enabled=Boolean(value);
    else if(['strength','clarity'].includes(key)&&Number.isFinite(value))this.refraction[key]=Math.max(0,Math.min(1,value));
    else return;
    const r=this.refraction;this.material.uniforms.refractionSettings.value.set(r.ior,r.strength,r.clarity,r.maxDepth);
    this.dirty=true;this.onInvalidate?.();
  }
  disturbWaterAt(x,y){
    if(!this.water)return false;
    const raycaster=new THREE.Raycaster();raycaster.setFromCamera(new THREE.Vector2(x,y),this.camera);
    let hit=null;
    if(this.upperWater){
      const upperHit=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-this.upperWater.level),new THREE.Vector3());
      if(upperHit&&this.upperWater.contains?.(upperHit.x,upperHit.z))hit=upperHit;
    }
    hit??=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-this.reflectionConfig.level),new THREE.Vector3());
    if(!hit||!this.water.disturb(hit.x,hit.z,this.windTime))return false;
    this.water.ripples.forEach((r,i)=>this.material.uniforms.waterRipples.value[i].fromArray(r));
    this.dirty=true;this.onInvalidate?.();return true;
  }
  focusAt(x,y){
    const hit=this.focus?.meter(this.camera,{height:this.stats.height,brushScale:this.options.brushScale,x,y,click:true});
    if(!hit)return false;
    this.focus.hold(hit.point);this.options.autoFocus=false;this.options.focusDistance=hit.distance;
    this.dirty=true;this.onInvalidate?.();return true;
  }
  disturbFogAt(x,y){
    if(!this.fogDynamics)return false;
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x,y),this.camera);
    const hit=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.55),new THREE.Vector3());
    if(!hit||!this.fogDynamics.disturb(hit.x,hit.z,this.windTime-.1,1.5))return false;
    this.dirty=true;this.onInvalidate?.();return true;
  }
  constrainOrbit(){
    if(!Number.isFinite(this.orbitMinY))return;
    const camera=this.camera,target=this.controls.target;
    const dx=camera.position.x-target.x,dz=camera.position.z-target.z;
    const radius=camera.position.distanceTo(target),floorY=this.orbitMinY-target.y;
    this.controls.maxPolarAngle=Math.min(this.orbitMaxPolar,Math.acos(THREE.MathUtils.clamp(floorY/Math.max(radius,.001),-1,1)));
    if(camera.position.y<this.orbitMinY){
      const horizontal=Math.hypot(dx,dz),reach=Math.sqrt(Math.max(0,radius*radius-floorY*floorY));
      const scale=reach/Math.max(horizontal,.001);
      camera.position.set(target.x+dx*scale,this.orbitMinY,target.z+dz*scale);
      camera.lookAt(target);
    }
  }
  setAutoOrbit(enabled){this.autoOrbit=Boolean(enabled)&&!this.limitedOrbit;this.lastOrbitTime=null;this.dirty=true;this.onInvalidate?.();}
  setWindPlaying(enabled){this.windPlaying=Boolean(enabled)&&this.hasWind;this.lastWindTime=null;this.dirty=true;this.onInvalidate?.();}
  setReefCaustics(key, value){
    if(!this.reefCaustics)return;
    if(key==='diffraction'){this.reefCaustics.diffraction.value=value;this.visibilityKey=null;}
    else if(key==='rays')this.reefCaustics.rays.value=value;
    else if(key==='enabled')this.reefCaustics.setEnabled(value);
    else this.reefCaustics.setPlaying(value);
    this.dirty=true;this.onInvalidate?.();
  }
  setReefNight(night){
    this.reefSequence?.setNight(night);
    this.applyReefNight(Number(night));
  }
  applyReefNight(amount){
    const light=this.reefCaustics;
    if(!light?.glow)return;
    const wasNight=light.night.value;
    light.setNightAmount(amount);
    this.renderer.setClearColor(this.reefClearColor.copy(this.reefDayColor).lerp(this.reefNightColor,amount),1);
    if(wasNight!==light.night.value){this.visibilityKey=null;this.onReefLightChange?.();}
    this.dirty=true;this.onInvalidate?.();
  }
  replayReefOpening(){
    if(!this.reefSequence)return;
    this.reefSequence.replay();this.applyReefNight(0);
    if(this.actor){
      this.actor.time=0;this.actor.advance(0);
      this.actor.writePacked(this.texture.image.data,this.centers,this.actorStart);
      this.textureUploads.mark(this.actorStart*20,this.actor.splats.length*20);
      this.lastActorTime=null;this.sortDirty=true;
    }
    this.dirty=true;this.onInvalidate?.();
  }
  setSporesPlaying(enabled){this.sporesPlaying=Boolean(enabled)&&Boolean(this.spores?.count);this.lastSporeTime=null;this.dirty=true;this.onInvalidate?.();}
  setThermalPlaying(enabled){
    this.thermalPlaying=Boolean(enabled)&&this.thermalMotion;
    this.lastThermalTime=null;this.onActorChange?.();this.onInvalidate?.();
  }
  advanceThermal(dt){
    this.thermalTime+=dt;
    this.material.uniforms.thermalTime.value=this.thermalTime;
    this.dirty=true;
  }
  setActorPlaying(enabled){this.actorPlaying=Boolean(enabled)&&Boolean(this.actor);this.actor?.audio?.setActive(this.actorPlaying&&!document.hidden);this.lastActorTime=null;this.dirty=true;this.onActorChange?.();this.onInvalidate?.();}
  gpuReady(){
    if(!this.pendingFence)return true;
    const status=this.gl.clientWaitSync(this.pendingFence,0,0);
    if(status===this.gl.TIMEOUT_EXPIRED){
      if(performance.now()-this.fenceTime>4000){this.contextLost=true;throw new Error('The GPU is taking too long. Reload the study in Low power mode.');}
      return false;
    }
    this.gl.deleteSync(this.pendingFence);this.pendingFence=null;
    if(status===this.gl.WAIT_FAILED){this.contextLost=true;throw new Error('The GPU could not complete this frame. Reload the study.');}
    return true;
  }
  fence(){
    this.pendingFence=this.gl.fenceSync(this.gl.SYNC_GPU_COMMANDS_COMPLETE,0);
    if(!this.pendingFence){this.contextLost=true;throw new Error('Could not allocate a GPU fence. Reload the study.');}
    this.gl.flush();this.fenceTime=performance.now();
  }
  movingEnvironmentIndices(){
    const spores=this.spores?.records,native=this.actor?.physics?.movingIndices;
    if(!native?.length)return spores??null;if(!spores?.length)return native;
    const old=this.nativeMovingCache;if(old?.spores===spores&&old.native===native)return old.indices;
    const indices=Uint32Array.from([...spores,...native]);this.nativeMovingCache={spores,native,indices};return indices;
  }
  updateSplatIndices(camera=null,reflection=false,width=this.stats.width,height=this.stats.height){
    // While the worker supplies the main list, it is not rebuilt here.
    if(camera&&!reflection&&this.sortMoving)return;
    const cull=camera&&this.visibility&&this.frustumCulling!==false&&width&&height;
    let key=null;
    if(cull){
      camera.updateMatrixWorld(true);
      const o=this.options;
      key=this.visibilityKeyOf(camera,reflection,width,height);
      if(key===this.visibilityKey)return;
      const counts=this.visibility.write(this.order,this.centers,camera,o,this.indexAttribute.array,this.backgroundIndexAttribute?.array,this.backgroundFlags,
        {width,height,reflection,transition:Boolean(this.lod?.transition),wind:this.hasWind?this.windTexture.image.data:null,actorStart:this.actor?this.actorStart:Infinity,cacheKey:key,movingIndices:this.movingEnvironmentIndices(),opticalPixels:this.reefCaustics?.diffractionActive?18:0,reach:!reflection&&this.markLodPixels()?MARK_LOD_MAX_SCALE:1});
      // The main list is compacted once, for stand-ins and level of detail together.
      const losers=this.hideClusterLosers(camera,reflection,width,height,counts.foreground,key,reflection);counts.foreground-=losers;counts.submitted-=losers;
      if(!reflection)counts.submitted-=this.withholdMarks(camera,counts,width,height,key);
      this.geometry.instanceCount=counts.foreground;
      if(this.backgroundGeometry)this.backgroundGeometry.instanceCount=counts.background;
      if(!reflection){this.stats.submitted=counts.submitted;this.stats.culled=counts.culled;}
    }else if(this.backgroundIndexAttribute){
      let foreground=0,background=0;
      for(const index of this.order){
        if(this.backgroundFlags[index])this.backgroundIndexAttribute.array[background++]=index;
        else this.indexAttribute.array[foreground++]=index;
      }
      this.geometry.instanceCount=foreground-this.hideClusterLosers(camera,reflection,width,height,foreground);this.backgroundGeometry.instanceCount=background;
    }else{this.indexAttribute.array.set(this.order);this.geometry.instanceCount=this.order.length-this.hideClusterLosers(camera,reflection,width,height,this.order.length);}
    if(!cull&&!reflection){this.stats.submitted=this.order.length;this.stats.culled=0;}
    this.visibilityKey=key;
    if(this.backgroundIndexAttribute)this.backgroundIndexAttribute.needsUpdate=true;
    this.indexAttribute.needsUpdate=true;
  }
  /** Everything the submitted list of a camera depends on besides the marks. */
  visibilityKeyOf(camera,reflection,width,height){
    const o=this.options;
    return [...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements,camera.near,camera.far,width,height,o.brushScale,o.foregroundDOF,o.dofStrength,o.mode,o.gouacheBlend,Boolean(this.lod?.transition),reflection,this.actor?this.actorStart:-1,Boolean(this.reefCaustics?.diffractionActive),reflection?0:this.markLodPixels()].join(',');
  }
  sortDepths(camera,order,reflection=false){
    const records=this.movingEnvironmentIndices(),actorStart=this.actor?this.actorStart:0,actorCount=this.actor?.splats.length??0;
    const view=camera.matrixWorldInverse.elements;
    if(!records?.length&&!actorCount)return depthOrder(this.centers,view,order);
    let cache=this.depthCache;
    if(!cache||cache.centers!==this.centers||cache.records!==records||cache.actorStart!==actorStart||cache.actorCount!==actorCount){
      const moving=[...(records??[])];for(let i=0;i<actorCount;i++)moving.push(actorStart+i);
      cache=this.depthCache={centers:this.centers,records,actorStart,actorCount,moving};
    }
    const key=reflection?'reflection':'main';
    cache[key]??=new DynamicDepthOrder(this.centers,cache.moving);
    return cache[key].sort(view,order);
  }
  sort(){
    const start=performance.now();this.camera.updateMatrixWorld(true);
    if(this.sortThroughWorker(start)){this.sortDirty=false;this.stats.sortMs=performance.now()-start;return;}
    // The main thread's list is the exact one; any worker job still out is void.
    this.sortEpoch++;this.sortMoving=false;this.sortedOnce=true;this.stats.sortWorker={active:false};
    if(this.mergeSteadyActor()){this.sortDirty=false;this.stats.sortMs=performance.now()-start;return;}
    this.sortDepths(this.camera,this.order);
    this.visibilityKey=null;this.updateSplatIndices(this.camera);this.sortDirty=false;
    this.noteSteadyList();
    this.stats.sortMs=performance.now()-start;
  }
  /** Scenes in which the actor's marks are the only ones that move and the
   * main list is the only one drawn. */
  steadyEligible(){
    return this.steadyMerge!==false&&Boolean(this.actor)&&this.centers.length/3>this.actorStart&&this.order.length===this.centers.length/3
      &&Boolean(this.visibility)&&this.frustumCulling!==false&&!this.movingEnvironmentIndices()?.length
      &&!this.lod&&!this.desert&&!this.reflectionConfig&&!this.refraction&&!this.upperWater&&!this.fossilMirrors?.length&&!this.crystalStudio;
  }
  /** At a view that has not changed since a list was recorded, only the
   * actor's marks are sorted and merged into the recorded environment part
   * (SteadyList.js). Anything that could change that part declines: another
   * view or style, a rebuilt depth cache, or a visibility key someone has
   * cleared since. Returns whether the list was written. */
  mergeSteadyActor(){
    const steady=this.steadyList;
    if(!steady?.key||this.visibilityKey!==steady.key||steady.depthCache!==this.depthCache||steady.centers!==this.centers||steady.geometry!==this.geometry
      ||steady.actorCount!==this.centers.length/3-this.actorStart||!this.steadyEligible())return false;
    if(this.visibilityKeyOf(this.camera,false,this.stats.width,this.stats.height)!==steady.key)return false;
    this.geometry.instanceCount=steady.merge(this.centers,this.camera.matrixWorldInverse.elements,this.actorStart,this.indexAttribute.array);
    this.indexAttribute.needsUpdate=true;this.stats.steadyList={active:true,environment:steady.count,actor:steady.actorCount};
    return true;
  }
  /** After a full rebuild: once the same view has been built three times
   * running, its culling, stand-in choice and level-of-detail verdicts have
   * settled, and the list is recorded for mergeSteadyActor. */
  noteSteadyList(){
    const key=this.visibilityKey;this.stats.steadyList={active:false};
    if(!key||!this.steadyEligible()||(this.markLodPixels()&&this.markLodKey!==key)){this.steadyRuns=0;this.steadySeen=null;this.steadyList?.clear();return;}
    this.steadyRuns=key===this.steadySeen?this.steadyRuns+1:1;this.steadySeen=key;
    if(this.steadyRuns<3)return;
    const steady=this.steadyList??=new SteadyList();
    if(steady.capture(key,this.indexAttribute.array,this.geometry.instanceCount,this.centers,this.camera.matrixWorldInverse.elements,this.actorStart,this.centers.length/3-this.actorStart))
      Object.assign(steady,{depthCache:this.depthCache,centers:this.centers,geometry:this.geometry});
  }
  /** What the order and the submitted list depend on besides the marks. */
  sortViewKey(){
    const o=this.options,camera=this.camera;
    return [...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements,camera.near,camera.far,this.stats.width,this.stats.height,o.brushScale,o.foregroundDOF,o.dofStrength,o.mode,o.gouacheBlend,this.markLodPixels()].join(',');
  }
  /** Scenes whose list the worker can build: one batch drawn from one camera,
   * with every mark in the order. Mirrors, water and plant level of detail
   * draw other lists and stay on the main thread. */
  sortWorkerEligible(){
    const count=this.centers.length/3;
    return this.options.sortWorker!==false&&this.sortedOnce&&!this.exporting&&SplatSortClient.supported()&&!this.sortClient?.failed
      &&count>=SORT_WORKER_MIN_SPLATS&&this.order.length===count&&Boolean(this.visibility)&&this.frustumCulling!==false
      &&!this.lod&&!this.desert&&!this.reflectionConfig&&!this.refraction&&!this.upperWater&&!this.fossilMirrors?.length&&!this.crystalStudio
      &&(!this.markClusters||Boolean(this.clusterShown));
  }
  /** While the user drags or zooms the view, or it orbits by itself, the
   * list for each new view is asked of the worker and the last one it
   * returned keeps being drawn. Any other change of view, and the first frame
   * after the view stops, is ordered here as before. Returns whether the
   * worker has this view. */
  sortThroughWorker(now){
    const view=this.sortViewKey(),changed=view!==this.lastSortView;this.lastSortView=view;
    const moving=changed&&(this.autoOrbit||now-this.lastPointerTime<SORT_WORKER_LINGER||this.sortStreak)&&this.sortWorkerEligible();
    this.sortStreak=moving;
    if(!moving)return false;
    this.sortMoving=true;
    this.postWorkerSort(view);
    return true;
  }
  /** Asks the worker for the list of the view as it is now, unless a job is
   * out: its answer asks again if the view has moved on meanwhile. */
  postWorkerSort(view){
    const client=this.sortClient??=new SplatSortClient(result=>this.applyWorkerSort(result),()=>{this.sortMoving=false;this.sortDirty=true;this.dirty=true;this.onInvalidate?.();});
    if(client.busy)return;
    const o=this.options,camera=this.camera,clusters=this.markClusters,data=this.texture.image.data,count=this.centers.length/3,wind=this.hasWind?this.windTexture.image.data:null;
    client.setScene([this.centers,this.visibility,this.visibility.version,wind,this.backgroundFlags,clusters,this.actor?this.actorStart:-1,count,data],()=>({
      count,actorStart:this.actor?this.actorStart:Infinity,sigma:this.visibility.sigma,wind,flags:this.backgroundFlags,
      clusters:clusters?{starts:clusters.starts,members:clusters.members,merged:clusters.merged,pixels:clusters.pixels,standIns:standInRows(clusters,data)}:null}));
    if(clusters){const moved=this.movingEnvironmentIndices();if(moved?.length)refreshClusterStill(clusters,this.clusterStill,data,moved,this.clusterOwner);}
    this.sortRequest={epoch:this.sortEpoch,generation:client.generation,view};
    client.request({view:Array.from(camera.matrixWorldInverse.elements),projection:Array.from(camera.projectionMatrix.elements),near:camera.near,far:camera.far,width:this.stats.width,height:this.stats.height,
      options:{brushScale:o.brushScale,foregroundDOF:o.foregroundDOF,dofStrength:o.dofStrength,mode:o.mode,gouacheBlend:o.gouacheBlend},
      opticalPixels:this.reefCaustics?.diffractionActive?18:0,reach:this.markLodPixels()?MARK_LOD_MAX_SCALE:1,slack:SORT_WORKER_SLACK,
      footprint:o.brushScale*(o.mode==='ghibli'?1+(o.gouacheBlend??GHIBLI_DEFAULTS.gouacheBlend)*.18:1),clusterEnabled:this.markLodPixels()>0,
      still:clusters?this.clusterStill:null,shown:clusters?this.clusterShown:null,
      centers:this.centers,foregroundCapacity:this.indexAttribute.array.length,backgroundCapacity:this.backgroundIndexAttribute?.array.length??0});
  }
  /** Takes over a list the worker has built. If the view has moved on since
   * it was asked, the view as it is now is asked at once; if it has not, the
   * order is marked dirty and the next frame builds the exact list here. */
  applyWorkerSort(result){
    const request=this.sortRequest;this.sortRequest=null;
    if(this.disposed||!this.mesh||!this.sortMoving||!request||request.epoch!==this.sortEpoch||request.generation!==result.generation)return;
    this.dirty=true;
    if(result.ok){
      const {counts}=result;
      this.indexAttribute.array.set(result.foreground.subarray(0,counts.foreground));this.indexAttribute.needsUpdate=true;this.geometry.instanceCount=counts.foreground;
      if(this.backgroundIndexAttribute&&result.background){
        this.backgroundIndexAttribute.array.set(result.background.subarray(0,counts.background));this.backgroundIndexAttribute.needsUpdate=true;this.backgroundGeometry.instanceCount=counts.background;
      }
      // The stand-in choice carries on from here, whichever thread makes the next one.
      if(result.shown&&this.clusterShown){this.clusterShown.set(result.shown);this.stats.markClusters={groups:this.clusterShown.length,shown:result.clusterShown};}
      this.stats.submitted=counts.submitted;this.stats.culled=counts.culled;
      this.stats.sortWorker={active:true,jobs:(this.stats.sortWorker?.jobs??0)+1};
    }
    // Only now: the next job takes the buffers this list arrived in.
    this.camera.updateMatrixWorld(true);
    const view=this.sortViewKey();
    if(view!==request.view&&this.sortWorkerEligible())this.postWorkerSort(view);else this.sortDirty=true;
    this.onInvalidate?.();
  }
  renderWaterReflection(){
    if(!this.reflectionTarget||this.options.waterReflection===false){
      this.material.uniforms.reflectionReady.value=false;return;
    }
    const u=this.material.uniforms,level=this.reflectionConfig.level;
    if(this.camera.position.y<=level+.05){u.reflectionReady.value=false;return;}
    const camera=this.reflectionCamera;camera.copy(this.camera);
    if(this.paintedWater){
      // Capture above/below the visible frame for the vertical pigment filter.
      // The main camera remains the authored 80 mm lens.
      camera.projectionMatrix.elements[5]/=PAINTED_WATER_OVERSCAN;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
    const target=this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()));
    if(this.reflectionConfig.fossilPlane){
      const {point,normal}=this.reflectionConfig.fossilPlane,n=new THREE.Vector3(...normal).normalize(),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(n,new THREE.Vector3(...point));
      camera.position.addScaledVector(n,-2*plane.distanceToPoint(camera.position));target.addScaledVector(n,-2*plane.distanceToPoint(target));camera.up.reflect(n);
    }else{camera.position.y=2*level-camera.position.y;target.y=2*level-target.y;camera.up.y*=-1;}
    camera.lookAt(target);camera.updateMatrixWorld(true);
    const key=[...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements].join(',');
    if(key!==this.reflectionViewKey){this.sortDepths(camera,this.reflectionOrder,true);this.reflectionViewKey=key;}
    u.reflectionMatrix.value.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1)
      .multiply(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
    const width=this.paintedWater?Math.round(Math.min(960,600*this.camera.aspect)):Math.round(Math.min(this.reflectionConfig.resolution??640,400*this.camera.aspect)),height=Math.round(width/this.camera.aspect);
    if(this.reflectionTarget.width!==width||this.reflectionTarget.height!==height)this.reflectionTarget.setSize(width,height);
    const previousTarget=this.renderer.getRenderTarget(),viewport=u.viewport.value.clone(),order=this.order;
    try{
      this.order=this.reflectionOrder;this.updateSplatIndices(camera,true,width,height);
      // Never sample a texture while it is attached to the active framebuffer.
      u.waterReflection.value=this.texture;u.reflectionReady.value=false;u.reflectionPass.value=true;u.viewport.value.set(width,height);
      this.sun.update(camera,this.options);this.renderer.setRenderTarget(this.reflectionTarget);this.renderer.clear();this.renderer.render(this.scene,camera);
    }finally{
      this.renderer.setRenderTarget(previousTarget);u.viewport.value.copy(viewport);u.reflectionPass.value=false;
      u.waterReflection.value=this.reflectionTarget.texture;u.reflectionReady.value=true;
      this.order=order;this.updateSplatIndices(this.camera);this.sun.update(this.camera,this.options);
    }
  }
  renderWaterRefraction(){
    const u=this.material.uniforms,r=this.refraction;
    u.refractionReady.value=false;
    if(!this.refractionTarget||!r.enabled||this.camera.position.y<=this.reflectionConfig.level+.05)return;
    const width=Math.round(Math.min(r.resolution,400*this.camera.aspect)),height=Math.max(1,Math.round(width/this.camera.aspect));
    if(this.refractionTarget.width!==width||this.refractionTarget.height!==height)this.refractionTarget.setSize(width,height);
    u.refractionMatrix.value.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1).multiply(this.camera.projectionMatrix).multiply(this.camera.matrixWorldInverse);
    const previousTarget=this.renderer.getRenderTarget(),viewport=u.viewport.value.clone(),clear=this.renderer.getClearColor(new THREE.Color()),clearAlpha=this.renderer.getClearAlpha();
    const material=this.mesh.material,sunVisible=this.sun.mesh.visible,backgroundVisible=this.backgroundMesh?.visible;
    const footprint=this.options.brushScale*(1+(this.options.mode==='ghibli'?(this.options.gouacheBlend??GHIBLI_DEFAULTS.gouacheBlend)*.18:0));
    const visibleOrder=this.indexAttribute.array.subarray(0,this.geometry.instanceCount);
    const count=submergedOrder(visibleOrder,this.centers,this.texture.image.data,this.windTexture.image.data,this.backgroundFlags,this.reflectionConfig.level,footprint,this.refractionIndices);
    this.stats.refractionSplats=count;
    try{
      this.indexAttribute.array.set(this.refractionIndices.subarray(0,count));this.indexAttribute.needsUpdate=true;this.geometry.instanceCount=count;
      this.mesh.material=this.refractionMaterial;this.sun.mesh.visible=false;if(this.backgroundMesh)this.backgroundMesh.visible=false;
      // Unbind both attachments before rendering to them (including inactive shader branches).
      u.waterRefraction.value=this.texture;u.waterRefractionDepth.value=this.texture;u.refractionPass.value=true;u.viewport.value.set(width,height);
      this.renderer.setRenderTarget(this.refractionTarget);this.renderer.setClearColor(0,0);this.renderer.clear();this.renderer.render(this.scene,this.camera);
    }finally{
      this.renderer.setRenderTarget(previousTarget);this.renderer.setClearColor(clear,clearAlpha);u.viewport.value.copy(viewport);u.refractionPass.value=false;
      this.mesh.material=material;this.sun.mesh.visible=sunVisible;if(this.backgroundMesh)this.backgroundMesh.visible=backgroundVisible;
      u.waterRefraction.value=this.refractionTarget.textures[0];u.waterRefractionDepth.value=this.refractionTarget.textures[1];
      this.visibilityKey=null;this.updateSplatIndices(this.camera);
    }
    u.refractionReady.value=true;
  }
  renderScene(){
    this.reefAudio?.setListener(this.camera);
    this.textureUploads.flush();
    // Callers that draw outside render() also start from the preview size.
    this.leaveStill();
    // Every paint noise field in the splat shader reads this lattice.
    this.material.uniforms.paintNoiseMap.value=(this.paintNoise??=new PaintNoiseMap()).render(this.renderer);
    this.updateSplatIndices(this.camera);
    this.choosePrepass();
    const o=this.options;
    if(this.hasSplatMaterials){
      const settings=materialSettings(o),u=this.material.uniforms;
      u.splatFilm.value.fromArray(settings.film);u.splatFilmVariation.value=settings.variation;u.splatSurface.value.fromArray(settings.surface);u.splatMetal.value.fromArray(settings.metal);
      const environment=this.materialEnvironmentEnabled?this.studioEnvironment:null;
      u.splatEnvironment.value=environment?.target?.texture??null;
      u.splatEnvironmentState.value.set(environment?.target?1:0,settings.environment[0],settings.environment[1],environment?.maxLod??0);
    }
    this.material.uniforms.dofSettings.value.set(o.foregroundDOF?o.dofStrength:0,this.getFocusDistance(),o.dofRange,o.dofSwirl);
    this.material.uniforms.reefLensOptics?.value.set(this.camera.getFocalLength()*.001,this.getFocusDistance(),FOREGROUND_F_NUMBER);
    if(this.reefCaustics)this.material.uniforms.reefDiffraction.value=this.reefCaustics.diffractionActive;
    this.sun.update(this.camera,this.options);
    const aoEnabled=ssaoSettings(o).enabled&&!this.crystalStudio;
    const diffraction=o.lensDiffraction??Boolean(this.reefCaustics?.diffractionActive);
    const postEnabled=Boolean(this.cliffSeasons?.cameraLUT)||this.options.mode==='ghibli'||(this.options.lensDirt&&this.options.lensDirtStrength>0)
      ||diffraction||o.chromaticAberration===true||Boolean(this.reefSequence&&this.reefSequence.exposure<1)
      ||(this.options.lensFlare&&this.options.lensFlareStrength>0&&this.options.sun&&this.options.sunIntensity>0)
      ||(this.options.painterlyVignette&&this.options.vignetteStrength>0)||aoEnabled;
    // Only offscreen rendering repurposes alpha as solar visibility. Direct
    // canvas output retains ordinary opaque source-over alpha, including PNGs.
    this.sun.material.blendSrcAlpha=postEnabled?THREE.ZeroFactor:THREE.OneFactor;
    const info=this.renderer.info,autoReset=info.autoReset;info.autoReset=false;info.reset();
    try{
      if(this.crystalStudio){
        const sunVisible=this.sun.mesh.visible;
        this.sun.mesh.visible=false;
        try{this.crystalStudio.render(this.renderer,this.scene,this.camera,o);}
        finally{this.sun.mesh.visible=sunVisible;}
        this.stats.calls=info.render.calls;
        return;
      }
      if(!this.upperWater||waterPlaneVisible(this,this.reflectionConfig.bounds,this.reflectionConfig.level)){
        this.renderWaterReflection();this.renderWaterRefraction();
      }else{this.material.uniforms.reflectionReady.value=false;this.material.uniforms.refractionReady.value=false;}
      renderUpperWater(this);
      renderFossilMirrors(this);
      let ambientOcclusion=null;
      if(aoEnabled){
        this.ssaoPass??=new SplatSSAO();
        ambientOcclusion=this.ssaoPass.render(this.renderer,this.scene,this.camera,this.mesh,this.material,o);
        this.stats.ssao={enabled:true,...this.ssaoPass.stats};
      }else this.stats.ssao={enabled:false,passes:0};
      // Level of detail applies to the passes that draw the main camera's
      // withheld list: the occlusion capture and the beauty passes.
      this.material.uniforms.markLod.value.set(this.markLodPixels(),this.markLodEnd());
      const occlusion=this.renderOcclusion();
      this.material.uniforms.occlusionActive.value=occlusion;
      try{
      if(postEnabled){
        this.lensDirtPass??=new LensDirtPass(this.renderer);
        this.lensDirtPass.render(this.renderer,this.scene,this.camera,this.options,this.activeSplats,this.canvasOnSubject,
          this.emission?this.material.uniforms.emissionCapture:null,Boolean(this.reefCaustics),this.reefCaustics?.night.value??false,diffraction,this.cliffSeasons?.cameraLUT??null,
          this.cliffSeasons?this.cliffSeasons.state.x*this.cliffSeasons.state.y*(1-this.cliffSeasons.state.z):1,
          this.lensParticleIndices?.length?{indices:this.lensParticleIndices,centers:this.centers,data:this.texture.image.data}:null,
          this.reefSequence?.exposure??1,ambientOcclusion);
      }else this.renderer.render(this.scene,this.camera);
      }finally{this.material.uniforms.occlusionActive.value=false;this.material.uniforms.markLod.value.x=0;}
      this.stats.calls=info.render.calls;
    }finally{info.autoReset=autoReset;}
  }
  /** The preview is drawn with fewer pixels than the display shows. */
  stillWorthwhile(){
    const canvas=this.renderer.domElement,shown=(canvas?.clientWidth??0)*(globalThis.devicePixelRatio??1);
    return shown>this.stats.width*1.05;
  }
  /** Draws the next sub-pixel phase of a view at rest; after the last one the
   * canvas shows the interleaved image at STILL_SCALE times the preview
   * resolution. Returns whether a frame was drawn. */
  refineStill(){
    if(!this.stillPending||!(this.stillSupported??=StillAccumulator.supported(this.renderer)))return false;
    const viewport=this.material.uniforms.viewport.value,jitter=this.material.uniforms.frameJitter.value,phases=stillPhases(STILL_SCALE);
    const phase=phases[this.stillSamples],width=viewport.x,height=viewport.y;
    this.still??=new StillAccumulator();
    jitter.set(2*phase.shift[0]/width,2*phase.shift[1]/height);
    try{this.renderScene();}finally{jitter.set(0,0);}
    this.still.add(this.renderer,width,height,STILL_SCALE,phase);
    if(++this.stillSamples===phases.length){this.still.present(this.renderer,width,height,STILL_SCALE);this.stillShown=true;}
    this.stats.still={samples:this.stillSamples,of:phases.length,scale:STILL_SCALE,shown:Boolean(this.stillShown)};
    this.fence();return true;
  }
  /** Returns the canvas to the preview resolution after a still was shown. */
  leaveStill(){
    if(!this.stillShown)return;
    this.stillShown=false;this.renderer.setSize(this.stats.width,this.stats.height,false);
  }
  /** Footprint threshold of the scene's mark level of detail, or 0 while it
   * must not run: exports keep every mark, and passes that redraw the main
   * list at another resolution (refraction, AO) or another renderer path
   * would see the withheld list without the matching enlargement. */
  markLodPixels(){
    const o=this.options,config=this.markLodConfig;
    if(!config||o.markLOD===false||this.exporting||this.lod||this.refraction||this.crystalStudio||ssaoSettings(o).enabled)return 0;
    return config.pixels;
  }
  /** For scenes with merged stand-ins: draws either each group's stand-in or
   * its members, never both. The choice follows the main camera and is reused
   * by every other pass of the frame; without a camera, while the level of
   * detail is off (exports, AO), or where physics has moved a member, a
   * group shows its members. Returns how
   * many of the first `count` submitted splats were removed. */
  hideClusterLosers(camera,reflection,width,height,count,key=null,compact=true){
    const clusters=this.markClusters;
    if(!clusters)return 0;
    const total=this.texture.image.data.length/20;
    if(this.clusterHidden?.length!==total){
      this.clusterHidden=new Uint8Array(total);this.clusterShown=new Uint8Array(clusters.merged.length);this.clusterKey=null;
      this.clusterStill=new Uint8Array(clusters.merged.length).fill(1);this.clusterOwner=clusterOwners(clusters,total);this.clusterVerified=null;
      for(const index of clusters.merged)this.clusterHidden[index]=1;
    }
    const hidden=this.clusterHidden,indices=this.indexAttribute.array;
    // The choice only changes with the view or style, or while physics is
    // moving marks; a steady camera reuses it frame after frame.
    // Physics names the marks it has ever moved, so while the camera moves
    // only their groups are rechecked; every member is read once the view
    // repeats, which also catches a mark moved by anything else.
    const moving=this.movingEnvironmentIndices(),fresh=key===null||key!==this.clusterKey,verify=key===null||(!fresh&&this.clusterVerified!==key);
    if(camera&&!reflection&&width&&height&&(fresh||verify||moving?.length)){
      this.clusterKey=key;if(verify)this.clusterVerified=key;
      const o=this.options,footprint=o.brushScale*(o.mode==='ghibli'?1+(o.gouacheBlend??GHIBLI_DEFAULTS.gouacheBlend)*.18:1),data=this.texture.image.data;
      if(moving?.length&&!verify)refreshClusterStill(clusters,this.clusterStill,data,moving,this.clusterOwner);
      const shown=selectMarkClusters(clusters,this.clusterShown,hidden,data,
        {view:camera.matrixWorldInverse.elements,projection:camera.projectionMatrix.elements,width,height,footprint,enabled:this.markLodPixels()>0,still:this.clusterStill,verify});
      this.stats.markClusters={groups:clusters.merged.length,shown};
    }
    if(!compact)return 0;
    let kept=0;
    for(let i=0;i<count;i++){const index=indices[i];if(!hidden[index])indices[kept++]=index;}
    return count-kept;
  }
  /** Draws the main batch through the per-mark pre-pass in scenes that ask
   * for it, when their shader can be split; otherwise as before. Passes that
   * swap in their own capture material are unaffected. */
  choosePrepass(){
    const scene=Boolean(this.prepassConfig),wanted=scene&&this.options.vertexPrepass!==false&&SplatPrepass.supported(this.renderer);
    const draw=wanted?(this.prepass??=new SplatPrepass()).sync(this.renderer,this.material):null;
    // The record attributes must be on the geometry before three collects it.
    if(draw)this.prepass.prepare(this.geometry);
    this.mesh.material=draw??this.material;
    this.stats.prepass=draw?{enabled:true,layers:this.prepass.layers}:{enabled:false,reason:!scene?'scene':this.options.vertexPrepass===false?'off':this.prepass?.reason??'unsupported'};
  }
  /** Size of the shared wash and grain: the scene's authored value times the
   * style's. 1 leaves the paper at its authored world size. */
  paperScale(){
    const scale=(this.paperConfig??1)*(this.options.paperScale??1);
    return Number.isFinite(scale)?Math.min(PAPER_SCALE_RANGE[1],Math.max(PAPER_SCALE_RANGE[0],scale)):1;
  }
  /** First splat the drop-and-enlarge level of detail leaves alone: actors,
   * and before them the merged stand-ins, which are already the coarse form
   * of their group and sit at the end of the environment. */
  markLodEnd(){return Math.min(this.actor?this.actorStart:1e9,this.markClusters?this.markClusters.merged[0]:1e9);}
  /** Removes from the submitted list the marks the shader is certain to drop.
   * The verdicts depend only on the view and style, so they are kept until
   * the visibility key changes; a moving actor reuses them every frame. */
  withholdMarks(camera,counts,width,height,key){
    const pixels=this.markLodPixels(),hidden=this.markClusters?this.clusterHidden:null,indices=this.indexAttribute.array;
    if(!pixels&&!hidden){this.stats.markLOD={enabled:false};return 0;}
    const submitted=counts.foreground;let drop=null;
    if(pixels){
      const total=this.centers.length/3,moving=this.movingEnvironmentIndices();
      if(this.markLodDrop?.length!==total){this.markLodDrop=new Uint8Array(total);this.markLodKey=null;}
      if(this.markLodKey===key){drop=this.markLodDrop;if(moving)for(const index of moving)drop[index]=0;}
      // Verdicts for 300,000 marks cost about 10 ms. While the camera moves
      // the shader drops marks on its own; the list is thinned once a view
      // repeats, which is every frame of a steady camera.
      else if(this.markLodPending!==key)this.markLodPending=key;
      else{
        drop=this.markLodDrop;
        const o=this.options,blur=o.foregroundDOF?(o.dofStrength??.65):0;
        // The largest axis scale the shader can apply in this style.
        const footprint=o.brushScale*(this.lod?.transition?1.08:1)*(1+blur*1.5)*(o.mode==='ghibli'?1+(o.gouacheBlend??GHIBLI_DEFAULTS.gouacheBlend)*.18:1);
        // Verdicts cover the marks that survive stand-in selection.
        let listed=counts.foreground;
        if(hidden){listed=0;for(let i=0;i<counts.foreground;i++){const index=indices[i];if(!hidden[index])indices[listed++]=index;}counts.foreground=listed;}
        markLodDrops(drop,indices,listed,this.texture.image.data,this.hasWind?this.windTexture.image.data:null,
          {view:camera.matrixWorldInverse.elements,projection:camera.projectionMatrix.elements,width,height,pixels,footprint,actorStart:this.markLodEnd(),moving});
        this.markLodKey=key;
      }
    }
    const listed=counts.foreground;let kept=0,withheld=0;
    for(let i=0;i<listed;i++){
      const index=indices[i];
      if(hidden&&hidden[index])continue;
      if(drop&&drop[index]){withheld++;continue;}
      indices[kept++]=index;
    }
    counts.foreground=kept;
    this.stats.markLOD=pixels?{enabled:true,pixels,withheld}:{enabled:false};
    return submitted-kept;
  }
  /** Low-resolution occluder sets for the beauty pass. Gouache is the only
   * kernel expensive enough to repay a second vertex pass, and only while the
   * strokes on screen are wide enough to certify cover. Reef light rewrites
   * alpha per receiver after the kernel and oil strokes have no cheap bound,
   * so those views keep every fragment. */
  occlusionEnabled(){
    const o=this.options;
    if(o.occlusionCulling===false||o.mode!=='ghibli'||o.oil===true||o.watercolor===true||this.reefCaustics||this.crystalStudio
      ||this.geometry.instanceCount<OCCLUSION_MIN_SPLATS||!(this.occlusionSupported??=SplatOcclusion.supported(this.renderer)))return false;
    // The verdict only changes with the view, the style or the submitted set.
    const viewport=this.material.uniforms.viewport.value;
    const key=`${this.visibilityKey}|${this.geometry.instanceCount}|${viewport.x}|${viewport.y}`;
    if(this.visibilityKey===null||key!==this.occlusionKey){
      const footprint=o.brushScale*(1+(o.gouacheBlend??GHIBLI_DEFAULTS.gouacheBlend)*.18);
      this.camera.updateMatrixWorld(true);
      this.occlusionStroke=strokeWidth(this.texture.image.data,this.indexAttribute.array,this.geometry.instanceCount,
        this.camera.matrixWorldInverse.elements,this.camera.projectionMatrix.elements,viewport.x,viewport.y,footprint);
      this.occlusionKey=key;
    }
    return this.occlusionStroke>=OCCLUSION_MIN_STROKE;
  }
  renderOcclusion(){
    if(!this.occlusionEnabled()){this.stats.occlusion={enabled:false,stroke:this.occlusionStroke??null};return false;}
    this.occlusionPass??=new SplatOcclusion();
    // Export resizes the splat viewport without touching the preview stats.
    const viewport=this.material.uniforms.viewport.value;
    this.occlusionPass.render(this.renderer,this.scene,this.camera,this.mesh,this.material,viewport.x,viewport.y,this.occlusionScale);
    this.stats.occlusion={enabled:true,stroke:this.occlusionStroke,...this.occlusionPass.stats};
    return true;
  }
  updateTrample(time=this.actor?.time??0){
    if(!this.trample||!this.actor)return;
    const player=this.actor.crow?.controller??this.actor.controller;
    if(player?.grounded===false||this.actor.entrancePaused){
      this.trample.time=time;this.trample.previous=null;
    }else{
      const position=this.actor.root.position;
      this.trample.advance(position.x,position.z,time);
    }
    for(const row of this.trample.rows)this.trampleTexture.addUpdateRange(row*this.trample.size*4,this.trample.size*4);
    if(this.trample.rows.size)this.trampleTexture.needsUpdate=true;
    this.trample.rows.clear();this.material.uniforms.trampleTime.value=this.trample.time;
  }
  render(now=performance.now()){
    if(this.disposed||this.contextLost||!this.mesh||!this.gpuReady())return false;
    // The worker's list is in use but no job is out and nothing asks for one:
    // hand back to the main thread rather than keep a stale list.
    if(this.sortMoving&&!this.sortDirty&&!this.sortClient?.busy){this.sortDirty=true;this.dirty=true;}
    if(this.reefSequence?.advance(now)){
      if(this.reefCaustics.nightAmount.value!==this.reefSequence.nightAmount)this.applyReefNight(this.reefSequence.nightAmount);
      this.dirty=true;
    }
    if(this.actorPlaying&&(!this.reefSequence||this.reefSequence.stages[3]>0)){
      const dt=this.lastActorTime===null?0:Math.max(0,Math.min((now-this.lastActorTime)/1000,.1));
      this.lastActorTime=now;
      if(dt>0){
        this.actor.advance?.(dt);
        if(!this.actor.advance)this.actor.update(dt);
        this.actor.writePacked(this.texture.image.data,this.centers,this.actorStart);
        if(!this.colorDirty&&!this.lod){
          this.textureUploads.mark(this.actorStart*20,this.actor.splats.length*20);
        }else this.texture.needsUpdate=true;
        this.updateTrample();
        this.reflectionViewKey=null;
        this.sortDirty=true;this.dirty=true;
      }
    }
    if(this.sporesPlaying){
      if(this.lastSporeTime!==null)this.sporeTime+=Math.max(0,Math.min((now-this.lastSporeTime)/1000,.1));
      this.lastSporeTime=now;this.dirty=true;
    }
    if(this.windPlaying){
      if(this.lastWindTime!==null)this.windTime+=Math.max(0,Math.min((now-this.lastWindTime)/1000,.1));
      this.lastWindTime=now;this.material.uniforms.windTime.value=this.windTime;this.dirty=true;
    }
    if(this.reefCaustics?.animating&&this.reefCaustics.advance(now))this.dirty=true;
    if(this.causticClouds?.animating&&this.causticClouds.advance(now))this.dirty=true;
    if(this.cliffSeasons?.playing&&this.cliffSeasons.advance(now))this.dirty=true;
    if(this.thermalPlaying){
      if(this.lastThermalTime!==null)this.advanceThermal(Math.max(0,Math.min((now-this.lastThermalTime)/1000,.1)));
      this.lastThermalTime=now;
    }
    if(this.autoOrbit){
      if(this.lastOrbitTime!==null){
        const angle=Math.min((now-this.lastOrbitTime)/1000,.1)*.09;
        const offset=this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0,1,0),angle);
        this.camera.position.copy(this.controls.target).add(offset);this.controls.update();this.dirty=true;this.sortDirty=true;
      }
      this.lastOrbitTime=now;
    }
    if(this.lod?.animating||(this.options.foregroundDOF&&this.focus?.moving))this.dirty=true;
    // A list still on its way from the worker is not a view at rest.
    if(!this.dirty)return this.sortMoving?false:this.refineStill();
    this.leaveStill();this.stillSamples=0;this.stats.still={samples:0,of:STILL_SCALE*STILL_SCALE};
    if(this.resizePending){
      const max=this.options.quality==='studio'?1600:1100;
      const ratio=Math.min(1.5,max/this.size.width,1000/this.size.height);
      const width=Math.round(this.size.width*ratio),height=Math.round(this.size.height*ratio);
      this.renderer.setSize(width,height,false);this.material.uniforms.viewport.value.set(width,height);
      this.applyLensAspect(this.getViewportAspect());
      this.stats.width=width;this.stats.height=height;this.resizePending=false;
    }else if(!Number.isFinite(this.focalLength)||this.focalLength<=0)this.applyLensAspect(this.getViewportAspect());
    this.focus?.update(this.camera,{...this.options,height:this.stats.height},now,this.camera.position.distanceTo(this.controls.target));
    if(this.focus?.anchor)this.options.focusDistance=this.focus.target;
    this.updatePlantLOD(now);
    if(this.desert?.updateCenters(this.centers,this.windTime)){
      this.sortDirty=true;this.visibilityKey=null;
    }
    if(this.spores?.write(this.texture,this.centers,this.reefCaustics?.state.x??this.sporeTime,this.colorDirty,this.textureUploads)){
      this.sortDirty=true;this.visibilityKey=null;this.reflectionViewKey=null;
    }
    this.fogDynamics?.update(this.windTime);
    if(this.sortDirty)this.sort();
    this.updateColors();
    this.renderScene();this.fence();this.dirty=false;return true;
  }
  async waitForGPU(){const deadline=performance.now()+4500;while(!this.gpuReady()){if(performance.now()>deadline)throw new Error('GPU timeout');await new Promise(r=>setTimeout(r,20));}}
  /** A PNG of the current view. `scale` 1 is one frame of up to 1920 x 1200,
   * the most the GPU is asked to draw at once. Larger scales draw that frame
   * once per sub-pixel phase and interleave the results, so a 4x export is
   * sixteen ordinary frames, never one enormous one. */
  async exportPNG({scale=1}={}){
    if(!Number.isInteger(scale)||scale<1||scale>4)throw new RangeError('Export scale must be 1, 2, 3 or 4.');
    await this.waitForGPU();
    // Resolve legacy/authored FOV against the preview, before export rounding
    // changes the aspect ratio by a fraction of a pixel.
    this.stillShown=false;
    if(!Number.isFinite(this.focalLength)||this.focalLength<=0)this.applyLensAspect(this.getViewportAspect());
    const exportScale=Math.min(1920/this.size.width,1200/this.size.height);
    const width=Math.max(1,Math.round(this.size.width*exportScale)),height=Math.max(1,Math.round(this.size.height*exportScale));
    const originalOrbit=this.autoOrbit;this.autoOrbit=false;
    const jitter=this.material.uniforms.frameJitter?.value;
    try{
      this.exporting=true;
      this.renderer.setSize(width,height,false);this.material.uniforms.viewport.value.set(width,height);
      this.applyLensAspect(width/height);
      this.sort();this.updateColors();
      if(scale===1){
        this.renderScene();this.fence();await this.waitForGPU();
        const blob=await new Promise(resolve=>this.renderer.domElement.toBlob(resolve,'image/png'));
        if(!blob)throw new Error('Could not encode the frame');return blob;
      }
      const gl=this.gl,pixels=new Uint8Array(width*height*4),image=new ImageData(width*scale,height*scale);
      for(const phase of stillPhases(scale)){
        jitter.set(2*phase.shift[0]/width,2*phase.shift[1]/height);
        this.renderScene();this.fence();await this.waitForGPU();
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        writeStillPhase(image.data,pixels,width,height,scale,phase);
      }
      const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(image.width,image.height):Object.assign(document.createElement('canvas'),{width:image.width,height:image.height});
      canvas.getContext('2d').putImageData(image,0,0);
      const blob=canvas.convertToBlob?await canvas.convertToBlob({type:'image/png'}):await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('Could not encode the frame');return blob;
    } finally {jitter?.set(0,0);this.exporting=false;this.applyLensAspect(this.getViewportAspect());this.autoOrbit=originalOrbit;this.resizePending=true;this.dirty=true;this.onInvalidate?.();}
  }
  dispose(){
    this.ssaoPass?.dispose();this.ssaoPass=null;
    this.occlusionPass?.dispose();this.occlusionPass=null;this.prepass?.dispose();this.prepass=null;this.sortClient?.dispose();this.sortClient=null;
    for(const type of ['pointerdown','pointermove','wheel'])this.renderer.domElement.removeEventListener?.(type,this.pointerTouch);
    this.paintNoise?.dispose();this.paintNoise=null;
    this.still?.dispose();this.still=null;
    this.studioEnvironment?.dispose();this.studioEnvironment=null;
    this.limitedOrbit?.dispose();this.limitedOrbit=null;
    if(this.disposed)return;this.disposed=true;
    this.forestCaustics?.dispose();this.forestCaustics=null;
    disposeUpperWater(this);
    disposeFossilMirrors(this);
    this.water=null;
    this.refractionTarget?.dispose();this.refractionTarget=null;this.refractionMaterial?.dispose();this.refractionMaterial=null;this.refractionIndices=null;this.refraction=null;
    this.reflectionTarget?.dispose();this.reflectionTarget=null;
    this.trampleTexture?.dispose();this.trampleTexture=null;this.trample=null;
    this.lod?.dispose();this.lod=null;this.lodCenterStorage=null;
    this.focus=null;
    this.spores=null;this.sporesPlaying=false;
    this.lensParticleIndices=null;
    this.visibility=null;this.visibilityKey=null;
    this.depthCache=null;
    this.actor?.dispose();this.actor=null;this.actorPlaying=false;
    this.renderer.domElement.removeEventListener('webglcontextlost',this.onContextLost);
    if(this.pendingFence)this.gl.deleteSync(this.pendingFence);
    this.controls.dispose();this.geometry?.dispose();this.backgroundGeometry?.dispose();this.material?.dispose();this.textureUploads?.dispose();this.texture?.dispose();this.windTexture?.dispose();this.lensDirtPass?.dispose();this.sun.dispose();this.cache.clear();
    this.crystalStudio?.dispose();this.crystalStudio=null;
    this.reefCaustics?.dispose();this.reefCaustics=null;
    this.reefAudio?.dispose();this.reefAudio=null;this.reefSequence=null;
    this.causticClouds?.dispose();this.causticClouds=null;
    this.cliffSeasons?.dispose();this.cliffSeasons=null;
    this.desert?.dispose();this.desert=null;
    this.renderer.dispose();this.renderer.forceContextLoss();
  }
}
