import test from 'node:test';
import {readFileSync} from 'node:fs';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import assert from 'node:assert/strict';
import {featureLabScenes} from '../src/splat/featureLabScenes.js';
import {materialSettings,splatMaterialUniforms} from '../src/splat/SplatMaterialResponse.js';
import {splatMaterialSeed} from '../src/splat/SplatSurface.js';
import {balanceStudioBounce} from '../src/splat/StudioBounce.js';
import {prepareColorResponse} from '../src/splat/colorResponse.js';

test('all reflective finishes preserve semantic GPU tags and camera-independent pigment',async()=>{
  const actor=await featureLabScenes[0].create().loadActor();
  for(const [index,type] of [[0,24],[1,25],[2,20],[3,21],[4,17],[5,22],[6,23],[7,18],[8,19]]){
    actor.setMaterial(index);const colors=actor.splats.map(s=>s.color.slice());
    assert.ok(actor.splats.every(s=>Math.floor(splatMaterialSeed(s))===type));
    actor.advance(.2);assert.deepEqual(actor.splats.map(s=>s.color),colors);
  }
  actor.setMaterial(0);assert.ok(actor.splats.every(s=>Math.floor(splatMaterialSeed(s))===24),'porcelain replaces the preceding metal tag');
});

test('GPU metal controls are bounded and encode brush rotation as radians',()=>{
  const settings=materialSettings({metalRoughness:-1,metalReflectionStrength:100,metalRotation:90,anisotropy:Infinity});
  assert.equal(settings.surface[2],.06);assert.equal(settings.metal[0],2);assert.equal(settings.metal[1],Math.PI/2);
  assert.equal(splatMaterialUniforms({metalReflectionStrength:0}).splatMetal.value.x,0);
});

test('area bounce fields are finite and reweight without changing source colors',()=>{
  const scene=featureLabScenes.find(s=>s.bounceStudy),definition=scene.create(),lighting=definition.lighting;
  assert.equal(lighting.stats.patches,60);assert.ok(lighting.warm.some(v=>v>0)&&lighting.cool.some(v=>v>0));
  assert.ok(lighting.irradiance.every(v=>Number.isFinite(v)&&v>=0));
  for(let i=0;i<definition.splats.length;i++)if(definition.splats[i].bounceEmitter)assert.equal(lighting.irradiance[i*3],0);
  const colors=definition.splats.map(s=>s.color.slice()),prepared=prepareColorResponse(definition.splats,lighting);
  balanceStudioBounce(lighting,0,prepared);const warm=lighting.irradiance.slice();
  assert.ok(warm.every((v,i)=>Math.abs(v-lighting.warm[i]*2)<1e-7));
  balanceStudioBounce(lighting,1,prepared);assert.notDeepEqual(lighting.irradiance,warm);
  for(let i=0;i<prepared.bounce.length;i++)assert.ok(Math.abs(prepared.bounce[i]-Math.sqrt(prepared.linear[i])*lighting.cool[i]*3)<1e-7);
  assert.deepEqual(definition.splats.map(s=>s.color),colors);
});

 test('the local studio source is a finite high-dynamic-range Radiance map',()=>{
  const scene=featureLabScenes[0].create();assert.equal(scene.background,'#000000');
  const bytes=readFileSync(new URL('../public'+scene.materialEnvironment,import.meta.url));
  const parsed=new HDRLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  assert.equal(parsed.width,1024);assert.equal(parsed.height,512);assert.ok(parsed.data.length>0);
  assert.ok(parsed.data.some(value=>value>15360),'half-float source retains radiance above 1.0');
});

test('each surface starts at its balanced exposure and remembers a manual override',async()=>{
  const actor=await featureLabScenes[0].create().loadActor(),engine={options:{},setStyle(key,value){this.options[key]=value;}};
  actor.attachEngine(engine);actor.setMaterial(7);assert.equal(engine.options.studioIntensity,.35);
  engine.options.studioIntensity=.2;actor.setMaterial(2);assert.equal(engine.options.studioIntensity,1.2);
  actor.setMaterial(7);assert.equal(engine.options.studioIntensity,.2);
});
