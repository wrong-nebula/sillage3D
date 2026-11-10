import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDesertGarden,decodeDesertTerrain,desertHabitat} from '../src/splat/desertGarden.js';
import {DesertEcosystem,desertShader} from '../src/splat/DesertEcosystem.js';
import {landSuitability} from '../src/splat/moebius/land-flora-ecology.js';
import {LAND_FLORA_SPECIES} from '../src/splat/moebius/land-flora-genome.js';
import {packSplats} from '../src/splat/math.js';

const bytes=readFileSync(new URL('../public/desert-garden/dunes.u16',import.meta.url));
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const bed=decodeDesertTerrain(buffer),scene=createDesertGarden(bed);

test('one rooted Moebius specimen has dense, finite, full-rank surface samples and no sand layer',()=>{
  assert.equal(scene.desert.stats.plants.length,1);
  const plant=scene.splats.filter(s=>s.desertPlant);
  assert.equal(plant.length,105000);
  assert.ok(scene.splats.length<270000);
  for(const s of plant){
    assert.equal(s.material,'foliage');assert.equal(s.wind[3],16);
    assert.ok(!s.softParticle&&!s.sandGlint);
  }
  for(const s of scene.splats){
    for(const value of [...s.center,...s.axes.flat(),...s.color,s.opacity])assert.ok(Number.isFinite(value));
    const [a,b,c]=s.axes;
    const determinant=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
    assert.ok(Math.abs(determinant)>1e-16);
  }
  const anchor=scene.desert.stats.plants[0].anchor;
  assert.ok(Math.abs(anchor[1]-bed.height(0,0))<.03);
  assert.ok(Math.min(...plant.map(s=>s.center[1]))-anchor[1]<.06);
  assert.doesNotThrow(()=>packSplats(scene.splats));
});

test('replaying growth starts at the root and reaches the mature crown without resampling',()=>{
  const system=new DesertEcosystem(scene),centers=new Float32Array(scene.splats.length*3);
  const record=system.records.find(r=>r.plant&&r.p[1]-r.plant[1]>1);
  system.replay(40);system.updateCenters(centers,40);
  const young=centers[record.i*3+1]-record.plant[1];
  system.updateCenters(centers,65);
  const mature=centers[record.i*3+1]-record.plant[1];
  assert.ok(mature>young*5);
  assert.equal(system.records.length,106380);
  system.setAge(1);system.updateCenters(centers,10000);
  assert.ok(Number.isFinite(centers[record.i*3]));
  system.dispose();
});

test('dryland establishment keeps original habitat exclusions and sand follows the exported terrain',()=>{
  const habitat=desertHabitat(bed,0,0),spec=LAND_FLORA_SPECIES['coral-dune-rosette'];
  assert.ok(landSuitability(spec,habitat)>0);
  assert.equal(landSuitability(spec,{...habitat,submerged:true}),0);
  assert.equal(landSuitability(spec,{...habitat,salinity:1}),0);
  for(const s of scene.splats.filter(s=>s.material==='sand-glitter')){
    assert.ok(Math.abs(s.center[1]-bed.height(s.center[0],s.center[2])-.017)<1e-7);
    assert.ok(!s.desertPlant);
  }
  assert.throws(()=>decodeDesertTerrain(new ArrayBuffer(10)),/Invalid/);
  const shader=desertShader('vec3 windOffset(vec3 p,vec4 wind) {\n}\nwindKind=wind.w;');
  assert.match(shader,/smoothstep\(2.8,3.6,length\(drifted.xz\)\)/);
});
