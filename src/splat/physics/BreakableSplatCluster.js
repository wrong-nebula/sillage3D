import {Matrix3, Quaternion, Vector3} from 'three';
import {writePhysicsSplat} from './SplatParticles.js';
import {RockDamage,seamWeight} from './RockDamage.js';

const OFFSETS = [[.42, 0, 0], [-.42, 0, 0], [0, .42, 0], [0, -.42, 0], [0, 0, .42], [0, 0, -.42]];
const SNOW_COLOR=[.86,.93,1];

/** Prefractured chunks retain their original marks. Fracture changes their
 * rigid ownership, leaving no duplicate intact object or new GPU allocation.
 */
export class BreakableSplatCluster {
  constructor(world, {samplesPerChunk = 72, threshold = 18, seed = 0,advanced=false,desert=false} = {}) {
    this.world = world; this.threshold = threshold; this.active = false; this.broken = false; this.heat = 0;
    this.body = world.createBody({radius: .81, mass: 12, enabled: false, friction: .75});
    this.chunks = OFFSETS.map(offset => ({offset: new Vector3(...offset),
      body: world.createBody({radius: .37, mass: 2, enabled: false, friction: .78, drag: .32, windResponse: .025})}));
    this.body.cluster=this;for(const chunk of this.chunks)chunk.body.cluster=this;
    if(advanced){this.parts=OFFSETS.map((offset,i)=>({center:new Vector3(...offset),radius:.37,mass:2,feature:i}));this.damage=new RockDamage(this,this.parts);this.body.ccd=true;for(const c of this.chunks)c.body.ccd=true;world.setCompound(this.body,this.parts);}
    this.splats = []; this.local = [];
    this.matrix=new Matrix3();this.position = new Vector3(); this.rotation = new Quaternion(); this.scratch = new Vector3();
    for (const [chunk, {offset}] of this.chunks.entries()) for (let i = 0; i < samplesPerChunk; i++) {
      const y = 1 - 2 * (i + .5) / samplesPerChunk, angle = i * 2.3999632297 + seed;
      const ring = Math.sqrt(1 - y * y), n = new Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
      const center = n.clone().multiplyScalar(.35 + .02 * Math.sin(i * 2.7 + seed));
      const u = new Vector3().crossVectors(n, Math.abs(y) < .9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize();
      const v = new Vector3().crossVectors(n, u);
      const size = .085 * Math.sqrt(72 / samplesPerChunk), tone = .65 + .25 * Math.max(0, n.dot(new Vector3(-.57, .74, .44)));
      const axes = [u.multiplyScalar(size * 1.1), v.multiplyScalar(size), n.multiplyScalar(.025)];
      const pigment=desert?[.76*tone,.44*tone,.26*tone]:[.55*tone,.49*tone,.43*tone];
      this.local.push({chunk, center, axes, offset,seam:advanced?seamWeight(center.clone().add(offset),this.parts,chunk):0,color: pigment});
      this.splats.push({center: [0, 0, 0], axes: axes.map(a => a.toArray()),
        color: [...pigment], opacity: 0, seed: ((i + chunk * samplesPerChunk) * .61803) % 1, material: 'stone'});
    }
  }
  launch(position, velocity = new Vector3()) {
    this.active = true; this.broken = false; this.heat = 0;this.body.wetness=0;this.body.submersion=0;this.body.waterEntered=false;this.body.waterX=undefined;this.body.waterZ=undefined;
    if(this.damage){this.damage.reset();this.body.mass=12;this.body.inverseMass=1/12;this.world.setCompound(this.body,this.parts);}
    this.body.enabled = true; this.body.rotation.identity(); this.body.previousRotation.identity();
    this.body.angularVelocity.set(.5, .2, -.4); this.body.velocity.copy(velocity); this.world.teleport(this.body, position);
    for (const chunk of this.chunks) { chunk.body.enabled = false; chunk.body.sleeping = false; }
  }
  fracture() {
    if (!this.active || this.broken) return false;
    if(this.damage)return this.detach(this.damage.allMask())>0;
    this.broken = true; this.body.enabled = false;
    for (const chunk of this.chunks) {
      const b = chunk.body, offset = this.scratch.copy(chunk.offset).applyQuaternion(this.body.rotation);
      b.enabled = true; b.rotation.copy(this.body.rotation); b.previousRotation.copy(b.rotation);
      b.angularVelocity.copy(this.body.angularVelocity);b.wetness=this.body.wetness??0;
      b.velocity.copy(this.body.velocity).add(this.position.crossVectors(this.body.angularVelocity, offset));
      this.world.teleport(b, this.position.copy(this.body.position).add(offset));
    }
    return true;
  }
  detach(mask){
    mask&=this.damage.allMask();if(!mask)return 0;
    let count=0;const oldMass=this.body.mass;
    for(let i=0;i<this.chunks.length;i++)if(mask&(1<<i)){
      const chunk=this.chunks[i],b=chunk.body,offset=this.scratch.copy(chunk.offset).applyQuaternion(this.body.rotation);
      b.enabled=true;b.rotation.copy(this.body.rotation);b.previousRotation.copy(b.rotation);b.angularVelocity.copy(this.body.angularVelocity);b.wetness=this.body.wetness??0;
      b.velocity.copy(this.body.velocity).add(this.position.crossVectors(this.body.angularVelocity,offset));b.snow=this.body.snow;b.temperature=this.body.temperature;b.wetness=this.body.wetness??0;
      this.world.teleport(b,this.position.copy(this.body.position).add(offset));count++;
    }
    this.damage.markDetached(mask);const remaining=this.parts.filter((_,i)=>!(this.damage.detached&(1<<i)));
    if(remaining.length){this.body.mass=remaining.length*2;this.body.inverseMass=1/this.body.mass;this.world.setCompound(this.body,remaining);}
    else{this.broken=true;this.world.setEnabled(this.body,false);}
    this.position.set(0,0,0);if(this.body.enabled)this.position.addScaledVector(this.body.velocity,this.body.mass/oldMass);
    for(let i=0;i<this.chunks.length;i++)if(mask&(1<<i))this.position.addScaledVector(this.chunks[i].body.velocity,this.chunks[i].body.mass/oldMass);
    this.position.subVectors(this.body.velocity,this.position);
    if(this.body.enabled)this.body.velocity.add(this.position);
    for(let i=0;i<this.chunks.length;i++)if(mask&(1<<i))this.chunks[i].body.velocity.add(this.position);
    return count;
  }
  sync(alpha) {
    if (!this.active) return;
    for(let chunk=0;chunk<this.chunks.length;chunk++){
      const detached=this.damage?!!(this.damage.detached&(1<<chunk)):this.broken;
      const body=detached?this.chunks[chunk].body:this.body;
      this.rotation.copy(body.previousRotation).slerp(body.rotation,alpha);
      this.position.lerpVectors(body.previous,body.position,alpha);
      const {x,y,z,w}=this.rotation;
      this.matrix.set(1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w),2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w),2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y));
      const from=chunk*this.splats.length/6,to=(chunk+1)*this.splats.length/6;
      for(let i=from;i<to;i++){
        const local=this.local[i],splat=this.splats[i];
        this.scratch.copy(local.center);if(!detached)this.scratch.add(local.offset);
        this.scratch.applyMatrix3(this.matrix).add(this.position).toArray(splat.center);
        for(let axis=0;axis<3;axis++)this.scratch.copy(local.axes[axis]).applyMatrix3(this.matrix).toArray(splat.axes[axis]);
        const n=splat.axes[2],coat=body.surfaceSnow?0:Math.min(.92,body.snow*Math.max(0,n[1]/Math.hypot(...n))*2),heat=Math.max(this.heat,body.temperature);
        const crack=this.damage?this.damage.damage[chunk]*local.seam*(detached?.25:.65):0;
        for(let c=0;c<3;c++){const base=local.color[c]*(1-Math.min(.65,heat*.12))*(1-crack)*(1-.32*(body.wetness??0));splat.color[c]=base*(1-coat)+SNOW_COLOR[c]*coat;}
        splat.opacity=.96;
      }
    }
  }
  writePacked(data, centers, start) {
    if(!this.active)return;
    for (let i = 0; i < this.splats.length; i++) writePhysicsSplat(this.splats[i], data, centers, start + i);
  }
}
