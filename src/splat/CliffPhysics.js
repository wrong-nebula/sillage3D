import {Quaternion,Vector3} from 'three';
import {SplatPhysicsWorld} from './physics/SplatPhysicsWorld.js';
import {CliffWindField} from './physics/CliffWindField.js';
import {PARTICLE, SplatParticles} from './physics/SplatParticles.js';
import {BreakableSplatCluster} from './physics/BreakableSplatCluster.js';
import {AuthoredRock} from './physics/AuthoredRock.js';
import {RockGrab} from './physics/RockGrab.js';
import {ExplosionSolver} from './physics/ExplosionSolver.js';
import {ObjectMotionBlur} from './physics/ObjectMotionBlur.js';
import {FlexibleLab} from './physics/FlexibleLab.js';
import {SandTraces} from './physics/SandTraces.js';
import {WaterLab} from './physics/WaterLab.js';
import {GroundMaterials} from './physics/GroundMaterials.js';
import {SurfaceSnow} from './physics/SurfaceSnow.js';

export const CLIFF_PHYSICS_KEYS = new Set(['KeyB', 'KeyX', 'KeyH', 'KeyG', 'KeyN','KeyE','KeyR','KeyV','KeyP','KeyU','KeyL']);

/** Cliff integration: a bounded physical foreground alongside the immutable
 * landscape. The existing shader continues to animate distant vegetation/snow.
 */
export class CliffPhysics {
  constructor(height, rocks = [], {exposure, particleCapacity = 768, clusterCapacity = 8,environmentSplats=[],authoredRocks=[],activeDebrisBudget=192,motionBlur=false,advancedRocks=false,flexibleLab=false,desert=false,water=null,accumulation=false} = {}) {
    this.materials=accumulation?new GroundMaterials(height):null;
    this.height = this.materials?this.materials.height.bind(this.materials):height; this.snow = 0; this.time = 0; this.nextCluster = 0; this.fractures = 0;
    this.wind = new CliffWindField({exposure});
    this.world = new SplatPhysicsWorld({height: (x, z) => this.height(x, z) + (this.materials?0:this.snow * .075), capacity: rocks.length + authoredRocks.length*7+clusterCapacity * 7 + 1+(flexibleLab?4:0)+(water?1:0)});
    if(this.materials)this.world.groundMaterial=this.materials.contact.bind(this.materials);
    this.advancedRocks=advancedRocks;
    this.authored=authoredRocks.map(d=>new AuthoredRock(this.world,d,environmentSplats,{advanced:advancedRocks}));this.brokenAuthored=[];this.movingAuthored=[];
    this.movingIndices=new Uint32Array(0);this.nativeVersion=0;this.nativeFractures=0;this.activeDebrisBudget=activeDebrisBudget;
    // The cliff already supplies ellipses for character navigation. Inscribed
    // sphere proxies add cheap boulder contacts for debris and particles.
    for (const rock of authoredRocks.length?[]:rocks) {
      const bottom = height(rock.x, rock.z), halfHeight = Math.max(.15, (rock.top - bottom) / 2);
      this.world.createBody({type: 'fixed', position: [rock.x, bottom + halfHeight, rock.z],
        radius: Math.max(.15, Math.min(rock.radiusX, rock.radiusZ, halfHeight))});
    }
    this.player = this.world.createBody({type: 'kinematic', radius: .48, enabled: false});
    if(flexibleLab){this.player.isCharacter=true;this.world.setCompound(this.player,[0,.7,1.4].map(y=>({center:new Vector3(0,y,0),radius:.43})));}
    this.clusters = Array.from({length: clusterCapacity}, (_, seed) => new BreakableSplatCluster(this.world, {seed,advanced:advancedRocks,desert}));
    this.debris=this.clusters.flatMap(c=>[c.body,...c.chunks.map(k=>k.body)]);
    this.rockGrid=new Map();this.nearRocks=[];
    for(const rock of this.authored){const x=Math.floor(rock.center.x/8),z=Math.floor(rock.center.z/8),key=x*65536+z;rock.binX=x;rock.binZ=z;let bin=this.rockGrid.get(key);if(!bin){bin=[];this.rockGrid.set(key,bin);}bin.push(rock);}
    this.particles = new SplatParticles({capacity: particleCapacity});
    if(desert)this.particles.dustColor=[.73,.56,.35];
    this.explosions=new ExplosionSolver(this.world,{activate:b=>this.mobilizeBody(b),fracture:c=>this.break(c),damage:(c,e,p)=>this.damageRock(c,e,p),effect:(p,options)=>this.explosionEffects(p,options)});
    this.flexibles=flexibleLab?new FlexibleLab(this.world,this.wind,this.height,rocks,{desert}):null;
    this.sand=desert?new SandTraces(this.height,this.world.capacity,{bounds:[-27.5,27.5,-25.5,25.5],materials:this.materials}):null;
    this.water=water?new WaterLab(this.world,height,water):null;
    this.materials?.refreshMask(this.world,this.water);
    if(this.water)this.debris.push(this.water.float);
    this.splats = [...this.clusters.flatMap(c => c.splats), ...this.particles.splats,...this.explosions.splats,...(this.flexibles?.splats??[]),...(this.sand?.splats??[]),...(this.water?.splats??[])];
    this.fire = {position: new Vector3(),blastVelocity:new Vector3(),displacements:0, active: false, intensity: 0, fuel: 0, wetness: 0};
    this.snowCarry = 0; this.fireCarry = 0; this.smokeCarry = 0; this.emberCarry = 0;
    this.point = new Vector3(); this.velocity = new Vector3(); this.focus = new Vector3();
    this.damageDirection=new Vector3();this.damageMomentum=new Vector3();
    this.fires=[this.fire];this.nativeDirty=false;
    this.grab=new RockGrab(this.world);this.pickOrigin=new Vector3();this.pickDirection=new Vector3();this.pickPosition=new Vector3();this.pickRotation=new Quaternion();
    this.motionBlur=motionBlur?new ObjectMotionBlur(this.world):null;
    this.surfaceSnow=this.materials?new SurfaceSnow(this):null;
    this.pickResult={body:null,point:new Vector3(),distance:Infinity};
    this.beforeStep = this.beforeStep.bind(this); this.afterStep = this.afterStep.bind(this);
    this.hooks = {beforeStep: this.beforeStep, afterStep: this.afterStep, wind: this.wind};
  }
  target(controller, distance = 3) {
    const p = controller.position;
    this.point.set(p.x + Math.sin(controller.yaw) * distance, 0, p.z + Math.cos(controller.yaw) * distance);
    this.point.y = this.height(this.point.x, this.point.z); return this.point;
  }
  queryAuthored(point,radius){
    const result=this.nearRocks;result.length=0;
    for(let z=Math.floor((point.z-radius)/8);z<=Math.floor((point.z+radius)/8);z++)for(let x=Math.floor((point.x-radius)/8);x<=Math.floor((point.x+radius)/8);x++){
      const bin=this.rockGrid.get(x*65536+z);if(bin)for(const r of bin)if(r.binX===x&&r.binZ===z&&!r.broken&&!r.mobile&&!r.registered)result.push(r);
    }return result;
  }
  command(code, controller) {
    if (code === 'KeyB'||code==='KeyU'&&this.water) {
      this.reserveDebris(1);
      const cluster = this.clusters[this.nextCluster++ % this.clusters.length];
      if(this.surfaceSnow){this.surfaceSnow.resetBody(cluster.body);for(const chunk of cluster.chunks)this.surfaceSnow.resetBody(chunk.body);}
      if(this.grab.body?.cluster===cluster)this.grab.end(this.grab.lastSample,false,'recycled');
      this.target(controller, 3.5).y += 5;
      if(code==='KeyU')this.point.set(this.water.x,this.water.level+4,this.water.z);
      cluster.launch(this.point, this.velocity.set(Math.sin(controller.yaw) * 1.4, -.5, Math.cos(controller.yaw) * 1.4));
      this.motionBlur?.bindCluster(cluster);
    } else if (code === 'KeyX') {
      this.target(controller, 0);
      let nearest, distance = 14 ** 2;
      const consider=c=>{if(c.active&&!c.broken){const d=c.body.position.distanceToSquared(this.point);if(d<distance){distance=d;nearest=c;}}};
      for (const c of this.clusters) if (c.active && !c.broken) {
        const d = c.body.position.distanceToSquared(this.point);
        if (d < distance) { distance = d; nearest = c; }
      }
      for(const c of this.queryAuthored(this.point,14))consider(c);
      for(const c of this.movingAuthored)consider(c);
      if (nearest) this.break(nearest);
    } else if (code === 'KeyH') {
      if (this.fire.active) this.fire.active = false;
      else {
        this.fire.position.copy(this.target(controller)); this.fire.position.y += .12;
        Object.assign(this.fire, {active: true, fuel: 28, wetness: 0, intensity: 1});
        this.fire.blastVelocity.set(0,0,0);
      }
    } else if (code === 'KeyG') {
      this.wind.gust(this.world.time);
      let count=0;for(const b of this.debris)if(b.enabled&&!b.sleeping)count++;
      for (const b of this.debris) if (count<this.activeDebrisBudget&&b.sleeping&&b.enabled&&b.windResponse&&b.position.distanceToSquared(this.focus)<900){this.world.wake(b);count++;}
    } else if(code==='KeyE'){
      this.target(controller);this.point.y+=.25;this.explode(this.point);
    } else if(code==='KeyR'){
      this.mouse?.cancel();this.flexibles?.reset();
    } else if(code==='KeyV'){
      this.onViewFlexible?.();
    } else if(code==='KeyL'&&this.materials){
      this.target(controller,3.5);this.materials.refreshMask(this.world,this.water);
      this.materials.deposit(this.materials.material,this.point.x,this.point.z,{volume:1.5,radius:1.9});
    } else if(code==='KeyP'){
      this.onViewWater?.();
    }
  }
  break(cluster) {
    if(!cluster.active||cluster.broken)return false;
    if(cluster instanceof AuthoredRock&&!cluster.mobile){
      if(!cluster.body.surfaceSnow)cluster.body.snow=this.snow*.45;cluster.body.temperature=cluster.heat*.4;
    }
    this.reserveDebris(cluster instanceof AuthoredRock&&!cluster.mobile?6:5);
    this.surfaceSnow?.releaseBody(cluster.body,1,'fracture');
    if (!cluster.fracture()) return;
    if(this.surfaceSnow)for(const chunk of cluster.chunks)this.surfaceSnow.register(chunk.body);
    if(cluster instanceof BreakableSplatCluster)this.motionBlur?.bindCluster(cluster);
    if(this.grab.body&&!this.grab.body.enabled)this.grab.end(this.grab.lastSample,false,'fracture');
    if(cluster instanceof AuthoredRock){
      if(!this.brokenAuthored.includes(cluster)){this.brokenAuthored.push(cluster);this.nativeFractures++;}
      for(const chunk of cluster.chunks)if(chunk.body!==cluster.body&&!this.debris.includes(chunk.body))this.debris.push(chunk.body);
      this.registerAuthored(cluster);
    }
    this.fractures++;
    for (let i = 0; i < 26; i++) {
      const a = this.particles.random() * Math.PI * 2, r = this.particles.random();
      this.point.copy(cluster.body.position);
      this.velocity.set(Math.cos(a) * (1 + r * 2), r * 2, Math.sin(a) * (1 + r * 2));
      this.particles.emit(PARTICLE.DUST, this.point, this.velocity, {size: .08 + r * .09, life: 1 + r});
    }
  }
  damageRock(rock,energy,point,continuous=false){
    if(!rock.damage||rock.broken)return [];
    const version=rock.damage.version,oldMask=rock.damage.detached,mask=rock.damage.apply(energy,point,continuous);
    if(version===rock.damage.version)return [];
    if(mask){let pieces=0;for(let bits=mask;bits;bits&=bits-1)pieces++;this.reserveDebris(pieces);}
    if(rock instanceof AuthoredRock)rock.prepareBindings();
    if(mask)this.surfaceSnow?.releaseBody(rock.body,1,'fracture');
    const released=mask?rock.detach(mask):0,newBodies=[];
    if(mask&&this.surfaceSnow)for(const chunk of rock.chunks)this.surfaceSnow.register(chunk.body);
    if(mask&&this.grab.body===rock.body&&(mask&(1<<this.grabPart)))this.grab.end(this.grab.lastSample,false,'fracture');
    if(rock instanceof AuthoredRock){
      if(released&&!this.brokenAuthored.includes(rock)){this.brokenAuthored.push(rock);this.nativeFractures++;}
      for(const c of rock.chunks)if(c.body!==rock.body&&(mask&(1<<c.part))&&!(oldMask&(1<<c.part))){newBodies.push(c.body);if(!this.debris.includes(c.body))this.debris.push(c.body);}
      if(!rock.registered||released)this.registerAuthored(rock);
    }else{
      for(let i=0;i<rock.chunks.length;i++)if(mask&(1<<i))newBodies.push(rock.chunks[i].body);
      this.motionBlur?.bindCluster(rock);
    }
    // A small share of dissipated impact energy opens the fracture. Equal and
    // opposite core impulses (or a zero-mean fragment kick) preserve momentum.
    if(newBodies.length){
      const core=rock.body,energyPerBody=energy*.06/newBodies.length;this.damageMomentum.set(0,0,0);let totalMass=0;
      for(const body of newBodies){
        const direction=this.damageDirection.subVectors(body.position,core.position);if(direction.lengthSq()<1e-8)direction.set(0,1,0);else direction.normalize();
        const inverse=body.inverseMass+(core.enabled?core.inverseMass:0),speed=Math.min(1.5,Math.sqrt(2*energyPerBody*inverse)),impulse=speed/Math.max(inverse,1e-9);
        body.velocity.addScaledVector(direction,impulse*body.inverseMass);
        if(core.enabled)core.velocity.addScaledVector(direction,-impulse*core.inverseMass);
        else{this.damageMomentum.addScaledVector(direction,impulse);totalMass+=body.mass;}
      }
      if(!core.enabled){this.damageMomentum.multiplyScalar(1/totalMass);for(const body of newBodies)body.velocity.sub(this.damageMomentum);}
    }
    if(released)this.fractures++;
    if(this.grab.body&&!this.grab.body.enabled)this.grab.end(this.grab.lastSample,false,'fracture');
    return newBodies;
  }
  registerAuthored(rock){
    if(!rock.registered){
      rock.registered=true;this.movingAuthored.push(rock);
      const indices=[...this.movingIndices];for(let i=0;i<rock.descriptor.count;i++)indices.push(rock.descriptor.start+i);
      this.movingIndices=Uint32Array.from(indices);this.nativeVersion++;
    }
    this.world.staticDirty=true;this.onNativeChange?.(rock);
  }
  beginGrab(hit,time){
    if(hit?.kind==='flex'){this.grab.end(time,false,'replaced');return this.flexibles.grab.begin(hit,time);}
    this.flexibles?.grab.end(time,false,'replaced');
    const body=hit?.body;if(!body?.enabled)return false;
    this.mobilizeBody(body);
    const result=this.grab.begin(body,hit.point,time),rock=body.authored??(body.cluster?.body===body?body.cluster:null);
    this.grabPart=0;
    if(result&&rock?.parts){let distance=Infinity;for(let i=0;i<rock.parts.length;i++){if(rock.damage.detached&(1<<i))continue;const d=rock.parts[i].center.distanceToSquared(this.grab.localAnchor);if(d<distance){distance=d;this.grabPart=i;}}}
    return result;
  }
  get activeGrab(){return this.flexibles?.grab.body?this.flexibles.grab:this.grab;}
  pickInteraction(ray){const rock=this.pickRock(ray),flex=this.flexibles?.pick(ray);return flex&&(!rock||flex.distance<rock.distance)?flex:rock;}
  mobilizeBody(body){
    if(body.authored&&!body.authored.mobile&&!body.authored.broken){
      this.reserveDebris(1);const rock=body.authored;if(!body.surfaceSnow)rock.body.snow=this.snow*.45;
      rock.mobilize();if(!this.debris.includes(body))this.debris.push(body);this.registerAuthored(rock);
    }
    return body;
  }
  explode(point,options){return this.explosions.explode(point,options);}
  explosionEffects(point,{radius,pressureImpulse}){
    this.surfaceSnow?.blast(point,{radius,pressureImpulse});
    this.materials?.blast(point,{radius,pressureImpulse});
    this.water?.blast(point,{radius,pressureImpulse},this.particles);
    const pool=this.particles;
    const particleHits=pool.blast(point,radius,pressureImpulse),fire=this.fire;
    const distance=fire.position.distanceTo(point);
    if(fire.active&&distance<radius){
      this.velocity.subVectors(fire.position,point);this.velocity.y=0;
      if(this.velocity.lengthSq()<1e-8)this.velocity.set(.6,0,.8);else this.velocity.normalize();
      fire.blastVelocity.addScaledVector(this.velocity,Math.min(14,pressureImpulse*.018)*(1-distance/radius)**2).clampLength(0,14);fire.displacements++;
    }
    this.explosions.stats.fireParticlesDisplaced=particleHits;
    if(this.flexibles)this.explosions.stats.flexibleNodesDisplaced=this.flexibles.blast(point,{radius,pressureImpulse});
    for(let i=0;i<88;i++){
      const angle=pool.random()*Math.PI*2,up=pool.random(),speed=3+pool.random()*8;
      this.point.copy(point);this.velocity.set(Math.cos(angle)*speed,1.2+up*speed,Math.sin(angle)*speed);
      const kind=i<32?PARTICLE.EMBER:i<72?PARTICLE.DUST:PARTICLE.FLAME;
      pool.emit(kind,this.point,this.velocity,{life:kind===PARTICLE.FLAME?.25+up*.2:1.4+up*1.5,size:kind===PARTICLE.EMBER?.035+up*.018:kind===PARTICLE.FLAME?.22:.11+up*.12});
    }
  }
  /** Ray/ellipsoid picking for authored stones; sphere picking for debris.
   * Tests against the interpolated pose that is actually being displayed.
   */
  pickRock(ray){
    let nearest=Infinity,selected=null;
    const consider=(body,extents=null)=>{
      if(!body.enabled)return;
      const alpha=body.type==='fixed'?1:this.world.alpha;
      if(body.compound){
        this.pickRotation.copy(body.previousRotation).slerp(body.rotation,alpha);
        for(const shape of body.shapes){
          this.pickPosition.copy(shape.center).applyQuaternion(this.pickRotation);
          this.pickPosition.x+=body.previous.x+(body.position.x-body.previous.x)*alpha;
          this.pickPosition.y+=body.previous.y+(body.position.y-body.previous.y)*alpha;
          this.pickPosition.z+=body.previous.z+(body.position.z-body.previous.z)*alpha;
          this.pickOrigin.subVectors(ray.origin,this.pickPosition);
          const b=this.pickOrigin.dot(ray.direction),c=this.pickOrigin.lengthSq()-(shape.radius+.025)**2,discriminant=b*b-c;
          if(discriminant<0)continue;const root=Math.sqrt(discriminant);let t=-b-root;if(t<0)t=-b+root;
          if(t>=0&&t<nearest){nearest=t;selected=body;}
        }
        return;
      }
      this.pickPosition.lerpVectors(body.previous,body.position,alpha);
      this.pickOrigin.copy(ray.origin).sub(this.pickPosition);this.pickDirection.copy(ray.direction);
      let rx,ry,rz;
      if(extents){this.pickRotation.copy(body.previousRotation).slerp(body.rotation,alpha).invert();this.pickOrigin.applyQuaternion(this.pickRotation);this.pickDirection.applyQuaternion(this.pickRotation);rx=Math.max(.08,extents.x+.045);ry=Math.max(.08,extents.y+.045);rz=Math.max(.08,extents.z+.045);}
      else rx=ry=rz=body.pickRadius??body.radius;
      const o=this.pickOrigin,d=this.pickDirection,x=1/(rx*rx),y=1/(ry*ry),z=1/(rz*rz);
      const a=d.x*d.x*x+d.y*d.y*y+d.z*d.z*z,b=o.x*d.x*x+o.y*d.y*y+o.z*d.z*z,c=o.x*o.x*x+o.y*o.y*y+o.z*o.z*z-1;
      const discriminant=b*b-a*c;if(discriminant<0||a<1e-12)return;
      const root=Math.sqrt(discriminant);let t=(-b-root)/a;if(t<0)t=(-b+root)/a;
      if(t>=0&&t<nearest){nearest=t;selected=body;}
    };
    for(const rock of this.authored)if(!rock.broken)consider(rock.body,rock.extents);
    for(const body of this.debris)if(!body.authored)consider(body);
    if(!selected)return null;
    for(let i=1;i<32;i++){ray.at(nearest*i/32,this.pickPosition);if(this.pickPosition.y<this.world.height(this.pickPosition.x,this.pickPosition.z)-.06)return null;}
    this.pickResult.body=selected;this.pickResult.distance=nearest;ray.at(nearest,this.pickResult.point);return this.pickResult;
  }
  reserveDebris(extra){
    let active=0;for(const b of this.debris)if(b.enabled&&!b.sleeping)active++;
    const park=cluster=>{for(const c of cluster.chunks){const b=c.body;if(active+extra<=this.activeDebrisBudget)return;if(b!==this.grab.body&&b.inverseMass&&b.enabled&&!b.sleeping){b.sleeping=true;b.previous.copy(b.position);b.previousRotation.copy(b.rotation);b.velocity.set(0,0,0);b.angularVelocity.set(0,0,0);this.world.staticDirty=true;active--;}}};
    if(active+extra<=this.activeDebrisBudget)return;
    // Keep old fragments visible and collidable when parking them.
    for(const old of this.brokenAuthored)park(old);
    for(const old of this.clusters)if(old.broken)park(old);
  }
  beforeStep(dt) {
    this.grab.step(dt);
    this.water?.beforeStep(dt,this.particles,this.fire,this.wind,this.player);
    this.materials?.step(dt,{snow:this.snow,fire:this.fire,world:this.world,water:this.water,wind:this.wind});
    const pool = this.particles, random = () => pool.random();
    this.snowCarry += this.snow * 85 * dt;
    while (this.snowCarry >= 1) {
      this.snowCarry--;
      this.point.set(this.focus.x + (random() - .5) * 22, 0, this.focus.z + (random() - .5) * 22);
      this.point.y = this.world.height(this.point.x, this.point.z) + 5 + random() * 5;
      this.wind.sample(this.point, this.world.time, this.velocity); this.velocity.y = -1 - random();
      pool.emit(PARTICLE.SNOW, this.point, this.velocity, {life: 7 + random() * 3, size: .018 + random() * .035});
    }
    const f = this.fire;
    if (!f.active) { f.intensity = 0; return; }
    if(this.materials)f.position.y=this.height(f.position.x,f.position.z)+.12;
    if(f.blastVelocity.lengthSq()>1e-6){f.position.addScaledVector(f.blastVelocity,dt);f.position.y=this.height(f.position.x,f.position.z)+.12;f.blastVelocity.multiplyScalar(Math.exp(-7*dt));}
    f.wetness = Math.min(1, f.wetness + (this.snow * .23 - .035) * dt);
    f.wetness = Math.max(0, f.wetness); f.fuel = Math.max(0, f.fuel - dt);
    f.intensity = Math.max(0, Math.min(1, f.fuel / 3)) * (1 - f.wetness);
    if (f.fuel === 0 || f.wetness > .96) { f.active = false; return; }
    this.fireCarry += 65 * f.intensity * dt; this.smokeCarry += 15 * f.intensity * dt; this.emberCarry += 9 * f.intensity * dt;
    for (const [key, kind] of [['fireCarry', PARTICLE.FLAME], ['smokeCarry', PARTICLE.SMOKE], ['emberCarry', PARTICLE.EMBER]]) {
      while (this[key] >= 1) {
        this[key]--;
        this.point.copy(f.position); this.point.x += (random() - .5) * .65; this.point.z += (random() - .5) * .65;
        this.velocity.set((random() - .5) * .6, 1.2 + random() * 2, (random() - .5) * .6);
        if(kind===PARTICLE.EMBER)this.velocity.set((random()-.5)*2.8,1.8+random()*2.8,(random()-.5)*2.8);
        this.velocity.addScaledVector(f.blastVelocity,.9);
        pool.emit(kind, this.point, this.velocity, {life: kind === PARTICLE.SMOKE ? 3 + random() * 2 :kind===PARTICLE.EMBER?2.4+random()*1.2: .5 + random(),
          size: kind === PARTICLE.EMBER ? .035+random()*.018 : kind === PARTICLE.SMOKE ? .18 : .12 + random() * .13});
      }
    }
    const heatRock=c=>{if(c.active&&!c.broken&&c.body.position.distanceToSquared(f.position)<5+c.body.radius*c.body.radius){c.heat+=dt*f.intensity;if(c.damage)this.damageRock(c,c.threshold*dt*f.intensity*.8,f.position,true);else if(c.heat>3.5)this.break(c);}};
    for (const c of this.clusters) if (c.active && !c.broken && c.body.position.distanceToSquared(f.position) < 5+c.body.radius*c.body.radius) {
      c.heat += dt * f.intensity;
      if(c.damage){this.damageRock(c,c.threshold*dt*f.intensity*.8,f.position,true);}else if (c.heat > 3.5) this.break(c);
    }
    for(const c of this.queryAuthored(f.position,6))heatRock(c);
    for(const c of this.movingAuthored)heatRock(c);
  }
  afterStep(dt) {
    this.surfaceSnow?.beginTick();
    this.materials?.capture(this.world,dt);
    this.sand?.capture(this.world,this.snow);
    if(this.inspector?.enabled)this.inspector.captureTick();
    for(const body of this.world.impactBodies){
      const rock=body.authored??(body.cluster?.body===body?body.cluster:null);
      if(!rock||rock.broken)continue;
      if(rock.damage)this.damageRock(rock,body.impact,body.impactPoint);else if(body.impact>rock.threshold)this.break(rock);
    }
    // Material exchange is physical-body work, never per-Gaussian work.
    for(const b of this.debris)if(b.enabled&&b.inverseMass){
      const distance=b.position.distanceToSquared(this.fire.position),heat=this.fire.active?this.fire.intensity*Math.max(0,1-distance/9):0;
      b.temperature=Math.max(0,b.temperature+(heat*2.2-(.12+this.snow*.4)*b.temperature)*dt);
      if(!b.surfaceSnow)b.snow=Math.max(0,Math.min(1,b.snow+(this.snow*.16-heat*.9-b.temperature*.12-(1-this.snow)*.08)*dt));
      if(this.materials&&b.supported)b.wetness=Math.max(b.wetness??0,this.materials.sample(this.materials.wet,b.position.x,b.position.z));
      b.friction=b.baseFriction*(1-.55*b.snow)*(1-.25*(b.wetness??0));b.windResponse=b.baseWindResponse/(1+.25*b.snow);
    }
    this.particles.update(dt, this.world, this.wind, this.fires);
    this.flexibles?.step(dt,this.fire,this.snow);
    this.surfaceSnow?.step(dt,this.snow,this.fire);
    this.water?.afterStep(dt,this.particles,this.flexibles);
    let active=0;for(const b of this.debris)if(b.enabled&&!b.sleeping)active++;
    if(active>this.activeDebrisBudget)this.reserveDebris(0);
  }
  update(dt, controller, snow = 0) {
    const started=performance.now();
    this.snow = Math.max(0, Math.min(1, snow)); this.wind.winter = this.snow;
    this.focus.set(controller.position.x, 0, controller.position.z);
    this.point.copy(this.focus); this.point.y = this.world.height(this.point.x, this.point.z) + controller.position.y + .65;
    if (!this.player.enabled) { this.world.teleport(this.player, this.point); this.player.enabled = true; }
    this.world.setKinematicTarget(this.player, this.point);
    this.world.advance(dt, this.hooks); this.time = this.world.time;
    for (const cluster of this.clusters) cluster.sync(this.world.alpha);
    for(const rock of this.movingAuthored)if(rock.sync(this.world.alpha))this.nativeDirty=true;
    this.particles.sync();
    this.explosions.sync(this.world.time);
    this.flexibles?.sync(this.world.alpha);
    this.water?.sync(this.world.alpha);
    this.materials?.sync(dt);
    this.motionBlur?.update();
    this.surfaceSnow?.sync();
    this.mouse?.update();
    this.lastFrameMs=performance.now()-started;
  }
  writePacked(data, centers, start) {
    for (const cluster of this.clusters) { cluster.writePacked(data, centers, start); start += cluster.splats.length; }
    this.particles.writePacked(data, centers, start);
    this.explosions.writePacked(data,centers,start+this.particles.splats.length);
    this.flexibles?.writePacked(data,centers,start+this.particles.splats.length+this.explosions.splats.length);
    this.sand?.writePacked(data,centers,start+this.particles.splats.length+this.explosions.splats.length+(this.flexibles?.splats.length??0));
    this.water?.writePacked(data,centers,start+this.particles.splats.length+this.explosions.splats.length+(this.flexibles?.splats.length??0)+(this.sand?.splats.length??0));
  }
  writeNativePacked(data,centers,uploads,force=false){let changed=false;for(const rock of this.movingAuthored)changed=rock.writePacked(data,centers,uploads,force)||changed;this.nativeDirty=false;return changed;}
  snapshot() {
    let damaged=0,detached=0,brokenBonds=0;
    for(const r of this.authored)if(r.damage?.hits){damaged++;for(let i=0;i<r.parts.length;i++)if(r.damage.detached&(1<<i))detached++;for(const l of r.damage.links)if(l.health<=0)brokenBonds++;}
    for(const r of this.clusters)if(r.damage?.hits){damaged++;for(let i=0;i<r.parts.length;i++)if(r.damage.detached&(1<<i))detached++;for(const l of r.damage.links)if(l.health<=0)brokenBonds++;}
    return {solver: this.world.snapshot(), particles: this.particles.snapshot(), fractures: this.fractures,
      progressive:{enabled:this.advancedRocks,damaged,detached,brokenBonds},
      sand:this.sand?.snapshot()??null,
      water:this.water?.snapshot()??null,
      materials:this.materials?.snapshot()??null,
      surfaceSnow:this.surfaceSnow?.snapshot()??null,
      inspection:this.inspector?.snapshot()??null,
      clusters: this.clusters.filter(c => c.active).length, snow: this.snow,authoredRocks:this.authored.length,nativeFractures:this.nativeFractures,movingNativeSplats:this.movingIndices.length,cpuMs:this.lastFrameMs??0,
      fire: {active: this.fire.active, intensity: this.fire.intensity, fuel: this.fire.fuel, wetness: this.fire.wetness, position: this.fire.position.toArray(),blastVelocity:this.fire.blastVelocity.toArray(),displacements:this.fire.displacements},
      motionBlur:this.motionBlur?{strength:this.motionBlur.uniforms.objectMotionStrength.value,bytes:this.motionBlur.data.byteLength}:null,flexibles:this.flexibles?.snapshot()??null,explosions:{...this.explosions.stats},grab:this.activeGrab.snapshot(),wind: {strength: this.wind.strength, gust: this.world.time < this.wind.gustUntil}};
  }
  dispose() {this.inspector?.dispose();this.mouse?.dispose();this.flexibles?.dispose();this.motionBlur?.dispose();this.sand?.dispose();this.water?.dispose();this.surfaceSnow?.dispose();this.materials?.dispose();this.grab.end(0,false,'cancelled');for(const r of this.authored)if(r.descriptor.collider)r.descriptor.collider.destroyed=false;this.world.dispose(); this.fire.active = false; }
}
