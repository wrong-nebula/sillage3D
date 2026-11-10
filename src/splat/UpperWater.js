import * as THREE from 'three';

/** A second horizontal reach of the same river, above the falls. Only scenes
 * that explicitly declare upperWater allocate these bounded captures. */
export function makeUpperWater(config,count){
  if(!config)return null;
  return {level:config.level,bounds:config.bounds,contains:config.contains,absorption:config.absorption??[.07,.025,.017],
    reflectionTarget:new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false}),
    refractionTarget:new THREE.WebGLRenderTarget(1,1,{count:2,depthBuffer:false,stencilBuffer:false}),
    reflectionOrder:Uint32Array.from({length:count},(_,i)=>i),reflectionViewKey:null};
}
export function disposeUpperWater(engine){
  engine.upperWater?.reflectionTarget.dispose();engine.upperWater?.refractionTarget.dispose();engine.upperWater=null;
}
export function upperWaterUniforms(upper,fallback){
  if(!upper)return {};
  return {upperWaterLevel:{value:upper.level},reflectionReadyUpper:{value:false},refractionReadyUpper:{value:false},
    waterReflectionUpper:{value:fallback},waterRefractionUpper:{value:fallback},waterRefractionDepthUpper:{value:fallback},
    reflectionMatrixUpper:{value:new THREE.Matrix4()},waterAbsorptionUpper:{value:new THREE.Vector3(...upper.absorption)}};
}

export function waterPlaneVisible(engine,bounds,level){
  if(!bounds)return true;
  const [x0,z0,x1,z1]=bounds;
  const matrix=new THREE.Matrix4().multiplyMatrices(engine.camera.projectionMatrix,engine.camera.matrixWorldInverse);
  return new THREE.Frustum().setFromProjectionMatrix(matrix).intersectsBox(new THREE.Box3(new THREE.Vector3(x0,level-.4,z0),new THREE.Vector3(x1,level+.4,z1)));
}
export function renderUpperWater(engine){
  const upper=engine.upperWater;if(!upper)return;
  const u=engine.material.uniforms;
  if(!waterPlaneVisible(engine,upper.bounds,upper.level)){u.reflectionReadyUpper.value=false;u.refractionReadyUpper.value=false;return;}
  const state={reflectionTarget:engine.reflectionTarget,refractionTarget:engine.refractionTarget,
    reflectionConfig:engine.reflectionConfig,reflectionOrder:engine.reflectionOrder,reflectionViewKey:engine.reflectionViewKey};
  const values={waterLevel:u.waterLevel.value,waterReflection:u.waterReflection.value,waterRefraction:u.waterRefraction.value,
    waterRefractionDepth:u.waterRefractionDepth.value,reflectionReady:u.reflectionReady.value,refractionReady:u.refractionReady.value};
  const matrix=u.reflectionMatrix.value.clone();
  try{
    engine.reflectionTarget=upper.reflectionTarget;engine.refractionTarget=upper.refractionTarget;
    engine.reflectionConfig={...state.reflectionConfig,level:upper.level};engine.reflectionOrder=upper.reflectionOrder;engine.reflectionViewKey=upper.reflectionViewKey;
    u.waterLevel.value=upper.level;
    // No sampler may remain bound to an attachment of the active framebuffer.
    u.waterReflectionUpper.value=engine.texture;u.waterRefractionUpper.value=engine.texture;u.waterRefractionDepthUpper.value=engine.texture;
    u.reflectionReadyUpper.value=false;u.refractionReadyUpper.value=false;
    engine.renderWaterReflection();engine.renderWaterRefraction();
    upper.reflectionViewKey=engine.reflectionViewKey;
    u.reflectionMatrixUpper.value.copy(u.reflectionMatrix.value);
    u.reflectionReadyUpper.value=u.reflectionReady.value;u.refractionReadyUpper.value=u.refractionReady.value;
  }finally{
    Object.assign(engine,state);for(const [key,value]of Object.entries(values))u[key].value=value;
    u.reflectionMatrix.value.copy(matrix);
    u.waterReflectionUpper.value=upper.reflectionTarget.texture;
    u.waterRefractionUpper.value=upper.refractionTarget.textures[0];u.waterRefractionDepthUpper.value=upper.refractionTarget.textures[1];
  }
}
