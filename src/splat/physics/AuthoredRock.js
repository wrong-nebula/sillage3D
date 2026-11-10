import {Matrix3, Quaternion, Vector3} from 'three';
import {writePhysicsSplat} from './SplatParticles.js';
import {partitionRock} from './RockShape.js';
import {RockDamage,seamWeight} from './RockDamage.js';
const SNOW_COLOR=[.86,.93,1];

/** Lazy fracture of an existing contiguous range. Keeps its exact surface
 * marks, moss, colors, opacity and GPU addresses. No replacement rock mesh.
 */
export class AuthoredRock {
  constructor(world, descriptor, source,{advanced=false}={}) {
    this.world=world;this.descriptor=descriptor;this.source=source;this.active=true;this.broken=false;this.heat=0;this.chunks=[];
    this.position=new Vector3();this.rotation=new Quaternion();this.matrix=new Matrix3();this.scratch=new Vector3();
    const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);
    for(let i=descriptor.start;i<descriptor.start+descriptor.count;i++){this.scratch.fromArray(source[i].center);min.min(this.scratch);max.max(this.scratch);}
    this.center=min.clone().add(max).multiplyScalar(.5);
    this.extents=max.clone().sub(min).multiplyScalar(.5);
    this.body=world.createBody({type:'fixed',position:this.center,radius:Math.max(.08,Math.min(this.extents.x,this.extents.y,this.extents.z)),mass:Math.max(.2,descriptor.diameter**3*5)});
    this.body.authored=this;this.mobile=false;
    this.threshold=Math.max(2,this.body.mass*1.4);this.written=false;
    if(advanced){
      const points=Array.from({length:descriptor.count},(_,i)=>new Vector3(...source[descriptor.start+i].center).sub(this.center));
      this.parts=partitionRock(points,Math.min(6,Math.max(2,Math.floor(points.length/20))));
      for(const p of this.parts)p.mass=this.body.mass*p.indices.length/points.length;
      this.damage=new RockDamage(this,this.parts);this.body.ccd=true;world.setCompound(this.body,this.parts);
    }
  }
  mobilize(){
    if(this.mobile||this.broken)return false;
    this.mobile=true;this.world.makeDynamic(this.body);this.body.drag=.12;
    this.body.windResponse=this.body.baseWindResponse=Math.min(.3,.055*this.body.radius**2/this.body.mass);
    if(this.descriptor.collider)this.descriptor.collider.destroyed=true;
    if(this.damage){this.prepareBindings();return true;}
    const records=[];
    for(let i=0;i<this.descriptor.count;i++){
      const index=this.descriptor.start+i,original=this.source[index];
      const splat={...original,center:[...original.center],axes:original.axes.map(a=>[...a]),color:[...original.color]};
      records.push({index,splat,center:new Vector3(...original.center).sub(this.center),axes:original.axes.map(a=>new Vector3(...a)),color:[...original.color],opacity:original.opacity});
    }
    this.chunks=[{body:this.body,records,lastPose:new Float64Array(7).fill(Infinity),lastSnow:-1,lastHeat:-1,dirty:true}];
    return true;
  }
  fracture(){
    if(this.broken)return false;
    if(this.damage)return this.detach(this.damage.allMask())>0;
    this.broken=true;this.world.setEnabled(this.body,false);
    if(this.descriptor.collider)this.descriptor.collider.destroyed=true;
    const count=this.descriptor.count,number=Math.min(6,Math.max(2,Math.floor(count/20)));
    const parent=this.body,points=Array.from({length:count},(_,i)=>new Vector3(...this.source[this.descriptor.start+i].center)
      .sub(this.center).applyQuaternion(parent.rotation).add(parent.position));
    this.chunks=[];
    // Farthest-point seeds followed by bounded Lloyd iterations give spatial
    // chunks for arbitrary authored shapes instead of six overlapping balls.
    const seeds=[points[0].clone()],assignment=new Uint8Array(count);
    while(seeds.length<number){let best=0,distance=-1;for(let i=0;i<count;i++){let d=Infinity;for(const seed of seeds)d=Math.min(d,points[i].distanceToSquared(seed));if(d>distance){distance=d;best=i;}}seeds.push(points[best].clone());}
    for(let iteration=0;iteration<5;iteration++){
      const sums=seeds.map(()=>new Vector3()),weights=new Uint32Array(number);
      for(let i=0;i<count;i++){let nearest=0,distance=Infinity;for(let j=0;j<number;j++){const d=points[i].distanceToSquared(seeds[j]);if(d<distance){distance=d;nearest=j;}}assignment[i]=nearest;sums[nearest].add(points[i]);weights[nearest]++;}
      for(let j=0;j<number;j++)if(weights[j])seeds[j].copy(sums[j]).multiplyScalar(1/weights[j]);
    }
    for(let j=0;j<number;j++){
      const indices=[];let radius=.04;
      for(let i=0;i<count;i++)if(assignment[i]===j){indices.push(i);radius=Math.max(radius,points[i].distanceTo(seeds[j]));}
      if(!indices.length)continue;
      const mass=this.body.mass*indices.length/count;
      const body=this.world.createBody({position:seeds[j],radius:Math.max(.04,radius*.72),mass,drag:.22,
        windResponse:Math.min(.55,.055*radius*radius/mass),friction:.78});
      body.angularVelocity.copy(parent.angularVelocity);body.snow=parent.snow;body.temperature=parent.temperature;body.wetness=parent.wetness??0;
      body.velocity.copy(parent.velocity).add(this.scratch.subVectors(seeds[j],parent.position).crossVectors(parent.angularVelocity,this.scratch));
      const records=indices.map(i=>{
        const original=this.source[this.descriptor.start+i],axes=original.axes.map(a=>new Vector3(...a).applyQuaternion(parent.rotation));
        const splat={...original,center:points[i].toArray(),axes:axes.map(a=>a.toArray()),color:[...original.color]};
        return {index:this.descriptor.start+i,splat,center:points[i].sub(seeds[j]),axes,color:[...original.color],opacity:original.opacity};
      });
      this.chunks.push({body,records,lastPose:new Float64Array(7).fill(Infinity),lastSnow:-1,lastHeat:-1,dirty:true});
    }
    // Surface-sample chunk weights need not share the bounding-box centre.
    // Correct their mean velocity to conserve the parent's linear momentum.
    this.position.set(0,0,0);for(const c of this.chunks)this.position.addScaledVector(c.body.velocity,c.body.mass/parent.mass);
    this.position.subVectors(parent.velocity,this.position);for(const c of this.chunks)c.body.velocity.add(this.position);
    return true;
  }
  prepareBindings(){
    if(this.bound)return;this.bound=true;
    const records=[];
    for(let part=0;part<this.parts.length;part++)for(const i of this.parts[part].indices){
      const index=this.descriptor.start+i,original=this.source[index],center=new Vector3(...original.center).sub(this.center);
      const splat={...original,center:[...original.center],axes:original.axes.map(a=>[...a]),color:[...original.color]};
      records.push({index,splat,center,rootCenter:center.clone(),part,seam:seamWeight(center,this.parts,part),axes:original.axes.map(a=>new Vector3(...a)),color:[...original.color],opacity:original.opacity});
    }
    this.core={body:this.body,records,lastPose:new Float64Array(7).fill(Infinity),lastSnow:-1,lastHeat:-1,lastDamage:-1,dirty:true};
    this.chunks=[this.core];
  }
  detach(mask){
    mask&=this.damage.allMask();if(!mask)return 0;
    this.prepareBindings();const parent=this.body,newChunks=[],oldMass=parent.mass;
    for(let i=0;i<this.parts.length;i++)if(mask&(1<<i)){
      const part=this.parts[i],offset=part.center.clone().applyQuaternion(parent.rotation),position=offset.clone().add(parent.position);
      const records=this.core.records.filter(r=>r.part===i);
      for(const r of records)r.center.copy(r.rootCenter).sub(part.center);
      const body=this.world.createBody({position,radius:part.radius,mass:part.mass,drag:.22,friction:.78,windResponse:Math.min(.55,.055*part.radius**2/part.mass),ccd:true});
      body.rotation.copy(parent.rotation);body.previousRotation.copy(body.rotation);body.angularVelocity.copy(parent.angularVelocity);
      body.velocity.copy(parent.velocity).add(this.scratch.crossVectors(parent.angularVelocity,offset));body.snow=parent.snow;body.temperature=parent.temperature;body.wetness=parent.wetness??0;
      this.world.setCompound(body,partitionRock(records.map(r=>r.center),Math.min(3,Math.max(1,Math.floor(records.length/24)))));
      newChunks.push({body,part:i,records,lastPose:new Float64Array(7).fill(Infinity),lastSnow:-1,lastHeat:-1,lastDamage:-1,dirty:true});
    }
    this.core.records=this.core.records.filter(r=>!(mask&(1<<r.part)));this.core.dirty=true;this.core.lastDamage=-1;
    this.damage.markDetached(mask);const remaining=this.parts.filter((_,i)=>!(this.damage.detached&(1<<i)));
    if(remaining.length){
      parent.mass=remaining.reduce((mass,p)=>mass+p.mass,0);parent.inverseMass=parent.type==='dynamic'?1/parent.mass:0;
      this.world.setCompound(parent,remaining.map(p=>({...p,feature:this.parts.indexOf(p)})));
    }else{this.broken=true;this.world.setEnabled(parent,false);this.chunks=this.chunks.filter(c=>c!==this.core);if(this.descriptor.collider)this.descriptor.collider.destroyed=true;}
    this.chunks.push(...newChunks);
    // Preserve net linear momentum through ownership transfer, including spin.
    this.position.set(0,0,0);if(parent.enabled)this.position.addScaledVector(parent.velocity,parent.mass/oldMass);
    for(const c of newChunks)this.position.addScaledVector(c.body.velocity,c.body.mass/oldMass);
    this.position.subVectors(parent.velocity,this.position);
    if(parent.enabled&&parent.inverseMass)parent.velocity.add(this.position);
    for(const c of newChunks)c.body.velocity.add(this.position);
    return newChunks.length;
  }
  sync(alpha){
    let changed=false;
    for(const chunk of this.chunks){
      const b=chunk.body;
      // One interpolation and rotation matrix per physical chunk, not per mark.
      this.position.lerpVectors(b.previous,b.position,alpha);this.rotation.copy(b.previousRotation).slerp(b.rotation,alpha);
      const p=this.position,q=this.rotation;
      const pose=chunk.lastPose,same=pose[0]===p.x&&pose[1]===p.y&&pose[2]===p.z&&pose[3]===q.x&&pose[4]===q.y&&pose[5]===q.z&&pose[6]===q.w;
      const snow=b.surfaceSnow?0:Math.round(b.snow*100)/100,heat=Math.round(b.temperature*50)/50,wet=Math.round((b.wetness??0)*50)/50;
      const damageVersion=this.damage?.visualVersion??0;
      if(same&&chunk.lastSnow===snow&&chunk.lastHeat===heat&&chunk.lastDamage===damageVersion&&chunk.lastWet===wet)continue;
      const x=q.x,y=q.y,z=q.z,w=q.w;
      this.matrix.set(1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y));
      for(const r of chunk.records){
        this.scratch.copy(r.center).applyMatrix3(this.matrix).add(p).toArray(r.splat.center);
        for(let k=0;k<3;k++)this.scratch.copy(r.axes[k]).applyMatrix3(this.matrix).toArray(r.splat.axes[k]);
        const n=r.splat.axes[2],up=Math.max(0,n[1]/Math.hypot(...n)),coat=b.surfaceSnow?0:Math.min(.92,snow*up*2);
        const crack=this.damage?this.damage.damage[r.part]*r.seam*(this.damage.detached&(1<<r.part)?.25:.65):0;
        for(let k=0;k<3;k++){const base=r.color[k]*(1-Math.min(.55,heat*.08))*(1-crack)*(1-.32*wet);r.splat.color[k]=base*(1-coat)+SNOW_COLOR[k]*coat;}
      }
      chunk.dirty=true;changed=true;pose[0]=p.x;pose[1]=p.y;pose[2]=p.z;pose[3]=q.x;pose[4]=q.y;pose[5]=q.z;pose[6]=q.w;chunk.lastSnow=snow;chunk.lastHeat=heat;chunk.lastDamage=damageVersion;chunk.lastWet=wet;
    }
    return changed;
  }
  writePacked(data,centers,uploads,force=false){
    let changed=false;
    for(const chunk of this.chunks){
      if(!force&&!chunk.dirty)continue;
      for(const r of chunk.records)writePhysicsSplat(r.splat,data,centers,r.index);
      chunk.dirty=false;changed=true;
    }
    if(changed){uploads?.mark(this.descriptor.start*20,this.descriptor.count*20);this.written=true;}
    return changed;
  }
}
