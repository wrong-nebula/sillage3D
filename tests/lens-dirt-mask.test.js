import test from 'node:test';
import assert from 'node:assert/strict';
import {createLensDirtMask,dirtUVScale} from '../src/splat/lensDirtMask.js';

test('lens mask is deterministic by seed and changes with a different seed',()=>{
  const first=createLensDirtMask(256,42),same=createLensDirtMask(256,42),other=createLensDirtMask(256,43);
  assert.deepEqual(first.data,same.data);
  assert.notDeepEqual(first.data,other.data);
});

test('default mask is sparse, varied grayscale RGBA with opaque alpha',()=>{
  const mask=createLensDirtMask();
  assert.equal(mask.width,512);assert.equal(mask.height,512);
  assert.ok(mask.data instanceof Uint8Array);
  assert.equal(mask.data.length,512*512*4);
  let coverage=0,empty=0,peak=0;
  const levels=new Set();
  for(let i=0;i<mask.data.length;i+=4){
    const v=mask.data[i];
    assert.equal(mask.data[i+1],v);assert.equal(mask.data[i+2],v);assert.equal(mask.data[i+3],255);
    if(v>12)coverage++;if(v===0)empty++;peak=Math.max(peak,v);levels.add(v);
  }
  coverage/=512*512;empty/=512*512;
  assert.ok(coverage>.18&&coverage<.35,`meaningful coverage ${coverage}`);
  assert.ok(empty>.5,`untouched optical area ${empty}`);
  assert.ok(peak>100&&levels.size>80,'brushes should retain soft varied intensity');
});

test('center remains textured while the periphery is modestly stronger',()=>{
  const {data,width}=createLensDirtMask();
  let center=0,centerCount=0,edge=0,edgeCount=0;
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const r=Math.hypot(x/width-.5,y/width-.5),v=data[(y*width+x)*4];
    if(r<.2){center+=v;centerCount++;}
    if(r>.48){edge+=v;edgeCount++;}
  }
  const centralMean=center/centerCount,edgeMean=edge/edgeCount;
  assert.ok(centralMean>4,'the center must not be a blank hole');
  assert.ok(edgeMean>centralMean&&edgeMean<centralMean*3,'peripheral weighting should remain restrained');
});

test('wrapped boundary gradients do not introduce a visible cut seam',()=>{
  const {data,width:n}=createLensDirtMask();
  let boundary=0,interior=0;
  for(let y=0;y<n;y++){
    boundary+=Math.abs(data[(y*n)*4]-data[(y*n+n-1)*4]);
    for(let x=1;x<n;x++)interior+=Math.abs(data[(y*n+x)*4]-data[(y*n+x-1)*4]);
  }
  const edgeGradient=boundary/n,meanGradient=interior/(n*(n-1));
  assert.ok(edgeGradient<meanGradient*3+1,`${edgeGradient} versus ${meanGradient}`);
});

test('texture allocation is bounded and invalid requests are rejected',()=>{
  assert.equal(createLensDirtMask(8).width,64);
  const largest=createLensDirtMask(4096);
  assert.equal(largest.width,1024);assert.equal(largest.data.byteLength,4*1024*1024);
  for(const value of [NaN,Infinity,0,-1])assert.throws(()=>createLensDirtMask(value),RangeError);
  assert.throws(()=>createLensDirtMask(512,NaN),RangeError);
});

test('cover UV scaling preserves brush aspect and applies bounded size control',()=>{
  assert.deepEqual(dirtUVScale(16/9),[1,9/16]);
  assert.deepEqual(dirtUVScale(9/16),[9/16,1]);
  assert.deepEqual(dirtUVScale(2,2),[1,1]);
  assert.deepEqual(dirtUVScale(16/9,1,2),[.5,9/32]);
  assert.deepEqual(dirtUVScale(1,1,.01),[4,4]);
  assert.deepEqual(dirtUVScale(1,1,100),[.25,.25]);
  for(const args of [[0],[1,0],[1,1,0],[NaN],[1,Infinity]])assert.throws(()=>dirtUVScale(...args),RangeError);
});
