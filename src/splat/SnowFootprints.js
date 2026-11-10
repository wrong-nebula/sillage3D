const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(x,a,b)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const MARKS=16,COUNT=80;
const INFILL=[.76,.83,.92];
const axis=(x,y,z,length)=>{const scale=length/Math.hypot(x,y,z);return [x*scale,y*scale,z*scale];};

/** Cached shallow sandal hollows with terrain-aligned, raised snow rims. */
export class SnowFootprints{
 constructor(height,{onStamp=null,materials=null}={}){
  this.materials=materials;
  this.onStamp=onStamp;
  this.height=height;this.time=0;this.next=0;this.steps=0;this.distance=0;this.previous=null;
  this.records=Array.from({length:COUNT},()=>null);this.bases=new Array(COUNT*MARKS);
  this.splats=Array.from({length:COUNT*MARKS},(_,i)=>({center:[0,0,0],axes:[[.1,0,0],[0,0,.1],[0,.006,0]],color:[.43,.55,.69],opacity:0,seed:(i*.6180339)%1,softParticle:true,material:'snow-footprint'}));
 }
 stamp(x,z,yaw){
  this.onStamp?.(x,z,yaw);
  const index=this.next++%COUNT;
  this.records[index]={born:this.time,life:24+5*((index*.618)%1),x,z};this.steps++;
  const f=[Math.sin(yaw),Math.cos(yaw)],r=[f[1],-f[0]],ground=this.height(x,z);
  const gx=(this.height(x+.12,z)-this.height(x-.12,z))/.24,gz=(this.height(x,z+.12)-this.height(x,z-.12))/.24;
  for(let j=0;j<MARKS;j++){
   const rim=j>=4,angle=(j-4)*Math.PI/6;
   const side=rim?Math.cos(angle)*.22:j===1?.13:j===3?-.13:0;
   const ahead=rim?Math.sin(angle)*.34:j===0?0:j===2?.31:.24;
   const dx=r[0]*side+f[0]*ahead,dz=r[1]*side+f[1]*ahead;
   const px=x+dx,pz=z+dz,groundY=ground+gx*dx+gz*dz;
   let axes,color,opacity;
   if(rim){
    const tx=-r[0]*Math.sin(angle)*.22+f[0]*Math.cos(angle)*.34;
    const tz=-r[1]*Math.sin(angle)*.22+f[1]*Math.cos(angle)*.34;
    const rx=r[0]*Math.cos(angle)+f[0]*Math.sin(angle),rz=r[1]*Math.cos(angle)+f[1]*Math.sin(angle);
    axes=[axis(tx,gx*tx+gz*tz,tz,.085),axis(rx,gx*rx+gz*rz+.40,rz,.055),axis(-rx*.40-gx,1,-rz*.40-gz,.009)];
    const normal=axes[2],sun=Math.max(0,(-.797*normal[0]+.343*normal[1]+.494*normal[2])/.009);
    color=[.76+.22*sun,.83+.16*sun,.92+.08*sun];opacity=.84;
   }else{
    const width=j===0?.18:.085,length=j===0?.28:.115;
    axes=[axis(r[0],gx*r[0]+gz*r[1],r[1],width),axis(f[0],gx*f[0]+gz*f[1],f[1],length),axis(-gx,1,-gz,.006)];
    color=[.32,.43,.60];opacity=.94;
   }
   const offset=index*MARKS+j;
   this.bases[offset]={center:[px,groundY+(this.materials?(rim?.035:.012):(rim?.18:.112)),pz],surface:groundY+(this.materials?.025:.13),ground:this.height(px,pz),axes,color,opacity};
  }
 }
 update(dt,crow,snow){
  this.time+=dt;
  if(snow<=.035&&!this.materials){
   this.records.fill(null);for(const s of this.splats)s.opacity=0;this.previous=null;this.distance=0;return;
  }
  const c=crow.controller,p=c.position;
  if(c.grounded&&snow>.035){
   if(this.previous){
    const distance=Math.hypot(p.x-this.previous.x,p.z-this.previous.z);
    if(distance<2)this.distance+=distance;else this.distance=0;
    if(this.distance>=.52){
     this.distance%=.52;const side=this.steps%2===0?1:-1;
     const foot=crow.footPlant?.legs[this.steps%2]?.position;
     const near=foot&&Math.hypot(foot.x-p.x,foot.z-p.z)<1.5;
     this.stamp(near?foot.x:p.x+Math.cos(c.yaw)*side*.22,near?foot.z:p.z-Math.sin(c.yaw)*side*.22,c.yaw);
    }
   }
   this.previous={x:p.x,z:p.z};
  }else{this.previous=null;this.distance=0;}
  for(let i=0;i<COUNT;i++){
   const record=this.records[i];if(!record)continue;
   const age=this.time-record.born;
   const infill=age+.16*(Math.sin(this.time*1.35)-Math.sin(record.born*1.35));
   const localSnow=this.materials?this.materials.snowDepth(record.x,record.z)*5:snow;
   const remaining=1-smooth(infill,5,record.life),opacity=remaining**1.6*smooth(localSnow,.035,.17),blur=1+(1-remaining)*.25;
   for(let j=0;j<MARKS;j++){
    const offset=i*MARKS+j,s=this.splats[offset],base=this.bases[offset];
    for(let k=0;k<3;k++){
     s.center[k]=base.center[k];s.color[k]=base.color[k]+(INFILL[k]-base.color[k])*(1-remaining);
     for(let a=0;a<3;a++)s.axes[a][k]=base.axes[a][k]*blur;
    }
    s.center[1]+=(base.surface-s.center[1])*(1-remaining);
    if(this.materials&&opacity>.001)s.center[1]+=this.height(s.center[0],s.center[2])-base.ground;
    s.opacity=opacity*base.opacity;
   }
   if(remaining===0)this.records[i]=null;
  }
 }
 writePacked(data,centers,start){
  for(let i=0;i<this.splats.length;i++){
   const s=this.splats[i],offset=(start+i)*20;
   data[offset+3]=s.opacity;if(s.opacity===0)continue;
   data.set(s.center,offset);
   for(let axis=0;axis<3;axis++)data.set(s.axes[axis],offset+4+axis*4);
   data.set(s.color,offset+16);centers.set(s.center,(start+i)*3);
  }
 }
 snapshot(){return {steps:this.steps,visible:this.records.filter(Boolean).length};}
}
