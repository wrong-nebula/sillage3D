import * as THREE from 'three';

export const VIGNETTE_DEFAULTS=Object.freeze({painterlyVignette:false,vignetteStrength:.65,vignetteSpread:.65,vignetteSwirl:.75});

const copyVertex=`
varying vec2 vUv;
void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}`;
const copyFragment=`
varying vec2 vUv;
uniform sampler2D source;
void main(){gl_FragColor=texture2D(source,vUv);}`;
const fieldMask=`
float fieldAmount(vec2 uv){
  // Circular optical field in viewport-height units, also in portrait exports.
  float radius=length((uv-vec2(.5))*vec2(viewport.x/viewport.y,1.));
  return smoothstep(.48-.25*spread,.78-.18*spread,radius);
}`;
const brushVertex=`
uniform sampler2D source;
uniform vec2 viewport;
uniform mat4 fieldView,fieldProjection;
uniform float spread,swirl;
attribute vec3 markAnchor;
attribute vec2 markSize,markDirection,markStyle;
varying vec2 brush,screenUV;
varying vec3 pigment;
varying float seed,deposit,curve,coherence;
${fieldMask}
vec3 samplePigment(vec2 uv){
  vec2 border=.5/viewport;
  return texture2D(source,clamp(uv,border,vec2(1.)-border)).rgb;
}
void main(){
  seed=markStyle.x;deposit=0.;curve=0.;coherence=0.;brush=position.xy*2.;screenUV=vec2(.5);pigment=vec3(0.);
  vec4 view=fieldView*vec4(markAnchor,1.);
  vec4 clip=fieldProjection*view;
  // Reject before texture reads; the field surrounds the camera on every side.
  if(clip.w<=.08){gl_Position=vec4(2.,2.,2.,1.);return;}
  vec2 center=clip.xy/clip.w*.5+.5;
  float aspect=viewport.x/viewport.y;
  vec2 margin=vec2(.26/aspect,.26);
  if(any(lessThan(center,-margin))||any(greaterThan(center,vec2(1.)+margin))){
    gl_Position=vec4(2.,2.,2.,1.);return;
  }
  vec2 radial=(center-.5)*vec2(aspect,1.);
  float edge=fieldAmount(center);
  vec2 tangent=normalize(vec2(-radial.y,radial.x)+vec2(.00001,0.));
  float natural=atan(markDirection.y,markDirection.x);
  float target=atan(tangent.y,tangent.x)+(seed-.5)*.22;
  // Blend unoriented lines in doubled-angle space, not wrapped angles. At the
  // ambiguous half-way blend, smoothly round the footprint before it can turn.
  vec2 line=mix(vec2(cos(2.*natural),sin(2.*natural)),vec2(cos(2.*target),sin(2.*target)),swirl);
  coherence=smoothstep(.02,.18,length(line));
  float angle=.5*atan(line.y,line.x+.0000001);
  vec2 direction=vec2(cos(angle),sin(angle));
  float stretch=1.+3.4*swirl*edge;
  float roundSize=sqrt(markSize.x*markSize.y);
  vec2 along=vec2(direction.x/aspect,direction.y)*mix(roundSize,markSize.x*stretch,coherence);
  vec2 across=vec2(-direction.y/aspect,direction.x)*mix(roundSize,markSize.y*(1.-.28*swirl*edge),coherence);
  screenUV=center+along*brush.x+across*brush.y;
  gl_Position=vec4(screenUV*2.-1.,0.,1.);
  curve=.18*swirl*edge*coherence*sign(dot(vec2(-direction.y,direction.x),-radial));
  vec3 base=samplePigment(center)*.4;
  base+=(samplePigment(center+along*.65)+samplePigment(center-along*.65)
    +samplePigment(center+across*.65)+samplePigment(center-across*.65))*.15;
  float light=dot(base,vec3(.2126,.7152,.0722));
  float valueShift=(fract(seed*137.13)-.5)*.17;
  vec3 note=seed>.84?vec3(.032,.017,-.012):vec3(-.015,-.006,.025);
  pigment=clamp(mix(vec3(light),base,1.06)+valueShift+note,0.,1.);
  // Do not paint over the visible solar disc itself.
  deposit=markStyle.y*smoothstep(.05,.9,texture2D(source,clamp(center,0.,1.)).a);
}`;
const brushFragment=`
uniform sampler2D source;
uniform vec2 viewport;
uniform float strength,spread;
varying vec2 brush,screenUV;
varying vec3 pigment;
varying float seed,deposit,curve,coherence;
${fieldMask}
void main(){
  float mask=fieldAmount(screenUV)*(.78+.22*(1.-screenUV.y));
  if(mask<=0.||deposit<=0.)discard;
  // A softly bowed brush footprint follows the optical field's tangent.
  vec2 q=vec2(brush.x,brush.y-curve*brush.x*brush.x);
  float r2=dot(q,q);
  float wobble=coherence*(.065*sin(q.x*5.+seed*61.)+.040*sin(q.y*7.+seed*29.));
  float silhouette=1.-smoothstep(1.24,1.83,sqrt(r2)+wobble);
  float bristles=1.-.18*coherence*smoothstep(.80,1.,sin(q.y*18.+seed*55.+q.x*.7));
  float body=1.-exp(-3.5*exp(-.55*r2));
  // Protect the disc across the entire footprint, including long edge marks
  // whose center lies beside the sun. Scene alpha is still copied untouched.
  float clearSun=smoothstep(.05,.9,texture2D(source,screenUV).a);
  float alpha=clamp(strength*mask*deposit*body*silhouette*bristles*clearSun,0.,.85);
  if(alpha<.001)discard;
  gl_FragColor=vec4(pigment,alpha);
}`;
function random(seed){
  return ()=>{
    seed|=0;seed=seed+0x6D2B79F5|0;
    let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

function brushGeometry(splats){
  const rnd=random(0x64d57b19),shellCount=36000,surfaceCount=splats?.length?18000:0,count=shellCount+surfaceCount;
  const anchors=new Float32Array(count*3),sizes=new Float32Array(count*2),directions=new Float32Array(count*2),styles=new Float32Array(count*2);
  // An all-sided world-space field fills empty sky and flat foreground. Surface
  // anchors add nearer parallax. Neither field is regenerated while moving.
  const bounds=new THREE.Box3();
  for(const splat of splats??[])bounds.expandByPoint(new THREE.Vector3(...splat.center));
  const center=bounds.isEmpty()?new THREE.Vector3():bounds.getCenter(new THREE.Vector3());
  const radius=bounds.isEmpty()?240:Math.max(240,bounds.getSize(new THREE.Vector3()).length()*.7);
  for(let i=0;i<count;i++){
    let anchor;
    if(i<shellCount){
      const y=1-2*(i+.5)/shellCount,a=i*2.399963229728653+(rnd()-.5)*.009,ring=Math.sqrt(1-y*y);
      anchor=[center.x+Math.cos(a)*ring*radius,center.y+y*radius,center.z+Math.sin(a)*ring*radius];
    }else{
      const s=splats[Math.min(splats.length-1,Math.floor((i-shellCount+rnd())/surfaceCount*splats.length))];
      anchor=[...s.center];
      // Stable offsets within the original 3D footprint avoid coincident stamps.
      for(const axis of s.axes??[]){const offset=(rnd()-.5)*.65;for(let k=0;k<3;k++)anchor[k]+=axis[k]*offset;}
    }
    anchors.set(anchor,i*3);
    const layer=rnd(),width=layer<.13?.005+rnd()*.005:layer<.45?.0025+rnd()*.003:.0011+rnd()*.0018;
    sizes[i*2]=width*(1.3+rnd()*.7);sizes[i*2+1]=width;
    const angle=rnd()*Math.PI;
    directions[i*2]=Math.cos(angle);directions[i*2+1]=Math.sin(angle);
    styles[i*2]=rnd();styles[i*2+1]=(layer<.13?.24:layer<.45?.52:.78)*(.8+rnd()*.4);
  }
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
  geometry.setIndex([0,1,2,0,2,3]);
  geometry.setAttribute('markAnchor',new THREE.InstancedBufferAttribute(anchors,3));
  for(const [name,array] of Object.entries({markSize:sizes,markDirection:directions,markStyle:styles}))geometry.setAttribute(name,new THREE.InstancedBufferAttribute(array,2));
  geometry.instanceCount=count;
  return geometry;
}

/** Petzval-inspired pigment finish, not a physical lens ray tracer. World-anchored
 * marks reproject and resample the current scene every frame. Alpha is preserved
 * exactly so downstream optics retain the original solar visibility mask. */
export class PainterlyVignettePass {
  constructor(){
    this.target=null;this.scene=null;this.disposed=false;this.worldSplats=null;
    this.viewport=new THREE.Vector4();this.scissor=new THREE.Vector4();
    this.fallbackCamera=new THREE.PerspectiveCamera(54,1,.08,600);
  }
  createResources(width,height,splats){
    this.target=new THREE.WebGLRenderTarget(width,height,{depthBuffer:false,stencilBuffer:false,
      type:THREE.UnsignedByteType,format:THREE.RGBAFormat,colorSpace:THREE.NoColorSpace,
      minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false});
    this.copyMaterial=new THREE.ShaderMaterial({vertexShader:copyVertex,fragmentShader:copyFragment,
      uniforms:{source:{value:null}},depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
    this.brushMaterial=new THREE.ShaderMaterial({vertexShader:brushVertex,fragmentShader:brushFragment,
      uniforms:{source:{value:null},viewport:{value:new THREE.Vector2(width,height)},strength:{value:0},spread:{value:.65},swirl:{value:.75},
        fieldView:{value:new THREE.Matrix4()},fieldProjection:{value:new THREE.Matrix4()}},
      transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
      blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,
      blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha:THREE.AddEquation,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneFactor});
    this.copyGeometry=new THREE.BufferGeometry();
    this.copyGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.geometry=brushGeometry(splats);this.worldSplats=splats;
    this.copyMesh=new THREE.Mesh(this.copyGeometry,this.copyMaterial);this.copyMesh.frustumCulled=false;
    this.brushMesh=new THREE.Mesh(this.geometry,this.brushMaterial);this.brushMesh.frustumCulled=false;this.brushMesh.renderOrder=1;
    this.scene=new THREE.Scene();this.scene.add(this.copyMesh,this.brushMesh);this.camera=new THREE.Camera();
  }
  render(renderer,sourceTexture,width,height,options={},viewCamera,worldSplats=null){
    const requested=options.vignetteStrength??VIGNETTE_DEFAULTS.vignetteStrength;
    const strength=Number.isFinite(requested)?Math.min(1,Math.max(0,requested)):0;
    if(!options.painterlyVignette||strength===0)return sourceTexture;
    if(this.disposed)throw new Error('Painterly vignette pass has been disposed.');
    if(!sourceTexture||!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new Error('Invalid painterly vignette source or dimensions.');
    if(this.target?.texture===sourceTexture)throw new Error('Painterly vignette source must differ from its output target.');
    width=Math.floor(width);height=Math.floor(height);
    if(!this.target)this.createResources(width,height,worldSplats);
    else{
      if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
      if(this.worldSplats!==worldSplats){
        this.geometry.dispose();this.geometry=brushGeometry(worldSplats);this.brushMesh.geometry=this.geometry;this.worldSplats=worldSplats;
      }
    }
    this.copyMaterial.uniforms.source.value=sourceTexture;
    const uniforms=this.brushMaterial.uniforms;
    uniforms.source.value=sourceTexture;uniforms.viewport.value.set(width,height);uniforms.strength.value=strength;
    for(const key of ['Spread','Swirl']){
      const value=options[`vignette${key}`]??VIGNETTE_DEFAULTS[`vignette${key}`];
      uniforms[key.toLowerCase()].value=Number.isFinite(value)?Math.min(1,Math.max(0,value)):VIGNETTE_DEFAULTS[`vignette${key}`];
    }
    if(!viewCamera){this.fallbackCamera.aspect=width/height;this.fallbackCamera.updateProjectionMatrix();viewCamera=this.fallbackCamera;}
    viewCamera.updateMatrixWorld(true);
    uniforms.fieldView.value.copy(viewCamera.matrixWorldInverse);uniforms.fieldProjection.value.copy(viewCamera.projectionMatrix);
    const previousTarget=renderer.getRenderTarget(),autoClear=renderer.autoClear;
    renderer.getViewport(this.viewport);renderer.getScissor(this.scissor);const scissorTest=renderer.getScissorTest();
    try{
      renderer.autoClear=false;renderer.setRenderTarget(this.target);renderer.setViewport(0,0,width,height);renderer.setScissorTest(false);
      renderer.render(this.scene,this.camera);
    }finally{
      renderer.setRenderTarget(previousTarget);renderer.autoClear=autoClear;
      renderer.setViewport(this.viewport);renderer.setScissor(this.scissor);renderer.setScissorTest(scissorTest);
    }
    return this.target.texture;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    this.target?.dispose();this.copyMaterial?.dispose();this.brushMaterial?.dispose();this.copyGeometry?.dispose();this.geometry?.dispose();
    this.scene?.clear();this.worldSplats=null;
  }
}
