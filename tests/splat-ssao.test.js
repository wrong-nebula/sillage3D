import test from 'node:test';
import assert from 'node:assert/strict';
import {ShaderMaterial,RedFormat,NoBlending} from 'three';
import {SSAO_DEFAULTS,ssaoSettings,ssaoSize,SplatSSAO} from '../src/splat/SplatSSAO.js';
import {featureLabScenes} from '../src/splat/featureLabScenes.js';

test('SSAO is opt-in, finite, and has a true disabled state at zero strength',()=>{
  assert.equal(SSAO_DEFAULTS.ssao,false);assert.equal(ssaoSettings({}).enabled,false);
  assert.equal(ssaoSettings({ssao:true,ssaoStrength:0}).enabled,false);
  const settings=ssaoSettings({ssao:true,ssaoStrength:Infinity,ssaoRadius:-4,ssaoBias:4});
  assert.deepEqual(settings,{enabled:true,strength:1.15,radius:.08,bias:.15,debug:false});
});

test('half-resolution AO is bounded independently of export size and aspect',()=>{
  assert.deepEqual(ssaoSize(1440,1000),[720,500]);assert.deepEqual(ssaoSize(390,844),[195,422]);
  for(const [w,h] of [[4096,2160],[1920,1200],[1,1],[1200,4000]]){
    const [x,y]=ssaoSize(w,h);assert.ok(x>=1&&y>=1&&x<=800&&y<=800);assert.ok(x<=Math.ceil(w*.5)&&y<=Math.ceil(h*.5));
  }
});

test('capture shares live uniforms, writes nearest depth, and releases source programs on scene changes',()=>{
  const pass=new SplatSSAO(),source=new ShaderMaterial({uniforms:{windTime:{value:1}}});
  pass.captureMaterial(source);const capture=pass.capture;assert.equal(capture.uniforms.windTime,source.uniforms.windTime);
  assert.equal(capture.depthWrite,true);assert.equal(capture.depthTest,true);assert.equal(capture.blending,NoBlending);
  assert.equal(pass.aoTarget.texture.format,RedFormat);pass.captureMaterial(source);assert.equal(pass.capture,capture);
  let released=false;capture.addEventListener('dispose',()=>{released=true;});pass.releaseCapture();assert.ok(released);assert.equal(pass.source,null);
  pass.dispose();source.dispose();
});

test('new SSAO study uses splats, zero baked transport, and a moving contact probe',async()=>{
  const study=featureLabScenes.find(s=>s.ssaoStudy),definition=study.create(),actor=await definition.loadActor();
  assert.equal(study.initialStyle.ssao,true);assert.equal(study.initialStyle.mode,'paint');assert.equal(study.camera.fitAspect,1.15);
  assert.ok(definition.lighting.irradiance.every(v=>v===0));assert.ok(definition.lighting.shadow.every(v=>v===0));
  const original=actor.splats.map(s=>s.center.slice()),colors=actor.splats.map(s=>s.color.slice());actor.advance(1);
  assert.notDeepEqual(actor.splats.map(s=>s.center),original);assert.deepEqual(actor.splats.map(s=>s.color),colors);
  const data=new Float32Array((actor.splats.length+1)*20),centers=new Float32Array((actor.splats.length+1)*3);
  actor.writePacked(data,centers,1);assert.ok(Math.abs(data[21]-actor.splats[0].center[1])<1e-6);
});
