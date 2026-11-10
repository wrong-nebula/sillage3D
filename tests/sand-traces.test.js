import test from 'node:test';
import assert from 'node:assert/strict';
import {SandTraces} from '../src/splat/physics/SandTraces.js';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';

const crow=()=>({controller:{grounded:true,yaw:0,position:{x:0,y:0,z:0}}});
test('grounded walking alternates terrain-aligned prints; idle, flight and teleports do not draw trails',()=>{
  let queries=0;const height=(x,z)=>{queries++;return .1*x+.05*z;},sand=new SandTraces(height,8),bird=crow();
  sand.update(0,bird,0);bird.controller.position.z=.6;sand.update(.1,bird,0);
  bird.controller.position.z=1.2;sand.update(.1,bird,0);assert.equal(sand.steps,2);
  assert.ok(sand.splats[0].center[0]>0&&sand.splats[16].center[0]<0);
  const used=queries;for(let i=0;i<100;i++)sand.update(.01,bird,0);assert.equal(queries,used);assert.equal(sand.steps,2);
  for(const s of sand.splats.filter(s=>s.opacity>0))assert.ok(s.center[1]>=height(s.center[0],s.center[2])+.03-1e-8);
  bird.controller.grounded=false;bird.controller.position.x=2;sand.update(.1,bird,0);assert.equal(sand.steps,2);
  bird.controller.grounded=true;sand.update(.1,bird,0);bird.controller.position.x=15;sand.update(.1,bird,0);assert.equal(sand.steps,2);
});
test('real terrain manifolds leave landing hollows and continuous rock tracks, with no airborne or recycled streaks',()=>{
  const world=new SplatPhysicsWorld({height:()=>0,capacity:4}),sand=new SandTraces(()=>0,4);
  const body=world.createBody({position:[0,2,0],velocity:[2,-3,0],radius:.5,mass:20,friction:0,restitution:0,canSleep:false});
  const tick=()=>{world.step(1/120);sand.capture(world);};
  for(let i=0;i<100;i++)tick();assert.ok(sand.impacts>0);assert.ok(sand.tracks>=5);
  const before=sand.tracks+sand.impacts;
  world.teleport(body,[20,8,0]);body.velocity.set(0,0,0);for(let i=0;i<20;i++)tick();assert.equal(sand.tracks+sand.impacts,before);
  world.teleport(body,[20,.49,0]);body.velocity.set(0,0,0);tick();assert.equal(sand.tracks+sand.impacts,before);
  body.velocity.set(2,0,0);for(let i=0;i<40;i++)tick();assert.ok(sand.tracks+sand.impacts>before);
  assert.ok(sand.splats.filter(s=>s.material==='sand-trace').length===4096);
});
test('rock-on-rock support never stamps suspended tracks',()=>{
  const world=new SplatPhysicsWorld({height:()=>0,capacity:3}),sand=new SandTraces(()=>0,3);
  world.createBody({type:'fixed',position:[0,2,0],radius:2});
  world.createBody({position:[0,4.48,0],radius:.5,velocity:[.3,0,0]});
  for(let i=0;i<30;i++){world.step(1/120);sand.capture(world);}
  assert.equal(sand.tracks+sand.impacts,0);
});
test('bounded independent pools, wind infill, snow cover and packed retirement preserve render ownership',()=>{
  const sand=new SandTraces(()=>0,2),bird=crow();
  sand.stamp(0,0,0,.17,.28);sand.update(0,bird,0);const foot=sand.splats[0].center.slice();
  for(let i=0;i<400;i++)sand.stamp(i*.01,0,0,.5,.4,'track');assert.deepEqual(sand.splats[0].center,foot);
  sand.update(0,bird,1);assert.ok(sand.splats.every(s=>s.opacity===0));sand.update(0,bird,0);assert.ok(sand.splats[0].opacity>0);
  const data=new Float32Array((sand.splats.length+2)*20).fill(-1),centers=new Float32Array((sand.splats.length+2)*3);
  sand.writePacked(data,centers,1);assert.equal(data[0],-1);assert.equal(data.at(-1),-1);assert.ok(data[23]>0);
  const gust={sample(p,t,out){return out.set(14,0,0);}};
  sand.update(20,bird,0,gust,20);assert.equal(sand.snapshot().visible,0);sand.writePacked(data,centers,1);assert.equal(data[23],0);
});
test('only desert integration allocates sand; pooled rocks stamp within the existing fixed render budget',()=>{
  const regular=new CliffPhysics(()=>0,[],{clusterCapacity:1}),desert=new CliffPhysics(()=>0,[],{clusterCapacity:1,desert:true});
  assert.equal(regular.sand,null);assert.equal(desert.splats.length-regular.splats.length,4096);
  const player={position:{x:10,y:0,z:10},yaw:0};desert.command('KeyB',player);
  for(let i=0;i<240;i++)desert.update(1/120,player);
  assert.ok(desert.snapshot().sand.impacts>0);
  regular.dispose();desert.dispose();
});

test('swept ground touches survive an empty final manifold after a fast fragment bounces',()=>{
  const world=new SplatPhysicsWorld({height:()=>0,capacity:2}),sand=new SandTraces(()=>0,2);
  const body=world.createBody({position:[0,.3,0],velocity:[8,-90,0],radius:.04,restitution:.9,friction:0,ccd:true});
  world.step(1/120);assert.ok(world.stats.ccdHits>0);assert.equal(world.contactCount,0);assert.ok(body.position.y>.2);
  sand.capture(world);assert.equal(sand.impacts,1);assert.ok(Math.abs(sand.splats[96*16].center[0])<.2);
  const count=sand.impacts+sand.tracks;world.step(1/120);sand.capture(world);assert.equal(sand.impacts+sand.tracks,count,'airborne motion must not stamp');
});
test('light first rolling touches make local patches without requiring a heavy landing',()=>{
  const world=new SplatPhysicsWorld({height:()=>0,capacity:2}),sand=new SandTraces(()=>0,2);
  const body=world.createBody({position:[0,.499,0],velocity:[.5,0,0],radius:.5,mass:.2,friction:0});
  world.step(1/120);assert.ok(body.terrainTouch.energy<1.5);sand.capture(world);assert.equal(sand.tracks,1);
  world.teleport(body,[10,.499,0]);world.step(1/120);sand.capture(world);assert.equal(sand.tracks,2);
  const mark=sand.splats[(96+1)*16];assert.ok(mark.center[0]>9.7,'a recycled rolling rock starts locally, not halfway across a teleport');
});
test('snow contacts produce visible raised snow grooves and rims, and thaw hides those marks',()=>{
  const world=new SplatPhysicsWorld({height:()=>.075,capacity:2}),sand=new SandTraces(()=>0,2),bird=crow();
  world.createBody({position:[0,.574,0],velocity:[2,0,0],radius:.5,friction:0});
  for(let i=0;i<60;i++){world.step(1/120);sand.capture(world,1);}
  sand.update(0,bird,1);assert.ok(sand.snowTracks>2);assert.ok(sand.visibleSnow>2);assert.equal(sand.visibleSand,0);
  const active=sand.splats.filter(s=>s.opacity>0);assert.ok(active.every(s=>s.center[1]>.085));assert.ok(active.some(s=>s.color[2]>s.color[0]));
  sand.update(0,bird,0);assert.equal(sand.visibleSnow,0);assert.ok(sand.splats.every(s=>s.opacity===0));
});
test('blast-sized groups share the stamp budget fairly without growing render membership',()=>{
  const world=new SplatPhysicsWorld({height:()=>0,capacity:24}),sand=new SandTraces(()=>0,24);
  for(let i=0;i<20;i++)world.createBody({position:[i*2,.199,0],velocity:[3,0,0],radius:.2,mass:.2,friction:0,ccd:true});
  for(let i=0;i<40;i++){const before=sand.tracks+sand.impacts;world.step(1/120);sand.capture(world);assert.ok(sand.tracks+sand.impacts-before<=4);}
  assert.ok(world.bodies.every(b=>sand.history[b.id]?.stamps>0));assert.equal(sand.splats.length,4096);
});

function explosionFixture(){
  const source=[],authoredRocks=[];
  for(let rock=0;rock<2;rock++){
    const start=source.length,x=rock*2;
    for(let i=0;i<96;i++){
      const y=1-2*(i+.5)/96,a=i*2.399963,r=Math.sqrt(1-y*y);
      source.push({center:[x+.5*r*Math.cos(a),.53+.5*y,.5*r*Math.sin(a)],axes:[[.06,0,0],[0,.06,0],[0,0,.02]],color:[.6,.4,.2],opacity:.96,seed:i/96});
    }
    authoredRocks.push({id:rock,x,z:0,start,count:96,diameter:1,collider:{x,z:0,radiusX:.5,radiusZ:.5,top:1.03}});
  }
  return new CliffPhysics(()=>0,[],{environmentSplats:source,authoredRocks,clusterCapacity:1,desert:true,advancedRocks:true});
}
for(const snow of [0,1])test(`explosions release authored and spawned fragments that leave ${snow?'snow':'sand'} trails`,()=>{
  const physics=explosionFixture(),bird=crow();bird.controller.position.x=20;bird.controller.grounded=false;
  physics.update(1/120,bird.controller,snow);const cluster=physics.clusters[0];cluster.launch(physics.point.set(0,.85,2),physics.velocity.set(0,0,0));
  const blast=physics.explode(physics.point.set(-1.5,.1,0),{radius:7,pressureImpulse:100});assert.ok(blast.affected>=3);assert.ok(physics.fractures>0);
  for(let i=0;i<600;i++){physics.update(1/120,bird.controller,snow);physics.sand.update(1/120,bird,snow,physics.wind,physics.time);}
  const traced=physics.world.bodies.filter(b=>physics.sand.history[b.id]?.stamps>0);
  assert.ok(traced.some(b=>b.cluster===cluster),'spawned fragments must leave marks');
  assert.ok(traced.some(b=>!b.cluster&&b!==physics.player),'authored fragments must leave marks');
  assert.ok(physics.sand.tracks>0);assert.ok(snow?physics.sand.visibleSnow>0:physics.sand.visibleSand>0);
  if(snow)assert.ok(physics.sand.snowTracks>0);physics.dispose();
});

test('a spinning compound resting in place does not overwrite old trails as its contact lobes change',()=>{
  const world=new SplatPhysicsWorld({height:()=>0,capacity:2}),sand=new SandTraces(()=>0,2);
  const b=world.createBody({position:[0,.199,0],angularVelocity:[0,4,0],radius:.2,friction:0,drag:0,canSleep:false});
  world.setCompound(b,[[-.3,-.3],[.3,-.3],[-.3,.3],[.3,.3]].map(([x,z])=>({center:b.position.clone().set(x,0,z),radius:.2})));
  for(let i=0;i<240;i++){world.step(1/120);sand.capture(world);}
  assert.ok(Math.hypot(b.position.x,b.position.z)<.01);assert.equal(sand.tracks,0);
});
test('fragments outside the painted terrain cannot consume the trace pool',()=>{
  const world=new SplatPhysicsWorld({height:()=>0,capacity:2}),sand=new SandTraces(()=>0,2,{bounds:[-5,5,-5,5]});
  world.createBody({position:[10,.199,0],velocity:[2,0,0],radius:.2,friction:0});
  for(let i=0;i<120;i++){world.step(1/120);sand.capture(world);}
  assert.equal(sand.tracks+sand.impacts,0);
});

test('thousands of new contacts cannot evict an older trail from the terrain cache',()=>{
  const sand=new SandTraces(()=>0,2),bird=crow();bird.controller.grounded=false;
  sand.stamp(0,0,0,.35,.7,'track');sand.stamp(-2,0,0,.35,.7,'track',1,true);
  for(let i=0;i<2000;i++)sand.stamp(4+i%32*.6,-20+Math.floor(i/32)%32*.6,0,.2,.3,'track');
  assert.ok(sand.atlas.sample(0,0)[0]>.8);assert.ok(sand.atlas.sample(-2,0,true)[0]>.8);
  assert.ok(sand.nextRock>160);assert.equal(sand.splats.length,4096);
  sand.update(120,bird,0);assert.equal(sand.visible,0,'the fine splats can retire independently');
  assert.ok(sand.atlas.sample(0,0)[0]>.7,'sand remains visible after two calm minutes');
  assert.ok(sand.atlas.sample(-2,0,true)[0]>.7,'snow remains visible after two calm minutes');
  sand.update(280,bird,0);assert.equal(sand.atlas.sample(0,0)[0],0);sand.dispose();
});
test('terrain trace storage, upload frequency and decay work stay bounded under sustained stamping',()=>{
  const sand=new SandTraces(()=>0,2),atlas=sand.atlas,version=atlas.texture.version;
  for(let i=0;i<600;i++){
    sand.stamp(i%16,Math.floor(i/16)%16,0,.15,.4,'track');atlas.update(1/60,0);
  }
  assert.equal(atlas.data.byteLength,4*1024*1024);assert.ok(atlas.uploads<=101);assert.ok(atlas.texture.version>version);
  assert.ok(atlas.occupied>0&&atlas.occupied<=1024*1024);const before=atlas.sample(0,0)[0];
  atlas.update(60,14);assert.ok(atlas.sample(0,0)[0]<before);assert.ok(atlas.sweep>=0&&atlas.sweep<1024);
  sand.dispose();
});
