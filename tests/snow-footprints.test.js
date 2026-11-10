import test from 'node:test';
import assert from 'node:assert/strict';
import {SnowFootprints} from '../src/splat/SnowFootprints.js';
test('alternating foot marks stay on terrain and wind infill fades them completely',()=>{
 const prints=new SnowFootprints((x,z)=>x*.03+z*.01);
 const c={controller:{grounded:true,yaw:0,position:{x:0,z:0}}};
 prints.update(.1,c,1);c.controller.position.z=.6;prints.update(.1,c,1);
 assert.equal(prints.steps,1);assert.ok(prints.splats[0].opacity>.5);
 const old=prints.splats[0].opacity;
 c.controller.grounded=false;prints.update(15,c,1);
 assert.ok(prints.splats[0].opacity<old);assert.equal(prints.steps,1);
 prints.update(20,c,1);assert.equal(prints.splats[0].opacity,0);assert.equal(prints.snapshot().visible,0);
});
test('walking on grass and flying above snow leave no footprints',()=>{
 const prints=new SnowFootprints(()=>0),c={controller:{grounded:true,yaw:0,position:{x:0,z:0}}};
 prints.update(.1,c,0);c.controller.position.x=1;prints.update(.1,c,0);assert.equal(prints.steps,0);
 c.controller.grounded=false;prints.update(.1,c,1);c.controller.position.x=2;prints.update(.1,c,1);assert.equal(prints.steps,0);
});
test('stationary footprint geometry is cached and thaw removes every remaining mark',()=>{
 let heightCalls=0;const prints=new SnowFootprints(()=>{heightCalls++;return 0;});
 const c={controller:{grounded:true,yaw:0,position:{x:0,z:0}}};
 prints.update(.1,c,1);c.controller.position.z=.6;prints.update(.1,c,1);
 const baked=heightCalls;
 for(let i=0;i<100;i++)prints.update(.01,c,1);
 assert.equal(heightCalls,baked);assert.ok(prints.splats[4].center[1]>prints.splats[0].center[1]);
 prints.update(.01,c,0);assert.equal(prints.snapshot().visible,0);assert.ok(prints.splats.every(s=>s.opacity===0));
});
test('snow imprint callbacks archive every step independently of the recent footprint ring',()=>{
 let stamps=0;const prints=new SnowFootprints(()=>0,{onStamp:(x,z,yaw)=>{assert.ok([x,z,yaw].every(Number.isFinite));stamps++;}});
 for(let i=0;i<200;i++)prints.stamp(i*.5,0,0);
 assert.equal(stamps,200);assert.equal(prints.steps,200);assert.equal(prints.records.filter(Boolean).length,80);
});
