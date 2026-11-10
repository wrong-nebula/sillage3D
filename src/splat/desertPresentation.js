import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {scenes} from './scenes.js';
const canvas=document.querySelector('canvas');
let engine,raf,closed=false,manual=false,ready=false,lastRender=-Infinity,fitScale=1;
function resetView(){engine.resetCamera();fitScale=1;resize();}
function resize(){
  if(!engine)return;
  engine.resize(canvas.clientWidth,canvas.clientHeight);
  const aspect=canvas.clientWidth/canvas.clientHeight,next=aspect<.85?Math.max(1,1.2/Math.sqrt(aspect)):1;
  if(next!==fitScale){engine.camera.position.sub(engine.controls.target).multiplyScalar(next/fitScale).add(engine.controls.target);engine.controls.update();fitScale=next;}
}
function fail(error){console.error(error);cancelAnimationFrame(raf);document.querySelector('#error').hidden=false;}
function frame(now){
  if(closed)return;raf=requestAnimationFrame(frame);
  if(!ready||document.hidden||manual||!engine.needsFrame||now-lastRender<1000/30)return;
  try{if(engine.gpuReady()&&engine.render(now))lastRender=now;}catch(error){fail(error);}
}
async function boot(){
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const index=scenes.findIndex(s=>s.id==='desert-garden'),scene=scenes[index];
  await scene.prepare();engine=new GaussianBrushRenderer(canvas);engine.load(index);
  Object.assign(engine.options,scene.initialStyle);engine.applyStyle();resize();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){engine.setWindPlaying(false);engine.desert.setAge(1);}
  window.desertGarden={engine,ready:true,resetView,replay(){engine.desert.replay(engine.windTime);engine.setWindPlaying(true);manual=false;},setAge(age){engine.desert.setAge(age);engine.dirty=true;}};
  window.render_game_to_text=()=>JSON.stringify({scene:'desert-garden',ready,time:engine.windTime,playing:engine.windPlaying,
    splats:engine.stats.count,plants:engine.desert.stats.plants.length,species:engine.desert.stats.counts,
    terrain:engine.desert.stats.terrain,growth:engine.desert.stats.growth});
  window.advanceTime=async ms=>{
    manual=true;engine.setWindPlaying(false);await engine.waitForGPU();
    engine.windTime+=Math.max(0,ms)/1000;engine.material.uniforms.windTime.value=engine.windTime;
    engine.dirty=true;engine.render(performance.now());await engine.waitForGPU();
  };
  ready=true;raf=requestAnimationFrame(frame);
}
window.addEventListener('keydown',event=>{
  if(!engine||event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.code==='Space'){manual=false;engine.setWindPlaying(!engine.windPlaying);event.preventDefault();}
  if(event.code==='KeyG'){window.desertGarden.replay();event.preventDefault();}
  if(event.code==='KeyR'){resetView();event.preventDefault();}
  if(event.code==='KeyF'){(document.fullscreenElement?document.exitFullscreen():canvas.requestFullscreen())?.catch(()=>{});event.preventDefault();}
});
document.addEventListener('visibilitychange',()=>{if(engine)engine.lastWindTime=null;});
window.addEventListener('resize',resize);
window.addEventListener('pagehide',()=>{closed=true;cancelAnimationFrame(raf);engine?.dispose();},{once:true});
boot().catch(fail);
