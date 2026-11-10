import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gaussianFilterScale,GAUSSIAN_FILTER_GLSL,PIXEL_FILTER_HOOK,pixelFilterVertexGLSL} from '../src/splat/GaussianFilter.js';

test('normalized pixel convolution preserves integrated Gaussian energy',()=>{
  for(const [xx,xy,yy] of [[.0001,0,.0001],[1,0,2],[4,1.9,1],[200,0,300]])for(const variance of [.01,.3,1]){
    const scale=gaussianFilterScale([xx,xy,yy],variance);
    const rawArea=Math.sqrt(xx*yy-xy*xy),filteredArea=Math.sqrt((xx+variance)*(yy+variance)-xy*xy);
    assert.ok(Math.abs(scale*filteredArea-rawArea)<1e-10);
    assert.ok(scale>0&&scale<=1);
  }
});
test('filter normalization is rotation invariant and converges under magnification',()=>{
  for(const angle of [0,.1,.7,1.5]){
    const c=Math.cos(angle),s=Math.sin(angle),a=.003,b=5;
    assert.ok(Math.abs(gaussianFilterScale([a*c*c+b*s*s,(a-b)*c*s,a*s*s+b*c*c])-gaussianFilterScale([a,0,b]))<1e-12);
  }
  assert.ok(gaussianFilterScale([10000,0,10000])>.9999);
  assert.equal(gaussianFilterScale([0,0,0]),0);
  assert.equal(gaussianFilterScale([1,0,1],0),1);
  assert.throws(()=>gaussianFilterScale([NaN,0,1]),RangeError);
});

test('the filter weights opacity for soft Gaussians and finished alpha for saturating paint kernels',()=>{
  const source=name=>readFileSync(new URL(`../src/splat/${name}`,import.meta.url),'utf8'),renderer=source('GaussianBrushRenderer.js');
  assert.equal(pixelFilterVertexGLSL('gaussian'),'  if(!sky&&!groundFog&&!glint)opacity*=gaussianFilterScale(xx,xy,yy);');
  for(const mode of ['paint','ghibli'])assert.equal(pixelFilterVertexGLSL(mode),'  if(!sky&&!groundFog&&!glint)defocusCoverage*=gaussianFilterScale(xx,xy,yy);');
  assert.match(GAUSSIAN_FILTER_GLSL,/float rawDet=max\(0\.,\(xx-\.3\)\*\(yy-\.3\)-xy\*xy\);/);
  // The hook sits after every covariance term and before the brush frame.
  assert.equal(renderer.split(PIXEL_FILTER_HOOK).length,2);
  assert.ok(renderer.indexOf('defocusCoverage=(1.-smoothstep(')<renderer.indexOf(PIXEL_FILTER_HOOK));
  assert.ok(renderer.indexOf(PIXEL_FILTER_HOOK)<renderer.indexOf('mat2 covariance=mat2(xx,xy,xy,yy);'));
  assert.match(renderer,/const pixelFilter=o\.pixelFilter===true;/);
  assert.match(renderer,/if\(pixelFilter\)material\.vertexShader=GAUSSIAN_FILTER_GLSL\+material\.vertexShader\.replace\(PIXEL_FILTER_HOOK,pixelFilterVertexGLSL\(o\.mode\)\);/);
  // Every kernel multiplies the coverage factor into its final alpha, and the
  // tight quad bounds and occlusion capture read it too.
  for(const use of ['float alpha=baseAlpha*defocusCoverage;','alpha=mix(mark.a,baseAlpha,blurMix)*defocusCoverage;','alpha=mix(baseAlpha,paintAlpha,painted*(1.-skyKernel)*(1.-blurMix))*defocusCoverage;','float peak=max(0.,opacity*coverage*defocusCoverage);'])assert.ok(renderer.includes(use),use);
  assert.ok(source('SplatOcclusion.js').includes('bound*=clamp(defocusCoverage,0.,1.);'));
  // A saturating dab at a third of its opacity is still nearly opaque, so
  // scaling opacity would not thin it; scaling its alpha does.
  const loaded=opacity=>1-Math.exp(-7.5*opacity),weight=gaussianFilterScale([.02,0,.02]);
  assert.ok(weight<.07&&loaded(1)*weight<.07);assert.ok(loaded(weight)>.35);
  // Off by default, and offered in every paint mode.
  assert.match(renderer,/pixelFilter:false/);
  assert.ok(!source('main.js').includes("$('pixel-filter-setting').hidden"));assert.ok(!source('featureLab.js').includes("$('pixel-filter').disabled"));
});
