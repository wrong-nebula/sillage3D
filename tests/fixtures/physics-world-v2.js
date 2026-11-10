import {Quaternion, Vector3} from 'three';

const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
};
const vector = (value, fallback = [0, 0, 0]) => {
  const v = value ?? fallback;
  const result = new Vector3(v.x ?? v[0], v.y ?? v[1], v.z ?? v[2]);
  for (const n of result.toArray()) finite(n, 'vector component');
  return result;
};
// Hash collisions are resolved by checking all three stored cell coordinates.
const hash = (x,y,z) => Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791);

/** CPU sphere-proxy solver. One body can drive thousands of anisotropic splats.
 * Fixed ticks, bounded motion substeps, spatial hashing and sleeping keep work
 * proportional to physical objects rather than the size of the paint field.
 * Motion substeps are a tunnelling mitigation, not exact continuous collision.
 */
export class SplatPhysicsWorld {
  constructor({height = () => -1e6, gravity = [0, -9.81, 0], fixedDt = 1 / 120,
    maxSteps = 12, maxMotionSteps = 16, iterations = 5, capacity = 256} = {}) {
    if (!(finite(fixedDt, 'fixedDt') > 0) || ![maxSteps, maxMotionSteps, iterations, capacity].every(n => Number.isInteger(n) && n > 0)) {
      throw new RangeError('Physics budgets must be positive');
    }
    this.height = height; this.gravity = vector(gravity); this.fixedDt = fixedDt;
    this.maxSteps = maxSteps; this.maxMotionSteps = maxMotionSteps; this.iterations = iterations; this.capacity = capacity;
    this.bodies = []; this.accumulator = 0; this.time = 0; this.alpha = 0;
    this.contacts = []; this.contactCount = 0; this.grid = new Map(); this.bucketPool = [];
    this.fixedGrid=new Map();this.fixedBuckets=[];this.fixed=[];this.moving=[];this.enabled=[];
    this.queryGrid=new Map();this.queryBuckets=[];this.queryCellSize=4;
    this.staticDirty=true;this.fixedCellSize=1;this.contactCache=new Map();this.epoch=0;
    this.impactBodies=[];
    this.delta = new Vector3(); this.relative = new Vector3(); this.tangent = new Vector3();
    this.impulse = new Vector3(); this.spin = new Vector3();
    this.stats = {ticks: 0, candidates: 0, contacts: 0, active: 0, sleeping: 0, motionSteps: 0, motionBudgetHits: 0, droppedTime: 0,staticRebuilds:0,warmContacts:0,terrainSamples:0};
  }

  createBody({position, velocity, angularVelocity, radius = .5, mass = 1,
    type = 'dynamic', restitution = .18, friction = .6, drag = .04,
    windResponse = 0, enabled = true, canSleep = true} = {}) {
    if (this.bodies.length >= this.capacity) throw new RangeError('Splat physics body budget exhausted');
    if (!['dynamic', 'fixed', 'kinematic'].includes(type) || !(finite(radius, 'radius') > 0)
      || !(finite(mass, 'mass') > 0) || ![restitution, friction, drag, windResponse].every(n => Number.isFinite(n) && n >= 0)
      || restitution > 1) throw new RangeError('Invalid body description');
    const p = vector(position), inverseMass = type === 'dynamic' ? 1 / mass : 0;
    const body = {id: this.bodies.length, type, position: p, previous: p.clone(), velocity: vector(velocity),
      angularVelocity: vector(angularVelocity), rotation: new Quaternion(), previousRotation: new Quaternion(),
      radius, mass, inverseMass, inverseInertia: 2.5 * inverseMass / (radius * radius),
      restitution, friction, drag, windResponse, enabled, canSleep, sleeping: false, idle: 0, supported: false,
      impact: 0, target: p.clone(),revision:0,baseFriction:friction,baseWindResponse:windResponse,snow:0,temperature:0};
    this.staticDirty=true;
    this.bodies.push(body); return body;
  }

  wake(body) { if(body.sleeping)this.staticDirty=true;body.sleeping = false; body.idle = 0; }
  setEnabled(body,value){if(body.enabled!==value){body.enabled=value;body.revision++;this.staticDirty=true;}}
  makeDynamic(body){
    if(body.type==='dynamic')return;
    body.type='dynamic';body.inverseMass=1/body.mass;body.inverseInertia=2.5*body.inverseMass/(body.radius*body.radius);
    body.revision++;this.staticDirty=true;this.wake(body);
  }
  applyImpulse(body, impulse) {
    if (!body.inverseMass || !body.enabled) return;
    const value = vector(impulse);
    body.velocity.addScaledVector(value, body.inverseMass); this.wake(body);
  }
  teleport(body, position) {
    body.position.copy(vector(position)); body.previous.copy(body.position); body.target.copy(body.position);body.revision++;this.staticDirty=true; this.wake(body);
  }
  setKinematicTarget(body, position) {
    if (body.type !== 'kinematic') throw new Error('Expected a kinematic body');
    body.target.copy(vector(position));
  }

  advance(dt, {beforeStep, afterStep, wind} = {}) {
    if (!(finite(dt, 'dt') >= 0)) throw new RangeError('dt must be nonnegative');
    const budget = this.fixedDt * this.maxSteps;
    // Detect external changes once per rendered frame, not 120 times/second.
    for(const b of this.bodies){
      const fixed=b.enabled&&(b.type==='fixed'||b.sleeping);
      if(b._fixed!==fixed||b._enabled!==b.enabled||(fixed&&(b._x!==b.position.x||b._y!==b.position.y||b._z!==b.position.z||b._radius!==b.radius)))this.staticDirty=true;
    }
    this.stats.droppedTime += Math.max(0, dt - budget);
    this.accumulator += Math.min(dt, budget);
    const tickCount = Math.min(this.maxSteps, Math.floor((this.accumulator + 1e-12) / this.fixedDt));
    if (tickCount) for (const b of this.bodies) if (b.enabled && b.type === 'kinematic') {
      b.velocity.subVectors(b.target, b.position).multiplyScalar(1 / (tickCount * this.fixedDt));
    }
    let steps = 0;
    while (this.accumulator + 1e-12 >= this.fixedDt && steps < this.maxSteps) {
      beforeStep?.(this.fixedDt, this.time);
      this.step(this.fixedDt, wind);
      this.time += this.fixedDt; afterStep?.(this.fixedDt, this.time);
      this.accumulator = Math.max(0, this.accumulator - this.fixedDt); steps++;
    }
    this.alpha = this.accumulator / this.fixedDt;
    this.stats.active=0;this.stats.sleeping=0;
    for(const b of this.bodies)if(b.enabled){if(b.sleeping)this.stats.sleeping++;else if(b.inverseMass)this.stats.active++;}
    return steps;
  }

  step(dt, wind) {
    this.refreshBodies();
    this.impactBodies.length=0;
    let motionSteps = 1;
    for (const b of this.moving) {
      b.previous.copy(b.position); b.previousRotation.copy(b.rotation); b.impact = 0; b.supported = false;
      if (b.type !== 'fixed' && !b.sleeping) motionSteps = Math.max(motionSteps,
        Math.ceil((b.velocity.length() + this.gravity.length() * dt) * dt / (b.radius * .4)));
    }
    if (motionSteps > this.maxMotionSteps) this.stats.motionBudgetHits++;
    motionSteps = Math.min(motionSteps, this.maxMotionSteps);
    this.stats.motionSteps = motionSteps; this.stats.candidates = 0; this.stats.contacts = 0;
    const h = dt / motionSteps;
    for (let sub = 0; sub < motionSteps; sub++) {
      for (const b of this.moving) {
        if (!b.enabled || b.type === 'fixed' || b.sleeping) continue;
        if (b.inverseMass) {
          this.delta.set(0,0,0);
          if (wind && b.windResponse) {
            wind.sample(b.position, this.time + sub * h, this.delta);
          }
          // Exact integration of v' = gravity + response*wind - rate*v.
          // expm1 avoids cancellation at the small rates used for stone drag.
          const rate=b.drag+b.windResponse, integral=rate>1e-9?-Math.expm1(-rate*h)/rate:h;
          const second=rate*h>1e-4?(h-integral)/rate:h*h*(.5-rate*h/6);
          this.delta.multiplyScalar(b.windResponse).add(this.gravity);
          b.position.addScaledVector(b.velocity,integral).addScaledVector(this.delta,second);
          b.velocity.multiplyScalar(Math.exp(-rate*h)).addScaledVector(this.delta,integral);
          b.angularVelocity.multiplyScalar(Math.exp(-b.drag * h));
        }else b.position.addScaledVector(b.velocity, h);
        const q = b.rotation, w = b.angularVelocity, x = q.x, y = q.y, z = q.z, a = q.w, half = h * .5;
        q.set(x + half * (w.x * a + w.y * z - w.z * y), y + half * (-w.x * z + w.y * a + w.z * x),
          z + half * (w.x * y - w.y * x + w.z * a), a - half * (w.x * x + w.y * y + w.z * z)).normalize();
      }
      this.detect();
      for (let iteration = 0; iteration < this.iterations; iteration++) {
        for (let i = 0; i < this.contactCount; i++) this.solve(this.contacts[i], iteration === 0);
      }
    }
    for (const b of this.moving) {
      if (!b.enabled || !b.inverseMass || b.sleeping) continue;
      if (b.canSleep && b.supported && b.velocity.lengthSq() < .0049 && b.angularVelocity.lengthSq() < .01) {
        b.idle += dt;
        if (b.idle > .75) { b.sleeping = true;this.staticDirty=true;b.previous.copy(b.position);b.previousRotation.copy(b.rotation); b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0); }
      } else b.idle = 0;
    }
    this.stats.ticks++;
    if(this.stats.ticks%120===0)for(const [key,c]of this.contactCache)if(c.epoch<this.epoch-2)this.contactCache.delete(key);
  }

  refreshBodies(){
    if(!this.staticDirty)return;
    this.enabled.length=0;this.moving.length=0;this.fixed.length=0;
    let radius=.25;
    for(const b of this.bodies){
      b._enabled=b.enabled;b._fixed=b.enabled&&(b.type==='fixed'||b.sleeping);
      b._x=b.position.x;b._y=b.position.y;b._z=b.position.z;b._radius=b.radius;
      if(!b.enabled)continue;this.enabled.push(b);
      if(b._fixed){this.fixed.push(b);radius=Math.max(radius,b.radius);}else this.moving.push(b);
    }
    this.fixedCellSize=radius*2;
    this.rebuildGrid(this.fixedGrid,this.fixedBuckets,this.fixed,this.fixedCellSize,true);
    this.queryCellSize=Math.max(4,this.fixedCellSize);this.rebuildGrid(this.queryGrid,this.queryBuckets,this.fixed,this.queryCellSize,'query');
    this.staticDirty=false;this.stats.staticRebuilds++;
  }

  rebuildGrid(grid,pool,bodies,size,fixed=false){
    for(const bucket of grid.values()){bucket.length=0;pool.push(bucket);}grid.clear();
    for(const b of bodies){
      if(!b.enabled)continue;
      const x=Math.floor(b.position.x/size),y=Math.floor(b.position.y/size),z=Math.floor(b.position.z/size),key=hash(x,y,z);
      if(fixed==='query'){b.qx=x;b.qy=y;b.qz=z;}else if(fixed){b.fx=x;b.fy=y;b.fz=z;}else{b.cellX=x;b.cellY=y;b.cellZ=z;}
      let bucket=grid.get(key);if(!bucket){bucket=pool.pop()??[];grid.set(key,bucket);}bucket.push(b);
    }
  }

  contact(a,b,nx,ny,nz,depth){
    const key=b?a.id*this.capacity+b.id+1:-a.id-1;
    let c=this.contactCache.get(key);
    const retain=c&&c.epoch===this.epoch-1&&c.ra===a.revision&&c.rb===(b?.revision??0)
      &&c.normal.x*nx+c.normal.y*ny+c.normal.z*nz>.98;
    if(!c){c={normal:new Vector3(),frictionImpulse:new Vector3(),normalImpulse:0};this.contactCache.set(key,c);}
    if(!retain){c.normalImpulse=0;c.frictionImpulse.set(0,0,0);}else this.stats.warmContacts++;
    c.a=a;c.b=b;c.depth=depth;c.normal.set(nx,ny,nz);c.epoch=this.epoch;c.ra=a.revision;c.rb=b?.revision??0;
    this.relative.copy(b?.velocity??this.delta.set(0,0,0)).sub(a.velocity);
    const speed=this.relative.dot(c.normal),inverse=a.inverseMass+(b?.inverseMass??0);
    c.bounce=speed<-.7?-Math.min(a.restitution,b?.restitution??a.restitution)*speed:0;
    if(inverse){const energy=.5*speed*speed/inverse;if(speed<0){a.impact=Math.max(a.impact,energy);if(b)b.impact=Math.max(b.impact,energy);if(energy>2){if(a.authored)this.impactBodies.push(a);if(b?.authored)this.impactBodies.push(b);}}}
    // Warm-start only coherent support contacts, never a new high-speed impact.
    if(retain&&speed>-.7){this.impulse.copy(c.normal).multiplyScalar(c.normalImpulse).add(c.frictionImpulse);this.applyContactImpulse(c,this.impulse);}
    else{c.normalImpulse=0;c.frictionImpulse.set(0,0,0);}
    this.contacts[this.contactCount++]=c;this.stats.contacts++;
    if(ny<-.4)a.supported=true;if(b&&ny>.4)b.supported=true;
  }

  detect(){
    this.refreshBodies();this.contactCount=0;this.epoch++;
    let radius=.05;for(const b of this.moving)if(b.enabled)radius=Math.max(radius,b.radius);
    this.cellSize=2*radius;
    this.rebuildGrid(this.grid,this.bucketPool,this.moving,this.cellSize);
    for(const a of this.moving){
      if(!a.enabled||a.sleeping)continue;
      const p=a.position;
      if(a.inverseMass){
        const height=this.height(p.x,p.z);this.stats.terrainSamples++;
        if(p.y-height<a.radius+1){
          // Reuse the local tangent plane over tiny motions. High airborne
          // bodies skip the four expensive normal samples altogether.
          if(a.gx===undefined||Math.abs(p.x-a.groundX)+Math.abs(p.z-a.groundZ)>.015){
            a.gx=(this.height(p.x+.05,p.z)-this.height(p.x-.05,p.z))/.1;
            a.gz=(this.height(p.x,p.z+.05)-this.height(p.x,p.z-.05))/.1;
            a.groundX=p.x;a.groundZ=p.z;this.stats.terrainSamples+=4;
          }
          const length=Math.hypot(a.gx,1,a.gz),depth=a.radius-(p.y-height)/length;
          if(depth>0)this.contact(a,null,a.gx/length,-1/length,a.gz/length,depth);
        }
      }
      this.queryContacts(a,this.grid,this.cellSize,false);
      this.queryContacts(a,this.fixedGrid,this.fixedCellSize,true);
    }
  }

  queryContacts(a,grid,size,fixed){
    const x=Math.floor(a.position.x/size),y=Math.floor(a.position.y/size),z=Math.floor(a.position.z/size);
    const range=Math.ceil(a.radius/size+.5);
    for(let dz=-range;dz<=range;dz++)for(let dy=-range;dy<=range;dy++)for(let dx=-range;dx<=range;dx++){
      const cx=x+dx,cy=y+dy,cz=z+dz,bucket=grid.get(hash(cx,cy,cz));if(!bucket)continue;
      for(const b of bucket){
        if(!b.enabled||b===a||(!fixed&&b.id<a.id)||(!a.inverseMass&&!b.inverseMass))continue;
        if((fixed?b.fx:b.cellX)!==cx||(fixed?b.fy:b.cellY)!==cy||(fixed?b.fz:b.cellZ)!==cz)continue;
        this.stats.candidates++;
        const px=b.position.x-a.position.x,py=b.position.y-a.position.y,pz=b.position.z-a.position.z,reach=a.radius+b.radius;
        const d2=px*px+py*py+pz*pz;if(d2>=reach*reach)continue;
        const distance=Math.sqrt(d2),inv=distance>1e-9?1/distance:0;
        this.contact(a,b,inv?px*inv:1,py*inv,pz*inv,reach-distance);
      }
    }
  }

  /** Exact cell verification makes numeric hash aliases harmless. */
  projectParticle(point,radius,out){
    out.copy(point);this.particleHit=null;
    this.projectGrid(out,radius,this.grid,this.cellSize,false);
    this.projectGrid(out,radius,this.fixedGrid,this.fixedCellSize,true);
    return out;
  }
  querySphere(point,radius,out,limit=96){
    this.refreshBodies();let movingRadius=.05;for(const b of this.moving)if(b.enabled)movingRadius=Math.max(movingRadius,b.radius);
    this.cellSize=movingRadius*2;this.rebuildGrid(this.grid,this.bucketPool,this.moving,this.cellSize);
    out.length=0;let candidates=0;
    const query=(grid,size,fixed)=>{
      const reach=radius+size*.5;
      for(let z=Math.floor((point.z-reach)/size);z<=Math.floor((point.z+reach)/size);z++)for(let y=Math.floor((point.y-reach)/size);y<=Math.floor((point.y+reach)/size);y++)for(let x=Math.floor((point.x-reach)/size);x<=Math.floor((point.x+reach)/size);x++){
        const bucket=grid.get(hash(x,y,z));if(!bucket)continue;
        for(const b of bucket){
          if(!b.enabled||(fixed==='query'?b.qx:fixed?b.fx:b.cellX)!==x||(fixed==='query'?b.qy:fixed?b.fy:b.cellY)!==y||(fixed==='query'?b.qz:fixed?b.fz:b.cellZ)!==z)continue;
          candidates++;const distance=b.position.distanceToSquared(point);if(distance>(radius+b.radius)**2)continue;
          if(out.length<limit)out.push(b);else{let farthest=0,far=out[0].position.distanceToSquared(point);for(let i=1;i<out.length;i++){const d=out[i].position.distanceToSquared(point);if(d>far){far=d;farthest=i;}}if(distance<far)out[farthest]=b;}
        }
      }
    };
    // Sparse small fragments must not turn a large-radius blast into millions
    // of empty voxel lookups. A bounded active list is cheaper in that case.
    if((2*radius/this.cellSize+3)**3>this.moving.length*4){
      for(const b of this.moving){if(!b.enabled)continue;candidates++;if(b.position.distanceToSquared(point)<=(radius+b.radius)**2)out.push(b);}
      if(out.length>limit){out.sort((a,b)=>a.position.distanceToSquared(point)-b.position.distanceToSquared(point));out.length=limit;}
    }else query(this.grid,this.cellSize,false);
    query(this.queryGrid,this.queryCellSize,'query');this.lastQueryCandidates=candidates;return out;
  }
  projectGrid(out,radius,grid,size,fixed){
    if(!size)return;
    const x=Math.floor(out.x/size),y=Math.floor(out.y/size),z=Math.floor(out.z/size),range=Math.ceil(radius/size+.5);
    for(let dz=-range;dz<=range;dz++)for(let dy=-range;dy<=range;dy++)for(let dx=-range;dx<=range;dx++){
      const cx=x+dx,cy=y+dy,cz=z+dz,bucket=grid.get(hash(cx,cy,cz));if(!bucket)continue;
      for(const b of bucket){
        if(!b.enabled||(fixed?b.fx:b.cellX)!==cx||(fixed?b.fy:b.cellY)!==cy||(fixed?b.fz:b.cellZ)!==cz)continue;
        const px=out.x-b.position.x,py=out.y-b.position.y,pz=out.z-b.position.z,reach=radius+b.radius,d2=px*px+py*py+pz*pz;
        if(d2>=reach*reach)continue;
        const distance=Math.sqrt(d2),scale=distance>1e-9?(reach+.0001)/distance:0;
        out.set(b.position.x+px*scale,b.position.y+(scale?py*scale:reach+.0001),b.position.z+pz*scale);this.particleHit=b;
      }
    }
  }

  applyContactImpulse(c,impulse){
    const {a,b,normal:n}=c;
    a.velocity.addScaledVector(impulse,-a.inverseMass);if(b)b.velocity.addScaledVector(impulse,b.inverseMass);
    this.spin.crossVectors(n,impulse);
    a.angularVelocity.addScaledVector(this.spin,-a.radius*a.inverseInertia);
    if(b)b.angularVelocity.addScaledVector(this.spin,-b.radius*b.inverseInertia);
  }

  solve(c, correct) {
    const {a, b, normal: n} = c, inverseMass = a.inverseMass + (b?.inverseMass ?? 0);
    if (!inverseMass) return;
    if (correct) {
      const correction = Math.max(0, c.depth - .0005) * .85 / inverseMass;
      a.position.addScaledVector(n, -correction * a.inverseMass);
      if (b) b.position.addScaledVector(n, correction * b.inverseMass);
    }
    this.relative.copy(b?.velocity??this.delta.set(0,0,0)).sub(a.velocity);
    this.spin.crossVectors(a.angularVelocity,n);this.relative.addScaledVector(this.spin,-a.radius);
    if(b){this.spin.crossVectors(b.angularVelocity,n);this.relative.addScaledVector(this.spin,-b.radius);}
    const speed=this.relative.dot(n),old=c.normalImpulse;
    c.normalImpulse=Math.max(0,old+(c.bounce-speed)/inverseMass);
    this.impulse.copy(n).multiplyScalar(c.normalImpulse-old);this.applyContactImpulse(c,this.impulse);
    // Clamp accumulated friction in the tangent plane, not each iteration's
    // increment. This still solves friction when normal velocity is zero.
    this.relative.copy(b?.velocity??this.delta.set(0,0,0)).sub(a.velocity);
    this.spin.crossVectors(a.angularVelocity,n);this.relative.addScaledVector(this.spin,-a.radius);
    if(b){this.spin.crossVectors(b.angularVelocity,n);this.relative.addScaledVector(this.spin,-b.radius);}
    const normalSpeed=this.relative.dot(n);
    this.tangent.copy(this.relative).addScaledVector(n,-normalSpeed);
    const effective=inverseMass+a.radius*a.radius*a.inverseInertia+(b?b.radius*b.radius*b.inverseInertia:0);
    this.tangent.multiplyScalar(-1/effective).add(c.frictionImpulse);
    // Remove drift of the previous tangent basis as the support normal turns.
    this.tangent.addScaledVector(n,-this.tangent.dot(n));
    this.tangent.clampLength(0,c.normalImpulse*Math.sqrt(a.friction*(b?.friction??a.friction)));
    this.impulse.copy(this.tangent).sub(c.frictionImpulse);c.frictionImpulse.copy(this.tangent);this.applyContactImpulse(c,this.impulse);
    if(speed<-.15){if(a.sleeping)this.wake(a);if(b?.sleeping)this.wake(b);}
  }

  snapshot() { return {...this.stats, bodies: this.bodies.filter(b => b.enabled).length, time: this.time, alpha: this.alpha}; }
  dispose() { this.bodies.length = 0; this.contacts.length = 0;this.impactBodies.length=0;this.particleHit=null; this.grid.clear();this.fixedGrid.clear();this.queryGrid.clear();this.queryBuckets.length=0;this.contactCache.clear();this.fixed.length=0;this.moving.length=0;this.enabled.length=0;this.fixedBuckets.length=0; this.bucketPool.length = 0; }
}
