import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MARK_LOD_DEFAULTS,MARK_LOD_MIN_KEEP,MARK_LOD_FADE,MARK_LOD_MAX_SCALE,markRank,markKeep,markWeight,markGrow,markLodDrops,
  MARK_LOD_VERTEX_GLSL,MARK_LOD_VERTEX_ELIGIBLE} from '../src/splat/MarkLOD.js';

const source=name=>readFileSync(new URL(`../src/splat/${name}`,import.meta.url),'utf8');
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],projection=new Array(16).fill(0);projection[0]=2;projection[5]=2;
// Focal length 500 px at 500 x 500: a disc of radius r at distance d spans 500 r / d pixels.
const splat=(z,radius,{seed=.5,x=0}={})=>[x,0,z,1,radius,0,0,0,0,radius,0,0,0,0,radius*.1,0,1,1,1,seed];

test('ranks are stable, evenly spread and identical to the shader hash',()=>{
  assert.equal(MARK_LOD_DEFAULTS.markLOD,true);
  assert.match(MARK_LOD_VERTEX_GLSL,/float rank=float\(\(uint\(splatIndex\)\*2654435761u\)>>8u\)\*5\.960464477539063e-8;/);
  assert.equal(0x9E3779B1,2654435761);assert.equal(1/16777216,5.960464477539063e-8);
  for(const index of [0,1,2,65535,352985,16777215]){const rank=markRank(index);assert.ok(rank>=0&&rank<1);assert.equal(rank,markRank(index));
    assert.equal(rank,Number((BigInt(index)*2654435761n&0xffffffffn)>>8n)/16777216);}
  // Any run of consecutive marks keeps close to the requested share.
  for(const [start,length] of [[0,400],[120000,1000],[300000,64]])for(const keep of [.0625,.2,.5,.8]){
    let kept=0;for(let i=start;i<start+length;i++)if(markRank(i)<keep)kept++;
    assert.ok(Math.abs(kept-keep*length)<=3,`${kept} of ${length} at ${keep}`);
  }
});

test('enlarged survivors restore the coverage of the withheld marks at every size',()=>{
  assert.equal(markKeep(4,0,4,2),1);assert.equal(markKeep(1,0,1,2),.25);assert.equal(markKeep(.0001,0,.0001,2),MARK_LOD_MIN_KEEP);
  assert.ok(Math.abs(markKeep(4,1.9,1,2)-Math.sqrt(4-1.9*1.9)/4)<1e-12);
  for(const keep of [MARK_LOD_MIN_KEEP,.1,.25,.5,.79,.8,.81,.95,.999]){
    let weight=0;const steps=200000;for(let i=0;i<steps;i++)weight+=markWeight(keep,(i+.5)/steps);
    assert.ok(Math.abs(weight/steps*markGrow(keep)-1)<2e-4,`coverage ${weight/steps*markGrow(keep)} at ${keep}`);
    assert.equal(markWeight(keep,keep),0);assert.equal(markWeight(keep,0),1);
  }
  // Full detail has no faded or enlarged marks, and the approach to it is continuous.
  assert.equal(markGrow(1),1);assert.equal(markWeight(1,.9999),1);
  assert.ok(markGrow(.9999)<1.0002);assert.ok(markWeight(.9999,.99)===1);
  assert.ok(Math.abs(MARK_LOD_MAX_SCALE-Math.sqrt(markGrow(MARK_LOD_MIN_KEEP)))<1e-12);
  // The shader states the same rule.
  assert.ok(MARK_LOD_VERTEX_GLSL.includes(`float keep=clamp(sqrt(max(xx*yy-xy*xy,0.))/(markLod.x*markLod.x),${MARK_LOD_MIN_KEEP},1.);`));
  assert.ok(MARK_LOD_VERTEX_GLSL.includes(`float fade=${MARK_LOD_FADE}*min(1.,(1.-keep)*5.),width=fade*keep;`));
  assert.ok(MARK_LOD_VERTEX_GLSL.includes('float grow=1./(keep*(1.-.5*fade)),stretch=sqrt(grow);'));
  assert.ok(MARK_LOD_VERTEX_GLSL.includes('xx*=grow;xy*=grow;yy*=grow;a*=stretch;b*=stretch;c*=stretch;footprintScale*=stretch;'));
  assert.ok(MARK_LOD_VERTEX_GLSL.includes('defocusCoverage*=weight;'));
  assert.match(MARK_LOD_VERTEX_GLSL,/xx\+=\.3;yy\+=\.3;\s*$/);
});

test('the CPU withholds only marks the shader is certain to drop',()=>{
  const count=4000,data=new Float32Array(count*20),wind=new Float32Array(count*4),indices=Uint32Array.from({length:count},(_,i)=>i);
  // Radius .004 at distance 10 to 60: between .2 and .03 px against a 2 px threshold.
  for(let i=0;i<count;i++)data.set(splat(-10-50*i/count,.004,{x:(i%40-20)*.01}),i*20);
  const special={sky:5,soft:6,plant:7,actor:3990,moving:11,near:12};
  data[special.sky*20+19]=-.4;data[special.soft*20+19]=2.3;wind[special.plant*4+3]=2;data.set(splat(-.5,.4),special.near*20);
  const drop=new Uint8Array(count),view={view:identity,projection,width:500,height:500,pixels:2,footprint:1,actorStart:3980,moving:[special.moving]};
  const dropped=markLodDrops(drop,indices,count,data,wind,view);
  assert.equal(dropped,drop.reduce((a,b)=>a+b,0));
  // These marks are far below the threshold: nearly all but one in sixteen go.
  assert.ok(dropped>count*.9&&dropped<count*(1-MARK_LOD_MIN_KEEP));
  for(const index of [special.sky,special.soft,special.plant,special.moving,special.near])assert.equal(drop[index],0);
  for(let i=3980;i<count;i++)assert.equal(drop[i],0);
  // Certain: even with a footprint a tenth smaller, the shader's own share stays below the rank.
  for(let i=0;i<count;i++)if(drop[i]){
    const d=10+50*i/count,sigma=.004*.9*500/d,keep=markKeep(sigma*sigma,0,sigma*sigma*.01+1e-12,2);
    assert.ok(markRank(i)>=Math.max(keep,MARK_LOD_MIN_KEEP));
  }
  // A larger style footprint can only withhold fewer.
  const wide=new Uint8Array(count);assert.ok(markLodDrops(wide,indices,count,data,wind,{...view,footprint:6})<=dropped);
  for(let i=0;i<count;i++)if(wide[i])assert.equal(drop[i],1);
  // Marks at full size are untouched.
  const near=new Float32Array(200*20);for(let i=0;i<200;i++)near.set(splat(-5,.2),i*20);
  assert.equal(markLodDrops(new Uint8Array(200),indices,200,near,null,view),0);
});

test('only the main camera passes of opted-in scenes use the thinned list',()=>{
  const renderer=source('GaussianBrushRenderer.js');
  assert.match(MARK_LOD_VERTEX_ELIGIBLE,/markLod\.x>0\.&&pigment\.a>=0\.&&pigment\.a<1\.&&windKind<\.5&&splatIndex<markLod\.y/);
  assert.ok(renderer.indexOf('${MARK_LOD_VERTEX_ELIGIBLE}')<renderer.indexOf('vec2 guard=d*tanFov'));
  assert.match(renderer,/footprintScale\*\(markLodEligible\?\$\{MARK_LOD_MAX_SCALE\}:1\.\)/);
  assert.ok(renderer.indexOf('vec2 c=projectAxis(')<renderer.indexOf('${MARK_LOD_VERTEX_GLSL}'));
  assert.ok(renderer.indexOf('${MARK_LOD_VERTEX_GLSL}')<renderer.indexOf('GAUSSIAN_PIXEL_FILTER'));
  assert.match(renderer,/markLod:\{value:new THREE\.Vector2\(0,1e9\)\}/);
  assert.match(renderer,/uniforms\.markLod\.value\.set\(this\.markLodPixels\(\),this\.markLodEnd\(\)\);\s+const occlusion=this\.renderOcclusion\(\);/);
  // Actors and merged stand-ins lie beyond the last mark the rule may touch.
  assert.match(renderer,/markLodEnd\(\)\{return Math\.min\(this\.actor\?this\.actorStart:1e9,this\.markClusters\?this\.markClusters\.merged\[0\]:1e9\);\}/);
  assert.match(renderer,/finally\{this\.material\.uniforms\.occlusionActive\.value=false;this\.material\.uniforms\.markLod\.value\.x=0;\}/);
  assert.match(renderer,/if\(!config\|\|o\.markLOD===false\|\|this\.exporting\|\|this\.lod\|\|this\.refraction\|\|this\.crystalStudio\|\|ssaoSettings\(o\)\.enabled\)return 0;/);
  assert.match(renderer,/reflection\?0:this\.markLodPixels\(\)\]\.join\(','\)/);
  assert.match(renderer,/reach:!reflection&&this\.markLodPixels\(\)\?MARK_LOD_MAX_SCALE:1/);
  assert.match(renderer,/else if\(this\.markLodPending!==key\)this\.markLodPending=key;/);
  assert.match(renderer,/this\.exporting=true;/);assert.match(renderer,/finally \{jitter\?\.set\(0,0\);this\.exporting=false;/);
  assert.match(source('SplatVisibility.js'),/\(options\.gouacheBlend\?\?\.7\)\*\.18:1\)\*reach;/);
  assert.match(source('cliffTalus.js'),/markLOD: \{pixels: 2, clusterHeight: 688\}/);
});
