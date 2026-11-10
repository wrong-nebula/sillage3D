import {Plane,Raycaster,Vector2,Vector3} from 'three';

/** Capture a rock gesture before OrbitControls sees pointerdown. Empty-ground
 * and Shift gestures stay with the camera. All body motion stays in the solver.
 */
export class PhysicsLabMouse {
  constructor(engine,physics,{onGrab=()=>{}}={}){
    this.engine=engine;this.physics=physics;this.canvas=engine.renderer.domElement;this.onGrab=onGrab;
    this.pointer=null;this.hover=null;this.depth=0;this.depthOffset=0;this.lastX=0;this.lastY=0;
    this.raycaster=new Raycaster();this.ndc=new Vector2();this.plane=new Plane();this.normal=new Vector3();
    this.planePoint=new Vector3();this.target=new Vector3();this.projected=new Vector3();
    this.status=document.querySelector('#rock-grab-status');this.guide=document.querySelector('#rock-grab-guide');
    this.line=this.guide?.querySelector('line');this.anchorDot=this.guide?.querySelector('.grab-anchor');this.targetDot=this.guide?.querySelector('.grab-target');
    this.handlers={pointerdown:e=>this.down(e),pointermove:e=>this.move(e),pointerup:e=>this.up(e),pointercancel:e=>this.cancel(e),lostpointercapture:e=>this.cancel(e),wheel:e=>this.wheel(e),pointerleave:()=>{if(this.pointer===null)this.feedback(null);}};
    for(const [type,handler]of Object.entries(this.handlers))this.canvas.addEventListener(type,handler,{capture:true,passive:false});
    this.key=e=>{if(e.code==='Escape'&&this.pointer!==null){e.preventDefault();e.stopImmediatePropagation();this.cancel();}};
    this.blur=()=>this.cancel();this.visibility=()=>{if(document.hidden)this.cancel();};
    window.addEventListener('keydown',this.key,true);window.addEventListener('blur',this.blur);document.addEventListener('visibilitychange',this.visibility);
  }
  ray(x,y){
    const rect=this.canvas.getBoundingClientRect();this.ndc.set((x-rect.left)/rect.width*2-1,1-(y-rect.top)/rect.height*2);
    this.engine.camera.updateMatrixWorld(true);this.raycaster.setFromCamera(this.ndc,this.engine.camera);return this.raycaster.ray;
  }
  feedback(selection){
    if(this.physics.inspector?.enabled){this.canvas.style.cursor='crosshair';if(this.status)this.status.textContent='Physics inspection · click to select · drag to orbit';return;}
    this.hover=selection;this.canvas.style.cursor=this.pointer!==null?'grabbing':selection?'grab':'auto';
    const label=this.physics.activeGrab.body?.kind==='flex'?this.physics.activeGrab.label:selection?.label??'Rock';
    const text=this.pointer!==null?`Holding ${label.toLowerCase()} · release to let go · scroll to change distance · Esc to drop`
      :selection?`${label} ready to grab · drag and release`:'Grab a rock, rope, cloth or plant · Shift-drag always orbits';
    if(this.status&&this.status.textContent!==text)this.status.textContent=text;
  }
  down(event){
    if(this.physics.inspector?.enabled)return;
    if(event.button===0&&event.altKey&&event.isPrimary!==false&&!this.engine.physicsPaused){
      const ray=this.ray(event.clientX,event.clientY),hit=this.physics.pickInteraction(ray);
      if(hit)this.target.copy(hit.point);else{
        let near=0,found=false;
        for(let far=.5;far<=140;far+=1){ray.at(far,this.target);if(this.target.y>this.physics.world.height(this.target.x,this.target.z)){near=far;continue;}
          for(let i=0;i<12;i++){const middle=(near+far)/2;ray.at(middle,this.target);if(this.target.y>this.physics.world.height(this.target.x,this.target.z))near=middle;else far=middle;}
          ray.at((near+far)/2,this.target);found=true;break;
        }if(!found)return;
      }
      event.preventDefault();event.stopImmediatePropagation();this.target.y+=.12;this.physics.explode(this.target);this.onGrab();this.engine.dirty=true;this.engine.onInvalidate?.();return;
    }
    if(event.button!==0||event.isPrimary===false||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey||this.pointer!==null||this.engine.physicsPaused)return;
    const hit=this.physics.pickInteraction(this.ray(event.clientX,event.clientY));if(!hit)return;
    if(!this.physics.beginGrab(hit,event.timeStamp))return;
    event.preventDefault();event.stopImmediatePropagation();
    this.pointer=event.pointerId;this.lastX=event.clientX;this.lastY=event.clientY;
    this.restoreControls=this.engine.controls.enabled;this.engine.controls.enabled=false;
    this.normal.copy(this.engine.camera.getWorldDirection(this.target));this.planePoint.copy(hit.point);this.depthOffset=0;
    this.depth=this.planePoint.clone().sub(this.engine.camera.position).dot(this.normal);
    this.plane.setFromNormalAndCoplanarPoint(this.normal,this.planePoint);
    this.canvas.setPointerCapture(event.pointerId);this.onGrab();this.feedback(hit);this.update();
  }
  move(event){
    if(this.physics.inspector?.enabled)return;
    if(this.pointer===null){
      if(!event.buttons&&!this.engine.physicsPaused)this.feedback(event.shiftKey?null:this.physics.pickInteraction(this.ray(event.clientX,event.clientY)));
      return;
    }
    if(event.pointerId!==this.pointer)return;
    event.preventDefault();event.stopImmediatePropagation();this.lastX=event.clientX;this.lastY=event.clientY;
    this.moveTarget(event.timeStamp);
  }
  moveTarget(time){
    if(this.ray(this.lastX,this.lastY).intersectPlane(this.plane,this.target)){
      this.physics.activeGrab.setTarget(this.target,time);this.engine.dirty=true;this.engine.onInvalidate?.();
    }
  }
  wheel(event){
    if(this.pointer===null)return;
    event.preventDefault();event.stopImmediatePropagation();
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?this.canvas.clientHeight:1);
    const next=Math.max(2,Math.min(110,this.depth+this.depthOffset+pixels*.012)),change=next-(this.depth+this.depthOffset);
    this.depthOffset+=change;this.planePoint.addScaledVector(this.normal,change);
    this.plane.setFromNormalAndCoplanarPoint(this.normal,this.planePoint);this.moveTarget(event.timeStamp);
  }
  up(event){
    if(event.pointerId!==this.pointer)return;
    event.preventDefault();event.stopImmediatePropagation();this.physics.activeGrab.end(event.timeStamp,true);
    this.finish();
  }
  cancel(event){
    if(this.pointer===null||event?.pointerId!==undefined&&event.pointerId!==this.pointer)return;
    this.physics.activeGrab.end(performance.now(),false,'cancelled');this.finish();
  }
  finish(){
    const pointer=this.pointer;this.pointer=null;
    this.engine.controls.enabled=this.restoreControls;
    if(pointer!==null&&this.canvas.hasPointerCapture(pointer))this.canvas.releasePointerCapture(pointer);
    this.guide?.toggleAttribute('hidden',true);this.feedback(null);this.engine.dirty=true;this.engine.onInvalidate?.();
  }
  update(){
    if(this.pointer===null)return;
    if(!this.physics.activeGrab.body){this.finish();return;}
    if(!this.guide)return;
    const rect=this.canvas.getBoundingClientRect();this.guide.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);this.guide.toggleAttribute('hidden',false);
    this.physics.activeGrab.getAnchor(this.projected).project(this.engine.camera);
    const ax=(this.projected.x+1)*.5*rect.width,ay=(1-this.projected.y)*.5*rect.height;
    this.projected.copy(this.physics.activeGrab.target).project(this.engine.camera);
    const tx=(this.projected.x+1)*.5*rect.width,ty=(1-this.projected.y)*.5*rect.height;
    this.line.setAttribute('x1',ax);this.line.setAttribute('y1',ay);this.line.setAttribute('x2',tx);this.line.setAttribute('y2',ty);
    this.anchorDot.setAttribute('cx',ax);this.anchorDot.setAttribute('cy',ay);this.targetDot.setAttribute('cx',tx);this.targetDot.setAttribute('cy',ty);
  }
  dispose(){
    this.cancel();for(const [type,handler]of Object.entries(this.handlers))this.canvas.removeEventListener(type,handler,true);
    window.removeEventListener('keydown',this.key,true);window.removeEventListener('blur',this.blur);document.removeEventListener('visibilitychange',this.visibility);
    this.canvas.style.cursor='';
  }
}
