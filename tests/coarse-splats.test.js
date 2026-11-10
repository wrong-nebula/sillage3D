import test from 'node:test';
import assert from 'node:assert/strict';
import {covarianceAxes,mergeGaussianPair,coarsenPlant,prepareCoarseLevel} from '../src/splat/CoarseSplats.js';
const splat=(x=0)=>({center:[x,0,0],axes:[[.04,0,0],[0,.03,0],[0,0,.004]],color:[.2,.4,.3],opacity:.98,seed:.2,material:'foliage'});
test('eigenaxes reconstruct a rotated full-rank covariance',()=>{
  for(const matrix of [[4,1,2,1,5,-.7,2,-.7,6],[1e-5,0,0,0,2e-5,0,0,0,4e-8]]){
    const axes=covarianceAxes(matrix,[[1,0,0],[0,1,0],[0,0,1]]);
    for(let i=0;i<9;i++)assert.ok(Math.abs(axes.reduce((sum,a)=>sum+a[Math.floor(i/3)]*a[i%3],0)-matrix[i])<1e-10);
  }
});
test('coarse levels blend baked lighting and reject duplicate or invalid source weights',()=>{
  const colorResponse={count:2,original:new Float32Array([0,0,0,1,1,1]),linear:new Float32Array([0,0,0,1,1,1]),bounce:new Float32Array([0,0,0,1,1,1]),shadow:new Float32Array([0,1])};
  const definition={splats:[splat(),splat(.01)],colorResponse},group={start:0,count:2};
  const candidate={count:1,merges:[{splat:splat(.0075),sources:[[0,.25],[1,.75]]}]};
  const result=prepareCoarseLevel(definition,group,candidate);
  assert.deepEqual([...result.response.bounce],[.75,.75,.75]);assert.equal(result.response.shadow[0],.75);
  for(const sources of [[[0,.5],[0,.5]],[[0,.5],[2,.5]],[[0,1],[1,1]],[[0,NaN],[1,.5]],[[0,-1],[1,2]]]){
    assert.throws(()=>prepareCoarseLevel(definition,group,{...candidate,merges:[{splat:splat(),sources}]}));
  }
});
test('parent preserves weighted spatial moments and fits composited coverage',()=>{
  const a=splat(-.01),b=splat(.01),m=mergeGaussianPair(a,b,.04);
  assert.deepEqual(m.splat.center,[0,0,0]);assert.ok(m.splat.opacity>a.opacity);assert.ok(m.fitError<.16);
  assert.ok(Math.abs(m.splat.axes.reduce((sum,v)=>sum+v[0]**2,0)-(.04**2+.01**2))<1e-12);
});
test('coarsening is deterministic and protects motion, special kernels, color and material edges',()=>{
  const original=[splat(0),splat(.01),{...splat(.005),softParticle:true},{...splat(.004),sporeMotion:{}},{...splat(.003),celPaint:true},{...splat(.002),color:[1,0,0]},{...splat(.001),material:'water'}];
  const before=JSON.stringify(original),a=coarsenPlant(original,{spacing:.04,maxFitError:.2}),b=coarsenPlant(original,{spacing:.04,maxFitError:.2});
  assert.deepEqual(a,b);assert.equal(JSON.stringify(original),before);assert.equal(a.merged,1);
  assert.deepEqual(a.sources.flatMap(s=>s.map(([i])=>i)).sort((x,y)=>x-y),original.map((_,i)=>i));
  for(let i=2;i<original.length;i++)assert.ok(a.splats.includes(original[i]));
});
