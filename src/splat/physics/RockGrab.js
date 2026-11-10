import {Vector3} from 'three';

/** A critically damped point constraint, evaluated on the world's fixed ticks.
 * The off-centre anchor uses the sphere's translational + rotational effective
 * mass. The mouse never teleports the body through collision geometry.
 */
export class RockGrab {
  constructor(world,{frequency=22,maxAcceleration=180,maxThrowSpeed=24}={}){
    this.world=world;this.frequency=frequency;this.maxAcceleration=maxAcceleration;this.maxThrowSpeed=maxThrowSpeed;
    this.body=null;this.localAnchor=new Vector3();this.target=new Vector3();this.inputVelocity=new Vector3();
    this.offset=new Vector3();this.anchor=new Vector3();this.pointVelocity=new Vector3();this.impulse=new Vector3();this.work=new Vector3();
    this.history=new Float64Array(8*4);this.count=0;this.next=0;this.sampleAge=0;this.lastSample=-Infinity;
    this.lastThrowSpeed=0;this.releaseReason='';
  }
  begin(body,point,time){
    if(!body.enabled||!body.inverseMass)return false;
    this.end(time,false,'replaced');this.body=body;this.wasSleepable=body.canSleep;body.canSleep=false;
    this.world.wake(body);
    this.localAnchor.copy(point).sub(body.position).applyQuaternion(body.rotation.clone().invert());
    this.target.copy(point);this.inputVelocity.set(0,0,0);this.count=0;this.next=0;this.releaseReason='';
    this.setTarget(point,time);return true;
  }
  setTarget(point,time){
    if(!this.body||!Number.isFinite(time)||!point.toArray().every(Number.isFinite))return;
    this.target.copy(point);this.sampleAge=0;this.lastSample=time;
    const k=this.next*4;this.history[k]=time;this.history[k+1]=point.x;this.history[k+2]=point.y;this.history[k+3]=point.z;
    this.next=(this.next+1)%8;this.count=Math.min(8,this.count+1);
    let n=0,sumT=0,sumTT=0,sx=0,sy=0,sz=0,tx=0,ty=0,tz=0;
    for(let i=0;i<this.count;i++){
      const p=i*4,t=(this.history[p]-time)/1000;if(t<-.12||t>0)continue;
      n++;sumT+=t;sumTT+=t*t;sx+=this.history[p+1];sy+=this.history[p+2];sz+=this.history[p+3];
      tx+=t*this.history[p+1];ty+=t*this.history[p+2];tz+=t*this.history[p+3];
    }
    const denominator=n*sumTT-sumT*sumT;
    if(n>1&&denominator>1e-9)this.inputVelocity.set((n*tx-sumT*sx)/denominator,(n*ty-sumT*sy)/denominator,(n*tz-sumT*sz)/denominator).clampLength(0,this.maxThrowSpeed);
    else this.inputVelocity.set(0,0,0);
  }
  getAnchor(out){
    if(!this.body)return out.copy(this.target);
    return out.copy(this.localAnchor).applyQuaternion(this.body.rotation).add(this.body.position);
  }
  step(dt){
    const b=this.body;if(!b)return;
    if(!b.enabled){this.end(this.lastSample,false,'fracture');return;}
    this.world.wake(b);this.sampleAge+=dt;
    this.offset.copy(this.localAnchor).applyQuaternion(b.rotation);this.anchor.copy(b.position).add(this.offset);
    this.pointVelocity.crossVectors(b.angularVelocity,this.offset).add(b.velocity);
    const omega=this.frequency,denominator=2*omega+dt*omega*omega,bias=omega*omega/denominator;
    const gain=dt*denominator/(1+dt*denominator);
    this.work.subVectors(this.target,this.anchor).clampLength(0,3).multiplyScalar(bias)
      .addScaledVector(this.inputVelocity,Math.exp(-Math.max(0,this.sampleAge-.03)*22)).sub(this.pointVelocity);
    const r2=this.offset.lengthSq(),perpendicular=b.inverseMass+b.inverseInertia*r2;
    this.impulse.copy(this.work).multiplyScalar(1/perpendicular);
    if(r2>1e-12)this.impulse.addScaledVector(this.offset,this.work.dot(this.offset)/r2*(1/b.inverseMass-1/perpendicular));
    this.impulse.multiplyScalar(gain).clampLength(0,b.mass*this.maxAcceleration*dt);
    b.velocity.addScaledVector(this.impulse,b.inverseMass);
    this.work.crossVectors(this.offset,this.impulse);b.angularVelocity.addScaledVector(this.work,b.inverseInertia).clampLength(0,35);
  }
  end(time,throwing=true,reason='released'){
    const b=this.body;if(!b)return;
    if(throwing&&b.enabled&&time>=this.lastSample&&time-this.lastSample<=100&&this.count>1){
      this.offset.copy(this.localAnchor).applyQuaternion(b.rotation);
      this.pointVelocity.crossVectors(b.angularVelocity,this.offset).add(b.velocity);
      this.work.subVectors(this.inputVelocity,this.pointVelocity).multiplyScalar(.85).clampLength(0,this.maxThrowSpeed);
      b.velocity.add(this.work).clampLength(0,this.maxThrowSpeed);
    }
    if(reason==='cancelled'){b.velocity.set(0,0,0);b.angularVelocity.set(0,0,0);}
    b.canSleep=this.wasSleepable;this.lastThrowSpeed=b.velocity.length();this.body=null;this.releaseReason=reason;
  }
  snapshot(){return {active:Boolean(this.body),body:this.body?.id??null,target:this.target.toArray(),lastThrowSpeed:this.lastThrowSpeed,releaseReason:this.releaseReason};}
}
