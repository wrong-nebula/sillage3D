import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';
import {BreakableSplatCluster} from '../src/splat/physics/BreakableSplatCluster.js';
import {packSplats} from '../src/splat/math.js';
const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const part=(x,y,z,radius=.3)=>({center:new Vector3(x,y,z),radius});

test('compound narrowphase leaves empty space empty and limits pair manifolds',()=>{
  const w=new SplatPhysicsWorld({gravity:[0,0,0]}),rock=w.createBody({type:'fixed'});
  w.setCompound(rock,[part(-1,0,0),part(1,0,0)]);
  const ball=w.createBody({radius:.1,position:[0,0,0]});w.advance(1/120);
  assert.equal(w.stats.contacts,0);assert.ok(w.stats.candidates>0);
  w.teleport(ball,[1.2,0,0]);w.advance(1/120);assert.ok(ball.position.x>1.35);assert.ok(w.stats.contacts<=4);
  assert.throws(()=>w.setCompound(ball,[]));assert.throws(()=>w.setCompound(ball,[part(0,0,0,-1)]));
});
test('compound ground contacts settle on a flat base and off-centre impulses create torque',()=>{
  const w=new SplatPhysicsWorld({height:()=>0}),rock=w.createBody({position:[0,.31,0],friction:.9,drag:.2});
  w.setCompound(rock,[part(-.5,0,-.5),part(.5,0,-.5),part(-.5,0,.5),part(.5,0,.5)]);
  for(let i=0;i<720;i++)w.advance(1/120);
  assert.ok(rock.sleeping);close(rock.position.y,.3,.01);assert.ok(rock.angularVelocity.length()<.05);
  const q=new SplatPhysicsWorld({gravity:[0,0,0]}),target=q.createBody({mass:4,friction:0,drag:0});
  q.setCompound(target,[part(-.6,0,0),part(.6,0,0)]);
  const ball=q.createBody({position:[.6,0,-1.5],velocity:[0,0,6],radius:.2,friction:0,drag:0});
  for(let i=0;i<40;i++)q.advance(1/120);
  assert.ok(Math.abs(target.angularVelocity.y)>.2);close(target.velocity.z*4+ball.velocity.z,6,1e-5);
});
test('selective CCD catches thin fixed lobes and fast moving/moving crossings without global substeps',()=>{
  const w=new SplatPhysicsWorld({gravity:[0,0,0],maxMotionSteps:1});
  const wall=w.createBody({type:'fixed'});w.setCompound(wall,[part(0,0,0,.03),part(0,1,0,.03)]);
  const ball=w.createBody({position:[-2,0,0],velocity:[800,0,0],radius:.04,ccd:true,drag:0});
  w.advance(1/120);assert.ok(ball.position.x<-.06);assert.ok(ball.velocity.x<=0);assert.ok(w.stats.ccdHits>0);assert.equal(w.stats.motionSteps,1);
  const q=new SplatPhysicsWorld({gravity:[0,0,0],maxMotionSteps:1});
  const a=q.createBody({position:[-1,0,0],velocity:[240,0,0],radius:.05,ccd:true,drag:0,restitution:1,friction:0});
  const b=q.createBody({position:[1,0,0],velocity:[-240,0,0],radius:.05,ccd:true,drag:0,restitution:1,friction:0});
  q.advance(1/120);assert.ok(a.position.x<b.position.x);close(a.velocity.x,-240);close(b.velocity.x,240);assert.equal(q.stats.motionSteps,1);
  a.velocity.set(.01,0,0);b.velocity.set(0,0,0);q.advance(1/120);assert.equal(q.stats.ccdBodies,0);assert.equal(q.stats.ccdTests,0);
});
test('CCD terrain impacts and overflow stop safely under bounded work',()=>{
  const w=new SplatPhysicsWorld({height:()=>0,maxMotionSteps:1});
  const b=w.createBody({position:[0,2,0],velocity:[0,-600,0],radius:.1,ccd:true,drag:0});
  w.advance(1/120);assert.ok(b.position.y>=.099);assert.ok(b.velocity.y>=0);assert.ok(w.stats.ccdHits>0);
  const q=new SplatPhysicsWorld({gravity:[0,0,0],capacity:40,maxMotionSteps:1});
  for(let i=0;i<35;i++)q.createBody({position:[0,i*2,0],velocity:[600,0,0],ccd:true,radius:.1,drag:0});
  q.advance(1/120);assert.ok(q.stats.ccdBudgetHits>=3);assert.equal(q.stats.motionSteps,1);assert.ok(q.stats.ccdTests<=q.ccd.maxTests*q.ccd.maxEvents);assert.ok(q.bodies.every(b=>b.position.toArray().every(Number.isFinite)));
  const bounded=new SplatPhysicsWorld({gravity:[0,0,0],maxMotionSteps:1});bounded.ccd.maxTests=2;
  for(let i=0;i<6;i++)bounded.createBody({position:[0,i*.01,0],velocity:[600,0,0],ccd:true,drag:0});
  bounded.advance(1/120);assert.ok(bounded.stats.ccdBudgetHits>0);assert.ok(bounded.stats.ccdTests<=2);assert.ok(bounded.bodies.every(b=>b.position.x===0));
});

function authoredPhysics(count=1,activeDebrisBudget=192){
  const source=[],rocks=[];
  for(let rock=0;rock<count;rock++){
    rocks.push({id:rock,x:rock*4,z:0,start:source.length,count:240,diameter:2});
    for(let i=0;i<240;i++){const y=1-2*(i+.5)/240,a=i*2.399963,r=Math.sqrt(1-y*y);source.push({center:[rock*4+1.2*r*Math.cos(a),3+.8*y,.9*r*Math.sin(a)],axes:[[.05,0,0],[0,.05,0],[0,0,.025]],color:[.4,.35,.3],opacity:.96,seed:i/240});}
  }
  return {source,p:new CliffPhysics(()=>0,[],{authoredRocks:rocks,environmentSplats:source,advancedRocks:true,clusterCapacity:1,activeDebrisBudget})};
}
test('repeated local damage cracks then chips authored rocks, preserving pose, ownership, source data and mass',()=>{
  const {source,p}=authoredPhysics(),saved=JSON.stringify(source),rock=p.authored[0];
  p.mobilizeBody(rock.body);rock.body.rotation.setFromAxisAngle(new Vector3(0,1,0),.7);rock.body.previousRotation.copy(rock.body.rotation);
  rock.body.velocity.set(2,1,-3);rock.body.angularVelocity.set(0,0,0);
  const mass=rock.body.mass,point=rock.parts[0].center.clone().applyQuaternion(rock.body.rotation).add(rock.body.position);
  p.damageRock(rock,rock.threshold*.45,point);assert.equal(rock.damage.detached,0);assert.ok(rock.damage.damage[0]>0);
  rock.sync(1);assert.ok(rock.core.records.some(r=>r.splat.color[0]<r.color[0]-.01));
  for(let i=0;i<4&&!rock.damage.detached;i++)p.damageRock(rock,rock.threshold*.45,point);
  assert.ok(rock.damage.detached);assert.ok(!rock.broken&&rock.body.enabled);assert.ok(rock.body.shapes.length<6);
  rock.sync(1);
  const groups=rock.chunks,seen=new Set(),momentum=new Vector3();let totalMass=0;
  for(const group of groups){totalMass+=group.body.mass;momentum.addScaledVector(group.body.velocity,group.body.mass);
    for(const record of group.records){assert.ok(!seen.has(record.index));seen.add(record.index);const expected=new Vector3(...source[record.index].center).sub(rock.center).applyQuaternion(rock.body.rotation).add(rock.body.position);assert.ok(new Vector3(...record.splat.center).distanceTo(expected)<1e-6);}}
  close(totalMass,mass);close(momentum.x,mass*2);close(momentum.y,mass);close(momentum.z,mass*-3);assert.equal(seen.size,source.length);assert.equal(JSON.stringify(source),saved);
  p.break(rock);assert.ok(rock.broken&&!rock.body.enabled);assert.equal(rock.chunks.reduce((n,c)=>n+c.records.length,0),source.length);assert.ok(p.world.bodies.length<=p.world.capacity);
  const packed=packSplats(source);p.writeNativePacked(packed.data,packed.centers);assert.ok(packed.data.every(Number.isFinite));
});
test('spawned rocks retain a compound core after chipping and recycle every rigid/splat slot',()=>{
  const world=new SplatPhysicsWorld(),rock=new BreakableSplatCluster(world,{advanced:true});rock.launch(new Vector3(0,3,0));rock.body.angularVelocity.set(0,0,0);
  const count=world.bodies.length,source=rock.splats.map(s=>s.center);
  const mask=rock.damage.apply(rock.threshold*1.5,new Vector3(.8,3,0));assert.ok(mask);rock.detach(mask);assert.ok(!rock.broken);assert.ok(rock.chunks.some(c=>c.body.enabled));assert.ok(rock.body.shapes.length<6);rock.sync(1);
  rock.launch(new Vector3(3,4,5));rock.sync(1);assert.equal(world.bodies.length,count);assert.equal(rock.damage.detached,0);assert.equal(rock.body.shapes.length,6);assert.ok(rock.chunks.every(c=>!c.body.enabled));assert.ok(rock.splats.every((s,i)=>s.center===source[i]));
});
test('chipping the mouse anchor releases the grab, and continuous heat damage avoids repeated ownership uploads',()=>{
  const {p}=authoredPhysics(),r=p.authored[0],point=r.parts[0].center.clone().add(r.body.position);
  assert.ok(p.beginGrab({body:r.body,point},0));p.damageRock(r,r.threshold*1.5,point);assert.ok(r.body.enabled);assert.equal(p.grab.body,null);assert.equal(p.grab.releaseReason,'fracture');
  const {p:hot}=authoredPhysics(),rock=hot.authored[0],location=rock.parts[0].center.clone().add(rock.body.position);let uploads=0;hot.onNativeChange=()=>uploads++;
  for(let i=0;i<100;i++)hot.damageRock(rock,rock.threshold*.005,location,true);
  assert.ok(rock.damage.damage.some(d=>d>.3));assert.equal(rock.damage.detached,0);assert.equal(uploads,1);
  for(let i=0;i<200;i++)hot.damageRock(rock,rock.threshold*.005,location,true);
  assert.ok(rock.damage.detached);assert.ok(uploads<=3);
  const {p:small}=authoredPhysics(),stone=small.authored[0];stone.threshold=2;
  small.world.recordImpact(stone.body,.9,stone.parts[0].center.clone().add(stone.body.position),0);small.afterStep(0);
  assert.equal(stone.damage.hits,1);assert.equal(stone.damage.detached,0);
});
test('partially chipped fixed cores do not count as parked dynamic debris',()=>{
  const {p}=authoredPhysics(4,2);
  for(const rock of p.authored){
    p.damageRock(rock,rock.threshold*1.5,rock.parts[0].center.clone().add(rock.body.position));
    assert.ok(!rock.broken);assert.ok(p.debris.filter(b=>b.enabled&&!b.sleeping).length<=2);
    assert.ok(p.authored.every(r=>!r.body.sleeping));
  }
});
