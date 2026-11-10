import test from 'node:test';
import assert from 'node:assert/strict';
import {DataTexture,Vector3} from 'three';
import {GaussianBrushRenderer} from '../src/splat/GaussianBrushRenderer.js';
import {prepareColorResponse,COLOR_DEFAULTS} from '../src/splat/colorResponse.js';
import {packSplats} from '../src/splat/math.js';

test('uniform controls avoid pigment uploads while lighting changes still recolor the original packed data',()=>{
  const splats=[{center:[0,0,-5],axes:[[1,0,0],[0,1,0],[0,0,.1]],color:[.4,.6,.2],seed:.1,opacity:.9}];
  const e=Object.create(GaussianBrushRenderer.prototype),data=packSplats(splats).data;
  Object.assign(e,{options:{...COLOR_DEFAULTS,mode:'paint',brushScale:1,coverage:1,softness:.2,indirect:false,tintedShadows:false},
    texture:new DataTexture(data),colorResponse:prepareColorResponse(splats,{irradiance:new Float32Array([.1,.3,.05]),shadow:new Float32Array([.5])}),
    material:{uniforms:Object.fromEntries(['brushScale','painted','coverage','softness','ghibli','oilPaint','paperFrequency'].map(k=>[k,{value:0}]))}});
  e.material.uniforms.gouacheSettings={value:new Vector3()};e.colorDirty=true;e.updateColors();
  const version=e.texture.version,original=data.slice();
  for(const [key,value] of Object.entries({mode:'ghibli',brushScale:1.2,gouacheTone:.8,foregroundDOF:true,dofStrength:.8,lensDirt:true,quality:'studio',ssao:true,ssaoRadius:.8,ssaoStrength:1.4,ssaoDebug:true})){
    e.setStyle(key,value);e.updateColors();assert.equal(e.texture.version,version);assert.deepEqual(data,original);
  }
  assert.equal(e.material.uniforms.ghibli.value,1);assert.equal(e.material.uniforms.gouacheSettings.value.z,.8);
  e.setStyle('indirect',true);e.updateColors();assert.equal(e.texture.version,version+1);assert.notDeepEqual(data,original);
  e.setStyle('indirect',false);e.updateColors();assert.deepEqual(data,original);
  e.dirty=false;e.setStyle('indirect',false);assert.equal(e.dirty,false);
});
