import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {refractionSettings,submergedOrder} from '../src/splat/WaterRefraction.js';
import {GaussianBrushRenderer} from '../src/splat/GaussianBrushRenderer.js';
import {PainterlySun} from '../src/splat/PainterlySun.js';

test('refraction sanitizes optical settings without changing the supplied scene',()=>{
  const config={ior:Infinity,strength:2,clarity:-1,maxDepth:0,resolution:5000,absorption:[NaN,-2,.2]};
  const result=refractionSettings(config);
  assert.deepEqual(result,{enabled:true,ior:1.333,strength:1,clarity:0,maxDepth:.1,resolution:1024,absorption:[.3,0,.2]});
  assert.equal(config.clarity,-1);
  assert.equal(refractionSettings({enabled:false}).enabled,false);
});

test('submerged capture preserves blend order, crossing splats, and moving geometry',()=>{
  const count=9,centers=new Float32Array(count*3),packed=new Float32Array(count*20),wind=new Float32Array(count*4),background=new Uint8Array(count);
  const order=Uint32Array.from([8,2,6,3,0,5,1,7,4]),output=new Uint32Array(count);
  for(let i=0;i<count;i++){centers[i*3+1]=-1;packed[i*20+5]=.1;}
  centers[0*3+1]=1; // Entirely above the plane.
  centers[1*3+1]=.2; // Above-center stroke still crosses the plane.
  centers[2*3+1]=.5; // Included only when brush scale grows.
  wind[3*4+3]=3;wind[4*4+3]=4;wind[5*4+3]=5;wind[6*4+3]=6;
  background[7]=1;
  centers[8*3+1]=2;wind[8*4+3]=1; // Conservative bounds for animated geometry.
  let n=submergedOrder(order,centers,packed,wind,background,0,1,output);
  assert.deepEqual(Array.from(output.subarray(0,n)),[8,1]);
  n=submergedOrder(order,centers,packed,wind,background,0,2,output);
  assert.deepEqual(Array.from(output.subarray(0,n)),[8,2,1]);
  assert.deepEqual(Array.from(order),[8,2,6,3,0,5,1,7,4]);
});

function definition(refraction){
  const splats=[{center:[0,-1,-5],axes:[[.2,0,0],[0,0,.3],[0,.04,0]],color:[.4,.5,.6],opacity:.9,seed:.3,material:'stone'}];
  return {splats,reflection:{level:0},refraction,lighting:{stats:{},irradiance:new Float32Array(3),shadow:new Float32Array(1)}};
}
function fixture(config){
  const engine=Object.create(GaussianBrushRenderer.prototype);
  Object.assign(engine,{
    renderer:{capabilities:{maxTextureSize:1024},setClearColor(){},domElement:{removeEventListener(){}},dispose(){},forceContextLoss(){}},
    camera:new THREE.PerspectiveCamera(45,1,.08,600),controls:{target:new THREE.Vector3(),update(){},dispose(){}},
    options:{brushScale:1,mode:'paint',coverage:1,softness:.2},sun:new PainterlySun(),scene:new THREE.Scene(),cache:new Map([[0,definition(config)]]),stats:{},
  });
  engine.load(0);return engine;
}

test('refraction allocates only for opt-in scenes and releases both capture attachments on scene switch',()=>{
  const engine=fixture({clarity:.8}),target=engine.refractionTarget,material=engine.refractionMaterial;
  let targetsDisposed=0,materialsDisposed=0;
  target.addEventListener('dispose',()=>targetsDisposed++);material.addEventListener('dispose',()=>materialsDisposed++);
  try{
    assert.equal(target.textures.length,2);
    assert.equal(material.uniforms,engine.material.uniforms,'one shared set of uniforms, without copying the scene textures');
    engine.setWaterRefraction('clarity',.4);assert.equal(engine.material.uniforms.refractionSettings.value.z,.4);
    engine.setWaterRefraction('clarity',NaN);assert.equal(engine.refraction.clarity,.4);
    engine.setWaterRefraction('enabled',false);assert.equal(engine.refraction.enabled,false);
    engine.cache.set(0,definition());engine.load(0);
    assert.equal(targetsDisposed,1);assert.equal(materialsDisposed,1);
    assert.equal(engine.refraction,null);assert.equal(engine.refractionTarget,null);assert.equal(engine.refractionMaterial,null);
    assert.equal(engine.material.uniforms.refractionReady.value,false);
    assert.equal(engine.material.vertexShader.includes('refraction'),false,'non-opt-in scenes compile their original vertex shader');
    assert.equal(engine.material.fragmentShader.includes('refraction'),false,'non-opt-in scenes compile their original fragment shader');
    assert.ok(engine.reflectionTarget,'existing reflection rendering survives unchanged');
  }finally{engine.dispose();}
  assert.equal(targetsDisposed,1);assert.equal(materialsDisposed,1);
});

test('disposing a refractive scene releases its capture and material exactly once',()=>{
  const engine=fixture({});let targets=0,materials=0;
  engine.refractionTarget.addEventListener('dispose',()=>targets++);engine.refractionMaterial.addEventListener('dispose',()=>materials++);
  engine.dispose();engine.dispose();assert.equal(targets,1);assert.equal(materials,1);
});


test('a second river elevation allocates only on request and is disposed on scene changes',()=>{
  const engine=fixture({});let reflected=0,refracted=0;
  try{
    engine.buildScene({...definition({}),upperWater:{level:8.1,bounds:[-10,-10,10,10]}});
    const upper=engine.upperWater;
    assert.equal(upper.level,8.1);assert.equal(upper.refractionTarget.textures.length,2);
    assert.ok(engine.material.vertexShader.includes('waterBody'));
    upper.reflectionTarget.addEventListener('dispose',()=>reflected++);
    upper.refractionTarget.addEventListener('dispose',()=>refracted++);
    engine.buildScene(definition());
    assert.equal(engine.upperWater,null);assert.equal(reflected,1);assert.equal(refracted,1);
    assert.ok(!engine.material.vertexShader.includes('waterBody'));
  }finally{engine.dispose();}
});
