import test from 'node:test';
import assert from 'node:assert/strict';
import {createSheepFlock} from '../src/splat/sheepFlock.js';
import {hillsideHeight,pondDistance} from '../src/splat/ghibli.js';
import {pathX,pathWidth} from '../src/splat/ghibliPath.js';

test('a small splat flock stays on the distant hillside and clear of the trail',()=>{
 const flock=createSheepFlock(hillsideHeight);
 assert.equal(flock.count,14);assert.ok(flock.splats.length<500);
 for(let t=0;t<=90;t+=3){
  flock.update(t);
  for(const {position:[x,y,z]}of flock.sheep){
   assert.ok(z<-45&&x<20);assert.ok(pondDistance(x,z)>1.2);
   assert.equal(y,hillsideHeight(x,z));assert.ok(pathX(z)-x>pathWidth(z)+2,'flock stays left of the uphill trail');
  }
  for(const s of flock.splats){assert.ok([...s.center,...s.axes.flat()].every(Number.isFinite));assert.ok(s.axes.every(a=>Math.hypot(...a)>0));}
 }
});

test('sheep wander and graze independently, and a repeated time restores the exact pose',()=>{
 const flock=createSheepFlock(hillsideHeight);
 flock.update(0);const first=structuredClone(flock.splats.map(s=>s.center));
 flock.update(7);const moved=flock.splats.map(s=>s.center);
 assert.notDeepEqual(first,moved);
 const heads=flock.sheep.map(a=>a.parts.find(p=>p.kind==='head').s.center[1]-a.position[1]);
 assert.ok(Math.max(...heads)-Math.min(...heads)>.15);
 flock.update(0);assert.deepEqual(flock.splats.map(s=>s.center),first);
});
