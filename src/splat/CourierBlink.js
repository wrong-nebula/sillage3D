import {Matrix3, Vector3} from 'three';
const INK_DABS=9;
export const COURIER_EYE_SPLATS=2*(INK_DABS+1);
const INK=[.016,.014,.020];

function eyeDab(seed,color){
  return {center:[0,0,0],axes:[[.01,0,0],[0,.01,0],[0,0,.002]],color:[...color],opacity:0,seed,material:'actor'};
}

function surfaceFrame(origin,along,across,matrix){
  const x=new Vector3().subVectors(along,origin).normalize();
  const z=new Vector3().crossVectors(x,new Vector3().subVectors(across,origin)).normalize();
  const y=new Vector3().crossVectors(z,x);
  return matrix.set(x.x,y.x,z.x,x.y,y.y,z.y,x.z,y.z,z.z);
}

function eyeAnchors(points){
  if(points.length<3)return null;
  const anchor=points.reduce((a,b)=>a.u>b.u?a:b);
  const opposite=points.reduce((a,b)=>a.u<b.u?a:b);
  const area=p=>Math.abs((opposite.u-anchor.u)*(p.v-anchor.v)-(opposite.v-anchor.v)*(p.u-anchor.u));
  const third=points.reduce((a,b)=>area(a)>area(b)?a:b);
  if(area(third)<.04)return null;
  const inverse=surfaceFrame(anchor.rest,opposite.rest,third.rest,new Matrix3()).transpose();
  return {anchor,opposite,third,inverse,world:new Matrix3()};
}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};

/** Eyelids sweep over the eye's own fixed surface samples, so they cannot drift. */
export class CourierBlink {
  constructor(samples,regions,normalization){
    this.time=0;this.value=0;this.forced=null;this.start=2.3;this.count=0;this.doublePending=false;this.points=[];
    this.gaze={x:0,y:0};this.forcedGaze=null;
    const scale=new Vector3().setFromMatrixScale(normalization).x;
    this.regions=regions.map(region=>({center:new Vector3().fromArray(region.center).applyMatrix4(normalization),
      horizontal:new Vector3().fromArray(region.horizontal).transformDirection(normalization),
      vertical:new Vector3().fromArray(region.vertical).transformDirection(normalization),
      normal:new Vector3().fromArray(region.normal).transformDirection(normalization),radius:region.radius.map(v=>v*scale)}));
    const delta=new Vector3();
    samples.forEach((sample,index)=>{
      for(let eye=0;eye<this.regions.length;eye++){
        const r=this.regions[eye];delta.fromArray(sample.restCenter).sub(r.center);
        const u=delta.dot(r.horizontal)/r.radius[0],v=delta.dot(r.vertical)/r.radius[1],depth=delta.dot(r.normal);
        if(u*u+v*v<1.12&&Math.abs(depth)<.11){this.points.push({index,u,v,depth,rest:delta.clone().add(r.center),eye,pigment:sample.pigment??[.9,.8,.7]});break;}
      }
    });
    this.pupils=this.regions.map((_,eye)=>{
      const points=this.points.filter(p=>p.eye===eye),dark=points.filter(p=>p.u*p.u+p.v*p.v<.6&&Math.max(...p.pigment)<.2);
      const white=points.filter(p=>Math.min(...p.pigment)>.4);
      if(!white.length)return null;
      const u=dark.length?Math.max(-.32,Math.min(.32,dark.reduce((sum,p)=>sum+p.u,0)/dark.length)):0;
      const v=dark.length?Math.max(-.30,Math.min(.30,dark.reduce((sum,p)=>sum+p.v,0)/dark.length)):0;
      const ru=Math.max(.24,Math.min(.31,Math.max(...dark.map(p=>Math.abs(p.u-u)))+.055));
      const rv=Math.max(.26,Math.min(.34,Math.max(...dark.map(p=>Math.abs(p.v-v)))+.06));
      return {u,v,ru,rv,points:points.filter(p=>p.u*p.u+p.v*p.v<.77),
        white:[0,1,2].map(k=>white.reduce((sum,p)=>sum+p.pigment[k],0)/white.length)};
    });
    this.highlights=this.regions.map((_,eye)=>eyeDab(.31+eye*.27,[1,1,1]));
    this.ink=this.regions.map((_,eye)=>Array.from({length:INK_DABS},(_,i)=>eyeDab(((i*5+eye*3)%11)/11,INK)));
    this.splats=[...this.ink.flat(),...this.highlights];
    this.frames=this.pupils.map(pupil=>pupil?eyeAnchors(pupil.points):null);
    this.scratch=Array.from({length:7},()=>new Vector3());
  }
  advance(dt,look){
    this.time+=dt;
    // Infrequent quiet glances; turn anticipation takes precedence while travelling.
    const cycle=this.time%8.6,glance=cycle>4.5&&cycle<6.4?Math.sin((cycle-4.5)/1.9*Math.PI)**2:0;
    const target=this.forcedGaze??(look?.moving?look:{x:glance*(Math.floor(this.time/8.6)%2?-.16:.16),y:glance*.035});
    const blend=this.forcedGaze?1:1-Math.exp(-11*dt);
    for(const axis of ['x','y'])this.gaze[axis]+=((target[axis]??0)-this.gaze[axis])*blend;
    while(this.time>this.start+.24){
      this.count++;
      if(this.count%4===0&&!this.doublePending){this.start+=.40;this.doublePending=true;}
      else{this.start+=4.2+((this.count*1.61803398875)%1)*2.1;this.doublePending=false;}
    }
    const t=this.time-this.start;
    this.value=this.forced??(t<0?0:t<.08?smooth(t/.08):t<.11?1:1-smooth((t-.11)/.13));
  }
  apply(splats){
    const blink=this.value;
    const gaze=this.pupils.map(pupil=>{
      if(!pupil)return null;
      const u=pupil.u+this.gaze.x,v=pupil.v+this.gaze.y;
      const limit=Math.min(1,.49/(Math.hypot(u,v)||1));
      return {u:u*limit,v:v*limit};
    });
    const upper=1.1-1.85*blink,lower=-1.1+.35*blink;
    for(const {index,u,v,eye,pigment} of this.points){
      const s=splats[index],pupil=this.pupils[eye];
      if(pupil&&u*u+v*v<.64){
        const d=Math.hypot((u-gaze[eye].u)/pupil.ru,(v-gaze[eye].v)/pupil.rv);
        const ink=1-smooth((d-.77)/.45),shade=.78+.22*Math.max(0,s.axes[2][1]/(Math.hypot(...s.axes[2])||1));
        for(let k=0;k<3;k++){
          // Repaint the pupil's full travel area; retaining the original dark edge
          // would leave a second, stationary pupil behind a sideways glance.
          const paper=pupil.white[k]*(.985+.015*Math.sin(u*31+v*19));
          s.color[k]=(paper*(1-ink)+.025*ink)*shade;
        }
      }
      if(blink<=0)continue;
      const closure=Math.max(smooth((v-upper+.055)/.11),smooth((lower-v+.045)/.09));
      // Warm eyelid matches the coral eye rim; the narrow fold reads as a closed eye.
      const crease=smooth((blink-.88)/.12)*(1-smooth(Math.abs(v+.73)/.11))*(1-smooth((Math.abs(u)-.5)/.45));
      const shade=.76+.24*Math.max(0,s.axes[2][1]/(Math.hypot(...s.axes[2])||1));
      const lid=[.76,.24,.17];
      for(let k=0;k<3;k++)s.color[k]=s.color[k]*(1-closure)+(lid[k]*shade*(1-crease)+.055*crease)*closure;
    }
    for(let eye=0;eye<this.highlights.length;eye++){
      this.applyPupil(eye,splats,gaze[eye],upper,lower);
    }
  }
  applyPupil(eye,splats,gaze,upper,lower){
    const highlight=this.highlights[eye],ink=this.ink[eye],frame=this.frames[eye];
    highlight.opacity=0;
    for(const dab of ink)dab.opacity=0;
    if(!frame||!gaze||this.value>=.995)return;
    const pupil=this.pupils[eye],region=this.regions[eye],{u,v}=gaze;
    const [origin,along,across,horizontal,vertical,normal,position]=this.scratch;
    origin.fromArray(splats[frame.anchor.index].center);
    along.fromArray(splats[frame.opposite.index].center);
    across.fromArray(splats[frame.third.index].center);
    const rotation=surfaceFrame(origin,along,across,frame.world).multiply(frame.inverse);
    horizontal.copy(region.horizontal).applyMatrix3(rotation);
    vertical.copy(region.vertical).applyMatrix3(rotation);
    normal.copy(region.normal).applyMatrix3(rotation);
    // Keep the ink above the white splat footprints while following the rigid head.
    let depth=-Infinity;
    for(const point of pupil.points){
      if(Math.hypot(point.u-u,point.v-v)<.43)depth=Math.max(depth,point.depth);
    }
    if(!Number.isFinite(depth))depth=0;
    const closure=y=>this.value<=0?0:Math.max(smooth((y-upper+.055)/.11),smooth((lower-y+.045)/.09));
    const mark=(dab,x,y,width,height,lift)=>{
      position.copy(region.center).sub(frame.anchor.rest)
        .addScaledVector(region.horizontal,x*region.radius[0])
        .addScaledVector(region.vertical,y*region.radius[1])
        .addScaledVector(region.normal,depth+lift)
        .applyMatrix3(rotation).add(origin).toArray(dab.center);
      horizontal.toArray(dab.axes[0]);vertical.toArray(dab.axes[1]);normal.toArray(dab.axes[2]);
      for(let i=0;i<3;i++){
        dab.axes[0][i]*=width;dab.axes[1][i]*=height;dab.axes[2][i]*=.002;
      }
      dab.opacity=1-closure(y);
    };
    ink.forEach((dab,i)=>{
      const angle=(i-1)*Math.PI/4,radius=i===0?0:.49,size=i===0?.52:.36;
      mark(dab,u+Math.cos(angle)*radius*pupil.ru,v+Math.sin(angle)*radius*pupil.rv,
        pupil.ru*region.radius[0]*size,pupil.rv*region.radius[1]*size,.025);
    });
    const radius=Math.min(...region.radius)*.045;
    mark(highlight,u-pupil.ru*.27,v+pupil.rv*.33,radius,radius*.85,.031);
    highlight.opacity*=.88;
  }

  snapshot(){return {value:this.value,time:this.time,gaze:{...this.gaze},samples:this.points.length,perEye:this.regions.map((_,eye)=>this.points.filter(p=>p.eye===eye).length)};}
}
