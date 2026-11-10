import test from 'node:test';
import assert from 'node:assert/strict';
import {foregroundDefocus,DOF_DEFAULTS} from '../src/splat/ForegroundDOF.js';

test('camera defocus leaves the subject sharp and softens both nearer and more distant surfaces',()=>{
  const options={...DOF_DEFAULTS,foregroundDOF:true};
  assert.equal(foregroundDefocus(10,10,options),0);assert.equal(foregroundDefocus(100,10,options),.325);
  assert.equal(foregroundDefocus(1,10,options),.65);
  let last=.65;
  for(let depth=0;depth<=10;depth+=.01){
    const amount=foregroundDefocus(depth,10,options);
    assert.ok(amount<=last+1e-12&&last-amount<.002);last=amount;
  }
});

test('disabled and zero-strength blur are identity; reach and strength control defocus',()=>{
  assert.equal(foregroundDefocus(1,10,DOF_DEFAULTS),0);
  assert.equal(foregroundDefocus(1,10,{foregroundDOF:true,dofStrength:0}),0);
  for(const distance of [0,-1,NaN,Infinity])assert.equal(foregroundDefocus(1,distance,{foregroundDOF:true}),0);
  const narrow=foregroundDefocus(5,10,{foregroundDOF:true,dofRange:.4});
  const broad=foregroundDefocus(5,10,{foregroundDOF:true,dofRange:.9});
  assert.equal(narrow,0);assert.ok(broad>0);
  assert.equal(foregroundDefocus(1,10,{foregroundDOF:true,dofStrength:1}),1);
});
