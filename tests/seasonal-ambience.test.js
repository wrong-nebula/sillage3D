import test from 'node:test';
import assert from 'node:assert/strict';
import {SeasonalAmbience,seasonalAmbienceLevels} from '../src/splat/SeasonalAmbience.js';
test('seasonal ambience keeps birds in spring/summer and cicadas very quiet in summer only',()=>{
 const summer=seasonalAmbienceLevels(0,10),spring=seasonalAmbienceLevels(.81,10);
 const autumn=seasonalAmbienceLevels(.24,10),winter=seasonalAmbienceLevels(.5,10);
 assert.ok(spring.birdsong>summer.birdsong&&summer.birdsong>0);
 assert.equal(winter.birdsong,0);assert.equal(autumn.birdsong,0);
 assert.ok(summer.cicadas>0&&summer.cicadas<=.026);
 assert.equal(spring.cicadas,0);assert.equal(winter.cicadas,0);assert.equal(autumn.cicadas,0);
 assert.ok(winter['winter-wind']>.25);assert.ok(autumn['autumn-rustle']>.2);
});
test('seasonal mix loops without a level discontinuity and remains finite throughout a year',()=>{
 assert.deepEqual(seasonalAmbienceLevels(0,7),seasonalAmbienceLevels(1,7));
 for(let p=0;p<=1;p+=.001)for(const level of Object.values(seasonalAmbienceLevels(p,7)))assert.ok(Number.isFinite(level)&&level>=0&&level<.4);
});

test('birdsong gain reaches exact zero through tiny seasonal changes rather than retaining a stale target',()=>{
 const calls=[];
 const param={value:.15,setTargetAtTime(value){this.value=value;calls.push(value);},setValueAtTime(value){this.value=value;calls.push(value);},cancelScheduledValues(){}};
 const mixer=Object.create(SeasonalAmbience.prototype);
 mixer.layers=new Map([['birdsong',{gain:{gain:param},target:.15}]]);mixer.context={currentTime:1};mixer.reveal=1;
 for(let p=0;p<=.5;p+=.0001)mixer.update(p,10);
 assert.equal(mixer.layers.get('birdsong').target,0);assert.equal(param.value,0);
 for(let p=.5;p<=.74;p+=.001)assert.equal(seasonalAmbienceLevels(p,7).birdsong,0);
 assert.ok(calls.length>10);
});
