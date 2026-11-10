import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {featureLabScenes,LAB_MATERIALS} from '../src/splat/featureLabScenes.js';
import {GaussianBrushRenderer} from '../src/splat/GaussianBrushRenderer.js';
import {packSplats} from '../src/splat/math.js';
import {DynamicWater} from '../src/splat/DynamicWater.js';

test('renderer loads and resets an isolated scene catalog without modifying the studio catalog',()=>{
  const definition={splats:[]},camera={position:[1,3,8],target:[0,2,0],fov:37};
  const engine=Object.assign(Object.create(GaussianBrushRenderer.prototype),{
    sceneDefinitions:[{camera,create:()=>definition}],cache:new Map(),camera:new PerspectiveCamera(),
    controls:{target:new Vector3(),update(){}},size:{width:1200,height:800},buildScene(value){this.built=value;},
  });
  engine.load(0);assert.equal(engine.built,definition);
  assert.deepEqual(engine.camera.position.toArray(),camera.position);
  assert.deepEqual(engine.controls.target.toArray(),camera.target);
  assert.equal(engine.camera.fov,37);assert.throws(()=>engine.load(1),/Unknown scene/);
});

test('procedural mini scenes retain finite, orthogonal, full-rank Gaussians within small budgets',()=>{
  for(const scene of featureLabScenes.filter(s=>!s.prepare)){
    const definition=scene.create();assert.ok(definition.splats.length>0&&definition.splats.length<(scene.splatBudget??20000),scene.id);
    assert.doesNotThrow(()=>packSplats(definition.splats));
    for(const s of definition.splats){
      const lengths=s.axes.map(a=>Math.hypot(...a));assert.ok(lengths.every(n=>n>0));
      for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)assert.ok(Math.abs(s.axes[i].reduce((v,x,k)=>v+x*s.axes[j][k],0))/(lengths[i]*lengths[j])<1e-8);
    }
  }
});

test('material cycling preserves geometry and changes pigment through the dynamic upload contract',async()=>{
  const scene=featureLabScenes.find(s=>s.materialCycle),actor=await scene.create().loadActor();actor.advance(0);
  const positions=actor.splats.map(s=>s.center.slice()),images=[];
  for(let i=0;i<LAB_MATERIALS.length;i++){
    actor.setMaterial(i);assert.equal(actor.materialIndex,i);
    const data=new Float32Array(actor.splats.length*20+40).fill(-1),centers=new Float32Array((actor.splats.length+2)*3).fill(-1);
    actor.writePacked(data,centers,1);assert.equal(data[0],-1);assert.equal(data.at(-1),-1);
    images.push(Array.from(data).join(','));
    assert.deepEqual(actor.splats.map(s=>s.center),positions,'switching surfaces does not move the sample');
  }
  assert.equal(new Set(images).size,LAB_MATERIALS.length);
  actor.advance(.2);assert.notDeepEqual(actor.splats.map(s=>s.center),positions);actor.dispose();
});

test('water optics and adaptive detail use bounded real engine inputs',async()=>{
  const definition=featureLabScenes.find(s=>s.id==='lab-reflections').create(),water=new DynamicWater(definition.dynamicWater);
  assert.equal(water.disturb(0,0,0),true);assert.equal(water.disturb(6,0,0),false);
  assert.ok(definition.reflection&&definition.refraction&&definition.forestCaustics);
  const lod=featureLabScenes.find(s=>s.id==='lab-lod').create().lod;
  for(const group of lod.groups)for(const level of [1,2]){
    const detail=await lod.load(group,level,new AbortController().signal);
    assert.equal(detail.splats.length,group.levels[level-1].count);
    assert.ok(detail.parents.every(parent=>parent>=group.start&&parent<group.start+group.count));
  }
});

test('turning reflections off invalidates the capture without destroying its target',()=>{
  const target={},uniform={value:true};
  GaussianBrushRenderer.prototype.renderWaterReflection.call({reflectionTarget:target,options:{waterReflection:false},material:{uniforms:{reflectionReady:uniform}}});
  assert.equal(uniform.value,false);
});

test('portrait fitting is explicitly opt-in and preserves each authored camera direction',()=>{
  const config={position:[.65,2.8,8.3],target:[0,2.05,0],fov:39,fitAspect:1};
  const engine=Object.assign(Object.create(GaussianBrushRenderer.prototype),{sceneDefinitions:[{camera:config}],sceneIndex:0,camera:new PerspectiveCamera(),controls:{target:new Vector3(),update(){}},size:{width:390,height:844}});
  engine.resetCamera();const offset=engine.camera.position.clone().sub(engine.controls.target),original=new Vector3().fromArray(config.position).sub(engine.controls.target);
  assert.ok(Math.abs(offset.length()/original.length()-844/390)<1e-10);assert.ok(offset.clone().normalize().distanceTo(original.normalize())<1e-10);
  engine.size={width:1440,height:1000};engine.resetCamera();assert.deepEqual(engine.camera.position.toArray(),config.position);
});
