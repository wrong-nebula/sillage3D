import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,PerspectiveCamera,Vector3} from 'three';
import {packSplats} from '../src/splat/math.js';
import {writeRayGaussian,rayGaussianDepth} from '../src/splat/RayGaussianDepth.js';
import {prepareTiledGaussians} from '../src/splat/TiledGaussianProjection.js';
const splat=(center,axes)=>({center,axes,color:[.3,.4,.5],opacity:.9,seed:.1,material:'stone'});
test('maximum-contribution depth matches an independent dense covariance inverse',()=>{
  const shapes=[[[1,0,0],[0,1,0],[0,0,1]],[[1.2,.1,.8],[-.05,.2,.03],[.004,0,-.006]]];
  for(const axes of shapes){
    const center=[.7,-.2,-5],{data}=packSplats([splat(center,axes)]),ray=new Float32Array(12);writeRayGaussian(data,0,new Matrix4().elements,ray);
    const c=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>axes.reduce((sum,a)=>sum+a[i]*a[j],0)));
    const inverse=new Matrix4().set(...[...c[0],0,...c[1],0,...c[2],0,0,0,0,1]).invert();
    for(const [x,y] of [[0,0],[.2,-.1],[-.7,.3]]){
      const r=new Vector3(x,y,-1),qr=r.clone().applyMatrix4(inverse),qc=new Vector3(...center).applyMatrix4(inverse),expected=Math.max(0,r.dot(qc)/r.dot(qr)),actual=rayGaussianDepth(ray,0,x,y);
      assert.ok(Math.abs(actual-expected)<2e-4*Math.max(1,expected),`${actual} vs ${expected}`);
    }
  }
});
test('thin grazing rays retain finite accurate depth without quadratic cancellation',()=>{
  const s=splat([5,0,-5],[[10,0,-10],[0,10,0],[.000001,0,.000001]]),{data}=packSplats([s]),ray=new Float32Array(12);
  writeRayGaussian(data,0,new Matrix4().elements,ray);assert.ok(Math.abs(rayGaussianDepth(ray,0,1,0)-5)<1e-5);
});
test('a fixed world ray keeps its physical intersection through camera rotation',()=>{
  const {data}=packSplats([splat([.4,.2,-4],[[.5,0,.3],[0,.3,.02],[-.01,0,.02]])]),target=new Vector3(.2,.1,-4),results=[];
  for(const yaw of [-.3,0,.3]){
    const camera=new PerspectiveCamera(50,1,.08,600);camera.rotation.y=yaw;camera.updateMatrixWorld(true);const ray=new Float32Array(12);writeRayGaussian(data,0,camera.matrixWorldInverse.elements,ray);
    const p=target.clone().applyMatrix4(camera.matrixWorldInverse),r=new Vector3(p.x/-p.z,p.y/-p.z,-1),t=rayGaussianDepth(ray,0,r.x,r.y);
    results.push(r.multiplyScalar(t).applyMatrix4(camera.matrixWorld));
  }
  assert.ok(results[0].distanceTo(results[1])<1e-5);assert.ok(results[2].distanceTo(results[1])<1e-5);
});
test('ray refinement retains the original lists and is deterministic across material changes',()=>{
  const splats=[splat([.2,0,-4],[[.4,0,.2],[0,.1,0],[-.01,0,.02]]),splat([-.2,0,-4],[[.4,0,-.2],[0,.1,0],[.01,0,.02]])],{data}=packSplats(splats);
  const input={data,order:new Uint32Array([0,1]),camera:new PerspectiveCamera(45,1,.08,600),width:64,height:64,splats};
  const legacy=prepareTiledGaussians(input),quality=prepareTiledGaussians({...input,raySort:true});
  assert.deepEqual(quality.indices,legacy.indices);assert.deepEqual(quality.projected,legacy.projected);assert.deepEqual(quality.offsets,legacy.offsets);
  splats[0].material='metal';const metal=prepareTiledGaussians({...input,raySort:true});assert.deepEqual(metal.rayIndices,quality.rayIndices);assert.deepEqual(metal.rayData,quality.rayData);
});
