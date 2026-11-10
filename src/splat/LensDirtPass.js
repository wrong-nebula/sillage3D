import * as THREE from 'three';
import {createLensDirtMask,dirtUVScale} from './lensDirtMask.js';
import {SUN_COLOR_LINEAR} from './PainterlySun.js';
import {FLARE_DEFAULTS,projectSolarDisc,FLARE_VERTEX_SHADER,FLARE_FRAGMENT_GLSL} from './lensFlare.js';
import {PainterlyVignettePass} from './PainterlyVignettePass.js';
import {GhibliPaintPass} from './GhibliPaintPass.js';
import {diffractionWeights, lensOpticsSettings, DIFFRACTION_GLSL, GOGGLE_F_NUMBER} from './LensDiffraction.js';
import {LensParticleMask} from './LensParticleMask.js';
import {SEASONAL_CAMERA_LUT_GLSL} from './SeasonalCameraLUT.js';
import {SSAO_COMPOSITE_GLSL} from './SplatSSAO.js';

export const LENS_DIRT_DEFAULTS=Object.freeze({lensDirt:true,lensDirtStrength:.3,lensDirtScale:1});

const vertexShader=`
varying vec2 vUv;
void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}`;
const colorFunctions=`
vec3 toLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 toDisplay(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}`;

const extractShader=`
varying vec2 vUv;
uniform sampler2D source;
uniform vec2 texel;
uniform bool reefNight;
${colorFunctions}
vec4 bright(vec2 uv){
  vec4 sampleColor=texture2D(source,uv);
  vec3 c=toLinear(sampleColor.rgb);
  float y=dot(c,vec3(.2126,.7152,.0722));
  float highlight=smoothstep(.50,.85,y);
  if(reefNight){
    float peak=max(c.r,max(c.g,c.b)),dark=min(c.r,min(c.g,c.b));
    float saturation=(peak-dark)/max(peak,.001);
    float cool=max(c.g,c.b)-c.r*.68;
    float luminous=smoothstep(.12,.38,peak)*smoothstep(.22,.55,saturation)*smoothstep(0.,.07,cool);
    highlight=max(highlight,luminous*.60);
  }
  return vec4(c*highlight,1.-sampleColor.a);
}
void main(){
  // Four footprint samples keep small painted highlights when downsampling.
  vec4 light=bright(vUv+texel*vec2(-.5,-.5))+bright(vUv+texel*vec2(.5,-.5))
    +bright(vUv+texel*vec2(-.5,.5))+bright(vUv+texel*vec2(.5,.5));
  gl_FragColor=light*.25;
}`;

const blurShader=`
varying vec2 vUv;
uniform sampler2D source;
uniform vec2 stepUV;
void main(){
  vec4 light=texture2D(source,vUv)*.2270270270;
  light+=(texture2D(source,vUv+stepUV*1.3846153846)+texture2D(source,vUv-stepUV*1.3846153846))*.3162162162;
  light+=(texture2D(source,vUv+stepUV*3.2307692308)+texture2D(source,vUv-stepUV*3.2307692308))*.0702702703;
  gl_FragColor=light;
}`;

const compositeShader=`
varying vec2 vUv;
uniform sampler2D source;
uniform sampler2D lightMap;
uniform sampler2D dirtMap;
uniform sampler2D flareBloomMap;
uniform vec2 dirtScale;
uniform float strength;
uniform float sunStrength;
uniform float flareBloomStrength;
uniform bool goggles;
uniform float sceneExposure;
uniform vec3 sunColor;
${colorFunctions}
${FLARE_FRAGMENT_GLSL}
${DIFFRACTION_GLSL}
${SEASONAL_CAMERA_LUT_GLSL}
${SSAO_COMPOSITE_GLSL}
void main(){
  vec2 sceneUV=vUv;
  if(goggles&&strength>0.){
    vec2 q=(vUv-.5)*vec2(aspect,1.);
    float rim=smoothstep(.18,.65,length(q));
    vec2 bend=vec2(sin(vUv.y*19.+sin(vUv.x*11.)),cos(vUv.x*16.-vUv.y*7.));
    sceneUV=clamp(vUv+(q*.0017*rim+bend*.00065)*strength,vec2(.001),vec2(.999));
  }
  vec4 scene=texture2D(source,sceneUV);
  vec2 ambientOcclusion=splatAO(sceneUV);
  if(ssaoEnabled&&ssaoDebug){gl_FragColor=vec4(vec3(ambientOcclusion.x*ambientOcclusion.y),1.);return;}
  vec3 base=toLinear(scene.rgb);
  base=diffractedColor(sceneUV,base);
  base*=ambientOcclusion.x;
  vec3 scatter=splatLensFlare(vUv);
  if(flareBloomStrength>0.)scatter+=texture2D(flareBloomMap,vUv).rgb*flareBloomStrength*1.4;
  if(strength>0.){
    vec4 illumination=texture2D(lightMap,vUv);
    vec3 light=illumination.rgb+illumination.a*sunStrength*sunColor;
    vec2 lensUV=(vUv-.5)*dirtScale+.5;
    vec2 mask=texture2D(dirtMap,lensUV).rg;
    // Keep individual painted lens marks readable against the misty midtones.
    // The brightness gate and shoulder still protect dark areas and highlights.
    if(goggles){
      vec3 streak=(texture2D(lightMap,vUv+vec2(.048,.009)).rgb
        +texture2D(lightMap,vUv-vec2(.048,.009)).rgb)*.16;
      scatter+=(light+streak)*mask.r*strength*2.4;
    }else scatter+=light*mask.r*strength*2.4;
  }
  // Brightness-gated scattering, with a gentle screen shoulder toward white.
  scatter=clamp(scatter,0.,1.);
  vec3 result=base+(1.-base)*scatter;
  vec3 outputColor=strength>0.||flareStrength>0.||lensDiffraction||ssaoEnabled?toDisplay(result):scene.rgb;
  gl_FragColor=vec4(seasonalCameraGrade(outputColor)*sceneExposure,1.);
}`;

const flareEmissionShader=`
varying vec2 vUv;
uniform float sunStrength;
${FLARE_FRAGMENT_GLSL}
void main(){
  vec3 emission=splatLensFlare(vUv);
  float brightness=max(emission.r,max(emission.g,emission.b));
  // Only the bright optical marks bloom; scene pigments never enter this pass.
  gl_FragColor=vec4(emission*smoothstep(.025,.18,brightness),1.);
}`;

function target(width,height,type=THREE.UnsignedByteType){
  return new THREE.WebGLRenderTarget(width,height,{depthBuffer:false,stencilBuffer:false,
    type,format:THREE.RGBAFormat,colorSpace:THREE.NoColorSpace,
    minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false});
}
function material(fragmentShader,uniforms){
  return new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,
    depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
}

/** WebGL adaptation of Three's blurred-light × lens-texture effect.
 * The scene target stores the existing shader's display RGB without conversion.
 * Only highlight extraction and the bounded light composite operate in linear RGB.
 */
export class LensDirtPass {
  constructor(renderer){
    const mask=createLensDirtMask();
    this.dirt=new THREE.DataTexture(mask.data,mask.width,mask.height,THREE.RGBAFormat);
    this.dirt.minFilter=THREE.LinearFilter;this.dirt.magFilter=THREE.LinearFilter;
    this.dirt.wrapS=THREE.RepeatWrapping;this.dirt.wrapT=THREE.RepeatWrapping;
    this.dirt.generateMipmaps=false;this.dirt.needsUpdate=true;
    // Float light buffers retain the faint tails of a physically small sun disc.
    // RGBA8 remains a functional fallback on GPUs without float color targets.
    const lightType=renderer?.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
    this.lightType=lightType;
    this.sceneTarget=target(1,1);this.lightTarget=target(1,1,lightType);this.blurTarget=target(1,1,lightType);
    this.extract=material(extractShader,{source:{value:this.sceneTarget.texture},texel:{value:new THREE.Vector2()},reefNight:{value:false}});
    this.blur=material(blurShader,{source:{value:null},stepUV:{value:new THREE.Vector2()}});
    this.composite=material(compositeShader,{source:{value:this.sceneTarget.texture},lightMap:{value:this.lightTarget.texture},
      dirtMap:{value:this.dirt},dirtScale:{value:new THREE.Vector2()},strength:{value:0},sunStrength:{value:0},sunColor:{value:new THREE.Vector3(...SUN_COLOR_LINEAR)},
      flareBloomMap:{value:null},flareBloomStrength:{value:0}});
    this.composite.uniforms.goggles={value:false};
    this.composite.uniforms.sceneExposure={value:1};
    Object.assign(this.composite.uniforms,{ssaoEnabled:{value:false},ssaoDebug:{value:false},ssaoGeometry:{value:this.dirt},ssaoMap:{value:this.dirt},ssaoSize:{value:new THREE.Vector2(1,1)},ssaoRadius:{value:.65}});
    Object.assign(this.composite.uniforms,{
      seasonalLUTEnabled:{value:false},seasonalLUT:{value:null},seasonalLUTWeights:{value:new THREE.Vector4()},
    });
    Object.assign(this.composite.uniforms,{
      lensDiffraction:{value:false},lensTexel:{value:new THREE.Vector2()},lensAiryScale:{value:0},lensBlurStrength:{value:1},lensFringeStrength:{value:.48},
      lensPSF:{value:diffractionWeights().map(ring=>new THREE.Vector3(...ring))},
      lensParticleMaskEnabled:{value:false},lensParticleMask:{value:this.dirt},
    });
    this.composite.vertexShader=FLARE_VERTEX_SHADER;
    Object.assign(this.composite.uniforms,{flareSunUV:{value:new THREE.Vector2()},flareSunU:{value:new THREE.Vector2()},flareSunV:{value:new THREE.Vector2()},
      flareStrength:{value:0},flareScale:{value:1},aspect:{value:1},flarePixelHeight:{value:1}});
    // Share source/projection/visibility uniforms so the bloom's occlusion is
    // exactly the same as the direct flare, without any CPU readback or lag.
    this.flareEmission=material(flareEmissionShader,this.composite.uniforms);
    this.flareEmission.vertexShader=FLARE_VERTEX_SHADER;
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.quad=new THREE.Mesh(this.geometry,this.extract);this.quad.frustumCulled=false;
    this.scene=new THREE.Scene();this.scene.add(this.quad);this.camera=new THREE.Camera();
    this.size=new THREE.Vector2();this.clearColor=new THREE.Color();this.encodedClear=new THREE.Color();
    this.viewport=new THREE.Vector4();this.scissor=new THREE.Vector4();
  }
  resize(width,height){
    if(this.sceneTarget.width===width&&this.sceneTarget.height===height)return;
    this.sceneTarget.setSize(width,height);
    // At most 400 pixels on either axis; export cannot allocate a huge bloom chain.
    const ratio=Math.min(.25,400/Math.max(width,height));
    this.lightTarget.setSize(Math.max(1,Math.round(width*ratio)),Math.max(1,Math.round(height*ratio)));
    this.blurTarget.setSize(this.lightTarget.width,this.lightTarget.height);
    this.extract.uniforms.texel.value.set(1/this.lightTarget.width,1/this.lightTarget.height);
  }
  resizeFlareBloom(width,height){
    this.flareTarget??=target(1,1,this.lightType);this.flareBlurTarget??=target(1,1,this.lightType);
    const ratio=Math.min(.5,512/Math.max(width,height));
    const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));
    this.flareTarget.setSize(w,h);this.flareBlurTarget.setSize(w,h);
    this.composite.uniforms.flareBloomMap.value=this.flareTarget.texture;
  }
  render(renderer,scene,camera,options,worldSplats=null,canvasOnSubject=false,emissionCapture=null,goggles=false,reefNight=false,diffraction=false,cameraLUT=null,seasonalDirt=1,particles=null,sceneExposure=1,ambientOcclusion=null){
    const previousTarget=renderer.getRenderTarget();
    if(previousTarget)this.size.set(previousTarget.width,previousTarget.height);else renderer.getDrawingBufferSize(this.size);
    this.resize(this.size.x,this.size.y);
    renderer.getClearColor(this.clearColor);const alpha=renderer.getClearAlpha(),autoClear=renderer.autoClear;
    renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);const scissorTest=renderer.getScissorTest();
    const dirtStrength=options.lensDirt===false?0:Math.min(1,Math.max(0,options.lensDirtStrength??LENS_DIRT_DEFAULTS.lensDirtStrength))*seasonalDirt;
    const solar=projectSolarDisc(camera,options);
    const flareStrength=options.lensFlare&&solar?Math.min(2,Math.max(0,options.lensFlareStrength??FLARE_DEFAULTS.lensFlareStrength)):0;
    const bloomStrength=flareStrength>0?Math.min(1.5,Math.max(0,options.lensFlareBloom??FLARE_DEFAULTS.lensFlareBloom)):0;
    const uniforms=this.composite.uniforms;
    uniforms.ssaoEnabled.value=Boolean(ambientOcclusion);uniforms.ssaoDebug.value=ambientOcclusion?.debug??false;
    uniforms.ssaoGeometry.value=ambientOcclusion?.geometry??this.dirt;uniforms.ssaoMap.value=ambientOcclusion?.ao??this.dirt;
    uniforms.ssaoSize.value.set(ambientOcclusion?.width??1,ambientOcclusion?.height??1);uniforms.ssaoRadius.value=ambientOcclusion?.radius??.65;
    uniforms.sceneExposure.value=sceneExposure;
    uniforms.seasonalLUTEnabled.value=Boolean(cameraLUT);
    uniforms.seasonalLUT.value=cameraLUT?.texture??null;
    if(cameraLUT)uniforms.seasonalLUTWeights.value.copy(cameraLUT.weights);
    this.extract.uniforms.reefNight.value=reefNight;
    uniforms.goggles.value=goggles;
    const optics=lensOpticsSettings(options,diffraction);
    uniforms.lensDiffraction.value=optics.enabled;
    uniforms.lensBlurStrength.value=optics.blur;uniforms.lensFringeStrength.value=optics.fringe;
    uniforms.lensTexel.value.set(1/this.size.x,1/this.size.y);
    uniforms.lensAiryScale.value=.00055*GOGGLE_F_NUMBER*this.size.y/camera.getFilmHeight()*optics.scale;
    uniforms.lensParticleMaskEnabled.value=diffraction&&Boolean(particles?.indices.length);
    // Optical extraction always sees the original scene and solar visibility.
    // The finished pigment image is bound only for the final composite below.
    uniforms.source.value=this.sceneTarget.texture;
    uniforms.flareStrength.value=flareStrength;uniforms.flareScale.value=Math.min(2,Math.max(.5,options.lensFlareScale??1));
    uniforms.aspect.value=this.size.x/this.size.y;
    uniforms.flarePixelHeight.value=1/this.size.y;
    uniforms.flareBloomStrength.value=bloomStrength;
    uniforms.sunStrength.value=options.sun?Math.min(20,Math.max(0,options.sunIntensity??0)):0;
    if(bloomStrength>0)this.resizeFlareBloom(this.size.x,this.size.y);
    if(solar){uniforms.flareSunUV.value.fromArray(solar.center);uniforms.flareSunU.value.fromArray(solar.u);uniforms.flareSunV.value.fromArray(solar.v);}
    try{
      renderer.autoClear=true;renderer.setScissorTest(false);
      renderer.setRenderTarget(this.sceneTarget);
      // Three converts the canvas clear color to sRGB, but uses linear values for
      // regular targets. Match the original canvas bytes, including splat edges.
      renderer.setClearColor(this.encodedClear.copy(this.clearColor).convertLinearToSRGB(),alpha);
      renderer.render(scene,camera);
      renderer.setClearColor(this.clearColor,alpha);
      if(uniforms.lensParticleMaskEnabled.value){
        this.particleMask??=new LensParticleMask();
        uniforms.lensParticleMask.value=this.particleMask.render(renderer,camera,particles,this.size.x,this.size.y,
          options.brushScale??1,uniforms.lensAiryScale.value*1.85*1.7);
      }
      if(bloomStrength>0){
        uniforms.flarePixelHeight.value=1/this.flareTarget.height;
        this.quad.material=this.flareEmission;renderer.setRenderTarget(this.flareTarget);renderer.render(this.scene,this.camera);
        this.quad.material=this.blur;this.blur.uniforms.source.value=this.flareTarget.texture;
        const radius=Math.max(1.5,Math.min(this.flareTarget.width,this.flareTarget.height)*.014);
        this.blur.uniforms.stepUV.value.set(radius/this.flareTarget.width,0);
        renderer.setRenderTarget(this.flareBlurTarget);renderer.render(this.scene,this.camera);
        this.blur.uniforms.source.value=this.flareBlurTarget.texture;
        this.blur.uniforms.stepUV.value.set(0,radius/this.flareTarget.height);
        renderer.setRenderTarget(this.flareTarget);renderer.render(this.scene,this.camera);
        uniforms.flarePixelHeight.value=1/this.size.y;
      }
      if(dirtStrength>0){
        renderer.setRenderTarget(this.lightTarget);
        if(emissionCapture){
          renderer.setClearColor(0,1);
          emissionCapture.value=true;
          try{renderer.render(scene,camera);}
          finally{emissionCapture.value=false;renderer.setClearColor(this.clearColor,alpha);}
        }else{
          this.quad.material=this.extract;renderer.render(this.scene,this.camera);
        }
        this.quad.material=this.blur;
        this.blur.uniforms.source.value=this.lightTarget.texture;
        // Equal pixel radius in both directions, including portrait viewports.
        const radius=Math.min(this.lightTarget.width,this.lightTarget.height)*(goggles?.045:.022);
        this.blur.uniforms.stepUV.value.set(radius/this.lightTarget.width,0);
        renderer.setRenderTarget(this.blurTarget);renderer.render(this.scene,this.camera);
        this.blur.uniforms.source.value=this.blurTarget.texture;
        this.blur.uniforms.stepUV.value.set(0,radius/this.blurTarget.height);
        renderer.setRenderTarget(this.lightTarget);renderer.render(this.scene,this.camera);
      }
      this.composite.uniforms.strength.value=dirtStrength;
      this.composite.uniforms.dirtScale.value.fromArray(dirtUVScale(this.size.x/this.size.y,1,options.lensDirtScale??1));
      if(options.mode==='ghibli'){
        this.ghibli??=new GhibliPaintPass();
        const backdrop=canvasOnSubject?this.encodedClear:null;
        uniforms.source.value=this.ghibli.render(renderer,uniforms.source.value,this.size.x,this.size.y,options,backdrop);
      }
      if(options.painterlyVignette&&options.vignetteStrength>0){
        this.vignette??=new PainterlyVignettePass();
        uniforms.source.value=this.vignette.render(renderer,uniforms.source.value,this.size.x,this.size.y,options,camera,worldSplats);
      }
      this.quad.material=this.composite;renderer.setRenderTarget(previousTarget);
      renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);
      renderer.render(this.scene,this.camera);
    }finally{
      renderer.setRenderTarget(previousTarget);renderer.setClearColor(this.clearColor,alpha);renderer.autoClear=autoClear;
      renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);
    }
  }
  dispose(){
    this.sceneTarget.dispose();this.lightTarget.dispose();this.blurTarget.dispose();this.dirt.dispose();
    this.flareTarget?.dispose();this.flareBlurTarget?.dispose();this.flareEmission.dispose();
    this.vignette?.dispose();
    this.ghibli?.dispose();
    this.particleMask?.dispose();
    this.extract.dispose();this.blur.dispose();this.composite.dispose();this.geometry.dispose();
  }
}
