import {MathUtils,Quaternion,Spherical,Vector3} from 'three';

/** Rotate the entire camera frame around a pond, retaining its off-center framing. */
export class LimitedPondOrbit {
  constructor(camera,controls,canvas,config,onChange){
    this.camera=camera;this.controls=controls;this.canvas=canvas;this.onChange=onChange;
    this.pivot=new Vector3().fromArray(config.pivot);
    this.homePosition=camera.position.clone();this.homeTarget=controls.target.clone();this.homeRotation=camera.quaternion.clone();
    this.offset=this.homePosition.clone().sub(this.pivot);this.targetOffset=this.homeTarget.clone().sub(this.pivot);
    this.homeSphere=new Spherical().setFromVector3(this.offset);
    this.right=new Vector3(Math.cos(this.homeSphere.theta),0,-Math.sin(this.homeSphere.theta));
    this.up=new Vector3(0,1,0);this.rotation=new Quaternion();this.pitchRotation=new Quaternion();
    this.limit=MathUtils.degToRad(config.degrees??4);this.yaw=0;this.pitch=0;this.enabled=true;this.pointer=null;
    this.minHeight=config.minHeight??-Infinity;
    controls.enabled=false;
    this.down=event=>{
      if(!this.enabled||event.button!==0||event.isPrimary===false||this.pointer)return;
      this.pointer={id:event.pointerId,x:event.clientX,y:event.clientY,yaw:this.yaw,pitch:this.pitch};
      canvas.setPointerCapture(event.pointerId);event.preventDefault();
    };
    this.move=event=>{
      const p=this.pointer;if(!this.enabled||!p||event.pointerId!==p.id)return;
      const sensitivity=this.limit/Math.max(100,canvas.clientHeight*.35);
      this.apply(p.yaw-(event.clientX-p.x)*sensitivity,p.pitch-(event.clientY-p.y)*sensitivity);
      event.preventDefault();
    };
    this.end=event=>{
      if(event.pointerId!==this.pointer?.id)return;
      if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
      this.pointer=null;
    };
    this.block=event=>{if(this.enabled)event.preventDefault();};
    this.listeners={pointerdown:this.down,pointermove:this.move,pointerup:this.end,pointercancel:this.end,lostpointercapture:this.end,wheel:this.block,contextmenu:this.block};
    for(const [type,handler]of Object.entries(this.listeners))canvas.addEventListener(type,handler,{passive:false});
  }
  apply(yaw,pitch){
    this.yaw=MathUtils.clamp(yaw,-this.limit,this.limit);this.pitch=MathUtils.clamp(pitch,-this.limit,this.limit);
    // Low eye-level scenes also stop before the camera goes below the field.
    const heightAt=value=>this.offset.clone().applyAxisAngle(this.right,value).y+this.pivot.y;
    if(heightAt(this.pitch)<this.minHeight){
      let safe=0,blocked=this.pitch;
      for(let i=0;i<18;i++){
        const middle=(safe+blocked)/2;
        if(heightAt(middle)>=this.minHeight)safe=middle;else blocked=middle;
      }
      this.pitch=safe;
    }
    if(this.yaw===0&&this.pitch===0){
      this.camera.position.copy(this.homePosition);this.controls.target.copy(this.homeTarget);this.camera.quaternion.copy(this.homeRotation);
    }else{
      this.rotation.setFromAxisAngle(this.up,this.yaw).multiply(this.pitchRotation.setFromAxisAngle(this.right,this.pitch));
      this.camera.position.copy(this.offset).applyQuaternion(this.rotation).add(this.pivot);
      this.controls.target.copy(this.targetOffset).applyQuaternion(this.rotation).add(this.pivot);
      this.camera.quaternion.copy(this.rotation).multiply(this.homeRotation);
    }
    this.camera.updateMatrixWorld(true);this.onChange?.();
  }
  restore(saved){
    const spherical=new Spherical().setFromVector3(new Vector3().fromArray(saved.position).sub(this.pivot));
    const delta=spherical.theta-this.homeSphere.theta;
    this.apply(Math.atan2(Math.sin(delta),Math.cos(delta)),spherical.phi-this.homeSphere.phi);
  }
  reset(){this.apply(0,0);}
  dispose(){
    if(this.pointer&&this.canvas.hasPointerCapture(this.pointer.id))this.canvas.releasePointerCapture(this.pointer.id);
    this.pointer=null;
    for(const [type,handler]of Object.entries(this.listeners))this.canvas.removeEventListener(type,handler);
  }
}
