import {Vector3} from 'three';

/** Read-only focus metering over the source splats, independent of streamed LOD.
 * A small camera-space aperture finds visible surfaces, then accumulates their
 * front-to-back coverage. Empty space and sky never become a focus subject.
 */
export class CameraFocus {
  constructor(){this.current=12;this.target=12;this.velocity=0;this.anchor=null;this.key='';this.initial=true;this.lastTime=null;}
  setScene(splats){
    this.samples=new Float32Array(splats.length*14);
    splats.forEach((s,i)=>{
      const k=i*14;this.samples.set(s.center,k);
      for(let a=0;a<3;a++)this.samples.set(s.axes[a],k+3+a*3);
      this.samples[k+12]=s.noFog||s.skyBackground||s.softParticle?0:s.opacity;
      this.samples[k+13]=Math.max(...s.axes.map(a=>Math.hypot(...a)));
    });
    this.anchor=null;this.key='';this.initial=true;this.lastTime=null;
  }
  meter(camera,{height=1000,brushScale=1,x=0,y=0,click=false}={}){
    camera.updateMatrixWorld(true);
    const m=camera.matrixWorldInverse.elements,p=camera.projectionMatrix.elements;
    const width=height*camera.aspect,fx=width*p[0]*.5,fy=height*p[5]*.5;
    const tx=x*width*.5,ty=y*height*.5,aperture=height*(click ? .006 : .025),aperture2=aperture*aperture;
    const hits=[],s=this.samples;
    for(let k=0;k<s.length;k+=14){
      const opacity=s[k+12];if(!opacity)continue;
      const wx=s[k],wy=s[k+1],wz=s[k+2];
      const px=m[0]*wx+m[4]*wy+m[8]*wz+m[12],py=m[1]*wx+m[5]*wy+m[9]*wz+m[13];
      const depth=-(m[2]*wx+m[6]*wy+m[10]*wz+m[14]),sigma=s[k+13]*brushScale;
      if(depth<Math.max(camera.near,sigma*1.5))continue;
      const dx=px/depth*fx-tx,dy=py/depth*fy-ty;
      const guard=sigma*Math.max(fx,fy)/depth*3+aperture*3;
      if(Math.abs(dx)>guard||Math.abs(dy)>guard)continue;
      let xx=.3,xy=0,yy=.3;
      for(let a=0;a<3;a++){
        const j=k+3+a*3,ax=s[j]*brushScale,ay=s[j+1]*brushScale,az=s[j+2]*brushScale;
        const vx=m[0]*ax+m[4]*ay+m[8]*az,vy=m[1]*ax+m[5]*ay+m[9]*az,vz=m[2]*ax+m[6]*ay+m[10]*az;
        const u=fx*(vx/depth+px*vz/(depth*depth)),v=fy*(vy/depth+py*vz/(depth*depth));
        xx+=u*u;xy+=u*v;yy+=v*v;
      }
      const det=Math.max(.0001,xx*yy-xy*xy);xx+=aperture2;yy+=aperture2;
      const blurredDet=xx*yy-xy*xy,r2=(yy*dx*dx-2*xy*dx*dy+xx*dy*dy)/blurredDet;
      if(r2>9)continue;
      const weight=Math.min(.95,opacity*Math.sqrt(det/blurredDet)*Math.exp(-r2*.5));
      if(weight>.0003)hits.push({depth,weight,k});
    }
    hits.sort((a,b)=>a.depth-b.depth);
    let transmittance=1,total=0;
    const visible=[];
    for(const hit of hits){const contribution=transmittance*hit.weight;visible.push({...hit,contribution});total+=contribution;transmittance*=1-hit.weight;if(transmittance<.04)break;}
    if(total<.025)return null;
    let accumulated=0;
    for(const hit of visible){
      accumulated+=hit.contribution;
      if(accumulated>=total*.5)return {distance:hit.depth,point:new Vector3(s[hit.k],s[hit.k+1],s[hit.k+2]),confidence:total};
    }
    return null;
  }
  hold(point){this.anchor=point.clone();this.key='';}
  release(){this.anchor=null;this.key='';}
  get moving(){return Math.abs(this.current-this.target)>.005||Math.abs(this.velocity)>.01;}
  update(camera,options,now,fallbackDistance){
    if(!options.foregroundDOF){
      this.target=options.autoFocus?fallbackDistance:(options.focusDistance??fallbackDistance);
      this.current=this.target;this.velocity=0;this.key='';this.initial=true;this.lastTime=now;return;
    }
    const wasMoving=this.moving;
    camera.updateMatrixWorld(true);
    const key=[...camera.matrixWorldInverse.elements,...camera.projectionMatrix.elements,options.autoFocus,options.brushScale,options.focusDistance].join(',');
    if(key!==this.key){
      this.key=key;
      if(options.autoFocus){
        const subject=this.meter(camera,options);
        // Hold the last reliable subject across small gaps between leaves.
        if(subject)this.target=subject.distance;
        else if(this.initial)this.target=fallbackDistance;
      }else if(this.anchor){
        this.target=-this.anchor.clone().applyMatrix4(camera.matrixWorldInverse).z;
      }else this.target=options.focusDistance??fallbackDistance;
      this.target=Math.max(.15,Math.min(600,this.target));
    }
    // A view that slept must start its pull at rest rather than consume the
    // idle interval as an animation step on the first visible frame.
    const dt=this.lastTime===null||(!wasMoving&&now-this.lastTime>250)?0:Math.min(.1,Math.max(0,(now-this.lastTime)/1000));this.lastTime=now;
    if(this.initial||!options.foregroundDOF){this.current=this.target;this.velocity=0;this.initial=false;return;}
    // Critically damped focus pull. The camera itself stays under direct control.
    const omega=12,offset=this.current-this.target,j=(this.velocity+omega*offset)*dt,decay=Math.exp(-omega*dt);
    this.current=this.target+(offset+j)*decay;this.velocity=(this.velocity-omega*j)*decay;
    if(!this.moving){this.current=this.target;this.velocity=0;}
  }
}
