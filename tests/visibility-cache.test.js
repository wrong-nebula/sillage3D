import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {SplatVisibility} from '../src/splat/SplatVisibility.js';
import {SplatVisibility as Baseline} from './fixtures/baseline-visibility-batch4.js';
import {packSplats,depthOrder} from '../src/splat/math.js';

test('cached visibility exactly follows moving centers, reordering, camera/style changes and mirrored views',()=>{
  const n=10000,splats=Array.from({length:n},(_,i)=>({center:[Math.sin(i)*40,Math.cos(i)*20,-1-i%90],axes:[[.1,0,0],[0,.1,0],[0,0,.02]],color:[.3,.4,.2],opacity:.9,seed:.1}));
  const packed=packSplats(splats),a=new SplatVisibility(packed.data,n),b=new Baseline(packed.data,n),camera=new PerspectiveCamera(55,1.6,.08,600);
  const outputs=Array.from({length:4},()=>new Float32Array(n)),moving=[0,19,401],flags=Uint8Array.from({length:n},(_,i)=>i%13===0?1:0),wind=new Float32Array(n*4);wind[3*4+3]=1;
  let centers=packed.centers,revision=0;
  for(let frame=0;frame<30;frame++){
    for(const i of moving)centers[i*3]=Math.sin(frame*.4+i)*100;
    if(frame===5){camera.position.x=4;revision++;}
    if(frame===10){centers=centers.slice();revision++;}
    if(frame===15){a.update(packed.data,n);b.update(packed.data,n);revision++;}
    camera.updateMatrixWorld(true);const order=depthOrder(centers,camera.matrixWorldInverse.elements);
    const options={mode:frame>20?'ghibli':'gaussian',brushScale:frame>20?2:1,foregroundDOF:frame>20,dofStrength:1};
    for(const reflection of [false,true]){
      const extra={width:1600,height:1000,wind,actorStart:n-20,reflection,transition:frame>20,cacheKey:`${revision}-${frame>20}-${reflection}`,movingIndices:moving};
      const x=a.write(order,centers,camera,options,outputs[0],outputs[1],flags,extra),y=b.write(order,centers,camera,options,outputs[2],outputs[3],flags,extra);
      assert.deepEqual(x,y);assert.deepEqual(outputs[0].slice(0,x.foreground),outputs[2].slice(0,y.foreground));assert.deepEqual(outputs[1].slice(0,x.background),outputs[3].slice(0,y.background));
      if(frame===4)assert.equal(a.lastTested,moving.length);
    }
  }
});
test('unannotated mutable buffers are never cached and updates invalidate static masks',()=>{
  const data=new Float32Array(40),centers=new Float32Array([0,0,-4,100,0,-4]),order=new Uint32Array([0,1]),front=new Float32Array(2),camera=new PerspectiveCamera(60,1,.08,600),a=new SplatVisibility(data,2);
  const extra={width:1000,height:1000};
  assert.equal(a.write(order,centers,camera,{},front,null,null,extra).submitted,1);
  centers[3]=0;assert.equal(a.write(order,centers,camera,{},front,null,null,extra).submitted,2);
  extra.cacheKey='static';for(let i=0;i<3;i++)a.write(order,centers,camera,{},front,null,null,extra);assert.equal(a.lastTested,0);
  centers[3]=100;a.update(data,2);assert.equal(a.write(order,centers,camera,{},front,null,null,extra).submitted,1);
});
