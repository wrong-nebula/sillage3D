import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {readFile} from 'node:fs/promises';
import {reefFlowCoordinates} from '../src/splat/ReefFlow.js';
import {packSplats} from '../src/splat/math.js';

test('vascular arrival times stay connected at forks and slow in narrow branches',()=>{
  const root=[0,0,1],fork=[0,1,1],wide=[1,2,1],narrow=[-1,2,.001];
  const paths=[[root,fork],[fork,wide],[fork,narrow]];
  const flow=reefFlowCoordinates(paths,([x,y])=>new Vector3(x,y,0));
  assert.equal(flow(root),0);
  assert.ok(flow(fork)>0&&flow(fork)<flow(wide));
  assert.ok(flow(wide)<flow(narrow));
  assert.equal(flow(narrow),1);
  const reversed=reefFlowCoordinates([...paths].reverse(),([x,y])=>new Vector3(x,y,0));
  for(const node of [root,fork,wide,narrow])assert.equal(flow(node),reversed(node));
});

test('the actual LibreTerrain vascular tree fills monotonically from a single root',async()=>{
  const paths=JSON.parse(await readFile(new URL('../public/hollow-reef/branches.json',import.meta.url)));
  const flow=reefFlowCoordinates(paths,([x,y])=>new Vector3(x,y,0));
  const roots=new Set();
  for(const path of paths)for(let i=0;i<path.length;i++){
    const value=flow(path[i]);
    assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
    if(value===0)roots.add(path[i].slice(0,2).join(','));
    if(i)assert.ok(value>flow(path[i-1]));
  }
  assert.equal(roots.size,1);
});

test('coral transit data survives packing without changing geometry or color',()=>{
  const mark={center:[1,2,3],axes:[[.1,0,0],[0,.1,0],[0,0,.01]],color:[.8,.4,.3],opacity:.97,seed:.2,reefGlow:2,reefFlow:[.37,0,0]};
  const {data}=packSplats([mark],1024,new Float32Array(3));
  assert.ok(Math.abs(data[7]-.37)<1e-6);
  assert.deepEqual([...data.slice(0,3)],mark.center);
  for(let channel=0;channel<3;channel++)assert.ok(Math.abs(data[16+channel]-mark.color[channel])<1e-6);
  assert.ok(data[19]>=9&&data[19]<10);
});
