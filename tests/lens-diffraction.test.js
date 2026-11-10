import test from 'node:test';
import assert from 'node:assert/strict';
import {diffractionWeights,lensOpticsSettings} from '../src/splat/LensDiffraction.js';
import {PerspectiveCamera} from 'three';
import {SplatVisibility} from '../src/splat/SplatVisibility.js';
import {ReefCaustics} from '../src/splat/ReefCaustics.js';

test('sampled spectral diffraction conserves a constant image in every channel',()=>{
  const weights=diffractionWeights();
  for(let channel=0;channel<3;channel++){
    assert.ok(weights.every(ring=>Number.isFinite(ring[channel])&&ring[channel]>0));
    const total=weights[0][channel]+4*weights[1][channel];
    assert.ok(Math.abs(total-1)<1e-12);
  }
  // Shorter wavelengths concentrate more energy inside the same central disc.
  assert.ok(weights[0][2]>weights[0][1]&&weights[0][1]>weights[0][0]);
});

test('diffraction and red/blue fringe can be compared independently while old reef defaults remain intact',()=>{
  assert.deepEqual(lensOpticsSettings({},true),{enabled:true,blur:1,fringe:.48,scale:1});
  assert.deepEqual(lensOpticsSettings({chromaticAberration:false},true),{enabled:true,blur:1,fringe:0,scale:1});
  assert.deepEqual(lensOpticsSettings({chromaticAberration:true,fringeStrength:.9},false),{enabled:true,blur:0,fringe:.9,scale:1});
  assert.equal(lensOpticsSettings({},false).enabled,false);
  const bounded=lensOpticsSettings({diffractionScale:100,diffractionStrength:-2,fringeStrength:Infinity},true);
  assert.deepEqual(bounded,{enabled:true,blur:0,fringe:.48,scale:3});
});

test('foreground optical support survives culling when the same view toggles diffraction',()=>{
  const camera=new PerspectiveCamera(60,1,.08,100);
  camera.updateMatrixWorld(true);
  const centers=new Float32Array([3*Math.tan(Math.PI/6)+.01,0,-3]);
  const data=new Float32Array(20);
  data[4]=data[9]=data[14]=.001;
  const visibility=new SplatVisibility(data,1),order=new Uint32Array([0]),indices=new Float32Array(1);
  const settings={width:1000,height:1000,cacheKey:'same-view'};
  const count=opticalPixels=>visibility.write(order,centers,camera,{},indices,null,null,{...settings,opticalPixels}).submitted;
  assert.equal(count(0),0);
  assert.equal(count(0),0);
  assert.equal(count(18),1);
});

test('night disables diffraction and daylight restores the chosen preference',()=>{
  const light=new ReefCaustics({strength:1.17,surfaceY:3.3},false);
  try{
    assert.equal(light.diffractionActive,true);
    light.setNight(true);
    assert.equal(light.diffractionActive,false);
    assert.equal(light.diffraction.value,true);
    light.setNight(false);
    assert.equal(light.diffractionActive,true);
    light.diffraction.value=false;
    light.setNight(true);light.setNight(false);
    assert.equal(light.diffractionActive,false);
  }finally{light.dispose();}
});
