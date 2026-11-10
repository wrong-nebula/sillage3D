import {Vector3} from 'three';

/** A compliant barycentric attachment, shared by rope segments, cloth faces
 * and plant stems. Releasing keeps solver velocity rather than adding energy.
 */
export class FlexGrab {
  constructor(solver){
    this.solver=solver;this.body=null;this.handle={kind:'flex',enabled:true};this.indices=new Uint16Array(3);this.weights=new Float64Array(3);this.lambda=new Float64Array(3);
    this.target=new Vector3();this.goal=new Vector3();this.initial=new Vector3();this.work=new Vector3();this.anchor=new Vector3();this.label='';this.lastThrowSpeed=0;this.releaseReason='';
  }
  begin(hit,time){
    let inverse=0;
    for(let i=0;i<3;i++){this.indices[i]=hit.indices[i]??0;this.weights[i]=hit.weights[i]??0;inverse+=this.solver.inverse[this.indices[i]]*this.weights[i]**2;}
    if(inverse<1e-8)return false;
    this.body=this.handle;this.label=hit.label;this.target.copy(hit.point);this.goal.copy(hit.point);this.initial.copy(hit.point);this.releaseReason='';this.lastSample=time;return true;
  }
  setTarget(point,time){if(!this.body||!point.toArray().every(Number.isFinite))return;this.target.copy(point).sub(this.initial).clampLength(0,4).add(this.initial);this.lastSample=time;}
  getAnchor(out,positions=this.solver.display){
    if(!this.body)return out.copy(this.target);out.set(0,0,0);
    for(let i=0;i<3;i++){const k=this.indices[i]*3,w=this.weights[i];out.x+=positions[k]*w;out.y+=positions[k+1]*w;out.z+=positions[k+2]*w;}return out;
  }
  prepare(dt){
    if(!this.body)return;
    if(this.indices.every((i,k)=>!this.weights[k]||this.solver.burn[i]>.92)){this.end(0,false,'burned');return;}
    this.work.subVectors(this.target,this.goal).clampLength(0,6*dt);this.goal.add(this.work);this.lambda.fill(0);
  }
  solve(dt){
    if(!this.body)return;
    const p=this.solver.position,w=this.solver.inverse,alpha=.001/(dt*dt);let denominator=alpha;
    for(let i=0;i<3;i++)denominator+=w[this.indices[i]]*this.weights[i]**2;
    this.getAnchor(this.anchor,p);this.work.subVectors(this.anchor,this.goal).clampLength(0,.25);
    for(let axis=0;axis<3;axis++){
      const delta=(-this.work.getComponent(axis)-alpha*this.lambda[axis])/denominator;this.lambda[axis]+=delta;
      for(let i=0;i<3;i++){const index=this.indices[i];p[index*3+axis]+=delta*w[index]*this.weights[i];}
    }
  }
  end(time,throwing=true,reason='released'){
    if(!this.body)return;this.lastThrowSpeed=0;
    for(let i=0;i<3;i++)if(this.weights[i]){const k=this.indices[i]*3,v=this.solver.velocity;if(reason==='cancelled')v[k]=v[k+1]=v[k+2]=0;this.lastThrowSpeed=Math.max(this.lastThrowSpeed,Math.hypot(v[k],v[k+1],v[k+2]));}
    this.body=null;this.releaseReason=reason;
  }
  snapshot(){return {active:!!this.body,kind:this.label,target:this.target.toArray(),lastThrowSpeed:this.lastThrowSpeed,releaseReason:this.releaseReason};}
}
