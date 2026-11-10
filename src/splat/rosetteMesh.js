import {BufferGeometry,Float32BufferAttribute} from 'three';
import {createRosetteAnatomy,leafSample,leafMarginSample} from './rosetteAnatomy.js';

/** Inspectable closed master generated from exactly the same analytic surfaces
 * as the splats. LOD changes sampling density, never organ identity. */
export function buildRosetteMesh(genome,{rows=96,columns=32}={}){
  const anatomy=createRosetteAnatomy(genome),positions=[],normals=[],colors=[],uvs=[],flora=[],organs=[],indices=[];
  const vertex=(s,organ)=>{
    const i=positions.length/3;positions.push(...s.point);normals.push(...s.normal);colors.push(...s.color);uvs.push(...s.uv);
    flora.push(Math.max(0,s.point[1]/genome.height)**1.65*.28,1,.22,genome.variation);organs.push(organ);return i;
  };
  const patch=(r,c,evaluate,reverse=false)=>{
    const start=positions.length/3,stride=c+1;
    for(let j=0;j<=r;j++)for(let i=0;i<=c;i++)vertex(evaluate(i/c,j/r),evaluate.organ??-1);
    for(let j=0;j<r;j++)for(let i=0;i<c;i++){
      const a=start+j*stride+i,b=a+1,d=a+stride+1,k=a+stride;
      if(reverse)indices.push(a,b,k,b,d,k);else indices.push(a,k,b,b,k,d);
    }
  };
  // Flared basal stem and its two closed caps.
  const stem=(u,v)=>{
    const a=u*Math.PI*2,r=anatomy.stemRadius*(1-.34*v)*(1+.025*Math.sin(a*11));
    return {point:[Math.cos(a)*r,anatomy.stemHeight*v,Math.sin(a)*r],normal:[Math.cos(a),.1,Math.sin(a)],color:genome.palette.base,uv:[u,v]};
  };
  patch(16,40,stem);
  for(const top of [false,true]){
    const y=top?anatomy.stemHeight:0,r=anatomy.stemRadius*(top?.66:1),start=positions.length/3;
    vertex({point:[0,y,0],normal:[0,top?1:-1,0],color:genome.palette.base,uv:[.5,.5]},-1);
    for(let i=0;i<=40;i++){const a=i/40*Math.PI*2;vertex({point:[Math.cos(a)*r,y,Math.sin(a)*r],normal:[0,top?1:-1,0],color:genome.palette.base,uv:[0,0]},-1);}
    for(let i=0;i<40;i++)indices.push(start,start+i+(top?2:1),start+i+(top?1:2));
  }
  for(const leaf of anatomy.leaves){
    for(const side of [1,-1]){
      const evaluate=(u,v)=>leafSample(leaf,u,v,side);evaluate.organ=leaf.id;
      patch(rows,columns,evaluate,side<0);
    }
    for(const edge of [0,1]){
      const evaluate=(u,v)=>leafMarginSample(leaf,edge,v,u);evaluate.organ=leaf.id;
      patch(rows,4,evaluate,edge===0);
    }
    // Rounded blade ends close the last tissue gap at root and needle tip.
    for(const v of [0,1]){
      const evaluate=(u,t)=>{
        const a=leafSample(leaf,u,v,1),b=leafSample(leaf,u,v,-1);
        return {...a,point:a.point.map((x,i)=>x+(b.point[i]-x)*t)};
      };evaluate.organ=leaf.id;patch(2,columns,evaluate,v===0);
    }
  }
  const geometry=new BufferGeometry();
  for(const [name,data,size]of [['position',positions,3],['normal',normals,3],['color',colors,3],['uv',uvs,2],['aFlora',flora,4],['aOrgan',organs,1]])geometry.setAttribute(name,new Float32BufferAttribute(data,size));
  geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData={species:genome.species,seed:genome.seed,age:genome.age,lod:'macro',rootMode:'buried',rows,columns,
    anatomyVersion:2,organs:anatomy.leaves.map(({id,root,cohort,birth,width,thickness})=>({id,root,cohort,birth,width,thickness}))};
  return geometry;
}
