import {Vector3} from 'three';
import {XPBDFlexWorld} from './XPBDFlexWorld.js';
import {FlexGrab} from './FlexGrab.js';
import {writePhysicsSplat} from './SplatParticles.js';

const BARY=[[2/3,1/6,1/6],[1/6,2/3,1/6],[1/6,1/6,2/3]],SNOW=[.86,.93,1];
const makeSplat=(color,seed,material='wood')=>({center:[0,0,0],axes:[[.02,0,0],[0,.02,0],[0,0,.02]],color:[...color],opacity:.98,seed:seed%1,material});

/** Lab-only flexible rigs. One fixed particle pool and immutable Gaussian
 * membership; only centres/axes/colours change as constraints deform.
 */
export class FlexibleLab {
  constructor(world,wind,height,navRocks=[],{desert=false}={}){
    this.desert=desert;
    this.world=world;this.wind=wind;this.height=height;this.navRocks=navRocks;this.navPosts=[];this.posts=[];
    this.solver=new XPBDFlexWorld();this.grab=new FlexGrab(this.solver);this.groups=[];this.triangles=[];this.segments=[];this.leaves=[];this.splats=[];
    this.a=new Vector3();this.b=new Vector3();this.c=new Vector3();this.u=new Vector3();this.v=new Vector3();this.n=new Vector3();this.tangent=new Vector3();this.point=new Vector3();this.rayPoint=new Vector3();this.hitPoint=new Vector3();
    this.pickResult={kind:'flex',body:null,label:'',indices:new Uint16Array(3),weights:new Float64Array(3),point:new Vector3(),distance:Infinity};this.focus=new Vector3(0,2.2,10);this.resets=0;this.lastBlastAffected=0;
    const top=(x,z)=>height(x,z)+4.2;
    for(const x of [-7,-1,1,6.5])this.post(x,10,4.2);
    const rope=this.group('rope','Rope');
    for(let i=0;i<25;i++){const t=i/24;this.addNode(rope,-7+6*t,top(-7,10)*(1-t)+top(-1,10)*t-.8*Math.sin(t*Math.PI),10,{pinned:i===0||i===24,mass:.04,radius:.055,response:.7});}
    this.chain(rope,.000004,.002);
    const hanging=this.group('rope','Hanging rope');
    for(let i=0;i<25;i++){const t=i/24;this.addNode(hanging,-1+.35*Math.sin(t*Math.PI),top(-1,10)-3.05*t,10+.35*Math.sin(t*Math.PI),{pinned:i===0,mass:.045,radius:.05,response:.75});}
    this.chain(hanging,.000004,.002);
    const cloth=this.group('cloth','Cloth');cloth.cols=19;cloth.rows=12;
    for(let row=0;row<cloth.rows;row++)for(let col=0;col<cloth.cols;col++){
      const u=col/(cloth.cols-1),v=row/(cloth.rows-1),x=1+5.5*u;
      this.addNode(cloth,x,top(x,10)-3*v,10+.025*Math.sin(u*Math.PI)*v,{mass:.018,radius:.045,response:.12,drag:.65,pinned:row===0&&(col===0||col===cloth.cols-1)});
    }
    const at=(x,y)=>cloth.start+y*cloth.cols+x;
    for(let y=0;y<cloth.rows;y++)for(let x=0;x<cloth.cols;x++){
      if(y>0||x>0&&x<cloth.cols-1)this.solver.distance(x<cloth.cols/2?at(0,0):at(cloth.cols-1,0),at(x,y),.00002,.06);
      if(x+1<cloth.cols)this.solver.distance(at(x,y),at(x+1,y),.000002);
      if(y+1<cloth.rows)this.solver.distance(at(x,y),at(x,y+1),.000002);
      if(x+2<cloth.cols)this.solver.distance(at(x,y),at(x+2,y),.0015);
      if(y+2<cloth.rows)this.solver.distance(at(x,y),at(x,y+2),.0015);
      if(x+1<cloth.cols&&y+1<cloth.rows){
        this.solver.distance(at(x,y),at(x+1,y+1),.00002);this.solver.distance(at(x+1,y),at(x,y+1),.00002);
        this.triangle(at(x,y),at(x+1,y),at(x,y+1),cloth,y);this.triangle(at(x+1,y),at(x+1,y+1),at(x,y+1),cloth,y);
      }
    }
    for(let plant=0;plant<10;plant++){
      let x=plant<8?-7+plant*2:plant===8?-8:8,z=plant<8?13:9,ground=height(x,z);
      // Avoid rooting a stem inside an authored boulder.
      for(let attempt=0;attempt<4;attempt++){
        this.point.set(x,ground+.2,z);world.refreshBodies();world.projectParticle(this.point,.15,this.a);
        if(this.a.equals(this.point))break;z+=.7;ground=height(x,z);
      }
      const group=this.group('plant','Flexible plant'),length=1.35+.45*(.5+.5*Math.sin(plant*2.3));
      for(let i=0;i<8;i++){const t=i/7;this.addNode(group,x+.08*Math.sin(t*2+plant)*t,ground+length*t,z+.07*Math.sin(t*3+plant)*t,{pinned:i<2,mass:.025-.01*t,radius:.045,response:.65+1.1*t,drag:.9});}
      for(let i=0;i<7;i++)this.solver.distance(group.start+i,group.start+i+1,.000002);
      for(let i=0;i<6;i++)this.solver.bend(group.start+i,group.start+i+1,group.start+i+2,.0003+i*.00012);
      for(let i=2;i<8;i++)this.solver.distance(group.start+1,group.start+i,.00002,.03);
      for(let i=0;i<7;i++)this.segment(group.start+i,group.start+i+1,.022,desert?[.48,.42,.25]:[.34,.38,.12]);
      for(let i=2;i<8;i++)for(let side=0;side<2;side++)this.leaf(group.start+i-1,group.start+i,plant*1.4+i*2.4+side*Math.PI,desert?.23+.08*Math.sin(i+plant)**2:.30+.13*Math.sin(i+plant)**2);
    }
    this.solver.sync(1);this.sync(1);
  }
  group(kind,label){const g={id:this.groups.length,kind,label,start:this.solver.count,count:0,wind:new Vector3(),center:new Vector3()};this.groups.push(g);return g;}
  addNode(group,x,y,z,options){const i=this.solver.node(x,y,z,{...options,group:group.id});group.count++;return i;}
  chain(group,stretch,bend){
    for(let i=0;i<group.count-1;i++){this.solver.distance(group.start+i,group.start+i+1,stretch);this.segment(group.start+i,group.start+i+1,.037,[.58,.45,.28]);}
    for(let i=0;i<group.count-2;i++)this.solver.distance(group.start+i,group.start+i+2,bend);
    let arc=0;
    for(let i=1;i<group.count;i++){
      this.a.fromArray(this.solver.rest,(group.start+i-1)*3);this.b.fromArray(this.solver.rest,(group.start+i)*3);arc+=this.a.distanceTo(this.b);
      const edge=this.solver.distance(group.start,group.start+i,.00001,.02);this.solver.length[edge]=arc*1.02;
    }
  }
  post(x,z,length){
    const ground=this.height(x,z),body=this.world.createBody({type:'fixed',position:[x,ground+length*.5,z]});
    this.world.setCompound(body,Array.from({length:6},(_,i)=>({center:new Vector3(0,-length*.5+(i+.5)*length/6,0),radius:.16})));
    this.posts.push(body);const nav={x,z,radiusX:.13,radiusZ:.13,top:ground+length,angle:0};this.navPosts.push(nav);this.navRocks.push(nav);
    for(let y=0;y<22;y++)for(let side=0;side<6;side++){
      const angle=side*Math.PI/3,s=makeSplat([.35+.04*Math.cos(angle),.24,.14],(y*6+side)*.618,'wood');
      s.center=[x+Math.cos(angle)*.10,ground+(y+.5)*length/22,z+Math.sin(angle)*.10];
      s.axes=[[Math.sin(angle)*.065,0,-Math.cos(angle)*.065],[0,length/22*.72,0],[Math.cos(angle)*.025,0,Math.sin(angle)*.025]];this.splats.push(s);
    }
  }
  segment(a,b,width,color){for(let j=0;j<3;j++){const s=makeSplat(color,this.splats.length*.618);this.splats.push(s);this.segments.push({a,b,t:(j+.5)/3,width,color,splat:s});}}
  leaf(a,b,angle,length){for(let j=0;j<3;j++){const color=this.desert?[.41+.025*j,.44+.015*j,.29]:[.24+.03*j,.37+.015*j,.12],s=makeSplat(color,this.splats.length*.618,'grass');this.splats.push(s);this.leaves.push({a,b,angle,length,width:this.desert?.042:.075,t:(j+.5)/3,color,splat:s});}}
  triangle(a,b,c,group,row){
    const color=row===0||row===10?[.83,.71,.49]:row>=4&&row<=6?[.22,.37,.39]:[.72,.30,.16];
    const start=this.splats.length,triangle={a,b,c,group:group.id,color,splats:BARY.map((_,i)=>makeSplat(color,(start+i)*.618,'cloth'))};
    // Barycentric Gaussian samples stay in the same render slots after folding.
    this.splats.push(...triangle.splats);this.triangles.push(triangle);
  }
  step(dt,fire,snow){
    const s=this.solver,p=s.position,f=s.force;f.fill(0,0,s.count*3);
    for(const g of this.groups){
      g.center.set(0,0,0);for(let i=g.start;i<g.start+g.count;i++){const k=i*3;g.center.x+=p[k];g.center.y+=p[k+1];g.center.z+=p[k+2];}g.center.multiplyScalar(1/g.count);this.wind.sample(g.center,this.world.time,g.wind);
    }
    for(const tri of this.triangles){
      const a=tri.a*3,b=tri.b*3,c=tri.c*3,velocity=s.velocity;
      this.u.set(p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]);this.v.set(p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]);this.n.crossVectors(this.u,this.v);
      const twiceArea=this.n.length();if(twiceArea<1e-8||Math.max(s.burn[tri.a],s.burn[tri.b],s.burn[tri.c])>.92)continue;
      this.n.multiplyScalar(1/twiceArea);this.point.copy(this.groups[tri.group].wind).sub(this.a.set((velocity[a]+velocity[b]+velocity[c])/3,(velocity[a+1]+velocity[b+1]+velocity[c+1])/3,(velocity[a+2]+velocity[b+2]+velocity[c+2])/3));
      const normalSpeed=this.point.dot(this.n),pressure=Math.max(-2,Math.min(2,.10*normalSpeed*Math.abs(normalSpeed)*twiceArea*.5))/3;
      const fx=this.n.x*pressure,fy=this.n.y*pressure,fz=this.n.z*pressure;
      f[a]+=fx;f[a+1]+=fy;f[a+2]+=fz;f[b]+=fx;f[b+1]+=fy;f[b+2]+=fz;f[c]+=fx;f[c+1]+=fy;f[c+2]+=fz;
    }
    s.step(dt,this.world,this.groups,fire,snow,this.grab);
  }
  frame(a,b){
    this.a.fromArray(this.solver.display,a*3);this.b.fromArray(this.solver.display,b*3);this.tangent.subVectors(this.b,this.a);
    const length=this.tangent.length();if(length<1e-8)return 0;this.tangent.multiplyScalar(1/length);
    this.u.set(this.tangent.z,0,-this.tangent.x);if(this.u.lengthSq()<1e-8)this.u.set(1,0,0);else this.u.normalize();this.v.crossVectors(this.tangent,this.u).normalize();return length;
  }
  appearance(s,color,burn,snow,normalY=1,wet=0){
    const coat=this.surfaceSnow?Math.min(.98,snow*6):Math.min(.8,snow*Math.max(.12,normalY));for(let k=0;k<3;k++)s.color[k]=color[k]*(1-.75*burn)*(1-coat)*(1-.34*wet)+SNOW[k]*coat;
    s.opacity=.97*Math.max(0,1-burn*burn);
  }
  sync(alpha){
    const s=this.solver;s.sync(alpha);const p=s.display;
    for(const r of this.segments){
      const length=this.frame(r.a,r.b),mark=r.splat;if(!length){mark.opacity=0;continue;}
      this.point.lerpVectors(this.a,this.b,r.t).toArray(mark.center);this.point.copy(this.u).multiplyScalar(r.width).toArray(mark.axes[0]);this.point.copy(this.tangent).multiplyScalar(length*.24).toArray(mark.axes[1]);this.point.copy(this.v).multiplyScalar(r.width*.8).toArray(mark.axes[2]);
      this.appearance(mark,r.color,(s.burn[r.a]+s.burn[r.b])*.5,(s.snow[r.a]+s.snow[r.b])*.5,1,((s.waterWet?.[r.a]??0)+(s.waterWet?.[r.b]??0))*.5);
    }
    for(const leaf of this.leaves){
      const length=this.frame(leaf.a,leaf.b),mark=leaf.splat;if(!length){mark.opacity=0;continue;}
      this.c.copy(this.u).multiplyScalar(Math.cos(leaf.angle)).addScaledVector(this.v,Math.sin(leaf.angle)).multiplyScalar(.9).addScaledVector(this.tangent,.3).normalize();
      this.n.crossVectors(this.c,this.tangent).normalize();this.v.crossVectors(this.n,this.c).normalize();
      this.point.copy(this.b).addScaledVector(this.c,leaf.length*leaf.t).addScaledVector(this.v,-.04*leaf.t*leaf.t).toArray(mark.center);
      this.point.copy(this.n).multiplyScalar(leaf.width*Math.sin(Math.PI*leaf.t)).toArray(mark.axes[0]);this.point.copy(this.c).multiplyScalar(leaf.length*.25).toArray(mark.axes[1]);this.point.copy(this.v).multiplyScalar(.013).toArray(mark.axes[2]);
      this.appearance(mark,leaf.color,s.burn[leaf.b],s.snow[leaf.b],Math.abs(this.v.y),s.waterWet?.[leaf.b]??0);
    }
    for(let triangleIndex=0;triangleIndex<this.triangles.length;triangleIndex++){
      const tri=this.triangles[triangleIndex];
      this.a.fromArray(p,tri.a*3);this.b.fromArray(p,tri.b*3);this.c.fromArray(p,tri.c*3);this.u.subVectors(this.b,this.a);this.v.subVectors(this.c,this.a);this.n.crossVectors(this.u,this.v);
      const width=this.u.length(),area=this.n.length();if(width<1e-7||area<1e-8){for(const mark of tri.splats)mark.opacity=0;continue;}
      this.u.multiplyScalar(1/width);this.n.multiplyScalar(1/area);this.v.crossVectors(this.n,this.u);
      const depth=this.surfaceSnow?.clothDepth[triangleIndex]??0;
      const burn=Math.max(s.burn[tri.a],s.burn[tri.b],s.burn[tri.c]),snow=this.surfaceSnow?depth/.18:(s.snow[tri.a]+s.snow[tri.b]+s.snow[tri.c])/3;
      for(let i=0;i<3;i++){const mark=tri.splats[i],bary=BARY[i];this.point.copy(this.a).multiplyScalar(bary[0]).addScaledVector(this.b,bary[1]).addScaledVector(this.c,bary[2]).toArray(mark.center);
        if(depth){const side=this.n.y<0?-1:1;mark.center[0]+=this.n.x*depth*.5*side;mark.center[1]+=this.n.y*depth*.5*side;mark.center[2]+=this.n.z*depth*.5*side;}
        this.point.copy(this.u).multiplyScalar(width*.28).toArray(mark.axes[0]);this.point.copy(this.v).multiplyScalar(area/width*.29).toArray(mark.axes[1]);this.point.copy(this.n).multiplyScalar(.012+depth*.5).toArray(mark.axes[2]);this.appearance(mark,tri.color,burn,snow,Math.abs(this.n.y),((s.waterWet?.[tri.a]??0)+(s.waterWet?.[tri.b]??0)+(s.waterWet?.[tri.c]??0))/3);}
    }
  }
  pick(ray){
    const hit=this.pickResult,s=this.solver,p=s.display;hit.distance=Infinity;
    for(const tri of this.triangles){
      if(Math.max(s.burn[tri.a],s.burn[tri.b],s.burn[tri.c])>.92)continue;
      this.a.fromArray(p,tri.a*3);this.b.fromArray(p,tri.b*3);this.c.fromArray(p,tri.c*3);
      if(!ray.intersectTriangle(this.a,this.b,this.c,false,this.hitPoint))continue;
      const distance=this.hitPoint.distanceTo(ray.origin);if(distance>=hit.distance)continue;
      this.u.subVectors(this.b,this.a);this.v.subVectors(this.c,this.a);this.point.subVectors(this.hitPoint,this.a);
      const uu=this.u.dot(this.u),uv=this.u.dot(this.v),vv=this.v.dot(this.v),pu=this.point.dot(this.u),pv=this.point.dot(this.v),denominator=uu*vv-uv*uv;if(denominator<1e-12)continue;
      const b=(vv*pu-uv*pv)/denominator,c=(uu*pv-uv*pu)/denominator;hit.indices.set([tri.a,tri.b,tri.c]);hit.weights.set([1-b-c,b,c]);hit.point.copy(this.hitPoint);hit.distance=distance;hit.label='Cloth';
    }
    // Only one hit test per physical segment, not one per painted Gaussian.
    for(let i=0;i<this.segments.length;i+=3){const r=this.segments[i];if(s.burn[r.a]>.92||s.burn[r.b]>.92||!s.inverse[r.a]&&!s.inverse[r.b])continue;
      this.a.fromArray(p,r.a*3);this.b.fromArray(p,r.b*3);const squared=ray.distanceSqToSegment(this.a,this.b,this.rayPoint,this.hitPoint);
      const distance=this.rayPoint.distanceTo(ray.origin);if(squared>.13**2||distance>=hit.distance)continue;
      const t=Math.max(0,Math.min(1,this.point.subVectors(this.hitPoint,this.a).dot(this.u.subVectors(this.b,this.a))/Math.max(1e-8,this.u.lengthSq())));
      hit.indices.set([r.a,r.b,0]);hit.weights.set([1-t,t,0]);hit.point.copy(this.hitPoint);hit.distance=distance;hit.label=this.groups[s.group[r.a]].label;
    }
    if(!Number.isFinite(hit.distance))return null;
    for(let i=1;i<24;i++){ray.at(hit.distance*i/24,this.point);if(this.point.y<this.world.height(this.point.x,this.point.z)-.04)return null;}
    return hit;
  }
  blast(point,{radius,pressureImpulse}){this.lastBlastAffected=this.solver.blast(point,radius,pressureImpulse);return this.lastBlastAffected;}
  reset(){this.surfaceSnow?.resetCloth();this.grab.end(0,false,'reset');this.solver.reset();this.resets++;this.sync(1);}
  writePacked(data,centers,start){for(let i=0;i<this.splats.length;i++)writePhysicsSplat(this.splats[i],data,centers,start+i);}
  snapshot(){return {...this.solver.snapshot(),ropes:2,cloths:1,plants:10,splats:this.splats.length,triangles:this.triangles.length,lastBlastAffected:this.lastBlastAffected,resets:this.resets,grab:this.grab.snapshot()};}
  dispose(){this.grab.end(0,false,'disposed');for(const nav of this.navPosts){const i=this.navRocks.indexOf(nav);if(i>=0)this.navRocks.splice(i,1);}for(const body of this.posts)this.world.setEnabled(body,false);}
}
