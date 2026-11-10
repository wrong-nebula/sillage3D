import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4} from 'three';
import {CourierBlink} from '../src/splat/CourierBlink.js';
const regions=[-1,1].map(x=>({center:[x,0,0],horizontal:[1,0,0],vertical:[0,1,0],normal:[0,0,1],radius:[.4,.4]}));
const make=()=>new CourierBlink([{restCenter:[-1,0,0]},{restCenter:[1,0,0]},{restCenter:[0,-1,0]}],regions,new Matrix4());
test('blinking affects both eyes without moving face samples or changing the body',()=>{
  const blink=make(),splats=[0,1,2].map(()=>({center:[1,2,3],axes:[[1,0,0],[0,1,0],[0,0,1]],color:[.9,.8,.7]}));
  blink.forced=1;blink.advance(0);blink.apply(splats);assert.deepEqual(blink.snapshot().perEye,[1,1]);
  assert.notDeepEqual(splats[0].color,[.9,.8,.7]);assert.notDeepEqual(splats[1].color,[.9,.8,.7]);assert.deepEqual(splats[2].color,[.9,.8,.7]);
  splats.forEach(s=>assert.deepEqual(s.center,[1,2,3]));
});
test('natural blinks close briefly, reopen, pause, and include occasional doubles',()=>{
  const blink=make(),starts=[];let closed=false;
  for(let i=0;i<60*60;i++){blink.advance(1/60);assert.ok(blink.value>=0&&blink.value<=1);if(blink.value>.9&&!closed)starts.push(blink.time);closed=blink.value>.9;}
  assert.ok(starts.length>8&&starts.length<20);assert.ok(starts.some((t,i)=>i&&t-starts[i-1]<.6));
  const value=blink.value;blink.advance(0);assert.equal(blink.value,value);
});

test('gaze moves both pupils across their fixed eye surfaces and closes under the lids',()=>{
  const samples=[];
  for(const x of [-1,1])for(let u=-.8;u<=.8;u+=.2)for(let v=-.8;v<=.8;v+=.2)samples.push({restCenter:[x+u*.4,v*.4,0],pigment:Math.hypot(u,v)<.3?[.025,.025,.025]:[.9,.83,.72]});
  const blink=new CourierBlink(samples,regions,new Matrix4());
  const render=x=>{const splats=samples.map(s=>({center:s.restCenter.slice(),axes:[[1,0,0],[0,1,0],[0,0,1]],color:s.pigment.slice()}));blink.forcedGaze={x,y:0};blink.advance(0);blink.apply(splats);return splats;};
  const left=render(-.2),highlights=blink.highlights.map(s=>s.center.slice()),right=render(.2);
  assert.ok(blink.highlights.every(s=>s.opacity>.8&&s.color.every(v=>v===1)));
  assert.ok(blink.highlights.every((s,i)=>Math.hypot(...s.center.map((v,k)=>v-highlights[i][k]))>.01));
  for(let eye=0;eye<2;eye++){
    const center=splats=>{const ink=blink.points.filter(p=>p.eye===eye&&splats[p.index].color[0]<.2);return ink.reduce((sum,p)=>sum+p.u,0)/ink.length;};
    assert.ok(center(right)-center(left)>.25);
  }
  samples.forEach((s,i)=>assert.deepEqual(left[i].center,right[i].center));
  blink.forced=1;const closed=render(.2);assert.ok(closed.some((s,i)=>s.color[0]!==right[i].color[0]));assert.ok(blink.highlights.every(s=>s.opacity===0));
});

test('pupil ink stays in front of sparse white eye samples and disappears under closed lids',()=>{
  const samples=[];
  for(const x of [-1,1])for(const u of [-.6,0,.6])for(const v of [-.6,0,.6]){
    samples.push({restCenter:[x+u*.4,v*.4,.025*(1-u*u-v*v)],pigment:[.93,.85,.76]});
  }
  const blink=new CourierBlink(samples,regions,new Matrix4());
  const pose=transform=>samples.map(s=>({
    center:transform(...s.restCenter),axes:[[1,0,0],[0,1,0],[0,0,1]],color:s.pigment.slice(),
  }));
  blink.apply(pose((x,y,z)=>[x,y,z]));
  const dabs=blink.ink.flat(),opened=dabs.map(s=>s.center.slice());
  assert.ok(dabs.every(s=>s.opacity===1&&s.color.every(c=>c<.03)&&s.center[2]>.025));
  blink.apply(pose((x,y,z)=>[z+2,y+3,4-x]));
  dabs.forEach((s,i)=>{
    const [x,y,z]=opened[i],expected=[z+2,y+3,4-x];
    assert.ok(s.center.every((v,k)=>Math.abs(v-expected[k])<1e-9));
  });
  blink.forced=1;blink.advance(0);blink.apply(pose((x,y,z)=>[x,y,z]));
  assert.ok(blink.splats.every(s=>s.opacity===0));
  blink.forced=0;blink.advance(0);blink.apply(pose((x,y,z)=>[x,y,z]));
  assert.ok(dabs.every(s=>s.opacity===1));
});
