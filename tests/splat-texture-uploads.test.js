import test from 'node:test';
import assert from 'node:assert/strict';
import {DataTexture,FloatType,RGBAFormat} from 'three';
import {SplatTextureUploads} from '../src/splat/SplatTextureUploads.js';

function setup(width=8,height=8){
  const data=Float32Array.from({length:width*height*4},(_,i)=>i),gpu=data.slice().fill(-1),texture=new DataTexture(data,width,height,RGBAFormat,FloatType);
  texture.needsUpdate=true;let version=-1;const calls=[];
  const renderer={initTexture(t){if(version!==t.version){gpu.set(t.image.data);version=t.version;calls.push('full');}},copyTextureToTexture(source,dest,box,position){
    assert.equal(dest,texture);assert.deepEqual(position.toArray(),box.min.toArray());calls.push(box.clone());
    for(let y=box.min.y;y<box.max.y;y++){const a=(y*width+box.min.x)*4,b=(y*width+box.max.x)*4;gpu.set(source.image.data.subarray(a,b),a);}
  }};
  return {data,gpu,texture,renderer,calls,uploads:new SplatTextureUploads(renderer,texture)};
}
test('contiguous actor updates use two edge rows and a single interior rectangle',()=>{
  const {uploads,data,gpu}=setup();uploads.flush();data.fill(9,12,220);uploads.mark(12,208);
  assert.deepEqual(uploads.rectangles(),[{x:3,y:0,width:5,height:1},{x:0,y:1,width:8,height:5},{x:0,y:6,width:7,height:1}]);
  uploads.flush();assert.deepEqual(gpu,data);assert.equal(uploads.lastUpload.calls,3);assert.equal(uploads.lastUpload.bytes,208*4);
  uploads.flush();assert.equal(uploads.lastUpload.calls,0);
});
test('partial XYZ edits and overlapping/sparse spans preserve every RGBA channel',()=>{
  const {uploads,data,gpu}=setup(8,20);uploads.flush();let seed=17;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let frame=0;frame<10;frame++){
    for(let j=0;j<30;j++){const start=Math.floor(random()*(data.length-30)),count=Math.ceil(random()*30);data.fill(frame+.123,start,start+count);uploads.mark(start,count);}
    uploads.flush();assert.deepEqual(gpu,data);
  }
  assert.throws(()=>uploads.mark(-1,4),RangeError);assert.throws(()=>uploads.mark(0,data.length+1),RangeError);assert.throws(()=>uploads.mark(.5,4),RangeError);
});
test('initial/external full uploads include queued motion and supersede stale partial ranges',()=>{
  const {uploads,data,gpu,texture,renderer}=setup();renderer.initTexture(texture);
  data[3]=99;uploads.mark(3,1);uploads.flush();assert.deepEqual(gpu,data);
  data[0]=42;uploads.mark(0,1);data[100]=25;texture.addUpdateRange(100,1);texture.needsUpdate=true;
  uploads.flush();assert.equal(uploads.lastUpload.full,true);assert.deepEqual(gpu,data);assert.equal(texture.updateRanges.length,0);
  assert.equal(uploads.rows.size,0);uploads.dispose();
});
