import './featureLab.css';
import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {featureLabScenes, LAB_MATERIALS} from './featureLabScenes.js';
import {SPLAT_MATERIAL_DEFAULTS} from './SplatMaterialResponse.js';
import {balanceStudioBounce} from './StudioBounce.js';
import {RENDER_MODES} from './ghibliPaint.js';

const $=id=>document.getElementById(id);
const icons={brush:'<path d="m14 5 5 5M6 15 18 3l3 3L9 18M9 18c0 4-4 4-7 4 2-2 0-6 4-6z"/>',prev:'<path d="m14 6-6 6 6 6"/>',next:'<path d="m10 6 6 6-6 6"/>',reset:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',play:'<path d="m8 5 11 7-11 7z"/>',pause:'<path d="M9 5v14M15 5v14"/>',export:'<path d="M12 15V3m-4 4 4-4 4 4M5 14v6h14v-6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const check=(id,label,checked=false)=>`<label class="check"><input id="${id}" type="checkbox" ${checked?'checked':''}>${label}</label>`;
const materialRanges={
  'studio-intensity':{key:'studioIntensity',label:'HDRI intensity',min:0,max:4,step:.05,digits:2,unit:'×'},
  'studio-rotation':{key:'studioRotation',label:'HDRI rotation',min:0,max:360,step:1,unit:'°'},
  'film-thickness':{key:'iridescenceThickness',label:'Film thickness',min:0,max:1200,step:5,unit:'nm'},
  'film-ior':{key:'iridescenceIOR',label:'Film IOR',min:1.1,max:2.4,step:.01,digits:2},
  'film-roughness':{key:'iridescenceRoughness',label:'Roughness',min:.04,max:1,step:.01,percent:true},
  'film-variation':{key:'iridescenceVariation',label:'Thickness variation',min:0,max:1,step:.01,percent:true},
  'film-strength':{key:'iridescenceStrength',label:'Film strength',min:0,max:1,step:.01,percent:true},
  'jade-thickness':{key:'jadeThickness',label:'Thickness',min:.05,max:1.2,step:.01,digits:2,unit:'m'},
  'jade-transmission':{key:'jadeTransmission',label:'Transmission',min:0,max:1,step:.01,percent:true},
  'metal-roughness':{key:'metalRoughness',label:'Roughness',min:.06,max:1,step:.01,percent:true},
  'metal-reflection':{key:'metalReflectionStrength',label:'Reflection strength',min:0,max:2,step:.01,percent:true},
  'metal-direction':{key:'metalRotation',label:'Brush direction',min:0,max:180,step:1,unit:'°'},
  'metal-anisotropy':{key:'anisotropy',label:'Anisotropy',min:0,max:.95,step:.01,percent:true},
};
const materialValue=(value,range)=>range.percent?`${Math.round(value*100)}%`:`${value.toFixed(range.digits??0)}${range.unit?' '+range.unit:''}`;
const materialRange=id=>{const r=materialRanges[id],value=SPLAT_MATERIAL_DEFAULTS[r.key];return `<label class="field"><span class="field-row">${r.label}<output id="${id}-value">${materialValue(value,r)}</output></span><input id="${id}" type="range" min="${r.min}" max="${r.max}" step="${r.step}" value="${value}"></label>`;};
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelector('#app').innerHTML=`
  <header class="lab-header">
    <a href="/splat.html" class="brand"><span>Sillage</span></a><h1 class="sr-only">Splat engine showcase</h1>
    <div class="header-actions"><button id="scenes-toggle" aria-expanded="false" aria-controls="scene-panel">Scenes</button><button id="controls-toggle" aria-expanded="false" aria-controls="controls-panel">Controls</button></div>
  </header>
  <main class="lab-layout">
    <section class="lab-workspace" aria-label="Live engine demo">
      <div class="stage" id="stage"><canvas id="lab-canvas" tabindex="0" aria-label="Live 3D splat scene. Drag to orbit, scroll to zoom, right-drag to pan. Press H to hide the interface."></canvas><div id="message" class="stage-message" role="status"><div><p id="message-text">Preparing the scene…</p><button id="retry" hidden>Retry scene</button><button id="skip" hidden>Skip scene</button></div></div></div>
      <div class="scene-heading"><h2 id="scene-title">Material response</h2><span id="scene-count" class="scene-count"></span><div class="stage-caption"><span id="subject-caption">Polished gold</span><span id="method-caption">Soft Gaussians</span></div></div>
      <div class="transport" aria-label="Tour controls"><button id="previous" aria-label="Previous mini scene" title="Previous scene">${icon('prev')}</button><button id="tour" aria-label="Pause tour" title="Pause tour">${icon('pause')}</button><button id="next" aria-label="Next mini scene" title="Next scene">${icon('next')}</button></div>
      <div class="tour-progress" role="progressbar" aria-label="Time until next mini scene" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="progress"></span></div>
      <dl class="stats" aria-label="Live renderer statistics">${[['fps','FPS'],['cpu','CPU frame'],['sort','Sort'],['splats','Splats'],['culled','Culled'],['calls','Draw calls'],['resolution','Resolution']].map(([id,label])=>`<div data-stat="${id}"><dt>${label}</dt><dd id="stat-${id}">—</dd></div>`).join('')}</dl>
      <p class="sr-only" id="status" role="status">Preparing renderer. CPU submission time excludes GPU execution.</p>
    </section>
    <aside id="scene-panel" class="floating-panel" aria-label="Choose a mini scene" hidden><h2>Mini scenes</h2><nav class="scene-list" aria-label="Choose a mini scene">${featureLabScenes.map((s,i)=>`<button class="scene-pick" data-scene="${i}" aria-current="${i===0}"><span class="pick-index">${String(i+1).padStart(2,'0')}</span>${s.label}</button>`).join('')}</nav></aside>
    <aside id="controls-panel" class="floating-panel" aria-label="Render controls" hidden>
      <section class="controls" aria-label="Render controls"><h2>Render controls</h2>
        <label class="field">Rendering method<select id="method">${Object.entries(RENDER_MODES).map(([id,m])=>`<option value="${id}">${m.label}</option>`).join('')}</select></label>
        <label class="field">Viewport quality<select id="quality"><option value="draft">Low power</option><option value="studio" selected>Studio</option></select></label>
        <label class="field">Time per scene<select id="duration"><option value="12">12 seconds</option><option value="24" selected>24 seconds</option><option value="40">40 seconds</option><option value="60">60 seconds</option></select></label>
        <div id="material-controls" class="control-group"><h3>Surface sample</h3><label class="field">Material<select id="material">${LAB_MATERIALS.map((m,i)=>`<option value="${i}">${m.label}</option>`).join('')}</select></label>${check('cycle-materials','Cycle materials',true)}${['studio-intensity','studio-rotation'].map(materialRange).join('')}</div>
        <div id="iridescence-controls" class="control-group" hidden><h3>Thin-film shader</h3>${['film-thickness','film-ior','film-roughness','film-variation','film-strength'].map(materialRange).join('')}</div>
        <div id="jade-controls" class="control-group" hidden><h3>Jade transmission</h3>${['jade-thickness','jade-transmission'].map(materialRange).join('')}</div>
        <div id="metal-controls" class="control-group" hidden><h3>Metal surface</h3>${['metal-roughness','metal-reflection'].map(materialRange).join('')}<div id="anisotropic-controls" hidden>${['metal-anisotropy','metal-direction'].map(materialRange).join('')}</div></div>
        <div id="crow-controls" class="control-group" hidden><h3>Crow animation</h3><label class="field">Motion clip<select id="crow-clip"></select></label>${check('crow-cycle','Cycle motion clips',true)}</div>
        <div id="focus-controls" class="control-group" hidden><h3>Focus</h3>${check('focus-auto','Autofocus')}<label class="field"><span class="field-row">Focus distance<output id="focus-distance-value">13.5 m</output></span><input id="focus-distance" type="range" min="2" max="40" step="0.1" value="13.5"></label><label class="field"><span class="field-row">Blur strength<output id="focus-blur-value">95%</output></span><input id="focus-blur" type="range" min="0" max="1" step="0.01" value="0.95"></label><p class="control-note">Click any surface to pull focus to it.</p></div>
        <div id="optics-controls" class="control-group" hidden><h3>Diffraction & fringe</h3>${check('optics-diffraction','Diffraction',true)}${check('optics-fringe','Red/blue fringe',true)}<label class="field"><span class="field-row">Optical spread<output id="optics-spread-value">2.0×</output></span><input id="optics-spread" type="range" min="0.25" max="3" step="0.05" value="2"></label><label class="field"><span class="field-row">Fringe strength<output id="optics-fringe-value">90%</output></span><input id="optics-fringe-strength" type="range" min="0" max="1" step="0.01" value="0.9"></label></div>
        <div id="fog-controls" class="control-group" hidden><h3>Dynamic fog</h3>${check('fog-auto','Automatic swirls',true)}<label class="field"><span class="field-row">Density<output id="fog-density-value">100%</output></span><input id="fog-density" type="range" min="0" max="2" step="0.05" value="1"></label><label class="field"><span class="field-row">Drift speed<output id="fog-speed-value">1.6×</output></span><input id="fog-speed" type="range" min="0" max="5" step="0.1" value="1.6"></label></div>
        <div id="bounce-controls" class="control-group" hidden><h3>Bounced light</h3><label class="field"><span class="field-row">Reflector balance<output id="bounce-balance-value">Warm / cool</output></span><input id="bounce-balance" aria-label="Reflector balance, warm to cool" type="range" min="0" max="1" step="0.01" value="0.5"></label><label class="field"><span class="field-row">Bounce strength<output id="bounce-strength-value">1.8×</output></span><input id="bounce-strength" type="range" min="0" max="4" step="0.05" value="1.8"></label><label class="field"><span class="field-row">Preserve pigment<output id="tone-preservation-value">35%</output></span><input id="tone-preservation" type="range" min="0" max="1" step="0.01" value="0.35"></label></div>
        <div id="ssao-controls" class="control-group" hidden><h3>Ambient occlusion</h3><label class="field" for="ssao-strength"><span class="field-row">Strength<output id="ssao-strength-value">115%</output></span><input id="ssao-strength" type="range" min="0" max="3" step="0.05" value="1.15"></label><label class="field" for="ssao-radius"><span class="field-row">World radius<output id="ssao-radius-value">0.65 m</output></span><input id="ssao-radius" type="range" min="0.08" max="3" step="0.01" value="0.65"></label>${check('ssao-debug','Show occlusion only')}<p class="control-note">Half resolution · 16 depth samples. Pause motion to compare the same frame.</p></div><div class="control-group"><h3>Drawing & light</h3>${check('ssao','Ambient occlusion')}${check('pixel-filter','Pixel filtering')}${check('indirect','Color bleed')}${check('tintedShadows','Shadow tint')}${check('foregroundDOF','Depth of field')}${check('plantLOD','Adaptive detail',true)}</div>
        <div class="control-group"><h3>Lens effects</h3>${check('sun','Optical sun')}${check('lensFlare','Lens flare')}${check('lensDirt','Lens dirt')}${check('painterlyVignette','Painted vignette')}</div>
        <div id="water-controls" class="control-group" hidden><h3>Water optics</h3>${check('reflections','Reflections',true)}${check('refraction','Refraction',true)}${check('caustics','Caustics',true)}<label class="field"><span class="field-row">Wave height<output id="wave-value">25 mm</output></span><input id="wave" type="range" min="0" max="0.12" step="0.005" value="0.025"></label></div>
        <div id="season-controls" class="control-group" hidden><h3>Season</h3><label class="field"><span class="field-row">Season cycle<output id="season-value">Summer</output></span><input id="season" type="range" min="0" max="1" step="0.005" value="0"></label>${check('season-play','Animate seasons',true)}</div>
        <div id="reef-controls" class="control-group" hidden><h3>Underwater</h3>${check('reef-night','Night mode')}${check('reef-rays','Light shafts',true)}${check('reef-diffraction','Goggle diffraction',true)}${check('reef-caustics','Caustics',true)}${check('reef-audio','Underwater sound')}</div>
        <p class="control-note"><kbd>Space</kbd> pauses the tour. <kbd>←</kbd> <kbd>→</kbd> change scenes. <kbd>R</kbd> resets the view. <kbd>H</kbd> hides the UI; tap the scene or press <kbd>Escape</kbd> to restore it. Rendering is capped at 30 fps.</p>
      </section>

      <div class="stage-tools"><button id="motion" aria-pressed="true">Pause motion</button><button id="orbit" aria-pressed="false">Auto orbit</button><button id="reset" aria-label="Reset view">${icon('reset')}Reset view</button><button id="fullscreen" aria-label="Enter fullscreen">${icon('expand')}Fullscreen</button><button id="export" aria-label="Export PNG" disabled>${icon('export')}Export PNG</button><button id="hide-ui">Hide UI</button></div>
      <div class="scene-notes"><p id="scene-description"></p><div id="features" class="feature-tags" aria-label="Demonstrated engine features"></div></div><p id="interaction-hint" class="control-note">Drag to orbit · Scroll to zoom</p>
    </aside>
  </main>`;

let engine,current=0,loading=false,failed=false,disposed=false,exporting=false,frame=0,generation=0,cameraEdited=false;
let touring=!reduced,moving=!reduced,elapsed=0,lastTick=null,lastRender=0,materialElapsed=0,statsAt=0,frames=0,cpuTotal=0;
const styleChecks=['ssao','pixelFilter','indirect','tintedShadows','foregroundDOF','plantLOD','sun','lensFlare','lensDirt','painterlyVignette'];
const ids={pixelFilter:'pixel-filter'};
const format=new Intl.NumberFormat('en-US');
function invalidate(){if(!frame&&!disposed&&!document.hidden&&!exporting)frame=requestAnimationFrame(draw);}
function syncTour(){const label=touring?'Pause tour':'Play tour';$('tour').innerHTML=icon(touring?'pause':'play');$('tour').setAttribute('aria-label',label);$('tour').title=label;$('tour').setAttribute('aria-pressed',String(touring));}
function markDirty(){engine.dirty=true;invalidate();}
function writeActor(){
  if(!engine.actor)return;
  engine.updateColors();
  engine.actor.advance?.(0);engine.actor.writePacked(engine.texture.image.data,engine.centers,engine.actorStart);
  engine.textureUploads.mark(engine.actorStart*20,engine.actor.splats.length*20);
  engine.sortDirty=true;engine.reflectionViewKey=null;markDirty();
}
function setMotion(value){
  moving=value;engine.setActorPlaying(value);engine.setWindPlaying(value);engine.setSporesPlaying(value);
  engine.setThermalPlaying(value);engine.reefCaustics?.setPlaying(value);engine.causticClouds?.setPlaying(value);
  engine.cliffSeasons?.setPlaying(value&&$('season-play').checked&&!featureLabScenes[current].fogStudy);
  if(engine.reefSequence){engine.reefSequence.playing=value;engine.reefSequence.lastTime=null;}
  engine.reefAudio?.setActive(value&&!document.hidden);
  $('motion').textContent=value?'Pause motion':'Play motion';$('motion').setAttribute('aria-pressed',String(value));markDirty();
}
function syncStyle(){
  for(const key of styleChecks)$(ids[key]??key).checked=Boolean(engine.options[key]);
  $('plantLOD').disabled=!engine.lod;
  $('method').value=engine.options.mode;$('quality').value=engine.options.quality;
  $('method-caption').textContent=RENDER_MODES[engine.options.mode].label;syncMaterialUI();$('ssao-controls').hidden=!engine.options.ssao;
}
function syncMaterialUI(){
  const kind=engine.actor?.setMaterial?LAB_MATERIALS[engine.actor.materialIndex].kind:'';
  $('iridescence-controls').hidden=kind!=='iridescent';$('jade-controls').hidden=kind!=='jade';$('metal-controls').hidden=!['metal','brushed','copper','chrome','anisotropic'].includes(kind);$('anisotropic-controls').hidden=!['brushed','anisotropic'].includes(kind);
  for(const id of ['studio-intensity','metal-roughness','metal-reflection','metal-direction','metal-anisotropy']){const r=materialRanges[id],value=engine.options[r.key]??SPLAT_MATERIAL_DEFAULTS[r.key];$(id).value=value;$(id+'-value').textContent=materialValue(value,r);}
}
function syncStudyControls(){
  for(const [id,r] of Object.entries(materialRanges)){const value=engine.options[r.key]??SPLAT_MATERIAL_DEFAULTS[r.key];$(id).value=value;$(id+'-value').textContent=materialValue(value,r);}
  syncMaterialUI();
  const o=engine.options;
  $('ssao-controls').hidden=!o.ssao;$('ssao-debug').checked=Boolean(o.ssaoDebug);$('ssao-strength').value=o.ssaoStrength;$('ssao-strength-value').textContent=`${Math.round(o.ssaoStrength*100)}%`;$('ssao-radius').value=o.ssaoRadius;$('ssao-radius-value').textContent=`${o.ssaoRadius.toFixed(2)} m`;
  $('focus-auto').checked=Boolean(o.autoFocus);$('focus-distance').value=o.focusDistance??13.5;$('focus-distance-value').textContent=`${(o.focusDistance??13.5).toFixed(1)} m`;
  $('focus-blur').value=o.dofStrength;$('focus-blur-value').textContent=`${Math.round(o.dofStrength*100)}%`;
  $('optics-diffraction').checked=Boolean(o.lensDiffraction);$('optics-fringe').checked=Boolean(o.chromaticAberration);
  $('optics-spread').value=o.diffractionScale;$('optics-spread-value').textContent=`${o.diffractionScale.toFixed(1)}×`;
  $('optics-fringe-strength').value=o.fringeStrength;$('optics-fringe-value').textContent=`${Math.round(o.fringeStrength*100)}%`;
  $('bounce-strength').value=o.bounceStrength;$('bounce-strength-value').textContent=`${o.bounceStrength.toFixed(1)}×`;
  $('fog-auto').checked=engine.fogDynamics?.auto??true;
  $('fog-density').value=o.fogDensity??1;$('fog-density-value').textContent=`${Math.round((o.fogDensity??1)*100)}%`;
  $('fog-speed').value=o.fogSpeed??1.6;$('fog-speed-value').textContent=`${(o.fogSpeed??1.6).toFixed(1)}×`;
  $('tone-preservation').value=o.tonePreservation;$('tone-preservation-value').textContent=`${Math.round(o.tonePreservation*100)}%`;
}
function showError(error){
  failed=true;$('message').hidden=false;$('message-text').textContent=`This scene could not render: ${error.message}`;
  $('retry').hidden=false;$('skip').hidden=false;$('export').disabled=true;
  $('status').textContent='Scene unavailable. Retry or skip to the next study.';invalidate();
}
async function selectScene(index){
  const token=++generation;current=(index+featureLabScenes.length)%featureLabScenes.length;
  const config=featureLabScenes[current];loading=true;failed=false;elapsed=0;materialElapsed=0;frames=0;cpuTotal=0;statsAt=performance.now();
  $('scene-title').textContent=config.label;$('scene-count').textContent=`${String(current+1).padStart(2,'0')} / ${featureLabScenes.length}`;
  $('scene-description').textContent=config.description;$('features').replaceChildren(...config.features.map(label=>{const span=document.createElement('span');span.textContent=label;return span;}));
  document.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-current',String(+b.dataset.scene===current)));
  $('message').hidden=false;$('message-text').textContent=`Preparing ${config.label.toLowerCase()}…`;$('retry').hidden=true;$('skip').hidden=true;$('export').disabled=true;
  $('progress').style.width='0%';$('status').textContent='Loading scene geometry and preparing rendering passes…';
  history.replaceState(null,'',`?scene=${config.id.replace('lab-','')}`);
  invalidate();
  try{
    await config.prepare?.();if(token!==generation||disposed)return;
    await engine.waitForGPU();if(token!==generation||disposed)return;
    // Every study starts from its own preset; settings never leak from the reef or thermal pass.
    Object.assign(engine.options,config.initialStyle,{quality:$('quality').value||'studio'});
    engine.setAutoOrbit(false);$('orbit').setAttribute('aria-pressed','false');
    cameraEdited=false;engine.load(current);
    if(config.bounceStudy){const light=engine.cache.get(current).lighting;balanceStudioBounce(light,.5,engine.colorResponse);engine.colorDirty=true;$('bounce-balance').value='.5';$('bounce-balance-value').textContent='Warm / cool';}
    if(engine.causticClouds)engine.causticClouds.sky.visible=false;
    engine.reefNightColor?.set('#000000');
    if(config.fogStudy){engine.cliffSeasons.seek(.5);engine.cliffSeasons.setPlaying(false);engine.cliffSeasons.uniforms.winterFogStrength.value=engine.options.fogDensity;engine.cliffSeasons.uniforms.winterFogSpeed.value=engine.options.fogSpeed;}
    await engine.actorReady;if(token!==generation||disposed)return;
    await engine.prepareMaterialEnvironment(engine.cache.get(current)?.materialEnvironment);if(token!==generation||disposed)return;
    if(engine.actorError)throw engine.actorError;
    if(engine.reefSequence)engine.reefSequence.seek(18);
    $('material-controls').hidden=!config.materialCycle;
    $('crow-controls').hidden=!engine.actor?.demoClips;
    $('fog-controls').hidden=!config.fogStudy;$('focus-controls').hidden=!config.focusStudy;$('optics-controls').hidden=!config.opticsStudy;$('bounce-controls').hidden=!config.bounceStudy;
    syncStudyControls();
    $('crow-clip').replaceChildren(...(engine.actor?.clipNames??[]).map(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;return option;}));
    $('crow-cycle').checked=true;if(engine.actor?.demoClip)$('crow-clip').value=engine.actor.demoClip;$('water-controls').hidden=!engine.water;
    $('season-controls').hidden=!engine.cliffSeasons||config.fogStudy;$('reef-controls').hidden=!engine.reefCaustics;
    $('reflections').checked=true;$('refraction').checked=engine.refraction?.enabled??false;$('caustics').checked=true;
    const initialMaterial=config.initialMaterial??0;$('material').value=String(initialMaterial);engine.actor?.setMaterial?.(initialMaterial);writeActor();
    $('season-play').checked=moving;$('season').value='0';
    $('reef-night').checked=false;$('reef-audio').checked=false;$('reef-rays').checked=true;$('reef-diffraction').checked=true;$('reef-caustics').checked=true;
    if(engine.water){$('wave').value=engine.water.amplitude;$('wave-value').textContent=`${Math.round(engine.water.amplitude*1000)} mm`;}
    $('interaction-hint').textContent=engine.fogDynamics?'Tap to stir the fog · Drag to orbit':engine.water?'Click water for ripples · Drag to orbit':engine.options.foregroundDOF?'Click to focus · Drag to orbit':'Drag to orbit · Scroll to zoom';
    setMotion(moving);syncStyle();loading=false;lastTick=null;
    // Retain only the current and preceding CPU definitions; GPU resources are disposed by load().
    while(engine.cache.size>2)engine.cache.delete(engine.cache.keys().next().value);
    $('message').hidden=true;$('export').disabled=false;
    $('status').textContent='Live WebGL2 · 30 fps cap · CPU frame excludes GPU execution time';
    invalidate();
  }catch(error){if(token===generation&&!disposed){loading=false;showError(error);}}
}
function updateStats(now,force=false){
  if(now-statsAt<600&&!force)return;
  const s=engine.stats,seconds=(now-statsAt)/1000;
  $('stat-fps').textContent=frames?Math.min(30,frames/seconds).toFixed(1):'Idle';
  $('stat-cpu').textContent=frames?`${(cpuTotal/frames).toFixed(1)} ms`:'—';
  $('stat-sort').textContent=`${(s.sortMs??0).toFixed(2)} ms`;
  $('stat-splats').textContent=format.format(s.submitted??s.count);
  $('stat-culled').textContent=format.format(s.culled??0);$('stat-calls').textContent=String(s.calls);
  $('stat-resolution').textContent=`${s.width} × ${s.height}`;
  if(engine.lod)$('subject-caption').textContent=`${engine.lod.stats.refinedPlants} refined plants`;
  else if(engine.actor?.setMaterial){$('subject-caption').textContent=LAB_MATERIALS[engine.actor.materialIndex].label;syncMaterialUI();}
  else if(engine.actor?.demoClip){$('subject-caption').textContent=`Crow · ${engine.actor.demoClip}`;$('crow-clip').value=engine.actor.demoClip;}
  else if(featureLabScenes[current].fogStudy)$('subject-caption').textContent='Cliff rocks · drifting fog';
  else if(featureLabScenes[current].focusStudy)$('subject-caption').textContent=`Focus ${engine.getFocusDistance().toFixed(1)} m`;
  else if(featureLabScenes[current].opticsStudy)$('subject-caption').textContent=[engine.options.lensDiffraction?'Diffraction':'',engine.options.chromaticAberration?'Red/blue fringe':''].filter(Boolean).join(' · ')||'Unprocessed';
  else if(featureLabScenes[current].ssaoStudy)$('subject-caption').textContent=engine.options.ssao?(engine.options.ssaoDebug?'Occlusion buffer':'Live contact shadows'):'SSAO off';
  else if(featureLabScenes[current].bounceStudy)$('subject-caption').textContent=engine.options.indirect?`Bounce ${engine.options.bounceStrength.toFixed(1)}×`:'Direct light';
  else $('subject-caption').textContent='Live 3D splats';
  if(engine.cliffSeasons){$('season-value').textContent=engine.cliffSeasons.phase;$('season').value=engine.cliffSeasons.position;}
  if(engine.reefCaustics)$('reef-night').checked=engine.reefCaustics.night.value;
  frames=0;cpuTotal=0;statsAt=now;
}
function draw(now){
  frame=0;if(disposed||document.hidden||exporting)return;
  const dt=lastTick===null?0:Math.min((now-lastTick)/1000,.1);lastTick=now;
  if(!loading&&!failed){
    if(touring&&$('scene-panel').hidden&&$('controls-panel').hidden){elapsed+=dt;const progress=Math.min(100,elapsed/(+$('duration').value)*100);$('progress').style.width=`${progress}%`;$('progress').parentElement.setAttribute('aria-valuenow',String(Math.round(progress)));
      if(elapsed>=+$('duration').value){void selectScene(current+1);return;}}
    if(moving&&featureLabScenes[current].materialCycle&&$('cycle-materials').checked&&engine.actor?.setMaterial){
      materialElapsed+=dt;if(materialElapsed>=2.5){materialElapsed=0;engine.actor.setMaterial(engine.actor.materialIndex+1);$('material').value=String(engine.actor.materialIndex);writeActor();}}
    if(now-lastRender>=1000/30-.5&&engine.needsFrame){
      try{const start=performance.now();if(engine.render(now)){cpuTotal+=performance.now()-start;frames++;lastRender=now;}}
      catch(error){showError(error);return;}
    }
    updateStats(now,!engine.needsFrame&&!touring);
    if(engine.contextLost){showError(new Error('The graphics context was lost. Reload this page to restore it.'));return;}
  }
  if(touring||loading||(!failed&&engine.needsFrame))invalidate();
}

function closePanels(restoreFocus=false){
  for(const name of ['scenes','controls']){
    const button=$(name+'-toggle'),panel=$(name==='scenes'?'scene-panel':'controls-panel');
    if(!panel.hidden&&restoreFocus)button.focus();
    panel.getAnimations().forEach(animation=>animation.cancel());panel.hidden=true;button.setAttribute('aria-expanded','false');
  }
}
for(const name of ['scenes','controls'])$(name+'-toggle').onclick=event=>{
  const panel=$(name==='scenes'?'scene-panel':'controls-panel'),open=panel.hidden;
  closePanels();panel.hidden=!open;$(name+'-toggle').setAttribute('aria-expanded',String(open));
  if(open&&event.detail>0&&!reduced){
    const trigger=$(name+'-toggle').getBoundingClientRect(),bounds=panel.getBoundingClientRect();
    panel.style.transformOrigin=`${trigger.left+trigger.width/2-bounds.left}px top`;
    panel.animate([{opacity:0,transform:'translateY(-4px) scale(.98)'},{opacity:1,transform:'none'}],{duration:180,easing:'cubic-bezier(.23,1,.32,1)'});
  }
};
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.floating-panel,.header-actions'))closePanels();});
function toggleInterface(){closePanels();document.body.classList.toggle('ui-hidden');$('lab-canvas').focus();}
$('hide-ui').onclick=toggleInterface;

$('previous').onclick=()=>void selectScene(current-1);$('next').onclick=()=>void selectScene(current+1);
$('skip').onclick=()=>void selectScene(current+1);$('retry').onclick=()=>void selectScene(current);
document.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>{closePanels();void selectScene(+b.dataset.scene);});
$('tour').onclick=()=>{touring=!touring;lastTick=null;syncTour();$('scene-count').textContent=`${String(current+1).padStart(2,'0')} / ${featureLabScenes.length}`;invalidate();};
$('motion').onclick=()=>setMotion(!moving);
$('orbit').onclick=()=>{const enabled=!engine.autoOrbit;cameraEdited=true;engine.setAutoOrbit(enabled);$('orbit').setAttribute('aria-pressed',String(enabled));};
$('reset').onclick=()=>{cameraEdited=false;engine.resetCamera();invalidate();};
$('method').onchange=()=>{engine.setStyle('mode',$('method').value);syncStyle();writeActor();};
$('quality').onchange=()=>engine.setStyle('quality',$('quality').value);
for(const key of styleChecks)$(ids[key]??key).onchange=()=>{engine.setStyle(key,$(ids[key]??key).checked);if(key==='ssao')$('ssao-controls').hidden=!engine.options.ssao;};
$('ssao-debug').onchange=()=>engine.setStyle('ssaoDebug',$('ssao-debug').checked);
$('ssao-strength').oninput=()=>{const value=+$('ssao-strength').value;engine.setStyle('ssaoStrength',value);$('ssao-strength-value').textContent=`${Math.round(value*100)}%`;};
$('ssao-radius').oninput=()=>{const value=+$('ssao-radius').value;engine.setStyle('ssaoRadius',value);$('ssao-radius-value').textContent=`${value.toFixed(2)} m`;};
$('fog-auto').onchange=()=>{if(engine.fogDynamics)engine.fogDynamics.auto=$('fog-auto').checked;markDirty();};
$('fog-density').oninput=()=>{const value=+$('fog-density').value;engine.options.fogDensity=value;engine.cliffSeasons.uniforms.winterFogStrength.value=value;$('fog-density-value').textContent=`${Math.round(value*100)}%`;markDirty();};
$('fog-speed').oninput=()=>{const value=+$('fog-speed').value;engine.options.fogSpeed=value;engine.cliffSeasons.uniforms.winterFogSpeed.value=value;$('fog-speed-value').textContent=`${value.toFixed(1)}×`;markDirty();};
$('focus-auto').onchange=()=>engine.setStyle('autoFocus',$('focus-auto').checked);
$('focus-distance').oninput=()=>{engine.setStyle('focusDistance',+$('focus-distance').value);$('focus-auto').checked=false;$('focus-distance-value').textContent=`${(+$('focus-distance').value).toFixed(1)} m`;};
$('focus-blur').oninput=()=>{engine.setStyle('dofStrength',+$('focus-blur').value);$('focus-blur-value').textContent=`${Math.round(+$('focus-blur').value*100)}%`;};
$('optics-diffraction').onchange=()=>engine.setStyle('lensDiffraction',$('optics-diffraction').checked);
$('optics-fringe').onchange=()=>engine.setStyle('chromaticAberration',$('optics-fringe').checked);
$('optics-spread').oninput=()=>{engine.setStyle('diffractionScale',+$('optics-spread').value);$('optics-spread-value').textContent=`${(+$('optics-spread').value).toFixed(1)}×`;};
$('optics-fringe-strength').oninput=()=>{engine.setStyle('fringeStrength',+$('optics-fringe-strength').value);$('optics-fringe-value').textContent=`${Math.round(+$('optics-fringe-strength').value*100)}%`;};
$('bounce-balance').oninput=()=>{const balance=+$('bounce-balance').value,lighting=engine.cache.get(current)?.lighting;if(!lighting?.warm)return;balanceStudioBounce(lighting,balance,engine.colorResponse);engine.colorDirty=true;$('bounce-balance-value').textContent=balance===.5?'Warm / cool':balance<.5?`${Math.round((1-balance)*100)}% warm`:`${Math.round(balance*100)}% cool`;markDirty();};
$('bounce-strength').oninput=()=>{engine.setStyle('bounceStrength',+$('bounce-strength').value);$('bounce-strength-value').textContent=`${(+$('bounce-strength').value).toFixed(1)}×`;};
$('tone-preservation').oninput=()=>{engine.setStyle('tonePreservation',+$('tone-preservation').value);$('tone-preservation-value').textContent=`${Math.round(+$('tone-preservation').value*100)}%`;};
$('material').onchange=()=>{engine.actor?.setMaterial?.(+$('material').value);$('cycle-materials').checked=false;materialElapsed=0;writeActor();syncMaterialUI();};
for(const [id,r] of Object.entries(materialRanges))$(id).oninput=()=>{const value=+$(id).value;engine.setStyle(r.key,value);$(id+'-value').textContent=materialValue(value,r);};
$('crow-clip').onchange=()=>{engine.actor?.selectDemoClip?.($('crow-clip').value);$('crow-cycle').checked=false;writeActor();};
$('crow-cycle').onchange=()=>{if(engine.actor)engine.actor.demoCycle=$('crow-cycle').checked;};
$('reflections').onchange=()=>engine.setStyle('waterReflection',$('reflections').checked);
$('refraction').onchange=()=>engine.setWaterRefraction('enabled',$('refraction').checked);
$('caustics').onchange=()=>{if(engine.forestCaustics)engine.forestCaustics.settings.z=$('caustics').checked?1.1:0;markDirty();};
$('wave').oninput=()=>{engine.setWaterMotion('amplitude',+$('wave').value);$('wave-value').textContent=`${Math.round(+$('wave').value*1000)} mm`;};
$('season').oninput=()=>{engine.cliffSeasons?.setPlaying(false);$('season-play').checked=false;engine.cliffSeasons?.seek(+$('season').value);$('season-value').textContent=engine.cliffSeasons?.phase;markDirty();};
$('season-play').onchange=()=>{engine.cliffSeasons?.setPlaying($('season-play').checked&&moving);markDirty();};
$('reef-night').onchange=()=>engine.setReefNight($('reef-night').checked);
$('reef-rays').onchange=()=>{if(engine.reefCaustics)engine.reefCaustics.rays.value=$('reef-rays').checked;markDirty();};
$('reef-diffraction').onchange=()=>{if(engine.reefCaustics)engine.reefCaustics.diffraction.value=$('reef-diffraction').checked;markDirty();};
$('reef-caustics').onchange=()=>{engine.reefCaustics?.setEnabled($('reef-caustics').checked);markDirty();};
$('reef-audio').onchange=async()=>{try{await engine.reefAudio?.setEnabled($('reef-audio').checked);if(engine.reefAudio?.error)throw engine.reefAudio.error;}catch(error){$('reef-audio').checked=false;$('status').textContent=`Sound unavailable: ${error.message}`;}};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('app').requestFullscreen();}catch{$('status').textContent='Fullscreen is unavailable in this browser.';}};
document.addEventListener('fullscreenchange',()=>$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen'));
$('export').onclick=async()=>{
  const button=$('export');button.disabled=true;exporting=true;cancelAnimationFrame(frame);frame=0;
  try{const blob=await engine.exportPNG(),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`sillage-${featureLabScenes[current].id}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  catch(error){$('status').textContent=`Export failed: ${error.message}`;}
  finally{exporting=false;button.disabled=failed;lastTick=null;invalidate();}
};
let pointerStart;
$('lab-canvas').addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY];engine.setAutoOrbit(false);$('orbit').setAttribute('aria-pressed','false');});
$('lab-canvas').addEventListener('pointerup',e=>{
  if(e.button!==0||!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>4||loading||failed)return;
  if(document.body.classList.contains('ui-hidden')){document.body.classList.remove('ui-hidden');return;}
  const rect=e.currentTarget.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*2-1,y=1-(e.clientY-rect.top)/rect.height*2;
  if(engine.fogDynamics)engine.disturbFogAt(x,y);else if(engine.water)engine.disturbWaterAt(x,y);else if(engine.options.foregroundDOF){engine.focusAt(x,y);syncStudyControls();}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closePanels(true);document.body.classList.remove('ui-hidden');return;}
  if(e.altKey||e.ctrlKey||e.metaKey||/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;
  if(e.key.toLowerCase()==='h'){toggleInterface();return;}
  if(e.code==='Space'){e.preventDefault();$('tour').click();}
  else if(e.key==='ArrowRight'){e.preventDefault();void selectScene(current+1);}
  else if(e.key==='ArrowLeft'){e.preventDefault();void selectScene(current-1);}
  else if(e.key.toLowerCase()==='r')$('reset').click();
});
document.addEventListener('visibilitychange',()=>{lastTick=null;engine.lastActorTime=null;engine.lastWindTime=null;engine.lastSporeTime=null;engine.lastThermalTime=null;
  if(engine.reefSequence)engine.reefSequence.lastTime=null;if(engine.reefCaustics)engine.reefCaustics.lastTime=null;
  if(engine.cliffSeasons)engine.cliffSeasons.lastTime=null;
  if(document.hidden){cancelAnimationFrame(frame);frame=0;engine.reefAudio?.setEnabled(false);$('reef-audio').checked=false;}else invalidate();});
function dispose(){if(disposed)return;disposed=true;generation++;cancelAnimationFrame(frame);resize?.disconnect();engine?.dispose();}
window.addEventListener('pagehide',dispose);if(import.meta.hot)import.meta.hot.dispose(dispose);
let resize;
try{
  engine=new GaussianBrushRenderer($('lab-canvas'),{sceneDefinitions:featureLabScenes});engine.onInvalidate=invalidate;
  engine.controls.addEventListener('start',()=>{cameraEdited=true;});
  resize=new ResizeObserver(([entry])=>{engine.resize(entry.contentRect.width,entry.contentRect.height);if(!cameraEdited&&featureLabScenes[current].camera.fitAspect&&engine.sceneIndex===current)engine.resetCamera();});resize.observe($('stage'));
  window.brushDemo={engine,scenes:featureLabScenes,selectScene,get current(){return current;},get touring(){return touring;},get moving(){return moving;},get loading(){return loading;},get failed(){return failed;},dispose};
  syncTour();const id=new URLSearchParams(location.search).get('scene');
  const first=featureLabScenes.findIndex(s=>s.id===`lab-${id}`);void selectScene(Math.max(0,first));
}catch(error){showError(error);}
