import {Quaternion,Vector3,MathUtils} from 'three';

const TAU=2*Math.PI,UP=new Vector3(0,1,0),SIDE=new Vector3(1,0,0);
const clamp=(v,a=0,b=1)=>MathUtils.clamp(v,a,b);
const ease=t=>{t=clamp(t);return t*t*t*(t*(t*6-15)+10);};
export const RUN_STRIDE=2.1;
export const RUN_LEGS={
 HR:{bones:['HR_thigh','HR_shin','HR_meta','HR_toe'],touch:0,stance:.30,hind:true},
 HL:{bones:['HL_thigh','HL_shin','HL_meta','HL_toe'],touch:.10,stance:.30,hind:true},
 FR:{bones:['FR_upperarm','FR_forearm','FR_paw','FR_toe'],touch:.42,stance:.28,hind:false},
 FL:{bones:['FL_upperarm','FL_forearm','FL_paw','FL_toe'],touch:.54,stance:.28,hind:false},
};

function rotateWorld(bone,rotation){
 const parent=bone.parent.getWorldQuaternion(new Quaternion()).invert();
 bone.quaternion.copy(parent.multiply(rotation).multiply(bone.getWorldQuaternion(new Quaternion())));
 bone.updateMatrixWorld(true);
}
function pointBone(bone,child,target){
 const origin=bone.getWorldPosition(new Vector3());
 const from=child.getWorldPosition(new Vector3()).sub(origin).normalize(),to=target.clone().sub(origin).normalize();
 rotateWorld(bone,new Quaternion().setFromUnitVectors(from,to));
}

/** Closed-form two-bone solve, retaining a stable anatomical knee/elbow side. */
export function solveLegJoint(hip,ankle,upper,lower,pole){
 const axis=ankle.clone().sub(hip),raw=axis.length(),distance=clamp(raw,Math.abs(upper-lower)+1e-5,(upper+lower)*.998);
 axis.multiplyScalar(1/Math.max(raw,1e-8));
 const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
 const bend=pole.clone().addScaledVector(axis,-pole.dot(axis)).normalize();
 return {joint:hip.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along))),ankle:hip.clone().addScaledVector(axis,distance),unreachable:Math.max(0,raw-distance)};
}

/** Paw contacts are fixed world points, predicted on the actual curved route.
 * A staggered transverse gallop has a short suspension after the leading front
 * paw pushes off. Swing paths have zero velocity at lift-off and touchdown.
 */
export function runningFoot(time,leg,rest,route,height){
 const period=RUN_STRIDE/route.speed,cycles=time/period-leg.touch,cycle=Math.floor(cycles),phase=cycles-cycle;
 const touchdown=(cycle+leg.touch)*period;
 const plant=at=>{
  const pose=route.pose(at),s=Math.sin(pose.yaw),c=Math.cos(pose.yaw),reach=RUN_STRIDE*leg.stance*.5;
  const x=pose.position[0]+rest.x*c+(rest.z+reach)*s,z=pose.position[2]-rest.x*s+(rest.z+reach)*c;
  return new Vector3(x,height(x,z)+rest.y,z);
 };
 const start=plant(touchdown),contact=phase<leg.stance;
 if(contact)return {target:start,contact,phase,swing:0,touchdown};
 const swing=(phase-leg.stance)/(1-leg.stance),end=plant(touchdown+period),target=start.lerp(end,swing*swing*(3-2*swing));
 const lift=(leg.hind?.30:.32)*(4*swing*(1-swing))**2;
 target.y=Math.max(target.y,height(target.x,target.z)+rest.y)+lift;
 return {target,contact,phase,swing,touchdown};
}

export class MeadowDogGait{
 constructor(root,route,height){
  this.root=root;this.route=route;this.height=height;this.b={};this.phase=0;
  root.traverse(o=>{if(o.isBone)this.b[o.name]=o;});
  this.rest=new Map(Object.values(this.b).map(b=>[b,{q:b.quaternion.clone(),p:b.position.clone()}]));
  root.updateMatrixWorld(true);const rootQ=root.getWorldQuaternion(new Quaternion()),inverse=rootQ.clone().invert();
  this.legs={};
  for(const [key,config]of Object.entries(RUN_LEGS)){
   const bs=config.bones.map(n=>this.b[n]);if(bs.some(b=>!b))throw new Error(`Missing running leg ${key}`);
   const p=bs.map(b=>b.getWorldPosition(new Vector3())),toe=root.worldToLocal(p[3].clone());
   // Center each support sweep beneath its hip/shoulder; the source rest pose
   // has slightly asymmetric front paws, which otherwise overextend one leg.
   const hip=root.worldToLocal(p[0].clone()),distal=p[3].clone().sub(p[2]).applyQuaternion(inverse);
   toe.z=hip.z+distal.z;
   this.legs[key]={...config,bs,rest:toe,upper:p[0].distanceTo(p[1]),lower:p[1].distanceTo(p[2]),
    foot:p[3].clone().sub(p[2]).applyQuaternion(inverse),toeRotation:inverse.clone().multiply(bs[3].getWorldQuaternion(new Quaternion()))};
  }
 }
 update(time){
  const {root,route,height,b:B}=this,pose=route.pose(time),before=route.pose(time-.05),after=route.pose(time+.05);
  this.phase=((time*route.speed/RUN_STRIDE)%1+1)%1;
  const turn=clamp(Math.atan2(Math.sin(after.yaw-before.yaw),Math.cos(after.yaw-before.yaw))/.1,-1.8,1.8);
  // One body pulse per complete gallop, with compression before the push-off.
  const bounce=-.035+.045*Math.cos(TAU*(this.phase-.88)),pitch=.035*Math.sin(TAU*(this.phase-.12));
  root.position.fromArray(pose.position);root.position.y+=bounce;
  const cx=Math.cos(pose.yaw)*.5,cz=-Math.sin(pose.yaw)*.5;
  const across=height(root.position.x+cx,root.position.z+cz)-height(root.position.x-cx,root.position.z-cz);
  const terrainRoll=Math.atan(across);
  root.rotation.set(pose.pitch,pose.yaw,clamp(terrainRoll-turn*.07,-.65,.65),'YXZ');
  for(const [bone,rest]of this.rest){bone.quaternion.copy(rest.q);bone.position.copy(rest.p);}
  root.updateMatrixWorld(true);
  const yawQ=new Quaternion().setFromAxisAngle(UP,pose.yaw),side=SIDE.clone().applyQuaternion(yawQ),forward=new Vector3(0,0,1).applyQuaternion(yawQ);
  const body=(name,axis,angle)=>{if(B[name])rotateWorld(B[name],new Quaternion().setFromAxisAngle(axis,angle));};
  body('pelvis',side,pitch);body('pelvis',UP,-turn*.045);
  body('spine',side,-.032*Math.sin(TAU*(this.phase-.1)));body('spine',UP,turn*.075);
  body('neck',side,-pitch*.55);body('neck2',side,-pitch*.3);
  body('head',side,.014*Math.sin(TAU*(this.phase+.12))-pitch*.15);
  body('neck',UP,turn*.04);body('head',UP,turn*.025);
  for(const [i,name]of ['tail1','tail2','tail3'].entries()){
   body(name,UP,.10*Math.sin(time*7-i*.5)-turn*.06);body(name,side,.025*Math.sin(TAU*this.phase-i*.3));
  }
  const feet=[];let compression=0;
  for(const [key,leg]of Object.entries(this.legs)){
   const foot=runningFoot(time,leg,leg.rest,route,height),[upper,lower,paw,toe]=leg.bs;
   const curl=foot.contact?.10*ease((foot.phase/leg.stance-.7)/.3):-(leg.hind?.28:.40)*Math.sin(Math.PI*ease(foot.swing))**2;
   const footVector=leg.foot.clone().applyQuaternion(yawQ).applyAxisAngle(side,curl);
   const desiredAnkle=foot.target.clone().sub(footVector),hip=upper.getWorldPosition(new Vector3());
   const horizontal=(hip.x-desiredAnkle.x)**2+(hip.z-desiredAnkle.z)**2,reach=(leg.upper+leg.lower)*.985;
   const required=Math.max(0,hip.y-desiredAnkle.y-Math.sqrt(Math.max(.01,reach*reach-horizontal)));
   // A continuous reach envelope lets the body crouch over uneven banks. All
   // four trajectories contribute, so support changes never snap the torso.
   compression=.5*(compression+required+Math.sqrt((compression-required)**2+.000025));
   feet.push({key,leg,foot,upper,lower,paw,toe,curl,footVector,desiredAnkle});
  }
  root.position.y-=Math.min(.5,compression);root.updateMatrixWorld(true);
  for(const {key,leg,foot,upper,lower,paw,toe,curl,footVector,desiredAnkle}of feet){
   const hip=upper.getWorldPosition(new Vector3());
   const pole=forward.clone().multiplyScalar(leg.hind?1:-1).addScaledVector(side,(key.endsWith('L')?1:-1)*.08);
   const solved=solveLegJoint(hip,desiredAnkle,leg.upper,leg.lower,pole);
   pointBone(upper,lower,solved.joint);pointBone(lower,paw,solved.ankle);
   // Keep the distal paw's length even on a steep slope beyond the leg's reach.
   const toeTarget=solved.ankle.clone().add(footVector);pointBone(paw,toe,toeTarget);
   const rotation=new Quaternion().setFromAxisAngle(side,curl*.35).multiply(yawQ).multiply(leg.toeRotation);
   toe.quaternion.copy(toe.parent.getWorldQuaternion(new Quaternion()).invert().multiply(rotation));toe.updateMatrixWorld(true);
   leg.contact=foot.contact;leg.target=foot.target;leg.reachError=solved.unreachable;leg.swing=foot.swing;
  }
 }
 report(){return Object.fromEntries(Object.entries(this.legs).map(([key,l])=>[key,{contact:l.contact,target:l.target.toArray(),reachError:l.reachError,swing:l.swing}]));}
}
