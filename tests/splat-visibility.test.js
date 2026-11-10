import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {SplatVisibility} from '../src/splat/SplatVisibility.js';
import {packSplats} from '../src/splat/math.js';

const splat=(x,y,z,r=.1)=>({center:[x,y,z],axes:[[r,0,0],[0,r,0],[0,0,r]],color:[.4,.6,.2],opacity:.9,seed:.1});
function fixture(splats){
  const packed=packSplats(splats),culler=new SplatVisibility(packed.data,splats.length),camera=new PerspectiveCamera(60,1,.08,600);
  const order=Uint32Array.from(splats,(_,i)=>i),front=new Float32Array(splats.length),back=new Float32Array(splats.length);
  return {camera,run(options={},extra={},flags=null){
    const counts=culler.write(order,packed.centers,camera,options,front,flags?back:null,flags,{width:1000,height:1000,...extra});
    return {front:Array.from(front.slice(0,counts.foreground)),back:Array.from(back.slice(0,counts.background)),...counts};
  }};
}
test('submission culling removes behind-camera, far-clipped, and wholly offscreen splats while retaining overlapping edges',()=>{
  const f=fixture([splat(0,0,-10),splat(0,0,10),splat(100,0,-10),splat(6,0,-10),splat(0,0,-601),splat(0,0,-.01)]);
  assert.deepEqual(f.run().front,[0,3]);
  f.camera.lookAt(0,0,1);assert.deepEqual(f.run().front,[1]);
});
test('wide brush and maximum blur envelopes retain strokes outside the sharp center frustum',()=>{
  const f=fixture([splat(8,0,-10)]);
  assert.equal(f.run().submitted,0);
  assert.equal(f.run({brushScale:10}).submitted,1);
  assert.equal(f.run({foregroundDOF:true,dofStrength:1,mode:'ghibli',gouacheBlend:1},{transition:true}).submitted,1);
  assert.equal(f.run({foregroundDOF:true,dofStrength:1},{reflection:true}).submitted,0);
});
test('moving geometry remains submitted, background order stays stable, and overlapping translucent layers remain intact',()=>{
  const f=fixture([splat(0,0,-100),splat(0,0,-10),splat(0,0,-2),splat(100,0,10),splat(-100,0,10)]);
  const wind=new Float32Array(20);wind[3*4+3]=4;
  const result=f.run({}, {wind,actorStart:4},[1,0,0,0,0]);
  assert.deepEqual(result.front,[1,2,3,4]);assert.deepEqual(result.back,[0]);assert.equal(result.culled,0);
});
test('the memory-order test of a full list submits exactly what the per-mark walk does',()=>{
  // Deterministic scatter around and outside the frustum, with wind, actors and a background flag.
  let state=7;const random=()=>(state=(state*1664525+1013904223)>>>0)/4294967296;
  const count=600,splats=Array.from({length:count},()=>splat((random()-.5)*60,(random()-.5)*60,-random()*700+20,.05+random()*2));
  const packed=packSplats(splats),camera=new PerspectiveCamera(60,1.4,.08,600);camera.position.set(1,2,3);camera.lookAt(0,0,-40);
  const wind=new Float32Array(count*4),flags=new Uint8Array(count);for(let i=0;i<count;i++){if(i%17===0)wind[i*4+3]=2;if(i%11===0)flags[i]=1;}
  const order=Uint32Array.from({length:count},(_,i)=>(i*7919)%count),options={brushScale:1.3,mode:'ghibli',gouacheBlend:.44};
  const extra={width:1100,height:688,wind,actorStart:560,reach:2};
  const whole=new SplatVisibility(packed.data,count),front=new Float32Array(count),back=new Float32Array(count);
  const counts=whole.write(order,packed.centers,camera,options,front,back,flags,extra);
  assert.equal(whole.lastTested,count);
  // Two partial lists take the per-mark walk.
  const parts=new SplatVisibility(packed.data,count),expectedFront=[],expectedBack=[];
  for(const slice of [order.subarray(0,251),order.subarray(251)]){
    const f=new Float32Array(count),b=new Float32Array(count),c=parts.write(slice,packed.centers,camera,options,f,b,flags,extra);
    expectedFront.push(...f.subarray(0,c.foreground));expectedBack.push(...b.subarray(0,c.background));
  }
  assert.ok(counts.culled>50&&counts.foreground>50&&counts.background>5);
  assert.deepEqual(Array.from(front.subarray(0,counts.foreground)),expectedFront);
  assert.deepEqual(Array.from(back.subarray(0,counts.background)),expectedBack);
  // A repeated cached view reuses the mask the memory-order test wrote.
  const cached=new SplatVisibility(packed.data,count),f2=new Float32Array(count),b2=new Float32Array(count);
  for(let pass=0;pass<3;pass++){
    const c=cached.write(order,packed.centers,camera,options,f2,b2,flags,{...extra,cacheKey:'view'});
    assert.deepEqual(Array.from(f2.subarray(0,c.foreground)),expectedFront);assert.deepEqual(Array.from(b2.subarray(0,c.background)),expectedBack);
  }
  assert.equal(cached.lastTested,0);
});
