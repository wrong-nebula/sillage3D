import test from 'node:test';
import assert from 'node:assert/strict';
import {GhibliPaintPass} from '../src/splat/GhibliPaintPass.js';
import {GHIBLI_DEFAULTS,GHIBLI_FRAGMENT_GLSL} from '../src/splat/ghibliPaint.js';
import {WATERCOLOR_FRAGMENT_GLSL} from '../src/splat/watercolorPaint.js';
import {coverageFirstGouache} from './fixtures/coverage-first-gouache.js';
import {readFileSync} from 'node:fs';
import {selectPlantLevels} from '../src/splat/PlantLOD.js';
import {PerspectiveCamera} from 'three';

test('paint pass reuses its target, scales across export, and restores the enclosing render target',()=>{
  const pass=new GhibliPaintPass(),source={},previous={},draws=[];
  let current=previous;
  const renderer={getRenderTarget:()=>current,setRenderTarget:t=>{current=t;},render:()=>draws.push(current)};
  try{
    assert.equal(pass.render(renderer,source,1200,750,{gouacheBlend:0,gouacheTexture:0}),source);
    assert.equal(draws.length,0);
    const first=pass.render(renderer,source,1200,750,GHIBLI_DEFAULTS),radius=pass.material.uniforms.radius.value;
    assert.equal(current,previous);assert.equal(draws[0],pass.target);assert.equal(pass.target.width,1200);
    const exported=pass.render(renderer,source,1920,1200,GHIBLI_DEFAULTS);
    assert.equal(exported,first);assert.equal(pass.target.width,1920);assert.equal(pass.target.height,1200);
    assert.ok(Math.abs(pass.material.uniforms.radius.value/radius-1.6)<1e-12);
    assert.deepEqual(pass.material.uniforms.paperScale.value.toArray(),[1440,900]);
    renderer.render=()=>{throw new Error('context interrupted');};
    assert.throws(()=>pass.render(renderer,source,800,500,GHIBLI_DEFAULTS),/context interrupted/);
    assert.equal(current,previous);
  }finally{pass.dispose();}
});

test('paint target, shader, and geometry are released on renderer disposal',()=>{
  const pass=new GhibliPaintPass(),released={target:0,material:0,geometry:0};
  for(const key of Object.keys(released))pass[key].addEventListener('dispose',()=>released[key]++);
  pass.dispose();assert.deepEqual(released,{target:1,material:1,geometry:1});
});

test('gouache requests finer source plants within the existing active-splat budget',()=>{
  const camera=new PerspectiveCamera(40,1.6,.08,600);camera.position.z=10;camera.lookAt(0,0,0);
  const groups=Array.from({length:5},(_,i)=>({id:String(i),start:i*10,count:10,center:[i*.1,0,0],radius:.5,spacing:.05,levels:[{count:40},{count:160}]}));
  const options={height:1000,baseCount:100,maxActiveSplats:200,draftMaxActiveSplats:150};
  const original=selectPlantLevels(groups,camera,options),gouache=selectPlantLevels(groups,camera,{...options,mode:'ghibli'});
  assert.equal(original.levels.size,0);assert.ok(gouache.levels.size>0);assert.ok(gouache.count<=200);
  const low=selectPlantLevels(groups,camera,{...options,mode:'ghibli',quality:'draft'});
  assert.ok(low.count<=150);assert.ok([...low.levels.values()].every(l=>l===1));
});

test('the coverage-first experiment still applies to the current gouache kernel',()=>{
  // The fragment shader is the kernel followed by the renderer's main(), whose
  // template text carries the call sites the fixture rewrites.
  const renderer=readFileSync(new URL('../src/splat/GaussianBrushRenderer.js',import.meta.url),'utf8');
  const shader=GHIBLI_FRAGMENT_GLSL+WATERCOLOR_FRAGMENT_GLSL+renderer.slice(renderer.indexOf('const fragmentShader ='),renderer.indexOf('function createSplatGeometry'));
  const candidate=coverageFirstGouache(shader);
  assert.notEqual(candidate,shader);
  assert.match(candidate,/float edgeSoftness,vec3 settings,vec4 alphaSettings\)\{/);
  // Derivatives stay ahead of the new discard; pigment noise moves behind it.
  const kernel=candidate.slice(candidate.indexOf('vec4 gouacheMark('),candidate.indexOf('return vec4(clamp(color,0.,1.),clamp(markAlpha,0.,.995));'));
  // The watercolor kernel, which shares the grain lines, is left untouched.
  assert.ok(candidate.includes(WATERCOLOR_FRAGMENT_GLSL));
  const at=text=>{const i=kernel.indexOf(text);assert.ok(i>=0,text);return i;};
  assert.ok(at('length(fwidth(grainUV))')<at('if(resolvedAlpha<.004)discard;'));
  assert.ok(at('fwidth(brush.y*31.)')<at('if(resolvedAlpha<.004)discard;'));
  assert.ok(at('if(resolvedAlpha<.004)discard;')<at('float wash=paintNoise(paper*4.5);'));
  assert.ok(at('float wash=paintNoise(paper*4.5);')<at('paintGrainNoise(grainUV)'));
  assert.equal(kernel.split('float wash=').length,2);assert.equal(kernel.split('float grain=0.;').length,2);
  assert.match(candidate,/settings,vec4\(baseAlpha,blurMix,defocusCoverage,lodWeight\)\);/);
  assert.match(candidate,/gouacheSettings,vec4\(1\.,1\.,1\.,1\.\)\);/);
  assert.throws(()=>coverageFirstGouache(candidate),/no longer matches/);
});

test('fine grain is procedural in every paint kernel, so it never repeats',()=>{
  for(const kernel of [GHIBLI_FRAGMENT_GLSL.slice(GHIBLI_FRAGMENT_GLSL.indexOf('vec4 gouacheMark(')),WATERCOLOR_FRAGMENT_GLSL]){
    // 61 to 83 cells per world unit: the 4096-cell noise window would repeat within 34 units.
    assert.match(kernel,/vec2 grainUV=paper\*(61|83)\.;/);
    assert.ok(kernel.includes('if(grainFade>0.)grain=(paintGrainNoise(grainUV)-.5)*grainFade;'));
    assert.ok(!kernel.includes('paintNoise(grainUV)'));
  }
});

test('the paper scale sizes the shared wash and grain and is 1 as authored',async()=>{
  const {GHIBLI_DEFAULTS,PAPER_WASH_FREQUENCY,PAPER_DAB_SIGMAS,PAPER_REFERENCE_SIGMA,PAPER_SCALE_RANGE,paperFit}=await import('../src/splat/ghibliPaint.js');
  const {readFileSync}=await import('node:fs');
  const renderer=readFileSync(new URL('../src/splat/GaussianBrushRenderer.js',import.meta.url),'utf8');
  assert.equal(GHIBLI_DEFAULTS.paperScale,1);
  // The reference scene's dab spans the same cells at scale 1 as any scene at its matched scale.
  const reference=paperFit(PAPER_REFERENCE_SIGMA),small=paperFit(.034);
  assert.equal(reference.matched,1);assert.ok(Math.abs(reference.cells-PAPER_WASH_FREQUENCY*PAPER_DAB_SIGMAS*PAPER_REFERENCE_SIGMA)<1e-12);
  assert.ok(small.cells<1&&small.matched<.1);
  assert.ok(Math.abs(paperFit(.034,1,small.matched).cells-reference.cells)<1e-9);
  // A larger brush is a larger dab; a larger paper spans fewer cells.
  assert.ok(Math.abs(paperFit(.2,1.5).dab-1.5*paperFit(.2).dab)<1e-12);assert.ok(Math.abs(paperFit(.2,1,2).cells-paperFit(.2).cells/2)<1e-12);
  assert.deepEqual(paperFit(0),{scale:1,dab:0,cells:0,matched:1});
  assert.equal(paperFit(1e-6).matched,PAPER_SCALE_RANGE[0]);assert.equal(paperFit(1e6).matched,PAPER_SCALE_RANGE[1]);
  // Only the coordinate handed to the mark kernels is scaled: water level,
  // terrain color and reef light keep reading the true surface point.
  assert.equal(renderer.split('paintSurface*paperFrequency').length,4);
  assert.match(renderer,/watercolorMark\(localCoord,paintSurface\*paperFrequency,/);
  assert.equal(renderer.split('gouacheMark(localCoord,brush,paintSurface*paperFrequency,').length,3);
  assert.match(renderer,/const paper=this\.paperScale\(\);u\.paperFrequency\.value=1\/paper;/);
  assert.match(renderer,/const scale=\(this\.paperConfig\?\?1\)\*\(this\.options\.paperScale\?\?1\);/);
  assert.match(renderer,/paperFrequency:\{value:1\}/);
});
