import {GaussianBrushRenderer} from './GaussianBrushRenderer.js';
import {scenes as studioScenes} from './scenes.js';
import {ghibliScene} from './ghibliScene.js';
import {createGhibli} from './ghibli.js';
import {SummerReveal,ANIMALS_ENTER,REVEAL_END} from './SummerReveal.js';
import {WindAmbience} from './WindAmbience.js';
import {GHIBLI_CAMERA} from './ghibliFrame.js';
import {COURIER_KEYS} from './CourierController.js';

const canvas=document.querySelector('canvas'),black=document.querySelector('#black');
const sound=new WindAmbience(`${import.meta.env.BASE_URL}audio/meadow-wind.mp3`);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
let engine,reveal,raf,elapsed=0,last=null,dead=false,ready=false,crow,manual=false;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function resize(){
 if(!engine)return;
 const width=crow?canvas.clientWidth:innerWidth,height=crow?canvas.clientHeight:innerHeight;
 if(engine.size?.width!==width||engine.size?.height!==height)engine.resize(width,height);
 if(crow&&engine.camera.aspect!==engine.getViewportAspect())engine.applyLensAspect(engine.getViewportAspect());
}
function frame(now){
 if(dead)return;
 raf=requestAnimationFrame(frame);
 if(document.hidden||!ready||manual){last=null;return;}
 if(!engine.gpuReady())return;
 const dt=last===null?0:Math.min(.1,(now-last)/1000);last=now;
 if(crow)resize();
 updateScene(dt);
 engine.dirty=true;engine.render(now);
}
function updateScene(dt){
 elapsed+=dt;
 const time=reduceMotion?elapsed+REVEAL_END:elapsed;
 reveal.update(time);
 if(window.summerScene.introCamera){
  const focalLength=38+(GHIBLI_CAMERA.focalLength-38)*smooth(.5,REVEAL_END,time);
  if(Math.abs(engine.getFocalLength()-focalLength)>.001)engine.setFocalLength(focalLength);
 }
 black.style.opacity=String(1-smooth(reduceMotion?REVEAL_END:.35,reduceMotion?REVEAL_END+.8:2.5,time));
 engine.limitedOrbit.enabled=time>=REVEAL_END;
 if(time>=ANIMALS_ENTER&&!manual&&!engine.actorPlaying)engine.setActorPlaying(true);
 sound.setLevel(.24*smooth(reduceMotion?REVEAL_END:1,reduceMotion?REVEAL_END+3:7,time));
 window.summerScene.time=time;
}
async function boot(){
 // Let the black page paint before constructing the procedural landscape.
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 engine=new GaussianBrushRenderer(canvas);
 const index=studioScenes.findIndex(s=>s.id==='summer-hillside');
 const definition=createGhibli({entrance:true});
 // The standalone presentation and the Vercel build retain the original animals.
 if(import.meta.env.DEV){
  const {loadSummerAnimals}=await import('./SummerCourier.js');
  const loadAnimals=definition.loadActor;
  definition.loadActor=()=>loadSummerAnimals(loadAnimals);
 }
 engine.cache.set(index,definition);engine.load(index);
 Object.assign(engine.options,ghibliScene.initialStyle,{foregroundDOF:false});
 engine.applyStyle();resize();await engine.actorReady;
 if(engine.actorError)throw engine.actorError;
 crow=engine.actor?.crow;
 if(crow){
  resize();
  canvas.setAttribute('aria-label','Summer meadow. Move the crow with WASD or arrow keys. Hold Shift to run. Press Space to jump, then Shift to fly and Space to land. Drag to look around.');
 }
 engine.setActorPlaying(false);engine.setWindPlaying(true);engine.limitedOrbit.enabled=false;
 reveal=new SummerReveal(engine,engine.cache.get(index));
 engine.renderer.setClearColor(0,1);
 window.summerScene={engine,sound,reveal,time:0,ready:true,introCamera:!reduceMotion};
 ready=true;raf=requestAnimationFrame(frame);
 sound.start().catch(error=>{sound.error=error.message;});
}
window.addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{
 last=null;if(engine){engine.lastWindTime=null;engine.lastActorTime=null;}
 crow?.controller.clearKeys();crow?.audio.setActive(!document.hidden&&engine.actorPlaying);
 sound.setHidden(document.hidden);
});
window.addEventListener('pagehide',()=>{dead=true;cancelAnimationFrame(raf);reveal?.dispose();sound.dispose();engine?.dispose();},{once:true});
const booted=boot().catch(error=>{
 console.error(error);document.querySelector('#error').hidden=false;
 document.querySelector('#error').textContent='The meadow could not load. Reload to try again.';
});
if(import.meta.env.DEV){
 window.addEventListener('keydown',event=>{
  if(!crow||event.altKey||event.ctrlKey||event.metaKey)return;
  if(event.code==='KeyF'&&!event.repeat){
   const fullscreen=document.fullscreenElement?document.exitFullscreen():canvas.requestFullscreen?.();
   fullscreen?.catch(()=>{});return;
  }
  if(!COURIER_KEYS.has(event.code))return;
  event.preventDefault();
  if(!event.repeat&&window.summerScene.time>=ANIMALS_ENTER){
   crow.controller.setKey(event.code,true);crow.audio.unlock().catch(()=>{});
  }
 });
 window.addEventListener('keyup',event=>crow?.controller.setKey(event.code,false));
 window.addEventListener('blur',()=>crow?.controller.clearKeys());
 window.render_game_to_text=()=>JSON.stringify({scene:'summer-hillside',ready,
  coordinates:'X/Z on the meadow, Y above the ground, movement relative to camera',
  time:window.summerScene?.time??0,player:crow?.controller.snapshot()??null});
 window.advanceTime=async ms=>{
  await booted;if(!crow||dead)return;
  manual=true;engine.actorPlaying=false;
  resize();
  const steps=Math.max(1,Math.round(ms/(1000/60))),dt=ms/1000/steps;
  for(let i=0;i<steps;i++){
   updateScene(dt);
   if(window.summerScene.time>=ANIMALS_ENTER)engine.actor.advance(dt);
  }
  engine.actor.writePacked(engine.texture.image.data,engine.centers,engine.actorStart);
  engine.texture.needsUpdate=true;engine.sortDirty=true;engine.dirty=true;
  await engine.waitForGPU();engine.render();
 };
}
