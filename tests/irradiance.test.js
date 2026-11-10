import test from 'node:test';
import assert from 'node:assert/strict';
import {bakeIrradiance,srgbToLinear,linearToSrgb} from '../src/splat/irradiance.js';

function surfel(center,normal,color,material='stone',size=.32){
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const normalize=a=>{const d=Math.hypot(...a);return a.map(x=>x/d);};
  const n=normalize(normal),u=normalize(cross(n,Math.abs(n[1])>.9?[1,0,0]:[0,1,0])),v=cross(n,u);
  return {center,axes:[u.map(x=>x*size),v.map(x=>x*size),n.map(x=>x*.025)],color,opacity:1,seed:.5,material};
}
function floor(color=[.12,.75,.08],y=0){
  const marks=[];
  for(let x=-5;x<=5;x+=.45)for(let z=-5;z<=5;z+=.45)marks.push(surfel([x,y,z],[0,1,0],color,'grass'));
  return marks;
}
function receiverIrradiance(sources,position,normal){
  const data=[...sources,surfel(position,normal,[.6,.6,.6])];
  const result=bakeIrradiance(data,{cellSize:.35,rays:32,maxDistance:6});
  return Array.from(result.irradiance.slice(-3));
}

test('sRGB conversion is linear-light and round-trips',()=>{
  assert.ok(Math.abs(srgbToLinear(.5)-.21404114048223255)<1e-10);
  for(const v of [0,.02,.2,.5,.9,1])assert.ok(Math.abs(linearToSrgb(srgbToLinear(v))-v)<1e-10);
});

test('a neutral receiver picks up actual green ground radiance',()=>{
  const rgb=receiverIrradiance(floor(),[0,1,0],[1,0,0]);
  assert.ok(rgb[1]>.015,`expected noticeable grass bounce, got ${rgb}`);
  assert.ok(rgb[1]>rgb[0]*8&&rgb[1]>rgb[2]*8,`expected green source hue, got ${rgb}`);
});

test('receiver orientation and distance control the same source contribution',()=>{
  const source=floor(),toward=receiverIrradiance(source,[0,1,0],[0,-1,0]);
  const away=receiverIrradiance(source,[0,1,0],[0,1,0]);
  const distant=receiverIrradiance(source,[0,4,0],[0,-1,0]);
  assert.ok(toward[1]>away[1]+.05,`${toward} vs ${away}`);
  assert.ok(toward[1]>distant[1]*2,`${toward} vs ${distant}`);
});

test('an intervening opaque surface blocks colored ground transport',()=>{
  const ground=floor(),unblocked=receiverIrradiance(ground,[0,1.3,0],[0,-1,0]);
  const blocked=receiverIrradiance([...ground,...floor([0,0,0],.55)],[0,1.3,0],[0,-1,0]);
  assert.ok(unblocked[1]>.05);
  assert.ok(blocked[1]<unblocked[1]*.08,`${blocked} should be occluded relative to ${unblocked}`);
});

test('a red wall transfers red instead of using a fixed grass tint',()=>{
  const wall=[];
  for(let y=-3;y<=5;y+=.45)for(let z=-5;z<=5;z+=.45)wall.push(surfel([2,y,z],[-1,0,0],[.85,.08,.04]));
  const rgb=receiverIrradiance(wall,[0,1,0],[1,0,0]);
  assert.ok(rgb[0]>.05&&rgb[0]>rgb[1]*12&&rgb[0]>rgb[2]*12,`${rgb}`);
});

test('bake is deterministic, finite, bounded and does not change authored pigment',()=>{
  const input=[...floor(),surfel([0,1,0],[1,0,0],[.6,.6,.6])],before=JSON.stringify(input);
  const first=bakeIrradiance(input),second=bakeIrradiance(input);
  assert.deepEqual(first.irradiance,second.irradiance);
  assert.equal(JSON.stringify(input),before);
  assert.ok(first.irradiance.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  assert.ok(first.stats.voxelCount>0&&first.stats.gridCells<=2_000_000);
});

test('clouds and ground fog neither inflate voxel bounds nor become solid bounce occluders',()=>{
  const source=floor(),plain=bakeIrradiance(source);
  const cloudy=bakeIrradiance([...source,surfel([1e5,1e5,1e5],[0,-1,0],[1,1,1],'cloud'),surfel([0,.3,0],[0,1,0],[.8,.9,.9],'fog')]);
  assert.equal(cloudy.stats.gridCells,plain.stats.gridCells);
  assert.deepEqual(Array.from(cloudy.irradiance.slice(-3)),[0,0,0]);
  assert.deepEqual(cloudy.irradiance.slice(0,plain.irradiance.length),plain.irradiance);
  assert.deepEqual(cloudy.shadow.slice(0,plain.shadow.length),plain.shadow);
});

test('large worlds respect the allocation budget and empty input is supported',()=>{
  const distant=[surfel([-1000,0,0],[0,1,0],[.4,.8,.3]),surfel([1000,0,0],[0,1,0],[.4,.8,.3])];
  const result=bakeIrradiance(distant,{maxCells:1000});
  assert.ok(result.stats.gridCells<=1000);
  assert.ok(result.irradiance.every(Number.isFinite));
  assert.equal(bakeIrradiance([]).irradiance.length,0);
  assert.throws(()=>bakeIrradiance([],{cellSize:NaN}),/positive and finite/);
});

test('geometry casts directional shadow onto ground, while open ground stays lit',()=>{
  const ground=floor(),receiver=surfel([0,0,0],[0,1,0],[.3,.65,.1],'grass');
  const options={cellSize:.35,sunDirection:[0,1,0],shadowDistance:10,shadowRays:5};
  const clear=bakeIrradiance([...ground,receiver],options);
  const ceiling=floor([.15,.4,.1],2).map(s=>({...s,material:'foliage'}));
  const covered=bakeIrradiance([...ground,...ceiling,receiver],options);
  assert.ok(clear.shadow.at(-1)<.05,`${clear.shadow.at(-1)} should be lit`);
  assert.ok(covered.shadow.at(-1)>.95,`${covered.shadow.at(-1)} should be under the canopy`);
});

test('sun-facing orientation tints the unlit side without depending on pigment brightness',()=>{
  const sun=[-.8,1.1,.7],length=Math.hypot(...sun),n=sun.map(v=>v/length);
  const facing=surfel([0,0,0],n,[.02,.02,.02]);
  const away=surfel([0,0,0],n.map(v=>-v),[1,1,1]);
  assert.ok(bakeIrradiance([facing]).shadow[0]<.01);
  assert.ok(bakeIrradiance([away]).shadow[0]>.99);
});

test('shadow bake is deterministic, finite, excludes clouds and leaves RGB transport unchanged',()=>{
  const input=[...floor(),surfel([0,1,0],[1,0,0],[.5,.5,.5]),surfel([1,3,0],[0,-1,0],[1,1,1],'cloud')];
  const first=bakeIrradiance(input),second=bakeIrradiance(input);
  assert.deepEqual(first.shadow,second.shadow);
  assert.ok(first.shadow.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
  assert.equal(first.shadow.at(-1),0);
  const otherSun=bakeIrradiance(input,{sunDirection:[.8,1,-.7],shadowRays:1});
  assert.deepEqual(first.irradiance,otherSun.irradiance);
  assert.equal(first.stats.shadowRays,5);
  assert.ok(first.stats.shadowTests>0);
});
