import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';
import {SplatParticles,PARTICLE} from '../src/splat/physics/SplatParticles.js';
import {CliffWindField} from '../src/splat/physics/CliffWindField.js';
import {ExplosionSolver} from '../src/splat/physics/ExplosionSolver.js';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';
import {packSplats} from '../src/splat/math.js';
const calm=new CliffWindField({strength:0});

test('embers bounce with reduced energy, leave actual history trails, and fade after death',()=>{
  const world=new SplatPhysicsWorld({height:()=>0});world.advance(1/120);
  const pool=new SplatParticles({capacity:8});pool.emit(PARTICLE.EMBER,new Vector3(0,.05,0),new Vector3(2,-3,0),{size:.04,life:2});
  pool.update(1/120,world,calm);assert.ok(pool.velocity[1]>0);assert.ok(pool.position[1]>=.04);assert.equal(pool.bounces,1);
  assert.ok(Math.hypot(...pool.velocity.subarray(0,3))<Math.hypot(2,3));
  for(let i=0;i<15;i++)pool.update(1/120,world,calm);pool.sync();
  assert.ok(pool.snapshot().trailSegments>0);assert.ok(pool.trails.splats.filter(s=>s.opacity>0).every(s=>s.center[1]>=.035));
  const packed=packSplats(pool.splats);pool.writePacked(packed.data,packed.centers,0);assert.ok(packed.data.every(Number.isFinite));
  for(let i=0;i<400;i++)pool.update(1/120,world,calm);pool.sync();assert.equal(pool.snapshot().trailSegments,0);assert.ok(pool.splats.every(s=>s.opacity===0));
});
test('embers reflect off coarse rocks and slope normals; recycling a trail never connects distant particles',()=>{
  const world=new SplatPhysicsWorld({height:()=>0});world.createBody({type:'fixed',position:[0,1,0]});world.advance(1/120);
  const pool=new SplatParticles({capacity:1});pool.emit(PARTICLE.EMBER,new Vector3(-.56,1,0),new Vector3(6,0,0),{size:.04});
  pool.update(1/120,world,calm);assert.ok(pool.velocity[0]<0);assert.ok(pool.bounces>0);
  for(let i=0;i<10;i++)pool.update(1/120,world,calm);pool.sync();assert.ok(pool.trails.visibleSegments>0);
  pool.emit(PARTICLE.EMBER,new Vector3(100,3,0),new Vector3(1,0,0),{size:.04});pool.sync();assert.equal(pool.trails.visibleSegments,0);
  for(let i=0;i<8;i++)pool.update(1/120,world,calm);pool.sync();assert.ok(pool.trails.splats.filter(s=>s.opacity>0).every(s=>s.center[0]>99));
  const slope=new SplatPhysicsWorld({height:x=>x*.3});slope.advance(1/120);
  pool.emit(PARTICLE.EMBER,new Vector3(0,.04,0),new Vector3(0,-4,0),{size:.04});pool.update(1/120,slope,calm);
  assert.ok(pool.velocity[0]<0&&pool.velocity[1]>0);
});
test('explosion pressure has finite symmetric falloff and excludes distant bodies',()=>{
  const world=new SplatPhysicsWorld({height:()=>0});
  const a=world.createBody({position:[2,1,0],mass:5}),b=world.createBody({position:[-2,1,0],mass:5}),far=world.createBody({type:'fixed',position:[50,1,0]});
  const blast=new ExplosionSolver(world),result=blast.explode(new Vector3(0,1,0),{radius:7,pressureImpulse:100});
  const expected=100*Math.PI*.5**2*(1-1.5/7)**2/5;
  assert.ok(Math.abs(a.velocity.x-expected)<1e-8);assert.ok(Math.abs(a.velocity.x+b.velocity.x)<1e-8);assert.equal(far.velocity.length(),0);
  assert.equal(result.affected,2);assert.ok(result.candidates<3);
  blast.sync(.1);assert.ok(blast.splats.some(s=>s.opacity>0));blast.sync(1);assert.ok(blast.splats.every(s=>s.opacity===0));
  assert.throws(()=>blast.explode(new Vector3(),{radius:Infinity}));
});
test('explosions fracture existing rock ranges, preserve a shared input point, and respect affected-body budgets',()=>{
  const source=[],rocks=[];
  for(let rock=0;rock<2;rock++){
    const start=source.length,x=rock*3;
    for(let i=0;i<80;i++){const y=1-2*(i+.5)/80,a=i*2.399963,r=Math.sqrt(1-y*y);source.push({center:[x+.7*r*Math.cos(a),.8+.7*y,.7*r*Math.sin(a)],axes:[[.08,0,0],[0,.08,0],[0,0,.025]],color:[.4,.35,.3],opacity:.96,seed:i/80});}
    rocks.push({id:rock,x,z:0,start,count:80,diameter:1.4});
  }
  const physics=new CliffPhysics(()=>0,[],{authoredRocks:rocks,environmentSplats:source,clusterCapacity:1});
  physics.point.set(1.5,.8,0);const result=physics.explode(physics.point,{radius:6});
  assert.equal(result.affected,2);assert.equal(result.fractured,2);assert.equal(physics.nativeFractures,2);
  assert.ok(physics.explosions.blasts[0].position.distanceTo(new Vector3(1.5,.8,0))<1e-8);
  for(let i=0;i<60;i++)physics.update(1/120,{position:{x:30,y:0,z:30},yaw:0});
  assert.ok(physics.world.bodies.every(b=>b.position.toArray().every(Number.isFinite)));assert.ok(physics.particles.snapshot().active<=768);
  const w=new SplatPhysicsWorld();for(let i=0;i<30;i++)w.createBody({position:[i*.08,2,0],radius:.02});
  const bounded=new ExplosionSolver(w,{maxAffected:8});assert.ok(bounded.explode(new Vector3(0,2,0)).affected<=8);
});

test('nearby blasts advect the active fire source and push its existing plume; distant fire is unchanged',()=>{
  const p=new CliffPhysics(()=>0,[],{clusterCapacity:1,particleCapacity:128});
  Object.assign(p.fire,{active:true,fuel:30,intensity:1});p.fire.position.set(1,.12,0);
  const i=p.particles.emit(PARTICLE.FLAME,new Vector3(1,.6,0),new Vector3(0,1,0));
  p.explode(new Vector3(0,.12,0),{radius:5,pressureImpulse:700});
  assert.ok(p.particles.velocity[i*3]>0);assert.ok(p.fire.blastVelocity.x>0);assert.equal(p.fire.displacements,1);
  assert.ok(p.explosions.stats.fireParticlesDisplaced>0);
  const start=p.fire.position.clone(),kick=p.fire.blastVelocity.length();
  for(let tick=0;tick<60;tick++)p.update(1/120,{position:{x:30,y:0,z:30},yaw:0});
  assert.ok(p.fire.position.x>start.x+.3);assert.ok(p.fire.blastVelocity.length()<kick*.1);assert.ok(p.fire.active);
  p.fire.position.set(30,.12,30);p.fire.blastVelocity.set(0,0,0);p.explode(new Vector3(0,.12,0),{radius:5});assert.equal(p.fire.blastVelocity.length(),0);
});
