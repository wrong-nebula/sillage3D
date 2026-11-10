const NAMES=['grass-wind','winter-wind','autumn-rustle','birdsong','cicadas'];
const STOPS=[[0,1],[.10,1],[.24,2],[.46,3],[.62,3],[.81,0],[1,1]];
export function seasonalAmbienceLevels(position,time=0){
 const p=Math.max(0,Math.min(1,position)),weights=[0,0,0,0];
 const index=STOPS.findIndex((stop,i)=>i>0&&p<=stop[0]);
 const [a,from]=STOPS[Math.max(0,index-1)], [b,to]=STOPS[index<0?STOPS.length-1:index];
 let t=Math.max(0,Math.min(1,(p-a)/Math.max(.00001,b-a)));t=t*t*(3-2*t);
 weights[from]+=1-t;weights[to]+=t;
 const [spring,summer,autumn,winter]=weights;
 const gust=.82+.18*(.5+.5*Math.cos(time*1.35));
 const insectPhrase=Math.max(0,Math.sin(time*.105+.4))**3;
 const springReturn=Math.max(0,Math.min(1,(p-.74)/.07));
 const birdGate=p>=.31&&p<=.74?0:p>.74&&p<.81?springReturn*springReturn*(3-2*springReturn):1;
 return {'grass-wind':.13*spring+.17*summer+.035*autumn,
  'winter-wind':.34*winter*gust,'autumn-rustle':p>=.43&&p<=.71?0:.25*autumn,
  birdsong:birdGate*(.26*spring+.15*summer),cicadas:.026*summer*insectPhrase};
}

/** One audio context, local CC0 layers and overlapping loop ends. */
export class SeasonalAmbience{
 constructor(){
  this.layers=new Map();this.sources=new Set();this.levels={};this.reveal=1;this.hidden=globalThis.document?.hidden??false;
  const root=`${import.meta.env?.BASE_URL??'/'}cliff-audio/`;
  this.bytes=Promise.all(NAMES.map(async name=>{const r=await fetch(root+name+'.mp3');if(!r.ok)throw new Error('Could not load '+name);return [name,await r.arrayBuffer()];}));
  this.bytes.catch(error=>{this.error=error.message;});
  this.unlock=()=>this.start().catch(error=>{this.error=error.message;});
  this.visibility=()=>{this.hidden=document.hidden;if(this.context)(this.hidden?this.context.suspend():this.context.resume()).catch(()=>{});};
  window.addEventListener('pointerdown',this.unlock);window.addEventListener('keydown',this.unlock);
  document.addEventListener('visibilitychange',this.visibility);
 }
 async start(){
  if(this.disposed)return;
  const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
  this.context??=new Context();
  const resumed=this.context.resume();
  this.loading??=this.bytes.then(async files=>{
   await Promise.all(files.map(async([name,bytes])=>{
    const buffer=await this.context.decodeAudioData(bytes),gain=this.context.createGain();
    gain.gain.value=(this.levels[name]??0)*this.reveal;gain.connect(this.context.destination);
    this.layers.set(name,{buffer,gain,target:gain.gain.value,next:this.context.currentTime+.04});
   }));
  });
  await Promise.all([resumed,this.loading]);
  if(this.disposed||this.timer)return;
  this.schedule();this.timer=setInterval(()=>this.schedule(),800);
 }
 schedule(){
  if(this.disposed||this.context.state!=='running')return;
  for(const layer of this.layers.values())while(layer.next<this.context.currentTime+1.8){
   const source=this.context.createBufferSource(),fade=this.context.createGain();
   const at=Math.max(layer.next,this.context.currentTime),duration=layer.buffer.duration,overlap=3;
   source.buffer=layer.buffer;source.connect(fade);fade.connect(layer.gain);
   fade.gain.setValueAtTime(0,at);fade.gain.linearRampToValueAtTime(1,at+overlap);
   fade.gain.setValueAtTime(1,at+duration-overlap);fade.gain.linearRampToValueAtTime(0,at+duration);
   this.sources.add(source);source.onended=()=>{this.sources.delete(source);source.disconnect();fade.disconnect();};
   source.start(at);source.stop(at+duration);layer.next=at+duration-overlap;
  }
 }
 update(position,time,reveal=this.reveal){
  this.reveal=reveal;const levels=seasonalAmbienceLevels(position,time);
  for(const [name,value]of Object.entries(levels)){
   const layer=this.layers.get(name),target=value*reveal;
   const winterMute=(name==='birdsong'&&position>=.31&&position<=.74)||
    (name==='autumn-rustle'&&position>=.43&&position<=.71);
   if(layer&&winterMute){
    if(!layer.winterMuted){const now=this.context.currentTime;layer.gain.gain.cancelScheduledValues(now);layer.gain.gain.setValueAtTime(0,now);}
    layer.target=0;layer.winterMuted=true;continue;
   }
   if(layer)layer.winterMuted=false;
   if(layer&&(Math.abs(layer.target-target)>.0003||(target===0&&layer.target!==0))){
    const now=this.context.currentTime;
    layer.gain.gain.setTargetAtTime(target,now,.65);
    layer.target=target;
   }
  }
  this.levels=levels;this.previousReveal=reveal;
 }
 snapshot(){return {loaded:this.layers.size,context:this.context?.state??'locked',hidden:this.hidden,reveal:this.reveal,levels:this.levels,targets:Object.fromEntries([...this.layers].map(([name,layer])=>[name,layer.target])),error:this.error??null};}
 dispose(){
  this.disposed=true;clearInterval(this.timer);
  window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);document.removeEventListener('visibilitychange',this.visibility);
  for(const source of this.sources)try{source.stop();}catch{}
  this.context?.close().catch(()=>{});
 }
}
