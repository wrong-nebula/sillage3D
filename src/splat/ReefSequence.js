const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

export const REEF_FIRST_NIGHT = 24;
export const REEF_CYCLE_SECONDS = 20;
const TRANSITION = 3;

// One clock survives the asynchronous fish append and drives only uniforms.
export class ReefSequence {
  constructor({reducedMotion = false} = {}) {
    this.stages = new Float32Array(4);
    this.playing = !reducedMotion;
    this.ready = false;
    this.lastTime = null;
    this.time = reducedMotion ? 12 : 0;
    this.override = null;
    this.sample();
  }

  sample() {
    const t = this.time;
    this.stages[0]=clamp((t-.6)/3);this.stages[1]=clamp((t-3.8)/2.8);
    this.stages[2]=clamp((t-6.8)/4);this.stages[3]=smooth(t-11);
    this.exposure = smooth(t / 1.8);
    const start = this.override ? this.override.time + REEF_CYCLE_SECONDS : REEF_FIRST_NIGHT;
    const initial = this.override?.night ? 1 : 0;
    if (t < start) this.nightAmount = initial;
    else {
      const phase = Math.floor((t - start) / REEF_CYCLE_SECONDS);
      const from = phase % 2 ? 1 - initial : initial;
      const blend = smooth(((t - start) % REEF_CYCLE_SECONDS) / TRANSITION);
      this.nightAmount = from + (1 - 2 * from) * blend;
    }
  }

  setReady() { this.ready = true; this.lastTime = null; }

  advance(now) {
    if (!this.ready || !this.playing) return false;
    const previous = this.lastTime;
    this.lastTime = now;
    if (previous === null) return false;
    this.time += Math.max(0, (now - previous) / 1000);
    this.sample();
    return true;
  }

  seek(seconds) { this.time = Math.max(0, seconds); this.lastTime = null; this.sample(); }

  setNight(night) {
    this.time = Math.max(12, this.time);
    this.override = {time: this.time, night: Boolean(night)};
    this.sample();
  }

  replay() {
    this.time = 0; this.lastTime = null; this.override = null;
    this.playing = true; this.sample();
  }
}
