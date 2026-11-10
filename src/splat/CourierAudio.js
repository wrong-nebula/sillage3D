const CUES=['footstep','wingbeat','land','parcel','takeoff'];
const LEVELS={footstep:.5,wingbeat:.36,land:.58,parcel:.23,takeoff:.4};
const REVISION='20261106-foley-v2';
const FILES={wingbeat:'wingbeat-cloth-v2.mp3',takeoff:'takeoff-cloth-v2.mp3'};

/** Local fal-generated foley; no credentials or generation requests in the browser. */
export class CourierAudio {
  constructor(){
    this.enabled=true;this.active=true;this.buffers=new Map();this.voices=new Set();
    this.motion='';this.clock=0;this.nextBeat=0;this.nextRustle=0;this.events=[];
    this.footstepGain=1;this.footstepLowpass=7500;
  }
  async unlock(){
    if(this.disposed||!this.enabled)return;
    if(!this.context){
      const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;
      this.context=new Context();this.master=this.context.createGain();this.master.gain.value=.5;
      const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=7500;
      this.master.connect(filter);filter.connect(this.context.destination);
    }
    await this.context.resume();
    this.loading??=Promise.all(CUES.map(async name=>{
      const response=await fetch(`${import.meta.env?.BASE_URL ?? '/'}tengu-courier/audio/${FILES[name]??`${name}.mp3`}?v=${REVISION}`);if(!response.ok)throw new Error(`Could not load ${name} sound`);
      this.buffers.set(name,await this.context.decodeAudioData(await response.arrayBuffer()));
    })).then(()=>{if(!this.disposed)this.ready=true;}).catch(error=>{this.error=error.message;this.onChange?.();});
    await this.loading;this.onChange?.();
  }
  setEnabled(enabled){
    this.enabled=Boolean(enabled);if(!this.enabled)this.stop();
    if(this.master)this.master.gain.setTargetAtTime(this.enabled ? .5 : 0,this.context.currentTime,.04);
    this.onChange?.();
  }
  setActive(active){this.active=Boolean(active);if(!this.active)this.stop();}
  setFootstepSurface(gain,lowpass=7500){
    this.footstepGain=Math.max(0,Math.min(1,gain));
    this.footstepLowpass=Math.max(80,Math.min(20000,lowpass));
    for(const voice of this.voices)if(voice.name==='footstep'){
      voice.volume.gain.setTargetAtTime(LEVELS.footstep*this.footstepGain,this.context.currentTime,.035);
      voice.filter.frequency.setTargetAtTime(this.footstepLowpass,this.context.currentTime,.035);
    }
  }
  play(name,{loop=false,rate=1,gain=1}={}){
    if(!CUES.includes(name)||this.disposed||!this.enabled||!this.active||!this.ready||this.context.state!=='running')return null;
    if(name==='footstep'&&this.footstepGain===0)return null;
    const source=this.context.createBufferSource(),volume=this.context.createGain();source.buffer=this.buffers.get(name);
    source.loop=loop;source.playbackRate.value=rate;volume.gain.value=(LEVELS[name]??.4)*gain*(name==='footstep'?this.footstepGain:1);
    const filter=name==='footstep'?this.context.createBiquadFilter():null;
    source.connect(volume);
    if(filter){filter.type='lowpass';filter.frequency.value=this.footstepLowpass;volume.connect(filter);filter.connect(this.master);}
    else volume.connect(this.master);
    source.start();
    const voice={source,volume,filter,name};this.voices.add(voice);
    source.onended=()=>{this.voices.delete(voice);source.disconnect();volume.disconnect();filter?.disconnect();};
    this.events.push({name,time:this.clock});if(this.events.length>24)this.events.shift();return voice;
  }
  fadeOut(voice){
    try{const now=this.context.currentTime;voice.volume.gain.setTargetAtTime(0,now,.008);voice.source.stop(now+.04);}catch{}
  }
  stop(){for(const voice of this.voices)this.fadeOut(voice);this.voices.clear();}
  update(dt,motion,player,playback){
    this.clock+=dt;
    const controlled=player?.enabled,grounded=controlled?player.grounded:motion!=='Fly';
    if(this.grounded===false&&grounded&&controlled)this.play('land');
    this.grounded=grounded;
    if(motion!==this.motion){
      this.motion=motion;this.nextBeat=this.clock;this.beatIndex=null;this.nextRustle=this.clock+1.4;
      const cue={Jump:'wingbeat',Takeoff:'takeoff',Wave:'parcel'}[motion];
      if(cue)this.play(cue);
      if(motion==='Fly')this.play('takeoff');
      if(motion==='Land'&&!controlled)this.play('land');
      if(motion==='Walk'||motion==='Run')this.play('parcel',{gain:.6});
    }
    if(!this.active||!this.enabled||!this.ready)return;
    const interval={Walk:.5,Run:.633333/2,Fly:1.2}[motion];
    const phase=playback?playback.time/playback.duration:0;
    const beat=playback?Math.floor((phase-(motion==='Walk'?.25:motion==='Run'?.27:0))*(motion==='Fly'?5:2)):null;
    if(interval&&(playback?beat!==this.beatIndex:this.clock>=this.nextBeat)){
      if(!controlled||motion==='Fly'||Math.hypot(player.velocity.x,player.velocity.z)>.15)this.play(motion==='Fly'?'wingbeat':'footstep',{rate:motion==='Run'?1.08:1});
      this.nextBeat=this.clock+interval;this.beatIndex=beat;
    }
    if(['Walk','Run','Fly'].includes(motion)&&this.clock>=this.nextRustle){this.play('parcel',{gain:.45});this.nextRustle=this.clock+(motion==='Run'?2.2:3.8);}
  }
  snapshot(){return {revision:REVISION,enabled:this.enabled,active:this.active,ready:!!this.ready,loaded:this.buffers.size,context:this.context?.state??'locked',error:this.error??null,voices:this.voices.size,footsteps:{gain:this.footstepGain,lowpass:this.footstepLowpass},events:this.events.slice()};}
  dispose(){this.disposed=true;this.stop();this.context?.close().catch(()=>{});this.buffers.clear();}
}
