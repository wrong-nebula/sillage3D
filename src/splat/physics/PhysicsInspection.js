import {Vector3} from 'three';
import {updateShape} from './RockShape.js';
const COLORS={fixed:[.43,.67,1],awake:[1,.65,.20],sleep:[.40,.91,.58],ccd:[1,.39,.86],selected:[1,.96,.70],contact:[1,.32,.24],velocity:[.20,.96,1],flex:[.46,.81,.74],bond:[1,.45,.25]};
const CIRCLE=Array.from({length:13},(_,i)=>[Math.cos(i*Math.PI/6),Math.sin(i*Math.PI/6)]);

/** Read-only diagnostic model. Bounded histories and one reusable line buffer;
 * recording and overlay building stop while disabled. Poses are solver poses.
 */
export class PhysicsInspection{
 constructor(physics,{maxSegments=32768,maxContacts=256}={}){
  this.physics=physics;this.enabled=false;this.maxSegments=maxSegments;this.maxContacts=maxContacts;
  this.layers={shapes:true,contacts:true,velocities:true,flexible:false};this.positions=null;this.colors=null;this.count=0;this.capped=false;
  this.selected=null;this.contactMap=new Map();this.contacts=[];this.contactCursor=0;this.events=[];this.capturedTicks=0;this.droppedContacts=0;this.lastContactTick=-1;
  this.a=new Vector3();this.b=new Vector3();this.c=new Vector3();this.d=new Vector3();
 }
 setEnabled(value){
  this.enabled=Boolean(value);
  if(this.enabled&&!this.positions){this.positions=new Float32Array(this.maxSegments*6);this.colors=new Float32Array(this.maxSegments*6);this.groundSeen=new Uint8Array(this.physics.world.capacity);}
  if(!this.enabled){this.count=0;this.capped=false;}
 }
 label(b){
  const p=this.physics;
  if(b===p.player)return 'Character';if(b.isWaterFloat)return 'Wooden float';
  if(b.authored)return `Authored rock ${b.authored.descriptor.id}`;
  if(b.cluster)return `${b.cluster.body===b?'Spawned rock':'Spawned fragment'} ${p.clusters.indexOf(b.cluster)+1}`;
  for(const r of p.authored)if(r.chunks.some(c=>c.body===b))return `Authored fragment ${r.descriptor.id}`;
  if(p.flexibles?.posts.includes(b))return 'Rig support';return 'Rigid body';
 }
 select(hit){
  if(!hit){this.selected=null;return;}
  if(hit.kind==='flex'){
   this.selected={kind:'flex',nodes:[...hit.indices].filter((_,i)=>hit.weights[i]>0),weights:[...hit.weights].filter(w=>w>0),label:hit.label};
   const sum=this.selected.weights.reduce((a,b)=>a+b,0);if(sum>0)this.selected.weights=this.selected.weights.map(w=>w/sum);
  }else if(hit.body)this.selected={kind:'body',id:hit.body.id};
 }
 cycle(direction=1){
  const bodies=this.physics.world.bodies.filter(b=>b.enabled);if(!bodies.length)return;
  const index=bodies.findIndex(b=>b.id===this.selected?.id),next=index<0?(direction>0?0:bodies.length-1):(index+direction+bodies.length)%bodies.length;
  this.selected={kind:'body',id:bodies[next].id};
 }
 contact(source,a,b,point,normal,impulse,depth,ccd=false){
  let r=this.contactMap.get(source);
  if(!r){
   if(this.contacts.length<this.maxContacts){r={point:new Vector3(),normal:new Vector3()};this.contacts.push(r);}
   else{r=this.contacts[this.contactCursor++%this.maxContacts];this.contactMap.delete(r.source);}
   r.source=source;this.contactMap.set(source,r);
  }
  r.a=a.id;r.b=b?.id??null;r.point.copy(point);r.normal.copy(normal);r.impulse=impulse;r.depth=depth;r.ccd=ccd;r.tick=this.physics.world.stats.ticks;
 }
 captureTick(){
  if(!this.enabled)return;const w=this.physics.world;this.capturedTicks++;this.droppedContacts=Math.max(0,w.contactCount-128);this.groundSeen.fill(0);
  for(let i=0;i<Math.min(w.contactCount,128);i++){
   const c=w.contacts[i];this.a.copy(c.originA).add(c.rA);this.b.copy(c.normal).negate();
   this.contact(c,c.a,c.b,this.a,this.b,c.normalImpulse,c.depth);if(!c.b)this.groundSeen[c.a.id]=1;
  }
  for(const b of w.bodies){const t=b.terrainTouch;if(t.tick===w.stats.ticks&&t.revision===b.revision&&!this.groundSeen[b.id])this.contact(t,b,null,t.point,t.normal,0,t.depth,true);}
  for(const b of w.impactBodies)if(b.impact>0){
   this.events.unshift({tick:w.stats.ticks,body:b.id,energy:b.impact,point:b.impactPoint.toArray()});if(this.events.length>16)this.events.pop();
  }
  this.lastContactTick=w.stats.ticks;
 }
 line(a,b,color){
  if(this.count>=this.maxSegments){this.capped=true;return;}
  const k=this.count++*6,p=this.positions,c=this.colors;
  p[k]=a.x;p[k+1]=a.y;p[k+2]=a.z;p[k+3]=b.x;p[k+4]=b.y;p[k+5]=b.z;
  for(let j=0;j<3;j++)c[k+j]=c[k+3+j]=color[j];
 }
 cross(p,size,color){for(let a=0;a<3;a++){this.c.copy(p);this.d.copy(p);this.c.setComponent(a,p.getComponent(a)-size);this.d.setComponent(a,p.getComponent(a)+size);this.line(this.c,this.d,color);}}
 arrow(p,v,scale,color){
  const length=Math.min(4,v.length()*scale);if(length<1e-5)return;
  this.c.copy(v).normalize().multiplyScalar(length).add(p);this.line(p,this.c,color);
  const dx=this.c.x-p.x,dy=this.c.y-p.y,dz=this.c.z-p.z,head=Math.min(.15,length*.25),side=Math.hypot(dx,dz);
  this.d.copy(this.c).addScaledVector(v,-head/Math.max(v.length(),1e-8));
  if(side>1e-5){this.d.x+=dz/side*head*.45;this.d.z-=dx/side*head*.45;}else this.d.x+=head*.45;
  this.line(this.c,this.d,color);
 }
 sphere(p,r,color){
  for(let axis=0;axis<3;axis++)for(let i=0;i<12;i++){
   this.a.copy(p);this.b.copy(p);const u=(axis+1)%3,v=(axis+2)%3;
   this.a.setComponent(u,p.getComponent(u)+CIRCLE[i][0]*r);this.a.setComponent(v,p.getComponent(v)+CIRCLE[i][1]*r);
   this.b.setComponent(u,p.getComponent(u)+CIRCLE[i+1][0]*r);this.b.setComponent(v,p.getComponent(v)+CIRCLE[i+1][1]*r);this.line(this.a,this.b,color);
  }
 }
 body(b){
  if(!b?.enabled)return;updateShape(b);
  const selected=this.selected?.kind==='body'&&this.selected.id===b.id;
  const color=selected?COLORS.selected:b.sleeping?COLORS.sleep:b.ccdActive?COLORS.ccd:b.type==='fixed'?COLORS.fixed:COLORS.awake;
  if(this.layers.shapes)for(const s of b.shapes)this.sphere(s.position,s.radius,color);
  if(this.layers.velocities&&b.type!=='fixed')this.arrow(b.position,b.velocity,.15,COLORS.velocity);
  if(this.layers.shapes&&b.ccdActive&&!b.sleeping)this.line(b.sweepStart,b.position,COLORS.ccd);
  if(selected)this.cross(b.position,.12,COLORS.selected);
 }
 build(){
  this.count=0;this.capped=false;if(!this.enabled)return;
  const p=this.physics,w=p.world,selected=this.selected?.kind==='body'?w.bodies[this.selected.id]:null;
  this.body(selected);for(const b of w.bodies)if(b!==selected)this.body(b);
  if(this.layers.contacts)for(const r of this.contacts)if(w.stats.ticks-r.tick<=24){this.cross(r.point,.045,COLORS.contact);this.arrow(r.point,r.normal,.35,r.ccd?COLORS.ccd:COLORS.contact);}
  const f=p.flexibles?.solver;
  if(this.layers.flexible&&f){
   for(let i=0;i<f.distances;i++)if(f.edgeAlive[i]){this.a.fromArray(f.position,f.a[i]*3);this.b.fromArray(f.position,f.b[i]*3);this.line(this.a,this.b,COLORS.flex);}
  }
  if(this.selected?.kind==='flex'&&f)for(const i of this.selected.nodes){this.a.fromArray(f.position,i*3);this.cross(this.a,.13,COLORS.selected);}
  if(selected){const owner=selected.authored??(selected.cluster?.body===selected?selected.cluster:null);if(owner?.damage)for(const e of owner.damage.links){
   if(e.health<=0||owner.damage.detached&((1<<e.a)|(1<<e.b)))continue;
   this.a.copy(owner.parts[e.a].center).applyQuaternion(selected.rotation).add(selected.position);this.b.copy(owner.parts[e.b].center).applyQuaternion(selected.rotation).add(selected.position);this.line(this.a,this.b,COLORS.bond);
  }}
 }
 focus(out=new Vector3()){
  if(this.selected?.kind==='body'){const b=this.physics.world.bodies[this.selected.id];return b?out.copy(b.position):null;}
  const f=this.physics.flexibles?.solver;if(!f||!this.selected)return null;out.set(0,0,0);for(let i=0;i<this.selected.nodes.length;i++)out.addScaledVector(this.a.fromArray(f.position,this.selected.nodes[i]*3),this.selected.weights[i]);return out;
 }
 describe(){
  if(!this.selected)return null;
  if(this.selected.kind==='flex'){
   const f=this.physics.flexibles.solver,ids=this.selected.nodes,weights=this.selected.weights,average=array=>ids.reduce((n,id,i)=>n+(array?.[id]??0)*weights[i],0),velocity=[0,1,2].map(k=>ids.reduce((n,id,i)=>n+f.velocity[id*3+k]*weights[i],0));
   return {label:this.selected.label,nodes:ids,position:this.focus().toArray(),velocity,wetness:average(f.waterWet),snow:average(f.snow),heat:average(f.temperature),burn:average(f.burn),maxStretch:f.snapshot().maxStretch};
  }
  const b=this.physics.world.bodies[this.selected.id];if(!b)return null;const owner=b.authored??b.cluster;
  return {id:b.id,label:this.label(b),type:b.type,state:!b.enabled?'disabled / fractured':b.type!=='dynamic'?b.type:b.sleeping?'sleeping':'awake',position:b.position.toArray(),rotation:b.rotation.toArray(),velocity:b.velocity.toArray(),angularVelocity:b.angularVelocity.toArray(),mass:b.mass,lobes:b.shapes.length,radius:b.radius,friction:b.friction,restitution:b.restitution,supported:b.supported,ccd:!b.enabled?'disabled':b.ccd?(b.ccdActive&&!b.sleeping?'active':'armed'):'off',impactEnergy:b.impact,kineticEnergy:.5*b.mass*b.velocity.lengthSq()+(b.inverseInertia?.5*b.angularVelocity.lengthSq()/b.inverseInertia:0),heat:b.temperature,wetness:b.wetness,snow:b.snow,damage:owner?.damage?.snapshot()??null};
 }
 snapshot(){return {enabled:this.enabled,selected:this.enabled?this.describe():null,lines:this.count,lineCap:this.maxSegments,capped:this.capped,capturedTicks:this.capturedTicks,contacts:this.enabled?this.contacts.filter(r=>this.physics.world.stats.ticks-r.tick<=24).length:0,contactCap:this.maxContacts,contactsDropped:this.droppedContacts,events:this.events.slice(0,8)};}
 dispose(){this.setEnabled(false);this.contactMap.clear();this.contacts.length=0;this.events.length=0;this.positions=null;this.colors=null;}
 export(){return {version:1,coordinates:'Y up, metres and seconds; wireframes show latest solver poses',tick:this.physics.world.stats.ticks,solver:this.physics.world.snapshot(),selection:this.describe(),contacts:this.contacts.map(r=>({a:r.a,b:r.b,point:r.point.toArray(),normal:r.normal.toArray(),impulse:r.impulse,depth:r.depth,ccd:r.ccd,tick:r.tick})),impacts:this.events,subsystems:{surfaceSnow:this.physics.surfaceSnow?.snapshot()??null,materials:this.physics.materials?.snapshot()??null,particles:this.physics.particles.snapshot(),traces:this.physics.sand?.snapshot()??null,water:this.physics.water?.snapshot()??null,flexible:this.physics.flexibles?.snapshot()??null}};}
}
