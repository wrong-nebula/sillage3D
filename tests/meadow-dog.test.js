import test from 'node:test';
import assert from 'node:assert/strict';
import {TrampleTrail} from '../src/splat/TrampleTrail.js';
import {createMeadowDogRoute,meadowDogPigment,MEADOW_DOG_SAMPLES} from '../src/splat/meadowDog.js';
import {hillsideHeight,pondDistance} from '../src/splat/ghibli.js';
import {FOREST_TREES} from '../src/splat/ghibliForest.js';
import {MEADOW_ROCKS} from '../src/splat/ghibliProps.js';
import {GUARDIAN_SITE} from '../src/splat/ghibliMoss.js';

test('running route closes smoothly, follows terrain and clears the scene obstacles',()=>{
 const route=createMeadowDogRoute(hillsideHeight);
 assert.ok(route.speed>=3&&route.period>20);
 for(let t=0;t<route.period;t+=.05){
  const p=route.pose(t),[x,y,z]=p.position;
  assert.ok(pondDistance(x,z)>1.2,'route stays on dry ground');
  assert.ok(z>-16,'the dog stays around the two nearer ponds');
  assert.ok(Math.hypot(x+7.2,z-3)>3,'route clears torii');
  for(const [tx,tz]of FOREST_TREES)assert.ok(Math.hypot(x-tx,z-tz)>2);
  for(const [rx,rz,sx,,sz]of MEADOW_ROCKS)assert.ok(Math.hypot((x-rx)/(sx+.8),(z-rz)/(sz+.8))>1,'route clears new boulders');
  assert.ok(Math.hypot(x-GUARDIAN_SITE.x,z-GUARDIAN_SITE.z)>GUARDIAN_SITE.radius+.8,'route clears guardian');
  assert.ok(!(x>11&&x<25&&z<1),'route clears washing');
  assert.ok(Math.abs(y-hillsideHeight(x,z)-.025)<1e-9);
  assert.ok(Number.isFinite(p.yaw)&&Number.isFinite(p.pitch));
 }
 const a=route.pose(0),b=route.pose(route.period);
 a.position.forEach((v,i)=>assert.ok(Math.abs(v-b.position[i])<1e-8));
 assert.ok(Math.abs(a.yaw-b.yaw)<1e-8);
});

test('trample stamps a continuous local trail, stores direction and recovers without rewriting the grid',()=>{
 const trail=new TrampleTrail({size:128,bounds:[-5,-5,10,10],radius:.7,recovery:15});
 trail.advance(-2,0,0);trail.advance(2,0,1);
 for(let x=-1.8;x<1.9;x+=.1){
  const value=trail.sample(x,0,1);assert.ok(value.strength>.75);assert.ok(value.direction[0]>.9);
 }
 assert.equal(trail.sample(0,2,1).strength,0);
 const data=trail.data.slice();assert.ok(trail.sample(0,0,8).strength<trail.sample(0,0,1).strength);
 assert.equal(trail.sample(0,0,16).strength,0);assert.deepEqual(trail.data,data);
 assert.ok(trail.rows.size<25,'only a narrow strip needs an upload');
});

test('teleports and restarts do not paint long false trails',()=>{
 const trail=new TrampleTrail();trail.advance(2,12,1);trail.advance(24,12,2);
 assert.equal(trail.sample(13,12,2).strength,0);
 trail.advance(24,12,0);assert.equal(trail.sample(2,12,0).strength,0);
 assert.throws(()=>trail.advance(NaN,0,0),/finite/);
});

test('the simplified dog has a pale neutral body and keeps dark facial pigment',()=>{
 assert.ok(MEADOW_DOG_SAMPLES<1200);
 for(const source of [[.03,.03,.03],[.4,.2,.1],[.95,.9,.8]]){
  const coat=meadowDogPigment(source,[0,.8,0]);
  assert.ok(Math.min(...coat)>.84&&Math.max(...coat)<1);
  assert.ok(Math.max(...coat)-Math.min(...coat)<.06);
 }
 const eye=meadowDogPigment([.03,.03,.03],[.2,1.3,.9]);
 assert.ok(Math.max(...eye)<.2);
});
