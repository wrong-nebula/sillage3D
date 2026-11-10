import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {GaussianBrushRenderer} from '../src/splat/GaussianBrushRenderer.js';
import {STILL_DEFAULTS,STILL_SCALE,EXPORT_SCALES,stillPhases,writeStillPhase,StillAccumulator} from '../src/splat/StillAccumulator.js';

const renderer=readFileSync(new URL('../src/splat/GaussianBrushRenderer.js',import.meta.url),'utf8');

test('phases cover every pixel of the larger image once, centered on the preview pixel',()=>{
  assert.equal(STILL_DEFAULTS.stillRefine,true);assert.equal(STILL_SCALE,2);assert.deepEqual([...EXPORT_SCALES],[1,2,4]);
  assert.deepEqual(stillPhases(1),[{a:0,b:0,shift:[0,0]}]);
  assert.deepEqual(stillPhases(2).map(p=>p.shift),[[.25,.25],[-.25,.25],[.25,-.25],[-.25,-.25]]);
  for(const scale of [2,3,4]){
    const phases=stillPhases(scale);assert.equal(phases.length,scale*scale);
    assert.equal(new Set(phases.map(p=>`${p.a},${p.b}`)).size,scale*scale);
    for(const axis of [0,1]){
      // Shifts stay inside the pixel and average to zero: no net displacement.
      assert.ok(phases.every(p=>Math.abs(p.shift[axis])<.5));
      assert.ok(Math.abs(phases.reduce((sum,p)=>sum+p.shift[axis],0))<1e-12);
    }
  }
  assert.throws(()=>stillPhases(0),RangeError);assert.throws(()=>stillPhases(2.5),RangeError);
});

test('interleaving reconstructs a finer image exactly from shifted point samples',()=>{
  // A scene defined on the fine grid; the top row of the image is the last row from the bottom.
  const width=5,height=3,scale=4,W=width*scale,H=height*scale;
  const scene=(X,Y)=>[(X*7+Y*13)%256,(X*31+Y)%256,(X+Y*5)%256];
  const output=new Uint8ClampedArray(W*H*4);
  for(const phase of stillPhases(scale)){
    // What a frame shifted by this phase reads back, bottom-up: base pixel (i,j)
    // sees the scene at its center minus the shift, which is fine pixel (scale*i+a, scale*j+b).
    const pixels=new Uint8Array(width*height*4);
    for(let j=0;j<height;j++)for(let i=0;i<width;i++){
      const x=(i+.5-phase.shift[0])*scale-.5,y=(j+.5-phase.shift[1])*scale-.5;
      assert.ok(Math.abs(x-(scale*i+phase.a))<1e-9&&Math.abs(y-(scale*j+phase.b))<1e-9);
      pixels.set([...scene(Math.round(x),Math.round(y)),200],(j*width+i)*4);
    }
    writeStillPhase(output,pixels,width,height,scale,phase);
  }
  for(let Y=0;Y<H;Y++)for(let X=0;X<W;X++){
    const k=((H-1-Y)*W+X)*4;assert.deepEqual([...output.subarray(k,k+4)],[...scene(X,Y),255]);
  }
});

test('the accumulator stores canvas frames by phase and enlarges the canvas only to present',()=>{
  const pass=new StillAccumulator(),calls=[];
  const fake={autoClear:true,getScissorTest:()=>false,setScissorTest(){},setRenderTarget:t=>calls.push(['target',t===null?'canvas':t===pass.target?'still':'other']),
    render:(scene,camera)=>calls.push(['draw',pass.quad.material===pass.interleave?'interleave':'copy']),copyFramebufferToTexture:t=>calls.push(['copy',t.image.width,t.image.height]),setSize:(w,h,style)=>calls.push(['size',w,h,style])};
  assert.equal(StillAccumulator.supported(fake),true);assert.equal(StillAccumulator.supported({}),false);
  pass.add(fake,550,344,2,{a:1,b:0});
  assert.equal(pass.target.width,1100);assert.equal(pass.target.height,688);
  assert.deepEqual(calls,[['target','canvas'],['copy',550,344],['target','still'],['draw','interleave'],['target','canvas']]);
  assert.deepEqual(pass.interleave.uniforms.phase.value.toArray(),[1,0]);assert.equal(pass.interleave.uniforms.scale.value,2);
  const frame=pass.frame;pass.add(fake,550,344,2,{a:0,b:1});assert.equal(pass.frame,frame);
  calls.length=0;pass.present(fake,550,344,2);
  assert.deepEqual(calls,[['size',1100,688,false],['target','canvas'],['draw','copy'],['target','canvas']]);
  assert.equal(fake.autoClear,true);pass.dispose();assert.equal(pass.frame,null);
});

test('a view at rest is refined once, and any ordinary frame returns to the preview size',()=>{
  const sizes=[],engine=Object.create(GaussianBrushRenderer.prototype),drawn=[];
  Object.assign(engine,{options:{},exporting:false,mesh:{},stillSamples:0,stillSupported:true,stats:{width:1100,height:688},
    material:{uniforms:{viewport:{value:new THREE.Vector2(1100,688)},frameJitter:{value:new THREE.Vector2()}}},
    renderer:{domElement:{clientWidth:759},setSize:(w,h)=>sizes.push([w,h])},
    still:{add:(r,w,h,scale,phase)=>drawn.push([w,h,scale,phase.a,phase.b]),present:(r,w,h,scale)=>sizes.push(['present',w*scale,h*scale])},
    renderScene(){this.jitters=(this.jitters??[]).concat([this.material.uniforms.frameJitter.value.toArray()]);},fence(){},
  });
  globalThis.devicePixelRatio=2;
  try{
    assert.equal(engine.stillPending,true);
    for(let i=0;i<4;i++)assert.equal(engine.refineStill(),true);
    assert.equal(engine.refineStill(),false);assert.equal(engine.stillPending,false);
    assert.deepEqual(drawn,[[1100,688,2,0,0],[1100,688,2,1,0],[1100,688,2,0,1],[1100,688,2,1,1]]);
    // Quarter-pixel shifts in clip units, cleared after every frame.
    assert.deepEqual(engine.jitters[0],[2*.25/1100,2*.25/688]);assert.deepEqual(engine.jitters[3],[-2*.25/1100,-2*.25/688]);
    assert.deepEqual(engine.material.uniforms.frameJitter.value.toArray(),[0,0]);
    assert.deepEqual(sizes,[['present',2200,1376]]);assert.deepEqual(engine.stats.still,{samples:4,of:4,scale:2,shown:true});
    engine.leaveStill();assert.deepEqual(sizes.at(-1),[1100,688]);engine.leaveStill();assert.equal(sizes.length,2);
    // Nothing to gain when the canvas already has as many pixels as the display shows.
    engine.stillSamples=0;globalThis.devicePixelRatio=1;assert.equal(engine.stillPending,false);
    globalThis.devicePixelRatio=2;engine.options.stillRefine=false;assert.equal(engine.stillPending,false);
    engine.options.stillRefine=true;engine.exporting=true;assert.equal(engine.stillPending,false);
  }finally{delete globalThis.devicePixelRatio;}
  assert.match(renderer,/gl_Position\.xy\+=\(delta\*2\.\/viewport\+frameJitter\)\*clip\.w;/);
  assert.match(renderer,/if\(!this\.dirty\)return this\.sortMoving\?false:this\.refineStill\(\);\s+this\.leaveStill\(\);this\.stillSamples=0;/);
  assert.match(renderer,/\|\|!!this\.pendingFence\|\|this\.stillPending\);\}/);
  assert.match(renderer,/async exportPNG\(\{scale=1\}=\{\}\)\{\s+if\(!Number\.isInteger\(scale\)\|\|scale<1\|\|scale>4\)throw new RangeError/);
  assert.match(renderer,/for\(const phase of stillPhases\(scale\)\)\{\s+jitter\.set\(2\*phase\.shift\[0\]\/width,2\*phase\.shift\[1\]\/height\);/);
});
