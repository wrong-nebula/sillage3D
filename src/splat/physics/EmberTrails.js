import {Vector3} from 'three';

const POINTS=8,SEGMENTS=POINTS-1,LIFETIME=.22;
/** Fixed ring histories, sampled from actual ember trajectories, including
 * bounce contacts. No velocity extrapolation through the floor or a rock.
 */
export class EmberTrails {
  constructor(particleCapacity,capacity=Math.min(64,particleCapacity)){
    this.capacity=capacity;this.next=0;this.visibleSegments=0;
    this.slots=new Int16Array(particleCapacity).fill(-1);this.owners=new Int32Array(capacity).fill(-1);
    this.head=new Uint8Array(capacity);this.count=new Uint8Array(capacity);this.width=new Float32Array(capacity);
    this.positions=new Float32Array(capacity*POINTS*3);this.times=new Float64Array(capacity*POINTS).fill(-Infinity);
    this.direction=new Vector3();this.across=new Vector3();this.up=new Vector3();
    this.splats=Array.from({length:capacity*SEGMENTS},(_,i)=>({center:[0,0,0],axes:[[.01,0,0],[0,.01,0],[0,0,.01]],color:[1,.4,.035],opacity:0,softParticle:true,seed:(i*.618034)%1,material:'ember-trail'}));
  }
  detach(index){const slot=this.slots[index];if(slot>=0&&this.owners[slot]===index)this.owners[slot]=-1;this.slots[index]=-1;}
  attach(index,point,time,size){
    this.detach(index);const slot=this.next++%this.capacity,old=this.owners[slot];
    if(old>=0)this.slots[old]=-1;this.owners[slot]=index;this.slots[index]=slot;this.head[slot]=0;this.count[slot]=0;this.width[slot]=size*.22;
    for(let j=0;j<SEGMENTS;j++)this.splats[slot*SEGMENTS+j].opacity=0;
    this.record(index,point,time,true);
  }
  record(index,point,time,force=false){
    const slot=this.slots[index];if(slot<0||this.owners[slot]!==index)return;
    const last=(this.head[slot]+POINTS-1)%POINTS,previous=slot*POINTS+last;
    if(this.count[slot]){
      const p=previous*3,dx=point.x-this.positions[p],dy=point.y-this.positions[p+1],dz=point.z-this.positions[p+2];
      if(dx*dx+dy*dy+dz*dz<1e-9||!force&&time-this.times[previous]<.025)return;
    }
    const address=slot*POINTS+this.head[slot];point.toArray(this.positions,address*3);this.times[address]=time;
    this.head[slot]=(this.head[slot]+1)%POINTS;this.count[slot]=Math.min(POINTS,this.count[slot]+1);
  }
  sync(time){
    this.visibleSegments=0;
    for(let slot=0;slot<this.capacity;slot++)for(let segment=0;segment<SEGMENTS;segment++){
      const s=this.splats[slot*SEGMENTS+segment];s.opacity=0;if(segment>=this.count[slot]-1)continue;
      const a=slot*POINTS+(this.head[slot]+POINTS-1-segment)%POINTS,b=slot*POINTS+(this.head[slot]+POINTS-2-segment)%POINTS;
      const age=time-this.times[b];if(age>=LIFETIME)continue;
      const ia=a*3,ib=b*3,dx=this.positions[ia]-this.positions[ib],dy=this.positions[ia+1]-this.positions[ib+1],dz=this.positions[ia+2]-this.positions[ib+2],length=Math.hypot(dx,dy,dz);
      if(length<1e-5)continue;
      for(let k=0;k<3;k++)s.center[k]=(this.positions[ia+k]+this.positions[ib+k])*.5;
      this.direction.set(dx,dy,dz).multiplyScalar(1/length);this.up.set(Math.abs(this.direction.y)>.9?1:0,Math.abs(this.direction.y)>.9?0:1,0);
      this.across.crossVectors(this.direction,this.up).normalize();this.up.crossVectors(this.direction,this.across).normalize();
      this.direction.multiplyScalar(Math.max(length*.20,this.width[slot])).toArray(s.axes[0]);
      this.across.multiplyScalar(this.width[slot]).toArray(s.axes[1]);this.up.multiplyScalar(this.width[slot]).toArray(s.axes[2]);
      const fade=Math.max(0,1-age/LIFETIME);s.color[0]=1;s.color[1]=.14+.50*fade;s.color[2]=.035+.10*fade;
      s.opacity=.72*fade*fade;this.visibleSegments++;
    }
  }
}
