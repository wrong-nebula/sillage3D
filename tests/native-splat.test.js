import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decodeNativeSplat} from '../src/splat/nativeSplat.js';
import {pollinatorPose} from '../src/splat/techDemo.js';

function fixture(){
  const data=new ArrayBuffer(64),view=new DataView(data),bytes=new Uint8Array(data);
  for(let i=0;i<2;i++){
    [1,i*2,3,.5,.25,.125].forEach((v,k)=>view.setFloat32(i*32+k*4,v,true));
    bytes.set([64,128,255,192,218,128,128,218],i*32+24); // 90 degrees around Z.
  }
  return data;
}
test('native splats preserve RGB, opacity, rotated anisotropic scale and record identity',()=>{
  const splats=decodeNativeSplat(fixture(),{height:4,flipYZ:false});
  assert.equal(splats.length,2);
  assert.deepEqual(splats.map(s=>s.center),[[0,0,0],[0,4,0]]);
  const s=splats[0];assert.deepEqual(s.color,[64/255,128/255,1]);assert.equal(s.opacity,192/255);
  const expected=[[0,1,0],[-.5,0,0],[0,0,.25]];
  s.axes.forEach((axis,i)=>axis.forEach((v,k)=>assert.ok(Math.abs(v-expected[i][k])<1e-12)));
  const flipped=decodeNativeSplat(fixture(),{height:4});
  assert.deepEqual(flipped.map(s=>s.center),[[0,4,0],[0,0,0]]);
  assert.ok(Math.abs(flipped[0].axes[0][1]+1)<1e-12);
});
test('native importer rejects truncated data, NaN values, singular rotations and degenerate bounds',()=>{
  assert.throws(()=>decodeNativeSplat(new ArrayBuffer(31)),/byte length/);
  assert.throws(()=>decodeNativeSplat(new ArrayBuffer(0)),/byte length/);
  const data=fixture();new DataView(data).setFloat32(0,NaN,true);
  assert.throws(()=>decodeNativeSplat(data),/Invalid native splat/);
  const rotation=fixture();new Uint8Array(rotation).fill(128,28,32);
  assert.throws(()=>decodeNativeSplat(rotation),/rotation/);
  assert.throws(()=>decodeNativeSplat(fixture().slice(0,32)),/height/);
});
test('bundled CC0 plant imports all 51,278 native records without resampling',async()=>{
  const bytes=await readFile(new URL('../public/cc0-demo/potted-plant.splat',import.meta.url));
  const splats=decodeNativeSplat(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),{height:3.5});
  assert.equal(splats.length,51278);
  assert.equal(Math.min(...splats.map(s=>s.center[1])),0);
  assert.equal(Math.max(...splats.map(s=>s.center[1])),3.5);
  for(let i=0;i<splats.length;i+=151){assert.equal(splats[i].opacity,bytes[i*32+27]/255);assert.equal(splats[i].color[0],bytes[i*32+24]/255);}
});
test('pollinator flight remains bounded and loops without a position or velocity jump',()=>{
  for(const kind of ['bee','butterfly']){
    const period=Math.PI*2/(kind==='bee'?.24:.17),dt=.001;
    for(let t=0;t<period;t+=.1){
      const {position:[x,y,z]}=pollinatorPose(t,kind);assert.ok(Math.abs(x)<=.72&&Math.abs(z)<=.48&&y>=1.63&&y<=1.97);
    }
    const start=pollinatorPose(0,kind),end=pollinatorPose(period,kind);
    start.position.forEach((v,i)=>assert.ok(Math.abs(v-end.position[i])<1e-10));
    const before=pollinatorPose(period-dt,kind),after=pollinatorPose(dt,kind);
    start.position.forEach((v,i)=>assert.ok(Math.abs((v-before.position[i])-(after.position[i]-v))<1e-6));
  }
});
