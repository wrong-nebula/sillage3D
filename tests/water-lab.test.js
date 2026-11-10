import test from 'node:test';
import assert from 'node:assert/strict';
import {WaterLab,WATER_BASIN,waterExcavation,waterBasinHeight} from '../src/splat/physics/WaterLab.js';
import {SplatPhysicsWorld} from '../src/splat/physics/SplatPhysicsWorld.js';
import {SplatParticles,PARTICLE} from '../src/splat/physics/SplatParticles.js';
import {CliffWindField} from '../src/splat/physics/CliffWindField.js';
import {CliffPhysics} from '../src/splat/CliffPhysics.js';
import {Vector3} from 'three';

const height=(x,z)=>waterBasinHeight(x,z,0,-.025),config={...WATER_BASIN,level:-.025};
function fixture(){const world=new SplatPhysicsWorld({height,capacity:24}),water=new WaterLab(world,height,config),particles=new SplatParticles({capacity:128}),wind=new CliffWindField({strength:0});return {world,water,particles,wind};}
function run(f,seconds){const fire={active:false};for(let i=0;i<seconds*120;i++){f.water.beforeStep(1/120,f.particles,fire,f.wind,null);f.world.advance(1/120);f.particles.update(1/120,f.world,f.wind);f.water.afterStep(1/120,f.particles,null);}}
test('water fixture is a contained shallow basin, with a bounded surface grid and render pool',()=>{
 const f=fixture(),w=f.water;assert.ok(height(w.x,w.z)<w.level-.6);assert.equal(waterExcavation(0,3),0);assert.ok(w.contains(w.x,w.z));assert.equal(w.surface(0,0),-Infinity);
 assert.equal(w.h.length,48*48);assert.ok(w.splats.length<1100);assert.ok(w.surfaceCount>600);assert.ok(w.texture.image.data.byteLength<40000);w.dispose();
});
test('dense stone sinks while the low-density wooden float settles at the surface, with drag and wetness',()=>{
 const f=fixture(),w=f.water,b=f.world.createBody({position:[w.x+.7,w.level+1,w.z],velocity:[1,-2,0],radius:.25,mass:2});run(f,6);
 assert.ok(b.position.y<w.level-.15);assert.ok(w.float.position.y>w.level-.12&&w.float.position.y<w.level+.15);assert.ok(b.wetness>.9);assert.ok(w.float.wetness>.9);assert.ok(w.stats.entries>=2);assert.ok(w.stats.splashes>0);assert.ok(b.position.toArray().every(Number.isFinite));
 const wet=b.wetness;f.world.teleport(b,[0,2,0]);run(f,2);assert.ok(b.wetness<wet&&b.wetness>.5);w.dispose();
});
test('waves propagate, remain stable under repeated blasts and damp when forcing stops',()=>{
 const f=fixture(),w=f.water;w.disturb(w.x,w.z,.7,.5);run(f,1);const peak=w.snapshot().peakWave;assert.ok(peak>0);assert.ok(w.h.some((v,i)=>Math.abs(v)>1e-5&&Math.hypot(i%48-24,Math.floor(i/48)-24)>3));
 for(let i=0;i<10;i++)w.blast(new Vector3(w.x,w.level,w.z),{radius:5,pressureImpulse:700},f.particles);run(f,1);const energy=w.snapshot().waveEnergy;assert.ok(w.snapshot().peakWave<=.065001);run(f,10);assert.ok(w.snapshot().waveEnergy<energy);assert.ok(w.h.every(Number.isFinite));assert.ok(peak<=.065001);w.dispose();
});
test('water extinguishes submerged embers/flames, wets shore splashes, and quenches fire',()=>{
 const f=fixture(),w=f.water,p=f.particles,point=new Vector3(w.x,w.level-.05,w.z),velocity=new Vector3();
 p.emit(PARTICLE.EMBER,point,velocity);p.emit(PARTICLE.FLAME,point,velocity);w.afterStep(1/120,p,null);assert.equal(p.snapshot().active,0);assert.equal(w.stats.quenched,2);
 const x=w.x+w.rx*.96,z=w.z,cell=w.cell(x,z);w.wet[cell]=0;p.emit(PARTICLE.WATER,new Vector3(x,height(x,z)+.02,z),velocity,{size:.03});w.afterStep(1/120,p,null);assert.ok(w.wetAt(x,z)>.2);
 const fire={active:true,wetness:0,position:point};for(let i=0;i<40;i++)w.beforeStep(1/120,p,fire,f.wind,null);assert.equal(fire.wetness,1);w.dispose();
});
test('character motion generates wakes; submerged flexible nodes gain wetness and water drag',()=>{
 const f=fixture(),w=f.water,c=f.world.createBody({type:'kinematic',position:[w.x,w.level,w.z],radius:.4});c.velocity.set(1,0,0);
 const fire={active:false};w.beforeStep(1/120,f.particles,fire,f.wind,c);c.position.x+=.4;w.beforeStep(1/120,f.particles,fire,f.wind,c);assert.ok(w.stats.characterWakes>0);assert.ok(w.characterSubmersion>0);
 const solver={count:1,position:new Float64Array([w.x,w.level-.1,w.z]),velocity:new Float32Array([3,0,0])};w.afterStep(.1,f.particles,{solver});assert.ok(solver.waterWet[0]>.3);assert.ok(solver.velocity[0]<3);w.dispose();
});
test('water is opt-in; lab commands, wet rock shading and frame packing use existing body budgets',()=>{
 const p=new CliffPhysics(height,[],{desert:true,water:config,advancedRocks:true,clusterCapacity:1}),controller={position:{x:0,y:0,z:0},yaw:0};p.wind.strength=0;p.command('KeyU',controller);
 assert.equal(p.clusters[0].body.position.x,config.x);for(let i=0;i<600;i++)p.update(1/120,controller);assert.ok(p.snapshot().water.entries>0);assert.ok(p.debris.some(b=>b.wetness>.2));
 p.fire.active=true;p.fire.fuel=28;p.fire.position.set(config.x,height(config.x,config.z)+.12,config.z);for(let i=0;i<80;i++)p.update(1/120,controller);assert.equal(p.fire.active,false);
 const data=new Float32Array(p.splats.length*20),centers=new Float32Array(p.splats.length*3);p.writePacked(data,centers,0);assert.ok(data.every(Number.isFinite));p.dispose();
 const dry=new CliffPhysics(()=>0,[],{clusterCapacity:1});assert.equal(dry.water,null);dry.dispose();
});
test('wet stationary authored rocks update their paint and transfer wetness to fractured pieces',async()=>{
 const {AuthoredRock}=await import('../src/splat/physics/AuthoredRock.js'),world=new SplatPhysicsWorld({capacity:16}),source=[];
 for(let i=0;i<96;i++){const y=1-2*(i+.5)/96,a=i*2.399963,r=Math.sqrt(1-y*y);source.push({center:[.5*r*Math.cos(a),.53+.5*y,.5*r*Math.sin(a)],axes:[[.06,0,0],[0,.06,0],[0,0,.02]],color:[.6,.4,.25],opacity:.96,seed:i/96});}
 const rock=new AuthoredRock(world,{start:0,count:96,diameter:1},source,{advanced:true});rock.mobilize();rock.sync(1);const original=rock.chunks[0].records[0].splat.color[0];
 rock.body.wetness=1;assert.ok(rock.sync(1));assert.ok(rock.chunks[0].records[0].splat.color[0]<original*.75);assert.equal(rock.sync(1),false);
 rock.fracture();assert.ok(rock.chunks.every(c=>c.body.wetness===1));
});
test('gradual shore entry produces a character wake even when submersion grows in tiny steps',()=>{
 const f=fixture(),w=f.water,c=f.world.createBody({type:'kinematic',position:[w.x-w.rx-.7,.5,w.z],radius:.43});c.velocity.set(1,0,0);
 for(let i=0;i<480;i++){c.position.x=w.x-w.rx-.7+i*.014;c.position.y=height(c.position.x,c.position.z)+.65;w.beforeStep(1/120,f.particles,{active:false},f.wind,c);}
 assert.ok(w.stats.characterWakes>=2);assert.ok(w.characterSubmersion>0);w.dispose();
});
