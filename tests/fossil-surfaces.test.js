import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeFossilMirrors,disposeFossilMirrors,fossilUniforms,renderFossilMirrors} from '../src/splat/FossilSurfaces.js';

function fixture(){
  const camera=new THREE.PerspectiveCamera(50,1.6,.1,300);camera.position.set(0,12,20);camera.lookAt(0,3,0);camera.updateMatrixWorld();
  const config=Array.from({length:7},(_,i)=>({level:3,point:[i<4?500:0,3,0],normal:[0,1,0],bounds:i<4?[498,-2,502,2]:[-2,-2,2,2]}));
  const mirrors=makeFossilMirrors(config,12),fallback=new THREE.Texture(),matrix=new THREE.Matrix4().makeTranslation(4,5,6);
  const u={...fossilUniforms(mirrors,fallback),waterLevel:{value:0},waterReflection:{value:fallback},reflectionReady:{value:true},reflectionMatrix:{value:matrix}};
  const engine={camera,fossilMirrors:mirrors,texture:fallback,material:{uniforms:u},windTime:0,options:{mode:'gaussian'},
    reflectionTarget:{primary:true},reflectionConfig:{level:0},reflectionOrder:new Uint32Array([1,0]),reflectionViewKey:'river',captures:0,
    renderWaterReflection(){
      this.captures++;assert.ok(this.material.uniforms.fossilCapture.value);
      for(let i=0;i<4;i++)assert.equal(u[`fossilReflection${i}`].value,fallback,'active framebuffer is never sampled');
      u.reflectionMatrix.value.makeTranslation(1,this.reflectionConfig.level,2);u.reflectionReady.value=true;this.reflectionViewKey='cut';
    }};
  return {engine,u};
}
test('visible polished cuts retain their IDs beyond the four sampler slots and cache a held frame',()=>{
  const {engine:e,u}=fixture(),target=e.reflectionTarget,order=e.reflectionOrder,matrix=u.reflectionMatrix.value.clone();
  try{
    renderFossilMirrors(e);assert.equal(e.captures,3);
    assert.deepEqual([...u.fossilSlots.value.slice(0,7)],[-1,-1,-1,-1,0,1,2]);
    assert.equal(e.reflectionTarget,target);assert.equal(e.reflectionOrder,order);assert.equal(e.reflectionConfig.level,0);assert.equal(e.reflectionViewKey,'river');
    assert.equal(u.waterLevel.value,0);assert.equal(u.fossilCapture.value,false);assert.deepEqual(u.reflectionMatrix.value,matrix);
    renderFossilMirrors(e);assert.equal(e.captures,3);
    e.windTime=.09;renderFossilMirrors(e);assert.equal(e.captures,6);
    e.camera.position.x=500;e.camera.lookAt(500,3,0);e.camera.updateMatrixWorld();renderFossilMirrors(e);
    assert.deepEqual([...u.fossilSlots.value.slice(0,7)],[0,1,2,3,-1,-1,-1]);
  }finally{disposeFossilMirrors(e);}
});
test('a failed cap capture restores all river render state',()=>{
  const {engine:e,u}=fixture(),state={target:e.reflectionTarget,config:e.reflectionConfig,order:e.reflectionOrder,matrix:u.reflectionMatrix.value.clone()};
  e.renderWaterReflection=()=>{throw new Error('capture failed');};
  try{
    assert.throws(()=>renderFossilMirrors(e),/capture failed/);
    assert.equal(e.reflectionTarget,state.target);assert.equal(e.reflectionConfig,state.config);assert.equal(e.reflectionOrder,state.order);
    assert.equal(u.waterLevel.value,0);assert.equal(u.fossilCapture.value,false);assert.deepEqual(u.reflectionMatrix.value,state.matrix);
  }finally{disposeFossilMirrors(e);}
});
test('cap targets allocate only when requested and are disposed exactly once',()=>{
  assert.deepEqual(makeFossilMirrors(undefined,100),[]);
  const {engine:e}=fixture();let disposed=0;
  e.fossilMirrors.forEach(m=>m.target.addEventListener('dispose',()=>disposed++));
  disposeFossilMirrors(e);disposeFossilMirrors(e);assert.equal(disposed,7);assert.deepEqual(e.fossilMirrors,[]);
});
