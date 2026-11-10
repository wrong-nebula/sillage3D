import './treeStudio.css';
import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {TREE_SPECIES,TREE_PALETTES,buildTreeScene,encodeTreeSplats} from './proceduralTrees.js';
const $=id=>document.getElementById(id),query=new URLSearchParams(location.search);
const initial={view:'grove',species:'broadleaf',palette:'gold',seed:'1947',height:1,width:1,density:1,age:1};
const state={...initial};
for(const key of Object.keys(state))if(query.has(key))state[key]=typeof state[key]==='number'?Number(query.get(key)):query.get(key);
if(!['grove','specimen'].includes(state.view))state.view='grove';
if(!TREE_SPECIES[state.species])state.species='broadleaf';if(!TREE_PALETTES[state.palette])state.palette='gold';
for(const [key,min,max]of [['height',.5,1.4],['width',.5,1.5],['density',.4,1.5],['age',.3,1]])state[key]=Number.isFinite(state[key])?Math.min(max,Math.max(min,state[key])):1;
const slider=(id,label,min,max,step)=>`<label class="range" for="${id}"><span>${label}<output id="${id}-value">${Math.round(state[id]*100)}%</output></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${state[id]}"></label>`;
$('app').innerHTML=`<header><a href="/splat.html" class="brand">Sillage</a><h1>Procedural trees</h1><button id="save-image">Save image</button></header>
<main><section class="workspace" aria-label="Tree preview"><div class="toolbar"><div class="view-switch" aria-label="Preview arrangement"><button id="grove" aria-pressed="${state.view==='grove'}">Reference grove</button><button id="specimen" aria-pressed="${state.view==='specimen'}">Single tree</button></div><div><button id="reset-camera">Reset view</button><button id="compare" aria-pressed="false">Compare reference</button></div></div>
<div id="stage"><canvas id="tree-canvas" tabindex="0" aria-label="Procedural 3D trees. Drag to orbit, scroll to zoom, right drag to pan."></canvas><div id="reference" hidden><img src="/tree-studio/reference.png" alt="Supplied painting: golden broadleaf trees and green firs on a grassy hill"><span>Supplied reference</span></div><div id="loading" role="status">Growing the grove…</div></div>
<footer><span id="caption">Golden broadleaf · Harvest gold</span><span id="stats">Preparing trees</span><span class="hint">Drag to orbit · Scroll to zoom</span></footer></section>
<aside aria-label="Tree generator controls"><h2>Shape a tree</h2><p class="intro">Branch by branch. Mark by mark.</p>
<label class="field" for="species">Tree architecture<select id="species">${Object.entries(TREE_SPECIES).map(([id,s])=>`<option value="${id}" ${state.species===id?'selected':''}>${s.label}</option>`).join('')}</select><span class="note" id="architecture-scope"></span></label>
<fieldset><legend>Foliage palette</legend><div class="palettes">${Object.entries(TREE_PALETTES).map(([id,p])=>`<button class="palette" data-palette="${id}" aria-label="${p.label}" title="${p.label}" aria-pressed="${state.palette===id}"><span style="background:${p.colors[4]}"></span></button>`).join('')}</div><span id="palette-name">${TREE_PALETTES[state.palette].label}</span></fieldset>
<div class="sliders">${slider('height','Height',.5,1.4,.05)}${slider('width','Crown spread',.5,1.5,.05)}${slider('density','Brush detail',.4,1.5,.1)}${slider('age','Maturity',.3,1,.05)}</div>
<div class="seed-row"><label class="field" for="seed">Seed<input id="seed" type="text" maxlength="48" value=""></label><button id="new-seed">New variation</button></div>
<div class="section"><h3>Paint & movement</h3><label class="field" for="method">Rendering<select id="method"><option value="ghibli">Gouache</option><option value="paint">Painted splats</option><option value="gaussian">Soft Gaussians</option></select></label><label class="check"><input id="wind" type="checkbox"> Gentle breeze</label><label class="check"><input id="orbit" type="checkbox"> Turntable</label></div>
<div class="section"><h3>Take it with you</h3><div class="exports"><button id="export-splat">Export .splat</button><button id="export-recipe">Save recipe</button></div><p class="note">Export the tree geometry or save a recipe to reproduce this view.</p></div><p class="note" id="feedback" role="status">The grove uses your shape settings. Architecture changes the large tree at the right.</p></aside></main>`;
$('seed').value=state.seed;
// A loaded brush preserves discrete pigment marks on this study only.
class TreeBrushRenderer extends GaussianBrushRenderer{
 splatShaders(){const s=super.splatShaders();s.fragmentShader=s.fragmentShader.replace('loadedPaint*max(body*dry,underpaint),.34','loadedPaint*max(body*dry,underpaint),.60');s.fragmentShader=s.fragmentShader.replace('grain*.14','grain*.22');
  s.fragmentShader=s.fragmentShader.replace('if(alpha<.004',`if(skyKernel>.5){
   vec2 skyPoint=vec2(paintSurface.x+paintSurface.z*.23,paintSurface.y+paintSurface.z*.41);
   float wash=(paintNoise(skyPoint*.64)-.5)*.105+(paintNoise(skyPoint*2.4)-.5)*.045;
   surfaceColor*=1.+wash;
  }
  if(alpha<.004`);return s;}
}
const engine=new TreeBrushRenderer($('tree-canvas'),{sceneDefinitions:[]});
Object.assign(engine.options,{mode:'ghibli',quality:'studio',brushScale:1,coverage:1.1,softness:.14,plantLOD:false,foregroundDOF:false,indirect:false,tintedShadows:false,sun:false,lensDirt:false,lensFlare:false,painterlyVignette:false,gouacheTexture:.72,gouacheBlend:.58,gouacheTone:.18});
const stage=$('stage');let definition,queued=false,frame=0,ready=false,captureReady=Promise.resolve();
function resize(){
 const split=stage.classList.contains('comparing'),stacked=matchMedia('(max-width:680px)').matches,canvas=$('tree-canvas');
 const regionWidth=stage.clientWidth/(split&&!stacked?2:1),regionHeight=stage.clientHeight/(split&&stacked?2:1);
 // Both comparison frames use the source aspect, with identical letterboxing.
 const width=split?Math.min(regionWidth,regionHeight*4096/2685):regionWidth,height=split?width*2685/4096:regionHeight;
 Object.assign(canvas.style,{width:`${width}px`,height:`${height}px`,left:`${(regionWidth-width)/2}px`,top:`${(regionHeight-height)/2}px`});
 engine.resize(width,height);if(ready&&!cameraTouched)engine.resetCamera();invalidate();
}
function invalidate(){if(!queued){queued=true;frame=requestAnimationFrame(t=>{queued=false;if(ready)engine.render(t);if(engine.needsFrame)invalidate();});}}
engine.onInvalidate=invalidate;
let cameraTouched=false;engine.controls.addEventListener('start',()=>cameraTouched=true);
function regenerate(){
 $('loading').hidden=false;
 try{
  definition=buildTreeScene(state);
  const grove=state.view==='grove',fit=Math.max(1,state.height,state.width*.9);
  const eye=grove?[0,2+5.7*Math.max(1,state.height),22*fit]:[.5,4.8*Math.max(1,state.height),19*fit];
  const target=grove?[0,2+4.4*Math.max(1,state.height),0]:[0,4*Math.max(1,state.height),0];
  engine.sceneDefinitions=[{camera:{position:eye,target,fov:grove?39:37,fitAspect:grove?1.42:.7},create:()=>definition}];
  engine.cache.clear();engine.load(0);engine.windPlaying=$('wind').checked;engine.autoOrbit=$('orbit').checked;
  ready=true;cameraTouched=false;
  $('architecture-scope').textContent=grove?'Edits the large tree at the right.':'Edits the tree in view.';
  $('caption').textContent=`${TREE_SPECIES[state.species].label} · ${TREE_PALETTES[state.palette].label}`;
  $('stats').textContent=`${definition.trees.length} ${grove?'trees':'tree'} · ${definition.splats.length.toLocaleString()} splats`;
  const q=new URLSearchParams(Object.entries(state));history.replaceState(null,'',`${location.pathname}?${q}`);
  window.$features={...state,count:definition.splats.length};resize();invalidate();
  captureReady=(async()=>{do{engine.render();await engine.waitForGPU();}while(engine.dirty||engine.resizePending);window.rendered=$('tree-canvas');document.dispatchEvent(new CustomEvent('genart:done'));})();
  captureReady.catch(error=>{$('feedback').textContent=`The render could not finish: ${error.message}. Try Reset view.`;console.error(error);});
 }catch(error){$('feedback').textContent=`Unable to generate trees: ${error.message}. Try another seed.`;console.error(error);}
 $('loading').hidden=true;
}
let timer;function schedule(){clearTimeout(timer);timer=setTimeout(regenerate,130);}
for(const id of ['height','width','density','age'])$(id).addEventListener('input',()=>{state[id]=Number($(id).value);$(`${id}-value`).textContent=`${Math.round(state[id]*100)}%`;schedule();});
$('species').onchange=()=>{state.species=$('species').value;regenerate();};
for(const b of document.querySelectorAll('[data-palette]'))b.onclick=()=>{state.palette=b.dataset.palette;for(const e of document.querySelectorAll('[data-palette]'))e.setAttribute('aria-pressed',String(e===b));$('palette-name').textContent=TREE_PALETTES[state.palette].label;regenerate();};
for(const view of ['grove','specimen'])$(view).onclick=()=>{state.view=view;for(const v of ['grove','specimen'])$(v).setAttribute('aria-pressed',String(view===v));regenerate();};
$('seed').onchange=()=>{state.seed=$('seed').value||'1947';regenerate();};
$('new-seed').onclick=()=>{state.seed=String(crypto.getRandomValues(new Uint32Array(1))[0]);$('seed').value=state.seed;regenerate();};
$('reset-camera').onclick=()=>{cameraTouched=false;engine.resetCamera();};
$('wind').onchange=()=>{engine.windPlaying=$('wind').checked;invalidate();};
$('orbit').onchange=()=>{engine.autoOrbit=$('orbit').checked;invalidate();};
$('method').onchange=()=>engine.setStyle('mode',$('method').value);
$('compare').onclick=()=>{const show=$('reference').hidden;$('reference').hidden=!show;$('compare').setAttribute('aria-pressed',String(show));stage.classList.toggle('comparing',show);resize();};
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('save-image').onclick=async()=>{try{download(await engine.exportPNG(),`sillage-trees-${state.seed}.png`,'image/png');$('feedback').textContent='Image saved.';}catch(e){$('feedback').textContent=`Image could not be saved: ${e.message}`;}};
$('export-recipe').onclick=()=>download(JSON.stringify({version:1,url:location.href,parameters:state,trees:definition.trees},null,2),`tree-recipe-${state.seed}.json`,'application/json');
$('export-splat').onclick=()=>{const trees=definition.splats.filter(s=>s.material==='wood'||s.material==='foliage');download(encodeTreeSplats(trees),`trees-${state.seed}.splat`,'application/octet-stream');$('feedback').textContent=`Exported ${trees.length.toLocaleString()} tree splats.`;};
new ResizeObserver(resize).observe(stage);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)invalidate();});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);engine.dispose();},{once:true});
window.treeStudio={engine,state,get definition(){return definition;},regenerate};
window.render=async seed=>{state.seed=String(seed);$('seed').value=state.seed;engine.autoOrbit=false;$('orbit').checked=false;$('wind').checked=false;regenerate();await captureReady;};
resize();requestAnimationFrame(regenerate);
