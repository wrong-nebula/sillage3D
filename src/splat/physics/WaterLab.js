import {DataTexture,RGBAFormat,FloatType,LinearFilter,Vector3,Vector4,Quaternion} from 'three';
import {updateShape} from './RockShape.js';
import {PARTICLE,writePhysicsSplat} from './SplatParticles.js';

export const WATER_BASIN=Object.freeze({x:-13,z:18,rx:7.5,rz:6,depth:.68});
export function waterExcavation(x,z){const b=WATER_BASIN,r2=((x-b.x)/b.rx)**2+((z-b.z)/b.rz)**2;return r2<1?b.depth*(1-r2)**2:0;}
/** Grade the pond bed and a narrow containing bank into the surrounding dunes. */
export function waterBasinHeight(x,z,sourceHeight,level){
 const b=WATER_BASIN,r2=((x-b.x)/b.rx)**2+((z-b.z)/b.rz)**2;
 if(r2>=1.3**2)return sourceHeight;
 const bed=level+.025-(b.depth+.025)*Math.max(0,1-r2)**2;
 const t=Math.max(0,Math.min(1,(Math.sqrt(r2)-.95)/.35)),blend=t*t*(3-2*t);
 return bed*(1-blend)+sourceHeight*blend;
}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));

/** Bounded shallow surface waves + lobe-volume buoyancy and fluid drag.
 * 48² finite-difference cells; no volumetric particles, no all-pairs fluid work.
 * Wetness and surface normals share one 36KB vertex texture.
 */
export class WaterLab{
 constructor(world,height,config){
  this.world=world;this.height=height;Object.assign(this,config);this.n=48;this.density=3;this.time=0;
  this.bounds=[this.x-this.rx-1.2,this.x+this.rx+1.2,this.z-this.rz-1.2,this.z+this.rz+1.2];
  const n=this.n,count=n*n;this.dx=(this.bounds[1]-this.bounds[0])/(n-1);this.dz=(this.bounds[3]-this.bounds[2])/(n-1);
  this.h=new Float32Array(count);this.v=new Float32Array(count);this.next=new Float32Array(count);this.depth=new Float32Array(count);this.wet=new Float32Array(count);this.data=new Float32Array(count*4);
  for(let row=0;row<n;row++)for(let col=0;col<n;col++){
   const x=this.bounds[0]+col*this.dx,z=this.bounds[2]+row*this.dz,k=row*n+col,r2=((x-this.x)/this.rx)**2+((z-this.z)/this.rz)**2;
   this.depth[k]=r2<1?Math.max(0,this.level-height(x,z)):0;
   this.wet[k]=r2<1.15?clamp((this.level+.10-height(x,z))/.10):0;
  }
  this.texture=new DataTexture(this.data,n,n,RGBAFormat,FloatType);this.texture.minFilter=this.texture.magFilter=LinearFilter;this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
  this.uniforms={waterLabField:{value:this.texture},waterLabBounds:{value:new Vector4(this.bounds[0],this.bounds[2],this.bounds[1]-this.bounds[0],this.bounds[3]-this.bounds[2])},waterLabLevel:{value:this.level}};
  this.point=new Vector3();this.velocity=new Vector3();this.offset=new Vector3();this.quaternion=new Quaternion();this.windVelocity=new Vector3();
  this.stats={entries:0,wakes:0,splashes:0,quenched:0,blasts:0,characterWakes:0};this.characterSubmersion=0;this.splats=[];this.local=[];
  const cols=34,rows=36;
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   const x=this.x-this.rx+(col+.5)*this.rx*2/cols,z=this.z-this.rz+(row+.5)*this.rz*2/rows,depth=this.level-height(x,z);
   if(!this.contains(x,z)||depth<.012)continue;
   this.splats.push({center:[x,this.level,z],axes:[[this.rx*2/cols*.76,0,0],[0,0,this.rz*2/rows*.76],[0,.012,0]],color:[.17,.34,.30],opacity:clamp(depth/.07)*.9,seed:(col*.618+row*.437)%1,softParticle:true,material:'lab-water'});
  }
  this.surfaceCount=this.splats.length;
  this.float=world.createBody({position:[this.x,this.level+.06,this.z],radius:.46,mass:.12,drag:.12,friction:.65,windResponse:.025});this.float.isWaterFloat=true;
  world.setCompound(this.float,[-.28,0,.28].map(x=>({center:new Vector3(x,0,0),radius:.18})));
  for(let row=0;row<9;row++)for(let j=0;j<8;j++){
   const angle=j*Math.PI/4,x=-.43+(row+.5)*.86/9,y=Math.cos(angle)*.17,z=Math.sin(angle)*.17;
   const s={center:[0,0,0],axes:[[.085,0,0],[0,-Math.sin(angle)*.09,Math.cos(angle)*.09],[0,Math.cos(angle)*.018,Math.sin(angle)*.018]],color:[.49,.30,.13],opacity:.98,seed:(row*.618+j*.32)%1,material:'wood-float'};
   this.local.push({s,center:new Vector3(x,y,z),axes:s.axes.map(a=>new Vector3(...a))});this.splats.push(s);
  }
  this.flexWet=new Float32Array(512);this.sync(1);
 }
 cell(x,z){const col=Math.round((x-this.bounds[0])/this.dx),row=Math.round((z-this.bounds[2])/this.dz);return col<0||col>=this.n||row<0||row>=this.n?-1:row*this.n+col;}
 contains(x,z){const k=this.cell(x,z);return k>=0&&this.depth[k]>.005;}
 surface(x,z){const k=this.cell(x,z);return k>=0&&this.depth[k]>.005?this.level+this.h[k]:-Infinity;}
 wetAt(x,z){const k=this.cell(x,z);return k<0?0:this.wet[k];}
 wetGround(x,z,amount=.2){const k=this.cell(x,z);if(k>=0)this.wet[k]=Math.min(1,this.wet[k]+amount);}
 disturb(x,z,strength,radius=.45){
  const col=Math.round((x-this.bounds[0])/this.dx),row=Math.round((z-this.bounds[2])/this.dz),reach=Math.ceil(radius/Math.min(this.dx,this.dz)*2);
  for(let r=Math.max(1,row-reach);r<Math.min(this.n-1,row+reach+1);r++)for(let c=Math.max(1,col-reach);c<Math.min(this.n-1,col+reach+1);c++){
   const k=r*this.n+c;if(!this.depth[k])continue;const q=(((c-col)*this.dx)**2+((r-row)*this.dz)**2)/(radius*radius);
   this.v[k]=clamp(this.v[k]+strength*(1-q)*Math.exp(-q),-1.2,1.2);this.wet[k]=1;
  }
 }
 splash(particles,x,z,strength,count=8){
  this.stats.splashes++;
  for(let i=0;i<Math.min(16,count);i++){
   const a=particles.random()*Math.PI*2,r=particles.random();this.point.set(x,this.level+.03,z);this.velocity.set(Math.cos(a)*(.3+r)*strength,.6+r*strength*1.7,Math.sin(a)*(.3+r)*strength);
   particles.emit(PARTICLE.WATER,this.point,this.velocity,{life:.5+r*.7,size:.015+r*.016});
  }
 }
 waveStep(dt,wind){
  const n=this.n,damp=Math.exp(-2.2*dt),heightDamp=Math.exp(-.45*dt),ix=1/(this.dx*this.dx),iz=1/(this.dz*this.dz);
  wind?.sample(this.point.set(this.x,this.level,this.z),this.world.time,this.windVelocity);
  const windForce=Math.min(.02,this.windVelocity.length()*.002);
  for(let row=1;row<n-1;row++)for(let col=1;col<n-1;col++){
   const k=row*n+col;if(!this.depth[k])continue;const h=this.h[k];
   const lap=((this.depth[k-1]?this.h[k-1]:h)+(this.depth[k+1]?this.h[k+1]:h)-2*h)*ix+((this.depth[k-n]?this.h[k-n]:h)+(this.depth[k+n]?this.h[k+n]:h)-2*h)*iz;
   this.v[k]=clamp((this.v[k]+dt*(Math.min(3.2,9.81*this.depth[k])*lap+windForce*Math.sin(col*.7+row*.43-this.time*2.3)))*damp,-1.2,1.2);
   this.next[k]=clamp((h+this.v[k]*dt)*heightDamp,-.065,Math.min(.065,this.depth[k]*.6));
  }
  const previous=this.h;this.h=this.next;this.next=previous;
  const dry=Math.exp(-dt/45);for(let k=0;k<this.wet.length;k++)this.wet[k]=this.depth[k]>.01?1:this.wet[k]*dry;
  this.time+=dt;
 }
 beforeStep(dt,particles,fire,wind,character){
  this.waveStep(dt,wind);this.characterSubmersion=0;
  for(const b of this.world.bodies){
   if(!b.enabled||(!b.inverseMass&&b!==character))continue;
   b.wetness=(b.wetness??0)*Math.exp(-dt/60);b.submersion=0;
   if(Math.abs(b.position.x-this.x)>this.rx+b.radius||Math.abs(b.position.z-this.z)>this.rz+b.radius){b.waterEntered=false;b.waterX=undefined;b.waterZ=undefined;continue;}
   updateShape(b);let volume=0,total=0;
   for(const shape of b.shapes){
    const q=shape.position,r=shape.radius,full=4/3*Math.PI*r*r*r;total+=full;const level=this.surface(q.x,q.z);if(!Number.isFinite(level))continue;
    const h=clamp(level-q.y+r,0,2*r),cap=Math.PI*h*h*(r-h/3);volume+=cap;
    if(b.inverseMass&&cap>0&&!b.sleeping){const force=9.81*this.density*cap,impulse=force*dt;b.velocity.y+=impulse*b.inverseMass;
     this.offset.subVectors(q,b.position);b.angularVelocity.x+=-this.offset.z*impulse*b.inverseInertia;b.angularVelocity.z+=this.offset.x*impulse*b.inverseInertia;
    }
   }
   const fraction=clamp(volume/Math.max(1e-8,total));b.submersion=fraction;if(!fraction){b.waterEntered=false;b.waterX=undefined;b.waterZ=undefined;continue;}
   b.wetness=Math.min(1,b.wetness+dt*5*fraction);b.temperature*=Math.exp(-3*fraction*dt);b.snow=Math.max(0,b.snow-.4*fraction*dt);this.wetGround(b.position.x,b.position.z,.2);
   if(b.inverseMass){const drag=Math.exp(-Math.min(7,3*this.density*volume*b.inverseMass+.3*fraction)*dt);b.velocity.multiplyScalar(drag);b.angularVelocity.multiplyScalar(Math.exp(-3*fraction*dt));if(b.sleeping&&this.density*volume>b.mass*1.05)this.world.wake(b);}
   if(b===character)this.characterSubmersion=fraction;
   const moved=Math.hypot(b.position.x-(b.waterX??b.position.x),b.position.z-(b.waterZ??b.position.z)),entry=!b.waterEntered&&fraction>.02;
   if(b.waterX===undefined){b.waterX=b.position.x;b.waterZ=b.position.z;}
   if(fraction>.02)b.waterEntered=true;else if(fraction<.005)b.waterEntered=false;
   if(entry||moved>.28){
    const speed=Math.hypot(b.velocity.x,b.velocity.z),kick=Math.min(.8,.08+Math.abs(b.velocity.y)*.08+speed*.025);
    this.disturb(b.position.x,b.position.z,kick,Math.min(.7,b.minRadius+.2));this.stats.wakes++;
    if(b===character)this.stats.characterWakes++;
    if(entry){this.stats.entries++;if(Math.abs(b.velocity.y)+speed>.6)this.splash(particles,b.position.x,b.position.z,Math.min(2,.5+speed*.2+Math.abs(b.velocity.y)*.15));}
    b.waterX=b.position.x;b.waterZ=b.position.z;
   }
  }
  if(fire.active&&fire.position.y<this.surface(fire.position.x,fire.position.z)+.1)fire.wetness=Math.min(1,fire.wetness+4*dt);
 }
 afterStep(dt,particles,flex){
  for(const b of this.world.bodies)if(b.enabled&&b.wetness>.05&&b.terrainTouch.tick===this.world.stats.ticks)this.wetGround(b.terrainTouch.point.x,b.terrainTouch.point.z,b.wetness*.06);
  for(let i=0;i<particles.capacity;i++){
   if(!particles.alive[i]||particles.kind[i]===PARTICLE.SMOKE)continue;const k=i*3,x=particles.position[k],y=particles.position[k+1],z=particles.position[k+2],kind=particles.kind[i];
   if(kind===PARTICLE.WATER&&y<=this.height(x,z)+particles.size[i]+.015){this.wetGround(x,z,.25);particles.alive[i]=0;continue;}
   if(y>this.surface(x,z)+.01)continue;
   if(kind===PARTICLE.WATER){this.disturb(x,z,.012,.18);this.wetGround(x,z,.1);}
   if(kind===PARTICLE.FLAME||kind===PARTICLE.EMBER){this.stats.quenched++;particles.trails.detach(i);}
   if(particles.snowVolume?.[i]>0)particles.retireSnow(i,'water');else particles.alive[i]=0;
  }
  if(flex){const s=flex.solver,p=s.position;for(let i=0;i<s.count;i++){
   this.flexWet[i]*=Math.exp(-dt/40);if(p[i*3+1]<this.surface(p[i*3],p[i*3+2])){this.flexWet[i]=Math.min(1,this.flexWet[i]+dt*4);for(let j=0;j<3;j++)s.velocity[i*3+j]*=Math.exp(-4*dt);}
  }s.waterWet=this.flexWet;}
 }
 blast(point,{radius,pressureImpulse},particles){
  if(Math.hypot(point.x-this.x,point.z-this.z)>radius+Math.max(this.rx,this.rz))return;
  const strength=Math.min(1,pressureImpulse*.002)*(1-clamp(Math.abs(point.y-this.level)/radius));this.disturb(clamp(point.x,this.x-this.rx*.6,this.x+this.rx*.6),clamp(point.z,this.z-this.rz*.6,this.z+this.rz*.6),strength,Math.min(2,radius*.3));
  this.splash(particles,this.x,this.z,1+strength,16);this.stats.blasts++;
 }
 sync(alpha){
  const n=this.n;for(let row=0;row<n;row++)for(let col=0;col<n;col++){
   const k=row*n+col,o=k*4;this.data[o]=this.h[k];this.data[o+1]=(this.h[row*n+Math.min(n-1,col+1)]-this.h[row*n+Math.max(0,col-1)])/(2*this.dx);this.data[o+2]=(this.h[Math.min(n-1,row+1)*n+col]-this.h[Math.max(0,row-1)*n+col])/(2*this.dz);this.data[o+3]=this.wet[k];
  }this.texture.needsUpdate=true;
  const b=this.float;this.point.lerpVectors(b.previous,b.position,alpha);this.quaternion.copy(b.previousRotation).slerp(b.rotation,alpha);
  for(const r of this.local){this.offset.copy(r.center).applyQuaternion(this.quaternion).add(this.point).toArray(r.s.center);for(let a=0;a<3;a++)this.offset.copy(r.axes[a]).applyQuaternion(this.quaternion).toArray(r.s.axes[a]);
   const grain=.8+.2*Math.sin(r.center.x*49+r.center.z*27),wet=1-.32*(b.wetness??0);r.s.color[0]=.59*grain*wet;r.s.color[1]=.38*grain*wet;r.s.color[2]=.18*grain*wet;
  }
 }
 writePacked(data,centers,start){for(let i=0;i<this.splats.length;i++)writePhysicsSplat(this.splats[i],data,centers,start+i);}
 shader(source){
  return this.shade(source.replace('uniform bool hasWind;',`uniform bool hasWind;\nuniform sampler2D waterLabField;\nuniform vec4 waterLabBounds;\nuniform float waterLabLevel;`));
 }
 shade(source){
  const dynamicWet=source.includes('objectMotionBody')?`if(objectMotionBody>=0.)wet=max(wet,objectMotionRead(int(objectMotionBody)*3+1).w);`:'';
  return source.replace('  vec3 p=(modelViewMatrix*vec4(center.xyz,1.)).xyz;',`  vec2 waterUV=(center.xz-waterLabBounds.xy)/waterLabBounds.zw;
  bool inWaterMap=all(greaterThanEqual(waterUV,vec2(0.)))&&all(lessThanEqual(waterUV,vec2(1.)));
  vec4 waterField=inWaterMap?textureLod(waterLabField,waterUV*(47./48.)+.5/48.,0.):vec4(0.);
  float waterTag=snowSample(splatIndex).w;
  if(waterTag>.403&&waterTag<.411){
    center.y+=waterField.x;
    vec3 wn=normalize(vec3(-waterField.y-.012*sin(center.x*6.+center.z*5.+windTime*1.7),1.,-waterField.z-.012*cos(center.x*4.-center.z*7.-windTime*1.3))),wv=normalize(cameraPosition-center.xyz),sun=normalize(vec3(-.57,.74,.44));
    float fresnel=.04+.96*pow(1.-max(0.,dot(wn,wv)),5.);
    float glint=pow(max(0.,dot(reflect(-sun,wn),wv)),80.);
    paintColor=mix(vec3(.13,.31,.27),vec3(.76,.85,.88),.18+fresnel*.75)+vec3(.95,.91,.74)*glint*.9;
    paintColor*=1.+clamp((waterField.y*.6+waterField.z*.8)*6.,-.22,.22);
    paintColor=mix(paintColor,vec3(.79,.89,.91),smoothstep(.035,.065,abs(waterField.x))*.22);
    axisA.y=waterField.y*axisA.x+waterField.z*axisA.z;axisB.y=waterField.y*axisB.x+waterField.z*axisB.z;axisC=wn*length(axisC);
    opacity*=.78+.22*fresnel;
  }else{
    float wet=0.;
    if(waterTag<.035&&inWaterMap)wet=waterField.w*(1.-smoothstep(waterLabLevel+.01,waterLabLevel+.17,center.y));
    float groundWet=wet;
    ${dynamicWet}
    if(wet>.001&&!softParticle){
      paintColor*=1.-.30*groundWet;
      vec3 wn=normalize(axisC),wv=normalize(cameraPosition-center.xyz),sun=normalize(vec3(-.57,.74,.44));
      float sheen=pow(max(0.,dot(reflect(-sun,wn),wv)),42.);
      paintColor+=vec3(.94,.91,.82)*sheen*wet*.38;
    }
  }
  vec3 p=(modelViewMatrix*vec4(center.xyz,1.)).xyz;`);
 }
 snapshot(){let peak=0,energy=0;for(let i=0;i<this.h.length;i++){peak=Math.max(peak,Math.abs(this.h[i]));energy+=this.h[i]*this.h[i];}return {...this.stats,cells:this.n*this.n,splats:this.splats.length,level:this.level,center:[this.x,this.z],radii:[this.rx,this.rz],peakWave:peak,waveEnergy:energy,characterSubmersion:this.characterSubmersion,floatWetness:this.float.wetness??0};}
 dispose(){this.texture.dispose();this.world.setEnabled(this.float,false);}
}
