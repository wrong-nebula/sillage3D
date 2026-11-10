import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {GroundMaterials} from '../src/splat/physics/GroundMaterials.js';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';
import {SplatParticles,PARTICLE} from '../src/splat/physics/SplatParticles.js';
import {CliffWindField} from '../src/splat/physics/CliffWindField.js';
import {TerrainTraceAtlas} from '../src/splat/physics/TerrainTraceAtlas.js';

const small=(options={})=>new GroundMaterials(()=>0,{bounds:[-6,6,-6,6],...options});
const run=(field,seconds,options={})=>{for(let i=0;i<Math.round(seconds*120);i++)field.step(1/120,options);field.sync(seconds);};
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const sum=a=>a.reduce((s,v)=>s+v,0);

test('finite deposits raise bilinear collision height, obey bounds/caps and account for rejection',()=>{
  const f=small();const accepted=f.deposit('snow',0,0,{volume:1,radius:1.4});
  near(accepted,1);near(f.totals[0],1);assert.ok(f.height(0,0)>.3);assert.equal(f.height(10,0),0);
  near(f.sample(f.depth,.125,.125),(f.depth[24*49+24]+f.depth[24*49+25]+f.depth[25*49+24]+f.depth[25*49+25])/4);
  f.deposit('sand',0,0,{volume:1000,radius:.4});assert.ok(f.stats.rejected>990);assert.ok(f.depth.every(d=>d<=1.200001));
  assert.equal(f.deposit('mud',50,50,{volume:1}),0);assert.throws(()=>f.deposit('lava',0,0),RangeError);assert.throws(()=>f.deposit('snow',NaN,0),RangeError);
  f.dispose();
});

test('snow compaction lowers support height without deleting solid volume; fresh snow fills ruts',()=>{
  const f=small();f.deposit('snow',0,0,{volume:2,radius:1.5});const volume=f.totals[0],before=f.height(0,0);
  for(let i=0;i<8;i++)f.compact(0,0,.6,20,.1);
  assert.ok(f.height(0,0)<before*.5);near(f.totals[0],volume);const compacted=f.height(0,0),packed=f.at(0,0).packing;
  near(f.snowDepth(.13,.12),f.height(.13,.12));
  f.deposit('snow',0,0,{volume:.5,radius:.8});assert.ok(f.height(0,0)>compacted);assert.ok(f.at(0,0).packing<packed);f.dispose();
});

test('sand slumping and wet mud displacement conserve material instead of editing the base terrain',()=>{
  const f=small();f.deposit('sand',0,0,{volume:1,radius:.65});f.deposit('mud',3,0,{volume:.8,radius:.7});const amounts=[...f.totals],before=f.height(0,0),mud=f.height(3,0);
  f.compact(3,0,.8,25,.2);assert.ok(f.height(3,0)<mud);run(f,4,{snow:1});
  // Subtract the separately accounted precipitation from the conserved layers.
  near(f.totals[1],amounts[1],2e-5);near(f.totals[2],amounts[2],2e-5);assert.ok(f.height(0,0)<before);assert.ok(f.stats.transported>0);assert.ok(f.base.every(v=>v===0));f.dispose();
});

test('striped snowfall integrates weather switches, persists without snowfall and visits bounded cells',()=>{
  const f=small({snowRate:.01,rowsPerTick:7});run(f,2,{snow:1});const snowy=f.totals[0];assert.ok(snowy>2.5);
  run(f,.2,{snow:0});const settled=f.totals[0];assert.ok(settled>snowy*.98);run(f,2,{snow:0});assert.ok(f.totals[0]>settled*.8&&f.totals[0]<settled);
  assert.equal(f.stats.cellsVisited,7*f.nx);assert.ok(f.depth.every(Number.isFinite));f.dispose();
});

test('clear discards pending striped precipitation rather than restoring old snowfall afterward',()=>{
  const f=small();f.step(1/120,{snow:1});f.clear();run(f,.5,{snow:0});assert.equal(f.totals[0],0);assert.equal(f.peak,0);f.dispose();
});

test('fire melts local snow into moisture, water rejects deposits, and clear tracks removed volumes',()=>{
  const f=small();const water={contains:(x,z)=>x>3,wetAt:()=>0};f.refreshMask(null,water);
  assert.equal(f.deposit('snow',4.5,0,{volume:1,radius:.4}),0);f.deposit('snow',0,0,{volume:1.5,radius:1.4});const initial=f.totals[0];
  run(f,3,{snow:1,water,fire:{active:true,intensity:1,position:new Vector3()}});
  assert.ok(f.stats.melted>.1);assert.ok(f.at(0,0).wetness>.1);near(f.totals[0]+f.stats.melted,f.stats.deposited[0],3e-5);assert.ok(f.totals[0]<initial+f.stats.deposited[0]);
  for(let r=0;r<f.nz;r++)for(let c=0;c<f.nx;c++)if(f.pond[r*f.nx+c])assert.equal(f.depth[r*f.nx+c],0);
  const remaining=sum(f.totals);f.clear();near(sum(f.stats.drained),remaining);assert.equal(f.height(0,0),0);f.dispose();
});

test('obstacles shelter the ground, while blasts and gusts redistribute loose deposits conservatively',()=>{
  const f=small(),w=new SplatPhysicsWorld({height:f.height.bind(f),capacity:2}),rock=w.createBody({type:'fixed',position:[3,.6,0],radius:.6});
  f.refreshMask(w,null);assert.equal(f.deposit('snow',3,0,{volume:1,radius:.3}),0);
  f.deposit('snow',0,0,{volume:3,radius:2});const initial=f.height(0,0),volume=f.totals[0];
  const moved=f.blast(new Vector3(0,.2,0),{radius:3,pressureImpulse:600});assert.ok(moved>0);near(f.totals[0],volume,1e-5);assert.ok(f.height(.5,0)<initial);
  const transported=f.stats.transported;const wind=new CliffWindField();wind.gust(0);run(f,.2,{world:w,wind,snow:0});assert.ok(f.stats.transported>transported);assert.ok(f.depth.every(v=>Number.isFinite(v)&&v>=0));assert.ok(rock.enabled);f.dispose();
});

test('resting rocks ride the actual field; contacts compact it and changes wake sleeping supports',()=>{
  const f=small(),w=new SplatPhysicsWorld({height:f.height.bind(f),capacity:2});w.groundMaterial=f.contact.bind(f);
  f.deposit('snow',0,0,{volume:2,radius:2});const b=w.createBody({position:[0,2,0],radius:.35,mass:2});
  const hooks={beforeStep:dt=>f.step(dt,{snow:0,world:w}),afterStep:dt=>f.capture(w,dt)};
  for(let i=0;i<360;i++)w.advance(1/120,hooks);
  assert.ok(Math.abs(b.position.y-f.height(0,0)-b.radius)<.02);assert.ok(f.stats.compactions>0);assert.ok(b.sleeping);
  f.clear();f.step(1/120,{world:w});assert.equal(b.sleeping,false);
  for(let i=0;i<120;i++)w.advance(1/120,hooks);near(b.position.y,.35,.01);f.dispose();
});

test('terrain normal caches refresh when material changes under an unmoved body',()=>{
  const f=small(),w=new SplatPhysicsWorld({height:f.height.bind(f),capacity:1}),b=w.createBody({position:[0,.3,0],radius:.4,canSleep:false});
  w.detect();const before=b.gx;f.deposit('sand',.5,0,{volume:.8,radius:1});w.terrainRevision=f.revision;w.detect();
  assert.ok(b.gx>before+.1);assert.equal(b.groundRevision,f.revision);f.dispose();
});

test('selective CCD and fire particles use the raised physical surface',()=>{
  const f=small(),w=new SplatPhysicsWorld({height:f.height.bind(f),capacity:1});f.deposit('sand',0,0,{volume:2,radius:2});const surface=f.height(0,0);
  const b=w.createBody({position:[0,3,0],velocity:[0,-500,0],radius:.15,ccd:true});w.advance(1/120);assert.ok(w.stats.ccdHits>0);assert.ok(b.position.y>=surface+.13);
  const p=new SplatParticles({capacity:2}),i=p.emit(PARTICLE.EMBER,new Vector3(2,f.height(2,0)+.09,0),new Vector3(0,-3,0),{size:.035,life:2});
  p.update(.05,w,new CliffWindField());assert.ok(p.bounceCount[i]>0);assert.ok(p.position[i*3+1]>=f.height(p.position[i*3],p.position[i*3+2]));f.dispose();
});

test('walking stamps actual planted foot positions and wet mud has distinct contact response',()=>{
  const f=small();f.deposit('snow',0,0,{volume:2,radius:2});const before=f.height(.4,0),crow={controller:{grounded:true,position:new Vector3(),yaw:0},footPlant:{legs:[{position:new Vector3(.4,0,0)},{position:new Vector3(.6,0,0)}]}};
  f.footsteps(1/60,crow);crow.controller.position.x=.5;f.footsteps(1/60,crow);assert.equal(f.stats.footsteps,1);assert.ok(f.height(.4,0)<before);
  f.deposit('mud',3,0,{volume:.5,radius:1});const m=f.contact(3,0,{});assert.ok(m.friction<.5);assert.equal(m.restitution,.06);f.dispose();
});

test('render textures agree with collision nodes, use half-texel UVs and compose with persistent tracks',()=>{
  const f=small(),atlas=new TerrainTraceAtlas({size:16});f.deposit('snow',0,0,{volume:1,radius:1.5});f.sync(0,true);
  const k=24*49+24;near(f.data[k*4],f.height(0,0));near(f.data[k*4+3],f.snowDepth(0,0));assert.equal(f.appearance[k*4],255);
  const source='uniform bool hasWind;\nvoid main(){float cliffEdge=0.;\n  if(hasWind){\n}}';const shader=atlas.shader(f.shader(source),{physical:true});
  assert.ok(shader.includes('center.y=originalGroundY+material.x'));assert.ok(shader.includes('accumulatedGround.w'));assert.ok(shader.includes('(groundMaterialSize-1.)+.5'));assert.ok(shader.includes('ink*=mix'));
  assert.equal(f.snapshot().textureBytes,49*49*20);atlas.dispose();f.dispose();
});

test('lab integration enables material collisions without adding splats or changing legacy cliff defaults',()=>{
  const legacy=new CliffPhysics(()=>0,[],{clusterCapacity:1}),lab=new CliffPhysics(()=>0,[],{clusterCapacity:1,accumulation:true});
  const c={position:new Vector3(),yaw:0};legacy.snow=1;lab.snow=1;assert.equal(legacy.world.height(0,0),.075);assert.equal(lab.world.height(0,0),0);
  lab.command('KeyL',c);assert.ok(lab.world.height(0,3.5)>.1);assert.equal(lab.splats.length,legacy.splats.length);
  const time=lab.materials.time;lab.update(0,c,1);assert.equal(lab.materials.time,time);lab.update(.1,c,1);assert.ok(lab.materials.time>time);assert.ok(lab.snapshot().materials.volume.snow>0);
  lab.command('KeyH',c);lab.update(.1,c,0);near(lab.fire.position.y,lab.height(lab.fire.position.x,lab.fire.position.z)+.12);
  assert.equal(lab.materials.nx,241);assert.equal(lab.materials.nz,225);assert.equal(lab.materials.stats.cellsVisited,1928);legacy.dispose();lab.dispose();
});
