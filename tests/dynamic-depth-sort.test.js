import test from 'node:test';
import assert from 'node:assert/strict';
import {DynamicDepthOrder,depthOrder} from '../src/splat/math.js';

const view=[1,0,.37,0,0,1,-.25,0,0,0,.81,0,0,0,-17,1];
test('moving subset merges match a complete sort through crossings, ties and camera moves',()=>{
  let seed=7;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const centers=Float32Array.from({length:100000*3},()=>Math.round((random()-.5)*200));
  const moving=Array.from({length:196},(_,i)=>i*509),sorter=new DynamicDepthOrder(centers,moving),order=new Uint32Array(100000),reference=new Uint32Array(100000),m=view.slice();
  for(let frame=0;frame<25;frame++){
    for(const i of moving){centers[i*3]=Math.round((random()-.5)*200);centers[i*3+2]=frame%3?Math.round((random()-.5)*200):0;}
    if(frame===9)m[2]=-.12;if(frame===17)m[14]=.5;
    assert.equal(sorter.sort(m,order),order);assert.deepEqual(order,depthOrder(centers,m,reference),`frame ${frame}`);
  }
  assert.equal(sorter.fullSorts,3);assert.equal(sorter.merges,22);
});
test('both views maintain independent caches and exact source ties including signed zero',()=>{
  const centers=Float32Array.from([0,0,-0,0,0,0,0,0,1e-30,0,0,-1e-30,0,0,-3,0,0,3]);
  const m=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],mirror=m.slice();mirror[10]=-1;
  const a=new DynamicDepthOrder(centers,[4,0,4,2]),b=new DynamicDepthOrder(centers,[2,4,0]);
  for(const z of [-3,0,-0,1e-30,3]){
    centers[2]=z;centers[14]=-z;
    for(const [sorter,matrix] of [[a,m],[b,mirror]])assert.deepEqual(sorter.sort(matrix,new Uint32Array(6)),depthOrder(centers,matrix));
  }
  assert.equal(a.fullSorts,1);assert.equal(b.fullSorts,1);
});
test('empty, fully static, and fully dynamic scenes preserve order and validate membership',()=>{
  for(const count of [0,1,20])for(const all of [false,true]){
    const centers=Float32Array.from({length:count*3},(_,i)=>i%7),sorter=new DynamicDepthOrder(centers,all?Array.from({length:count},(_,i)=>i):[]),order=new Uint32Array(count);
    for(let frame=0;frame<3;frame++){
      if(all)for(let i=0;i<centers.length;i++)centers[i]=Math.sin(i+frame);
      assert.deepEqual(sorter.sort(view,order),depthOrder(centers,view));
    }
  }
  assert.throws(()=>new DynamicDepthOrder(new Float32Array(6),[2]),RangeError);
  assert.throws(()=>new DynamicDepthOrder(new Float32Array(6),[-1]),RangeError);
  assert.throws(()=>new DynamicDepthOrder(new Float32Array(6),[.5]),RangeError);
  assert.throws(()=>new DynamicDepthOrder(new Float32Array(6)).sort(view,new Uint32Array(3)),RangeError);
});
test('bulk-copy and dense merge paths preserve source ties at the sparse threshold',()=>{
  const count=10000,m=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const movingCount of [0,1,150,154,155,156,200,9999]){
    const centers=new Float32Array(count*3),moving=Array.from({length:movingCount},(_,i)=>i),sorter=new DynamicDepthOrder(centers,moving),order=new Uint32Array(count);
    sorter.sort(m,order);
    for(const z of [-1,0,1,-0]){for(const i of moving)centers[i*3+2]=z;assert.deepEqual(sorter.sort(m,order),depthOrder(centers,m));}
  }
});
