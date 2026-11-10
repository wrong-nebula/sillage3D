import test from 'node:test';
import assert from 'node:assert/strict';
import {depthOrder} from '../src/splat/math.js';

const matrix=[1,0,.37,0,0,1,-.25,0,0,0,.81,0,0,0,-17,1];
function reference(centers,m){
  const depths=Float32Array.from({length:centers.length/3},(_,i)=>m[2]*centers[i*3]+m[6]*centers[i*3+1]+m[10]*centers[i*3+2]+m[14]);
  return Uint32Array.from({length:depths.length},(_,i)=>i).sort((a,b)=>depths[a]-depths[b]||a-b);
}
test('radix order exactly matches the original comparator across signs, ties, and reused orders',()=>{
  let seed=42;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const centers=Float32Array.from({length:100000*3},()=>Math.round((random()-.5)*1000)*.13);
  for(let i=0;i<200;i++)centers.set([0,0,0],i*3);
  const order=new Uint32Array(centers.length/3);
  for(const offset of [-100,0,100]){const m=matrix.slice();m[14]=offset;order.reverse();assert.equal(depthOrder(centers,m,order),order);assert.deepEqual(order,reference(centers,m));}
});
test('empty, equal, signed zero, and tiny depths retain the exact index tie break',()=>{
  const m=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const values of [[],[0,-0,0],[1e-30,-1e-30,0,-1,1,1]]){
    const centers=Float32Array.from(values.flatMap(z=>[0,0,z]));assert.deepEqual(depthOrder(centers,m),reference(centers,m));
  }
});
test('three-pass and small-set radix paths agree at their boundary and across Float32 exponents',()=>{
  const m=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  for(const count of [4095,4096,4097,12000]){
    const centers=new Float32Array(count*3),order=new Uint32Array(count);
    for(let i=0;i<count;i++)centers[i*3+2]=(i%2?1:-1)*((i%23)+1)*2**((i%240)-120);
    assert.deepEqual(depthOrder(centers,m,order),reference(centers,m));
    centers.fill(-0);order.reverse();assert.deepEqual(depthOrder(centers,m,order),Uint32Array.from({length:count},(_,i)=>i));
  }
});
