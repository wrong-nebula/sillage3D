import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RedFormat,UnsignedByteType,LinearFilter,RepeatWrapping} from 'three';
import {PAINT_HASH_GLSL,PAINT_NOISE_GLSL,PAINT_NOISE_PROCEDURAL_GLSL,PAINT_GRAIN_NOISE_GLSL,PAINT_NOISE_SIZE,GHIBLI_FRAGMENT_GLSL} from '../src/splat/ghibliPaint.js';
import {PaintNoiseMap} from '../src/splat/PaintNoiseMap.js';

const source=name=>readFileSync(new URL(`../src/splat/${name}`,import.meta.url),'utf8');
const fract=x=>x-Math.floor(x);
/** paintHash in doubles: the lattice the map tabulates, up to GPU rounding. */
function hash(x,y){
  let q=[fract(x*.1031),fract(y*.1031),fract(x*.1031)];
  const d=q[0]*(q[1]+33.33)+q[1]*(q[2]+33.33)+q[2]*(q[0]+33.33);q=q.map(v=>v+d);
  return fract((q[0]+q[1])*q[2]);
}
const fade=f=>f*f*(3-2*f);
function procedural(x,y){
  const cx=Math.floor(x),cy=Math.floor(y),fx=fade(x-cx),fy=fade(y-cy);
  const top=hash(cx,cy)+(hash(cx+1,cy)-hash(cx,cy))*fx,bottom=hash(cx,cy+1)+(hash(cx+1,cy+1)-hash(cx,cy+1))*fx;
  return top+(bottom-top)*fy;
}
/** The lookup as the GPU performs it: texel (i,j) holds hash(i-N/2,j-N/2),
 * repeat wrapping, bilinear weights from the texel-space fraction. */
function lookup(x,y,quantize=v=>v){
  const N=PAINT_NOISE_SIZE,half=N/2,texel=(i,j)=>quantize(hash(((i%N)+N)%N-half,((j%N)+N)%N-half));
  const u=(Math.floor(x)+fade(fract(x))+half+.5)-.5,v=(Math.floor(y)+fade(fract(y))+half+.5)-.5;
  const i=Math.floor(u),j=Math.floor(v),a=quantize.weight?.(u-i)??u-i,b=quantize.weight?.(v-j)??v-j;
  const top=texel(i,j)+(texel(i+1,j)-texel(i,j))*a,bottom=texel(i,j+1)+(texel(i+1,j+1)-texel(i,j+1))*a;
  return top+(bottom-top)*b;
}

test('the tabulated lookup is the procedural value noise inside its window',()=>{
  assert.equal(PAINT_NOISE_SIZE,4096);
  assert.match(PAINT_NOISE_GLSL,/textureLod\(paintNoiseMap,\(cell\+f\+2048\.5\)\*0\.000244140625,0\.\)\.r/);
  assert.match(PAINT_NOISE_GLSL,/f=f\*f\*\(3\.-2\.\*f\)/);
  let state=11;const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const byte=v=>Math.round(v*255)/255;byte.weight=w=>Math.floor(w*256)/256;
  let worst=0;
  for(let i=0;i<20000;i++){
    const x=(rnd()-.5)*4090,y=(rnd()-.5)*4090,exact=procedural(x,y);
    assert.ok(Math.abs(lookup(x,y)-exact)<1e-9);
    worst=Math.max(worst,Math.abs(lookup(x,y,byte)-exact));
  }
  // Eight-bit lattice values and 1/256 filter weights on each axis: under 2.5
  // display steps of the noise itself. Wash and tooth scale it by at most
  // 0.075 and 0.13, a fraction of one step in the painted result.
  assert.ok(worst<2.5/255,`quantized error ${worst}`);
  // Outside the window the lattice repeats instead of extending.
  assert.ok(Math.abs(lookup(3000.3,-2500.7)-lookup(3000.3-4096,-2500.7+4096))<1e-9);
  assert.ok(Math.abs(lookup(3000.3,-2500.7)-procedural(3000.3,-2500.7))>1e-3);
});

test('the map is written by the GPU from the same hash and filtered across repeats',()=>{
  const map=source('PaintNoiseMap.js');
  assert.match(map,/\$\{PAINT_HASH_GLSL\}\s+void main\(\)\{gl_FragColor=vec4\(paintHash\(floor\(gl_FragCoord\.xy\)-\$\{PAINT_NOISE_SIZE\/2\}\.\)\);\}/);
  const pass=new PaintNoiseMap(),texture=pass.texture;
  assert.equal(pass.target.width,PAINT_NOISE_SIZE);assert.equal(pass.target.height,PAINT_NOISE_SIZE);
  assert.equal(texture.format,RedFormat);assert.equal(texture.type,UnsignedByteType);
  assert.equal(texture.minFilter,LinearFilter);assert.equal(texture.magFilter,LinearFilter);
  assert.equal(texture.wrapS,RepeatWrapping);assert.equal(texture.wrapT,RepeatWrapping);assert.equal(texture.generateMipmaps,false);
  // One draw, then free: state is restored and later calls return the map.
  const calls=[],renderer={autoClear:true,getRenderTarget:()=>'previous',setRenderTarget:t=>calls.push(['target',t]),render:()=>calls.push(['render']),
    getScissorTest:()=>true,setScissorTest:v=>calls.push(['scissorTest',v]),getViewport:v=>v.set(1,2,3,4),setViewport:v=>calls.push(['viewport',v.x,v.w]),getScissor:v=>v.set(5,6,7,8),setScissor:v=>calls.push(['scissor',v.x,v.w])};
  assert.equal(pass.ready,false);assert.equal(pass.render(renderer),texture);assert.equal(pass.ready,true);
  assert.deepEqual(calls,[['scissorTest',false],['target',pass.target],['render'],['target','previous'],['viewport',1,4],['scissor',5,8],['scissorTest',true]]);
  assert.equal(renderer.autoClear,true);
  calls.length=0;assert.equal(pass.render(renderer),texture);assert.deepEqual(calls,[]);
  pass.dispose();assert.equal(pass.ready,false);
});

test('gouache reads wash and tooth from the map and keeps fine grain procedural',()=>{
  assert.ok(GHIBLI_FRAGMENT_GLSL.startsWith(PAINT_HASH_GLSL+PAINT_NOISE_GLSL+PAINT_GRAIN_NOISE_GLSL));
  assert.equal(PAINT_GRAIN_NOISE_GLSL,PAINT_NOISE_PROCEDURAL_GLSL.replace('float paintNoise(','float paintGrainNoise('));
  assert.ok(GHIBLI_FRAGMENT_GLSL.includes('float wash=paintNoise(paper*4.5);'));
  assert.ok(GHIBLI_FRAGMENT_GLSL.includes('float tooth=paintNoise(brush*vec2(2.3,8.5)+markSeed*71.);'));
  // 83 cells per world unit would leave the window 25 units from the origin.
  assert.ok(GHIBLI_FRAGMENT_GLSL.includes('vec2 grainUV=paper*83.;'));
  assert.ok(GHIBLI_FRAGMENT_GLSL.includes('if(grainFade>0.)grain=(paintGrainNoise(grainUV)-.5)*grainFade;'));
  assert.equal(GHIBLI_FRAGMENT_GLSL.split('float paintNoise(').length,2);
  const renderer=source('GaussianBrushRenderer.js');
  assert.match(renderer,/paintNoiseMap:\{value:this\.paintNoise\?\.texture\?\?null\}/);
  assert.match(renderer,/uniforms\.paintNoiseMap\.value=\(this\.paintNoise\?\?=new PaintNoiseMap\(\)\)\.render\(this\.renderer\);/);
  assert.match(renderer,/this\.paintNoise\?\.dispose\(\);this\.paintNoise=null;/);
});
