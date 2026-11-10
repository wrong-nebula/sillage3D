import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PREPASS_DEFAULTS,prepassShaders,packFields,resolveConditionals} from '../src/splat/SplatPrepass.js';

const source=name=>readFileSync(new URL(`../src/splat/${name}`,import.meta.url),'utf8');

// The shape of the splat vertex shader, reduced to what the split depends on.
const shader=({extra='',body='',corner='  localCoord=position.xy*3.;',helper=''}={})=>`
uniform sampler2D splatData;uniform int dataWidth;uniform vec2 viewport;uniform vec2 frameJitter;uniform float brushScale;
in float splatIndex;
out vec2 localCoord;
out vec3 paintColor;
out float opacity;
out vec2 localU;
out vec2 localV;
out vec3 paintSurface;
flat out float occlusionSlab;
#ifdef SPLAT_AO_CAPTURE
flat out vec4 aoRay0;
#endif
${extra}
vec4 readSplat(int offset) {
  int address=int(splatIndex)*5+offset;
  return texelFetch(splatData,ivec2(address%dataWidth,address/dataWidth),0);
}
${helper}
void main() {
  // The corner arrives as position.xy; this comment must not count.
  occlusionSlab=float(gl_InstanceID);
  vec4 center=readSplat(0);
  if(center.w<.5){gl_Position=vec4(2.,2.,2.,1.);return;}
  float footprintScale=1.;mat2 transform=mat2(1.);
${corner}
  vec2 delta=transform*localCoord;
  vec4 clip=projectionMatrix*vec4(center.xyz,1.);
  gl_Position=clip;gl_Position.xy+=(delta*2./viewport+frameJitter)*clip.w;
  localU=vec2(1.,0.);localV=vec2(0.,1.);
  paintSurface=readSplat(0).xyz+(readSplat(1).xyz*dot(localU,localCoord)+readSplat(2).xyz*dot(localV,localCoord))*brushScale*footprintScale;
  paintColor=readSplat(4).rgb;opacity=center.w;
${body}
}`;

test('conditionals are resolved against the material defines',()=>{
  assert.equal(PREPASS_DEFAULTS.vertexPrepass,true);
  const text='a\n#ifdef X\nb\n#else\nc\n#endif\n#ifndef X\nd\n#endif\ne';
  assert.equal(resolveConditionals(text,{}),'a\nc\nd\ne');
  assert.equal(resolveConditionals(text,{X:1}),'a\nb\ne');
  assert.equal(resolveConditionals('#define Y 1\n#ifdef Y\nyes\n#endif'),'#define Y 1\nyes');
  assert.equal(resolveConditionals('#if X>1\nb\n#endif'),null);
  assert.equal(resolveConditionals('#ifdef X\nb'),null);
});

test('fields pack four floats to a layer without splitting a vector',()=>{
  const layers=packFields([{name:'a',size:1},{name:'b',size:3},{name:'c',size:4},{name:'d',size:2},{name:'e',size:2},{name:'f',size:1}]);
  assert.equal(layers.length,4);
  for(const layer of layers){
    assert.ok(layer.used<=4);
    assert.equal(layer.fields.reduce((sum,field)=>sum+field.size,0),layer.used);
    let offset=0;for(const field of layer.fields){assert.equal(field.offset,offset);offset+=field.size;}
  }
  assert.deepEqual(layers.flatMap(layer=>layer.fields.map(field=>field.name)).sort(),['a','b','c','d','e','f']);
});

test('the splat shader splits into a recorded pre-pass and a thin corner shader',()=>{
  const result=prepassShaders(shader());
  assert.equal(result.ok,true);
  // clip 4, transform 4, scale 2, color 3, opacity 1, localU 2, localV 2, slab 1.
  assert.equal(result.floats,19);assert.equal(result.layers,5);
  const {prepassVertex,drawVertex}=result;
  // The original main runs once, as a function, at one known corner.
  assert.match(prepassVertex,/void splatMain\(\)\{/);
  assert.equal(prepassVertex.match(/void main\(\)\{/g).length,1);
  assert.match(prepassVertex,/localCoord=splatCorner\*3\.;/);
  assert.doesNotMatch(prepassVertex,/\bposition\b/);
  // Its outputs become globals; only the layers are recorded.
  assert.doesNotMatch(prepassVertex,/out vec3 paintColor/);
  assert.equal(prepassVertex.match(/out vec4 prepassLayer\d;/g).length,5);
  // Culling writes the recorded position, never the point's own.
  assert.match(prepassVertex,/if\(center\.w<\.5\)\{splatPosition=vec4\(2\.,2\.,2\.,1\.\);return;\}/);
  assert.match(prepassVertex,/splatPosition=clip;splatPosition\.xy\+=frameJitter\*clip\.w;splatTransform=vec4\(transform\[0\],transform\[1\]\);splatScale=vec2\(brushScale\*footprintScale,localCoord\.x\);/);
  // One vertex per mark, so the instance index becomes the vertex index.
  assert.match(prepassVertex,/occlusionSlab=float\(gl_VertexID\);/);
  assert.doesNotMatch(prepassVertex,/gl_InstanceID/);
  // Inactive capture outputs and comments are gone.
  assert.doesNotMatch(prepassVertex,/aoRay0|must not count/);
  // The thin shader declares every output the fragment shader reads.
  for(const declaration of ['out vec2 localCoord;','out vec3 paintColor;','out float opacity;','out vec2 localU;','out vec2 localV;','out vec3 paintSurface;','flat out float occlusionSlab;'])assert.ok(drawVertex.includes(declaration),declaration);
  assert.equal(drawVertex.match(/in vec4 prepassLayer\d;/g).length,5);
  assert.match(drawVertex,/if\(prepassClip\.xyz==vec3\(2\.\)\)\{gl_Position=vec4\(2\.,2\.,2\.,1\.\);return;\}/);
  assert.match(drawVertex,/localCoord=position\.xy\*prepassScale\.y;/);
  assert.match(drawVertex,/gl_Position\.xy\+=mat2\(prepassTransform\.xy,prepassTransform\.zw\)\*localCoord\*2\.\/viewport\*prepassClip\.w;/);
  assert.match(drawVertex,/paintSurface=readSplat\(0\)\.xyz\+\(readSplat\(1\)\.xyz\*dot\(localU,localCoord\)\+readSplat\(2\)\.xyz\*dot\(localV,localCoord\)\)\*prepassScale\.x;/);
  // Every carried value is written once and read once.
  for(const name of ['paintColor','opacity','localU','localV','occlusionSlab','prepassClip','prepassTransform','prepassScale']){
    assert.equal(prepassVertex.match(new RegExp(`prepassLayer\\d=vec4\\([^;]*\\b${name}\\b`,'g')).length,1,name);
    assert.equal(drawVertex.match(new RegExp(`\\b${name}=prepassLayer\\d\\.`,'g')).length,1,name);
  }
});

test('capture defines add their outputs',()=>{
  const plain=prepassShaders(shader()),capture=prepassShaders(shader(),{SPLAT_AO_CAPTURE:1});
  assert.equal(capture.floats,plain.floats+4);
  assert.match(capture.drawVertex,/flat out vec4 aoRay0;/);
});

test('a helper may name a parameter position; other corner uses decline the split',()=>{
  assert.equal(prepassShaders(shader({helper:'float density(vec2 position){return position.x+position.y;}'})).ok,true);
  const reason=options=>{const result=prepassShaders(shader(options));assert.equal(result.ok,false);return result.reason;};
  assert.match(reason({helper:'float lean(){return position.x;}'}),/quad corner/);
  assert.match(reason({body:'  opacity*=position.x;'}),/quad corner/);
  assert.match(reason({body:'  vec3 ray=vec3(localCoord,1.);'}),/local coordinate/);
  assert.match(reason({body:'  opacity*=delta.x;'}),/corner offset/);
  assert.match(reason({body:'  opacity*=float(gl_VertexID);'}),/vertex index/);
  assert.match(reason({corner:'  localCoord=position.xy*3.;localCoord.x+=1.;'}),/local coordinate/);
  assert.match(reason({extra:'out mat3 basis;'}),/output of type mat3/);
  assert.match(reason({extra:'out vec4 rays[2];'}),/output of type vec4\[2\]/);
  assert.match(prepassShaders(shader().replace('gl_Position=clip;','gl_Position=clip*1.;')).reason,/corner placement/);
  assert.match(prepassShaders(shader().replace('*brushScale*footprintScale;','*brushScale;')).reason,/paint surface/);
  assert.match(prepassShaders(shader().replace('int(splatIndex)*5','int(splatIndex)*6')).reason,/splat reader/);
  assert.match(prepassShaders(shader(),{},4).reason,/5 data layers, more than the 4 available/);
  assert.match(prepassShaders('#if 1\n#endif').reason,/conditional/);
});

test('the renderer opts scenes in and records before the frame pass opens',()=>{
  const renderer=source('GaussianBrushRenderer.js'),cliff=source('cliffTalus.js');
  assert.match(cliff,/vertexPrepass: true,/);
  assert.match(renderer,/this\.prepassConfig=definition\.vertexPrepass\?\?\(this\.sceneDefinitions\?\?scenes\)\[this\.sceneIndex\]\?\.vertexPrepass\?\?false;/);
  assert.match(renderer,/const scene=Boolean\(this\.prepassConfig\),wanted=scene&&this\.options\.vertexPrepass!==false&&SplatPrepass\.supported\(this\.renderer\);/);
  // The record attributes are on the geometry before three collects it.
  assert.match(renderer,/if\(draw\)this\.prepass\.prepare\(this\.geometry\);\s+this\.mesh\.material=draw\?\?this\.material;/);
  assert.match(renderer,/this\.scene\.onBeforeRender=\(renderer,scene,camera\)=>\{\s+if\(this\.prepass&&this\.mesh\?\.visible&&this\.mesh\.material===this\.prepass\.draw\)this\.prepass\.capture\(renderer,camera,this\.mesh\);/);
  assert.match(renderer,/this\.updateSplatIndices\(this\.camera\);\s+this\.choosePrepass\(\);/);
  // The anchors the split relies on are the renderer's own statements.
  assert.ok(renderer.includes('gl_Position=clip;gl_Position.xy+=(delta*2./viewport+frameJitter)*clip.w;'));
  assert.ok(renderer.includes('paintSurface=readSplat(0).xyz+(readSplat(1).xyz*dot(localU,localCoord)+readSplat(2).xyz*dot(localV,localCoord))*brushScale*footprintScale;'));
  assert.ok(renderer.includes('vec2 delta=transform*localCoord;'));
});
