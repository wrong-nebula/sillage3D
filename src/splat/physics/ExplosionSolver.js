import {Vector3} from 'three';
import {writePhysicsSplat} from './SplatParticles.js';

/** Local, bounded pressure impulses. The stationary hash is shared with contact
 * solving; only nearby proxies are queried, never the Gaussian paint field.
 */
export class ExplosionSolver {
  constructor(world,{activate=()=>{},fracture=()=>{},damage=()=>[],effect=()=>{},maxAffected=96}={}){
    this.world=world;this.activate=activate;this.fracture=fracture;this.damage=damage;this.effect=effect;this.maxAffected=maxAffected;
    this.hits=[];this.origin=new Vector3();this.direction=new Vector3();this.impulse=new Vector3();this.probe=new Vector3();
    this.blasts=Array.from({length:4},()=>({position:new Vector3(),born:-100,radius:0}));this.next=0;
    this.stats={count:0,affected:0,candidates:0,fractured:0};
    this.splats=Array.from({length:128},(_,i)=>({center:[0,0,0],axes:[[.03,0,0],[0,.03,0],[0,0,.03]],color:[1,.68,.25],opacity:0,softParticle:true,seed:(i*.618034)%1,material:'blast-wave'}));
  }
  explode(point,{radius=7,pressureImpulse=700}={}){
    if(![point.x,point.y,point.z,radius,pressureImpulse].every(Number.isFinite)||radius<=0||radius>30||pressureImpulse<0||pressureImpulse>5000)throw new RangeError('Invalid explosion parameters');
    point=this.origin.copy(point);
    this.world.querySphere(point,radius,this.hits,this.maxAffected);let affected=0,fractured=0;
    for(const body of this.hits){
      if(!body.enabled||body.type==='kinematic')continue;
      const owner=body.authored??(body.cluster?.body===body&&!body.cluster.broken?body.cluster:null);
      if(!body.inverseMass&&!owner)continue;
      this.direction.subVectors(body.position,point);const distance=this.direction.length(),surfaceDistance=Math.max(0,distance-body.radius);
      if(surfaceDistance>=radius)continue;
      if(distance<1e-8)this.direction.set(0,1,0);else this.direction.multiplyScalar(1/distance);
      let transmission=1;
      for(let i=1;i<6;i++){this.probe.lerpVectors(point,body.position,i/6);if(this.probe.y<this.world.height(this.probe.x,this.probe.z)-.08){transmission=.15;break;}}
      const falloff=(1-surfaceDistance/radius)**2;
      const magnitude=Math.min(body.mass*20,pressureImpulse*Math.PI*body.radius*body.radius*falloff*transmission);
      if(magnitude<.001)continue;
      const energy=.5*magnitude*magnitude/body.mass;this.impulse.copy(this.direction).multiplyScalar(magnitude);
      if(owner?.damage&&!owner.broken){
        const mass=body.mass,released=this.damage(owner,energy,point);
        if(released.length)fractured++;
        if(body.enabled){this.activate(body);body.velocity.addScaledVector(this.impulse,1/mass).clampLength(0,32);this.world.wake(body);}
        for(const fragment of released){fragment.velocity.addScaledVector(this.impulse,1/mass).clampLength(0,32);this.world.wake(fragment);}
      }else if(owner&&!owner.broken&&energy>=owner.threshold){
        this.fracture(owner);fractured++;
        // The parent impulse is distributed by mass, conserving the net blast
        // impulse even when newly exposed fragment areas sum to more than it.
        for(const chunk of owner.chunks){chunk.body.velocity.addScaledVector(this.impulse,1/body.mass);this.world.wake(chunk.body);}
      }else{
        this.activate(body);if(!body.inverseMass)continue;
        body.velocity.addScaledVector(this.impulse,body.inverseMass).clampLength(0,32);this.world.wake(body);
      }
      affected++;
    }
    const blast=this.blasts[this.next++%this.blasts.length];blast.position.copy(point);blast.born=this.world.time;blast.radius=radius;
    this.stats={count:this.stats.count+1,affected,candidates:this.world.lastQueryCandidates,fractured};this.effect(point,{radius,pressureImpulse});return {...this.stats};
  }
  sync(time){
    for(let i=0;i<this.splats.length;i++){
      const s=this.splats[i],blast=this.blasts[Math.floor(i/32)],age=time-blast.born,t=age/.45;
      if(t<0||t>=1){s.opacity=0;continue;}
      const angle=(i%32)*Math.PI*2/32,radius=blast.radius*Math.sqrt(t),x=blast.position.x+Math.cos(angle)*radius,z=blast.position.z+Math.sin(angle)*radius;
      s.center[0]=x;s.center[1]=this.world.height(x,z)+.06;s.center[2]=z;
      const reach=Math.max(.025,radius*.06);s.axes[0][0]=-Math.sin(angle)*reach;s.axes[0][2]=Math.cos(angle)*reach;
      s.axes[1][1]=.025;s.axes[2][0]=Math.cos(angle)*.035;s.axes[2][2]=Math.sin(angle)*.035;s.axes[2][1]=0;
      s.opacity=.5*(1-t)**2;
    }
  }
  writePacked(data,centers,start){for(let i=0;i<this.splats.length;i++)writePhysicsSplat(this.splats[i],data,centers,start+i);}
}
