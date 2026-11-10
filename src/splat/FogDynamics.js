import {Vector4} from 'three';

export const MAX_FOG_VORTICES=8;
export function fogDynamicsUniforms(enabled=false){
  return {fogVorticesEnabled:{value:enabled},fogVortices:{value:Array.from({length:MAX_FOG_VORTICES},()=>new Vector4(0,0,-100,0))}};
}

/** Bounded, pausable impulses shared by real taps and the automatic showcase.
 * No simulation textures, per-frame allocations, or unbounded event history. */
export class FogDynamics{
  constructor({bounds=[-6,-6,6,4],auto=true,interval=2.6}={}){
    this.bounds=bounds;this.auto=auto;this.interval=interval;this.uniforms=fogDynamicsUniforms(true);
    this.next=0;this.time=0;this.lastAuto=0;this.started=false;this.disturbances=0;this.manualDisturbances=0;
  }
  disturb(x,z,time=this.time,strength=1.3,manual=true){
    const [x0,z0,x1,z1]=this.bounds;
    if(![x,z,time,strength].every(Number.isFinite)||x<x0||x>x1||z<z0||z>z1)return false;
    this.uniforms.fogVortices.value[this.next].set(x,z,time,Math.max(0,Math.min(2,strength)));
    this.next=(this.next+1)%MAX_FOG_VORTICES;this.disturbances++;if(manual)this.manualDisturbances++;
    return true;
  }
  update(time){
    this.time=time;
    if(!this.started){
      this.started=true;this.lastAuto=time;
      if(this.auto){this.disturb(-1.2,-.4,time-.8,.8,false);this.disturb(1.6,-2,time-.2,.7,false);}
    }
    if(this.auto&&time-this.lastAuto>=this.interval){
      this.lastAuto=time;
      this.disturb(Math.sin(time*.71)*2.7,-1.3+Math.cos(time*.47)*2,time,.9,false);
    }
  }
}

export const FOG_DYNAMICS_GLSL=/* glsl */`
uniform bool fogVorticesEnabled;
uniform vec4 fogVortices[8];
vec3 fogVortexFlow(vec2 point){
  vec3 result=vec3(0.,0.,1.);
  if(!fogVorticesEnabled)return result;
  for(int i=0;i<8;i++){
    vec4 pulse=fogVortices[i];float age=windTime-pulse.z;
    if(pulse.w<=0.||age<0.||age>9.)continue;
    vec2 delta=point-pulse.xy+vec2(.0001),radial=normalize(delta),tangent=vec2(-radial.y,radial.x);
    float radius=.7+age*.44,falloff=exp(-dot(delta,delta)/(radius*radius));
    float envelope=(1.-exp(-age*9.))*exp(-age*.43)*pulse.w;
    float ring=exp(-pow((length(delta)-(.35+age*.7))/.7,2.));
    float handedness=mod(float(i),2.)<.5?1.:-1.;
    result.xy+=(radial*(.65*falloff+.9*ring)+tangent*handedness*falloff*1.45)*envelope;
    result.z*=1.-min(.75,falloff*envelope*.7);
  }
  return result;
}
`;
