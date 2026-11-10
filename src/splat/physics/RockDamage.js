import {Quaternion,Vector3} from 'three';

/** Six-cell bond graph: persistent local fatigue, then disconnected pieces.
 * No per-splat work in the damage solver, and no healing while resting.
 */
export class RockDamage {
  constructor(owner,parts){
    this.owner=owner;this.parts=parts;this.damage=new Float32Array(parts.length);this.detached=0;this.version=0;this.visualVersion=0;this.hits=0;
    this.point=new Vector3();this.rotation=new Quaternion();this.links=[];
    const edges=[];
    for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++)edges.push({a:i,b:j,d:parts[i].center.distanceToSquared(parts[j].center),health:1});
    edges.sort((a,b)=>a.d-b.d);
    const parents=parts.map((_,i)=>i),degree=new Uint8Array(parts.length),root=i=>{while(parents[i]!==i)i=parents[i];return i;};
    for(const edge of edges){const a=root(edge.a),b=root(edge.b);if(a!==b||degree[edge.a]<2||degree[edge.b]<2){this.links.push(edge);parents[a]=b;degree[edge.a]++;degree[edge.b]++;}}
    this.weights=new Float32Array(parts.length);this.visited=new Uint8Array(parts.length);this.stack=new Uint8Array(parts.length);
  }
  reset(){this.damage.fill(0);this.detached=0;this.version++;this.visualVersion++;this.hits=0;for(const link of this.links)link.health=1;}
  allMask(){return ((1<<this.parts.length)-1)&~this.detached;}
  apply(energy,worldPoint,continuous=false){
    const threshold=this.owner.threshold;
    if(!Number.isFinite(energy)||energy<=0||(!continuous&&energy<Math.max(.4,threshold*.04))||!this.allMask())return 0;
    this.hits++;this.version++;
    if(energy>=threshold*3.2){this.damage.fill(1);this.visualVersion++;return this.allMask();}
    const body=this.owner.body;
    this.rotation.copy(body.rotation).invert();this.point.subVectors(worldPoint,body.position).applyQuaternion(this.rotation);
    let closest=-1,distance=Infinity;
    for(let i=0;i<this.parts.length;i++){
      if(this.detached&(1<<i)){this.weights[i]=0;continue;}
      const p=this.parts[i],d=this.point.distanceToSquared(p.center);
      if(d<distance){distance=d;closest=i;}
    }
    const dose=Math.max(0,energy/threshold-(continuous?0:.04))*.85;
    for(let i=0;i<this.parts.length;i++){
      if(this.detached&(1<<i))continue;
      const p=this.parts[i],spread=this.parts[closest].radius+p.radius;
      const weight=i===closest?1:.16*Math.exp(-p.center.distanceToSquared(this.parts[closest].center)/Math.max(.01,spread*spread));
      this.weights[i]=weight;const before=Math.round(this.damage[i]*20);this.damage[i]=Math.min(1,this.damage[i]+dose*weight);if(Math.round(this.damage[i]*20)!==before)this.visualVersion++;
    }
    for(const link of this.links){
      if(this.detached&((1<<link.a)|(1<<link.b)))continue;
      link.health=Math.max(0,link.health-dose*Math.max(this.weights[link.a],this.weights[link.b]));
      if(this.damage[link.a]>=1||this.damage[link.b]>=1)link.health=0;
    }
    // Keep the largest connected component as the surviving core.
    this.visited.fill(0);let keep=0,largest=-1,remaining=this.allMask();
    for(let i=0;i<this.parts.length;i++){
      if(!(remaining&(1<<i))||this.visited[i])continue;
      let length=1,mask=0,mass=0;this.stack[0]=i;this.visited[i]=1;
      while(length){const node=this.stack[--length];mask|=1<<node;mass+=this.parts[node].mass??1;
        for(const link of this.links){if(link.health<=0)continue;const next=link.a===node?link.b:link.b===node?link.a:-1;
          if(next>=0&&(remaining&(1<<next))&&!this.visited[next]){this.visited[next]=1;this.stack[length++]=next;}}
      }
      if(mass>largest){largest=mass;keep=mask;}
    }
    let release=remaining&~keep;
    if((remaining&(remaining-1))===0&&this.damage[Math.log2(remaining)]>=1)release=remaining;
    return release;
  }
  markDetached(mask){this.detached|=mask;this.version++;this.visualVersion++;for(let i=0;i<this.parts.length;i++)if(mask&(1<<i))this.damage[i]=1;for(const link of this.links)if(mask&((1<<link.a)|(1<<link.b)))link.health=0;}
  snapshot(){return {hits:this.hits,damage:[...this.damage],detached:this.parts.reduce((n,_,i)=>n+!!(this.detached&(1<<i)),0),bonds:this.links.length,brokenBonds:this.links.filter(l=>l.health<=0).length};}
}

export function seamWeight(point,parts,index){
  const own=point.distanceTo(parts[index].center);let other=Infinity;
  for(let i=0;i<parts.length;i++)if(i!==index)other=Math.min(other,point.distanceTo(parts[i].center));
  return Math.max(0,1-Math.max(0,other-own)/Math.max(.015,parts[index].radius*.22));
}
