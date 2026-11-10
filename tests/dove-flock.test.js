import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoveFlock,DOVE_COUNT,DOVE_PERIOD} from '../src/splat/doveFlock.js';
import {hillsideHeight} from '../src/splat/ghibli.js';

test('distant doves cross left to right above the hill and disappear between passes',()=>{
 const flock=createDoveFlock(hillsideHeight);assert.equal(flock.count,DOVE_COUNT);assert.ok(flock.splats.length<150);
 for(const time of [0,5,40,65,89]){flock.update(time);assert.ok(flock.splats.every(s=>s.opacity===0));}
 flock.update(11);const left=flock.birds.map(b=>b.position[0]);
 const first=structuredClone(flock.splats);
 flock.update(28);flock.birds.forEach((b,i)=>{assert.ok(b.position[0]>left[i]+100);const [x,y,z]=b.position;assert.ok(y>hillsideHeight(x,z)+5.5&&y<hillsideHeight(x,z)+8);});
 assert.ok(flock.splats.every(s=>s.opacity>.95));
 assert.notDeepEqual(flock.splats.map(s=>s.axes),first.map(s=>s.axes));
 for(const s of flock.splats){
  assert.ok([...s.center,...s.axes.flat()].every(Number.isFinite));
  for(let j=0;j<3;j++){assert.ok(Math.hypot(...s.axes[j])>0);for(let k=j+1;k<3;k++)assert.ok(Math.abs(s.axes[j].reduce((v,a,i)=>v+a*s.axes[k][i],0))<1e-8);}
 }
 flock.update(11+DOVE_PERIOD);
 flock.splats.forEach((s,i)=>s.center.forEach((v,k)=>assert.ok(Math.abs(v-first[i].center[k])<.9)));
 flock.update(11);assert.deepEqual(flock.splats,first);
});
