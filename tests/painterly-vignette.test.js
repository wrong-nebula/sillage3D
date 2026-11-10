import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PainterlyVignettePass,VIGNETTE_DEFAULTS} from '../src/splat/PainterlyVignettePass.js';

function rendererFixture(){
  return {
    currentTarget:{name:'previous'},viewport:new THREE.Vector4(4,6,320,210),scissor:new THREE.Vector4(8,10,300,190),scissorTest:true,autoClear:true,calls:0,
    getRenderTarget(){return this.currentTarget;},setRenderTarget(value){this.currentTarget=value;},
    getViewport(value){return value.copy(this.viewport);},setViewport(...value){if(value.length===1)this.viewport.copy(value[0]);else this.viewport.set(...value);},
    getScissor(value){return value.copy(this.scissor);},setScissor(value){this.scissor.copy(value);},
    getScissorTest(){return this.scissorTest;},setScissorTest(value){this.scissorTest=value;},
    render(scene){
      this.calls++;this.draws=scene.children.length;
      assert.equal(this.autoClear,false);assert.equal(this.scissorTest,false);
      for(const mesh of scene.children)assert.notEqual(mesh.material.uniforms.source.value,this.currentTarget.texture,'a brush cannot sample its active output target');
      if(this.fail)throw new Error('test draw failure');
    },
  };
}

test('disabled or zero-strength vignette is an exact allocation-free bypass',()=>{
  const pass=new PainterlyVignettePass(),source=new THREE.Texture();
  try{
    assert.equal(pass.render(null,source,800,600,VIGNETTE_DEFAULTS),source);
    assert.equal(pass.render(null,source,800,600,{painterlyVignette:true,vignetteStrength:0}),source);
    assert.equal(pass.render(null,source,800,600,{painterlyVignette:true,vignetteStrength:NaN}),source);
    assert.equal(pass.target,null);assert.equal(pass.scene,null);
  }finally{pass.dispose();source.dispose();}
});

test('two pigment draws preserve alpha, raw color storage and enclosing renderer state',()=>{
  const pass=new PainterlyVignettePass(),renderer=rendererFixture(),source=new THREE.Texture(),previous=renderer.currentTarget;
  try{
    const output=pass.render(renderer,source,800,600,{painterlyVignette:true});
    assert.equal(output,pass.target.texture);assert.notEqual(output,source);
    assert.equal(renderer.calls,1);assert.equal(renderer.draws,2);
    assert.equal(pass.target.texture.type,THREE.UnsignedByteType);assert.equal(pass.target.texture.colorSpace,THREE.NoColorSpace);
    assert.equal(pass.copyMaterial.blending,THREE.NoBlending);
    assert.equal(pass.brushMaterial.blendSrcAlpha,THREE.ZeroFactor);assert.equal(pass.brushMaterial.blendDstAlpha,THREE.OneFactor);
    assert.equal(pass.brushMaterial.blendSrc,THREE.SrcAlphaFactor);assert.equal(pass.brushMaterial.blendDst,THREE.OneMinusSrcAlphaFactor);
    assert.equal(pass.copyMaterial.uniforms.source.value,source);assert.equal(pass.brushMaterial.uniforms.source.value,source);
    assert.equal(renderer.currentTarget,previous);assert.equal(renderer.autoClear,true);assert.equal(renderer.scissorTest,true);
    assert.deepEqual(renderer.viewport.toArray(),[4,6,320,210]);assert.deepEqual(renderer.scissor.toArray(),[8,10,300,190]);
    assert.throws(()=>pass.render(renderer,output,800,600,{painterlyVignette:true}),/must differ/);
  }finally{pass.dispose();source.dispose();}
});

test('seeded world field surrounds all octants and remains deterministic and proportioned in height units',()=>{
  const passes=[new PainterlyVignettePass(),new PainterlyVignettePass()],source=new THREE.Texture();
  try{
    for(const pass of passes)pass.render(rendererFixture(),source,800,600,{painterlyVignette:true});
    const a=passes[0].geometry,b=passes[1].geometry;
    assert.equal(a.instanceCount,36000);
    for(const name of ['markAnchor','markSize','markDirection','markStyle'])assert.deepEqual(a.getAttribute(name).array,b.getAttribute(name).array);
    const anchors=a.getAttribute('markAnchor'),sizes=a.getAttribute('markSize'),directions=a.getAttribute('markDirection');
    const octants=new Uint32Array(8);
    for(let i=0;i<a.instanceCount;i++){
      const anchor=[anchors.getX(i),anchors.getY(i),anchors.getZ(i)];
      assert.ok(anchor.every(Number.isFinite));
      octants[(anchor[0]>0?1:0)|(anchor[1]>0?2:0)|(anchor[2]>0?4:0)]++;
      const ratio=sizes.getX(i)/sizes.getY(i);
      assert.ok(ratio>=1.3-1e-6&&ratio<=2+1e-6);
      assert.ok(Math.abs(Math.hypot(directions.getX(i),directions.getY(i))-1)<1e-6);
    }
    assert.ok(octants.every(count=>count>a.instanceCount/10),'the fixed field must support orbiting in every direction');
    const geometry=passes[0].geometry,material=passes[0].brushMaterial;
    passes[0].render(rendererFixture(),source,1200,1920,{painterlyVignette:true,vignetteSpread:.8});
    assert.equal(passes[0].geometry,geometry);assert.equal(passes[0].brushMaterial,material);
    assert.deepEqual(material.uniforms.viewport.value.toArray(),[1200,1920]);
    assert.equal(passes[0].target.width,1200);assert.equal(passes[0].target.height,1920);
  }finally{for(const pass of passes)pass.dispose();source.dispose();}
});

test('camera and viewport updates retain world anchors; changing the scene replaces and releases them',()=>{
  const pass=new PainterlyVignettePass(),source=new THREE.Texture(),renderer=rendererFixture();
  const camera=new THREE.PerspectiveCamera(54,1.6,.08,600);
  const splats=[[-2,0,-5],[1,2,-7]].map(center=>({center,axes:[[.2,0,0],[0,.3,0],[0,0,.1]]}));
  const snapshot=JSON.stringify(splats),options={painterlyVignette:true,vignetteSwirl:.75};
  try{
    pass.render(renderer,source,800,500,options,camera,splats);
    const geometry=pass.geometry,anchors=geometry.getAttribute('markAnchor').array.slice();
    assert.equal(geometry.instanceCount,54000);
    let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
    const firstView=pass.brushMaterial.uniforms.fieldView.value.clone();
    camera.position.set(3,1,2);camera.rotateY(.1);camera.aspect=.625;camera.updateProjectionMatrix();
    pass.render(renderer,source,500,800,options,camera,splats);
    assert.equal(pass.geometry,geometry);assert.deepEqual(geometry.getAttribute('markAnchor').array,anchors);
    assert.notDeepEqual(pass.brushMaterial.uniforms.fieldView.value.elements,firstView.elements);
    assert.deepEqual(pass.brushMaterial.uniforms.fieldView.value.elements,camera.matrixWorldInverse.elements);
    assert.deepEqual(pass.brushMaterial.uniforms.fieldProjection.value.elements,camera.projectionMatrix.elements);
    assert.equal(pass.brushMaterial.uniforms.swirl.value,.75);assert.equal(disposed,0);
    pass.render(renderer,source,500,800,options,camera,[...splats]);
    assert.notEqual(pass.geometry,geometry);assert.equal(disposed,1);
    assert.deepEqual(pass.geometry.getAttribute('markAnchor').array,anchors,'equivalent scene data builds the same field');
    assert.equal(JSON.stringify(splats),snapshot,'projection must never alter the authored world');
  }finally{pass.dispose();source.dispose();}
});

test('draw errors restore caller state and all lazy resources dispose once',()=>{
  const pass=new PainterlyVignettePass(),renderer=rendererFixture(),source=new THREE.Texture(),previous=renderer.currentTarget;
  renderer.fail=true;
  assert.throws(()=>pass.render(renderer,source,800,600,{painterlyVignette:true}),/test draw failure/);
  assert.equal(renderer.currentTarget,previous);assert.equal(renderer.autoClear,true);assert.equal(renderer.scissorTest,true);
  assert.deepEqual(renderer.viewport.toArray(),[4,6,320,210]);assert.deepEqual(renderer.scissor.toArray(),[8,10,300,190]);
  let disposed=0;
  for(const resource of [pass.target,pass.copyMaterial,pass.brushMaterial,pass.copyGeometry,pass.geometry])resource.addEventListener('dispose',()=>disposed++);
  pass.dispose();pass.dispose();source.dispose();
  assert.equal(disposed,5);assert.equal(pass.scene.children.length,0);
});
