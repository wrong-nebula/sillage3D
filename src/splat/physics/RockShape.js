import {Vector3} from 'three';

/** Bounded, load-time partition shared by collision lobes and fracture cells. */
export function partitionRock(points,count=6){
  count=Math.min(count,points.length);
  if(!count)return [];
  const seeds=[points[0].clone()],assignment=new Uint8Array(points.length);
  while(seeds.length<count){
    let best=0,distance=-1;
    for(let i=0;i<points.length;i++){let d=Infinity;for(const seed of seeds)d=Math.min(d,points[i].distanceToSquared(seed));if(d>distance){distance=d;best=i;}}
    seeds.push(points[best].clone());
  }
  for(let iteration=0;iteration<4;iteration++){
    const sums=seeds.map(()=>new Vector3()),weights=new Uint32Array(count);
    for(let i=0;i<points.length;i++){
      let nearest=0,distance=Infinity;
      for(let j=0;j<count;j++){const d=points[i].distanceToSquared(seeds[j]);if(d<distance){distance=d;nearest=j;}}
      assignment[i]=nearest;sums[nearest].add(points[i]);weights[nearest]++;
    }
    for(let j=0;j<count;j++)if(weights[j])seeds[j].copy(sums[j]).multiplyScalar(1/weights[j]);
  }
  return seeds.map((center,j)=>{
    const indices=[];let squared=0;
    for(let i=0;i<points.length;i++)if(assignment[i]===j){indices.push(i);squared+=points[i].distanceToSquared(center);}
    return {center,radius:Math.max(.04,Math.sqrt(squared/Math.max(1,indices.length))*1.12),indices};
  }).filter(p=>p.indices.length);
}

export function updateShape(body){
  if(!body.compound)return;
  const p=body.position,q=body.rotation,c=body.shapePose;
  if(c[0]===p.x&&c[1]===p.y&&c[2]===p.z&&c[3]===q.x&&c[4]===q.y&&c[5]===q.z&&c[6]===q.w)return;
  for(const s of body.shapes)s.position.copy(s.center).applyQuaternion(q).add(p);
  c[0]=p.x;c[1]=p.y;c[2]=p.z;c[3]=q.x;c[4]=q.y;c[5]=q.z;c[6]=q.w;
}

export function setCompound(world,body,parts){
  if(!parts.length||parts.length>6)throw new RangeError('Compound shapes need 1–6 lobes');
  const shapes=parts.map((p,i)=>{
    const center=p.center.clone();
    if(!center.toArray().every(Number.isFinite)||!Number.isFinite(p.radius)||p.radius<=0)throw new RangeError('Invalid compound lobe');
    return {center,position:new Vector3(),radius:p.radius,feature:p.feature??i};
  });
  body.compound=true;body.shapes=shapes;
  body.radius=Math.max(...body.shapes.map(s=>s.center.length()+s.radius));
  body.minRadius=Math.min(...body.shapes.map(s=>s.radius));
  let moment=0,volume=0;
  for(const s of body.shapes){const weight=s.radius**3;volume+=weight;moment+=weight*(.4*s.radius*s.radius+2/3*s.center.lengthSq());}
  body.inertiaPerMass=Math.max(.001,moment/volume);body.inverseInertia=body.inverseMass/body.inertiaPerMass;
  body.shapePose.fill(Infinity);body.revision++;world.staticDirty=true;updateShape(body);
}
