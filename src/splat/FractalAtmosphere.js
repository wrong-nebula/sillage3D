import {Scene, Camera, Mesh, PlaneGeometry, ShaderMaterial, WebGLRenderTarget, Vector2, LinearFilter} from 'three';

const vertex = 'varying vec2 uvOut;void main(){uvOut=uv;gl_Position=vec4(position.xy,0.,1.);}';
const target = () => new WebGLRenderTarget(1, 1, {depthBuffer: false, stencilBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter});
function material(fragmentShader, uniforms) {
  return new ShaderMaterial({vertexShader: vertex, fragmentShader, uniforms, depthTest: false, depthWrite: false});
}
/** Bounded scene-local bloom. It never changes another study's render path. */
export class FractalAtmosphere {
  constructor(engine) {
    this.engine = engine; this.original = engine.renderScene;
    this.full = target(); this.light = target(); this.blur = target();
    this.geometry = new PlaneGeometry(2, 2); this.scene = new Scene(); this.camera = new Camera();
    this.quad = new Mesh(this.geometry); this.quad.frustumCulled = false; this.scene.add(this.quad);
    this.extract = material(`varying vec2 uvOut;uniform sampler2D source;void main(){vec3 c=texture2D(source,uvOut).rgb;float gate=smoothstep(.66,.94,max(c.r,max(c.g,c.b)));gl_FragColor=vec4(c*gate,1.);}`, {source: {value: this.full.texture}});
    this.filter = material(`varying vec2 uvOut;uniform sampler2D source;uniform vec2 stepUV;void main(){vec3 c=texture2D(source,uvOut).rgb*.227027;c+=(texture2D(source,uvOut+stepUV*1.384615).rgb+texture2D(source,uvOut-stepUV*1.384615).rgb)*.316216;c+=(texture2D(source,uvOut+stepUV*3.230769).rgb+texture2D(source,uvOut-stepUV*3.230769).rgb)*.070270;gl_FragColor=vec4(c,1.);}`, {source: {value: null}, stepUV: {value: new Vector2()}});
    this.composite = material(`
      varying vec2 uvOut;uniform sampler2D source;uniform sampler2D glow;uniform float aspect;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      void main(){
        vec2 p=(uvOut-.5)*vec2(aspect,1.);
        vec3 base=texture2D(source,uvOut).rgb;
        vec3 bloom=texture2D(glow,uvOut).rgb;
        float darkness=1.-smoothstep(.025,.17,max(base.r,max(base.g,base.b)));
        vec3 atmosphere=vec3(.055,.025,.10)*exp(-dot(p-vec2(.25,.05),p-vec2(.25,.05))*3.8)
          +vec3(.012,.065,.09)*exp(-dot(p+vec2(.35,.12),p+vec2(.35,.12))*4.8);
        vec2 cell=floor(uvOut*vec2(aspect*180.,180.));vec2 f=fract(uvOut*vec2(aspect*180.,180.));
        vec2 spot=vec2(hash(cell),hash(cell+37.));float star=exp(-dot(f-spot,f-spot)*480.)*step(.994,hash(cell+91.));
        vec3 color=base+(1.-base)*bloom*1.25+darkness*(atmosphere+star*vec3(.16,.23,.32));
        color*=1.-.25*smoothstep(.3,1.2,length(p));
        gl_FragColor=vec4(color,1.);
      }`, {source: {value: this.full.texture}, glow: {value: this.light.texture}, aspect: {value: 1}});
    engine.renderScene = () => this.render();
  }
  draw(mat, to) {
    const renderer = this.engine.renderer;
    this.quad.material = mat; renderer.setRenderTarget(to); renderer.render(this.scene, this.camera);
  }
  render() {
    const renderer = this.engine.renderer, destination = renderer.getRenderTarget();
    this.engine.textureUploads.flush();
    this.engine.updateSplatIndices(this.engine.camera);
    this.engine.material.uniforms.dofSettings.value.set(0, this.engine.getFocusDistance(), 1, 0);
    this.engine.sun.update(this.engine.camera, this.engine.options);
    const autoReset = renderer.info.autoReset; renderer.info.autoReset = false; renderer.info.reset();
    const size = renderer.getDrawingBufferSize(new Vector2());
    if (this.full.width !== size.x || this.full.height !== size.y) {
      this.full.setSize(size.x, size.y);
      this.light.setSize(Math.max(1, Math.round(size.x / 3)), Math.max(1, Math.round(size.y / 3)));
      this.blur.setSize(this.light.width, this.light.height);
    }
    renderer.setRenderTarget(this.full); renderer.render(this.engine.scene, this.engine.camera);
    this.draw(this.extract, this.light);
    for (const spread of [1, 2.8]) {
      this.filter.uniforms.source.value = this.light.texture;
      this.filter.uniforms.stepUV.value.set(spread / this.light.width, 0); this.draw(this.filter, this.blur);
      this.filter.uniforms.source.value = this.blur.texture;
      this.filter.uniforms.stepUV.value.set(0, spread / this.light.height); this.draw(this.filter, this.light);
    }
    this.composite.uniforms.aspect.value = size.x / size.y; this.draw(this.composite, destination);
    this.engine.stats.calls = renderer.info.render.calls; renderer.info.autoReset = autoReset;
  }
  dispose() {
    this.engine.renderScene = this.original;
    for (const resource of [this.full, this.light, this.blur, this.geometry, this.extract, this.filter, this.composite]) resource.dispose();
  }
}
