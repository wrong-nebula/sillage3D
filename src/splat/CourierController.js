const FLIGHT_CEILING=4.5, LANDING_CLEARANCE=.14;
const CRUISE_SPEED=4.8, SLOW_SPEED=2.25;

export const COURIER_KEYS=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Space','ShiftLeft','ShiftRight']);

/** Camera-relative movement over the invisible, infinite y=0 ground plane. */
export class CourierController {
  constructor(onMotion=()=>{},{airplaneFlight=false}={}){
    this.onMotion=onMotion;this.keys=new Set();this.position={x:0,y:0,z:0};
    this.velocity={x:0,y:0,z:0};this.yaw=0;this.grounded=true;this.flying=false;
    this.enabled=true;this.motion='Idle';this.landing=0;this.flightAltitude=0;this.flightInput=null;
    this.airplaneFlight=airplaneFlight;this.flightBank=0;this.flightPitch=0;
    this.speedScale=1;this.allowRunning=true;
  }
  setKey(code,down){
    if(!COURIER_KEYS.has(code))return false;
    const fresh=down&&!this.keys.has(code);
    if(down){if(!this.enabled)this.motion='';this.keys.add(code);this.enabled=true;}else this.keys.delete(code);
    if(fresh&&code==='Space'){
      if(this.grounded){this.grounded=false;this.velocity.y=5.4;this.landing=0;this.setMotion('Jump');}
      else if(this.flying){this.flying=false;this.flightInput=null;this.velocity.y=0;this.setMotion('Land');}
    }
    if(fresh&&code.startsWith('Shift')&&!this.grounded){
      this.flying=!this.flying;this.flightInput=null;this.velocity.y=0;
      if(this.flying){
        this.flightAltitude=Math.max(.6,this.position.y);this.flightBank=0;this.flightPitch=0;
      }
      this.setMotion(this.flying?'Fly':'Land');
    }
    return true;
  }
  clearKeys(){this.keys.clear();this.flightInput=null;}
  setFlightInput(steer,lift){
    this.flightInput=this.airplaneFlight&&this.flying&&Number.isFinite(steer)&&Number.isFinite(lift)
      ? {steer:Math.max(-1,Math.min(1,steer)),lift:Math.max(-1,Math.min(1,lift))}
      : null;
  }
  adjustFlightAltitude(delta){
    if(!this.flying||!Number.isFinite(delta))return;
    this.flightAltitude=Math.max(0,Math.min(FLIGHT_CEILING,this.flightAltitude+delta));
  }
  setMotion(name,restart=false){if(name!==this.motion||restart){this.motion=name;this.onMotion(name,restart);}}
  step(dt,forward={x:0,z:-1}){
    if(!this.enabled)return;
    dt=Math.max(0,Math.min(dt,.1));this.landing=Math.max(0,this.landing-dt);
    const key=(...codes)=>codes.some(code=>this.keys.has(code))?1:0;
    const left=key('KeyA','ArrowLeft'),right=key('KeyD','ArrowRight');
    const backward=key('KeyS','ArrowDown');
    let side=right-left,ahead=key('KeyW','ArrowUp')-backward;
    const length=Math.hypot(side,ahead);if(length){side/=length;ahead/=length;}
    const fLength=Math.hypot(forward.x,forward.z)||1,fx=forward.x/fLength,fz=forward.z/fLength;
    const running=this.grounded&&this.allowRunning&&key('ShiftLeft','ShiftRight');
    const piloting=this.flying&&this.airplaneFlight;
    let speed=(this.flying?CRUISE_SPEED:running?4.4:2)*this.speedScale;
    let dx=fx*ahead-fz*side,dz=fz*ahead+fx*side;
    if(piloting){
      const input=this.flightInput;
      const steer=Math.max(-1,Math.min(1,(input?.steer??0)+right-left));
      const response=1-Math.exp(-5*dt);
      this.flightBank+=(steer*.56-this.flightBank)*response;
      this.flightPitch+=((input?.lift??0)*.53-this.flightPitch)*response;
      this.yaw+=Math.sin(this.flightBank)*2.5*dt;
      speed=(backward?SLOW_SPEED:CRUISE_SPEED)*this.speedScale;
      this.adjustFlightAltitude(Math.sin(this.flightPitch)*speed*dt);
      const horizontal=Math.cos(this.flightPitch);
      dx=Math.sin(this.yaw)*horizontal;dz=Math.cos(this.yaw)*horizontal;
    }
    const response=length||piloting?(this.flying?8:18):24,decay=Math.exp(-response*dt);
    for(const [axis,target] of [['x',dx*speed],['z',dz*speed]]){
      const old=this.velocity[axis];this.position[axis]+=target*dt+(old-target)*(1-decay)/response;
      this.velocity[axis]=target+(old-target)*decay;
    }
    const movingSpeed=Math.hypot(this.velocity.x,this.velocity.z);
    if(!piloting&&movingSpeed>.08){const angle=Math.atan2(this.velocity.x,this.velocity.z),delta=Math.atan2(Math.sin(angle-this.yaw),Math.cos(angle-this.yaw));this.yaw+=delta*(1-Math.exp(-12*dt));}
    if(this.flying){
      this.position.y=this.flightAltitude+(this.position.y-this.flightAltitude)*Math.exp(-5*dt);
    }else if(!this.grounded){
      this.position.y+=this.velocity.y*dt-5.5*dt*dt;this.velocity.y-=11*dt;
    }
    const touchdown=this.flying
      ? this.flightAltitude<=LANDING_CLEARANCE&&this.position.y<=LANDING_CLEARANCE
      : this.position.y<=0;
    if(!this.grounded&&touchdown){
      this.position.y=0;this.velocity.y=0;this.grounded=true;this.flying=false;this.flightInput=null;
      this.landing=.45;this.setMotion('Land',true);
    }
    if(this.flying)this.setMotion('Fly');
    else if(!this.grounded){if(this.motion!=='Jump')this.setMotion('Land');}
    else if(length||movingSpeed>.12)this.setMotion(this.allowRunning&&(running||movingSpeed>2.4)?'Run':'Walk');
    else this.setMotion(this.landing>0?'Land':'Idle');
  }
  snapshot(){return {enabled:this.enabled,position:{...this.position},velocity:{...this.velocity},grounded:this.grounded,flying:this.flying,motion:this.motion,yaw:this.yaw};}
}
