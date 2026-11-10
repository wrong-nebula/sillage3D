import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GaussianBrushRenderer} from '../src/splat/GaussianBrushRenderer.js';
import {scenes} from '../src/splat/scenes.js';

const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<tolerance,`${a} ≠ ${b}`);
const expectedFocal=(fov,aspect)=>18/Math.max(aspect,1)/Math.tan(fov*Math.PI/360);
const expectedFov=(mm,aspect)=>Math.atan(18/Math.max(aspect,1)/mm)*360/Math.PI;

function fixture(){
  const engine=Object.create(GaussianBrushRenderer.prototype);
  Object.assign(engine,{
    camera:new THREE.PerspectiveCamera(54,1,.08,600),size:{width:1280,height:800},focalLength:null,
    controls:{target:new THREE.Vector3(-2,3,-8),update(){}},options:{quality:'draft'},stats:{},mesh:{},sceneIndex:0,
    disposed:false,contextLost:false,resizePending:true,dirty:true,sortDirty:true,autoOrbit:false,lastOrbitTime:null,
    material:{uniforms:{viewport:{value:new THREE.Vector2()}}},frames:[],
    renderer:{setSize(width,height){this.width=width;this.height=height;},domElement:{toBlob(callback){callback(new Blob(['test'],{type:'image/png'}));}}},
    gpuReady(){return true;},fence(){},async waitForGPU(){},sort(){this.sortDirty=false;},updateColors(){},
    renderScene(){this.frames.push({aspect:this.camera.aspect,fov:this.camera.fov,mm:this.getFocalLength(),width:this.renderer.width,height:this.renderer.height});},
  });
  engine.camera.position.set(4,5,12);engine.camera.lookAt(engine.controls.target);
  engine.setCameraFov(54);
  return engine;
}

test('authored FOV remains exact until the first real viewport resolves its physical lens',()=>{
  const engine=fixture();
  close(engine.getFocalLength(),expectedFocal(54,1.6));
  assert.equal(engine.focalLength,null,'reading the UI value must not commit the provisional default aspect');
  engine.resize(640,800);engine.render();
  assert.equal(engine.camera.fov,54);assert.equal(engine.camera.aspect,.8);assert.equal(engine.camera.filmGauge,36);
  close(engine.getFocalLength(),expectedFocal(54,.8));
  close(engine.camera.getFocalLength(),engine.getFocalLength());
});

test('millimeter controls change projection without changing camera transform or target',()=>{
  const engine=fixture(),position=engine.camera.position.clone(),rotation=engine.camera.quaternion.clone(),target=engine.controls.target.clone();
  let prior=180;
  for(const mm of [18,50,135]){
    engine.setFocalLength(mm);close(engine.getFocalLength(),mm);close(engine.camera.fov,expectedFov(mm,1.6));
    assert.ok(engine.camera.fov<prior);prior=engine.camera.fov;assert.equal(engine.dirty,true);
    assert.deepEqual(engine.camera.position.toArray(),position.toArray());assert.deepEqual(engine.camera.quaternion.toArray(),rotation.toArray());assert.deepEqual(engine.controls.target.toArray(),target.toArray());
  }
  for(const invalid of [0,-10,NaN,Infinity])assert.throws(()=>engine.setFocalLength(invalid),/positive finite/);
  for(const invalid of [0,180,NaN,Infinity])assert.throws(()=>engine.setCameraFov(invalid),/between 0 and 180/);
});

test('resizing between landscape and portrait keeps millimeters fixed and restores the original projection',()=>{
  const engine=fixture();engine.setFocalLength(85);engine.render();
  const landscape=engine.camera.fov;
  engine.resize(600,1000);engine.render();
  close(engine.getFocalLength(),85);close(engine.camera.fov,expectedFov(85,.6));assert.ok(engine.camera.fov>landscape);
  engine.resize(1280,800);engine.render();
  close(engine.getFocalLength(),85);close(engine.camera.fov,landscape);
});

test('legacy FOV restoration and camera reset resolve a new lens using the current preview aspect',()=>{
  const engine=fixture();engine.setFocalLength(85);engine.render();
  engine.setCameraFov(43);assert.equal(engine.focalLength,null);assert.equal(engine.camera.fov,43);
  engine.render();close(engine.getFocalLength(),expectedFocal(43,1.6));assert.equal(engine.camera.fov,43);
  engine.resetCamera();assert.equal(engine.focalLength,null);engine.render();
  close(engine.camera.fov,scenes[0].camera.fov||45);close(engine.getFocalLength(),expectedFocal(engine.camera.fov,1.6));
});

test('an authored ultrawide lens outside the UI slider range survives millimeter restoration',()=>{
  const original=fixture();original.resize(2100,600);original.setCameraFov(66);original.render();
  const mm=original.getFocalLength();assert.ok(mm<18&&mm>=1);
  const restored=fixture();restored.resize(2100,600);restored.setFocalLength(mm);restored.render();
  close(restored.getFocalLength(),mm);close(restored.camera.fov,66);
});

test('export uses the same lens with rounded output dimensions and restores preview projection even on failure',async()=>{
  const engine=fixture();engine.resize(901,601);engine.setFocalLength(50);engine.render();
  const aspect=engine.camera.aspect,fov=engine.camera.fov;engine.autoOrbit=true;
  await engine.exportPNG();
  const exported=engine.frames.at(-1);
  close(exported.mm,50);close(exported.aspect,exported.width/exported.height);close(exported.fov,expectedFov(50,exported.aspect));
  close(engine.camera.aspect,aspect);close(engine.camera.fov,fov);close(engine.getFocalLength(),50);
  assert.equal(engine.autoOrbit,true);assert.equal(engine.resizePending,true);assert.equal(engine.dirty,true);
  engine.renderer.domElement.toBlob=callback=>callback(null);
  await assert.rejects(()=>engine.exportPNG(),/Could not encode/);
  close(engine.camera.aspect,aspect);close(engine.camera.fov,fov);close(engine.getFocalLength(),50);assert.equal(engine.autoOrbit,true);
});
