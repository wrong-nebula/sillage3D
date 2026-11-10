/** Persistent local grass disturbance; timestamps avoid full-grid decay uploads. */
export class TrampleTrail {
 constructor({size=128,bounds=[-7,-2,38,28],radius=.95,recovery=15}={}){
  this.size=size;this.bounds=bounds;this.radius=radius;this.recovery=recovery;
  this.data=new Float32Array(size*size*4);this.rows=new Set();this.previous=null;this.time=0;
  for(let i=0;i<size*size;i++)this.data[i*4]=-1000;
 }
 advance(x,z,time){
  if(![x,z,time].every(Number.isFinite))throw new Error('Trample position and time must be finite.');
  if(time<this.time)this.clear();
  const previous=this.previous??[x,z],dx=x-previous[0],dz=z-previous[1],distance=Math.hypot(dx,dz);
  this.time=time;
  if(distance>8){this.previous=[x,z];return;}
  const direction=distance>.0001?[dx/distance,dz/distance]:[0,1];
  const steps=Math.max(1,Math.ceil(distance/.2));
  for(let step=1;step<=steps;step++)this.stamp(previous[0]+dx*step/steps,previous[1]+dz*step/steps,direction,time);
  this.previous=[x,z];
 }
 stamp(x,z,direction,time){
  const [bx,bz,w,h]=this.bounds,n=this.size,r=this.radius;
  const minX=Math.max(0,Math.floor((x-r-bx)/w*n)),maxX=Math.min(n-1,Math.ceil((x+r-bx)/w*n));
  const minZ=Math.max(0,Math.floor((z-r-bz)/h*n)),maxZ=Math.min(n-1,Math.ceil((z+r-bz)/h*n));
  for(let iz=minZ;iz<=maxZ;iz++)for(let ix=minX;ix<=maxX;ix++){
   const px=bx+(ix+.5)/n*w,pz=bz+(iz+.5)/n*h,q=Math.hypot(px-x,pz-z)/r;
   if(q>=1)continue;
   const strength=(1-q*q)**2,address=(iz*n+ix)*4;
   if(strength<this.strength(address,time))continue;
   this.data.set([time,direction[0],direction[1],strength],address);this.rows.add(iz);
  }
 }
 strength(address,time=this.time){
  const t=Math.max(0,Math.min(1,(time-this.data[address])/this.recovery));
  return this.data[address+3]*(1-t*t*(3-2*t));
 }
 sample(x,z,time=this.time){
  const [bx,bz,w,h]=this.bounds,ix=Math.floor((x-bx)/w*this.size),iz=Math.floor((z-bz)/h*this.size);
  if(ix<0||iz<0||ix>=this.size||iz>=this.size)return {strength:0,direction:[0,0]};
  const a=(iz*this.size+ix)*4;return {strength:this.strength(a,time),direction:[this.data[a+1],this.data[a+2]]};
 }
 clear(){this.data.fill(0);for(let i=0;i<this.size*this.size;i++)this.data[i*4]=-1000;this.previous=null;this.rows=new Set(Array.from({length:this.size},(_,i)=>i));}
}

export const TRAMPLE_GLSL=`
uniform bool hasTrample;
uniform sampler2D trampleData;
uniform vec4 trampleBounds;
uniform float trampleTime;
uniform float trampleRecovery;
uniform float trampleIntensity;
vec3 trampleCell(ivec2 cell){
  ivec2 size=textureSize(trampleData,0);
  if(any(lessThan(cell,ivec2(0)))||any(greaterThanEqual(cell,size)))return vec3(0.);
  vec4 data=texelFetch(trampleData,cell,0);
  float weight=min(1.2,data.w*trampleIntensity)*(1.-smoothstep(0.,trampleRecovery,max(0.,trampleTime-data.x)));
  return vec3(data.yz*weight,weight);
}
vec3 grassTrail(vec2 p){
  vec2 uv=(p-trampleBounds.xy)/trampleBounds.zw;
  if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec3(0.);
  vec2 cell=uv*vec2(textureSize(trampleData,0))-.5;ivec2 c=ivec2(floor(cell));vec2 f=fract(cell);
  return mix(mix(trampleCell(c),trampleCell(c+ivec2(1,0)),f.x),mix(trampleCell(c+ivec2(0,1)),trampleCell(c+ivec2(1,1)),f.x),f.y);
}
vec3 flattenGrassAxis(vec3 axis,vec2 direction,float strength){
  return vec3(axis.x+direction.x*axis.y*strength*.95,axis.y*(1.-strength*.78),axis.z+direction.y*axis.y*strength*.95);
}
`;
