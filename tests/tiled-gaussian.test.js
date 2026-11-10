import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera} from 'three';
import {packSplats} from '../src/splat/math.js';
import {prepareTiledGaussians} from '../src/splat/TiledGaussianProjection.js';
const splat=(center=[0,0,-5],axes=[[.5,0,0],[.2,.15,0],[0,0,.03]])=>({center,axes,color:[.4,.7,.2],opacity:.9,seed:.1});
function scene(splats,width=79,height=53,extra={}){const {data}=packSplats(splats);return prepareTiledGaussians({data,order:Uint32Array.from(splats,(_,i)=>i),camera:new PerspectiveCamera(50,width/height,.08,600),width,height,...extra});}
test('every contributing pixel of an anisotropic Gaussian is included in its tile',()=>{
  for(const center of [[0,0,-5],[2,1,-5],[-2,-1,-5]]){
    const s=scene([splat(center)]),p=s.projected;assert.equal(s.visible,1);
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
      const dx=x+.5-p[0],dy=s.height-y-.5-p[1],r2=p[4]*dx*dx+2*p[5]*dx*dy+p[6]*dy*dy;
      if(r2>9||p[2]*Math.exp(-.5*r2)<.004)continue;
      const t=Math.floor(y/16)*s.tilesX+Math.floor(x/16);assert.ok(s.indices.subarray(s.offsets[t],s.offsets[t+1]).includes(0),`missing ${x},${y}`);
    }
  }
});
test('tile lists reverse the source-over order, including equal-depth ties',()=>{
  const s=scene([splat(),splat(),splat()]);
  for(let t=0;t<s.offsets.length-1;t++)if(s.offsets[t+1]>s.offsets[t])assert.deepEqual([...s.indices.subarray(s.offsets[t],s.offsets[t+1])],[2,1,0]);
});
test('near/far clipping, offscreen splats, negligible alpha and empty scenes',()=>{
  const a=splat();a.opacity=.001;
  assert.equal(scene([splat([0,0,2]),splat([100,0,-5]),splat([0,0,-1000]),a]).pairs,0);
  assert.equal(scene([]).pairs,0);
});
test('capacity and invalid orders fail explicitly instead of truncating tile lists',()=>{
  assert.throws(()=>scene([splat()],79,53,{maxPairs:1}),/capacity/);
  assert.throws(()=>scene([splat(),splat()],79,53,{order:new Uint32Array([0,0])}),/permutation/);
  assert.throws(()=>scene([splat()],0,53),/dimensions/);
});
