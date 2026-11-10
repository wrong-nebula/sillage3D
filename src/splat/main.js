import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import './style.css';
import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {scenes} from './studioScenes.js';
import {LENS_DIRT_DEFAULTS} from './LensDirtPass.js';
import {SUN_DEFAULTS} from './PainterlySun.js';
import {FLARE_DEFAULTS} from './lensFlare.js';
import {VIGNETTE_DEFAULTS} from './PainterlyVignettePass.js';
import {DOF_DEFAULTS} from './ForegroundDOF.js';
import {GHIBLI_DEFAULTS,RENDER_MODES} from './ghibliPaint.js';
import {COURIER_KEYS} from './CourierController.js';
import {CLIFF_PHYSICS_KEYS} from './CliffPhysics.js';

const icons = {
  brush:'<path d="m14 5 5 5M6 15 18 3l3 3L9 18M9 18c0 4-4 4-7 4 2-2 0-6 4-6z"/>',
  reset:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  export:'<path d="M12 15V3m-4 4 4-4 4 4M5 14v6h14v-6"/>',
  expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  compare:'<path d="M12 3v18M8 5H3v14h5m8-14h5v14h-5"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14v3"/>',
  orbit:'<ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-28 12 12)"/><circle cx="12" cy="12" r="3"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const escape = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const studyCopy={
  alpine:{label:'Alpine',caption:'Ridges, clouds & meadow',description:'Cool stone ridges above a meadow of broad, warm strokes.',swatch:'alpine'},
  cathedral:{label:'Cathedral',caption:'Mist, stone & reflected light',description:'Gothic stonework in violet mist, above a pavement touched with light.',swatch:'cathedral'},
  meadow:{label:'Meadow',caption:'Flowers, paths & distant hills',description:'A winding path through flowers, shrubs, and distant hills.',swatch:'meadow'},
};
const studies=scenes.map(scene=>{
  const fallback=studyCopy[scene.id]||{};
  return {
    label:scene.label??fallback.label??scene.title??scene.id,
    caption:scene.caption??fallback.caption??scene.subtitle??'',
    description:scene.description??fallback.description??scene.subtitle??'',
    swatch:scene.swatch??fallback.swatch??scene.id,
  };
});
const sceneShortcut=index=>scenes[index]?.shortcut??(index<10?String((index+1)%10):'');

document.querySelector('#app').innerHTML = `
  <header class="topbar">
    <a class="brand" href="/splat.html" aria-label="Sillage studio"><span>Sillage</span></a>
    <span class="studio-label">Gaussian paint study</span>
    <a class="previous-version" href="/tech-demo.html">Engine tech demo ${icon('arrow')}</a>
    <select id="export-scale" aria-label="Export size"><option value="1">Export 1× · up to 1920 px</option><option value="2">Export 2× · up to 3840 px</option><option value="4">Export 4× · up to 7680 px</option></select>
    <button id="export-frame" aria-label="Export PNG" class="primary" disabled>${icon('export')}<span>Export PNG</span></button>
  </header>
  <main class="studio">
    <section class="workspace" aria-label="Gaussian splat scene">
      <div class="workspace-heading">
        <div><h1 id="scene-title">${escape(studies[0].label)}</h1><p id="scene-description">${escape(studies[0].description)}</p></div>
        <div class="viewport-tools" role="group" aria-label="Viewport tools">
          <button id="compare" aria-label="Reference" aria-pressed="false" title="Compare the reference artwork">${icon('compare')}<span>Reference</span></button>
          <button id="fullscreen" class="icon-button" aria-label="Expand viewport" title="Expand viewport">${icon('expand')}</button>
        </div>
      </div>
      <div class="viewport-shell" id="viewport-shell">
        <div id="viewport">
          <canvas id="render" tabindex="0" aria-label="Full 3D splat scene. Drag to orbit, scroll to zoom, and right-drag to pan."></canvas>
          <span id="focus-mark" class="focus-mark" aria-hidden="true" hidden></span>
          <div id="reference-mask" hidden><img id="reference-image" alt="Supplied painted reference artwork"><span class="reference-label">Reference artwork</span></div>
          <div id="comparison-line" hidden aria-hidden="true"><span>${icon('compare')}</span></div>
          <div class="view-caption"><span id="render-label">Painted splats</span><span>Full 3D</span></div>
          <div id="loading" class="loading-state" role="status"><span>Planting the first brush marks…</span></div>
        </div>
      </div>
      <div id="compare-control" class="compare-control" hidden><span>Rendered scene</span><input type="range" id="compare-split" min="0" max="100" step="1" value="50" aria-label="Reference comparison split"><span>Reference artwork</span></div>
      <div class="viewport-footer">
        <span class="orbit-guide" id="orbit-guide">Drag to orbit <span>·</span> Scroll to zoom</span>
        <div class="camera-tools"><button id="panorama-view" aria-label="View mirrored panorama" hidden>Panorama</button><button id="terrain-view" aria-label="View terrain layout" hidden>Terrain</button><button id="waterfall-view" aria-label="View waterfalls" title="Explore the falls to the left" hidden>Waterfalls</button><label id="actor-motion-field" class="actor-motion" hidden>Motion <select id="actor-motion" aria-label="Character motion"></select></label><button id="actor-sound" aria-label="Mute courier sounds" aria-pressed="true" hidden>Sound on</button><button id="actor-toggle" aria-label="Pause dog" aria-pressed="true" hidden>Pause dog</button><button id="wind-toggle" aria-label="Pause wind" aria-pressed="true" hidden>Pause wind</button><button id="spore-toggle" aria-label="Pause spores" aria-pressed="true" hidden>Pause spores</button><button id="camera-lock" aria-label="Lock view" aria-pressed="false">${icon('unlock')}<span class="lock-label">Lock view</span></button><button id="auto-orbit" aria-label="Gentle orbit" aria-pressed="false">${icon('orbit')}<span>Gentle orbit</span></button><button id="reset-camera" aria-label="Reset view" title="Restore the composed view (R)">${icon('reset')}<span>Reset view</span></button></div>
      </div>
      <nav class="studies" aria-label="Choose a scene">
        ${studies.map((study,index)=>`<button class="study${index===0?' active':''}" data-scene="${index}" aria-pressed="${index===0}"><span class="study-swatch ${escape(study.swatch)}" aria-hidden="true"></span><span><strong>${escape(study.label)}</strong><small>${escape(study.caption)}</small></span><kbd>${sceneShortcut(index).toUpperCase()}</kbd></button>`).join('')}
      </nav>
      <footer class="render-status"><span id="status" role="status">Preparing renderer</span><span id="render-stats"></span></footer>
    </section>
    <aside class="inspector" aria-label="Paint controls">
      <div class="inspector-heading"><h2>Paint controls</h2><span id="paint-lock-status" class="quiet-button" hidden>Settings locked</span><button id="reset-style" class="quiet-button" title="Reset paint controls">Reset</button></div>
      <section class="setting-group">
        <label class="field-label" for="render-mode">Rendering method</label>
        <select id="render-mode">${Object.entries(RENDER_MODES).map(([value,mode])=>`<option value="${value}">${mode.label}</option>`).join('')}</select>
        <p class="field-help" id="mode-description">Layered dabs with defined edges and a visible brush direction.</p>
        <div id="pixel-filter-setting">
          <button id="pixel-filter" class="bleed-toggle" aria-pressed="false" aria-describedby="pixel-filter-help"><span>Pixel filtering</span><span id="pixel-filter-state" aria-hidden="true">Off</span></button>
          <p class="field-help" id="pixel-filter-help">Keeps small marks from swelling as you zoom out. Fine details may look lighter.</p>
        </div>
      </section>
      <section class="setting-group" id="water-settings" hidden>
        <h3>Water motion</h3>
        <div class="range-setting"><label for="water-amplitude">Wave height <output id="water-amplitude-value">35 mm</output></label><input id="water-amplitude" type="range" min="0" max="0.12" step="0.005" value="0.035"></div>
        <div class="range-setting"><label for="water-speed">Current speed <output id="water-speed-value">0.65×</output></label><input id="water-speed" type="range" min="0" max="2" step="0.05" value="0.65"></div>
        <div id="water-refraction-settings" hidden>
          <button id="water-refraction" class="bleed-toggle" aria-pressed="true"><span>Refraction</span><span id="water-refraction-state" aria-hidden="true">On</span></button>
          <div class="range-setting"><label for="water-clarity">Water clarity <output id="water-clarity-value">72%</output></label><input id="water-clarity" type="range" min="0" max="1" step="0.01" value="0.72"></div>
          <p class="field-help">Waves bend the view of the pool bed. Clearer water reveals more beneath the surface.</p>
        </div>
        <p class="field-help">Click the water to send out ripples. Currents bend around submerged trunks.</p>
      </section>
      <section class="setting-group" id="reef-light-settings" aria-labelledby="reef-light-heading" hidden>
        <h3 id="reef-light-heading">Reef light</h3>
        <button id="reef-night" class="bleed-toggle" aria-pressed="false" aria-describedby="reef-night-help"><span>Night mode</span><span id="reef-night-state" aria-hidden="true">Off</span></button>
        <p class="field-help" id="reef-night-help">Day and night alternate every 20 seconds after the opening. Coral glows in waves at night.</p>
        <button id="reef-replay" class="bleed-toggle">Replay opening</button>
        <button id="reef-sound" class="bleed-toggle" aria-pressed="false" aria-describedby="reef-sound-help"><span>Underwater sound</span><span id="reef-sound-state" aria-hidden="true">Off</span></button>
        <p class="field-help" id="reef-sound-help">Binaural underwater ambience. Use headphones and turn the camera to hear the surrounding currents.</p>
        <button id="reef-rays" class="bleed-toggle" aria-pressed="true"><span>Light shafts</span><span id="reef-rays-state" aria-hidden="true">On</span></button>
        <button id="reef-diffraction" class="bleed-toggle" aria-pressed="true"><span>Goggle diffraction</span><span id="reef-diffraction-state" aria-hidden="true">On</span></button>
        <button id="reef-caustics" class="bleed-toggle" aria-pressed="true"><span>Caustics</span><span id="reef-caustics-state" aria-hidden="true">On</span></button>
        <button id="reef-caustics-motion" class="bleed-toggle" aria-pressed="true"><span>Animate water</span><span id="reef-caustics-motion-state" aria-hidden="true">On</span></button>
      </section>
      <section class="setting-group" id="season-settings" aria-labelledby="season-heading" hidden>
        <h3 id="season-heading">Season</h3>
        <div class="range-setting">
          <label for="season-cycle">Season cycle <span id="season-phase" aria-hidden="true">Summer</span></label>
          <input id="season-cycle" type="range" min="0" max="100" step="1" value="0" aria-valuetext="Summer" aria-describedby="season-help">
        </div>
        <p class="field-help" id="season-help">Move the slider to pause and explore the four seasons.</p>
        <button id="season-play" type="button" class="bleed-toggle">Pause season cycle</button>
      </section>
      <section class="setting-group paint-settings">
        <div class="range-setting"><label for="brush-scale">Brush size <output for="brush-scale" id="brush-scale-value">1.00×</output></label><input id="brush-scale" type="range" min="0.65" max="1.6" step="0.01" value="1"></div>
        <div class="range-setting"><label for="coverage">Paint coverage <output for="coverage" id="coverage-value">100%</output></label><input id="coverage" type="range" min="0.5" max="1.5" step="0.01" value="1"></div>
        <div class="range-setting"><label for="softness">Edge softness <output for="softness" id="softness-value">20%</output></label><input id="softness" type="range" min="0" max="1" step="0.01" value="0.2"></div>
      </section>
      <section class="setting-group quality-settings">
        <label class="field-label" for="quality">Viewport quality</label>
        <select id="quality"><option value="draft">Low power</option><option value="studio">Studio</option></select>
        <p class="field-help">Renders on demand. Gentle orbit runs at up to 30 fps.</p>
        <div id="plant-lod-setting" hidden>
          <button id="plant-lod" class="bleed-toggle" aria-pressed="true"><span>Adaptive plant detail</span><span id="plant-lod-state" aria-hidden="true">On</span></button>
          <p class="field-help">Nearby plants gain finer strokes. Distant plants stay light.</p>
        </div>
      </section>
      <section class="setting-group gouache-settings" id="gouache-settings" aria-labelledby="gouache-heading" hidden>
        <h3 id="gouache-heading">Gouache painting</h3>
        <div class="range-setting"><label for="gouache-texture">Pigment grain <output for="gouache-texture" id="gouache-texture-value">55%</output></label><input id="gouache-texture" type="range" min="0" max="1" step="0.05" value="${GHIBLI_DEFAULTS.gouacheTexture}"></div>
        <div class="range-setting"><label for="gouache-blend">Paint blending <output for="gouache-blend" id="gouache-blend-value">70%</output></label><input id="gouache-blend" type="range" min="0" max="1" step="0.05" value="${GHIBLI_DEFAULTS.gouacheBlend}"></div>
        <div class="range-setting"><label for="gouache-tone">Color depth <output for="gouache-tone" id="gouache-tone-value">65%</output></label><input id="gouache-tone" type="range" min="0" max="1" step="0.05" value="${GHIBLI_DEFAULTS.gouacheTone}"></div>
        <div class="range-setting"><label for="paper-scale">Paper scale <output for="paper-scale" id="paper-scale-value">1.00×</output></label><input id="paper-scale" type="range" min="0.05" max="4" step="0.05" value="${GHIBLI_DEFAULTS.paperScale}"></div>
        <p class="field-help" id="paper-scale-help">Size of the wash and grain shared across strokes.</p>
        <p class="field-help">Broad color washes meet fine, dry brushwork. Paint blending joins nearby strokes while keeping their edges.</p>
      </section>
      <section class="setting-group camera-settings" aria-labelledby="camera-heading">
        <h3 id="camera-heading">Camera</h3>
        <div class="range-setting"><label for="focal-length">Focal length <output for="focal-length" id="focal-length-value">—</output></label><input id="focal-length" type="range" min="18" max="135" step="1" value="35" aria-describedby="focal-length-help"></div>
        <p class="field-help" id="focal-length-help">Adjust the lens without moving the camera.</p>
      </section>
      <section class="setting-group dof-settings" aria-labelledby="dof-heading">
        <h3 id="dof-heading">Depth of field</h3>
        <button id="foreground-dof" class="bleed-toggle" aria-pressed="false" aria-describedby="dof-help"><span>Depth of field</span><span id="foreground-dof-state" aria-hidden="true">Off</span></button>
        <button id="auto-focus" class="bleed-toggle" aria-pressed="true"><span>Auto focus</span><span id="auto-focus-state" aria-hidden="true">On</span></button>
        <p class="field-help" id="dof-help">Focus follows the camera’s center. Click a plant to hold focus on it; Auto focus follows the center again.</p>
        <p class="field-help">Focus distance <output id="focus-distance-value">—</output></p>
        <div class="range-setting"><label for="dof-strength">Strength <output for="dof-strength" id="dof-strength-value">65%</output></label><input id="dof-strength" type="range" min="0" max="1" step="0.05" value="${DOF_DEFAULTS.dofStrength}" disabled></div>
        <div class="range-setting"><label for="dof-range">Reach <output for="dof-range" id="dof-range-value">85%</output></label><input id="dof-range" type="range" min="0.3" max="0.95" step="0.05" value="${DOF_DEFAULTS.dofRange}" disabled></div>
        <div class="range-setting"><label for="dof-swirl">Swirl <output for="dof-swirl" id="dof-swirl-value">30%</output></label><input id="dof-swirl" type="range" min="0" max="1" step="0.05" value="${DOF_DEFAULTS.dofSwirl}" disabled></div>
      </section>
      <section class="setting-group indirect-settings" aria-labelledby="indirect-heading">
        <h3 id="indirect-heading">Indirect light</h3>
        <button id="color-bleed" class="bleed-toggle" aria-pressed="true" aria-describedby="indirect-help"><span>Color bleed</span><span id="color-bleed-state" aria-hidden="true">On</span></button>
        <p class="field-help" id="indirect-help">Nearby surfaces bounce color onto each brush mark.</p>
        <div class="range-setting"><label for="bounce-strength">Bounce strength <output for="bounce-strength" id="bounce-strength-value">100%</output></label><input id="bounce-strength" type="range" min="0" max="2" step="0.05" value="1"></div>
        <p class="field-help">Baked in world space · stays fixed as you orbit.</p>
      </section>
      <section class="setting-group response-settings" aria-labelledby="response-heading">
        <h3 id="response-heading">Color response</h3>
        <div class="range-setting"><label for="tone-preservation">Tone preservation <output for="tone-preservation" id="tone-preservation-value">80%</output></label><input id="tone-preservation" type="range" min="0" max="1" step="0.05" value="0.8" aria-describedby="response-help"></div>
        <p class="field-help" id="response-help">Keeps the painted values while allowing reflected color.</p>
      </section>
      <section class="setting-group shadow-settings" aria-labelledby="shadows-heading">
        <h3 id="shadows-heading">Shadows</h3>
        <button id="tinted-shadows" class="bleed-toggle" aria-pressed="true" aria-describedby="shadows-help"><span>Tinted shadows</span><span id="tinted-shadows-state" aria-hidden="true">On</span></button>
        <p class="field-help" id="shadows-help">Tints occluded and unlit surfaces in world space.</p>
        <div class="color-setting"><label for="shadow-tint">Shadow tint</label><input id="shadow-tint" type="color" value="#66759b"></div>
        <div class="range-setting"><label for="shadow-tint-strength">Tint strength <output for="shadow-tint-strength" id="shadow-tint-strength-value">35%</output></label><input id="shadow-tint-strength" type="range" min="0" max="1" step="0.05" value="0.35"></div>
      </section>
      <section class="setting-group sun-settings" aria-labelledby="sun-heading">
        <h3 id="sun-heading">Sky sun</h3>
        <button id="sun" class="bleed-toggle" aria-pressed="${SUN_DEFAULTS.sun}" aria-describedby="sun-help"><span>Painterly sun</span><span id="sun-state" aria-hidden="true">${SUN_DEFAULTS.sun?'On':'Off'}</span></button>
        <p class="field-help" id="sun-help">A small circle of round splats. Scene lighting stays fixed.</p>
        <div class="range-setting"><label for="sun-azimuth">Azimuth <output for="sun-azimuth" id="sun-azimuth-value">${SUN_DEFAULTS.sunAzimuth}°</output></label><input id="sun-azimuth" type="range" min="-180" max="180" step="0.1" value="${SUN_DEFAULTS.sunAzimuth}" aria-label="Sun azimuth" ${SUN_DEFAULTS.sun?'':'disabled'}></div>
        <div class="range-setting"><label for="sun-elevation">Elevation <output for="sun-elevation" id="sun-elevation-value">${SUN_DEFAULTS.sunElevation}°</output></label><input id="sun-elevation" type="range" min="-10" max="85" step="0.1" value="${SUN_DEFAULTS.sunElevation}" aria-label="Sun elevation" ${SUN_DEFAULTS.sun?'':'disabled'}></div>
        <div class="range-setting"><label for="sun-size">Disc size <output for="sun-size" id="sun-size-value">${SUN_DEFAULTS.sunSize.toFixed(2).replace(/0$/, '')}×</output></label><input id="sun-size" type="range" min="1" max="8" step="0.25" value="${SUN_DEFAULTS.sunSize}" aria-label="Sun disc size" ${SUN_DEFAULTS.sun?'':'disabled'}></div>
        <div class="range-setting"><label for="sun-intensity">Brightness <output for="sun-intensity" id="sun-intensity-value">${SUN_DEFAULTS.sunIntensity.toFixed(1)}×</output></label><input id="sun-intensity" type="range" min="0" max="20" step="0.5" value="${SUN_DEFAULTS.sunIntensity}" aria-label="Sun brightness" ${SUN_DEFAULTS.sun?'':'disabled'}></div>
      </section>
      <section class="setting-group flare-settings" aria-labelledby="flare-heading">
        <h3 id="flare-heading">Lens flare</h3>
        <button id="lens-flare" class="bleed-toggle" aria-pressed="${FLARE_DEFAULTS.lensFlare}" aria-describedby="flare-help"><span>Splat lens flare</span><span id="lens-flare-state" aria-hidden="true">${FLARE_DEFAULTS.lensFlare?'On':'Off'}</span></button>
        <p class="field-help" id="flare-help">A few bright splats with soft edges and a gentle bloom.</p>
        <div class="range-setting"><label for="lens-flare-strength">Strength <output for="lens-flare-strength" id="lens-flare-strength-value">${Math.round(FLARE_DEFAULTS.lensFlareStrength*100)}%</output></label><input id="lens-flare-strength" type="range" min="0" max="2" step="0.05" value="${FLARE_DEFAULTS.lensFlareStrength}" aria-label="Lens flare strength" ${FLARE_DEFAULTS.lensFlare?'':'disabled'}></div>
        <div class="range-setting"><label for="lens-flare-scale">Ghost size <output for="lens-flare-scale" id="lens-flare-scale-value">${FLARE_DEFAULTS.lensFlareScale.toFixed(1)}×</output></label><input id="lens-flare-scale" type="range" min="0.5" max="2" step="0.1" value="${FLARE_DEFAULTS.lensFlareScale}" aria-label="Lens flare ghost size" ${FLARE_DEFAULTS.lensFlare?'':'disabled'}></div>
        <div class="range-setting"><label for="lens-flare-bloom">Bloom <output for="lens-flare-bloom" id="lens-flare-bloom-value">${Math.round(FLARE_DEFAULTS.lensFlareBloom*100)}%</output></label><input id="lens-flare-bloom" type="range" min="0" max="1.5" step="0.05" value="${FLARE_DEFAULTS.lensFlareBloom}" aria-label="Lens flare bloom" ${FLARE_DEFAULTS.lensFlare?'':'disabled'}></div>
      </section>
      <section class="setting-group lens-settings" aria-labelledby="lens-heading">
        <h3 id="lens-heading">Lens dirt</h3>
        <button id="lens-dirt" class="bleed-toggle" aria-pressed="${LENS_DIRT_DEFAULTS.lensDirt}" aria-describedby="lens-help"><span>Painterly lens dirt</span><span id="lens-dirt-state" aria-hidden="true">${LENS_DIRT_DEFAULTS.lensDirt?'On':'Off'}</span></button>
        <p class="field-help" id="lens-help">Bright areas reveal painted lens dabs.</p>
        <div class="range-setting"><label for="lens-dirt-strength">Strength <output for="lens-dirt-strength" id="lens-dirt-strength-value">${Math.round(LENS_DIRT_DEFAULTS.lensDirtStrength*100)}%</output></label><input id="lens-dirt-strength" type="range" min="0" max="1" step="0.05" value="${LENS_DIRT_DEFAULTS.lensDirtStrength}" aria-label="Lens dirt strength" ${LENS_DIRT_DEFAULTS.lensDirt?'':'disabled'}></div>
        <div class="range-setting"><label for="lens-dirt-scale">Mark size <output for="lens-dirt-scale" id="lens-dirt-scale-value">${LENS_DIRT_DEFAULTS.lensDirtScale.toFixed(1)}×</output></label><input id="lens-dirt-scale" type="range" min="0.5" max="2" step="0.1" value="${LENS_DIRT_DEFAULTS.lensDirtScale}" aria-label="Lens dirt mark size" ${LENS_DIRT_DEFAULTS.lensDirt?'':'disabled'}></div>
      </section>
      <section class="setting-group vignette-settings" aria-labelledby="vignette-heading">
        <h3 id="vignette-heading">Vignette</h3>
        <button id="painterly-vignette" class="bleed-toggle" aria-pressed="${VIGNETTE_DEFAULTS.painterlyVignette}" aria-describedby="vignette-help"><span>Painterly vignette</span><span id="painterly-vignette-state" aria-hidden="true">${VIGNETTE_DEFAULTS.painterlyVignette?'On':'Off'}</span></button>
        <p class="field-help" id="vignette-help">Curved edge splats shift with the camera, leaving the center clearer.</p>
        <div class="range-setting"><label for="vignette-strength">Strength <output for="vignette-strength" id="vignette-strength-value">${Math.round(VIGNETTE_DEFAULTS.vignetteStrength*100)}%</output></label><input id="vignette-strength" type="range" min="0" max="1" step="0.05" value="${VIGNETTE_DEFAULTS.vignetteStrength}" aria-label="Vignette strength" ${VIGNETTE_DEFAULTS.painterlyVignette?'':'disabled'}></div>
        <div class="range-setting"><label for="vignette-spread">Spread <output for="vignette-spread" id="vignette-spread-value">${Math.round(VIGNETTE_DEFAULTS.vignetteSpread*100)}%</output></label><input id="vignette-spread" type="range" min="0" max="1" step="0.05" value="${VIGNETTE_DEFAULTS.vignetteSpread}" aria-label="Vignette spread" ${VIGNETTE_DEFAULTS.painterlyVignette?'':'disabled'}></div>
        <div class="range-setting"><label for="vignette-swirl">Swirl <output for="vignette-swirl" id="vignette-swirl-value">${Math.round(VIGNETTE_DEFAULTS.vignetteSwirl*100)}%</output></label><input id="vignette-swirl" type="range" min="0" max="1" step="0.05" value="${VIGNETTE_DEFAULTS.vignetteSwirl}" aria-label="Vignette swirl" ${VIGNETTE_DEFAULTS.painterlyVignette?'':'disabled'}></div>
      </section>
      <section class="method-note">
        <h3>Paint that holds its place.</h3>
        <p>Scene marks live in three dimensions. Move around the scene to see strokes overlap, turn, and reveal the forms beneath.</p>
        <p class="note-detail">Compare Painted splats, Soft Gaussians, and Gouache on the same scene.</p>
        <a id="open-reference" href="/brush-references/canopy.jpg" target="_blank" rel="noopener">View reference artwork ${icon('arrow')}</a>
      </section>
      <div class="keyboard-help"><span>${studies.map((_,index)=>`<kbd>${sceneShortcut(index).toUpperCase()}</kbd>`).join('')} Switch study</span><span><kbd>R</kbd> Reset camera</span></div>
    </aside>
  </main>
  <div id="toast" role="status" aria-live="polite"></div>`;

const $=id=>document.getElementById(id);
let engine, frame=0, lastFrame=-Infinity, disposed=false, renderFailed=false, exporting=false, current=0, comparing=false, autoOrbit=false, cameraLocked=false, toastTimer;

function toast(message){
  $('toast').textContent=message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600);
}
function fail(error){
  renderFailed=true;
  cancelAnimationFrame(frame);frame=0;
  $('loading').hidden=false;
  $('loading').classList.add('error-state');
  $('loading').innerHTML=`<h2>The scene could not be rendered</h2><p>${escape(error?.message||'Your browser may not support WebGL 2.')}</p><button id="retry-render">Reload experiment</button>`;
  $('retry-render').addEventListener('click',()=>location.reload());
  $('status').textContent='Renderer unavailable';
  $('export-frame').disabled=true;
  document.querySelectorAll('.inspector input,.inspector select,.inspector button,.studies button,#auto-orbit,#reset-camera,#camera-lock').forEach(el=>el.disabled=true);
}
function updateStats(){
  const s=engine.stats||{};
  const count=Number(s.count)||0;
  const stats=`${count.toLocaleString()} splats${s.width&&s.height?` · ${s.width} × ${s.height}`:''}`;
  if($('render-stats').textContent!==stats)$('render-stats').textContent=stats;
  let status=engine.actorLoading?`Loading the ${engine.actorLabel}…`:engine.actorError?`${engine.actorLabel} could not load · reselect this scene to retry`:engine.actorPlaying?`${engine.actor.activity??'Dog walking'} · drag to explore`:cameraLocked?'Ready · view locked':autoOrbit?'Orbiting in 3D':'Ready · drag to explore';
  mirrorCamera();
  if(s.lod?.loading)status='Refining nearby plants…';
  else if(s.lod?.failures)status='Some plant detail could not load · base plants remain visible';
  if($('status').textContent!==status)$('status').textContent=status;
}
function syncActorUI(){
  const button=$('actor-toggle');
  const thermal=engine.thermalMotion;
  const playing=thermal?engine.thermalPlaying:engine.actorPlaying;
  button.hidden=!engine.actor&&!engine.actorLoading&&!thermal;
  button.disabled=engine.actorLoading;
  const label=`${engine.actorLoading?'Loading':playing?'Pause':'Play'} ${thermal?'heat':engine.actorLabel}${engine.actorLoading?'…':''}`;
  button.textContent=label;button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(playing));
  const motions=engine.actor?.animationOptions??[];
  $('actor-motion-field').hidden=motions.length<2;
  const motionKey=JSON.stringify(motions);
  if($('actor-motion').dataset.options!==motionKey){
    $('actor-motion').innerHTML=motions.map((label,index)=>`<option value="${index}">${escape(label)}</option>`).join('');
    $('actor-motion').dataset.options=motionKey;
  }
  if(motions.length)$('actor-motion').value=String(engine.actor.currentClip);
  const audio=engine.actor?.audio;$('actor-sound').hidden=!audio;
  if(audio){audio.onChange=syncActorUI;$('actor-sound').textContent=audio.error?'Sound unavailable':audio.enabled?'Sound on':'Sound off';$('actor-sound').setAttribute('aria-pressed',String(audio.enabled));$('actor-sound').setAttribute('aria-label',audio.enabled?'Mute courier sounds':'Enable courier sounds');}
  if(engine.actorError)toast(`${engine.actorLabel} could not load: ${engine.actorError.message}`);
  updateStats();
}
function schedule(){
  scheduleSave();
  if(!frame&&!disposed&&!renderFailed&&!exporting&&!document.hidden)frame=requestAnimationFrame(draw);
}
function draw(now){
  frame=0;
  if(disposed||exporting||document.hidden||!engine)return;
  const interval=engine.thermalPlaying?1000/60-.5:1000/30;
  if(now-lastFrame<interval){schedule();return;}
  try{if(engine.render(now)){lastFrame=now;updateStats();syncStyleUI();if(engine.cliffSeasons?.playing)syncSeasonUI();scheduleSave();}}
  catch(error){fail(error);return;}
  if(engine.needsFrame)schedule();
}
function setAutoOrbit(enabled){
  enabled=Boolean(enabled)&&!cameraLocked&&!engine.limitedOrbit;
  autoOrbit=enabled;
  $('auto-orbit').setAttribute('aria-pressed',String(enabled));
  engine.setAutoOrbit(enabled);
  schedule();
}
function resetCamera(){
  if(cameraLocked)return;restoreSceneFrame();setAutoOrbit(false);engine.resetCamera();
  const offset=engine.actor?.followOffset;
  if(offset){engine.camera.position.add(offset);engine.controls.target.add(offset);engine.controls.update();}
  syncCameraUI();schedule();
}
function sceneCameraLocked(index){
  if(engine.limitedOrbit)return false;
  const saved=savedState.cameraLocks[scenes[index].id];
  return typeof saved==='boolean'?saved:scenes[index].lockCamera===true;
}
function setCameraLocked(locked,persist=true){
  const limited=Boolean(engine.limitedOrbit);
  cameraLocked=Boolean(locked)&&!limited;
  if(cameraLocked)setAutoOrbit(false);
  engine.controls.enabled=!cameraLocked&&!limited;
  if(limited)engine.limitedOrbit.enabled=true;
  $('camera-lock').hidden=limited;$('auto-orbit').hidden=limited;
  $('auto-orbit').disabled=cameraLocked||limited;$('reset-camera').disabled=cameraLocked;
  const label=cameraLocked?'Unlock view':'Lock view';
  $('camera-lock').setAttribute('aria-pressed',String(cameraLocked));
  $('camera-lock').setAttribute('aria-label',label);
  $('camera-lock').innerHTML=`${icon(cameraLocked?'lock':'unlock')}<span class="lock-label">${label}</span>`;
  $('orbit-guide').innerHTML=limited?'Drag to look around <span>·</span> ±4° around the pond':cameraLocked?'View locked':'Drag to orbit <span>·</span> Scroll to zoom';
  const orbitHelp=engine.controls.enablePan?'Drag to orbit, scroll to zoom, and right-drag to pan.':'Drag to orbit and scroll to zoom.';
  $('render').setAttribute('aria-label',limited?'Full 3D splat scene. Drag to orbit up to four degrees around the pond.':cameraLocked?'Full 3D splat scene. View locked. Choose Unlock view to move the camera.':`Full 3D splat scene. ${orbitHelp}`);
  updateStats();schedule();
  if(persist&&stateReady)saveStateNow();
}
function mirrorCamera(){
  if(!engine)return null;
  const camera=validCamera({position:engine.camera.position.toArray(),target:engine.controls.target.toArray(),fov:engine.camera.fov,focalLength:engine.getFocalLength(),focusPoint:engine.options.autoFocus?null:engine.focus?.anchor?.toArray()});
  if(camera){const json=JSON.stringify(camera);if($('render').dataset.camera!==json)$('render').dataset.camera=json;}
  if($('render').dataset.cameraLocked!==String(cameraLocked))$('render').dataset.cameraLocked=String(cameraLocked);
  syncCameraUI();
  return camera;
}
function syncCameraUI(){
  if(!engine||renderFailed)return;
  const mm=engine.getFocalLength();
  if(!Number.isFinite(mm)||mm<=0)return;
  const input=$('focal-length'),label=`${Number(mm.toFixed(1))} mm`;
  if(input.getAttribute('aria-valuetext')!==label){input.value=String(mm);input.setAttribute('aria-valuetext',label);}
  if($('focal-length-value').value!==label)$('focal-length-value').value=label;
}
function updateCompare(){
  const split=Number($('compare-split').value);
  $('reference-mask').style.clipPath=`inset(0 0 0 ${split}%)`;
  $('comparison-line').style.left=`${split}%`;
}
let selectionRequest=0;
async function selectScene(index){
  if(!engine||!scenes[index])return;
  const request=++selectionRequest;
  try{
    if(stateReady)saveStateNow();
    const scene=scenes[index];
    if(scene.aspect)$('viewport').style.setProperty('--scene-aspect',String(scene.aspect));
    else $('viewport').style.removeProperty('--scene-aspect');
    if(scene.prepare){
      $('loading').hidden=false;
      $('loading').textContent=scene.loadingText??`Loading ${scene.label??scene.title}…`;
      $('export-frame').disabled=true;
      await scene.prepare();
      if(request!==selectionRequest||disposed)return false;
    }
    const previousIsolated=stateReady&&(scenes[current].lockStyle||scenes[current].isolatedStyle);
    setAutoOrbit(false);cameraLocked=false;engine.controls.enabled=true;engine.load(index);current=index;
    if(previousIsolated&&!scene.lockStyle)applyOptions(savedState.options);
    if(!stateReady){
      if(!scene.lockStyle&&!scene.isolatedStyle)applyOptions(scene.initialStyle);
      applyOptions(savedState.options);
      if(scene.lockStyle||scene.isolatedStyle)savedState.options=validOptions(engine.options);
      restoreCamera(savedState.cameras[scene.id]);
      stateReady=true;
    }else if(scene.styleOnFirstVisit&&!savedState.cameras[scene.id]){
      // Apply a first-visit preset when switching studies. Initial loading above
      // has already applied it before saved controls, which must take priority.
      applyOptions(scene.initialStyle);
    }
    // Authored presets explicitly approved for a study are restored on entry.
    if(scene.styleOnVisit)applyOptions(scene.initialStyle);
    const locked=sceneCameraLocked(index);
    if(locked||engine.limitedOrbit)restoreCamera(savedState.cameras[scene.id]);
    setCameraLocked(locked,false);
    if(scene.styleOnVisit&&scene.camera.focalLength)engine.setFocalLength(scene.camera.focalLength);
    $('spore-toggle').hidden=!engine.spores?.count||Boolean(engine.reefCaustics);syncSporeUI();
    $('wind-toggle').hidden=!engine.hasWind;
    $('wind-toggle').textContent=windLabel();
    $('wind-toggle').setAttribute('aria-pressed',String(engine.windPlaying));
    $('wind-toggle').setAttribute('aria-label',windLabel());
    $('water-settings').hidden=!engine.water;
    if(new URLSearchParams(location.search).get('light')==='night')engine.setReefNight(true);
    syncReefCausticsUI();
    syncSeasonUI();
    $('waterfall-view').hidden=!scene.waterfallView;
    $('panorama-view').hidden=!scene.panoramaView;
    $('terrain-view').hidden=!scene.terrainView;
    $('reference-image').style.transform='';
    syncRefractionUI();
    if(engine.water){
      $('water-amplitude').value=engine.water.amplitude;$('water-amplitude-value').textContent=`${Math.round(engine.water.amplitude*1000)} mm`;
      $('water-speed').value=engine.water.speed;$('water-speed-value').textContent=`${engine.water.speed.toFixed(2)}×`;
    }
    $('scene-title').textContent=studies[index].label;
    $('scene-description').textContent=studies[index].description;
    $('compare').hidden=!scene.reference;$('open-reference').hidden=!scene.reference;
    if(scene.reference){$('reference-image').src=scene.reference;$('open-reference').href=scene.reference;}
    else{comparing=false;$('compare').setAttribute('aria-pressed','false');['reference-mask','comparison-line','compare-control'].forEach(id=>$(id).hidden=true);$('reference-image').removeAttribute('src');$('open-reference').removeAttribute('href');}
    document.querySelectorAll('[data-scene]').forEach(button=>{const selected=Number(button.dataset.scene)===index;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
    const url=new URL(location.href);url.searchParams.set('scene',scene.id);history.replaceState(null,'',url);
    syncCameraUI();
    syncStyleUI();
    $('loading').hidden=true;
    $('export-frame').disabled=false;
    schedule();
    return true;
  }catch(error){if(request===selectionRequest&&!disposed)fail(error);return false;}
}
const controls=[
  {id:'gouache-texture',key:'gouacheTexture',initial:GHIBLI_DEFAULTS.gouacheTexture,format:value=>`${Math.round(value*100)}%`},
  {id:'gouache-blend',key:'gouacheBlend',initial:GHIBLI_DEFAULTS.gouacheBlend,format:value=>`${Math.round(value*100)}%`},
  {id:'gouache-tone',key:'gouacheTone',initial:GHIBLI_DEFAULTS.gouacheTone,format:value=>`${Math.round(value*100)}%`},
  {id:'paper-scale',key:'paperScale',initial:GHIBLI_DEFAULTS.paperScale,format:value=>`${value.toFixed(2)}×`},
  {id:'dof-strength',key:'dofStrength',initial:DOF_DEFAULTS.dofStrength,format:value=>`${Math.round(value*100)}%`},
  {id:'dof-range',key:'dofRange',initial:DOF_DEFAULTS.dofRange,format:value=>`${Math.round(value*100)}%`},
  {id:'dof-swirl',key:'dofSwirl',initial:DOF_DEFAULTS.dofSwirl,format:value=>`${Math.round(value*100)}%`},
  {id:'brush-scale',key:'brushScale',initial:1,format:value=>`${value.toFixed(2)}×`},
  {id:'coverage',key:'coverage',initial:1,format:value=>`${Math.round(value*100)}%`},
  {id:'softness',key:'softness',initial:.2,format:value=>`${Math.round(value*100)}%`},
  {id:'bounce-strength',key:'bounceStrength',initial:1,format:value=>`${Math.round(value*100)}%`},
  {id:'tone-preservation',key:'tonePreservation',initial:.8,format:value=>`${Math.round(value*100)}%`},
  {id:'shadow-tint-strength',key:'shadowTintStrength',initial:.35,format:value=>`${Math.round(value*100)}%`},
  {id:'lens-dirt-strength',key:'lensDirtStrength',initial:LENS_DIRT_DEFAULTS.lensDirtStrength,format:value=>`${Math.round(value*100)}%`},
  {id:'lens-dirt-scale',key:'lensDirtScale',initial:LENS_DIRT_DEFAULTS.lensDirtScale,format:value=>`${value.toFixed(1)}×`},
  {id:'sun-azimuth',key:'sunAzimuth',initial:SUN_DEFAULTS.sunAzimuth,format:value=>`${Number(value.toFixed(1))}°`},
  {id:'sun-elevation',key:'sunElevation',initial:SUN_DEFAULTS.sunElevation,format:value=>`${Number(value.toFixed(1))}°`},
  {id:'sun-size',key:'sunSize',initial:SUN_DEFAULTS.sunSize,format:value=>`${value.toFixed(2).replace(/0$/, '')}×`},
  {id:'sun-intensity',key:'sunIntensity',initial:SUN_DEFAULTS.sunIntensity,format:value=>`${value.toFixed(1)}×`},
  {id:'lens-flare-strength',key:'lensFlareStrength',initial:FLARE_DEFAULTS.lensFlareStrength,format:value=>`${Math.round(value*100)}%`},
  {id:'lens-flare-scale',key:'lensFlareScale',initial:FLARE_DEFAULTS.lensFlareScale,format:value=>`${value.toFixed(1)}×`},
  {id:'lens-flare-bloom',key:'lensFlareBloom',initial:FLARE_DEFAULTS.lensFlareBloom,format:value=>`${Math.round(value*100)}%`},
  {id:'vignette-strength',key:'vignetteStrength',initial:VIGNETTE_DEFAULTS.vignetteStrength,format:value=>`${Math.round(value*100)}%`},
  {id:'vignette-spread',key:'vignetteSpread',initial:VIGNETTE_DEFAULTS.vignetteSpread,format:value=>`${Math.round(value*100)}%`},
  {id:'vignette-swirl',key:'vignetteSwirl',initial:VIGNETTE_DEFAULTS.vignetteSwirl,format:value=>`${Math.round(value*100)}%`},
];
// Persist only explicitly supported controls, never arbitrary renderer properties.
const STORAGE_KEY='brushfield.studio-state.v1';
const booleanOptions=['indirect','tintedShadows','lensDirt','sun','lensFlare','painterlyVignette','plantLOD','pixelFilter','foregroundDOF','autoFocus'];
let stateReady=false,saveTimer=0,storageAvailable=true,lastSavedJSON='';
let savedState={version:1,sceneId:null,options:{},cameras:{},cameraLocks:{}};
function validOptions(candidate){
  const result={};
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return result;
  for(const control of controls){
    const value=candidate[control.key],input=$(control.id);
    if(typeof value==='number'&&Number.isFinite(value)&&value>=Number(input.min)&&value<=Number(input.max))result[control.key]=value;
  }
  for(const key of booleanOptions)if(typeof candidate[key]==='boolean')result[key]=candidate[key];
  if(typeof candidate.focusDistance==='number'&&Number.isFinite(candidate.focusDistance)&&candidate.focusDistance>=.15&&candidate.focusDistance<=600)result.focusDistance=candidate.focusDistance;
  if(Object.hasOwn(RENDER_MODES,candidate.mode))result.mode=candidate.mode;
  if(['draft','studio'].includes(candidate.quality))result.quality=candidate.quality;
  if(typeof candidate.shadowTint==='string'&&/^#[0-9a-f]{6}$/i.test(candidate.shadowTint))result.shadowTint=candidate.shadowTint.toLowerCase();
  return result;
}
function validCamera(candidate){
  if(!candidate||typeof candidate!=='object')return null;
  const vector=value=>Array.isArray(value)&&value.length===3&&value.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=10000);
  const validFocalLength=typeof candidate.focalLength==='number'&&Number.isFinite(candidate.focalLength)&&candidate.focalLength>=1&&candidate.focalLength<=1000;
  const validFov=typeof candidate.fov==='number'&&Number.isFinite(candidate.fov)&&candidate.fov>0&&candidate.fov<180&&(validFocalLength||(candidate.fov>=5&&candidate.fov<=120));
  if(!vector(candidate.position)||!vector(candidate.target)||!validFov)return null;
  const distance=Math.hypot(...candidate.position.map((v,i)=>v-candidate.target[i]));
  if(distance<.01||distance>1000)return null;
  const camera={position:candidate.position.slice(),target:candidate.target.slice(),fov:candidate.fov};
  if(validFocalLength)camera.focalLength=candidate.focalLength;
  if(vector(candidate.focusPoint))camera.focusPoint=candidate.focusPoint.slice();
  return camera;
}
function validState(candidate){
  if(!candidate||candidate.version!==1)return null;
  const cameras={},cameraLocks={};
  for(const scene of scenes){
    const camera=validCamera(candidate.cameras?.[scene.id]);
    if(camera)cameras[scene.id]=camera;
    if(typeof candidate.cameraLocks?.[scene.id]==='boolean')cameraLocks[scene.id]=candidate.cameraLocks[scene.id];
  }
  return {version:1,sceneId:scenes.some(scene=>scene.id===candidate.sceneId)?candidate.sceneId:null,options:validOptions(candidate.options),cameras,cameraLocks};
}
function readSavedState(){
  const hotState=validState(import.meta.hot?.data?.studioState);
  if(hotState)return hotState;
  let raw;
  try{raw=localStorage.getItem(STORAGE_KEY);}catch{storageAvailable=false;return null;}
  if(!raw||raw.length>65536)return null;
  try{return validState(JSON.parse(raw));}catch{return null;}
}
function saveStateNow(){
  clearTimeout(saveTimer);saveTimer=0;
  if(!stateReady||!engine||disposed||engine.sceneIndex!==current)return;
  const camera=mirrorCamera();
  if(camera)savedState.cameras[scenes[current].id]=camera;
  savedState.cameraLocks[scenes[current].id]=cameraLocked;
  savedState.sceneId=scenes[current].id;
  if(!scenes[current].lockStyle&&!scenes[current].isolatedStyle)savedState.options=validOptions(engine.options);
  if(!storageAvailable)return;
  try{
    const json=JSON.stringify(savedState);
    if(json!==lastSavedJSON){localStorage.setItem(STORAGE_KEY,json);lastSavedJSON=json;}
  }catch{storageAvailable=false;}
}
function scheduleSave(){
  if(stateReady&&!disposed&&!saveTimer)saveTimer=setTimeout(saveStateNow,250);
}
function applyOptions(options){
  const valid=validOptions(options);
  for(const [key,value] of Object.entries(valid))if(key!=='autoFocus')engine.setStyle(key,value);
  // Restore the saved distance first, then the chosen automatic/manual mode.
  if(valid.autoFocus!==undefined)engine.setStyle('autoFocus',valid.autoFocus);
}
function restoreCamera(camera){
  if(!camera)return;
  if(engine.limitedOrbit)engine.limitedOrbit.restore(camera);
  else{
    engine.camera.position.fromArray(camera.position);
    engine.controls.target.fromArray(camera.target);
    engine.controls.update();
  }
  if(camera.focalLength!==undefined)engine.setFocalLength(camera.focalLength);
  else engine.setCameraFov(camera.fov);
  engine.camera.updateMatrixWorld(true);
  if(camera.focusPoint&&!engine.options.autoFocus)engine.focus?.hold(engine.camera.position.clone().fromArray(camera.focusPoint));
  engine.dirty=true;engine.sortDirty=true;
  syncCameraUI();
}
let lastStyleUISignature='';
function syncStyleUI(){
  if(!engine||renderFailed)return;
  const locked=scenes[current]?.lockStyle===true;
  const renderModes=scenes[current]?.renderModes;
  const distance=`${engine.getFocusDistance().toFixed(1)} m`;
  if($('focus-distance-value').value!==distance)$('focus-distance-value').value=distance;
  const signature=JSON.stringify({...engine.options,focusDistance:0,hasPlantLOD:Boolean(engine.lod),locked,renderModes});
  if(signature===lastStyleUISignature)return;
  lastStyleUISignature=signature;
  $('paint-lock-status').hidden=!locked;
  $('reset-style').hidden=locked;
  for(const id of ['reset-style','render-mode','quality','brush-scale','coverage','tone-preservation',
    'gouache-texture','gouache-blend','gouache-tone','paper-scale','plant-lod'])$(id).disabled=locked;
  // What would give this scene's dabs as many wash cells as the canopy's.
  const paper=engine.stats.paper;
  $('paper-scale-help').textContent=paper?.dab?`Size of the wash and grain shared across strokes. A dab here spans ${paper.cells.toFixed(1)} wash cells; ${(paper.matched/(engine.paperConfig??1)).toFixed(2)}× would match the canopy study.`:'Size of the wash and grain shared across strokes.';
  $('plant-lod-setting').hidden=!engine.lod;
  $('plant-lod').setAttribute('aria-pressed',String(engine.options.plantLOD!==false));
  $('plant-lod-state').textContent=engine.options.plantLOD!==false?'On':'Off';
  const options=engine.options;
  $('auto-focus').setAttribute('aria-pressed',String(options.autoFocus));
  $('auto-focus-state').textContent=options.autoFocus?'On':'Off';$('auto-focus').disabled=locked||!options.foregroundDOF;
  for(const control of controls){
    const value=options[control.key];
    if(typeof value!=='number'||!Number.isFinite(value))continue;
    const input=$(control.id);
    if(Number(input.value)!==value)input.value=String(value);
    $(`${control.id}-value`).value=control.format(value);
  }
  const method=$('render-mode');
  for(const option of method.options)option.textContent=(renderModes?.[option.value]??RENDER_MODES[option.value]).label;
  method.closest('.inspector').classList.toggle('crystal-controls',Boolean(engine.crystalStudio));
  method.value=options.mode;$('quality').value=options.quality;
  $('shadow-tint').value=options.shadowTint;
  const mode=renderModes?.[options.mode]??RENDER_MODES[options.mode]??RENDER_MODES.paint;
  $('render-label').textContent=mode.label;$('mode-description').textContent=mode.description;
  $('softness').disabled=locked||options.mode==='gaussian';
  $('gouache-settings').hidden=options.mode!=='ghibli';
  const groups=[
    ['pixel-filter','pixelFilter',[]],
    ['foreground-dof','foregroundDOF',['dof-strength','dof-range','dof-swirl']],
    ['color-bleed','indirect',['bounce-strength']],
    ['tinted-shadows','tintedShadows',['shadow-tint','shadow-tint-strength']],
    ['lens-dirt','lensDirt',['lens-dirt-strength','lens-dirt-scale']],
    ['sun','sun',['sun-azimuth','sun-elevation','sun-size','sun-intensity']],
    ['lens-flare','lensFlare',['lens-flare-strength','lens-flare-scale','lens-flare-bloom']],
    ['painterly-vignette','painterlyVignette',['vignette-strength','vignette-spread','vignette-swirl']],
  ];
  for(const [id,key,inputs] of groups){
    const enabled=options[key]===true;
    $(id).setAttribute('aria-pressed',String(enabled));$(`${id}-state`).textContent=enabled?'On':'Off';
    $(id).disabled=locked;
    for(const input of inputs)$(input).disabled=locked||!enabled;
  }
}
function setMode(mode){
  engine.setStyle('mode',mode);
  syncStyleUI();
  schedule();
}
function setIndirect(enabled){
  $('color-bleed').setAttribute('aria-pressed',String(enabled));
  $('color-bleed-state').textContent=enabled?'On':'Off';
  $('bounce-strength').disabled=!enabled;
  engine.setStyle('indirect',enabled);
  schedule();
}
function setTintedShadows(enabled){
  $('tinted-shadows').setAttribute('aria-pressed',String(enabled));
  $('tinted-shadows-state').textContent=enabled?'On':'Off';
  $('shadow-tint').disabled=!enabled;
  $('shadow-tint-strength').disabled=!enabled;
  engine.setStyle('tintedShadows',enabled);
  schedule();
}
function setShadowTint(color){
  $('shadow-tint').value=color;
  engine.setStyle('shadowTint',color);
  schedule();
}
function setLensDirt(enabled){
  $('lens-dirt').setAttribute('aria-pressed',String(enabled));
  $('lens-dirt-state').textContent=enabled?'On':'Off';
  $('lens-dirt-strength').disabled=!enabled;
  $('lens-dirt-scale').disabled=!enabled;
  engine.setStyle('lensDirt',enabled);
  schedule();
}
function setSun(enabled){
  $('sun').setAttribute('aria-pressed',String(enabled));
  $('sun-state').textContent=enabled?'On':'Off';
  ['sun-azimuth','sun-elevation','sun-size','sun-intensity'].forEach(id=>$(id).disabled=!enabled);
  engine.setStyle('sun',enabled);
  schedule();
}
function setLensFlare(enabled){
  $('lens-flare').setAttribute('aria-pressed',String(enabled));
  $('lens-flare-state').textContent=enabled?'On':'Off';
  $('lens-flare-strength').disabled=!enabled;
  $('lens-flare-scale').disabled=!enabled;
  $('lens-flare-bloom').disabled=!enabled;
  engine.setStyle('lensFlare',enabled);
  schedule();
}
function setPainterlyVignette(enabled){
  $('painterly-vignette').setAttribute('aria-pressed',String(enabled));
  $('painterly-vignette-state').textContent=enabled?'On':'Off';
  $('vignette-strength').disabled=!enabled;
  $('vignette-spread').disabled=!enabled;
  $('vignette-swirl').disabled=!enabled;
  engine.setStyle('painterlyVignette',enabled);
  schedule();
}
$('painterly-vignette').addEventListener('click',()=>setPainterlyVignette($('painterly-vignette').getAttribute('aria-pressed')!=='true'));
$('lens-flare').addEventListener('click',()=>setLensFlare($('lens-flare').getAttribute('aria-pressed')!=='true'));
$('sun').addEventListener('click',()=>setSun($('sun').getAttribute('aria-pressed')!=='true'));
$('lens-dirt').addEventListener('click',()=>setLensDirt($('lens-dirt').getAttribute('aria-pressed')!=='true'));
$('color-bleed').addEventListener('click',()=>setIndirect($('color-bleed').getAttribute('aria-pressed')!=='true'));
$('tinted-shadows').addEventListener('click',()=>setTintedShadows($('tinted-shadows').getAttribute('aria-pressed')!=='true'));
$('shadow-tint').addEventListener('input',()=>setShadowTint($('shadow-tint').value));
controls.forEach(control=>$(control.id).addEventListener('input',()=>{
  const value=Number($(control.id).value);$(`${control.id}-value`).value=control.format(value);engine.setStyle(control.key,value);schedule();
}));
$('render-mode').addEventListener('change',()=>setMode($('render-mode').value));
$('quality').addEventListener('change',()=>{engine.setStyle('quality',$('quality').value);schedule();});
$('plant-lod').addEventListener('click',()=>{engine.setStyle('plantLOD',engine.options.plantLOD===false);syncStyleUI();schedule();});
$('pixel-filter').addEventListener('click',()=>{engine.setStyle('pixelFilter',!engine.options.pixelFilter);syncStyleUI();schedule();});
$('foreground-dof').addEventListener('click',()=>{engine.setStyle('foregroundDOF',!engine.options.foregroundDOF);syncStyleUI();schedule();});
$('auto-focus').addEventListener('click',()=>{engine.setStyle('autoFocus',!engine.options.autoFocus);syncStyleUI();schedule();});
$('focal-length').addEventListener('input',()=>{
  const mm=Number($('focal-length').value);
  if(!Number.isFinite(mm)||mm<18||mm>135)return;
  engine.setFocalLength(mm);mirrorCamera();saveStateNow();schedule();
});
$('reset-style').addEventListener('click',()=>{
  if(scenes[current].isolatedStyle){
    applyOptions(scenes[current].initialStyle);syncStyleUI();schedule();toast('Preset restored');return;
  }
  engine.setStyle('pixelFilter',false);
  engine.setStyle('autoFocus',true);
  engine.setStyle('foregroundDOF',DOF_DEFAULTS.foregroundDOF);
  controls.forEach(control=>{$(control.id).value=String(control.initial);$(`${control.id}-value`).value=control.format(control.initial);engine.setStyle(control.key,control.initial);});
  $('render-mode').value='paint';setMode('paint');setIndirect(true);setTintedShadows(true);setShadowTint('#66759b');setLensDirt(LENS_DIRT_DEFAULTS.lensDirt);setSun(SUN_DEFAULTS.sun);setLensFlare(FLARE_DEFAULTS.lensFlare);setPainterlyVignette(VIGNETTE_DEFAULTS.painterlyVignette);syncStyleUI();saveStateNow();toast('Paint controls reset');
});
function syncSporeUI(){
  const label=engine.sporesPlaying?'Pause spores':'Play spores';
  $('spore-toggle').textContent=label;$('spore-toggle').setAttribute('aria-label',label);$('spore-toggle').setAttribute('aria-pressed',String(engine.sporesPlaying));
}
$('spore-toggle').addEventListener('click',()=>{engine.setSporesPlaying(!engine.sporesPlaying);syncSporeUI();schedule();});
function windLabel(){return `${engine.windPlaying?'Pause':'Play'} ${engine.water?'water':'wind'}`;}
function syncSeasonUI(){
  const seasons=engine.cliffSeasons;
  $('season-settings').hidden=!seasons;
  if(!seasons)return;
  const slider=$('season-cycle'), phase=$('season-phase'), button=$('season-play');
  const value=String(Math.round(seasons.position*100));
  if(slider.value!==value)slider.value=value;
  if(phase.textContent!==seasons.phase){
    phase.textContent=seasons.phase;
    slider.setAttribute('aria-valuetext',seasons.phase);
  }
  const label=seasons.playing?'Pause season cycle':'Play season cycle';
  if(button.textContent!==label)button.textContent=label;
}
$('season-cycle').addEventListener('input',event=>{
  const seasons=engine.cliffSeasons;
  if(!seasons)return;
  seasons.setPlaying(false);
  seasons.seek(Number(event.target.value)/100);
  engine.dirty=true;
  syncSeasonUI();
  schedule();
});
$('season-play').addEventListener('click',()=>{
  const seasons=engine.cliffSeasons;
  if(!seasons)return;
  seasons.setPlaying(!seasons.playing);
  syncSeasonUI();
  schedule();
});
function syncReefCausticsUI(){
  const light=engine.reefCaustics;
  $('reef-light-settings').hidden=!light;
  $('lens-dirt').firstElementChild.textContent=light?'Swimming goggles':'Painterly lens dirt';
  $('lens-help').textContent=light?'Bright highlights and bioluminescent coral reveal the lens dirt map through a soft plastic haze.':'Bright areas reveal painted lens dabs.';
  if(!light)return;
  $('reef-sound').setAttribute('aria-pressed',String(Boolean(engine.reefAudio?.enabled)));
  $('reef-sound-state').textContent=engine.reefAudio?.error?'Unavailable':engine.reefAudio?.enabled?'On':'Off';
  $('reef-diffraction').disabled=light.night.value;
  for(const [id,active] of [['reef-night',light.night.value],['reef-rays',light.rays.value],['reef-diffraction',light.diffractionActive],['reef-caustics',light.enabled],['reef-caustics-motion',light.playing]]){
    $(id).setAttribute('aria-pressed',String(active));
    $(`${id}-state`).textContent=active?'On':'Off';
  }
}
$('reef-night').addEventListener('click',()=>{
  const night=!engine.reefCaustics?.night.value;
  engine.setReefNight(night);syncReefCausticsUI();
  const url=new URL(location.href);
  if(night)url.searchParams.set('light','night');
  else url.searchParams.delete('light');
  history.replaceState(null,'',url);
});
$('reef-replay').addEventListener('click',()=>{
  engine.replayReefOpening();syncReefCausticsUI();
  const url=new URL(location.href);url.searchParams.delete('light');history.replaceState(null,'',url);
});
$('reef-sound').addEventListener('click',async()=>{
  const audio=engine.reefAudio;if(!audio)return;
  await audio.setEnabled(!audio.enabled);
  if(audio.enabled){engine.camera.updateMatrixWorld(true);audio.setListener(engine.camera);}
  syncReefCausticsUI();
  if(audio.error)toast(`Sound could not start: ${audio.error}`);
});
$('reef-caustics').addEventListener('click',()=>{
  engine.setReefCaustics('enabled',!engine.reefCaustics?.enabled);syncReefCausticsUI();
});
$('reef-rays').addEventListener('click',()=>{
  engine.setReefCaustics('rays',!engine.reefCaustics?.rays.value);syncReefCausticsUI();
});
$('reef-diffraction').addEventListener('click',()=>{
  engine.setReefCaustics('diffraction',!engine.reefCaustics?.diffraction.value);syncReefCausticsUI();
});
$('reef-caustics-motion').addEventListener('click',()=>{
  engine.setReefCaustics('playing',!engine.reefCaustics?.playing);syncReefCausticsUI();
});
function syncRefractionUI(){
  const r=engine.refraction;$('water-refraction-settings').hidden=!r;
  if(!r)return;
  $('water-refraction').setAttribute('aria-pressed',String(r.enabled));$('water-refraction-state').textContent=r.enabled?'On':'Off';
  $('water-clarity').value=r.clarity;$('water-clarity').disabled=!r.enabled;$('water-clarity-value').textContent=`${Math.round(r.clarity*100)}%`;
}
$('water-refraction').addEventListener('click',()=>{engine.setWaterRefraction('enabled',!engine.refraction?.enabled);syncRefractionUI();schedule();});
$('water-clarity').addEventListener('input',()=>{engine.setWaterRefraction('clarity',Number($('water-clarity').value));syncRefractionUI();schedule();});
for(const [id,key]of [['water-amplitude','amplitude'],['water-speed','speed']])$(id).addEventListener('input',()=>{
  const value=Number($(id).value);engine.setWaterMotion(key,value);
  $(`${id}-value`).textContent=key==='amplitude'?`${Math.round(value*1000)} mm`:`${value.toFixed(2)}×`;schedule();
});
$('wind-toggle').addEventListener('click',()=>{
  engine.setWindPlaying(!engine.windPlaying);
  $('wind-toggle').textContent=windLabel();
  $('wind-toggle').setAttribute('aria-label',windLabel());
  $('wind-toggle').setAttribute('aria-pressed',String(engine.windPlaying));
  schedule();
});
function unlockCourierAudio(){engine?.actor?.audio?.unlock().catch(error=>toast(`Sound could not start: ${error.message}`));}
$('actor-sound').addEventListener('click',()=>{const audio=engine.actor?.audio;if(!audio)return;audio.setEnabled(!audio.enabled);if(audio.enabled)unlockCourierAudio();syncActorUI();});
$('actor-toggle').addEventListener('click',()=>{
  if(engine.thermalMotion){engine.setThermalPlaying(!engine.thermalPlaying);return;}
  engine.setActorPlaying(!engine.actorPlaying);if(engine.actorPlaying)unlockCourierAudio();
});
$('actor-motion').addEventListener('change',()=>{
  const actor=engine.actor;if(!actor?.selectAnimation)return;
  (actor.previewAnimation??actor.selectAnimation)(Number($('actor-motion').value));
  actor.writePacked(engine.texture.image.data,engine.centers,engine.actorStart);
  engine.texture.needsUpdate=true;engine.sortDirty=true;engine.dirty=true;
  engine.setActorPlaying(true);syncActorUI();schedule();
});
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>selectScene(Number(button.dataset.scene))));
$('reset-camera').addEventListener('click',resetCamera);
function restoreSceneFrame(){
  const scene=scenes[current];if(!scene.panoramaView)return;
  $('viewport').style.setProperty('--scene-aspect',String(scene.aspect));
  $('reference-image').src=scene.reference;$('reference-image').style.transform='';$('open-reference').href=scene.reference;
}
$('panorama-view').addEventListener('click',()=>{
  const view=scenes[current].panoramaView;if(!view)return;
  $('viewport').style.setProperty('--scene-aspect',String(view.aspect));
  $('reference-image').src=view.reference;$('reference-image').style.transform=view.mirror?'scaleX(-1)':'';$('open-reference').href=view.reference;
  setCameraLocked(false);setAutoOrbit(false);restoreCamera(view);schedule();saveStateNow();
});
$('terrain-view').addEventListener('click',()=>{
  const view=scenes[current].terrainView;if(!view)return;restoreSceneFrame();
  $('viewport').style.setProperty('--scene-aspect',String(view.aspect));
  setCameraLocked(false);setAutoOrbit(false);restoreCamera(view);schedule();saveStateNow();
});
$('waterfall-view').addEventListener('click',()=>{
  const view=scenes[current].waterfallView;if(!view)return;restoreSceneFrame();
  if(view.aspect)$('viewport').style.setProperty('--scene-aspect',String(view.aspect));
  if(view.reference){$('reference-image').src=view.reference;$('reference-image').style.transform=view.mirror?'scaleX(-1)':'';$('open-reference').href=view.reference;}
  setCameraLocked(false);setAutoOrbit(false);restoreCamera(view);schedule();saveStateNow();
});
$('camera-lock').addEventListener('click',()=>setCameraLocked(!cameraLocked));
$('auto-orbit').addEventListener('click',()=>setAutoOrbit(!autoOrbit));
$('render').addEventListener('pointerdown',()=>{if(autoOrbit)setAutoOrbit(false);unlockCourierAudio();});
let focusPointer=null,focusMarkTimer=0;
$('render').addEventListener('pointerdown',event=>{focusPointer=event.button===0?{x:event.clientX,y:event.clientY,id:event.pointerId}:null;});
$('render').addEventListener('pointercancel',()=>{focusPointer=null;});
$('render').addEventListener('pointerup',event=>{
  const start=focusPointer;focusPointer=null;
  if(!start||start.id!==event.pointerId||Math.hypot(event.clientX-start.x,event.clientY-start.y)>5)return;
  const bounds=$('render').getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width,y=(event.clientY-bounds.top)/bounds.height;
  if(engine.disturbWaterAt(x*2-1,1-y*2)){schedule();return;}
  if(!engine.options.foregroundDOF)return;
  if(!engine.focusAt(x*2-1,1-y*2))return;
  const mark=$('focus-mark');mark.style.left=`${x*100}%`;mark.style.top=`${y*100}%`;mark.hidden=false;
  clearTimeout(focusMarkTimer);focusMarkTimer=setTimeout(()=>{mark.hidden=true;},700);
  syncStyleUI();schedule();toast('Focus held on this subject');
});
$('compare').addEventListener('click',()=>{
  comparing=!comparing;
  $('compare').setAttribute('aria-pressed',String(comparing));
  ['reference-mask','comparison-line','compare-control'].forEach(id=>$(id).hidden=!comparing);
  updateCompare();
});
$('compare-split').addEventListener('input',updateCompare);
$('fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await $('viewport-shell').requestFullscreen();}
  catch{toast('Fullscreen is unavailable in this browser.');}
});
$('export-frame').addEventListener('click',async()=>{
  const button=$('export-frame');button.disabled=true;
  exporting=true;cancelAnimationFrame(frame);frame=0;
  const priorOrbit=autoOrbit;if(priorOrbit)setAutoOrbit(false);
  try{
    const blob=await engine.exportPNG({scale:Number($('export-scale').value)||1});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`brushfield-${scenes[current].id}-${$('render-mode').value}-${engine.options.indirect?'bounce':'base'}.png`;link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('PNG exported');
  }catch(error){toast(`Export failed: ${error.message}`);}
  finally{exporting=false;button.disabled=renderFailed;if(priorOrbit&&!renderFailed)setAutoOrbit(true);schedule();}
});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,select,textarea,[contenteditable]'))return;
  if(engine?.actor?.controller?.setKey&&(COURIER_KEYS.has(event.code)||(engine.actor.physics&&CLIFF_PHYSICS_KEYS.has(event.code)))){
    if(engine.actor.physics&&CLIFF_PHYSICS_KEYS.has(event.code)&&event.repeat)return;
    event.preventDefault();engine.actor.controller.setKey(event.code,true);unlockCourierAudio();
    if(!window.__manualPlayerClock)engine.setActorPlaying(true);
    schedule();return;
  }
  if(event.key.toLowerCase()==='f'&&engine?.actor?.controller?.setKey){$('fullscreen').click();event.preventDefault();return;}
  const sceneIndex=scenes.findIndex((_,index)=>sceneShortcut(index)===event.key.toLowerCase());
  if(sceneIndex>=0){selectScene(sceneIndex);event.preventDefault();}
  if(event.key.toLowerCase()==='r'&&engine){resetCamera();event.preventDefault();}
  if(event.key.toLowerCase()==='g'&&engine?.desert){engine.desert.replay(engine.windTime);engine.setWindPlaying(true);schedule();event.preventDefault();}
});
document.addEventListener('keyup',event=>{engine?.actor?.controller?.setKey?.(event.code,false);});
window.addEventListener('blur',()=>engine?.actor?.controller?.clearKeys?.());
document.addEventListener('visibilitychange',()=>{if(document.hidden)engine?.actor?.controller?.clearKeys?.();engine?.actor?.audio?.setActive(!document.hidden&&engine.actorPlaying);});
document.addEventListener('visibilitychange',()=>{
  engine?.reefAudio?.setActive(!document.hidden);
  if(document.hidden){saveStateNow();cancelAnimationFrame(frame);frame=0;}
  else{
    if(engine){engine.lastActorTime=null;engine.lastThermalTime=null;}
    if(engine?.reefCaustics)engine.reefCaustics.lastTime=null;
    if(engine?.reefSequence)engine.reefSequence.lastTime=null;
    if(engine?.causticClouds)engine.causticClouds.lastTime=null;
    if(engine?.cliffSeasons)engine.cliffSeasons.lastTime=null;
    schedule();
  }
});
$('render').addEventListener('webglcontextlost',event=>{event.preventDefault();fail(new Error('The graphics context was interrupted. Reload to rebuild the scene.'));});

let resizeObserver;
async function initializeStudio(){
try{
  engine=new GaussianBrushRenderer($('render'),{sceneDefinitions:scenes});
  engine.onInvalidate=schedule;
  engine.onActorChange=syncActorUI;
  engine.onReefLightChange=syncReefCausticsUI;
  resizeObserver=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;engine.resize(width,height);syncCameraUI();schedule();});
  resizeObserver.observe($('viewport'));
  savedState=readSavedState()||savedState;
  const query=new URLSearchParams(location.search);
  const requested=query.get('scene')||savedState.sceneId;
  const initialIndex=Math.max(0,scenes.findIndex(scene=>scene.id===requested));
  window.brushStudio={engine,selectScene};
  window.render_game_to_text=()=>JSON.stringify({scene:scenes[current].id,coordinates:'Y up; ground y=0; WASD relative to camera',player:engine.actor?.controller?.snapshot?.()??null,audio:engine.actor?.audio?.snapshot()??null,blink:engine.actor?.blink?.snapshot()??null,motion:engine.actor?.motionLayer?.snapshot()??null,feet:engine.actor?.footPlant?.snapshot()??null,playing:engine.actorPlaying,clip:engine.actor?.clipNames?.[engine.actor.currentClip],thermal:engine.thermalMotion?{time:engine.thermalTime,playing:engine.thermalPlaying}:null});
  window.advanceTime=async ms=>{
    await engine.actorReady;
    if(engine.thermalMotion){
      engine.setThermalPlaying(false);
      engine.advanceThermal(Math.max(0,ms)/1000);
      await engine.waitForGPU();engine.render();schedule();return;
    }
    if(!engine.actor?.controller?.setKey)return;
    window.__manualPlayerClock=true;engine.setActorPlaying(false);
    await engine.waitForGPU();
    const steps=Math.max(1,Math.round(ms/(1000/60)));
    for(let i=0;i<steps;i++){engine.actor.advance(ms/1000/steps);engine.updateTrample();}
    engine.actor.writePacked(engine.texture.image.data,engine.centers,engine.actorStart);
    engine.texture.needsUpdate=true;engine.sortDirty=true;engine.dirty=true;engine.render();
    await engine.waitForGPU();schedule();
  };
  await selectScene(initialIndex);
  if(query.get('view')==='terrain'&&scenes[initialIndex].terrainView)$('terrain-view').click();
  const seasonPosition=new Map([['summer',0],['autumn',.24],['winter',.5],['thaw',.65],['spring',.84]]).get(query.get('season'));
  if(engine.cliffSeasons&&seasonPosition!==undefined){
    engine.cliffSeasons.setPlaying(false);
    engine.cliffSeasons.seek(seasonPosition);
    engine.dirty=true;
    syncSeasonUI();
    schedule();
  }
  schedule();
}catch(error){fail(error);}
}
initializeStudio();
function dispose(){if(disposed)return;saveStateNow();disposed=true;cancelAnimationFrame(frame);clearTimeout(saveTimer);clearTimeout(toastTimer);clearTimeout(focusMarkTimer);resizeObserver?.disconnect();engine?.dispose();}
window.addEventListener('pagehide',dispose,{once:true});
if(import.meta.hot)import.meta.hot.dispose(data=>{saveStateNow();data.studioState=savedState;dispose();});
