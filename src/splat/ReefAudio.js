const LISTENER_FIELDS=['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'];
const LISTENER_MATRIX=[12,13,14,8,9,10,4,5,6];

export class ReefAudio {
  constructor() {
    this.enabled = false;
    this.active = true;
    this.fadeSeconds = .35;
    this.playAttempt = 0;
  }

  preload() {
    if(this.disposed)return;
    if(!this.audio){
      this.audio=new Audio(`${import.meta.env?.BASE_URL ?? '/'}hollow-reef/audio/underwater-ambience.mp3`);
      this.audio.loop=true;this.audio.preload='auto';this.audio.volume=0;
      this.audio.load();
    }
    return this.audio;
  }

  start({fadeSeconds=3}={}) {
    this.fadeSeconds=fadeSeconds;this.preload();
    return this.setEnabled(true);
  }

  async setEnabled(enabled) {
    if(this.disposed)return;
    this.enabled = Boolean(enabled);
    this.onChange?.();
    await this.update();
  }

  async update() {
    const attempt=++this.playAttempt;
    clearTimeout(this.pauseTimer);
    if(!this.enabled || !this.active || this.disposed) {
      if(this.gain) this.gain.gain.setTargetAtTime(0, this.context.currentTime, .12);
      const audio = this.audio;
      if(audio)this.pauseTimer=setTimeout(()=>{
        audio.pause();this.context?.suspend().catch(()=>{});
      },500);
      return;
    }
    try {
      this.preload();
      if(!this.graphReady) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if(Context) {
          this.context = new Context();
          this.source = this.context.createMediaElementSource(this.audio);
          this.gain = this.context.createGain();this.gain.gain.value=0;
          this.gain.connect(this.context.destination);
          this.nodes=[];this.panners=[];
          // Shape the mono bed before HRTF spatialization so the surrounding
          // sources retain their binaural cues through the deeper water tone.
          const subCut=this.context.createBiquadFilter();
          subCut.type='highpass';subCut.frequency.value=30;subCut.Q.value=.707;
          const pressure=this.context.createBiquadFilter();
          pressure.type='lowshelf';pressure.frequency.value=180;pressure.gain.value=4;
          const muffling=this.context.createBiquadFilter();
          muffling.type='lowpass';muffling.frequency.value=700;muffling.Q.value=.707;
          const depth=this.context.createBiquadFilter();
          depth.type='lowpass';depth.frequency.value=700;depth.Q.value=.707;
          this.filters=[subCut,pressure,muffling,depth];
          this.source.connect(subCut);subCut.connect(pressure);pressure.connect(muffling);muffling.connect(depth);
          this.nodes.push(...this.filters);
          // Three delayed mono beds are rendered with the browser's HRTF.
          // Fixed world positions make a camera turn rotate the binaural field.
          const field=[[-4,-.8,1,0,.52],[3.5,-.5,-3,.071,.30],[1,1,4,.137,.26]];
          for(const [x,y,z,seconds,level] of field){
            const delay=this.context.createDelay(.5);delay.delayTime.value=seconds;
            const volume=this.context.createGain();volume.gain.value=level;
            const panner=this.context.createPanner();panner.panningModel='HRTF';
            panner.distanceModel='inverse';panner.refDistance=4;panner.rolloffFactor=.35;
            panner.positionX.value=x;panner.positionY.value=y;panner.positionZ.value=z;
            depth.connect(delay);delay.connect(volume);volume.connect(panner);panner.connect(this.gain);
            this.nodes.push(delay,volume,panner);this.panners.push(panner);
          }
          this.audio.volume=1;
        } else this.audio.volume=.32;
        this.graphReady=true;
      }
      const resumed=this.context?.resume();
      this.blocked=Boolean(this.context&&this.context.state!=='running');
      this.onChange?.();
      await resumed;
      if(attempt!==this.playAttempt||!this.enabled||!this.active||this.disposed)return;
      await this.audio.play();
      if(attempt!==this.playAttempt)return;
      if(!this.enabled||!this.active||this.disposed){this.audio.pause();return;}
      if(this.gain){
        const now=this.context.currentTime;
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(this.gain.gain.value,now);
        this.gain.gain.linearRampToValueAtTime(.32,now+this.fadeSeconds);
      }
      this.blocked=false;
      this.error=null;
    } catch(error) {
      if(this.disposed||attempt!==this.playAttempt)return;
      if(error.name==='NotAllowedError'){this.blocked=true;this.error=null;}
      else {this.error=error.message;this.enabled=false;}
    }
    this.onChange?.();
  }

  setActive(active) {this.active=Boolean(active);void this.update();}

  setListener(camera) {
    if(!this.context)return;
    const m=camera.matrixWorld.elements,listener=this.context.listener;
    const pose=this.listenerPose??=new Float64Array(9).fill(NaN);
    let changed=false;
    for(let i=0;i<9;i++){
      const value=m[LISTENER_MATRIX[i]]*(i>=3&&i<6?-1:1);
      if(value!==pose[i]){pose[i]=value;changed=true;}
    }
    if(!changed)return;
    if(listener.positionX){
      for(let i=0;i<9;i++)listener[LISTENER_FIELDS[i]].setTargetAtTime(pose[i],this.context.currentTime,.04);
    }else{
      listener.setPosition(m[12],m[13],m[14]);
      listener.setOrientation(-m[8],-m[9],-m[10],m[4],m[5],m[6]);
    }
  }

  dispose() {
    if(this.disposed)return;
    this.disposed=true;this.playAttempt++;clearTimeout(this.pauseTimer);
    if(this.audio){this.audio.pause();this.audio.removeAttribute('src');this.audio.load();}
    this.source?.disconnect();this.gain?.disconnect();
    for(const node of this.nodes??[])node.disconnect();
    this.context?.close().catch(()=>{});
  }
}
