import * as THREE from 'three';
import {GHIBLI_DEFAULTS} from './ghibliPaint.js';

const vertexShader=`varying vec2 vUv;
void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position.xy,0.,1.);}`;
const fragmentShader=`
varying vec2 vUv;
uniform sampler2D source;
uniform vec2 texel;
uniform float radius;
uniform float blend;
uniform float grain;
uniform vec2 paperScale;
uniform vec4 canvasBackdrop;
float paperHash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
// Four overlapping paint neighborhoods. Soft variance weights favor the
// interior of a color shape without winner-switching shimmer during orbit.
vec4 paintRegion(vec3 a,vec3 b,vec3 c,vec3 d){
  vec3 mean=(a+b+c+d)*.25;
  vec3 variance=max(vec3(0.),(a*a+b*b+c*c+d*d)*.25-mean*mean);
  float weight=pow(1.+dot(variance,vec3(.25,.6,.15))*900.,-3.);
  return vec4(mean*weight,weight);
}
void main(){
  vec4 center=texture2D(source,vUv);
  vec2 dx=vec2(texel.x*radius,0.),dy=vec2(0.,texel.y*radius);
  vec3 l=texture2D(source,vUv-dx).rgb,r=texture2D(source,vUv+dx).rgb;
  vec3 u=texture2D(source,vUv+dy).rgb,d=texture2D(source,vUv-dy).rgb;
  vec3 ul=texture2D(source,vUv-dx+dy).rgb,ur=texture2D(source,vUv+dx+dy).rgb;
  vec3 dl=texture2D(source,vUv-dx-dy).rgb,dr=texture2D(source,vUv+dx-dy).rgb;
  vec4 paint=paintRegion(center.rgb,l,u,ul)+paintRegion(center.rgb,r,u,ur)
    +paintRegion(center.rgb,l,d,dl)+paintRegion(center.rgb,r,d,dr);
  vec3 unified=paint.rgb/max(paint.a,.000001);
  vec3 color=mix(center.rgb,unified,blend*.9);
  // Fine stationary paper tooth, independent of viewport/export resolution.
  // Most pigment variation already lives on the surfaces in the splat shader.
  float tooth=paperHash(floor(vUv*paperScale))-.5;
  float fibers=paperHash(floor(vUv*paperScale*.43))-.5;
  float textureValue=tooth*.025+fibers*.012;
  if(canvasBackdrop.a>.5){
    // The solid clear color masks the weave out of the empty backdrop.
    float coverage=smoothstep(.005,.055,distance(center.rgb,canvasBackdrop.rgb));
    vec2 thread=vUv*paperScale*.54;
    vec2 fade=1.-smoothstep(vec2(.42),vec2(.9),fwidth(thread));
    vec2 weave=sin(thread*6.2831853);
    float woven=weave.x*fade.x*.55+weave.y*fade.y*.35
      +weave.x*weave.y*fade.x*fade.y*.22;
    textureValue=coverage*(textureValue+woven*.046);
  }
  color+=textureValue*grain*(.35+.65*sqrt(max(0.,dot(color,vec3(.2126,.7152,.0722)))));
  gl_FragColor=vec4(clamp(color,0.,1.),center.a);
}`;

/** Small, edge-preserving paint union. Runs before optical effects, with no
 * history buffers, camera displacement, reference texture, or extra scene bake.
 */
export class GhibliPaintPass {
  constructor(){
    this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false,colorSpace:THREE.NoColorSpace,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false});
    this.material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{source:{value:null},texel:{value:new THREE.Vector2()},radius:{value:1},blend:{value:0},grain:{value:0},paperScale:{value:new THREE.Vector2()},canvasBackdrop:{value:new THREE.Vector4()}},depthTest:false,depthWrite:false,blending:THREE.NoBlending,toneMapped:false});
    this.geometry=new THREE.BufferGeometry();
    this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
    this.quad=new THREE.Mesh(this.geometry,this.material);this.quad.frustumCulled=false;
    this.scene=new THREE.Scene();this.scene.add(this.quad);this.camera=new THREE.Camera();
  }
  render(renderer,source,width,height,options,backdrop=null){
    const amount=Math.max(0,Math.min(1,options.gouacheBlend??GHIBLI_DEFAULTS.gouacheBlend));
    const grain=Math.max(0,Math.min(1,options.gouacheTexture??GHIBLI_DEFAULTS.gouacheTexture));
    if(amount===0&&grain===0)return source;
    if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
    const u=this.material.uniforms;u.source.value=source;u.texel.value.set(1/width,1/height);
    u.radius.value=(1.4+amount*3.2)*height/900;u.blend.value=amount;
    u.grain.value=grain;u.paperScale.value.set(900*width/height,900);
    if(backdrop)u.canvasBackdrop.value.set(backdrop.r,backdrop.g,backdrop.b,1);
    else u.canvasBackdrop.value.w=0;
    const previous=renderer.getRenderTarget();
    try{renderer.setRenderTarget(this.target);renderer.render(this.scene,this.camera);}
    finally{renderer.setRenderTarget(previous);}
    return this.target.texture;
  }
  dispose(){this.target.dispose();this.material.dispose();this.geometry.dispose();}
}
