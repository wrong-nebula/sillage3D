import {Vector3} from 'three';

const COUNT=112;
const noise=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const smooth=(x,a,b)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};

/** Single Gaussian grains shaken off the snow-coated upper parcel surfaces. */
export class SnowShedding{
 constructor(crow,height,{wind=null}={}){
  this.wind=wind;this.windPoint=new Vector3();this.windVelocity=new Vector3();
  this.height=height;this.time=0;this.next=0;this.emitted=0;this.nextGust=1.6;
  this.grounded=true;this.flying=false;
  this.sources=crow.samples.flatMap((sample,i)=>sample.restCenter[1]>1.65&&sample.pigment[0]>sample.pigment[2]*1.12&&sample.pigment[0]>.18?[i]:[]);
  this.records=Array.from({length:COUNT},()=>null);
  this.splats=Array.from({length:COUNT},(_,i)=>({center:[0,0,0],axes:[[.04,0,0],[0,.04,0],[0,0,.04]],color:[.93,.97,1],opacity:0,seed:noise(i),softParticle:true,material:'shed-snow'}));
 }
 emit(crow,count,kick){
  if(!this.sources.length)return;
  for(let i=0;i<count;i++){
   const id=this.emitted++,seed=noise(id+19);let source;
   for(let attempt=0;attempt<12;attempt++){
    const s=crow.splats[this.sources[Math.floor(noise(id*19+attempt)*this.sources.length)]];
    source=s;const n=s.axes[2];if(n[1]/Math.hypot(...n)>.3)break;
   }
   const [x,y,z]=source.center,slot=this.next++%COUNT;
   this.records[slot]={x,y:y+.03,z,vx:.6*(.8+1.5*seed)+crow.controller.velocity.x*.15,
    vy:.1+.5*noise(id+21)+kick,vz:.8*(.8+1.5*seed)+crow.controller.velocity.z*.15,
    born:this.time,life:1.8+1.2*noise(id+23),size:.024+.024*seed,seed};
  }
 }
 update(dt,crow,snow){
  this.time+=dt;const c=crow.controller;
  if(snow>.15){
   if(this.grounded&&!c.grounded)this.emit(crow,18,.55);
   if(!this.flying&&c.flying)this.emit(crow,26,.7);
   if(this.time>=this.nextGust){
    this.nextGust=this.time+1.9+noise(this.emitted+77)*1.6;
    if(.5+.5*Math.cos(this.time*1.35)>.45)this.emit(crow,3,0);
   }
  }
  this.grounded=c.grounded;this.flying=c.flying;
  const airSpeed=4.+2.2*(.5+.5*Math.cos(this.time*1.35));
  const windResponse=1-Math.exp(-7*dt);
  for(let i=0;i<COUNT;i++){
   const r=this.records[i],s=this.splats[i];if(!r)continue;
   const age=this.time-r.born,t=age/r.life;
   if(t>=1||snow<=.02){s.opacity=0;this.records[i]=null;continue;}
   if(this.wind)this.wind.sample(this.windPoint.set(r.x,r.y,r.z),this.time,this.windVelocity);
   r.vx+=((this.wind?this.windVelocity.x:airSpeed*.6)-r.vx)*windResponse;
   r.vz+=((this.wind?this.windVelocity.z:airSpeed*.8)-r.vz)*windResponse;r.vy-=1.4*dt;
   r.x+=r.vx*dt;r.z+=r.vz*dt;r.y+=r.vy*dt;
   const clearance=r.y-this.height(r.x,r.z)-.085;
   const fade=(1-smooth(t,.35,1))*smooth(clearance,.015,.17)*Math.min(1,snow*3);
   s.center[0]=r.x+.045*Math.sin(age*9+r.seed*6);s.center[1]=r.y;s.center[2]=r.z;
   const size=r.size*(1+.20*t);s.axes[0][0]=size;s.axes[1][1]=size*.8;s.axes[2][2]=size;s.opacity=.72*fade;
   if(clearance<=0){s.opacity=0;this.records[i]=null;}
  }
 }
 writePacked(data,centers,start){
  for(let i=0;i<COUNT;i++){
   const s=this.splats[i],offset=(start+i)*20;
   data.set(s.center,offset);data[offset+3]=s.opacity;
   for(let axis=0;axis<3;axis++)data.set(s.axes[axis],offset+4+axis*4);
   centers.set(s.center,(start+i)*3);
  }
 }
 snapshot(){return {emitted:this.emitted,visible:this.records.filter(Boolean).length,sources:this.sources.length};}
}
