import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera} from 'three';
import {SteadyList} from '../src/splat/SteadyList.js';
import {depthOrder,depthOrderKeys,depthKey} from '../src/splat/math.js';

const source=name=>readFileSync(new URL(`../src/splat/${name}`,import.meta.url),'utf8');
let state=5;const random=()=>(state=(state*1664525+1013904223)>>>0)/4294967296;

test('a single key matches the key of the full depth sort',()=>{
  const count=5000,centers=new Float32Array(count*3).map(()=>(random()-.5)*80);
  centers.set([0,0,0,0,0,0],0);centers[8]=-0;
  const camera=new PerspectiveCamera(50,1.5,.1,500);camera.position.set(3,2,9);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
  const view=camera.matrixWorldInverse.elements,order=depthOrder(centers,view,new Uint32Array(count)),keys=depthOrderKeys(order);
  for(let i=0;i<count;i++)assert.equal(depthKey(centers,view,i),keys[i]);
  for(let i=1;i<count;i++)assert.ok(keys[order[i-1]]<keys[order[i]]||(keys[order[i-1]]===keys[order[i]]&&order[i-1]<order[i]));
});

test('merging the actor into a recorded environment list gives the list of a full rebuild',()=>{
  // 6,000 environment marks, some at exactly equal depth, then 5,000 actor marks (wide radix) and, in a second scene, 300 (narrow radix).
  for(const actorCount of [5000,300]){
    const environment=6000,count=environment+actorCount,centers=new Float32Array(count*3);
    for(let i=0;i<environment;i++){centers[i*3]=(random()-.5)*60;centers[i*3+1]=(random()-.5)*40;centers[i*3+2]=i%7===0?-12:-random()*90;}
    const camera=new PerspectiveCamera(50,1.5,.1,500);camera.position.set(0,0,10);camera.lookAt(0,0,-40);camera.updateMatrixWorld(true);
    const view=camera.matrixWorldInverse.elements;
    // What the renderer keeps of the environment: here, an arbitrary subset (culled, dropped or hidden marks are absent).
    const kept=index=>index>=environment||(index%5!==0&&index%11!==3);
    const full=()=>{const order=depthOrder(centers,view,new Uint32Array(count));return Array.from(order).filter(kept);};
    const pose=()=>{for(let i=environment;i<count;i++){centers[i*3]=(random()-.5)*8;centers[i*3+1]=(random()-.5)*8;centers[i*3+2]=i%9===0?-12:-30-random()*30;}};
    pose();
    const first=full(),steady=new SteadyList(),list=Float32Array.from(first),out=new Float32Array(count);
    assert.equal(steady.capture('view',list,first.length,centers,view,environment,actorCount),true);
    assert.equal(steady.count,first.length-actorCount);assert.equal(steady.key,'view');
    for(let frame=0;frame<6;frame++){
      pose();
      const n=steady.merge(centers,view,environment,out);
      assert.deepEqual(Array.from(out.subarray(0,n)),full());
    }
    // Actor marks behind and in front of everything.
    for(let i=environment;i<count;i++)centers[i*3+2]=i%2?-400:5;
    assert.deepEqual(Array.from(out.subarray(0,steady.merge(centers,view,environment,out))),full());
    // A list that is not what it claims is not recorded.
    assert.equal(new SteadyList().capture('k',list,first.length,centers,view,environment,actorCount+1),false);
    assert.equal(new SteadyList().capture('k',list,first.length,centers,view,environment,actorCount-1),false);
    const shuffled=Float32Array.from(first);const a=shuffled.findIndex(index=>index<environment),b=shuffled.findLastIndex(index=>index<environment);[shuffled[a],shuffled[b]]=[shuffled[b],shuffled[a]];
    const refused=new SteadyList();assert.equal(refused.capture('k',shuffled,first.length,centers,view,environment,actorCount),false);assert.equal(refused.key,null);
    steady.clear();assert.equal(steady.key,null);
  }
});

test('the renderer merges only at an untouched steady view',()=>{
  const renderer=source('GaussianBrushRenderer.js');
  assert.match(renderer,/if\(this\.mergeSteadyActor\(\)\)\{this\.sortDirty=false;this\.stats\.sortMs=performance\.now\(\)-start;return;\}\s+this\.sortDepths\(this\.camera,this\.order\);\s+this\.visibilityKey=null;this\.updateSplatIndices\(this\.camera\);this\.sortDirty=false;\s+this\.noteSteadyList\(\);/);
  // A cleared visibility key, a rebuilt depth cache or other buffers decline before the view is compared.
  assert.match(renderer,/if\(!steady\?\.key\|\|this\.visibilityKey!==steady\.key\|\|steady\.depthCache!==this\.depthCache\|\|steady\.centers!==this\.centers\|\|steady\.geometry!==this\.geometry/);
  assert.match(renderer,/if\(this\.visibilityKeyOf\(this\.camera,false,this\.stats\.width,this\.stats\.height\)!==steady\.key\)return false;/);
  // Moving environment marks and every scene that draws a second list keep the full rebuild.
  assert.match(renderer,/!this\.movingEnvironmentIndices\(\)\?\.length\s+&&!this\.lod&&!this\.desert&&!this\.reflectionConfig&&!this\.refraction&&!this\.upperWater&&!this\.fossilMirrors\?\.length&&!this\.crystalStudio;/);
  // Recorded only once level-of-detail verdicts exist and the view has been built three times running.
  assert.match(renderer,/\(this\.markLodPixels\(\)&&this\.markLodKey!==key\)\)\{this\.steadyRuns=0;/);
  assert.match(renderer,/if\(this\.steadyRuns<3\)return;/);
});
