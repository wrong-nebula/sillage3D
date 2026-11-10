import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ShaderMaterial,CustomBlending,OneFactor,HalfFloatType,RedFormat} from 'three';
import {OCCLUSION_DEFAULTS,OCCLUSION_SLABS,OCCLUSION_SCALE,OCCLUSION_MIN_STROKE,OCCLUSION_OPTICAL_DEPTH,occlusionSize,occlusionRanks,strokeWidth,SplatOcclusion,
  OCCLUSION_FRAGMENT_TEST,OCCLUSION_FRAGMENT_END,occlusionFragmentCapture,occlusionFragmentDeclaration} from '../src/splat/SplatOcclusion.js';
import {GHIBLI_FRAGMENT_GLSL} from '../src/splat/ghibliPaint.js';

const renderer=readFileSync(new URL('../src/splat/GaussianBrushRenderer.js',import.meta.url),'utf8');
const smoothstep=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a+(b-a)*t;
// Deterministic uniform samples; the bound must hold for every one.
function random(seed){let state=seed>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}

/** gouacheMark's alpha, with its two noise terms as free parameters. */
function gouacheAlpha(q,load,seed,edgeSoftness,texture,tooth,bristle){
  const shape=[Math.abs(q[0]),Math.abs(q[1])*(1+.12*Math.tanh(q[0]*1.4+Math.sin(seed*19)))];
  const roundShape=(shape[0]**2.8+shape[1]**2.8)**(1/2.8);
  const edge=roundShape+.13*(tooth-.5)+.035*bristle*texture,feather=.12+.18*edgeSoftness,r2=q[0]*q[0]+q[1]*q[1];
  const body=1-smoothstep(1.53-feather,1.65+feather,edge),underpaint=(1-smoothstep(.8,2.5,Math.sqrt(r2)))*.48;
  const dry=1-texture*.2*smoothstep(.7,1.65,roundShape)*(1-tooth),loaded=1-Math.exp(-3.8*load*Math.exp(-.14*r2));
  return clamp(mix(Math.min(.995,load*Math.exp(-.5*r2)),loaded*Math.max(body*dry,underpaint),.34),0,.995);
}
/** The capture's bound, evaluated at the cell's farthest whitened radius. */
function gouacheBound(reach,load,edgeSoftness,texture){
  const wander=.0655+.035*Math.abs(texture),feather=.12+.18*edgeSoftness,shape=1.12*reach;
  const body=1-smoothstep(1.53-feather,1.65+feather,shape+wander),dry=1-Math.max(texture,0)*.2*smoothstep(.7,1.65,shape);
  const underpaint=(1-smoothstep(.8,2.5,reach))*.48,loaded=1-Math.exp(-3.8*load*Math.exp(-.14*reach*reach));
  return clamp(mix(Math.min(.995,load*Math.exp(-.5*reach*reach)),loaded*Math.max(body*dry,underpaint),.34),0,.995);
}

test('occlusion culling defaults on, at half resolution, with sixteen nested occluder sets',()=>{
  assert.equal(OCCLUSION_DEFAULTS.occlusionCulling,true);assert.equal(OCCLUSION_SCALE,2);assert.equal(OCCLUSION_SLABS,16);
  assert.deepEqual(occlusionSize(1100,688),[550,344]);assert.deepEqual(occlusionSize(1139,711),[570,356]);assert.deepEqual(occlusionSize(1,1),[1,1]);
  for(const count of [4096,36755,318638,2_000_000]){
    const ranks=occlusionRanks(count);assert.equal(ranks.length,OCCLUSION_SLABS);
    for(let i=1;i<ranks.length;i++)assert.ok(ranks[i]>ranks[i-1]);
    // Float32 rank arithmetic in the shader is exact below 2^24.
    assert.ok(ranks[0]>=1&&ranks.at(-1)<count&&count<2**24);
  }
  // Remaining transmittance stays under half a display step of pure white.
  assert.ok(Math.exp(-(OCCLUSION_OPTICAL_DEPTH-.2))<.5/255);
});

test('stroke width is the projected narrow axis of the submitted marks',()=>{
  const view=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],projection=new Array(16).fill(0);projection[0]=2;projection[5]=2;
  const splat=(z,a,b,c)=>[0,0,z,1,...a,0,...b,0,...c,0,1,1,1,.5];
  // Focal length is 500 px: a .05 x .01 mark ten units away spans 2.5 x .5 px.
  const data=Float32Array.from([...splat(-10,[.05,0,0],[0,.01,0],[0,0,.001]),...splat(5,[1,0,0],[0,1,0],[0,0,1])]);
  const width=strokeWidth(data,[0,1],2,view,projection,500,500);
  assert.ok(Math.abs(width-Math.sqrt(.25+.3))<1e-4);
  assert.ok(Math.abs(strokeWidth(data,[0],1,view,projection,500,500,2)-Math.sqrt(1+.3))<1e-4);
  assert.equal(strokeWidth(data,[1],1,view,projection,500,500),0);assert.equal(strokeWidth(data,[],0,view,projection,500,500),0);
  // Samples the whole blend order without visiting every splat.
  const many=new Float32Array(20*5000),order=Uint32Array.from({length:5000},(_,i)=>i);
  for(let i=0;i<5000;i++)many.set(splat(-10,[i<2500?.2:.02,0,0],[0,i<2500?.2:.02,0],[0,0,.001]),i*20);
  assert.ok(strokeWidth(many,order,5000,view,projection,500,500)>OCCLUSION_MIN_STROKE);
  assert.ok(strokeWidth(many,order.subarray(2500),2500,view,projection,500,500)<OCCLUSION_MIN_STROKE);
});

test('the gouache bound never exceeds the kernel alpha anywhere in a cell',()=>{
  // The bound is derived from these exact kernel terms; revisit it with them.
  for(const term of ['shape.y*=1.+.12*paintTanh(q.x*1.4+sin(markSeed*19.));','float paintTanh(float x){return 1.-2./(exp(2.*x)+1.);}','pow(pow(shape.x,2.8)+pow(shape.y,2.8),1./2.8)','roundShape+.13*(tooth-.5)+.035*bristle*fibreFade*settings.x',
    'smoothstep(1.53-feather,1.65+feather,edge)','(1.-smoothstep(.8,2.5,length(q)))*.48','1.-settings.x*.2*smoothstep(.7,1.65,roundShape)*(1.-tooth)',
    '1.-exp(-3.8*alpha*exp(-.14*dot(q,q)))','mix(washAlpha,loadedPaint*max(body*dry,underpaint),.34)'])assert.ok(GHIBLI_FRAGMENT_GLSL.includes(term),term);
  // paintTanh is tanh, including where the exponential overflows or vanishes.
  for(let x=-12;x<=12;x+=.037)assert.ok(Math.abs(1-2/(Math.exp(2*x)+1)-Math.tanh(x))<1e-15,`tanh(${x})`);
  assert.equal(1-2/(Math.exp(2*800)+1),1);assert.equal(1-2/(Math.exp(-2*800)+1),-1);
  const next=random(20261110);let tight=0;
  for(let i=0;i<200000;i++){
    const radius=next()*3,angle=next()*Math.PI*2,q=[radius*Math.cos(angle),radius*Math.sin(angle)];
    const load=.02+next()*1.6,edgeSoftness=next()*.9,texture=next(),shrink=next()*1.5;
    const alpha=gouacheAlpha(q,load,next(),edgeSoftness,texture,next(),next()*2-1);
    // Any sample within `shrink` of this pixel may speak for it.
    const bound=gouacheBound(Math.max(0,radius-shrink*next())+shrink,load,edgeSoftness,texture);
    assert.ok(bound<=alpha+1e-9,`bound ${bound} exceeds alpha ${alpha} at r=${radius}`);
    if(shrink<.05&&alpha>.5&&bound>alpha*.9)tight++;
  }
  // Conservative, yet close enough near a mark's center to be worth capturing.
  assert.ok(tight>500);
  assert.ok(gouacheBound(0,1,.2,.55)>.98);
});

test('the capture bounds every kernel it admits and leaves the rest transparent',()=>{
  const capture=occlusionFragmentCapture(true),plain=occlusionFragmentCapture(false);
  assert.match(capture,/reach<3\.&&defocusAmount==0\.&&lodWeight>=\.99999&&celKernel<\.5/);assert.ok(!plain.includes('celKernel'));
  assert.match(capture,/if\(oilPaint<\.5\)/);assert.match(capture,/bound>=\.004\?-log/);
  // The capture program contains the bound and nothing of the brush kernel after it.
  assert.match(capture,/}\s*#else\s*$/);assert.match(OCCLUSION_FRAGMENT_END,/^\s*#endif\s*$/);
  assert.match(renderer,/\$\{OCCLUSION_FRAGMENT_END\}\n}`;/);
  // Painted dabs: the bound assumes these wobble and bristle limits.
  assert.ok(renderer.includes('float wobble=.055*sin(brush.x*5.+seed*61.)+.035*sin(brush.y*8.+seed*29.);'));
  assert.ok(renderer.includes('float silhouette=1.-smoothstep(1.60-.3*edgeSoftness,1.75+.5*edgeSoftness,radius);'));
  assert.ok(renderer.includes('float bristles=.985+.015*sin('));
  assert.ok(renderer.includes('float paintAlpha=(1.-exp(-7.5*opacity*coverage*gaussian))*silhouette*bristles;'));
  const next=random(7);
  for(let i=0;i<100000;i++){
    const radius=next()*3,load=.02+next()*1.6,edgeSoftness=next()*.9,wobble=(next()*2-1)*.09,bristles=.97+next()*.03,gaussian=Math.exp(-.5*radius*radius);
    const alpha=(1-Math.exp(-7.5*load*gaussian))*(1-smoothstep(1.6-.3*edgeSoftness,1.75+.5*edgeSoftness,radius+wobble))*bristles;
    const bound=Math.min(Math.min(.995,load*gaussian),(1-Math.exp(-7.5*load*gaussian))*(1-smoothstep(1.6-.3*edgeSoftness,1.75+.5*edgeSoftness,radius+.09))*.97);
    assert.ok(bound<=alpha+1e-9);
  }
});

test('the main pass tests blend order before the kernel and only while a capture is bound',()=>{
  assert.match(OCCLUSION_FRAGMENT_TEST,/#ifndef SPLAT_OCCLUSION_CAPTURE\s+if\(occlusionActive&&occlusionSlab>textureLod\(occlusionCut,gl_FragCoord\.xy\*occlusionTexel,0\.\)\.r\*255\.-\.5\)discard;/);
  assert.ok(renderer.indexOf('${OCCLUSION_FRAGMENT_TEST}')<renderer.indexOf('float r2=dot(localCoord,localCoord);'));
  assert.ok(renderer.indexOf('${occlusionFragmentCapture(celPaint)}')<renderer.indexOf('float gaussian=exp(-.5*r2);'));
  assert.match(occlusionFragmentDeclaration(true),/#else[\s\S]*layout\(location=0\) out vec4 fragColor;/);
  assert.ok(!occlusionFragmentDeclaration(false).split('#else')[1].includes('layout'));
  // Reflection, refraction and AO captures use other cameras or alphas.
  assert.match(renderer,/const occlusion=this\.renderOcclusion\(\);\s+this\.material\.uniforms\.occlusionActive\.value=occlusion;/);
  assert.match(renderer,/finally\{this\.material\.uniforms\.occlusionActive\.value=false;this\.material\.uniforms\.markLod\.value\.x=0;\}/);
  assert.match(renderer,/o\.occlusionCulling===false\|\|o\.mode!=='ghibli'\|\|o\.oil===true\|\|o\.watercolor===true\|\|this\.reefCaustics\|\|this\.crystalStudio/);
  assert.match(renderer,/this\.backgroundMesh\.onBeforeRender=[^\n]*occlusionCount\.value=-1/);
});

test('capture adds optical depth with the live uniforms and follows shader specialization',()=>{
  const pass=new SplatOcclusion(),source=new ShaderMaterial({uniforms:{windTime:{value:1},...SplatOcclusion.uniforms()},vertexShader:'void main(){}',fragmentShader:'void main(){}'});
  assert.equal(pass.slabTarget.textures.length,4);assert.equal(pass.slabTarget.texture.type,HalfFloatType);assert.equal(pass.cutTarget.texture.format,RedFormat);
  pass.captureMaterial(source);const capture=pass.capture;
  assert.equal(capture.uniforms,source.uniforms);assert.equal(capture.defines.SPLAT_OCCLUSION_CAPTURE,1);
  assert.equal(capture.blending,CustomBlending);assert.equal(capture.blendSrc,OneFactor);assert.equal(capture.blendDst,OneFactor);
  assert.equal(capture.depthTest,false);assert.equal(capture.depthWrite,false);
  pass.captureMaterial(source);assert.equal(pass.capture,capture);
  // Switching paint mode rewrites the source shaders in place.
  let released=false;capture.addEventListener('dispose',()=>{released=true;});
  source.fragmentShader='void main(){discard;}';pass.captureMaterial(source);assert.ok(released);assert.notEqual(pass.capture,capture);
  assert.equal(pass.capture.fragmentShader,source.fragmentShader);
  pass.releaseCapture();assert.equal(pass.source,null);pass.dispose();source.dispose();
});
