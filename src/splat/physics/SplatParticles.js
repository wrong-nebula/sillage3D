import {Vector3} from 'three';
import {EmberTrails} from './EmberTrails.js';

export const PARTICLE = Object.freeze({SNOW: 0, DUST: 1, FLAME: 2, SMOKE: 3, EMBER: 4,WATER:5});
const COLORS = [[.87, .94, 1], [.54, .49, .42], [1, .46, .07], [.24, .255, .27], [1, .72, .2],[.48,.70,.77]];

/** Bounded structure-of-arrays pool. Particles are render splats, not rigid
 * bodies; only collidable kinds query coarse physical proxies, one way.
 */
export class SplatParticles {
  constructor({capacity = 768, seed = 7142} = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('Invalid particle budget');
    this.capacity = capacity; this.seed = seed; this.next = 0; this.emitted = 0; this.recycled = 0;
    this.time=0;this.bounces=0;this.bounceCount=new Uint16Array(capacity);this.trails=new EmberTrails(capacity);this.snowPoint=new Vector3();
    this.position = new Float32Array(capacity * 3); this.velocity = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity); this.life = new Float32Array(capacity);
    this.snowVolume=new Float64Array(capacity);
    this.size = new Float32Array(capacity); this.kind = new Uint8Array(capacity); this.alive = new Uint8Array(capacity);
    this.windVelocity = new Vector3(); this.point = new Vector3(); this.projected = new Vector3();
    this.normal=new Vector3();this.contactVelocity=new Vector3();this.relative=new Vector3();this.contactOffset=new Vector3();
    this.splats = Array.from({length: capacity}, (_, i) => ({center: [0, 0, 0],
      axes: [[.02, 0, 0], [0, .02, 0], [0, 0, .02]], color: [...COLORS[0]],
      opacity: 0, softParticle: true, seed: (i * .61803398875) % 1, material: 'physics-particle'}));
    this.splats.push(...this.trails.splats);
  }
  random() { this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0; return this.seed / 4294967296; }
  emit(kind, point, velocity, {life = 2, size = .04,snowVolume=0} = {}) {
    if (!COLORS[kind] || !(life > 0) || !(size > 0) || ![point.x, point.y, point.z, velocity.x, velocity.y, velocity.z, life, size].every(Number.isFinite)) {
      throw new RangeError('Invalid particle description');
    }
    if(!Number.isFinite(snowVolume)||snowVolume<0||snowVolume&&kind!==PARTICLE.SNOW)throw new RangeError('Invalid snow volume');
    const i = this.next++ % this.capacity, k = i * 3;
    const wasAlive=this.alive[i];
    if(this.snowVolume[i]>0)this.retireSnow(i,'recycled');
    this.trails.detach(i);this.bounceCount[i]=0;
    if (wasAlive) this.recycled++;
    this.position[k] = point.x; this.position[k + 1] = point.y; this.position[k + 2] = point.z;
    this.velocity[k] = velocity.x; this.velocity[k + 1] = velocity.y; this.velocity[k + 2] = velocity.z;
    this.age[i] = 0; this.life[i] = life; this.size[i] = size; this.kind[i] = kind; this.alive[i] = 1; this.emitted++;
    this.snowVolume[i]=snowVolume;
    if(kind===PARTICLE.EMBER)this.trails.attach(i,point,this.time,size);
    return i;
  }
  retireSnow(i,reason='ground',point=null){const volume=this.snowVolume[i];this.snowVolume[i]=0;this.alive[i]=0;if(volume>0)this.onSnowSettle?.(point??this.snowPoint.fromArray(this.position,i*3),volume,reason);}
  update(dt, world, wind, fires = []) {
    this.time+=dt;
    const snowResponse=-Math.expm1(-3.5*dt),smokeResponse=-Math.expm1(-1.2*dt),otherResponse=-Math.expm1(-1.8*dt),groundDrag=Math.exp(-14*dt);
    for (let i = 0; i < this.capacity; i++) {
      if (!this.alive[i]) continue;
      const k = i * 3, kind = this.kind[i]; this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {if(this.snowVolume[i]>0)this.retireSnow(i,'expired');else this.alive[i] = 0; continue; }
      this.point.fromArray(this.position, k); wind.sample(this.point, world.time, this.windVelocity);
      const snow = kind === PARTICLE.SNOW, flame = kind === PARTICLE.FLAME, smoke = kind === PARTICLE.SMOKE,ember=kind===PARTICLE.EMBER;
      const clump=this.snowVolume[i]>0,response = clump?otherResponse*.35:snow?snowResponse:smoke?smokeResponse:otherResponse;
      this.velocity[k] += (this.windVelocity.x - this.velocity[k]) * response;
      this.velocity[k + 2] += (this.windVelocity.z - this.velocity[k + 2]) * response;
      this.velocity[k + 1] += (clump?-9.81:flame ? 5.5 : smoke ? 1.4 : snow ? -1.4 :kind===PARTICLE.WATER?-9.81: -5.5) * dt;
      if (snow&&!clump) this.velocity[k + 1] = Math.max(-1.7, this.velocity[k + 1]);
      if(ember){this.advanceEmber(i,dt,world);this.point.toArray(this.position,k);continue;}
      this.point.x += this.velocity[k] * dt; this.point.y += this.velocity[k + 1] * dt; this.point.z += this.velocity[k + 2] * dt;
      if (!flame && !smoke) {
        // Small particles are killed/settled at surfaces instead of adding
        // thousands of tiny constraints to the rigid-body solver.
        const ground = world.height(this.point.x, this.point.z) + this.size[i];
        if (this.point.y <= ground) {
          if(clump){this.retireSnow(i,'ground',this.point);continue;}
          this.point.y = ground; this.velocity[k + 1] = 0;
          this.velocity[k] *= groundDrag; this.velocity[k + 2] *= groundDrag;
          this.age[i] += dt * (snow ? 2 : 5);
        }
        world.projectParticle(this.point, this.size[i], this.projected);
        if (!this.projected.equals(this.point)) {
          if(snow&&!clump&&world.particleHit?.inverseMass&&!world.particleHit.surfaceSnow){world.particleHit.snow=Math.min(1,world.particleHit.snow+.008);this.age[i]+=dt*5;}
          if(kind===PARTICLE.WATER&&world.particleHit)world.particleHit.wetness=Math.min(1,(world.particleHit.wetness??0)+.06);
          this.point.copy(this.projected); this.velocity[k] *= .35; this.velocity[k + 1] = Math.max(0, this.velocity[k + 1]) * .2; this.velocity[k + 2] *= .35;
        }
      }
      if (snow) for (const fire of fires) {
        if (fire.active && this.point.distanceToSquared(fire.position) < 3.2){
          if(clump){const melt=this.snowVolume[i]*(-Math.expm1(-3*dt*fire.intensity));this.snowVolume[i]-=melt;this.onSnowMelt?.(melt);}else this.age[i] += dt * 12 * fire.intensity;
        }
      }
      this.point.toArray(this.position, k);
    }
  }
  advanceEmber(i,dt,world){
    const k=i*3,radius=this.size[i],steps=Math.min(4,Math.max(1,Math.ceil(Math.hypot(this.velocity[k],this.velocity[k+1],this.velocity[k+2])*dt/Math.max(.015,radius*.75)))),h=dt/steps;
    for(let step=0;step<steps;step++){
      this.point.x+=this.velocity[k]*h;this.point.y+=this.velocity[k+1]*h;this.point.z+=this.velocity[k+2]*h;
      const height=world.height(this.point.x,this.point.z),time=this.time-dt+(step+1)*h;
      if(this.point.y<height+radius*2){
        const gx=(world.height(this.point.x+.04,this.point.z)-world.height(this.point.x-.04,this.point.z))/.08;
        const gz=(world.height(this.point.x,this.point.z+.04)-world.height(this.point.x,this.point.z-.04))/.08,length=Math.hypot(gx,1,gz);
        const depth=radius-(this.point.y-height)/length;
        if(depth>0){this.normal.set(-gx,1,-gz).multiplyScalar(1/length);this.point.addScaledVector(this.normal,depth+.0001);this.bounce(i,this.normal,null,h);this.trails.record(i,this.point,time,true);}
      }
      world.projectParticle(this.point,radius,this.projected);
      if(!this.projected.equals(this.point)){
        const body=world.particleHit;
        if(world.particleNormal)this.normal.copy(world.particleNormal);else this.normal.subVectors(this.projected,this.point).normalize();
        this.point.copy(this.projected);this.bounce(i,this.normal,body,h);this.trails.record(i,this.point,time,true);
      }
      this.trails.record(i,this.point,time);
    }
  }
  bounce(i,normal,body,dt){
    const k=i*3;this.contactVelocity.set(0,0,0);
    if(body){this.contactOffset.subVectors(this.point,body.position);this.contactVelocity.crossVectors(body.angularVelocity,this.contactOffset).add(body.velocity);}
    this.relative.fromArray(this.velocity,k).sub(this.contactVelocity);
    const inward=this.relative.dot(normal);if(inward>=0)return;
    const restitution=inward<-.25?.58:0;
    this.relative.addScaledVector(normal,-(1+restitution)*inward);
    const outward=this.relative.dot(normal);this.relative.multiplyScalar(.80).addScaledVector(normal,outward*.20).add(this.contactVelocity).clampLength(0,22).toArray(this.velocity,k);
    if(restitution){this.bounces++;this.bounceCount[i]++;}else this.age[i]+=dt*1.1;
  }
  blast(point,radius,pressureImpulse){
    let affected=0;const radius2=radius*radius;
    for(let i=0;i<this.capacity;i++){
      const kind=this.kind[i];if(!this.alive[i]||kind!==PARTICLE.FLAME&&kind!==PARTICLE.SMOKE&&kind!==PARTICLE.EMBER)continue;
      const k=i*3,dx=this.position[k]-point.x,dy=this.position[k+1]-point.y,dz=this.position[k+2]-point.z,d2=dx*dx+dy*dy+dz*dz;
      if(d2>=radius2)continue;
      const distance=Math.sqrt(d2),kick=Math.min(18,pressureImpulse*.014)*(1-distance/radius)**2,inv=distance>1e-7?1/distance:0;
      if(kick<=0)continue;
      this.velocity[k]+=dx*inv*kick;this.velocity[k+1]+=(inv?dy*inv:1)*kick;this.velocity[k+2]+=dz*inv*kick;
      this.relative.fromArray(this.velocity,k).clampLength(0,24).toArray(this.velocity,k);affected++;
    }return affected;
  }
  sync() {
    for (let i = 0; i < this.capacity; i++) {
      const s = this.splats[i];
      if (!this.alive[i]) { s.opacity = 0; continue; }
      const kind = this.kind[i], t = Math.min(1, this.age[i] / this.life[i]), base = this.size[i];
      const size = base * (kind === PARTICLE.SMOKE ? 1 + t * 4 : kind === PARTICLE.FLAME ? 1 - .65 * t : 1 + t * .3);
      const color = kind===PARTICLE.DUST&&this.dustColor?this.dustColor:COLORS[kind];
      for (let axis = 0; axis < 3; axis++) {
        s.center[axis] = this.position[i * 3 + axis];
        s.axes[axis][axis] = size * (kind === PARTICLE.FLAME && axis === 1 ? 1.7 : 1);
        s.color[axis] = color[axis];
      }
      if (kind === PARTICLE.FLAME) { s.color[1] = .72 - .5 * t; s.color[2] = .24 * (1 - t); }
      s.opacity = (kind === PARTICLE.SMOKE ? .22 : .8) * Math.min(1, t * 15) * (1 - t) ** .7;
    }
    this.trails.sync(this.time);
  }
  writePacked(data, centers, start) {
    for (let i = 0; i < this.splats.length; i++) writePhysicsSplat(this.splats[i], data, centers, start + i);
  }
  snapshot() {
    const counts = [0, 0, 0, 0, 0,0];
    for (let i = 0; i < this.capacity; i++) if (this.alive[i]) counts[this.kind[i]]++;
    let snowClumps=0,snowVolume=0;for(let i=0;i<this.capacity;i++)if(this.snowVolume[i]>0){snowClumps++;snowVolume+=this.snowVolume[i];}
    return {capacity: this.capacity, active: counts.reduce((a, b) => a + b, 0), emitted: this.emitted,snowClumps,snowVolume,
      recycled: this.recycled, snow: counts[0], dust: counts[1], flame: counts[2], smoke: counts[3], embers: counts[4],water:counts[5],bounces:this.bounces,trailCapacity:this.trails.capacity,trailSegments:this.trails.visibleSegments};
  }
}

/** Preserve auxiliary lighting channels and seed/material tags in the existing
 * five-texel renderer layout. Source objects and depth-sort centers agree.
 */
export function writePhysicsSplat(splat, data, centers, index) {
  const offset = index * 20;
  data.set(splat.center, offset); data[offset + 3] = splat.opacity;
  for (let axis = 0; axis < 3; axis++) data.set(splat.axes[axis], offset + 4 + axis * 4);
  data.set(splat.color, offset + 16); centers.set(splat.center, index * 3);
}
