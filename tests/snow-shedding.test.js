import test from 'node:test';
import assert from 'node:assert/strict';
import {SnowShedding} from '../src/splat/SnowShedding.js';
const crow=()=>({samples:[{restCenter:[0,2,0],pigment:[.7,.5,.4]}],splats:[{center:[0,2.5,0],axes:[[.1,0,0],[0,0,.1],[0,.1,0]]}],controller:{grounded:true,flying:false,velocity:{x:0,y:0,z:0}}});
test('jump and takeoff release separate snow bursts, particles fall and fade',()=>{
 const c=crow(),s=new SnowShedding(c,()=>0);
 s.update(.1,c,1);c.controller.grounded=false;s.update(.1,c,1);assert.equal(s.emitted,18);
 c.controller.flying=true;s.update(.1,c,1);assert.equal(s.emitted,44);
 const center=s.splats[0].center,axes=s.splats[0].axes;s.nextGust=Infinity;
 for(let i=0;i<40;i++)s.update(.1,c,1);
 assert.equal(s.splats[0].center,center);assert.equal(s.splats[0].axes,axes);assert.equal(s.snapshot().visible,0);
});
test('no snow is released during warm-season jump or flight',()=>{
 const c=crow(),s=new SnowShedding(c,()=>0);c.controller.grounded=false;c.controller.flying=true;s.update(.1,c,0);assert.equal(s.emitted,0);
});
