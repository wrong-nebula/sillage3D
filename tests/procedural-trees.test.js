import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateTree,TREE_SPECIES,encodeTreeSplats,buildTreeScene} from '../src/splat/proceduralTrees.js';
import {packSplats} from '../src/splat/math.js';
import {decodeNativeSplat} from '../src/splat/nativeSplat.js';
const digest=s=>createHash('sha256').update(new Uint8Array(encodeTreeSplats(s))).digest('hex');
test('same seed reproduces geometry after an intervening generation; different seeds differ',()=>{
 const a=generateTree({seed:'A'});generateTree({seed:'B'});const again=generateTree({seed:'A'}),b=generateTree({seed:'B'});
 assert.equal(digest(a.splats),digest(again.splats));assert.notEqual(digest(a.splats),digest(b.splats));
 const recolored=generateTree({seed:'A',palette:'rose'});assert.deepEqual(a.splats.map(s=>s.center),recolored.splats.map(s=>s.center));
});
test('all architectures have rooted, finite, bounded 3D splats and meaningful juvenile proportions',()=>{
 for(const species of Object.keys(TREE_SPECIES)){
  const adult=generateTree({species,seed:7}),young=generateTree({species,seed:7,age:.4});
  // The densest architecture is the fir, at 72,685 since the 7 Nov foliage pass.
  assert.ok(adult.splats.length>2000&&adult.splats.length<80000,`${species} budget ${adult.splats.length}`);
  assert.ok(young.height<adult.height*.5);assert.ok(young.radius<adult.radius*.6);
  assert.equal(adult.anchor[1],0);assert.ok(adult.splats.some(s=>s.material==='wood'&&s.center[1]<.01));
  assert.ok(adult.splats.some(s=>s.material==='foliage'));
  assert.ok(packSplats(adult.splats).data.every(Number.isFinite));
  for(const s of adult.splats)for(const a of s.axes)assert.ok(Math.hypot(...a)>.00001);
 }
});
test('native .splat export roundtrips centers, pigment and anisotropic covariance',()=>{
 const source=generateTree({species:'birch',density:.4}).splats,encoded=encodeTreeSplats(source),minimum=[0,1,2].map(k=>Math.min(...source.map(s=>s.center[k]))),maximum=[0,1,2].map(k=>Math.max(...source.map(s=>s.center[k]))),origin=[(minimum[0]+maximum[0])/2,minimum[1],(minimum[2]+maximum[2])/2],decoded=decodeNativeSplat(encoded,{height:maximum[1]-minimum[1],flipYZ:false});
 assert.equal(encoded.byteLength,source.length*32);assert.equal(decoded.length,source.length);
 for(let i=0;i<source.length;i+=137){
  for(let k=0;k<3;k++){assert.ok(Math.abs(source[i].center[k]-origin[k]-decoded[i].center[k])<.00001);assert.ok(Math.abs(source[i].color[k]-decoded[i].color[k])<1/255);}
  const covariance=s=>{const c=new Array(9).fill(0);for(const a of s.axes)for(let j=0;j<3;j++)for(let k=0;k<3;k++)c[j*3+k]+=a[j]*a[k];return c;};
  const a=covariance(source[i]),b=covariance(decoded[i]);for(let k=0;k<9;k++)assert.ok(Math.abs(a[k]-b[k])<.002);
 }
});
test('grove budget and explicit origins survive assembly',()=>{
 const s=buildTreeScene();assert.equal(s.trees.length,9);assert.equal(s.splats.filter(s=>s.material==='wood'||s.material==='foliage').length,s.treeSplatCount);assert.ok(s.splats.length<550000,`grove budget ${s.splats.length}`);assert.ok(s.trees.every(t=>t.origin[1]>0));
 assert.throws(()=>generateTree({height:NaN}),/finite/);assert.throws(()=>generateTree({species:'invalid'}),/Unknown/);
});
