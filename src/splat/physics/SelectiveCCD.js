import {Vector3} from 'three';
import {updateShape} from './RockShape.js';

const hash=(x,y,z)=>Math.imul(x,73856093)^Math.imul(y,19349663)^Math.imul(z,83492791);

/** Translational swept lobe contacts. A bounded global TOI loop also catches
 * moving/moving crossings; slow bodies keep the discrete solver. Rotation is
 * approximated by endpoint chords with conservative angular padding.
 */
export class SelectiveCCD {
  constructor(world,{maxBodies=32,maxEvents=4,maxTests=4096}={}){
    this.world=world;this.maxBodies=maxBodies;this.maxEvents=maxEvents;this.maxTests=maxTests;
    this.fast=[];this.candidates=[];this.stamp=0;this.startA=new Vector3();this.startB=new Vector3();
    this.endA=new Vector3();this.endB=new Vector3();this.delta=new Vector3();this.relative=new Vector3();this.point=new Vector3();this.normal=new Vector3();
    this.hit={a:null,b:null,t:2,feature:0,normal:new Vector3(),point:new Vector3()};
  }
  solve(dt){
    const w=this.world;this.fast.length=0;
    for(const b of w.moving)if(b.ccdActive&&b.enabled&&!b.sleeping)this.fast.push(b);
    this.fast.sort((a,b)=>b.velocity.lengthSq()-a.velocity.lengthSq());
    const overflow=this.fast.length>this.maxBodies;
    // Overflow bodies stay at their safe start pose rather than tunnel.
    for(let i=this.maxBodies;i<this.fast.length;i++){const b=this.fast[i];b.position.copy(b.sweepStart);b.rotation.copy(b.sweepRotation);b.velocity.set(0,0,0);w.stats.ccdBudgetHits++;}
    this.fast.length=Math.min(this.fast.length,this.maxBodies);if(!this.fast.length)return;
    let remaining=dt,events=0;
    for(;events<this.maxEvents;events++){
      this.hit.t=2;this.hit.a=null;this.tests=0;this.exhausted=false;w.refreshBodies();
      for(const b of w.enabled){updateShape(b);b.ccdPadding=b.compound&&b.type!=='fixed'&&!b.sleeping?1-Math.cos(b.sweepRotation.angleTo(b.rotation)*.5):0;}
      for(const a of this.fast){
        if(!a.enabled||a.sleeping)continue;
        this.gather(a);
        for(const b of this.candidates){if(!this.sweepPair(a,b))break;}
        if(!this.exhausted)this.sweepGround(a);
        if(this.exhausted)break;
      }
      w.stats.ccdTests+=this.tests;
      if(this.exhausted){this.stopFast();w.stats.ccdBudgetHits++;break;}
      if(!this.hit.a)break;
      const {a,b,t,feature,normal,point}=this.hit;
      for(const body of w.moving)if(body.enabled&&!body.sleeping){
        body.position.lerpVectors(body.sweepStart,body.position,t);body.rotation.copy(body.sweepRotation).slerp(body.rotation,t);
      }
      const c=w.contact(a,b,normal.x,normal.y,normal.z,0,feature+64,point,true);
      for(let i=0;i<w.iterations;i++)w.solve(c,false);
      // A tiny mass-weighted separation prevents repeatedly finding t=0.
      const inverse=a.inverseMass+(b?.inverseMass??0),skin=.0002/Math.max(inverse,1e-9);
      a.position.addScaledVector(normal,-skin*a.inverseMass);if(b)b.position.addScaledVector(normal,skin*b.inverseMass);
      w.stats.ccdHits++;remaining*=1-t;
      w.refreshBodies();
      for(const body of w.moving)if(body.enabled&&!body.sleeping){
        body.sweepStart.copy(body.position);body.sweepRotation.copy(body.rotation);body.position.addScaledVector(body.velocity,remaining);
        const q=body.rotation,v=body.angularVelocity,x=q.x,y=q.y,z=q.z,s=q.w,h=remaining*.5;
        q.set(x+h*(v.x*s+v.y*z-v.z*y),y+h*(-v.x*z+v.y*s+v.z*x),z+h*(v.x*y-v.y*x+v.z*s),s-h*(v.x*x+v.y*y+v.z*z)).normalize();
      }
      if(remaining<1e-8)break;
    }
    if(events===this.maxEvents){this.stopFast();w.stats.ccdBudgetHits++;}
    if(overflow)w.staticDirty=true;
  }
  stopFast(){for(const b of this.fast){b.position.copy(b.sweepStart);b.rotation.copy(b.sweepRotation);b.velocity.set(0,0,0);}}
  gather(a){
    const w=this.world,out=this.candidates;out.length=0;const stamp=++this.stamp;
    for(const b of w.moving)if(b!==a&&b.enabled&&(a.inverseMass||b.inverseMass))out.push(b);
    const size=w.queryCellSize,reach=Math.ceil((a.radius+size*.5)/size),distance=a.position.distanceTo(a.sweepStart),steps=Math.max(1,Math.ceil(distance/(size*.5)));
    if(steps>128){this.exhausted=true;return;}
    for(let i=0;i<=steps;i++){
      this.point.lerpVectors(a.sweepStart,a.position,i/steps);
      const x=Math.floor(this.point.x/size),y=Math.floor(this.point.y/size),z=Math.floor(this.point.z/size);
      for(let dz=-reach;dz<=reach;dz++)for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++){
        const cx=x+dx,cy=y+dy,cz=z+dz,bucket=w.queryGrid.get(hash(cx,cy,cz));if(!bucket)continue;
        for(const b of bucket)if(b.enabled&&b!==a&&b.qx===cx&&b.qy===cy&&b.qz===cz&&b._ccdStamp!==stamp){b._ccdStamp=stamp;out.push(b);}
      }
    }
  }
  start(body,shape,out){return body.type==='fixed'||body.sleeping?out.copy(shape.position):out.copy(shape.center).applyQuaternion(body.sweepRotation).add(body.sweepStart);}
  sweepPair(a,b){
    if(this.exhausted)return false;
    // Reject swept bounding spheres before testing up to 36 lobe pairs.
    this.startA.copy(a.sweepStart);this.startB.copy(b.type==='fixed'||b.sleeping?b.position:b.sweepStart);
    const broad=this.toi(this.startA,a.position,this.startB,b.position,a.radius+b.radius,true);
    if(broad===null)return true;
    for(const sa of a.shapes)for(const sb of b.shapes){
      if(this.tests>=this.maxTests){this.exhausted=true;return false;}this.tests++;
      this.start(a,sa,this.startA);this.start(b,sb,this.startB);
      // Arc/chord error bound; CCD is conservative for rapidly spinning lobes.
      const padding=(a.compound?sa.center.length()*a.ccdPadding:0)+(b.compound?sb.center.length()*b.ccdPadding:0);
      const t=this.toi(this.startA,sa.position,this.startB,sb.position,sa.radius+sb.radius+padding);
      if(t===null||t>=this.hit.t)continue;
      this.endA.lerpVectors(this.startA,sa.position,t);this.endB.lerpVectors(this.startB,sb.position,t);
      this.normal.subVectors(this.endB,this.endA).normalize();if(this.normal.lengthSq()<.5)this.normal.set(1,0,0);
      this.point.copy(this.endA).addScaledVector(this.normal,sa.radius);
      this.save(a,b,t,sa.feature*8+sb.feature);
    }
    return true;
  }
  toi(startA,endA,startB,endB,radius,broad=false){
    this.delta.subVectors(startB,startA);this.relative.subVectors(endB,startB).sub(endA).add(startA);
    const c=this.delta.lengthSq()-radius*radius,d=this.delta.dot(this.relative),v=this.relative.lengthSq();
    if(c<=1e-8)return broad||d<-.000001?0:null;
    if(d>=0||v<1e-12)return null;
    const discriminant=d*d-v*c;if(discriminant<0)return null;
    const t=(-d-Math.sqrt(discriminant))/v;return t>=0&&t<=1?t:null;
  }
  sweepGround(a){
    const w=this.world;
    for(const s of a.shapes){
      this.start(a,s,this.startA);this.endA.copy(s.position);
      const distance=this.startA.distanceTo(this.endA),steps=Math.min(32,Math.max(1,Math.ceil(distance/Math.max(.05,s.radius*.5))));
      let previous=this.startA.y-this.height(this.startA.x,this.startA.z)-s.radius;
      for(let i=1;i<=steps;i++){
        const t=i/steps;if(t>this.hit.t)break;
        this.point.lerpVectors(this.startA,this.endA,t);const gap=this.point.y-this.height(this.point.x,this.point.z)-s.radius;
        if(this.tests>=this.maxTests){this.exhausted=true;return;}this.tests++;
        if(gap<0&&previous>=-.001){
          let lo=(i-1)/steps,hi=t;
          for(let j=0;j<8;j++){const mid=(lo+hi)*.5;this.point.lerpVectors(this.startA,this.endA,mid);if(this.point.y-this.height(this.point.x,this.point.z)-s.radius>0)lo=mid;else hi=mid;}
          this.point.lerpVectors(this.startA,this.endA,hi);
          const x=this.point.x,z=this.point.z,gx=(this.height(x+.05,z)-this.height(x-.05,z))/.1,gz=(this.height(x,z+.05)-this.height(x,z-.05))/.1;
          this.normal.set(gx,-1,gz).normalize();this.point.addScaledVector(this.normal,s.radius);this.save(a,null,hi,s.feature);break;
        }
        previous=gap;
      }
    }
  }
  height(x,z){this.world.stats.terrainSamples++;return this.world.height(x,z);}
  save(a,b,t,feature){const hit=this.hit;hit.a=a;hit.b=b;hit.t=t;hit.feature=feature;hit.normal.copy(this.normal);hit.point.copy(this.point);}
}
