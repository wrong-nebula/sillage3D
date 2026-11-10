import {Vector3,Quaternion} from 'three';

const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
/** The source has no ear bones. Deform just the ear tips after skinning, before
 * sampling the same fixed splats. Soft weights leave the attachment stationary. */
export function attachRunningEars(dog){
 let head;dog.root.traverse(o=>{if(o.isBone&&o.name==='head')head=o;});
 const inverse=head.getWorldQuaternion(new Quaternion()).invert();
 const back=new Vector3(0,0,-1).applyQuaternion(inverse),up=new Vector3(0,1,0).applyQuaternion(inverse),side=new Vector3(1,0,0).applyQuaternion(inverse);
 const masks=dog.meshes.map(({vertices})=>{
  const points=[];
  for(let i=0;i<vertices.length;i+=3){
   const x=vertices[i],y=vertices[i+1],z=vertices[i+2];
   const weight=smooth(1.40,1.63,y)*smooth(.10,.22,Math.abs(x))*smooth(.48,.61,z)*(1-smooth(.98,1.08,z));
   if(weight>.001)points.push({i,weight,side:Math.sign(x)});
  }
  return points;
 });
 const q=new Quaternion(),b=new Vector3(),u=new Vector3(),s=new Vector3();
 dog.onVertices=meshes=>{
  head.getWorldQuaternion(q);b.copy(back).applyQuaternion(q);u.copy(up).applyQuaternion(q);s.copy(side).applyQuaternion(q);
  const time=dog.time??0,phase=dog.controller?.phase??0;
  for(let m=0;m<meshes.length;m++)for(const p of masks[m]){
   const flutter=.014*Math.sin(phase*Math.PI*2-1.1+p.side*.45)+.006*Math.sin(time*12.7+p.side);
   const drag=(.115+flutter)*p.weight,drop=(-.018+flutter*.3)*p.weight,out=p.side*.012*p.weight;
   const v=meshes[m].vertices;
   v[p.i]+=b.x*drag+u.x*drop+s.x*out;v[p.i+1]+=b.y*drag+u.y*drop+s.y*out;v[p.i+2]+=b.z*drag+u.z*drop+s.z*out;
  }
 };
 dog.earMotion={vertices:masks.reduce((sum,m)=>sum+m.length,0),maxDrag:.135};
}
