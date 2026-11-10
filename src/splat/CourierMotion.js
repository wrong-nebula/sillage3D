import {Vector3,Quaternion,Euler,MathUtils} from 'three';

const clamp=MathUtils.clamp;
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));

function setWorldRotation(bone,rotation){
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));
  bone.updateWorldMatrix(false,true);
}

/** Position-only two-bone IK; retains the animator's sandal rotation and toe roll. */
export function plantLeg(hip,knee,foot,target){
  const h=hip.getWorldPosition(new Vector3()),k=knee.getWorldPosition(new Vector3()),f=foot.getWorldPosition(new Vector3());
  const footRotation=foot.getWorldQuaternion(new Quaternion());
  const upper=h.distanceTo(k),lower=k.distanceTo(f),aim=target.clone().sub(h),distance=clamp(aim.length(),Math.abs(upper-lower)+.0001,upper+lower-.0001);
  if(!upper||!lower||aim.lengthSq()<1e-12)return;
  aim.normalize();
  const pole=k.clone().sub(h).addScaledVector(aim,-k.clone().sub(h).dot(aim));
  if(pole.lengthSq()<1e-10){pole.set(0,0,1).addScaledVector(aim,-aim.z);if(pole.lengthSq()<1e-10)pole.set(1,0,0);}
  pole.normalize();
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  const desiredKnee=h.clone().addScaledVector(aim,along).addScaledVector(pole,Math.sqrt(Math.max(0,upper*upper-along*along)));
  const desiredFoot=h.clone().addScaledVector(aim,distance);
  const rotation=new Quaternion().setFromUnitVectors(k.clone().sub(h).normalize(),desiredKnee.sub(h).normalize());
  setWorldRotation(hip,rotation.multiply(hip.getWorldQuaternion(new Quaternion())));
  const nextKnee=knee.getWorldPosition(new Vector3()),nextFoot=foot.getWorldPosition(new Vector3());
  rotation.setFromUnitVectors(nextFoot.sub(nextKnee).normalize(),desiredFoot.sub(nextKnee).normalize());
  setWorldRotation(knee,rotation.multiply(knee.getWorldQuaternion(new Quaternion())));
  setWorldRotation(foot,footRotation);
}

/** Brief flat contacts, with eased heel-down/toe-off and the original airborne poses. */
export class CourierFootPlant {
  constructor(actor){
    this.actor=actor;this.legs=['Left','Right'].map(side=>({side,hip:actor.source.getObjectByName(`${side}UpLeg`),knee:actor.source.getObjectByName(`${side}Leg`),foot:actor.source.getObjectByName(`${side}Foot`),weight:0,anchor:null}));
    this.saved=new Map();this.motion='';this.settle=0;
  }
  restore(){for(const [bone,rotation]of this.saved)bone.quaternion.copy(rotation);this.saved.clear();}
  reset(){for(const leg of this.legs){leg.weight=0;leg.anchor=null;}this.settle=0;}
  apply(dt){
    const a=this.actor,c=a.controller,motion=a.clipNames[a.currentClip];
    if(!c.enabled||!c.grounded||!['Idle','Walk','Run','Land'].includes(motion)){this.reset();return;}
    if(motion!==this.motion){this.motion=motion;this.reset();}
    this.settle+=dt;a.root.updateMatrixWorld(true);
    const phase=a.action.time/a.action.getClip().duration;
    for(const leg of this.legs){
      if(!leg.hip||!leg.knee||!leg.foot)continue;
      const running=motion==='Run',gait=running||motion==='Walk';
      // Let the stop/landing blend choose its new stance before holding both feet.
      if(!gait&&a.clipBlend){leg.anchor=null;leg.weight=0;continue;}
      // Contacts measured from the actual fal clips; right foot is half a stride later.
      const t=((phase-(running?.27:.25)-(leg.side==='Right'?.5:0))%1+1)%1;
      const length=running?.23:.54,edge=running?.045:.065;
      const contact=gait?smooth(t/edge)*smooth((length-t)/edge):1;
      let weight=contact*smooth(this.settle/.16);const position=leg.foot.getWorldPosition(new Vector3());
      if(contact<=0){leg.anchor=null;leg.weight=0;continue;}
      if(!leg.anchor)leg.anchor=position.clone();
      // A modest reach limit releases sharp turns without stretching the short legs.
      const offset=leg.anchor.clone().sub(position);offset.y=0;
      weight*=1-smooth((offset.length()-(running?.28:.22))/.12);
      offset.clampLength(0,running?.4:.34);
      const target=position.clone().addScaledVector(offset,weight);
      // The skin is placed above the root's ground after deformation. Solve
      // only the per-foot height difference here, in the same world units.
      if(this.groundHeight){
        const root=a.root.position;
        const lift=this.groundHeight(target.x,target.z)-this.groundHeight(root.x,root.z);
        target.y+=clamp(lift,-.3,.3)*weight;
      }
      // Compress the planted pose slightly when the source leg is already straight.
      // Ground placement below moves the body down, retaining a soft bent-knee step.
      const hip=leg.hip.getWorldPosition(new Vector3()),knee=leg.knee.getWorldPosition(new Vector3());
      const reach=hip.distanceTo(knee)+knee.distanceTo(position)-.001;
      const horizontal=Math.hypot(target.x-hip.x,target.z-hip.z);
      if(horizontal<reach)target.y=Math.max(target.y,hip.y-Math.sqrt(reach*reach-horizontal*horizontal));
      for(const bone of [leg.hip,leg.knee,leg.foot])this.saved.set(bone,bone.quaternion.clone());
      plantLeg(leg.hip,leg.knee,leg.foot,target);
      leg.weight=weight;leg.error=leg.foot.getWorldPosition(new Vector3()).distanceTo(target);
      leg.position=leg.foot.getWorldPosition(new Vector3());
    }
  }
  snapshot(){return this.legs.map(l=>({side:l.side,weight:l.weight,anchor:l.anchor?.toArray()??null,position:l.position?.toArray()??null,error:l.error??0}));}
}

function spring(state,target,dt){
  // Substeps keep the small underdamped settle consistent at low frame rates.
  const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
  for(let i=0;i<steps;i++){state.velocity+=(90*(target-state.value)-13*state.velocity)*h;state.value+=state.velocity*h;}
}

/** Additive banking and parcel inertia; never replaces the preferred wing action. */
export class CourierMotion {
  constructor(actor){
    this.actor=actor;this.parcels=actor.source.getObjectByName('Parcels');this.bank=0;this.pitch=0;this.turnRate=0;
    this.previousYaw=actor.controller.yaw;this.previousVelocity={x:0,y:0,z:0};
    this.sway={pitch:{value:0,velocity:0},roll:{value:0,velocity:0},yaw:{value:0,velocity:0}};this.gaze={x:0,y:0};
  }
  restore(){if(this.saved&&this.parcels)this.parcels.quaternion.copy(this.saved);this.saved=null;}
  step(dt){
    if(dt<=0)return;
    const c=this.actor.controller,velocity=c.velocity,yaw=c.yaw;
    const turn=c.enabled?clamp(angle(yaw-this.previousYaw)/dt,-8,8):0;this.previousYaw=yaw;
    this.turnRate+=(turn-this.turnRate)*(1-Math.exp(-10*dt));
    const speed=c.enabled?Math.hypot(velocity.x,velocity.z):0;
    const piloting=c.enabled&&c.flying&&c.airplaneFlight;
    const bank=piloting?-c.flightBank:c.enabled&&c.flying?clamp(-this.turnRate*.055,-.20,.20)*Math.min(1,speed/2):0;
    this.bank+=(bank-this.bank)*(1-Math.exp(-7*dt));
    const lift=piloting?c.flightInput?.lift??0:0;
    const pitch=piloting?-c.flightPitch:c.enabled&&c.flying?.055*Math.min(1,speed/4.8):0;this.pitch+=(pitch-this.pitch)*(1-Math.exp(-5*dt));
    const ax=c.enabled?clamp((velocity.x-this.previousVelocity.x)/dt,-24,24):0;
    const az=c.enabled?clamp((velocity.z-this.previousVelocity.z)/dt,-24,24):0;
    const side=ax*Math.cos(yaw)-az*Math.sin(yaw),forward=ax*Math.sin(yaw)+az*Math.cos(yaw);
    spring(this.sway.pitch,clamp(-forward*.004,-.075,.075),dt);
    spring(this.sway.roll,clamp(side*.004-this.bank*.28,-.08,.08),dt);
    spring(this.sway.yaw,clamp(-this.turnRate*.012,-.055,.055),dt);
    this.previousVelocity={...velocity};
    const heading=speed>.15?angle(Math.atan2(velocity.x,velocity.z)-yaw):0;
    this.gaze={x:clamp(heading*.26+this.turnRate*.035,-.22,.22),y:c.flying?.09+lift*.10:speed>.15?.035:0,moving:speed>.15||c.flying};
  }
  apply(){
    if(!this.parcels)return;
    const p=this.parcels;this.saved=p.quaternion.clone();p.updateWorldMatrix(true,false);
    const yaw=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),this.actor.root.rotation.y);
    const delta=new Quaternion().setFromEuler(new Euler(this.sway.pitch.value,this.sway.yaw.value,this.sway.roll.value,'YXZ'));
    delta.premultiply(yaw).multiply(yaw.clone().invert());
    setWorldRotation(p,delta.multiply(p.getWorldQuaternion(new Quaternion())));
  }
  snapshot(){return {bank:this.bank,pitch:this.pitch,turnRate:this.turnRate,parcels:Object.fromEntries(Object.entries(this.sway).map(([key,s])=>[key,s.value])),gaze:{...this.gaze}};}
}
