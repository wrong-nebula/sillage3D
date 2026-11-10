import {Vector3} from 'three';
import {TerrainTraceAtlas} from './TerrainTraceAtlas.js';

const DETAIL=16,FEET=96,ROCKS=160,COUNT=FEET+ROCKS;
const INFILL=[.76,.59,.37];
const SNOW_INFILL=[.83,.90,.98];
const clamp=x=>Math.max(0,Math.min(1,x));
const axis=(x,y,z,size)=>{const k=size/Math.hypot(x,y,z);return [x*k,y*k,z*k];};

/** Fixed splat pools: shallow shaded hollows and raised, terrain-aligned sand.
 * Contact history belongs to body slots; recycling/airborne gaps break trails.
 * All terrain queries and geometry construction happen only when stamping.
 */
export class SandTraces{
  constructor(height,capacity,{bounds=null,materials=null}={}){
    this.materials=materials;
    this.height=height;this.clock=0;this.steps=0;this.tracks=0;this.impacts=0;this.nextFoot=0;this.nextRock=0;
    this.previous=null;this.distance=0;this.records=new Array(COUNT).fill(null);
    this.history=new Array(capacity);this.cursor=0;this.snowTracks=0;this.snowImpacts=0;
    this.bounds=bounds;
    this.atlas=new TerrainTraceAtlas();
    this.splats=Array.from({length:COUNT*DETAIL},(_,i)=>({center:[0,0,0],axes:[[.1,0,0],[0,0,.1],[0,.006,0]],color:[.5,.35,.2],opacity:0,seed:(i*.6180339)%1,softParticle:true,material:'sand-trace'}));
    this.windVelocity=new Vector3();this.visible=0;this.visibleSand=0;this.visibleSnow=0;this.cover=0;
  }
  stamp(x,z,yaw,width,length,kind='foot',strength=1,snow=false){
    this.atlas.stamp(x,z,yaw,width,length,kind,strength,snow);
    const index=kind==='foot'?this.nextFoot++%FEET:FEET+this.nextRock++%ROCKS;
    const f=[Math.sin(yaw),Math.cos(yaw)],r=[f[1],-f[0]];
    const gx=(this.height(x+.08,z)-this.height(x-.08,z))/.16,gz=(this.height(x,z+.08)-this.height(x,z-.08))/.16;
    const bases=[];
    for(let j=0;j<DETAIL;j++){
      const rim=j>=4,angle=(j-4)*Math.PI/6;
      let side,ahead,w,l;
      if(rim){side=Math.cos(angle)*width;ahead=Math.sin(angle)*length;w=width*.25;l=length*.25;}
      else if(kind==='foot'){
        // Heel pad plus three narrow toes, like the courier's cliff prints.
        side=j===2?width*.55:j===3?-width*.55:0;ahead=j===0?-length*.24:length*.48;
        w=width*(j===0?.53:.24);l=length*(j===0?.43:.62);
      }else{side=(j%2?1:-1)*width*.32;ahead=(j<2?-1:1)*length*.35;w=width*.7;l=length*.72;}
      const dx=r[0]*side+f[0]*ahead,dz=r[1]*side+f[1]*ahead;
      const px=x+dx,pz=z+dz;
      // Sample each patch, so broad rock marks also follow dune curvature.
      const ground=this.height(px,pz),y=ground+(snow?(this.materials?(rim?.035:.012):(rim?.16:.112)):(rim?.052:.031));
      const dark=kind==='impact'?.70:.80,light=.94+.10*Math.cos(angle-.7);
      const color=snow?(rim?[.83*light,.90*light,.98*light]:[.32,.43,.60]):(rim?[.82*light,.65*light,.42*light]:[.63*dark,.46*dark,.28*dark]);
      const axes=[axis(r[0],gx*r[0]+gz*r[1],r[1],w),axis(f[0],gx*f[0]+gz*f[1],f[1],l),axis(-gx,1,-gz,rim?.012:.006)];
      const s=this.splats[index*DETAIL+j];s.center[0]=px;s.center[1]=y;s.center[2]=pz;
      s.axes=axes;s.color=color;
      bases.push({color:[...color],opacity:(rim?.52:.86)*strength,y,ground});
    }
    this.records[index]={born:this.clock,life:snow?55:kind==='foot'?65:85,bases,snow,x,z};
    if(kind==='foot')this.steps++;else if(kind==='impact')this.impacts++;else this.tracks++;
    if(snow){if(kind==='impact')this.snowImpacts++;else this.snowTracks++;}
  }
  capture(world,cover=this.cover){
    const count=world.bodies.length,start=this.cursor;
    let budget=4;
    // Round-robin service keeps a blast's many fragments from starving behind
    // lower body IDs. Geometry work is still capped at four marks per tick.
    for(let i=0;i<count;i++){
      const b=world.bodies[(start+i)%count],touch=b.terrainTouch;
      if(!b.enabled||!b.inverseMass||touch.tick!==world.stats.ticks||touch.revision!==b.revision)continue;
      const {x,z}=touch.point;
      const snow=this.materials?this.materials.snowDepth(x,z)>.008:cover>.08;
      if(this.bounds&&(x<this.bounds[0]||x>this.bounds[1]||z<this.bounds[2]||z>this.bounds[3]))continue;
      let h=this.history[b.id];
      const fresh=!h||h.revision!==b.revision||h.snow!==snow||world.stats.ticks-h.tick>2;
      if(!h)h=this.history[b.id]={stamps:0};
      if(fresh)h.broken=true;
      const dx=x-h.x,dz=z-h.z,distance=Math.hypot(dx,dz),width=Math.max(.13,Math.min(.8,touch.radius*.52));
      const unmarked=h.stampRevision!==b.revision||h.stampSnow!==snow;
      const travel=unmarked?Infinity:Math.hypot(b.position.x-h.bodyX,b.position.z-h.bodyZ);
      const moving=Math.hypot(b.velocity.x,b.velocity.z)>.12||Math.hypot(b.position.x-b.previous.x,b.position.z-b.previous.z)>.003;
      const landing=touch.energy>Math.max(1.5,b.mass*.5)&&(fresh||world.stats.ticks-(h.impactTick??-100)>12);
      // Lobe switches can move the contact point while the rock stays still.
      // Space marks by centre travel to keep idle contacts out of the pool.
      if(budget&&(landing||(moving&&travel>Math.max(.18,width*.65)))){
        const connected=!h.broken&&!unmarked&&distance<1.5;
        const yaw=connected?Math.atan2(dx,dz):Math.atan2(b.velocity.x,b.velocity.z);
        if(landing){
          this.stamp(x,z,yaw,width*1.3,width*1.1,'impact',.8+.2*clamp(touch.energy/120),snow);h.impactTick=world.stats.ticks;
        }else{
          // A brief hop or an overloaded stamp budget starts a fresh patch;
          // neither suppress the touch nor draw a line across empty air.
          this.stamp(connected?(x+h.x)*.5:x,connected?(z+h.z)*.5:z,yaw,width,connected?Math.min(.8,distance*.6+width*.6):width*.9,'track',1,snow);
        }
        budget--;h.stamps++;h.x=x;h.z=z;h.bodyX=b.position.x;h.bodyZ=b.position.z;
        h.stampRevision=b.revision;h.stampSnow=snow;h.broken=false;this.cursor=(b.id+1)%count;
      }
      h.tick=world.stats.ticks;h.revision=b.revision;h.snow=snow;
    }
  }
  update(dt,crow,snow,wind,time){
    this.cover=snow;
    wind?.sample(crow.controller.position,time,this.windVelocity);
    const speed=wind?this.windVelocity.length():0;
    this.atlas.update(dt,speed);
    this.clock+=dt*(1+Math.min(5,speed*speed*.025));
    const c=crow.controller,p=c.position;
    if(c.grounded&&snow<=.08){
      if(this.previous){
        const distance=Math.hypot(p.x-this.previous.x,p.z-this.previous.z);
        if(distance<1.5)this.distance+=distance;else this.distance=0;
        if(this.distance>=.52){
          this.distance%=.52;const side=this.steps%2===0?1:-1,foot=crow.footPlant?.legs[this.steps%2]?.position;
          const near=foot&&Math.hypot(foot.x-p.x,foot.z-p.z)<1.5;
          this.stamp(near?foot.x:p.x+Math.cos(c.yaw)*side*.22,near?foot.z:p.z-Math.sin(c.yaw)*side*.22,c.yaw,.17,.28);
        }
      }
      if(!this.previous)this.previous={x:p.x,z:p.z};else{this.previous.x=p.x;this.previous.z=p.z;}
    }else{this.previous=null;this.distance=0;}
    const cover=1-clamp((snow-.025)/.10),snowCover=clamp((snow-.035)/.135);this.visible=0;this.visibleSand=0;this.visibleSnow=0;
    for(let i=0;i<COUNT;i++){
      const record=this.records[i];if(!record)continue;
      const age=this.clock-record.born,remaining=clamp((record.life-age)/(record.life-8));
      const fade=remaining*remaining*(3-2*remaining);
      const localSnow=this.materials?clamp(this.materials.snowDepth(record.x,record.z)/.03):snowCover;
      const visibility=this.materials?(record.snow?localSnow:1-localSnow):record.snow?snowCover:cover;
      if(fade*visibility>.01){this.visible++;if(record.snow)this.visibleSnow++;else this.visibleSand++;}
      for(let j=0;j<DETAIL;j++){
        const s=this.splats[i*DETAIL+j],base=record.bases[j];s.opacity=base.opacity*fade*visibility;
        if(this.materials&&s.opacity>.001)s.center[1]=base.y+this.height(s.center[0],s.center[2])-base.ground;
        // Wind infill reduces the relief's contrast without touching geometry.
        for(let k=0;k<3;k++){const infill=record.snow?SNOW_INFILL[k]:INFILL[k];s.color[k]=base.color[k]+(infill-base.color[k])*(1-remaining)*.6;}
      }
      if(!remaining)this.records[i]=null;
    }
  }
  writePacked(data,centers,start){
    for(let i=0;i<this.splats.length;i++){
      const s=this.splats[i],o=(start+i)*20;data[o+3]=s.opacity;if(!s.opacity)continue;
      data.set(s.center,o);for(let a=0;a<3;a++)data.set(s.axes[a],o+4+a*4);
      data.set(s.color,o+16);centers.set(s.center,(start+i)*3);
    }
  }
  snapshot(){return {steps:this.steps,tracks:this.tracks,impacts:this.impacts,snowTracks:this.snowTracks,snowImpacts:this.snowImpacts,visible:this.visible,visibleSand:this.visibleSand,visibleSnow:this.visibleSnow,capacity:COUNT,splats:this.splats.length,retention:this.atlas.snapshot()};}
  dispose(){this.atlas.dispose();}
}
