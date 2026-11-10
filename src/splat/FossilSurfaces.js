import * as THREE from 'three';
import {waterPlaneVisible} from './UpperWater.js';

/** Real planar captures for the polished cuts, at each stump's own elevation.
 * Forest-only allocation; the river's reflection/refraction state is restored. */
export function makeFossilMirrors(config,count){
  return (config??[]).slice(0,16).map(c=>({...c,
    target:new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false}),
    order:Uint32Array.from({length:count},(_,i)=>i),matrix:new THREE.Matrix4(),viewKey:null,frameKey:null,ready:false}));
}
export function disposeFossilMirrors(engine){
  for(const mirror of engine.fossilMirrors??[])mirror.target.dispose();
  engine.fossilMirrors=[];
}
export function fossilUniforms(mirrors,fallback){
  if(!mirrors.length)return {};
  return {fossilSlots:{value:new Int32Array(16).fill(-1)},fossilCapture:{value:false},fossilClipPlane:{value:new THREE.Vector4(0,1,0,0)},
    fossilMatrices:{value:Array.from({length:16},(_,i)=>mirrors[i]?.matrix??new THREE.Matrix4())},
    ...Object.fromEntries(Array.from({length:4},(_,i)=>[`fossilReflection${i}`,{value:fallback}]))};
}
export function renderFossilMirrors(engine){
  const mirrors=engine.fossilMirrors;if(!mirrors?.length)return;
  const u=engine.material.uniforms;
  const state={reflectionTarget:engine.reflectionTarget,reflectionConfig:engine.reflectionConfig,
    reflectionOrder:engine.reflectionOrder,reflectionViewKey:engine.reflectionViewKey};
  const values={waterLevel:u.waterLevel.value,waterReflection:u.waterReflection.value,reflectionReady:u.reflectionReady.value,fossilCapture:u.fossilCapture.value};
  const clipPlane=u.fossilClipPlane.value.clone();
  const matrix=u.reflectionMatrix.value.clone();
  const frameKey=[...engine.camera.matrixWorldInverse.elements,...engine.camera.projectionMatrix.elements,
    Math.floor(engine.windTime/.09+.0001),JSON.stringify(engine.options)].join(',');
  // More cuts may exist in the scene, but only the four largest visible tops
  // occupy texture slots. Their persistent IDs never alias another stump.
  const selected=mirrors.map((mirror,index)=>({mirror,index})).filter(({mirror})=>
    engine.camera.position.y>mirror.level+.1&&waterPlaneVisible(engine,mirror.bounds,mirror.level)
  ).sort((a,b)=>{
    const importance=({mirror:m})=>{
      const [x0,z0,x1,z1]=m.bounds,dx=engine.camera.position.x-(x0+x1)*.5,dz=engine.camera.position.z-(z0+z1)*.5;
      return (x1-x0)*(z1-z0)/(dx*dx+dz*dz+(engine.camera.position.y-m.level)**2);
    };
    return importance(b)-importance(a);
  }).slice(0,4);
  // Unbind every mirror attachment while any reflection pass is being drawn.
  for(let i=0;i<4;i++)u[`fossilReflection${i}`].value=engine.texture;
  u.fossilSlots.value.fill(-1);
  try{
    for(const {mirror}of selected){
      if(mirror.frameKey===frameKey&&mirror.ready)continue;
      engine.reflectionTarget=mirror.target;engine.reflectionConfig={...state.reflectionConfig,level:mirror.level,resolution:512,fossilPlane:{point:mirror.point??[0,mirror.level,0],normal:mirror.normal??[0,1,0]}};
      engine.reflectionOrder=mirror.order;engine.reflectionViewKey=mirror.viewKey;u.waterLevel.value=mirror.level;
      const {point,normal}=engine.reflectionConfig.fossilPlane;
      u.fossilCapture.value=true;u.fossilClipPlane.value.set(...normal,-normal.reduce((sum,v,i)=>sum+v*point[i],0));
      engine.renderWaterReflection();mirror.matrix.copy(u.reflectionMatrix.value);
      mirror.viewKey=engine.reflectionViewKey;mirror.frameKey=frameKey;mirror.ready=u.reflectionReady.value;
    }
  }finally{
    Object.assign(engine,state);for(const [key,value]of Object.entries(values))u[key].value=value;
    u.reflectionMatrix.value.copy(matrix);
    u.fossilClipPlane.value.copy(clipPlane);
    selected.forEach(({mirror,index},slot)=>{
      if(mirror.ready){u[`fossilReflection${slot}`].value=mirror.target.texture;u.fossilSlots.value[index]=slot;}
    });
  }
}

export const FOSSIL_UNIFORMS_GLSL=`
uniform int fossilSlots[16];
uniform bool fossilCapture;
uniform vec4 fossilClipPlane;
uniform mat4 fossilMatrices[16];
uniform sampler2D fossilReflection0;
uniform sampler2D fossilReflection1;
uniform sampler2D fossilReflection2;
uniform sampler2D fossilReflection3;
`;
export const FOSSIL_FINISH_GLSL=`
  // The coral scene's tilted mineral facets and sparkle response, illuminated
  // by the forest ceiling instead of underwater caustics. No moving sand.
  if(pigment.a>=3.&&pigment.a<4.){
    vec3 halfLight=normalize(normalize(vec3(.60,.85,-.65))+normalize(cameraPosition-center.xyz));
    float specular=pow(max(0.,dot(normalize(axisC),halfLight)),12.);
    float dapple=sin(center.x*.17+center.z*.11);
    float focused=.32*(.60+.40*dapple*dapple);
    float sparkle=.045*specular+focused*(.30+3.45*specular);
    vec3 mineral=mix(vec3(.86,.96,1.),vec3(1.,.98,.88),fract(pigment.a));
    paintColor=mix(paintColor,mineral,min(.96,sparkle));
    opacity=min(.93,opacity*(.025+4.65*sparkle));
  }
  if(windKind>10.5&&windKind<14.5&&!reflectionPass&&!refractionPass){
    vec3 fossilNormal=normalize(axisC),eye=normalize(cameraPosition-center.xyz);
    vec3 light=normalize(vec3(-.16,.65,.75)),halfway=normalize(light+eye);
    float sparkle=pow(max(0.,dot(fossilNormal,halfway)),96.);
    if(windKind<11.5){
      vec4 fossil=texelFetch(windData,ivec2(int(splatIndex)%windWidth,int(splatIndex)/windWidth),0);
      int mirror=clamp(int(fossil.x+.5),0,15),slot=fossilSlots[mirror];
      vec4 reflected=fossilMatrices[mirror]*vec4(paintSurface,1.);
      vec2 uv=reflected.xy/reflected.w;
      if(slot>=0&&reflected.w>0.&&all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){
        vec3 reflectedColor=slot==0?texture(fossilReflection0,uv).rgb:slot==1?texture(fossilReflection1,uv).rgb:
          slot==2?texture(fossilReflection2,uv).rgb:texture(fossilReflection3,uv).rgb;
        float fresnel=.72+.22*pow(1.-max(0.,dot(fossilNormal,eye)),3.);
        paintColor=mix(paintColor,reflectedColor*vec3(.90,.96,1.),fresnel);
      }
      paintColor=mix(paintColor,vec3(.98,.97,1.),min(.9,sparkle*2.8));
    }else if(windKind<12.5){
      float facet=pow(max(0.,dot(fossilNormal,halfway)),12.);
      opacity*=.20+.80*facet;
      paintColor=mix(paintColor,vec3(1.,.98,1.),facet);
    }else if(windKind>13.5){
      float facing=1.-abs(dot(fossilNormal,eye));
      float lit=max(0.,dot(fossilNormal,normalize(vec3(.65,.7,-.65))));
      opacity*=clamp(.20+.66*lit+.24*facing*facing,0.,1.);
      paintColor=mix(paintColor,vec3(.97,.97,1.),.35*lit);
    }
  }
`;
