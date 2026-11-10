import test from 'node:test';
import assert from 'node:assert/strict';
import {createGhibli,hillsideHeight,pondDistance,POND,PONDS,ISLANDS} from '../src/splat/ghibli.js';
import {packSplats} from '../src/splat/math.js';
import {createSheepFlock} from '../src/splat/sheepFlock.js';
import {createDoveFlock} from '../src/splat/doveFlock.js';
import {forestMask} from '../src/splat/ghibliForest.js';
import {createMeadowDogRoute,MEADOW_DOG_SAMPLES,MEADOW_DOG_SHADOWS} from '../src/splat/meadowDog.js';
import {pathX,pathSlope,pathWidth,PATH_START,PATH_JOIN} from '../src/splat/ghibliPath.js';

const scene=createGhibli();
test('the open hillside keeps the sampled torii aligned with the path and removes the cottage',()=>{
 const {layers,features}=scene.composition;
 assert.equal(layers.torii.count,5600);
 assert.equal(layers.cottage,undefined);assert.equal(layers.roofMoss,undefined);assert.equal(features.cottage,undefined);
 assert.ok(Math.abs(features.torii.base[0]-pathX(features.torii.base[2]))<1e-9);
 const tangent=[pathSlope(features.torii.base[2]),1];
 assert.ok(Math.abs(Math.cos(features.torii.yaw)*tangent[0]-Math.sin(features.torii.yaw)*tangent[1])<1e-9,"crossbar is perpendicular to the path");
 assert.match(features.torii.source,/Marso\/ghibli-viewer\/models\/torii_omoide003\.glb$/);
 assert.equal(features.torii.sha256,'5df555999b1ac0fd7b77324a906b7efe1b77ec2e24dc66248ddd3ca70bcd0ea8');
 for(const name of ['torii']){
  const f=features[name],l=layers[name],marks=scene.splats.slice(l.start,l.start+l.count);
  const ys=marks.map(s=>s.center[1]);
  assert.ok(Math.abs(Math.min(...ys)-hillsideHeight(f.base[0],f.base[2]))<.12);
  assert.ok(Math.max(...ys)-Math.min(...ys)>f.height*.98);
  // The sampled model must have visible side/back surfaces, not one flat image.
  for(const axis of [0,2])assert.ok(Math.max(...marks.map(s=>s.center[axis]))-Math.min(...marks.map(s=>s.center[axis]))>f.height*.6);
 }
 assert.equal(features.trees.count,3);
 assert.equal(scene.composition.referenceBoard,'/ghibli-references/reference-board.jpg');
});

test('wind metadata keeps cloth pinned while vegetation, water and cloud volumes animate',()=>{
 const animated=new Set(scene.animation.indices);
 assert.equal(animated.size,scene.animation.indices.length);
 assert.ok(animated.size>10000);
 const cloth=scene.splats.filter(s=>s.material==='cloth');
 assert.ok(cloth.length>200&&cloth.length<1800);
 assert.equal(scene.composition.layers.laundry,undefined);
 for(const i of animated){
  const s=scene.splats[i];
  assert.ok(['cloth','grass','foliage','water','cloud','fog'].includes(s.material));
  assert.equal(s.wind.length,4);assert.ok(s.wind.every(Number.isFinite));assert.ok(s.wind[1]>0);
  if(s.material==='cloth'){
   const v=(s.wind[0]-s.center[1])/s.wind[1];assert.ok(v>=-1e-6&&v<=1+1e-6);
   assert.ok([1,7].includes(s.wind[3]));
  }else if(s.material==='water')assert.ok([3,6].includes(s.wind[3]));
  else assert.equal(s.wind[3],s.material==='cloud'?4:s.material==='fog'?5:2);
 }
 assert.ok(cloth.some(s=>Math.abs(s.center[1]-s.wind[0])<1e-6),'cloth includes immobile pin row');
 for(const name of ['torii']){
  const layer=scene.composition.layers[name];
  for(let i=layer.start;i<layer.start+layer.count;i++)assert.equal(animated.has(i),false);
 }
});

test('scene stays inside the expanded splat budget and packs without changing any source mark',()=>{
 assert.ok(scene.splats.length+MEADOW_DOG_SAMPLES+MEADOW_DOG_SHADOWS+createSheepFlock(hillsideHeight).splats.length+createDoveFlock().splats.length<190000);
 let count=0;
 for(const layer of Object.values(scene.composition.layers)){assert.equal(layer.start,count);count+=layer.count;}
 assert.equal(count,scene.splats.length);
 const first=structuredClone(scene.splats[0]);
 const packed=packSplats(scene.splats);
 assert.ok(packed.height<=4096);assert.equal(packed.centers.length,scene.splats.length*3);
 assert.deepEqual(scene.splats[0],first);
});


test('pond is a level surface below its bank and well separated from the path',()=>{
 const p=scene.composition.features.pond,l=scene.composition.layers.pond;
 assert.ok(p.pathClearance>8);
 assert.ok(p.center[0]<-15&&p.center[1]>10);
 const water=scene.splats.slice(l.start,l.start+l.count).filter(s=>s.material==='water');
 assert.ok(water.length>1000);
 for(const s of water){
  assert.ok(pondDistance(s.center[0],s.center[2])<1);
  assert.ok(s.center[1]>=POND.level&&s.center[1]<POND.level+.05);
 }
 assert.ok(hillsideHeight(...POND.center)<POND.level-.5);
 assert.equal(PONDS.length,3);assert.equal(ISLANDS.length,4);
 for(const island of ISLANDS){
  assert.ok(pondDistance(...island.center)>1,'islands exclude water');
  assert.ok(hillsideHeight(...island.center)>POND.level,'islands rise above the water');
 }
 assert.ok(p.waterCount>3000);assert.ok(p.flowerCount>15000);
 assert.equal(scene.reflection.level,POND.level);
});

test('low clouds are filled, all-sided billows and highlights use separate colored dots in rows',()=>{
 const layer=scene.composition.layers.lowClouds,clouds=scene.splats.slice(layer.start,layer.start+layer.count);
 assert.equal(scene.lowClouds.length,4);assert.ok(clouds.length>2000);
 for(const c of scene.lowClouds){
  const marks=clouds.filter(s=>s.wind[2]===c.phase);
  for(const axis of [0,1,2])assert.ok(Math.max(...marks.map(s=>s.center[axis]))-Math.min(...marks.map(s=>s.center[axis]))>c.radius*.65);
  for(const s of marks)for(const axis of s.axes)assert.ok(Math.hypot(...axis)>.03,'clouds have physical thickness');
 }
 const glints=scene.splats.filter(s=>s.wind?.[3]===6);
 assert.ok(glints.length>150);
 assert.ok(new Set(glints.map(s=>s.color.join(','))).size>=3);
 assert.ok(glints.every(s=>Math.hypot(...s.axes[0])<Math.hypot(...s.axes[1])*1.6));
});

test('the path has worn earth and gravel, and grass reclaims the former house site',()=>{
 const {layers,features}=scene.composition,l=layers.path;
 assert.ok(features.path.strokes>3500&&features.path.pebbles>200);
 assert.ok(features.pathGround.refined>50);
 for(const s of scene.splats.slice(l.start,l.start+l.count)){
  const [x,y,z]=s.center;
  assert.ok(Math.abs(x-pathX(z))<=pathWidth(z)*1.11,'all path marks follow the main trail');
  assert.ok(y>=hillsideHeight(x,z)&&y<hillsideHeight(x,z)+.12);
 }
 const g=layers.grassAndFlowers;
 const recovered=scene.splats.slice(g.start,g.start+g.count).filter(s=>Math.abs(s.center[0]-8)<4&&Math.abs(s.center[2]+7)<3);
 assert.ok(recovered.length>200,'former cottage footprint is meadow');
 assert.ok(layers.trees.count>12000);
});

test('forest mist follows terrain only under the groves and stays within a small fixed budget',()=>{
 const {layers,features}=scene.composition,l=layers.forestFog;
 assert.ok(l.count>100&&l.count<600);assert.equal(features.forestFog.extraRenderPasses,0);
 for(const s of scene.splats.slice(l.start,l.start+l.count)){
  const [x,y,z]=s.center,ground=hillsideHeight(x,z);
  assert.equal(s.material,'fog');assert.equal(s.noFog,true);
  assert.ok(y>ground&&y<ground+1.4);
  assert.ok(pondDistance(x,z)>1.18);assert.ok(forestMask(x,z)>.03);
  assert.ok(s.opacity>0&&s.opacity<.12);
 }
 assert.ok(features.bushes.groups>=15);assert.ok(layers.bushes.count>1800);
});

test('the meadow combines dense grass pigment with upright blades anchored above dry terrain',()=>{
 const {layers,features}=scene.composition,l=layers.grassAndFlowers;
 assert.ok(features.grass.tufts>10000);assert.ok(features.grass.blades>40000);
 assert.ok(l.count>55000&&l.count<65000);
 let upright=0;
 for(const s of scene.splats.slice(l.start,l.start+l.count)){
  assert.ok(pondDistance(s.center[0],s.center[2])>1.08);
  assert.equal(s.wind[3],2);assert.ok(s.center[1]>s.wind[0]);
  if(Math.abs(s.axes[0][1])>Math.hypot(s.axes[0][0],s.axes[0][2]))upright++;
 }
 assert.ok(features.grass.varieties.every(n=>n>500));assert.ok(features.grass.seedHeads>500);assert.ok(features.grass.pathTufts>300);
 assert.ok(upright>40000,'visible vertical blades supplement ground-hugging splats');
});

test('stone groups sit on land, island rocks stay small and shrine paper is attached to its rope',()=>{
 const {features,layers}=scene.composition;
 assert.equal(features.rocks.islandRocks,8);assert.equal(features.rocks.groups,10);
 assert.ok(features.rocks.smallRocks>=24);
 const route=createMeadowDogRoute(hillsideHeight),routePoints=[];
 for(let t=0;t<route.period;t+=.1)routePoints.push(route.pose(t).position);
 for(const rock of features.rocks.rocks){
  const [x,y,z]=rock.center;assert.ok(pondDistance(x,z)>1.1);assert.equal(y,hillsideHeight(x,z));
  if(rock.island)assert.ok(Math.max(...rock.radii)<.6);
  for(const p of routePoints)assert.ok(Math.hypot(p[0]-x,p[2]-z)>Math.max(rock.radii[0],rock.radii[2])+.8,'new fragments clear the running dog');
 }
 assert.ok(features.rocks.mossCount>500);assert.ok(features.rocks.grassCount>0);
 const f=features.toriiDecoration,l=layers.toriiDecoration;
 assert.equal(f.streamers,4);assert.ok(f.ropeCount<64);assert.ok(f.paperCount<350);
 for(const [j,anchor]of f.anchors.entries()){
  const paper=scene.splats.slice(l.start,l.start+l.count).filter(s=>s.wind?.[2]===j*1.2);
  assert.ok(paper.length>20);assert.ok(paper.some(s=>Math.abs(s.center[1]-anchor[1])<1e-8));
  assert.ok(paper.every(s=>s.wind[0]===anchor[1]&&s.wind[3]===7));
 }
});

test('moss clings to lower tree surfaces and the stone guardian has a full three-dimensional body',()=>{
 const {features,layers}=scene.composition;
 assert.equal(features.treeMoss.trees,3);assert.ok(features.treeMoss.count>500);
 const moss=scene.splats.slice(layers.treeMoss.start,layers.treeMoss.start+layers.treeMoss.count);
 assert.ok(moss.every(s=>s.material==='foliage'&&!s.wind));
 assert.ok(moss.every(s=>s.center[1]-hillsideHeight(s.center[0],s.center[2])<3.5));
 const g=features.guardian,l=layers.mossGuardian,marks=scene.splats.slice(l.start,l.start+l.count);
 assert.ok(g.mossCount>300&&g.faceCount>600);assert.ok(g.count<5500);
 for(const axis of [0,2])assert.ok(Math.max(...marks.map(s=>s.center[axis]))-Math.min(...marks.map(s=>s.center[axis]))>1.4);
 assert.ok(Math.max(...marks.map(s=>s.center[1]))>g.base[1]+g.height*.98);
 assert.ok(marks.every(s=>s.axes.every(a=>Math.hypot(...a)>0)&&!s.wind));
});

test('distant mountains replace the rear trees with solid rocky and snow-covered ridges',()=>{
 const {features,layers}=scene.composition,l=layers.mountains;
 assert.equal(layers.distantGroves,undefined);
 assert.ok(features.mountains.count>=10000&&features.mountains.count<15000);
 assert.ok(features.mountains.snowCount>500);assert.equal(features.mountains.detailCount,1800);
 assert.equal(features.mountains.detailPeaks.length,4);
 const marks=scene.splats.slice(l.start,l.start+l.count);
 assert.ok(marks.every(s=>s.center[2]<-44&&s.material==='stone'&&!s.wind));
 assert.ok(Math.max(...marks.map(s=>s.center[1]))>20);
 assert.ok(Math.max(...marks.map(s=>s.center[2]))-Math.min(...marks.map(s=>s.center[2]))>80,'the range has full depth');
 assert.ok(marks.every(s=>s.axes.every(a=>Math.hypot(...a)>0)));
});

test('the trail climbs the right hill with sparse distant rocks and much shorter grass',()=>{
 const {features,layers}=scene.composition;
 assert.ok(pathX(PATH_START)>60&&PATH_START<-75);
 assert.ok(Math.abs(pathX(PATH_JOIN-.001)-pathX(PATH_JOIN+.001))<.002);
 assert.ok(hillsideHeight(pathX(PATH_START),PATH_START)>hillsideHeight(pathX(3),3)+7);
 assert.ok(pathWidth(PATH_START)<pathWidth(3)*.3);
 assert.ok(features.path.distantStrokes>1500);
 assert.equal(features.hillRocks.rocks.length,18);assert.ok(features.hillRocks.count<700);
 for(const r of features.hillRocks.rocks){assert.ok(r.center[2]<-35);assert.ok(r.count<=50);}
 assert.ok(features.highlandStrata.count>100&&features.highlandStrata.count<800);
 const grass=scene.splats.slice(layers.grassAndFlowers.start,layers.grassAndFlowers.start+layers.grassAndFlowers.count);
 assert.ok(grass.every(s=>s.wind[1]<=.32));
 assert.ok(scene.lowClouds.slice(0,3).every(c=>c.radius<4.6));
});

test('soft mountain clouds use few volumetric marks on both sides of the ridgeline',()=>{
 const f=scene.composition.features.highClouds;
 assert.equal(f.banks,12);assert.equal(f.count,12*26);
 assert.equal(f.locations.filter(c=>c.behind).length,4);
 for(const c of f.locations)assert.ok(c.center[1]<23);
});

