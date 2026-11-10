import * as THREE from 'three';

// Mean apparent solar diameter at Earth. Size=1 retains this angular size.
export const SOLAR_DIAMETER_DEGREES=.533;
export const SUN_DEFAULTS=Object.freeze({sun:true,sunAzimuth:-35,sunElevation:16,sunSize:1,sunIntensity:8});
export const SUN_COLOR_LINEAR=Object.freeze([1,.96,.84]);
// Kernel coordinates are measured in the nominal solar radius. A compact ring
// of isotropic kernels overlaps enough to remain circular, rather than lobed.
export const SUN_SPLAT_SUPPORT=2;
export const SUN_SPLAT_KERNELS=Object.freeze([
  Object.freeze([0,0,.48,.9]),
  ...Array.from({length:6},(_,i)=>Object.freeze([.3*Math.cos(i*Math.PI/3),.3*Math.sin(i*Math.PI/3),.48,.33])),
]);
const rimDensity=SUN_SPLAT_KERNELS.reduce((sum,[x,y,sigma,weight])=>sum+weight*Math.exp(-.5*((1-x)**2+y*y)/(sigma*sigma)),0);
// The fifty-percent contour keeps size=1 at the physical .533-degree diameter.
const densityScale=Math.LN2/rimDensity;

/** Zero azimuth points toward -Z; positive azimuth turns toward +X. */
export function solarDirection(azimuth,elevation){
  const a=azimuth*Math.PI/180,e=elevation*Math.PI/180;
  return [Math.sin(a)*Math.cos(e),Math.sin(e),-Math.cos(a)*Math.cos(e)];
}
export function solarRadius(distance,size=1){return distance*Math.tan(SOLAR_DIAMETER_DEGREES*Math.PI/360*size);}

const vertexShader=`
varying vec2 disc;
void main(){disc=uv*4.-2.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragmentShader=`
varying vec2 disc;
uniform float brightness;
uniform vec4 splatKernels[7];
uniform float densityScale;
void main(){
  // Seven round Gaussian splats: no streaks, bristles, ragged edges, or shapes
  // around the sun. Optical-density addition smoothly joins their overlap.
  float density=0.;
  for(int i=0;i<7;i++){
    vec4 kernel=splatKernels[i];
    vec2 delta=(disc-kernel.xy)/kernel.z;
    density+=kernel.w*exp(-.5*dot(delta,delta));
  }
  float support=1.-smoothstep(1.75,2.,length(disc));
  float alpha=(1.-exp(-density*densityScale))*support*min(brightness,1.);
  if(alpha<.001)discard;
  vec3 color=mix(vec3(1.,.94,.80),vec3(1.,.99,.95),clamp(density/1.7,0.,1.));
  gl_FragColor=vec4(color,alpha);
}`;

/** Seven distant round optical splats on one compact quad. No THREE.Light. */
export class PainterlySun {
  constructor(){
    this.geometry=new THREE.PlaneGeometry(2,2);
    this.material=new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms:{brightness:{value:8},densityScale:{value:densityScale},
      splatKernels:{value:SUN_SPLAT_KERNELS.map(kernel=>new THREE.Vector4(...kernel))}},
      transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
      blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,
      blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
      // Starting from alpha=1, store inverse solar coverage. Normal splat alpha
      // above it restores opacity, so 1-finalAlpha is the visible sun fraction.
      blendEquationAlpha:THREE.AddEquation,blendSrcAlpha:THREE.ZeroFactor,blendDstAlpha:THREE.OneMinusSrcAlphaFactor});
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=-100;
    this.direction=new THREE.Vector3();this.facing=new THREE.Vector3();this.front=new THREE.Vector3(0,0,1);
  }
  update(camera,options){
    this.mesh.visible=!!options.sun&&options.sunIntensity>0;
    this.material.uniforms.brightness.value=options.sunIntensity;
    this.direction.fromArray(solarDirection(options.sunAzimuth,options.sunElevation));
    const distance=camera.far*.8;
    this.mesh.position.copy(camera.position).addScaledVector(this.direction,distance);
    this.mesh.quaternion.setFromUnitVectors(this.front,this.facing.copy(this.direction).negate());
    this.mesh.scale.setScalar(solarRadius(distance,options.sunSize)*SUN_SPLAT_SUPPORT);
  }
  dispose(){this.geometry.dispose();this.material.dispose();}
}
