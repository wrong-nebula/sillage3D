/** Local CC0 field recording, overlapped for a quiet seamless loop. */
export class WindAmbience{
 constructor(url){
  this.url=url;this.context=null;this.buffer=null;this.sources=new Set();this.level=0;this.disposed=false;
  this.unlock=()=>this.start().catch(error=>{this.error=error.message;});
  window.addEventListener('pointerdown',this.unlock);window.addEventListener('keydown',this.unlock);
  this.bytes=fetch(url).then(r=>{if(!r.ok)throw new Error('Wind audio could not load.');return r.arrayBuffer();});
  // Audio failure must never leave the visual experience on a black screen.
  this.bytes.catch(error=>{this.error=error.message;});
 }
 async start(){
  if(this.disposed)return;
  this.context??=new (window.AudioContext||window.webkitAudioContext)();
  // resume() is called synchronously from the gesture, before any fetch/decode.
  const resumed=this.context.resume();
  if(!this.loading)this.loading=this.bytes.then(bytes=>this.context.decodeAudioData(bytes)).then(buffer=>{this.buffer=buffer;});
  await Promise.all([resumed,this.loading]);
  if(this.disposed||this.timer)return;
  this.master=this.context.createGain();this.master.gain.value=0;this.master.connect(this.context.destination);
  this.master.gain.setTargetAtTime(this.level,this.context.currentTime,1.2);
  this.next=this.context.currentTime+.05;
  this.schedule();this.timer=setInterval(()=>this.schedule(),1000);
 }
 schedule(){
  if(!this.buffer||this.disposed||this.context.state!=='running')return;
  while(this.next<this.context.currentTime+2){
   const source=this.context.createBufferSource(),gain=this.context.createGain(),at=Math.max(this.next,this.context.currentTime),duration=this.buffer.duration,overlap=4;
   source.buffer=this.buffer;source.connect(gain);gain.connect(this.master);
   gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(1,at+overlap);
   gain.gain.setValueAtTime(1,at+duration-overlap);gain.gain.linearRampToValueAtTime(0,at+duration);
   source.onended=()=>{source.disconnect();gain.disconnect();this.sources.delete(source);};
   this.sources.add(source);source.start(at);source.stop(at+duration);this.next=at+duration-overlap;
  }
 }
 setLevel(level){if(Math.abs(level-this.level)<.005)return;this.level=level;if(this.master)this.master.gain.setTargetAtTime(level,this.context.currentTime,.7);}
 setHidden(hidden){if(!this.context)return;if(hidden)this.context.suspend();else this.context.resume().catch(()=>{});}
 dispose(){this.disposed=true;clearInterval(this.timer);window.removeEventListener('pointerdown',this.unlock);window.removeEventListener('keydown',this.unlock);for(const s of this.sources)s.stop();this.context?.close();}
}
