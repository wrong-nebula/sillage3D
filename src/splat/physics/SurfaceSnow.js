import {DataTexture,FloatType,NearestFilter,RGBAFormat,Quaternion,Vector3} from 'three';
import {PARTICLE} from './SplatParticles.js';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const DIRECTIONS=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const LANDING_RADII=[.5,1,2];

/** Six material-attached snow patches per rigid body, one per cloth triangle.
 * Surface volume is independent of the seasonal shader. Released volume rides
 * the existing particle pool and is accounted for even when slots recycle.
 * No extra Gaussians, grains, passes or per-tick allocations are required.
 */
export class SurfaceSnow{
  constructor(physics){
    this.physics=physics;this.world=physics.world;this.ground=physics.materials;this.pool=physics.particles;this.flex=physics.flexibles;
    const capacity=this.world.capacity;
    this.states=new Array(capacity);this.depth=new Float64Array(capacity*6);this.previousVelocity=new Float32Array(capacity*3);
    this.data=new Float32Array(64*Math.ceil(capacity*3/64)*4);
    this.texture=new DataTexture(this.data,64,this.data.length/256,RGBAFormat,FloatType);this.texture.minFilter=this.texture.magFilter=NearestFilter;this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
    this.uniforms={surfaceSnowData:{value:this.texture},surfaceSnowWidth:{value:64}};
    this.clothDepth=new Float64Array(this.flex?.triangles.length??0);this.clothArea=new Float64Array(this.clothDepth.length);this.clothLastVelocity=new Float32Array(this.clothDepth.length*3);
    if(this.flex){const s=this.flex.solver;s.managedSnow=true;s.surfaceSnowDepth=new Float32Array(s.capacity);this.nodeWeight=new Float32Array(s.capacity);this.flex.surfaceSnow=this;}
    this.point=new Vector3();this.velocity=new Vector3();this.kick=new Vector3();this.releaseOffset=new Vector3();this.normal=new Vector3();this.a=new Vector3();this.b=new Vector3();this.c=new Vector3();this.q=new Quaternion();
    this.clothPoint=new Vector3();this.clothVelocity=new Vector3();this.emissionBudget=24;this.tick=-1;
    this.pendingVolume=0;this.pendingPoint=new Vector3();this.pendingVelocity=new Vector3();this.emissionPoint=new Vector3();this.emissionVelocity=new Vector3();
    this.stats={deposited:0,shed:0,melted:0,landed:0,drained:0,recycled:0,motionEvents:0,impactEvents:0,blastEvents:0,emitted:0,lastStepMs:0};
    this.pool.onSnowSettle=(point,volume,reason)=>this.settle(point,volume,reason);
    this.pool.onSnowMelt=volume=>{this.stats.melted+=volume;};
    for(const r of physics.authored)this.register(r.body);
    for(const c of physics.clusters){this.register(c.body);for(const k of c.chunks)this.register(k.body);}
  }
  register(body){
    if(this.states[body.id])return;
    body.surfaceSnow=true;
    this.states[body.id]={body,area:Math.max(.015,4*Math.PI*body.radius*body.radius/6),revision:body.revision,ready:false,volume:0};
  }
  beginTick(){if(this.tick!==this.world.stats.ticks){this.tick=this.world.stats.ticks;this.emissionBudget=24;}}
  attach(engine){
    // Static authored rocks do not need CPU fracture bindings to receive snow.
    for(const rock of this.physics.authored)this.physics.motionBlur?.bindRange(rock.descriptor.start,rock.descriptor.count,rock.body);
    this.sync();
  }
  bodyVolume(body){const state=this.states[body.id];if(!state)return 0;let v=0;for(let face=0;face<6;face++)v+=this.depth[body.id*6+face]*state.area;return v;}
  updateLoad(body){
    const volume=this.bodyVolume(body);body.snowMass=volume*.6;body.snow=clamp(volume/this.states[body.id].area/.18);
    if(body.type==='dynamic'){body.inverseMass=1/(body.mass+body.snowMass);body.inverseInertia=body.inverseMass/body.inertiaPerMass;}
  }
  emit(point,velocity,volume){
    if(volume<1e-10)return;
    this.stats.shed+=volume;
    // Coalesce sub-clump dribbles. Flutter must not consume a particle slot
    // for every microlitre on every 120 Hz tick. The carry remains in ledger.
    this.pendingVolume+=volume;this.pendingPoint.addScaledVector(point,volume);this.pendingVelocity.addScaledVector(velocity,volume);
    if(this.pendingVolume<.0001)return;
    volume=this.pendingVolume;this.emissionPoint.copy(this.pendingPoint).multiplyScalar(1/volume);this.emissionVelocity.copy(this.pendingVelocity).multiplyScalar(1/volume);
    point=this.emissionPoint;velocity=this.emissionVelocity;this.pendingVolume=0;this.pendingPoint.set(0,0,0);this.pendingVelocity.set(0,0,0);
    const count=Math.min(this.emissionBudget,Math.max(1,Math.min(5,Math.ceil(volume/.012))));
    if(!count){this.settle(point,volume,'budget');return;}
    this.emissionBudget-=count;
    for(let i=0;i<count;i++){
      const angle=this.pool.random()*Math.PI*2,r=.12+this.pool.random()*.25;
      this.a.copy(point).add(this.b.set(Math.cos(angle)*r,.05+this.pool.random()*.12,Math.sin(angle)*r));
      this.b.copy(velocity).add(this.c.set(Math.cos(angle)*(.3+this.pool.random()),.3+this.pool.random()*.9,Math.sin(angle)*(.3+this.pool.random()))).clampLength(0,22);
      const size=clamp(Math.cbrt(volume/count)*.5,.025,.13);
      this.pool.emit(PARTICLE.SNOW,this.a,this.b,{life:7,size,snowVolume:volume/count});this.stats.emitted++;
    }
  }
  settle(point,volume,reason='ground'){
    if(!(volume>0))return;
    if(reason==='water'||reason==='melt'){this.stats.melted+=volume;return;}
    if(reason==='recycled')this.stats.recycled+=volume;
    const water=this.physics.water;
    if(water?.contains(point.x,point.z)){water.wetGround(point.x,point.z,.1);this.stats.melted+=volume;return;}
    let remaining=volume;
    // Wider fallback lands snow around a sheltering rock instead of silently
    // deleting it inside its footprint. Field cap/out-of-bounds drainage is
    // recorded explicitly. These transfers defer GPU texture preparation.
    for(const radius of LANDING_RADII){
      const accepted=this.ground.deposit('snow',point.x,point.z,{volume:remaining,radius,immediate:false});this.stats.landed+=accepted;remaining=Math.max(0,remaining-accepted);if(remaining<1e-9)break;
    }
    this.stats.drained+=remaining;
  }
  releaseBody(body,fraction=1,reason='impact',kick=null){
    const state=this.states[body.id];if(!state)return 0;
    let volume=0;const offset=body.id*6;this.releaseOffset.set(0,0,0);
    for(let face=0;face<6;face++){
      const old=this.depth[offset+face],after=old*(1-clamp(fraction));this.depth[offset+face]=after;const removed=(old-this.depth[offset+face])*state.area;volume+=removed;
      this.releaseOffset.addScaledVector(this.normal.fromArray(DIRECTIONS[face]).applyQuaternion(body.rotation),removed);
    }
    if(volume>1e-9){
      if(reason==='blast')this.stats.blastEvents++;else if(reason==='motion')this.stats.motionEvents++;else this.stats.impactEvents++;
      this.releaseOffset.multiplyScalar((body.radius+.06)/volume);this.point.copy(body.position).add(this.releaseOffset);
      if(kick)this.kick.copy(kick);this.velocity.copy(body.velocity);if(kick)this.velocity.add(this.kick);
      this.velocity.add(this.normal.crossVectors(body.angularVelocity,this.releaseOffset));
      this.emit(this.point,this.velocity,volume);
    }
    this.updateLoad(body);
    return volume;
  }
  resetBody(body){this.releaseBody(body,1,'recycle');const state=this.states[body.id];if(state)state.ready=false;body.snow=0;}
  clear(){
    let removed=0;for(const s of this.states)if(s){removed+=this.bodyVolume(s.body);s.body.snow=0;}this.depth.fill(0);for(const s of this.states)if(s)this.updateLoad(s.body);
    for(let i=0;i<this.clothDepth.length;i++)removed+=this.clothDepth[i]*this.clothArea[i];this.clothDepth.fill(0);this.flex?.solver.snow.fill(0);this.flex?.solver.surfaceSnowDepth.fill(0);
    for(let i=0;i<this.pool.capacity;i++)if(this.pool.snowVolume[i]>0){removed+=this.pool.snowVolume[i];this.pool.snowVolume[i]=0;this.pool.alive[i]=0;}
    this.stats.drained+=removed+this.pendingVolume;this.pendingVolume=0;this.pendingPoint.set(0,0,0);this.pendingVelocity.set(0,0,0);this.sync();
  }
  resetCloth(){
    let volume=0;this.clothPoint.set(0,0,0);
    const s=this.flex.solver;
    for(let i=0;i<this.clothDepth.length;i++){const v=this.clothDepth[i]*this.clothArea[i],tri=this.flex.triangles[i];this.clothPoint.addScaledVector(this.a.fromArray(s.position,tri.a*3),v);volume+=v;}
    if(volume){this.clothPoint.multiplyScalar(1/volume);this.emit(this.clothPoint,this.clothVelocity.set(0,0,0),volume);}
    this.clothDepth.fill(0);this.clothLastVelocity.fill(0);
  }
  step(dt,snow,fire){
    this.beginTick();const started=performance.now(),precip=this.ground.snowRate*clamp(snow);
    for(const state of this.states){
      if(!state)continue;const body=state.body;
      if(!body.enabled){this.releaseBody(body,1,'disabled');state.ready=false;continue;}
      const offset=body.id*6,k=body.id*3,v=body.velocity;
      if(state.revision!==body.revision){
        const area=Math.max(.015,4*Math.PI*body.radius*body.radius/6);let excess=0;
        for(let face=0;face<6;face++){const volume=this.depth[offset+face]*state.area;this.depth[offset+face]=Math.min(.24,volume/area);excess+=Math.max(0,volume-this.depth[offset+face]*area);}
        state.area=area;if(excess){this.point.copy(body.position);this.point.y+=body.radius;this.emit(this.point,this.velocity.copy(v),excess);}
      }
      const acceleration=state.ready&&state.revision===body.revision?Math.hypot(v.x-this.previousVelocity[k],v.y-this.previousVelocity[k+1],v.z-this.previousVelocity[k+2])/dt:0;
      this.previousVelocity[k]=v.x;this.previousVelocity[k+1]=v.y;this.previousVelocity[k+2]=v.z;state.ready=true;state.revision=body.revision;
      const speed=v.length(),spin=body.angularVelocity.length()*body.radius;
      const motionRate=Math.max(0,speed-.7)*.45+Math.max(0,spin-.35)*2+Math.max(0,acceleration-6)*.045;
      if(motionRate>0)this.releaseBody(body,1-Math.exp(-Math.min(24,motionRate)*dt),'motion');
      if(body.terrainTouch.tick===this.world.stats.ticks&&body.terrainTouch.energy>body.mass*.25)this.releaseBody(body,clamp(body.terrainTouch.energy/(body.mass*9),0,.9),'impact');
      let totalDepth=0;
      const distance=fire?.active?body.position.distanceToSquared(fire.position):100,heat=fire?.active?fire.intensity*Math.max(0,1-distance/9):0;
      for(let face=0;face<6;face++){
        this.normal.fromArray(DIRECTIONS[face]).applyQuaternion(body.rotation);const up=Math.max(0,this.normal.y);
        const old=this.depth[offset+face],limit=.24*clamp((up-.08)/.6);
        let depth=old+precip*up*dt/(1+speed+spin*3);
        const deposited=Math.max(0,Math.min(.24,depth)-old);depth=old+deposited;this.stats.deposited+=deposited*state.area;
        const melt=Math.min(depth,dt*((1-clamp(snow))*.0006+heat*.065+(body.submersion??0)*.5));depth-=melt;this.stats.melted+=melt*state.area;
        if(depth>limit){const slip=(depth-limit)*(1-Math.exp(-5*dt));depth-=slip;this.point.copy(body.position).addScaledVector(this.normal,body.radius+.05);this.emit(this.point,this.velocity.copy(v),slip*state.area);}
        this.depth[offset+face]=depth;totalDepth+=depth;
      }
      body.snow=clamp(totalDepth/.18);this.updateLoad(body);
    }
    this.stepCloth(dt,precip,snow,fire);
    this.stats.lastStepMs=performance.now()-started;
  }
  stepCloth(dt,precip,snow,fire){
    if(!this.flex)return;const s=this.flex.solver,p=s.position,vel=s.velocity;
    s.snow.fill(0);s.surfaceSnowDepth.fill(0);this.nodeWeight.fill(0);let released=0;this.clothPoint.set(0,0,0);this.clothVelocity.set(0,0,0);
    for(let i=0;i<this.clothDepth.length;i++){
      const t=this.flex.triangles[i],ia=t.a*3,ib=t.b*3,ic=t.c*3;
      this.a.fromArray(p,ia);this.b.fromArray(p,ib).sub(this.a);this.c.fromArray(p,ic).sub(this.a);this.normal.crossVectors(this.b,this.c);
      const twiceArea=this.normal.length(),area=Math.max(.0001,twiceArea*.5);this.normal.multiplyScalar(1/Math.max(1e-8,twiceArea));
      const oldArea=this.clothArea[i]||area;let depth=this.clothDepth[i]*oldArea/area;this.clothArea[i]=area;
      const up=Math.abs(this.normal.y),vx=(vel[ia]+vel[ib]+vel[ic])/3,vy=(vel[ia+1]+vel[ib+1]+vel[ic+1])/3,vz=(vel[ia+2]+vel[ib+2]+vel[ic+2])/3,k=i*3;
      const speed=Math.hypot(vx,vy,vz),acceleration=Math.hypot(vx-this.clothLastVelocity[k],vy-this.clothLastVelocity[k+1],vz-this.clothLastVelocity[k+2])/dt;
      this.clothLastVelocity[k]=vx;this.clothLastVelocity[k+1]=vy;this.clothLastVelocity[k+2]=vz;
      this.point.fromArray(p,ia).add(this.b.fromArray(p,ib)).add(this.c.fromArray(p,ic)).multiplyScalar(1/3);
      const heat=fire?.active?fire.intensity*Math.max(0,1-this.point.distanceToSquared(fire.position)/6.25):0;
      const burned=Math.max(s.burn[t.a],s.burn[t.b],s.burn[t.c])>.92;
      const add=burned?0:Math.min(Math.max(0,.18-depth),precip*(.14+.86*up)*dt/(1+speed));depth+=add;this.stats.deposited+=add*area;
      const melt=Math.min(depth,dt*((1-clamp(snow))*.0006+heat*.065+((s.waterWet?.[t.a]??0)+(s.waterWet?.[t.b]??0)+(s.waterWet?.[t.c]??0))*.08));depth-=melt;this.stats.melted+=melt*area;
      const limit=.025+.155*up,rate=Math.max(0,speed-.65)*1.1+Math.max(0,acceleration-8)*.028;
      let loss=depth*(1-Math.exp(-Math.min(25,rate)*dt));loss+=Math.max(0,depth-loss-limit)*(1-Math.exp(-4*dt));loss+=Math.max(0,depth-loss-.18);if(burned)loss=depth;
      depth=Math.max(0,depth-loss);const volume=loss*area;
      released+=volume;this.clothPoint.addScaledVector(this.point,volume);this.clothVelocity.addScaledVector(this.velocity.set(vx,vy,vz),volume);this.clothDepth[i]=depth;
      for(let j=0;j<3;j++){const node=j===0?t.a:j===1?t.b:t.c;s.surfaceSnowDepth[node]+=depth*area;this.nodeWeight[node]+=area;}
    }
    for(let i=0;i<s.count;i++)if(this.nodeWeight[i]){s.surfaceSnowDepth[i]/=this.nodeWeight[i];s.snow[i]=clamp(s.surfaceSnowDepth[i]/.18);}
    if(released>1e-10){this.stats.motionEvents++;this.clothPoint.multiplyScalar(1/released);this.clothVelocity.multiplyScalar(1/released);this.emit(this.clothPoint,this.clothVelocity,released);}
  }
  blast(point,{radius,pressureImpulse}){
    this.emissionBudget=48;
    for(const state of this.states){if(!state?.body.enabled)continue;const b=state.body,d=b.position.distanceTo(point);if(d>=radius+b.radius)continue;
      const fraction=clamp((pressureImpulse/250)*(1-Math.max(0,d-b.radius)/radius)**2);
      this.velocity.subVectors(b.position,point).normalize().multiplyScalar(Math.min(10,pressureImpulse*.012)*fraction);this.releaseBody(b,fraction,'blast',this.velocity);
    }
    if(this.flex){const s=this.flex.solver;let volume=0;this.clothPoint.set(0,0,0);
      for(let i=0;i<this.clothDepth.length;i++){const t=this.flex.triangles[i];this.point.fromArray(s.position,t.a*3).add(this.a.fromArray(s.position,t.b*3)).add(this.b.fromArray(s.position,t.c*3)).multiplyScalar(1/3);const distance=this.point.distanceTo(point);if(distance>=radius)continue;
        const old=this.clothDepth[i],fraction=clamp(pressureImpulse/160*(1-distance/radius)**2);this.clothDepth[i]*=1-fraction;const released=(old-this.clothDepth[i])*this.clothArea[i];volume+=released;this.clothPoint.addScaledVector(this.point,released);
      }
      if(volume>1e-9){this.stats.blastEvents++;this.clothPoint.multiplyScalar(1/volume);this.velocity.subVectors(this.clothPoint,point).normalize().multiplyScalar(Math.min(10,pressureImpulse*.015));this.emit(this.clothPoint,this.velocity,volume);}
    }
    this.sync();
  }
  sync(){
    for(const state of this.states){if(!state)continue;const b=state.body,k=b.id*12,o=b.id*6;
      this.q.copy(b.previousRotation).slerp(b.rotation,this.world.alpha);
      this.data[k]=this.depth[o];this.data[k+1]=this.depth[o+1];this.data[k+2]=this.depth[o+2];this.data[k+3]=this.depth[o+3];this.data[k+4]=this.depth[o+4];this.data[k+5]=this.depth[o+5];
      this.data[k+6]=this.q.x;this.data[k+7]=this.q.y;this.data[k+8]=this.q.z;this.data[k+9]=this.q.w;this.data[k+11]=b.enabled?1:0;
    }this.texture.needsUpdate=true;
  }
  shader(source){return source.replace('uniform bool hasWind;',`uniform bool hasWind;
uniform sampler2D surfaceSnowData;
uniform int surfaceSnowWidth;
vec4 surfaceSnowRead(int address){return texelFetch(surfaceSnowData,ivec2(address%surfaceSnowWidth,address/surfaceSnowWidth),0);}`)
    .replace('vec4 pigment=readSplat(4);paintColor=pigment.rgb;opacity=center.w;','vec4 pigment=readSplat(4);paintColor=pigment.rgb;opacity=center.w;\n  vec3 surfaceBasePigment=paintColor;')
    .replace('}else if(field.w>.52&&field.w<.58){','}else if(field.w>.512&&field.w<.519){\n      cliffEdge=0.; // Cloth snow is physically stored, including in summer.\n    }else if(field.w>.52&&field.w<.58){')
    .replace('vec3 p=(modelViewMatrix*vec4(center.xyz,1.)).xyz;',`if(objectMotionBody>=0.){
    int snowAddress=int(objectMotionBody)*3;vec4 sx=surfaceSnowRead(snowAddress),sy=surfaceSnowRead(snowAddress+1),sz=surfaceSnowRead(snowAddress+2);
    if(sz.w>.5){
      vec3 n=normalize(axisC);vec4 q=vec4(-sy.z,-sy.w,-sz.x,sz.y);
      vec3 local=n+2.*cross(q.xyz,cross(q.xyz,n)+q.w*n);
      vec3 weights=pow(abs(local),vec3(4.));weights/=max(.00001,weights.x+weights.y+weights.z);
      float depth=dot(weights,vec3(local.x>=0.?sx.x:sx.y,local.y>=0.?sx.z:sx.w,local.z>=0.?sy.x:sy.y));
      float cover=smoothstep(.001,.025,depth);
      center.xyz+=n*depth;
      axisC*=1.+min(.9,depth*3.);
      vec3 snow=mix(vec3(.66,.77,.90),vec3(.99,.99,.97),.35+.65*max(0.,dot(n,normalize(vec3(-.797,.343,.494)))));
      paintColor=mix(surfaceBasePigment,snow,cover);
    }
  }
  vec3 p=(modelViewMatrix*vec4(center.xyz,1.)).xyz;`);}
  snapshot(){let rigidVolume=0,clothVolume=0,airborne=0,loadedRocks=0;for(const state of this.states)if(state){const v=this.bodyVolume(state.body);rigidVolume+=v;if(v>.0001)loadedRocks++;}for(let i=0;i<this.clothDepth.length;i++)clothVolume+=this.clothDepth[i]*this.clothArea[i];for(let i=0;i<this.pool.capacity;i++)airborne+=this.pool.snowVolume[i];return {...this.stats,rigidVolume,clothVolume,airborne,pendingVolume:this.pendingVolume,loadedRocks,patches:this.depth.length,clothPatches:this.clothDepth.length,textureBytes:this.data.byteLength,clumpBudget:24};}
  dispose(){this.texture.dispose();this.pool.onSnowSettle=null;this.pool.onSnowMelt=null;}
}
