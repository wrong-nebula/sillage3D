import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3} from 'three';
import {CameraFocus} from '../src/splat/CameraFocus.js';
const splat=(x,z,size=.3,extra={})=>({center:[x,0,z],axes:[[size,0,0],[0,size,0],[0,0,size*.05]],opacity:1,...extra});
const camera=()=>{const c=new PerspectiveCamera(40,1.6,.08,600);c.lookAt(0,0,-10);return c;};
const options={foregroundDOF:true,autoFocus:true,height:1000,brushScale:1};

test('autofocus meters the visible foreground subject instead of the orbit target or hidden background',()=>{
  const f=new CameraFocus(),c=camera();f.setScene([splat(0,-3),splat(0,-12,1),splat(0,-1,2,{noFog:true})]);
  assert.equal(f.meter(c).distance,3);f.update(c,options,0,20);assert.equal(f.current,3);
  c.position.set(0,0,1);c.lookAt(0,0,-10);f.update(c,options,16,20);
  assert.equal(f.target,4);assert.ok(f.current>3&&f.current<4);
});

test('click metering can pick an off-center plant and a held point follows camera-space depth',()=>{
  const f=new CameraFocus(),c=camera();f.setScene([splat(0,-10,1),splat(1,-3)]);
  const ndc=new Vector3(1,0,-3).project(c),hit=f.meter(c,{x:ndc.x,y:ndc.y,click:true});
  assert.equal(hit.distance,3);assert.deepEqual(hit.point.toArray(),[1,0,-3]);
  f.hold(hit.point);f.update(c,{...options,autoFocus:false},0,10);assert.equal(f.current,3);
  c.position.z=2;c.updateMatrixWorld(true);f.update(c,{...options,autoFocus:false},16,10);assert.equal(f.target,5);
});

test('focus pulls converge smoothly without overshoot, survive gaps, and stop requesting frames',()=>{
  const f=new CameraFocus(),c=camera();f.setScene([splat(0,-8,1)]);f.update(c,options,0,20);
  f.hold(new Vector3(0,0,-2));let last=f.current;
  for(let time=16;time<=2000;time+=16){f.update(c,{...options,autoFocus:false},time,20);assert.ok(f.current<=last&&f.current>=2);last=f.current;}
  assert.equal(f.current,2);assert.equal(f.moving,false);
  f.release();c.lookAt(50,0,0);f.update(c,options,2100,20);assert.equal(f.target,2);
  f.setScene([]);f.update(c,options,2200,15);assert.equal(f.current,15);
});

test('an idle camera begins its next focus pull without an initial jump',()=>{
  const f=new CameraFocus(),c=camera();f.setScene([splat(0,-8,1)]);f.update(c,options,0,20);
  f.hold(new Vector3(0,0,-2));f.update(c,{...options,autoFocus:false},5000,20);
  assert.equal(f.current,8);assert.equal(f.target,2);assert.equal(f.moving,true);
  f.update(c,{...options,autoFocus:false},5016,20);assert.ok(f.current<8&&f.current>7.8);
});

test('disabled depth of field performs no focus metering',()=>{
  const f=new CameraFocus(),c=camera();f.setScene([splat(0,-8,1)]);
  f.meter=()=>{throw new Error('unnecessary metering');};
  f.update(c,{...options,foregroundDOF:false},0,15);assert.equal(f.current,15);assert.equal(f.moving,false);
});

test('slow GPU frames cannot freeze an active focus pull',()=>{
  const f=new CameraFocus(),c=camera();f.setScene([splat(0,-8,1)]);f.update(c,options,0,20);
  f.hold(new Vector3(0,0,-2));
  for(let time=1000;time<=15000;time+=400)f.update(c,{...options,autoFocus:false},time,20);
  assert.equal(f.current,2);assert.equal(f.moving,false);
});
