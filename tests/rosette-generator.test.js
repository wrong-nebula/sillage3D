import test from 'node:test';
import assert from 'node:assert/strict';
import {generateLandGenome,landRandom} from '../src/splat/moebius/land-flora-genome.js';
import {createRosetteAnatomy,leafPoint,leafSample,leafMarginSample,rosetteGrowth,dot,sub} from '../src/splat/rosetteAnatomy.js';
import {buildRosetteMesh} from '../src/splat/rosetteMesh.js';
import {sampleRosetteSplats} from '../src/splat/rosetteSplats.js';
const genome=generateLandGenome('coral-dune-rosette',73579,{age:1,wind:.6,moisture:.3});
const anatomy=createRosetteAnatomy(genome);

test('seeded rosette organs preserve identity, nested ages, and buried stem attachments',()=>{
  assert.deepEqual(createRosetteAnatomy(genome),anatomy);
  assert.notDeepEqual(createRosetteAnatomy(generateLandGenome(genome.species,73580,{age:1})).leaves.map(l=>l.width),anatomy.leaves.map(l=>l.width));
  assert.equal(anatomy.leaves.length,genome.branches);
  for(const leaf of anatomy.leaves){
    assert.ok(leaf.root[1]>0&&leaf.root[1]<anatomy.stemHeight);
    const stemRadius=anatomy.stemRadius*(1-.34*leaf.root[1]/anatomy.stemHeight);
    assert.ok(Math.hypot(leaf.root[0],leaf.root[2])<stemRadius);
    assert.ok(leaf.thickness>0&&leaf.width>leaf.thickness*8);
  }
  assert.ok(anatomy.leaves[0].roll>anatomy.leaves.at(-1).roll*5);
  assert.ok(anatomy.leaves[0].birth>anatomy.leaves.at(-1).birth);
  const juvenile=generateLandGenome(genome.species,genome.seed,{age:.16});
  assert.ok(createRosetteAnatomy(juvenile).leaves.length<anatomy.leaves.length);
  assert.ok(juvenile.height<genome.height*.5);
});

test('two outward leaf tissues retain physical separation, tapered tips, and connected margins',()=>{
  for(const leaf of anatomy.leaves)for(const v of [.08,.3,.6,.9])for(const u of [.1,.35,.5,.8]){
    const top=leafSample(leaf,u,v,1),bottom=leafSample(leaf,u,v,-1),separation=sub(top.point,bottom.point);
    assert.ok(Math.hypot(...separation)>1e-6);
    assert.ok(dot(top.normal,separation)>0);
    assert.ok(dot(bottom.normal,separation)<0);
    assert.ok(Math.abs(Math.hypot(...top.normal)-1)<1e-8);
    assert.ok(Math.abs(dot(top.normal,top.tangent))<1e-8);
  }
  for(const leaf of anatomy.leaves){
    const body=Math.hypot(...sub(leafPoint(leaf,1,.4),leafPoint(leaf,0,.4)));
    const tip=Math.hypot(...sub(leafPoint(leaf,1,1),leafPoint(leaf,0,1)));
    assert.ok(tip<body*.01);
    for(const edge of [0,1]){
      const lower=leafMarginSample(leaf,edge,.5,0).point,upper=leafMarginSample(leaf,edge,.5,1).point;
      assert.ok(Math.hypot(...sub(lower,leafPoint(leaf,edge,.5,-1)))<1e-8);
      assert.ok(Math.hypot(...sub(upper,leafPoint(leaf,edge,.5,1)))<1e-8);
    }
  }
});

test('per-organ unfolding retains stem contact throughout growth and reaches the authored master',()=>{
  const anchor=[2,.31,-3],height=genome.height;
  for(const leaf of anatomy.leaves){
    const root=leaf.root.map((v,i)=>v+anchor[i]),organ=[...root,leaf.birth];
    for(const age of [.015,.15,.35,.6,1]){
      const support=rosetteGrowth(root,anchor,height,age),attachment=rosetteGrowth(root,anchor,height,age,organ);
      assert.ok(Math.hypot(...sub(support,attachment))<1e-8);
    }
    const point=leafSample(leaf,.5,.7).point.map((v,i)=>v+anchor[i]);
    assert.ok(Math.hypot(...sub(point,rosetteGrowth(point,anchor,height,1,organ)))<1e-8);
  }
});

test('analytic splat budgets include both tissues, rounded margins and stem, with stable samples',()=>{
  const options={genome,anchor:[0,0,0],scale:1,yaw:0,count:15000};
  const a=sampleRosetteSplats({...options,rnd:landRandom(14)}),b=sampleRosetteSplats({...options,rnd:landRandom(14)});
  assert.equal(a.splats.length,15000);assert.deepEqual(a.splats,b.splats);
  for(const leaf of anatomy.leaves){
    for(const surface of ['upper','lower','margin'])assert.ok(a.splats.some(s=>s.anatomy.organ===leaf.id&&s.anatomy.surface===surface));
  }
  for(const s of a.splats){
    assert.ok(s.center.every(Number.isFinite)&&s.axes.flat().every(Number.isFinite));
    assert.ok(s.color.every(c=>c>=0&&c<=1));
    assert.ok(Math.hypot(...s.axes[2])<Math.hypot(...s.axes[0])*.2);
    assert.ok(!s.softParticle&&!s.sandGlint&&s.material==='foliage');
  }
});

test('the inspectable master preserves organ identities and finite normal-aligned surfaces',()=>{
  const mesh=buildRosetteMesh(genome,{rows:20,columns:10});
  for(const name of ['position','normal','color','uv','aOrgan'])assert.ok(mesh.getAttribute(name).array.every(Number.isFinite));
  assert.equal(mesh.userData.organs.length,genome.branches);
  assert.ok(mesh.boundingBox.min.y>=0);
  assert.ok(mesh.index.array.every(i=>i<mesh.getAttribute('position').count));
  mesh.dispose();
});
