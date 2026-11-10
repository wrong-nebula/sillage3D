import test from 'node:test';
import assert from 'node:assert/strict';
import {ReefSequence, REEF_FIRST_NIGHT, REEF_CYCLE_SECONDS} from '../src/splat/ReefSequence.js';

test('reef waits for assets, then draws sand, rocks, coral, and fish in order',()=>{
  const sequence=new ReefSequence();
  sequence.advance(0);sequence.advance(5000);
  assert.equal(sequence.time,0);
  assert.equal(sequence.exposure,0);
  assert.deepEqual([...sequence.stages],[0,0,0,0]);
  sequence.setReady();sequence.advance(5000);sequence.advance(7000);
  assert.equal(sequence.time,2);
  assert.ok(sequence.stages[0]>0&&sequence.stages[0]<1);
  assert.deepEqual([...sequence.stages.slice(1)],[0,0,0]);
  sequence.seek(5);
  assert.equal(sequence.stages[0],1);
  assert.ok(sequence.stages[1]>0&&sequence.stages[1]<1);
  assert.deepEqual([...sequence.stages.slice(2)],[0,0]);
  sequence.seek(9);
  assert.deepEqual([...sequence.stages.slice(0,2)],[1,1]);
  assert.ok(sequence.stages[2]>0&&sequence.stages[2]<1);
  assert.equal(sequence.stages[3],0);
  sequence.seek(11.5);
  assert.deepEqual([...sequence.stages.slice(0,3)],[1,1,1]);
  assert.equal(sequence.stages[3],.5);
  sequence.seek(12);
  assert.deepEqual([...sequence.stages],[1,1,1,1]);
});

test('reef holds daylight then smoothly alternates every twenty seconds without drift',()=>{
  const sequence=new ReefSequence();
  sequence.seek(REEF_FIRST_NIGHT);
  assert.equal(sequence.nightAmount,0);
  sequence.seek(REEF_FIRST_NIGHT+1.5);
  assert.equal(sequence.nightAmount,.5);
  for(let phase=0;phase<8;phase++){
    sequence.seek(REEF_FIRST_NIGHT+phase*REEF_CYCLE_SECONDS+3);
    assert.equal(sequence.nightAmount,phase%2?0:1);
  }
});

test('manual lighting holds for twenty seconds and replay starts black again',()=>{
  const sequence=new ReefSequence();
  sequence.seek(35);sequence.setNight(false);
  assert.equal(sequence.nightAmount,0);
  sequence.seek(54);assert.equal(sequence.nightAmount,0);
  sequence.seek(58);assert.equal(sequence.nightAmount,1);
  sequence.replay();
  assert.equal(sequence.exposure,0);
  assert.equal(sequence.nightAmount,0);
  assert.deepEqual([...sequence.stages],[0,0,0,0]);
});

test('reduced motion opens with the complete daylight scene',()=>{
  const sequence=new ReefSequence({reducedMotion:true});
  sequence.setReady();sequence.advance(0);sequence.advance(40000);
  assert.equal(sequence.playing,false);
  assert.deepEqual([...sequence.stages],[1,1,1,1]);
  assert.equal(sequence.exposure,1);
  assert.equal(sequence.nightAmount,0);
});
