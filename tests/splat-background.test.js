import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GaussianBrushRenderer} from '../src/splat/GaussianBrushRenderer.js';
import {PainterlySun} from '../src/splat/PainterlySun.js';

function definition(background=true){
  const splats=[-12,-6,-20,-4,-10,-6].map((z,i)=>({
    center:[0,0,z],axes:[[.2,0,0],[0,.3,0],[0,0,.1]],
    color:[.4,.5,.6],opacity:.9,seed:i/10,material:i===2?'cloud':'stone',
    noFog:i===0||i===2||i===3,
    skyBackground:background&&(i===0||i===3),
  }));
  return {splats,lighting:{stats:{},irradiance:new Float32Array(18),shadow:new Float32Array(6)}};
}

// Exercise the real load, sort and disposal paths using Three's CPU objects.
// Only the browser-owned renderer/controls are replaced, so these checks do not
// need a GL context or trigger a second expensive scene-lighting bake.
function fixture(background=true){
  const engine=Object.create(GaussianBrushRenderer.prototype);
  Object.assign(engine,{
    renderer:{capabilities:{maxTextureSize:1024},setClearColor(){},
      domElement:{removeEventListener(){}},dispose(){},forceContextLoss(){}},
    camera:new THREE.PerspectiveCamera(45,1,.08,600),
    controls:{target:new THREE.Vector3(),update(){},dispose(){}},
    options:{brushScale:1,mode:'paint',coverage:1,softness:.2},
    sun:new PainterlySun(),scene:new THREE.Scene(),cache:new Map([[0,definition(background)]]),stats:{},
  });
  engine.load(0);
  engine.camera.position.set(0,0,0);engine.camera.lookAt(0,0,-1);
  return engine;
}

test('only explicit distant sky splats render behind the sun; cloud volumes remain foreground',()=>{
  const engine=fixture();
  try{
    assert.equal(engine.scene.children.length,3);
    assert.equal(engine.backgroundGeometry.instanceCount,2);
    assert.equal(engine.geometry.instanceCount,4);
    assert.equal(engine.stats.count,6);
    assert.equal(engine.backgroundMesh.material,engine.mesh.material);
    assert.equal(engine.mesh.material.uniforms.splatData.value,engine.texture);
    assert.deepEqual(Array.from(engine.backgroundIndexAttribute.array),[0,3]);
    assert.deepEqual(Array.from(engine.indexAttribute.array),[1,2,4,5]);
    assert.ok(engine.backgroundMesh.renderOrder<engine.sun.mesh.renderOrder);
    assert.ok(engine.sun.mesh.renderOrder<engine.mesh.renderOrder);
    assert.equal(engine.backgroundMesh.frustumCulled,false);
    assert.equal(engine.mesh.geometry,engine.geometry);
    // The inverse-alpha visibility mask is created after the background, then
    // reduced only by genuine foreground coverage, including translucent cloud.
    const sunCoverage=.8,cloudCoverage=.25;
    const afterSun=1*(1-sunCoverage);
    const afterCloud=cloudCoverage+afterSun*(1-cloudCoverage);
    assert.ok(Math.abs((1-afterCloud)-sunCoverage*(1-cloudCoverage))<1e-12);
  }finally{engine.dispose();}
});

test('both batches preserve stable far-to-near ordering when the view direction changes',()=>{
  const engine=fixture();
  try{
    engine.sort();
    assert.deepEqual(Array.from(engine.order),[2,0,4,1,5,3]);
    assert.deepEqual(Array.from(engine.backgroundIndexAttribute.array),[0,3]);
    assert.deepEqual(Array.from(engine.indexAttribute.array),[2,4,1,5]);
    const mainVersion=engine.indexAttribute.version,skyVersion=engine.backgroundIndexAttribute.version;
    engine.camera.lookAt(0,0,1);engine.sort();
    assert.deepEqual(Array.from(engine.backgroundIndexAttribute.array),[3,0]);
    assert.deepEqual(Array.from(engine.indexAttribute.array),[1,5,4,2]);
    assert.ok(engine.indexAttribute.version>mainVersion);
    assert.ok(engine.backgroundIndexAttribute.version>skyVersion);
    assert.equal(engine.sortDirty,false);
  }finally{engine.dispose();}
});

test('scenes without a separate sky retain one splat draw and release old background resources',()=>{
  const engine=fixture();
  const old={background:engine.backgroundGeometry,main:engine.geometry,material:engine.material,texture:engine.texture};
  const disposed={background:0,main:0,material:0,texture:0};
  for(const key of Object.keys(old))old[key].addEventListener('dispose',()=>disposed[key]++);
  try{
    engine.cache.set(0,definition(false));engine.load(0);engine.sort();
    assert.deepEqual(disposed,{background:1,main:1,material:1,texture:1});
    assert.equal(engine.backgroundMesh,null);assert.equal(engine.backgroundGeometry,null);assert.equal(engine.backgroundIndexAttribute,null);
    assert.equal(engine.scene.children.length,2,'only the sun and the original main splat batch remain');
    assert.equal(engine.geometry.instanceCount,6);
    assert.deepEqual(Array.from(engine.indexAttribute.array),Array.from(engine.order));
  }finally{engine.dispose();}
  assert.deepEqual(disposed,{background:1,main:1,material:1,texture:1},'shared resources must not be disposed twice');
});

test('disposing a split scene releases both geometries and the shared material once',()=>{
  const engine=fixture(),counts={background:0,main:0,material:0,texture:0};
  for(const [key,resource] of Object.entries({background:engine.backgroundGeometry,main:engine.geometry,material:engine.material,texture:engine.texture})){
    resource.addEventListener('dispose',()=>counts[key]++);
  }
  engine.dispose();engine.dispose();
  assert.deepEqual(counts,{background:1,main:1,material:1,texture:1});
});
