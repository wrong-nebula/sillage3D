import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';
import {PhysicsInspection} from '../src/splat/physics/PhysicsInspection.js';

const controller={position:{x:30,y:0,z:30},yaw:0};
function fixture(options={}){const p=new CliffPhysics(()=>0,[],{clusterCapacity:1,...options}),m=new PhysicsInspection(p);p.inspector=m;return {p,m};}
test('inspection is off by default, allocates on demand, and reads poses without changing body state',()=>{
 const {p,m}=fixture();assert.equal(m.positions,null);m.captureTick();m.build();assert.equal(m.count,0);assert.equal(m.capturedTicks,0);
 p.command('KeyB',controller);const b=p.clusters[0].body,before={p:b.position.toArray(),v:b.velocity.toArray(),q:b.rotation.toArray()},membership=p.splats.length;
 m.setEnabled(true);const buffer=m.positions;m.select({body:b});m.build();assert.ok(m.count>36);assert.equal(m.positions,buffer);assert.ok(m.positions.subarray(0,m.count*6).every(Number.isFinite));assert.deepEqual({p:b.position.toArray(),v:b.velocity.toArray(),q:b.rotation.toArray()},before);assert.equal(p.splats.length,membership);
 m.setEnabled(false);m.captureTick();assert.equal(m.count,0);assert.equal(m.snapshot().selected,null);assert.equal(m.capturedTicks,0);p.dispose();
});
test('swept ground contacts and impact history remain inspectable even with no final discrete contacts',()=>{
 const {p,m}=fixture();m.setEnabled(true);p.world.teleport(p.player,[30,3,30]);const b=p.clusters[0].body;
 p.clusters[0].launch(new Vector3(0,.9,0),new Vector3(8,-180,0));b.radius=b.minRadius=.08;b.shapes[0].radius=.08;b.restitution=.9;b.friction=0;b.ccd=true;
 p.update(1/120,controller);assert.ok(p.world.stats.ccdHits>0);assert.ok(m.contacts.some(r=>r.a===b.id));assert.ok(m.events.some(e=>e.body===b.id));
 const r=m.contacts.find(r=>r.a===b.id);assert.ok(r.normal.y>.9);assert.ok(r.point.toArray().every(Number.isFinite));m.select({body:b});const out=m.export();assert.equal(out.version,1);assert.equal(out.selection.id,b.id);assert.ok(out.impacts.length>0);assert.doesNotThrow(()=>JSON.stringify(out));p.dispose();
});
test('body cycling and disabled fracture sources preserve inspectable identity and damage state',()=>{
 const {p,m}=fixture({advancedRocks:true});p.command('KeyB',controller);m.setEnabled(true);m.cycle(-1);assert.equal(m.selected.id,p.clusters[0].body.id);
 m.select({body:p.clusters[0].body});p.break(p.clusters[0]);assert.equal(m.describe().state,'disabled / fractured');assert.equal(m.describe().damage.detached,6);
 m.cycle(1);assert.ok(p.world.bodies[m.selected.id].enabled);assert.ok(m.describe().label.includes('fragment'));p.dispose();
});
test('line and contact history budgets stay fixed under collider and impact stress',()=>{
 const {p}=fixture({advancedRocks:true});const m=new PhysicsInspection(p,{maxSegments:20,maxContacts:2});p.inspector=m;m.setEnabled(true);p.command('KeyB',controller);m.build();assert.equal(m.count,20);assert.equal(m.capped,true);assert.equal(m.positions.length,120);
 const b=p.clusters[0].body;for(let i=0;i<20;i++)m.contact({},b,null,new Vector3(i,0,0),new Vector3(0,1,0),i,.01);
 assert.equal(m.contacts.length,2);assert.equal(m.contactMap.size,2);assert.equal(m.positions.length,120);b.sleeping=true;b.ccdActive=true;m.select({body:b});assert.equal(m.describe().ccd,'armed');p.dispose();
});
test('flexible inspection copies barycentric picks and exposes heat, wetness and live constraints',()=>{
 const {p,m}=fixture({flexibleLab:true});m.setEnabled(true);const f=p.flexibles.solver,g=p.flexibles.groups.find(g=>g.kind==='cloth'),a=g.start+g.cols*4+5,b=a+1;
 const hit={kind:'flex',indices:new Uint16Array([a,b,0]),weights:new Float32Array([.5,.5,0]),label:'Cloth'};m.select(hit);hit.indices[0]=0;
 f.waterWet=new Float32Array(f.capacity);f.waterWet[a]=1;const d=m.describe();assert.equal(d.label,'Cloth');assert.deepEqual(d.nodes,[a,b]);assert.equal(d.wetness,.5);
 m.layers.shapes=false;m.layers.contacts=false;m.layers.velocities=false;m.layers.flexible=true;m.build();assert.ok(m.count>=f.distances);assert.ok(m.positions.subarray(0,m.count*6).every(Number.isFinite));m.select({body:p.player});assert.equal(m.selected.kind,'body');p.dispose();
});
test('inspection captures a fast terrain impact before progressive fracture disables its source',()=>{
 const {p,m}=fixture({advancedRocks:true});m.setEnabled(true);const c=p.clusters[0];c.launch(new Vector3(0,2,0),new Vector3(0,-200,0));c.body.restitution=.8;
 p.update(1/120,controller);assert.ok(c.broken);assert.ok(m.events.some(e=>e.body===c.body.id));assert.ok(m.contacts.some(r=>r.a===c.body.id));p.dispose();
});
