import test from 'node:test';
import assert from 'node:assert/strict';
import {SplatGroundShadow} from '../src/splat/SplatGroundShadow.js';
test('shadow splats stay on the invisible floor and track the animated body',()=>{
  const body=[{center:[-1,1,0],opacity:1},{center:[1,2,0],opacity:1}],shadow=new SplatGroundShadow(2,2);
  shadow.update(body);const before=shadow.splats.map(s=>s.center.slice());
  body[0].center[0]-=1;shadow.update(body);
  assert.equal(shadow.splats[0].center[0],before[0][0]-1);assert.deepEqual(shadow.splats[1].center,before[1]);
  for(const s of shadow.splats){assert.equal(s.center[1],.012);assert.equal(s.softParticle,true);assert.ok(s.axes.every(a=>Math.hypot(...a)>0));}
});
test('height broadens and fades the shadow without moving it off the ground',()=>{
  const body=[{center:[0,.1,0],opacity:1}],shadow=new SplatGroundShadow(1,1);shadow.update(body);
  const {opacity}=shadow.splats[0],radius=shadow.splats[0].axes[0][0];body[0].center[1]+=2;shadow.update(body);
  assert.ok(shadow.splats[0].opacity<opacity);assert.ok(shadow.splats[0].axes[0][0]>radius);assert.equal(shadow.splats[0].center[1],.012);
});
