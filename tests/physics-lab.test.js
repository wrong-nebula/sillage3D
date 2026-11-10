import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Vector3} from 'three';
import {physicsLabScene} from '../src/splat/physicsLab.js';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';
import {packSplats} from '../src/splat/math.js';
import {collideCliffRocks} from '../src/splat/cliffRockCollision.js';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';

const fetcher=async path=>{const bytes=await readFile(new URL('../public'+path,import.meta.url));return {ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};};
await physicsLabScene.prepare(fetcher);

test('LibreTerrain physics court has flat working ground, graded shoulders, and compact authored prop ranges',async()=>{
  const provenance=await (await fetcher('/physics-lab/terrain.json')).json();assert.match(provenance.generator,/LibreTerrain/);
  assert.equal(provenance.biome,'desert');assert.equal(provenance.build.state,'finished');assert.ok(provenance.materials.includes('sandstone'));
  assert.ok(provenance.build.files.some(name=>name.includes('curvature')));
  const bytes=await readFile(new URL('../public/physics-lab/height.f32',import.meta.url)),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let low=Infinity,high=-Infinity;
  const side=provenance.resolution;assert.equal(side,1025);assert.equal(provenance.landform,'smooth dunes');
  for(let z=Math.floor(side*.43);z<side*.61;z++)for(let x=Math.floor(side*.41);x<side*.59;x++){const h=view.getFloat32((z*side+x)*4,true);low=Math.min(low,h);high=Math.max(high,h);}
  assert.ok(high-low<.06);assert.ok(provenance.heightMax>5);
  const scene=physicsLabScene.create();assert.ok(scene.splats.length<45000);assert.ok(scene.splats.length>32000);assert.equal(scene.terrainResolution,1025);
  const ground=scene.splats.filter(s=>s.cliffRockId===undefined&&!s.wind),warm=ground.filter(s=>s.color[0]>s.color[1]&&s.color[1]>s.color[2]);assert.ok(warm.length>ground.length*.95,'desert albedo must replace the meadow pigment');
  for(const name of ['surface.u8','desert.u8','albedo.u8'])assert.equal((await readFile(new URL('../public/physics-lab/'+name,import.meta.url))).byteLength,side*side*4);
  const owners=new Set(scene.splats.filter(s=>s.cliffRockId!==undefined).map(s=>s.cliffRockId));assert.equal(owners.size,48);
});

function fixture(){
  const splats=[],rocks=[];
  for(let rock=0;rock<3;rock++){
    const start=splats.length,x=rock*3;
    for(let i=0;i<96;i++){
      const y=1-2*(i+.5)/96,a=i*2.399963,r=Math.sqrt(1-y*y);
      splats.push({center:[x+.7*r*Math.cos(a),.75+.7*y,.7*r*Math.sin(a)],axes:[[.08,0,0],[0,.08,0],[0,0,.025]],color:[.4,.35,.3],opacity:.96,seed:i/96});
    }
    rocks.push({id:rock,x,z:0,diameter:1.4,start,count:96,collider:{x,z:0,radiusX:.7,radiusZ:.7,top:1.5}});
  }
  const physics=new CliffPhysics(()=>0,[],{environmentSplats:splats,authoredRocks:rocks,activeDebrisBudget:12,clusterCapacity:1});
  return {physics,splats,rocks};
}

test('authored fracture preserves original Gaussian addresses and pose, removes old navigation collider, and updates only its texture range',()=>{
  const {physics,splats,rocks}=fixture(),rock=physics.authored[0],before=splats.map(s=>[...s.center]),packed=packSplats(splats);
  physics.break(rock);rock.sync(1);const marks=[];physics.writeNativePacked(packed.data,packed.centers,{mark:(start,count)=>marks.push([start,count])});
  assert.equal(rock.body.enabled,false);assert.equal(rocks[0].collider.destroyed,true);assert.equal(physics.nativeFractures,1);
  assert.equal(physics.movingIndices.length,96);assert.deepEqual(marks,[[0,96*20]]);
  const owned=new Set();for(const c of rock.chunks)for(const r of c.records){assert.ok(!owned.has(r.index));owned.add(r.index);for(let k=0;k<3;k++)assert.ok(Math.abs(r.splat.center[k]-before[r.index][k])<1e-8);}
  assert.equal(owned.size,96);assert.deepEqual(splats.map(s=>s.center),before);
  const player={position:{x:1,y:0,z:0},velocity:{x:2,z:0}};collideCliffRocks(player,{x:-2,z:0},[rocks[0].collider],()=>0);assert.ok(player.position.x>.99);
  physics.dispose();assert.equal(rocks[0].collider.destroyed,false);
});

test('authored debris receives wind, snow friction and fire heat; active debris remains bounded without deleting geometry',()=>{
  const {physics}=fixture(),controller={position:{x:12,y:0,z:12},yaw:0};physics.break(physics.authored[0]);
  const body=physics.authored[0].chunks[0].body;
  physics.wind.strength=4;physics.command('KeyG',controller);
  for(let i=0;i<120;i++)physics.update(1/120,controller,1);
  assert.ok(body.snow>.1);assert.ok(body.friction<body.baseFriction);assert.ok(body.velocity.x>0||body.velocity.z>0);
  const coating=body.snow;physics.fire.position.copy(body.position);Object.assign(physics.fire,{active:true,fuel:20,intensity:1});
  for(let i=0;i<100;i++)physics.update(1/120,controller,0);
  assert.ok(body.temperature>0);assert.ok(body.snow<coating);
  physics.break(physics.authored[1]);physics.break(physics.authored[2]);
  const active=physics.debris.filter(b=>b.enabled&&!b.sleeping).length;assert.ok(active<=12);assert.equal(physics.movingIndices.length,288);
  assert.ok(physics.authored[0].chunks.every(c=>c.records.length>0));
});

test('cached static broadphase is reused and sphere stacks stay finite under accumulated contact impulses',()=>{
  const w=new SplatPhysicsWorld({height:()=>0,capacity:1100});for(let i=0;i<1000;i++)w.createBody({type:'fixed',position:[100+i*2,0,0]});
  for(let i=0;i<6;i++)w.createBody({position:[0,.5+i*1.001,0],restitution:0,drag:.15});
  for(let i=0;i<900;i++)w.advance(1/120);
  assert.ok(w.stats.staticRebuilds<25);assert.ok(w.stats.warmContacts>0);
  for(const b of w.bodies.slice(1000)){assert.ok(b.position.toArray().every(Number.isFinite));assert.ok(b.position.y>.49);assert.ok(b.velocity.length()<.3);}
  const fixed=w.bodies[0];w.setEnabled(fixed,false);w.advance(1/120);assert.ok(w.fixed.every(b=>b!==fixed));
});

test('numeric hash aliases cannot duplicate contacts; exact drag integration follows the analytic free-fall solution',()=>{
  const w=new SplatPhysicsWorld({gravity:[0,0,0]});
  // These signed cells hash to the same integer in the static index.
  w.createBody({type:'fixed',position:[1.5,0,1.5]});w.createBody({type:'fixed',position:[-.5,0,-.5]});
  w.createBody({position:[1.5,0,1.5],radius:.2});w.advance(1/120);assert.equal(w.stats.contacts,1);assert.equal(w.stats.candidates,1);
  const fall=new SplatPhysicsWorld(),body=fall.createBody({position:[0,20,0],drag:.4});
  for(let i=0;i<120;i++)fall.advance(1/120);
  const integral=-Math.expm1(-.4)/.4;
  assert.ok(Math.abs(body.velocity.y+9.81*integral)<1e-9);
  assert.ok(Math.abs(body.position.y-(20-9.81*(1-integral)/.4))<1e-9);
});
