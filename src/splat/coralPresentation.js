import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {ReefAudio} from './ReefAudio.js';
import {scenes} from './coralCatalog.js';

const canvas=document.querySelector('canvas');
const sound=new ReefAudio();
let engine,raf=0,last=-Infinity,ready=false,closed=false;

sound.active=!document.hidden;
// Fetch and attempt playback while the terrain assets are still loading.
sound.preload();void sound.start({fadeSeconds:3.5});

function schedule(){
  if(ready&&!closed&&!raf&&!document.hidden)raf=requestAnimationFrame(frame);
}
function frame(now){
  raf=0;
  if(closed||document.hidden)return;
  if(now-last<1000/30){schedule();return;}
  try{if(engine.render(now))last=now;}
  catch(error){fail(error);return;}
  if(engine.needsFrame)schedule();
}
function resize(){engine?.resize(canvas.clientWidth,canvas.clientHeight);}
function fail(error){
  console.error(error);cancelAnimationFrame(raf);raf=0;ready=false;
  sound.setActive(false);
  document.querySelector('#error').hidden=false;
}
function unlock(){
  if(sound.active&&!sound.disposed&&(!sound.enabled||sound.blocked||sound.audio?.paused||sound.context?.state!=='running'))
    void sound.setEnabled(true);
}
async function boot(){
  const scene=scenes[0];await scene.prepare();if(closed)return;
  engine=new GaussianBrushRenderer(canvas);
  engine.load(0);
  // Keep the audio that started loading before scene construction, including
  // through the asynchronous actor rebuild.
  engine.reefAudio?.dispose();engine.reefAudio=sound;
  Object.assign(engine.options,scene.initialStyle);engine.applyStyle();resize();
  await engine.actorReady;if(closed)return;
  if(engine.actorError)throw engine.actorError;
  engine.onInvalidate=schedule;
  ready=true;schedule();
}
const booted=boot().catch(fail);
canvas.addEventListener('pointerdown',unlock);
window.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
  unlock();
  if(event.code==='KeyF'){
    event.preventDefault();(document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen())?.catch(()=>{});
  }else if(event.code==='KeyR'&&ready){engine.replayReefOpening();}
});
window.addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{
  sound.setActive(!document.hidden);
  if(document.hidden){cancelAnimationFrame(raf);raf=0;return;}
  last=-Infinity;
  if(engine){engine.lastActorTime=null;engine.reefSequence.lastTime=null;engine.reefCaustics.lastTime=null;}
  schedule();
});
window.addEventListener('pagehide',event=>{
  if(event.persisted)return;
  closed=true;cancelAnimationFrame(raf);engine?.dispose();sound.dispose();
});
window.coralScene={get ready(){return ready;},get engine(){return engine;},sound,booted,
  get time(){return engine?.reefSequence.time??0;}};
