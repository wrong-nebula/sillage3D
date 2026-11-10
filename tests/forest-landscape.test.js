import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadForestLandscape,forestLandscapeSample as sample,forestLandscapeHeight as height,forestLandscapeWater as water,forestLandscapeOpacity as opacity} from '../src/splat/ForestLandscape.js';
import {FOREST_CASCADES} from '../src/splat/ForestWaterfalls.js';
import {createForestSediment} from '../src/splat/ForestSediment.js';
const asset=name=>new URL(`../public/blue-forest/${name}`,import.meta.url);
await loadForestLandscape(async path=>new Response(await readFile(new URL(`../public${path}`,import.meta.url))));

test('the scene consumes the verified 2049 LibreTerrain height and useful native maps',async()=>{
  const meta=JSON.parse(await readFile(asset('landscape.json'))),heightBytes=await readFile(asset('landscape-height.f32'));
  assert.equal(meta.resolution,2049);assert.equal(heightBytes.length,2049*2049*4);
  assert.equal(createHash('sha256').update(heightBytes).digest('hex'),meta.height_sha256);
  assert.deepEqual(meta.water_levels,[0,12.6]);
  for(const stat of meta.mask_stats){assert.ok(stat.max>stat.min,`${stat.name} carries spatial information`);assert.ok(stat.nonzero>100,`${stat.name} has useful coverage`);}
  for(let x=-130;x<-10;x+=4.7)for(let z=-60;z<125;z+=5.3){
    for(let channel=8;channel<16;channel++){const v=sample(x,z,channel);assert.ok(v>=0&&v<=1);}
    assert.ok(Math.abs(height(x-1e-5,z)-height(x+1e-5,z))<.01,'the full-resolution height interpolates continuously');
  }
});

test('the two water datums have real depth and the downstream basin has an open fading edge',()=>{
  assert.equal(water(-58,87),1);assert.ok(height(-58,87)<11.5);assert.ok(Math.abs(sample(-58,87,7)-12.6)<1e-5);
  assert.equal(water(-80,-10),2);assert.ok(height(-80,-10)<-8);assert.equal(sample(-80,-10,7),0);
  for(const x of [-125,-100,-75,-50,-25])for(const z of [-70,-50,-30])assert.ok(height(x,z)<0,'no enclosing downstream wall');
  assert.equal(opacity(-66,60),1);assert.ok(opacity(-66,-85)<opacity(-66,-50));assert.equal(opacity(-66,-105),0);
  assert.equal(water(-140,25),0,'upper lake does not spill sideways over the terrace slope');
});

test('modeled waterfall outlets join the lower basin and headwaters reach the upper lake',()=>{
  const nearby=(x,z,kind)=>{
    for(let dx=-2;dx<=2;dx+=.5)for(let dz=-2;dz<=2;dz+=.5)if(water(x+dx,z+dz)===kind)return true;
    return false;
  };
  for(const c of FOREST_CASCADES){
    const mid=(c.near+c.far)/2;
    if(c.top===12.6)assert.ok(nearby(mid,c.lipZ+2,1),`${c.id} has a connected high inlet`);
    if(c.bottom<.2)assert.ok(nearby(mid+c.flow[0],c.lipZ+c.flow[1]-2,2),`${c.id} drains into low water`);
  }
});

test('soft deposits add relief on dry banks without filling water or waterfall channels',()=>{
  const sediment=createForestSediment();
  assert.ok(sediment.piles.length>=20);
  for(const p of sediment.piles){
    assert.equal(sample(p.x,p.z,6),0);
    assert.ok(sediment.height(p.x,p.z)>.01);
    assert.ok(Math.abs(sediment.height(p.x-1e-5,p.z)-sediment.height(p.x+1e-5,p.z))<.001);
  }
  let wetSamples=0;
  for(let x=-140;x<8;x+=1.7)for(let z=-40;z<127;z+=1.9){
    const added=sediment.height(x,z);
    assert.ok(Number.isFinite(added)&&added>=0&&added<3);
    if(sample(x,z,6)!==0){assert.equal(added,0);wetSamples++;}
  }
  assert.ok(wetSamples>1000);
});
