/** Bounded, analytic water motion. Time is the renderer's pausable scene clock.
 * This is an art-directed surface, not a volume-conserving fluid simulation. */
import {openingWaterDistance} from './ForestTerrain.js';
export const MAX_RIPPLES=8;
export const MAX_WATER_OBSTACLES=12;
export const RIPPLE_LIFETIME=9;
export const shoreline=x=>2.5+1.1*Math.sin(x*.13)+.45*Math.sin(x*.36);
// The opening has a curved mineral shoreline and an irregular rounded basin.
export function isForestWater(x,z){return openingWaterDistance(x,z)>0&&z>shoreline(x)&&z<65;}

export class DynamicWater {
  constructor({amplitude=.035,speed=.65,flow=[.9,.25],obstacles=[],contains=isForestWater}={}){
    this.amplitude=amplitude;this.speed=speed;this.flow=flow;
    this.obstacles=obstacles.slice(0,MAX_WATER_OBSTACLES);this.contains=contains;
    this.ripples=Array.from({length:MAX_RIPPLES},()=>[0,0,-100,0]);this.next=0;
  }
  disturb(x,z,time,strength=1){
    if(![x,z,time,strength].every(Number.isFinite)||!this.contains(x,z)||this.obstacles.some(([ox,oz,r])=>Math.hypot(x-ox,z-oz)<r))return false;
    this.ripples[this.next]=[x,z,time-.12,Math.max(0,Math.min(2,strength))];
    this.next=(this.next+1)%MAX_RIPPLES;return true;
  }
  sample(x,z,time){
    const t=time*this.speed,v=[...this.flow];
    for(const [ox,oz,r]of this.obstacles){
      const dx=x-ox+.0001,dz=z-oz+.0001,len=Math.hypot(dx,dz),nx=dx/len,nz=dz/len;
      const influence=Math.exp(-Math.max(0,Math.hypot(x-ox,z-oz)-r)*.65),along=v[0]*nx+v[1]*nz;
      v[0]-=nx*along*influence*.86;v[1]-=nz*along*influence*.86;
    }
    const px=x+(v[0]-this.flow[0])*1.6-this.flow[0]*t,pz=z+(v[1]-this.flow[1])*1.6-this.flow[1]*t;
    let h=this.amplitude*(.58*Math.sin(px*.62+pz*.24)+.27*Math.sin(px*-.31+pz*1.13+t*.5)+.15*Math.sin(px*2.1+pz*1.7-t*.4));
    for(const [rx,rz,born,strength]of this.ripples){
      const age=time-born;if(age<0||age>RIPPLE_LIFETIME)continue;
      const distance=Math.hypot(x-rx,z-rz),front=distance-age*1.65;
      h+=.09*strength*Math.sin(front*7)*Math.exp(-front*front*1.8-age*.38)*Math.min(1,age*4)*Math.min(1,(RIPPLE_LIFETIME-age)*2);
    }
    return h;
  }
}

export const DYNAMIC_WATER_GLSL=`
uniform bool dynamicWater;
uniform vec4 waterDynamics;
uniform vec4 waterRipples[8];
uniform vec3 waterObstacles[12];
uniform int waterObstacleCount;
vec2 waterFlow(vec2 p){
  vec2 v=waterDynamics.zw;
  for(int i=0;i<12;i++){
    if(i>=waterObstacleCount)break;
    vec2 d=p-waterObstacles[i].xy;float r=waterObstacles[i].z;
    float influence=exp(-max(0.,length(d)-r)*.65);
    vec2 n=normalize(d+vec2(.0001));
    v-=n*dot(v,n)*influence*.86;
  }
  return v;
}
float dynamicWaterHeight(vec2 p){
  float t=windTime*waterDynamics.y;
  // Static obstacle deflection avoids gradients growing with elapsed time.
  vec2 q=p+(waterFlow(p)-waterDynamics.zw)*1.6-waterDynamics.zw*t;
  float h=waterDynamics.x*(.58*sin(q.x*.62+q.y*.24)+.27*sin(q.x*-.31+q.y*1.13+t*.5)+.15*sin(q.x*2.1+q.y*1.7-t*.4));
  for(int i=0;i<8;i++){
    vec4 r=waterRipples[i];float age=windTime-r.z;
    if(age<0.||age>9.||r.w<=0.)continue;
    float front=distance(p,r.xy)-age*1.65;
    h+=.09*r.w*sin(front*7.)*exp(-front*front*1.8-age*.38)*min(1.,age*4.)*min(1.,(9.-age)*2.);
  }
  return h;
}
vec2 dynamicWaterSlope(vec2 p){
  return vec2(dynamicWaterHeight(p+vec2(.04,0.))-dynamicWaterHeight(p-vec2(.04,0.)),dynamicWaterHeight(p+vec2(0.,.04))-dynamicWaterHeight(p-vec2(0.,.04)))/.08;
}
`;
