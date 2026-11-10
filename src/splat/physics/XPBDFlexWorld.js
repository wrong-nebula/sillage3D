import {Vector3} from 'three';

/** Small fixed-budget XPBD system. Compliance is scaled by h²; multipliers
 * accumulate over solver iterations and reset each fixed tick. No node creates
 * rigid contact constraints or per-tick objects.
 */
export class XPBDFlexWorld {
  constructor({capacity=512,constraintCapacity=2048,bendCapacity=256,iterations=6}={}){
    if(![capacity,constraintCapacity,bendCapacity,iterations].every(n=>Number.isInteger(n)&&n>0)||iterations>12)throw new RangeError('Invalid flexible solver budgets');
    this.capacity=capacity;this.constraintCapacity=constraintCapacity;this.bendCapacity=bendCapacity;this.iterations=iterations;this.count=0;this.distances=0;this.bends=0;this.time=0;
    this.position=new Float64Array(capacity*3);this.start=new Float64Array(capacity*3);this.renderPrevious=new Float64Array(capacity*3);this.rest=new Float64Array(capacity*3);this.display=new Float64Array(capacity*3);
    this.velocity=new Float32Array(capacity*3);this.force=new Float32Array(capacity*3);this.baseInverse=new Float32Array(capacity);this.inverse=new Float32Array(capacity);this.radius=new Float32Array(capacity);
    this.response=new Float32Array(capacity);this.drag=new Float32Array(capacity);this.group=new Uint8Array(capacity);this.burn=new Float32Array(capacity);this.temperature=new Float32Array(capacity);this.snow=new Float32Array(capacity);
    this.cutGroups=new Uint8Array(256);
    this.a=new Uint16Array(constraintCapacity);this.b=new Uint16Array(constraintCapacity);this.length=new Float32Array(constraintCapacity);this.compliance=new Float32Array(constraintCapacity);this.lambda=new Float32Array(constraintCapacity);this.edgeAlive=new Uint8Array(constraintCapacity);this.tether=new Uint8Array(constraintCapacity);
    this.ba=new Uint16Array(bendCapacity);this.bb=new Uint16Array(bendCapacity);this.bc=new Uint16Array(bendCapacity);this.bendRest=new Float64Array(bendCapacity*3);this.bendCompliance=new Float32Array(bendCapacity);this.bendLambda=new Float32Array(bendCapacity*3);
    this.point=new Vector3();this.projected=new Vector3();this.normal=new Vector3();this.relative=new Vector3();this.surface=new Vector3();this.lever=new Vector3();this.cross=new Vector3();this.impulse=new Vector3();
    this.reactionSpent=new Float32Array(0);this.maxReactionDelta=1;this.maxSpeed=18;
    this.stats={steps:0,contacts:0,characterContacts:0,rigidReactions:0,reactionCaps:0,cutConstraints:0,lastStepMs:0};
  }
  node(x,y,z,{mass=.025,pinned=false,radius=.045,response=.2,drag=.4,group=0}={}){
    if(this.count>=this.capacity)throw new RangeError('Flexible node budget exhausted');
    if(![x,y,z,mass,radius,response,drag].every(Number.isFinite)||mass<=0||radius<=0||response<0||drag<0||!Number.isInteger(group)||group<0||group>255)throw new RangeError('Invalid flexible node');
    const i=this.count++,k=i*3;
    this.position.set([x,y,z],k);this.rest.set([x,y,z],k);this.renderPrevious.set([x,y,z],k);this.display.set([x,y,z],k);
    this.baseInverse[i]=this.inverse[i]=pinned?0:1/mass;this.radius[i]=radius;this.response[i]=response;this.drag[i]=drag;this.group[i]=group;return i;
  }
  checkNode(i){if(!Number.isInteger(i)||i<0||i>=this.count)throw new RangeError('Unknown flexible node');}
  distance(a,b,compliance=0,slack=0){
    this.checkNode(a);this.checkNode(b);if(a===b||!Number.isFinite(compliance)||compliance<0||!Number.isFinite(slack)||slack<0)throw new RangeError('Invalid distance constraint');
    if(this.distances>=this.constraintCapacity)throw new RangeError('Flexible constraint budget exhausted');
    const i=this.distances++,p=this.position,x=a*3,y=b*3;this.a[i]=a;this.b[i]=b;this.length[i]=Math.hypot(p[x]-p[y],p[x+1]-p[y+1],p[x+2]-p[y+2])*(1+slack);this.compliance[i]=compliance;this.edgeAlive[i]=1;this.tether[i]=slack>0?1:0;return i;
  }
  bend(a,b,c,compliance=.001){
    this.checkNode(a);this.checkNode(b);this.checkNode(c);if(a===b||b===c||a===c||!Number.isFinite(compliance)||compliance<0)throw new RangeError('Invalid bending constraint');
    if(this.bends>=this.bendCapacity)throw new RangeError('Flexible bending budget exhausted');
    const i=this.bends++,p=this.position;this.ba[i]=a;this.bb[i]=b;this.bc[i]=c;this.bendCompliance[i]=compliance;
    for(let axis=0;axis<3;axis++)this.bendRest[i*3+axis]=p[a*3+axis]-2*p[b*3+axis]+p[c*3+axis];return i;
  }
  reset(){
    this.waterWet?.fill(0);this.surfaceSnowDepth?.fill(0);this.position.set(this.rest);this.start.set(this.rest);this.renderPrevious.set(this.rest);this.display.set(this.rest);this.velocity.fill(0);this.force.fill(0);this.temperature.fill(0);this.burn.fill(0);this.snow.fill(0);this.cutGroups.fill(0);this.inverse.set(this.baseInverse);this.edgeAlive.fill(1,0,this.distances);this.lambda.fill(0);this.bendLambda.fill(0);this.stats.cutConstraints=0;
  }
  step(dt,world,groups,fire=null,snow=0,grab=null){
    if(!Number.isFinite(dt)||dt<=0||dt>.025)throw new RangeError('Flexible ticks must be in (0, .025]');
    const began=performance.now(),p=this.position,v=this.velocity;
    this.start.set(p);this.renderPrevious.set(p);this.lambda.fill(0,0,this.distances);this.bendLambda.fill(0,0,this.bends*3);
    if(this.reactionSpent.length!==world.capacity)this.reactionSpent=new Float32Array(world.capacity);else this.reactionSpent.fill(0);
    this.stats.contacts=0;this.stats.rigidReactions=0;
    for(let i=0;i<this.count;i++){
      const k=i*3,group=groups[this.group[i]],wind=group.wind;
      const dx=fire?.active?p[k]-fire.position.x:10,dy=fire?.active?p[k+1]-fire.position.y:10,dz=fire?.active?p[k+2]-fire.position.z:10;
      const heat=fire?.active?fire.intensity*Math.max(0,1-(dx*dx+dy*dy+dz*dz)/6.25):0;
      this.temperature[i]=Math.max(0,this.temperature[i]+dt*(heat*1.8-this.temperature[i]*(.5+snow*.5+3*(this.waterWet?.[i]??0))));
      if(!this.managedSnow)this.snow[i]=Math.max(0,Math.min(1,this.snow[i]+dt*(snow*.12-heat*.7-(1-snow)*.08)));
      this.burn[i]=Math.min(1,this.burn[i]+dt*Math.max(0,this.temperature[i]-.4)*.16*(1-this.snow[i]*.8)*(1-.9*(this.waterWet?.[i]??0)));
      if(this.burn[i]>.92)this.cutGroups[this.group[i]]=1;
      const inverse=this.inverse[i]=this.baseInverse[i]/(1+this.snow[i]*.45+.6*(this.waterWet?.[i]??0));
      if(!inverse||this.burn[i]>=1){v[k]=v[k+1]=v[k+2]=0;continue;}
      const rate=this.drag[i]+this.response[i],decay=Math.exp(-rate*dt),integral=rate>1e-9?-Math.expm1(-rate*dt)/rate:dt,second=rate*dt>1e-4?(dt-integral)/rate:dt*dt*(.5-rate*dt/6);
      let ax=world.gravity.x+wind.x*this.response[i]+this.force[k]*inverse,ay=world.gravity.y+wind.y*this.response[i]+this.force[k+1]*inverse,az=world.gravity.z+wind.z*this.response[i]+this.force[k+2]*inverse;
      const acceleration=Math.hypot(ax,ay,az),scale=acceleration>45?45/acceleration:1;ax*=scale;ay*=scale;az*=scale;
      p[k]+=v[k]*integral+ax*second;p[k+1]+=v[k+1]*integral+ay*second;p[k+2]+=v[k+2]*integral+az*second;
      v[k]=v[k]*decay+ax*integral;v[k+1]=v[k+1]*decay+ay*integral;v[k+2]=v[k+2]*decay+az*integral;
    }
    this.start.set(p);grab?.prepare(dt);
    const inverseDt2=1/(dt*dt);
    for(let iteration=0;iteration<this.iterations;iteration++){
      grab?.solve(dt);
      // Alternate sweep direction to reduce directional bias in long chains.
      for(let n=0;n<this.distances;n++){
        const i=iteration%2?this.distances-1-n:n;if(!this.edgeAlive[i])continue;
        const a=this.a[i],b=this.b[i],ia=a*3,ib=b*3;
        if(this.burn[a]>.92||this.burn[b]>.92||this.cutGroups[this.group[a]]&&(this.tether[i]||this.compliance[i]>.0001)){this.edgeAlive[i]=0;this.stats.cutConstraints++;continue;}
        const wa=this.inverse[a],wb=this.inverse[b],weight=wa+wb;if(!weight)continue;
        const dx=p[ia]-p[ib],dy=p[ia+1]-p[ib+1],dz=p[ia+2]-p[ib+2],length=Math.hypot(dx,dy,dz);if(length<1e-9)continue;
        const error=length-this.length[i];if(this.tether[i]&&error<=0&&!this.lambda[i])continue;
        const alpha=this.compliance[i]*inverseDt2*(1+2*(this.burn[a]+this.burn[b]));
        const limit=.12/Math.max(wa,wb);let delta=Math.max(-limit,Math.min(limit,(-error-alpha*this.lambda[i])/(weight+alpha)));
        if(this.tether[i])delta=Math.min(0,this.lambda[i]+delta)-this.lambda[i];
        this.lambda[i]+=delta;const factor=delta/length;
        p[ia]+=dx*factor*wa;p[ia+1]+=dy*factor*wa;p[ia+2]+=dz*factor*wa;p[ib]-=dx*factor*wb;p[ib+1]-=dy*factor*wb;p[ib+2]-=dz*factor*wb;
      }
      for(let i=0;i<this.bends;i++){
        const a=this.ba[i],b=this.bb[i],c=this.bc[i],wa=this.inverse[a],wb=this.inverse[b],wc=this.inverse[c];
        if(this.burn[a]>.92||this.burn[b]>.92||this.burn[c]>.92)continue;
        const alpha=this.bendCompliance[i]*inverseDt2*(1+3*this.burn[b]),denominator=wa+4*wb+wc+alpha;if(denominator<1e-9)continue;
        const limit=.06/Math.max(wa,2*wb,wc,1e-9);
        for(let axis=0;axis<3;axis++){
          const k=i*3+axis,error=p[a*3+axis]-2*p[b*3+axis]+p[c*3+axis]-this.bendRest[k];
          const delta=Math.max(-limit,Math.min(limit,(-error-alpha*this.bendLambda[k])/denominator));this.bendLambda[k]+=delta;
          p[a*3+axis]+=wa*delta;p[b*3+axis]-=2*wb*delta;p[c*3+axis]+=wc*delta;
        }
      }
    }
    for(let i=0;i<this.count;i++){
      if(!this.inverse[i]||this.burn[i]>=1)continue;
      const k=i*3;
      v[k]+=(p[k]-this.start[k])/dt;v[k+1]+=(p[k+1]-this.start[k+1])/dt;v[k+2]+=(p[k+2]-this.start[k+2])/dt;
      this.collide(i,dt,world);
      const speed=Math.hypot(v[k],v[k+1],v[k+2]);if(speed>this.maxSpeed){const scale=this.maxSpeed/speed;v[k]*=scale;v[k+1]*=scale;v[k+2]*=scale;}
    }
    this.time+=dt;this.stats.steps++;this.stats.lastStepMs=performance.now()-began;
  }
  collide(i,dt,world){
    const k=i*3,p=this.position,radius=this.radius[i]+Math.min(.06,(this.surfaceSnowDepth?.[i]??0)*.5);this.point.fromArray(p,k);
    const height=world.height(this.point.x,this.point.z);
    if(this.point.y<height+radius+.15){
      const gx=(world.height(this.point.x+.05,this.point.z)-world.height(this.point.x-.05,this.point.z))/.1,gz=(world.height(this.point.x,this.point.z+.05)-world.height(this.point.x,this.point.z-.05))/.1;
      this.normal.set(-gx,1,-gz).normalize();const depth=radius-(this.point.y-height)*this.normal.y;
      if(depth>0){this.point.addScaledVector(this.normal,depth+.0001);this.contact(i,this.normal,null,world);}
    }
    world.projectParticle(this.point,radius,this.projected);
    if(!this.point.equals(this.projected)){
      this.point.copy(this.projected);this.normal.copy(world.particleNormal??this.normal);this.contact(i,this.normal,world.particleHit,world);
    }
    this.point.toArray(p,k);
  }
  contact(i,normal,body,world){
    this.stats.contacts++;if(body?.isCharacter)this.stats.characterContacts++;const k=i*3,v=this.velocity,inverse=this.inverse[i];this.surface.set(0,0,0);
    if(body){this.lever.subVectors(this.point,body.position);this.surface.crossVectors(body.angularVelocity,this.lever).add(body.velocity);}
    this.relative.fromArray(v,k).sub(this.surface);const speed=this.relative.dot(normal);if(speed>=0)return;
    const bodyInverse=body?.inverseMass??0;
    const angular=bodyInverse?this.cross.crossVectors(this.lever,normal).lengthSq()*body.inverseInertia:0;
    let magnitude=-(1+(speed<-1?.08:0))*speed/(inverse+bodyInverse+angular);
    if(bodyInverse){
      const remaining=Math.max(0,this.maxReactionDelta-this.reactionSpent[body.id]),maximum=remaining/bodyInverse;
      if(magnitude>maximum){magnitude=maximum;this.stats.reactionCaps++;}
      this.reactionSpent[body.id]+=magnitude*bodyInverse;
      this.impulse.copy(normal).multiplyScalar(magnitude);body.velocity.addScaledVector(this.impulse,-bodyInverse);
      this.cross.crossVectors(this.lever,this.impulse);body.angularVelocity.addScaledVector(this.cross,-body.inverseInertia);world.wake(body);this.stats.rigidReactions++;
    }
    this.relative.fromArray(v,k).addScaledVector(normal,magnitude*inverse);
    // Mild surface friction without inventing a normal bounce at rest.
    if(!bodyInverse){this.relative.sub(this.surface);const outward=this.relative.dot(normal);this.relative.multiplyScalar(.94).addScaledVector(normal,outward*.06).add(this.surface);}
    this.relative.toArray(v,k);
  }
  sync(alpha){const t=Math.max(0,Math.min(1,alpha));for(let k=0;k<this.count*3;k++)this.display[k]=this.renderPrevious[k]+(this.position[k]-this.renderPrevious[k])*t;}
  blast(point,radius,pressure){
    let affected=0;const p=this.position,v=this.velocity;
    for(let i=0;i<this.count;i++){
      if(!this.inverse[i]||this.burn[i]>=1)continue;const k=i*3,dx=p[k]-point.x,dy=p[k+1]-point.y,dz=p[k+2]-point.z,d=Math.hypot(dx,dy,dz);if(d>=radius)continue;
      const kick=Math.min(12,pressure*.012)*(1-d/radius)**2,inv=d>1e-8?1/d:0;
      v[k]+=dx*inv*kick;v[k+1]+=(inv?dy*inv:1)*kick;v[k+2]+=dz*inv*kick;affected++;
    }return affected;
  }
  snapshot(){
    let maximum=0,burned=0,bytes=0;for(const key in this)if(ArrayBuffer.isView(this[key]))bytes+=this[key].byteLength;
    for(let i=0;i<this.distances;i++)if(this.edgeAlive[i]){const a=this.a[i]*3,b=this.b[i]*3,p=this.position;maximum=Math.max(maximum,Math.hypot(p[a]-p[b],p[a+1]-p[b+1],p[a+2]-p[b+2])/Math.max(.001,this.length[i]));}
    for(let i=0;i<this.count;i++)if(this.burn[i]>.1)burned++;
    return {...this.stats,nodes:this.count,nodeBudget:this.capacity,distanceConstraints:this.distances,bendConstraints:this.bends,maxStretch:maximum,burnedNodes:burned,bytes};
  }
}
