import test from 'node:test';
import assert from 'node:assert/strict';
import {panoramaAnchor,panoramaProject,PANORAMA_CAMERA,addPanoramaModels} from '../src/splat/ForestPanorama.js';
import {upperWaterContains,lowerReachContains,FOREST_CASCADES,FALL_RUN,FALL_DEPTH,OPENING_OFFSET,openingPoint,fallSurfaceHeight,fallSurfacePoint,lipBend,forestHeadwaterHeight} from '../src/splat/ForestWaterfalls.js';
import {readFileSync} from 'node:fs';
test('mirrored panorama anchors retain framing and left-right placement',()=>{
  assert.equal(PANORAMA_CAMERA.aspect,1079/284);
  for(const [x,y,h] of [[766,237,8.1],[411,218,0],[958,151,8.1],[159,284,0]]){
    const p=panoramaAnchor(x,y,h),q=panoramaProject(p);
    assert.ok(Math.abs(x-q[0])<1e-7&&Math.abs(y-q[1])<1e-7);
    assert.ok(Math.abs(p[1]-h)<1e-7);
  }
  const rim=panoramaAnchor(766,237,0),branch=panoramaAnchor(411,218,0);
  assert.ok(rim[0]<branch[0],'deep pool remains on screen-right in the mirrored camera');
  assert.ok(lowerReachContains(rim[0],rim[2]));
});
test('distinct cascades follow their reference anchors and split around several trunks',()=>{
  assert.ok(FOREST_CASCADES.length>=10);
  for(const c of FOREST_CASCADES){
    const x=(c.near+c.far)/2,p=fallSurfacePoint(c,x,0),q=fallSurfacePoint(c,x,1);
    assert.ok(c.lipZ>=c.referenceLipZ,'higher terraces extend upstream, leaving the landing fixed');
    assert.ok(-c.flow[1]>=1.55*(c.top-c.bottom)-1e-8,'there is enough run for a rounded shoulder');
    p[1]=c.referenceTop;p[2]=c.referenceLipZ;q[1]=c.referenceBottom;
    const a=panoramaProject(p),b=panoramaProject(q);
    assert.ok(Math.hypot(...a.map((v,i)=>v-c.from[i]))<1e-7);
    assert.ok(Math.hypot(...b.map((v,i)=>v-c.to[i]))<1e-7);
    for(const parent of c.parents)assert.equal(FOREST_CASCADES[parent].bottom,c.top);
  }
  const sources=new Set();
  function follow(i,seen=new Set()){
    assert.ok(!seen.has(i),'cascade network is acyclic');seen.add(i);
    const c=FOREST_CASCADES[i];if(!c.parents.length){sources.add(i);assert.equal(c.top,12.6);}
    for(const parent of c.parents)follow(parent,new Set(seen));
  }
  FOREST_CASCADES.forEach((_,i)=>follow(i));assert.ok(sources.size>=3);
  assert.ok(!FOREST_CASCADES.some(c=>c.id.startsWith('rear-stump-')),'the isolated far-right cascade pair was removed');
});
test('reference layout contains dedicated rim and branch models plus submerged chunks',()=>{
  const source=Object.fromEntries(JSON.parse(readFileSync(new URL('../public/blue-forest/models.json',import.meta.url))).assets.map(a=>[a.slug,a]));
  source.rim_trunk??={dimensions:[.8,1,.8]};
  const calls=[],layers=[];const anchors=addPanoramaModels({source,model:(...args)=>calls.push(args),layer:(name,fn)=>{layers.push(name);fn();}});
  assert.ok(anchors.some(a=>a.slug==='rim_trunk'&&a.pixel[0]===766));
  assert.ok(anchors.some(a=>a.slug==='branch_trunk'&&a.pixel[0]===411));
  assert.ok(calls.filter(c=>c[0]==='fallen_log'&&c[6]<c[9]-4).length>=4);
  assert.deepEqual(layers,['panoramaTrunks','panoramaFallen','submergedTrunks','upstreamBackground']);
  assert.ok(calls.every(c=>c.slice(1).every(Number.isFinite)));
});

test('the intact original opening is rigidly placed on the shallow upper reach',()=>{
  const a=[-7.5,.12,1.2],b=[7,.24,-7],pa=openingPoint(a),pb=openingPoint(b);
  assert.ok(Math.abs(Math.hypot(...a.map((v,i)=>v-b[i]))-Math.hypot(...pa.map((v,i)=>v-pb[i])))<1e-9);
  assert.equal(pa[1],a[1]+12.6);assert.equal(OPENING_OFFSET[1],12.6);
  const water=openingPoint([0,0,12]);assert.ok(upperWaterContains(water[0],water[2]));assert.ok(!lowerReachContains(water[0],water[2]));
});

test('waterfalls have raised curved crests and continuous three-dimensional landings',()=>{
  const c=FOREST_CASCADES[0],x=(c.near+c.far)/2;
  assert.equal(fallSurfaceHeight(x,0,c.top,c.bottom),c.top);
  assert.ok(Math.abs(fallSurfaceHeight(x,1,c.top,c.bottom)-c.bottom)<1e-8);
  assert.ok(fallSurfaceHeight(x,.25,c.top,c.bottom)>c.top+.2);
  const crossSection=Array.from({length:11},(_,i)=>fallSurfaceHeight(c.near+(c.far-c.near)*i/10,.4,c.top,c.bottom));
  assert.ok(Math.max(...crossSection)-Math.min(...crossSection)>.1,'broad uneven shoulders, rather than repeated small ridges');
  for(const c of FOREST_CASCADES){
    const x=(c.near+c.far)/2,a=fallSurfacePoint(c,x,0),b=fallSurfacePoint(c,x,1);
    assert.ok(a.every(Number.isFinite)&&b.every(Number.isFinite));assert.ok(Math.abs(a[1]-c.top)<1e-8);assert.ok(Math.abs(b[1]-c.bottom)<1e-8);
    for(const u of [.2,.4,.6,.8])assert.ok(fallSurfaceHeight(x,u,c.top,c.bottom)>c.top+(c.bottom-c.top)*u,'the face bows outward above its endpoint chord');
  }
});
