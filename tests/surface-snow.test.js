import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {SurfaceSnow} from '../src/splat/physics/SurfaceSnow.js';
import {GroundMaterials} from '../src/splat/physics/GroundMaterials.js';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';
import {SplatParticles,PARTICLE} from '../src/splat/physics/SplatParticles.js';
import {XPBDFlexWorld} from '../src/splat/physics/XPBDFlexWorld.js';
import {CliffWindField} from '../src/splat/physics/CliffWindField.js';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';

function fixture({cloth=true,capacity=64}={}){
 const ground=new GroundMaterials(()=>0,{bounds:[-8,8,-8,8]}),world=new SplatPhysicsWorld({height:ground.height.bind(ground),capacity:32}),particles=new SplatParticles({capacity}),wind=new CliffWindField({strength:0});
 const body=world.createBody({type:'fixed',position:[0,.6,0],radius:.6});let flexibles=null;
 if(cloth){const solver=new XPBDFlexWorld();for(const point of [[-1,2,1],[1,2,1],[-1,2,3]])solver.node(...point);flexibles={solver,triangles:[{a:0,b:1,c:2}]};}
 const physics={world,materials:ground,particles,flexibles,authored:[{body}],clusters:[]};const surface=new SurfaceSnow(physics);world.detect();return {...physics,surface,body,wind};
}
function run(f,seconds,snow=1){for(let i=0;i<Math.round(seconds*120);i++){f.world.stats.ticks++;f.world.time+=1/120;f.surface.step(1/120,snow,null);}}
function ledger(f){const s=f.surface.snapshot();return s.rigidVolume+s.clothVolume+s.airborne+s.pendingVolume+s.landed+s.melted+s.drained;}
const near=(a,b,tolerance=2e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('resting rock builds a persistent, oriented cap rather than a seasonal tint',()=>{
 const f=fixture({cloth:false});run(f,4);const b=f.body,o=b.id*6;near(f.surface.depth[o+2],.048);assert.equal(f.surface.depth[o],0);assert.equal(f.surface.depth[o+3],0);assert.ok(b.snowMass>0);assert.equal(b.type,'fixed');
 const before=f.surface.bodyVolume(b);run(f,1,0);assert.ok(f.surface.bodyVolume(b)>before*.97);near(ledger(f),f.surface.stats.deposited);f.surface.dispose();f.materials.dispose();
});

test('rock snow contributes effective mass and inertia, and shedding restores the structural body',()=>{
 const f=fixture({cloth:false});run(f,4);f.world.makeDynamic(f.body);f.surface.updateLoad(f.body);assert.ok(f.body.inverseMass<1/f.body.mass);near(f.body.inverseInertia,1/((f.body.mass+f.body.snowMass)*f.body.inertiaPerMass));
 f.surface.releaseBody(f.body,1);near(f.body.inverseMass,1/f.body.mass);near(f.body.inverseInertia,f.body.inverseMass/f.body.inertiaPerMass);f.surface.dispose();
});

test('cloth traps light snow vertically and carries deeper snow on upward-facing folds with extra load',()=>{
 const flat=fixture(),vertical=fixture();const s=vertical.flexibles.solver;s.position.set([-1,1,2,1,1,2,-1,3,2]);run(flat,5);run(vertical,5);
 assert.ok(flat.surface.clothDepth[0]>.05);assert.ok(vertical.surface.clothDepth[0]>.005);assert.ok(flat.surface.clothDepth[0]>vertical.surface.clothDepth[0]*5);
 const fs=flat.flexibles.solver;assert.ok(fs.snow[0]>.2);fs.step(1/120,flat.world,[{wind:new Vector3()}],null,1);assert.ok(fs.inverse[0]<fs.baseInverse[0]);assert.ok(fs.surfaceSnowDepth[0]>.05);
 near(ledger(flat),flat.surface.stats.deposited);flat.surface.dispose();vertical.surface.dispose();
});

test('translation, rotation and impacts knock stored snow off a loaded rock',()=>{
 for(const cause of ['move','rotate','impact']){
  const f=fixture({cloth:false});run(f,4);const before=f.surface.bodyVolume(f.body);
  if(cause==='move'){f.body.velocity.set(6,0,0);run(f,.6,0);}
  if(cause==='rotate'){f.body.rotation.setFromAxisAngle(new Vector3(1,0,0),Math.PI);run(f,.6,0);}
  if(cause==='impact'){f.world.stats.ticks++;Object.assign(f.body.terrainTouch,{tick:f.world.stats.ticks,energy:f.body.mass*7});f.surface.step(1/120,0,null);}
  assert.ok(f.surface.bodyVolume(f.body)<before*.5,cause);assert.ok(f.surface.stats.shed>0);assert.ok(f.particles.snapshot().snowClumps>0);near(ledger(f),f.surface.stats.deposited);f.surface.dispose();
 }
});

test('cloth deformation and rapid movement shed snow while conserving its volume',()=>{
 const f=fixture();run(f,4);const before=f.surface.clothDepth[0];f.flexibles.solver.velocity.fill(4);run(f,.3,0);assert.ok(f.surface.clothDepth[0]<before*.5);
 assert.ok(f.surface.stats.motionEvents>0);near(ledger(f),f.surface.stats.deposited);
 // A collapsing triangle releases excess instead of creating a huge spike.
 f.flexibles.solver.position.set([-1,2,1,-.9999,2,1,-1,2,1.0001]);run(f,.02,0);assert.ok(f.surface.clothDepth[0]<=.180001);near(ledger(f),f.surface.stats.deposited);f.surface.dispose();
});

test('nearby blasts strip rock and cloth snow immediately; distant stores remain attached',()=>{
 const f=fixture(),far=f.world.createBody({type:'fixed',position:[7,.6,0],radius:.5});f.surface.register(far);run(f,6);const remote=f.surface.bodyVolume(far),cloth=f.surface.clothDepth[0];
 f.surface.blast(new Vector3(0,.8,1),{radius:4,pressureImpulse:700});assert.ok(f.surface.bodyVolume(f.body)<.001);assert.ok(f.surface.clothDepth[0]<cloth*.5);near(f.surface.bodyVolume(far),remote);assert.ok(f.surface.stats.blastEvents>=2);assert.ok(f.particles.snapshot().snowVolume>0);near(ledger(f),f.surface.stats.deposited);f.surface.dispose();
});

test('falling clumps land back in the physical ground field without duplicating their stored volume',()=>{
 const f=fixture({cloth:false});run(f,3);f.surface.releaseBody(f.body,1);const initial=f.surface.stats.deposited;
 for(let i=0;i<960;i++){f.world.time+=1/120;f.particles.update(1/120,f.world,f.wind);}
 assert.equal(f.particles.snapshot().snowClumps,0);assert.ok(f.surface.stats.landed>0);near(f.materials.totals[0],f.surface.stats.landed);near(ledger(f),initial);f.surface.dispose();
});

test('a saturated shared particle pool still accounts for displaced snow when slots recycle',()=>{
 const f=fixture({capacity:1});run(f,4);f.surface.releaseBody(f.body,1);assert.ok(f.surface.stats.recycled>0);assert.ok(f.surface.stats.landed>0);
 f.particles.emit(PARTICLE.DUST,new Vector3(1,2,1),new Vector3());assert.equal(f.particles.snowVolume[0],0);assert.equal(f.particles.snapshot().snowClumps,0);near(ledger(f),f.surface.stats.deposited);f.surface.dispose();
});

test('tiny surface dribbles coalesce without consuming one particle per tick',()=>{
 const f=fixture({cloth:false}),point=new Vector3(0,2,0),v=new Vector3();
 for(let i=0;i<8;i++)f.surface.emit(point,v,.00001);assert.equal(f.particles.snapshot().snowClumps,0);near(f.surface.pendingVolume,.00008,1e-10);
 for(let i=0;i<3;i++)f.surface.emit(point,v,.00001);assert.equal(f.particles.snapshot().snowClumps,1);near(f.surface.snapshot().airborne+f.surface.pendingVolume,.00011,1e-10);f.surface.clear();assert.equal(f.surface.pendingVolume,0);f.surface.dispose();
});

test('fracture-sized proxy changes preserve snow volume and shed any excess thickness',()=>{
 const f=fixture({cloth:false});run(f,6);f.body.radius=.15;f.body.revision++;f.world.stats.ticks++;f.surface.step(1/120,0,null);assert.ok(f.surface.depth.every(d=>d<=.24));assert.ok(f.surface.stats.shed>0);near(ledger(f),f.surface.stats.deposited);f.surface.dispose();
});

test('local fire melts a stored rock cap and heats falling clumps',()=>{
 const f=fixture({cloth:false});run(f,3);const before=f.surface.bodyVolume(f.body),fire={active:true,intensity:1,position:new Vector3(0,.6,0)};
 for(let i=0;i<120;i++){f.world.stats.ticks++;f.surface.step(1/120,0,fire);}assert.ok(f.surface.bodyVolume(f.body)<before*.1);assert.ok(f.surface.stats.melted>0);near(ledger(f),f.surface.stats.deposited);
 const i=f.particles.emit(PARTICLE.SNOW,new Vector3(0,1,0),new Vector3(),{snowVolume:.01,life:2});const melt=f.surface.stats.melted;f.particles.update(.02,f.world,f.wind,[fire]);assert.ok(f.particles.snowVolume[i]<.01);assert.ok(f.surface.stats.melted>melt);f.surface.dispose();
});

test('water and heat melt carried snow; clear and cloth reset account for the remainder',()=>{
 const f=fixture();run(f,3);f.surface.releaseBody(f.body,1);const i=f.particles.snowVolume.findIndex(v=>v>0),v=f.particles.snowVolume[i];f.particles.retireSnow(i,'water');assert.ok(f.surface.stats.melted>=v);
 f.surface.resetCloth();assert.equal(f.surface.clothDepth[0],0);near(ledger(f),f.surface.stats.deposited);
 f.surface.clear();assert.equal(f.surface.snapshot().airborne,0);assert.equal(f.surface.snapshot().clothVolume,0);near(ledger(f),f.surface.stats.deposited);f.surface.dispose();
});

test('fracture and pooled-rock recycling release snow once, preserve slots, and start fragments clean',()=>{
 const p=new CliffPhysics(()=>0,[],{clusterCapacity:1,advancedRocks:true,accumulation:true});const c={position:new Vector3(),yaw:0};p.command('KeyB',c);
 const count=p.splats.length,rock=p.clusters[0];p.surfaceSnow.depth[rock.body.id*6+2]=.03;
 p.break(rock);assert.equal(p.surfaceSnow.bodyVolume(rock.body),0);assert.ok(rock.chunks.every(k=>k.body.surfaceSnow&&p.surfaceSnow.bodyVolume(k.body)===0));assert.ok(p.particles.snapshot().snowClumps>0);
 p.command('KeyB',c);assert.equal(p.surfaceSnow.bodyVolume(rock.body),0);assert.equal(p.splats.length,count);assert.ok(p.surfaceSnow.data.length<=p.world.capacity*48+256);p.dispose();
});

test('GPU snow follows the interpolated local rock orientation and bypasses legacy cloth coating',()=>{
 const f=fixture({cloth:false});run(f,2);f.body.rotation.setFromAxisAngle(new Vector3(0,0,1),.6);f.world.alpha=.5;f.surface.sync();const q=new Quaternion().slerp(f.body.rotation,.5),k=f.body.id*12;
 near(f.surface.data[k+6],q.x);near(f.surface.data[k+7],q.y);near(f.surface.data[k+8],q.z);near(f.surface.data[k+9],q.w);near(f.surface.data[k+2],f.surface.depth[2]);
 const shader=f.surface.shader('uniform bool hasWind;\n}else if(field.w>.52&&field.w<.58){\nvec3 p=(modelViewMatrix*vec4(center.xyz,1.)).xyz;');assert.ok(shader.includes('surfaceSnowRead'));assert.ok(shader.includes('field.w>.512'));assert.ok(shader.includes('center.xyz+=n*depth'));f.surface.dispose();
});
