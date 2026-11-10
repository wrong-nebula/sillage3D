import {DataTexture, FloatType, RedFormat, NearestFilter} from 'three';

/** Reveal splats by time without uploading geometry on each frame. */
export class SplatReveal {
  constructor(engine, values, {end, duration = 1.2, drift}) {
    this.engine = engine;
    this.material = engine.material;
    this.original = this.material.vertexShader;
    this.end = end;
    const width = 512, height = Math.ceil(values.length / width);
    const data = new Float32Array(width * height);
    data.set(values);
    const pigment = 'vec4 pigment=readSplat(4);paintColor=pigment.rgb;opacity=center.w;';
    if (!this.original.includes(pigment)) throw new Error('Scene reveal shader hook is missing.');
    this.texture = new DataTexture(data, width, height, RedFormat, FloatType);
    this.texture.minFilter = this.texture.magFilter = NearestFilter;
    this.texture.needsUpdate = true;
    const scatter = drift ? `
      float loose = 1. - arrival;
      float curl = sin(center.y * 5. + seed * 8. + 2. * loose);
      center.xyz += loose * (vec3(${drift.map(value => value.toFixed(3)).join(',')}) * (.5 + seed)
        + vec3(.35, -.17, .28) * curl);
    ` : '';
    this.material.vertexShader = 'uniform sampler2D arrivalData;\nuniform float arrivalTime;\n' + this.original
      .replace(pigment, `${pigment}
        int arrivalIndex=int(splatIndex);
        float arrives=texelFetch(arrivalData,ivec2(arrivalIndex%512,arrivalIndex/512),0).r;
        float arrival=smoothstep(arrives,arrives+${duration.toFixed(3)},arrivalTime);
        if(arrival<.0001){gl_Position=vec4(2.,2.,2.,1.);return;}
        opacity*=arrival;`)
      .replace('float transitionScale=1.;', 'float transitionScale=mix(.45,1.,arrival);' + scatter);
    Object.assign(this.material.uniforms, {arrivalData: {value: this.texture}, arrivalTime: {value: 0}});
    this.material.needsUpdate = true;
    this.finished = false;
  }

  update(time) {
    if (this.finished) return;
    this.material.uniforms.arrivalTime.value = time;
    this.engine.dirty = true;
    if (time >= this.end) {
      this.material.vertexShader = this.original;
      this.material.needsUpdate = true;
      delete this.material.uniforms.arrivalData;
      delete this.material.uniforms.arrivalTime;
      this.texture.dispose();
      this.finished = true;
    }
  }

  dispose() {
    if (!this.finished) this.texture.dispose();
  }
}
