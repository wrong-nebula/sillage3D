import test from 'node:test';
import assert from 'node:assert/strict';
import {Ray,Vector3} from 'three';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';
import {RockGrab} from '../src/splat/physics/RockGrab.js';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';

const player={position:{x:30,y:0,z:30},yaw:0};
function fixture(){
  const source=[],rocks=[];
  for(let rock=0;rock<2;rock++){
    const start=source.length,x=rock*3;
    for(let i=0;i<96;i++){const y=1-2*(i+.5)/96,a=i*2.399963,r=Math.sqrt(1-y*y);source.push({center:[x+.7*r*Math.cos(a),.75+.7*y,.7*r*Math.sin(a)],axes:[[.08,0,0],[0,.08,0],[0,0,.025]],color:[.4,.35,.3],opacity:.96,seed:i/96});}
    rocks.push({id:rock,x,z:0,start,count:96,diameter:1.4,collider:{x,z:0,radiusX:.7,radiusZ:.7,top:1.5}});
  }
  return new CliffPhysics(()=>0,[],{environmentSplats:source,authoredRocks:rocks,clusterCapacity:1});
}
test('ray picking selects the nearest rock and grabbing mobilizes its intact splats without fracture or teleport',()=>{
  const physics=fixture(),rock=physics.authored[0],original=rock.body.position.clone();
  const hit=physics.pickRock(new Ray(new Vector3(0,.75,5),new Vector3(0,0,-1)));
  assert.equal(hit.body,rock.body);assert.ok(hit.distance>4&&hit.distance<5);
  assert.ok(physics.beginGrab(hit,0));assert.equal(rock.body.type,'dynamic');assert.equal(physics.nativeFractures,0);
  assert.ok(rock.body.position.equals(original));assert.equal(physics.movingIndices.length,96);
  assert.equal(rock.descriptor.collider.destroyed,true);assert.equal(rock.body.canSleep,false);
  const target=hit.point.clone().add(new Vector3(0,2,0));physics.grab.setTarget(target,16);
  for(let i=0;i<120;i++)physics.update(1/120,player);
  assert.ok(rock.body.position.y>1.5);assert.equal(rock.broken,false);assert.ok(rock.body.position.toArray().every(Number.isFinite));
});
test('a moved, rotating authored rock fractures at its live pose and transfers momentum without duplicating source addresses',()=>{
  const p=fixture(),rock=p.authored[0];p.beginGrab({body:rock.body,point:rock.body.position.clone()},0);
  p.world.teleport(rock.body,[2,3,1]);rock.body.rotation.setFromAxisAngle(new Vector3(0,1,0),.6);rock.body.previousRotation.copy(rock.body.rotation);
  rock.body.velocity.set(4,2,1);rock.body.angularVelocity.set(.2,.8,.4);rock.sync(1);
  const before=rock.chunks[0].records.map(r=>[...r.splat.center]);
  p.break(rock);rock.sync(1);assert.equal(p.grab.body,null);assert.equal(p.grab.releaseReason,'fracture');
  assert.equal(p.nativeFractures,1);assert.equal(p.movingAuthored.length,1);assert.equal(p.movingIndices.length,96);
  const momentum=new Vector3();let total=0;
  for(const c of rock.chunks){momentum.addScaledVector(c.body.velocity,c.body.mass);total+=c.body.mass;for(const r of c.records)for(let k=0;k<3;k++)assert.ok(Math.abs(r.splat.center[k]-before[r.index][k])<1e-8);}
  assert.ok(momentum.multiplyScalar(1/total).distanceTo(new Vector3(4,2,1))<1e-8);
});
test('mouse velocity throws a picked rock through collision resolution and fractures the struck rock too',()=>{
  const p=fixture(),a=p.authored[0];p.world.gravity.set(0,0,0);p.wind.strength=0;
  p.beginGrab({body:a.body,point:a.body.position.clone()},0);
  p.grab.setTarget(new Vector3(.12,.75,0),8);p.grab.setTarget(new Vector3(.3,.75,0),20);p.grab.end(21,true);
  assert.ok(a.body.velocity.x>10);assert.ok(a.body.velocity.length()<=24);
  for(let i=0;i<80;i++)p.update(1/120,player);
  assert.equal(p.nativeFractures,2);assert.ok(p.authored.every(r=>r.broken));
});
test('off-centre spring impulses create spin with a bounded impulse; stale release and cancellation do not add a throw',()=>{
  const w=new SplatPhysicsWorld({gravity:[0,0,0]}),body=w.createBody({mass:20});const grab=new RockGrab(w);
  grab.begin(body,new Vector3(0,0,.5),0);grab.setTarget(new Vector3(1,0,.5),16);grab.step(1/120);
  assert.ok(body.angularVelocity.y>0);assert.ok(body.velocity.length()<=180/120+1e-8);assert.deepEqual(body.position.toArray(),[0,0,0]);
  body.velocity.set(0,0,0);body.angularVelocity.set(0,0,0);grab.end(1000,true);assert.equal(body.velocity.length(),0);assert.equal(body.canSleep,true);
  grab.begin(body,new Vector3(),1100);body.velocity.set(5,1,0);grab.end(1110,false,'cancelled');assert.equal(body.velocity.length(),0);assert.equal(grab.body,null);
});
