import {DataTexture,RGBAFormat,FloatType,UnsignedByteType,LinearFilter,ClampToEdgeWrapping,Vector2,Vector3,Vector4} from 'three';

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const KINDS=['snow','sand','mud'];
const texture=(data,nx,nz,type)=>{
  const t=new DataTexture(data,nx,nz,RGBAFormat,type);
  t.minFilter=t.magFilter=LinearFilter;t.wrapS=t.wrapT=ClampToEdgeWrapping;t.generateMipmaps=false;t.needsUpdate=true;return t;
};

/** Finite-volume surface columns, not individual rigid grains. Amounts are
 * loose-equivalent metres; packing changes pore space, never solid volume.
 * A striped conservative relaxation has a fixed work budget per physics tick.
 * The same bilinear displacement drives terrain collision, IK and rendering.
 */
export class GroundMaterials{
  constructor(height,{bounds=[-30,30,-28,28],spacing=.25,rowsPerTick=8,maxDepth=1.2,snowRate=.012}={}){
    if(!(spacing>=.125&&spacing<=2)||!Number.isInteger(rowsPerTick)||rowsPerTick<1||rowsPerTick>32||!(maxDepth>0&&maxDepth<=3)||!(snowRate>=0&&Number.isFinite(snowRate))||bounds.length!==4||!bounds.every(Number.isFinite)||bounds[1]<=bounds[0]||bounds[3]<=bounds[2])throw new RangeError('Invalid material field budget');
    this.bounds=[...bounds];this.nx=Math.ceil((bounds[1]-bounds[0])/spacing)+1;this.nz=Math.ceil((bounds[3]-bounds[2])/spacing)+1;
    if(this.nx*this.nz>220000)throw new RangeError('Material field exceeds cell budget');
    this.dx=(bounds[1]-bounds[0])/(this.nx-1);this.dz=(bounds[3]-bounds[2])/(this.nz-1);this.area=this.dx*this.dz;
    this.rowsPerTick=rowsPerTick;this.maxDepth=maxDepth;this.snowRate=snowRate;this.baseHeight=height;
    const count=this.nx*this.nz;
    this.amount=KINDS.map(()=>new Float32Array(count));this.snowPack=new Float32Array(count);this.sandPack=new Float32Array(count);this.wet=new Float32Array(count);
    this.base=new Float32Array(count);this.depth=new Float32Array(count);this.blocked=new Uint8Array(count);this.pond=new Uint8Array(count);
    for(let row=0;row<this.nz;row++)for(let col=0;col<this.nx;col++)this.base[row*this.nx+col]=height(bounds[0]+col*this.dx,bounds[2]+row*this.dz);
    this.rowFlux=new Float64Array(this.nz);this.rowTime=new Float64Array(this.nz);this.row=0;this.flux=0;this.time=0;this.revision=0;this.dirty=false;this.uploadClock=0;this.maskClock=1;
    this.totals=[0,0,0];this.stats={deposited:[0,0,0],melted:0,drained:[0,0,0],rejected:0,compactions:0,footsteps:0,blasts:0,transported:0,cellsVisited:0,uploads:0,cpuMs:0};
    this.data=new Float32Array(count*4);this.appearance=new Uint8Array(count*4);
    this.texture=texture(this.data,this.nx,this.nz,FloatType);this.appearanceTexture=texture(this.appearance,this.nx,this.nz,UnsignedByteType);
    this.uniforms={groundMaterialMap:{value:this.texture},groundAppearanceMap:{value:this.appearanceTexture},groundMaterialBounds:{value:new Vector4(bounds[0],bounds[2],bounds[1]-bounds[0],bounds[3]-bounds[2])},groundMaterialSize:{value:new Vector2(this.nx,this.nz)}};
    this.scratch={snow:0,sand:0,mud:0,packing:0,wetness:0,depth:0};this.material='snow';this.previousFoot=null;this.walkDistance=0;this.footIndex=0;
    this.windPoint=new Vector3();this.windVelocity=new Vector3();
    // Reused local stencil storage. Large blasts/deposits cannot allocate or
    // expand into a full-field solve while the simulation is running.
    this.indices=new Int32Array(4096);this.weights=new Float64Array(4096);
  }
  sample(array,x,z,packing=null,density=0){
    const b=this.bounds;if(x<b[0]||x>b[1]||z<b[2]||z>b[3])return 0;
    const u=(x-b[0])/this.dx,v=(z-b[2])/this.dz,c=Math.min(this.nx-2,Math.floor(u)),r=Math.min(this.nz-2,Math.floor(v)),a=u-c,d=v-r,k=r*this.nx+c;
    if(!packing)return (array[k]*(1-a)+array[k+1]*a)*(1-d)+(array[k+this.nx]*(1-a)+array[k+this.nx+1]*a)*d;
    return (array[k]/(1+density*packing[k])*(1-a)+array[k+1]/(1+density*packing[k+1])*a)*(1-d)+(array[k+this.nx]/(1+density*packing[k+this.nx])*(1-a)+array[k+this.nx+1]/(1+density*packing[k+this.nx+1])*a)*d;
  }
  height(x,z){return this.baseHeight(x,z)+this.sample(this.depth,x,z);}
  snowDepth(x,z){return this.sample(this.amount[0],x,z,this.snowPack,1.8);}
  at(x,z,out={}){
    out.snow=this.snowDepth(x,z);out.sand=this.sample(this.amount[1],x,z,this.sandPack,.25);out.mud=this.sample(this.amount[2],x,z);
    out.depth=this.sample(this.depth,x,z);out.wetness=this.sample(this.wet,x,z);out.packing=this.sample(out.snow>.005?this.snowPack:this.sandPack,x,z);return out;
  }
  contact(x,z,out){
    const m=this.at(x,z,this.scratch);
    out.friction=m.snow>.008?.9-.66*m.packing:m.mud>.008?.95-.55*m.wetness:m.sand>.008?1.1:.7;
    out.restitution=m.snow>.008?.12:m.mud>.008?.06:.2;return out;
  }
  updateDepth(k){this.depth[k]=this.amount[0][k]/(1+1.8*this.snowPack[k])+this.amount[1][k]/(1+.25*this.sandPack[k])+this.amount[2][k];this.dirty=true;}
  set(k,kind,value){const a=this.amount[kind],before=a[k];a[k]=Math.max(0,value);const delta=(a[k]-before)*this.area;this.totals[kind]+=delta;if(delta)this.updateDepth(k);return delta;}
  capacity(k){return Math.max(0,this.maxDepth-this.amount[0][k]-this.amount[1][k]-this.amount[2][k]);}
  add(k,kind,depth){
    const old=this.amount[kind][k],n=Math.min(Math.max(0,depth),this.capacity(k));
    if(!n)return 0;
    const pack=kind===0?this.snowPack:kind===1?this.sandPack:null;if(pack)pack[k]*=old/(old+n);
    return this.set(k,kind,old+n);
  }
  stencil(x,z,radius,ring=false){
    const b=this.bounds,n=this.nx;let count=0,total=0;
    const loX=clamp(Math.floor((x-radius-b[0])/this.dx),0,n-1),hiX=clamp(Math.ceil((x+radius-b[0])/this.dx),0,n-1);
    const loZ=clamp(Math.floor((z-radius-b[2])/this.dz),0,this.nz-1),hiZ=clamp(Math.ceil((z+radius-b[2])/this.dz),0,this.nz-1);
    for(let r=loZ;r<=hiZ;r++)for(let c=loX;c<=hiX;c++){
      const k=r*n+c,q=(((b[0]+c*this.dx-x)/radius)**2+((b[2]+r*this.dz-z)/radius)**2);
      if(q>1||this.blocked[k]||this.pond[k]||count===this.indices.length)continue;
      const w=ring?Math.exp(-40*(Math.sqrt(q)-.8)**2):Math.exp(-3*q);this.indices[count]=k;this.weights[count++]=w;total+=w;
    }return {count,total};
  }
  deposit(kind,x,z,{volume=.8,radius=1.6,immediate=true}={}){
    const type=KINDS.indexOf(kind);if(type<0||![x,z,volume,radius].every(Number.isFinite)||volume<0||radius<=0)throw new RangeError('Invalid deposit');
    radius=clamp(radius,.3,4);const {count,total}=this.stencil(x,z,radius);let added=0;
    if(total)for(let i=0;i<count;i++){const k=this.indices[i];added+=this.add(k,type,volume*this.weights[i]/total/this.area);if(type===2)this.wet[k]=1;}
    this.stats.deposited[type]+=added;this.stats.rejected+=Math.max(0,volume-added);if(added){this.revision++;if(immediate)this.sync(0,true);}return added;
  }
  transfer(from,to,kind,depth){
    if(depth<=0||this.blocked[to]||this.pond[to])return;
    const n=Math.min(depth,this.amount[kind][from],this.capacity(to));if(n<1e-9)return;
    const pack=kind===0?this.snowPack:kind===1?this.sandPack:null,old=this.amount[kind][to];
    if(pack)pack[to]=(pack[to]*old+pack[from]*n)/(old+n);
    this.wet[to]=Math.max(this.wet[to],this.wet[from]*.9);
    this.set(from,kind,this.amount[kind][from]-n);this.set(to,kind,old+n);this.stats.transported+=n*this.area;
  }
  compact(x,z,radius,pressure,dt){
    radius=clamp(radius,.24,1.3);const {count}=this.stencil(x,z,radius);let changed=false;
    const rate=1-Math.exp(-Math.min(40,Math.max(0,pressure))*dt);
    for(let i=0;i<count;i++){
      const k=this.indices[i],w=this.weights[i],s=this.amount[0][k],a=this.amount[1][k];
      if(s+a<.001)continue;
      const before=this.depth[k];this.snowPack[k]+=(1-this.snowPack[k])*rate*w;this.sandPack[k]+=(1-this.sandPack[k])*rate*w*.5;this.updateDepth(k);
      changed ||= Math.abs(before-this.depth[k])>1e-7;
    }
    if(changed){this.stats.compactions++;this.revision++;}
    // Yielding mud moves aside instead of disappearing. Sand/snow primarily
    // compress here; their slopes subsequently slump through the same fluxes.
    if(this.sample(this.amount[2],x,z)>.008&&rate>0)this.displace(x,z,radius,Math.min(.12,rate*.15),2);
  }
  displace(x,z,radius,fraction,onlyKind=-1){
    // Local outward transport, limited to 4096 source cells and three layers.
    const b=this.bounds,n=this.nx,reach=Math.min(4,radius),{count}=this.stencil(x,z,reach);let moved=0;
    for(let i=0;i<count;i++){
      const k=this.indices[i],r=Math.floor(k/n),c=k%n,dx=b[0]+c*this.dx-x,dz=b[2]+r*this.dz-z,l=Math.hypot(dx,dz);
      if(l>reach*.7)continue;
      const dirX=l>.05?dx/l:.6,dirZ=l>.05?dz/l:.8;
      const targetX=Math.round((x+dirX*reach*.93-b[0])/this.dx),targetZ=Math.round((z+dirZ*reach*.93-b[2])/this.dz);
      if(targetX<0||targetX>=n||targetZ<0||targetZ>=this.nz)continue;const to=targetZ*n+targetX;
      for(let kind=0;kind<3;kind++)if(onlyKind<0||kind===onlyKind){const before=this.amount[kind][k];this.transfer(k,to,kind,before*fraction*(1-l/reach));moved+=before-this.amount[kind][k];}
    }if(moved)this.revision++;return moved*this.area;
  }
  blast(point,{radius=5,pressureImpulse=300}={}){
    const r=Math.min(4,Math.max(.3,radius)),height=this.height(point.x,point.z),falloff=clamp(1-Math.abs(point.y-height)/(r+1));
    if(!falloff)return 0;this.stats.blasts++;const moved=this.displace(point.x,point.z,r,clamp(pressureImpulse/800,0,.8)*falloff);if(moved)this.sync(0,true);return moved;
  }
  capture(world,dt){
    // One representative terrain touch per body, independent of contact/lobe
    // iteration count. Sleeping objects retain their compacted support.
    let budget=192;
    for(const body of world.bodies){const t=body.terrainTouch;
      if(!body.enabled||!body.inverseMass||t.tick!==world.stats.ticks||t.revision!==body.revision||!budget)continue;
      budget--;const radius=Math.max(.26,Math.min(1.2,t.radius*.7));
      this.compact(t.point.x,t.point.z,radius,body.mass/Math.max(.2,radius*radius)*3+Math.min(15,t.energy*.08),dt);
    }
  }
  footsteps(dt,crow){
    const c=crow.controller,p=c.position;
    if(!c.grounded){this.previousFoot=null;this.walkDistance=0;return;}
    if(this.previousFoot){const distance=Math.hypot(p.x-this.previousFoot.x,p.z-this.previousFoot.z);if(distance<1.5)this.walkDistance+=distance;else this.walkDistance=0;}
    if(this.walkDistance>=.46){
      this.walkDistance%=.46;const side=this.footIndex++%2,foot=crow.footPlant?.legs[side]?.position,near=foot&&Math.hypot(foot.x-p.x,foot.z-p.z)<1.5;
      const x=near?foot.x:p.x+Math.cos(c.yaw)*(side?.22:-.22),z=near?foot.z:p.z-Math.sin(c.yaw)*(side?.22:-.22);
      this.compact(x,z,.38,18,.12);this.stats.footsteps++;
    }
    if(!this.previousFoot)this.previousFoot={x:p.x,z:p.z};else{this.previousFoot.x=p.x;this.previousFoot.z=p.z;}
  }
  refreshMask(world,water){
    this.blocked.fill(0);const b=this.bounds,n=this.nx;
    // A coarse vertical projection prevents precipitation appearing inside
    // rocks. This field represents the ground only, not overhanging snow caps.
    for(const body of world?.bodies??[]){
      if(!body.enabled||body.isCharacter||body.isWaterFloat||body.position.y-body.radius>this.height(body.position.x,body.position.z)+1)continue;
      for(const shape of body.shapes){const p=shape.position,radius=shape.radius*.8;
        const x0=clamp(Math.floor((p.x-radius-b[0])/this.dx),0,n-1),x1=clamp(Math.ceil((p.x+radius-b[0])/this.dx),0,n-1),z0=clamp(Math.floor((p.z-radius-b[2])/this.dz),0,this.nz-1),z1=clamp(Math.ceil((p.z+radius-b[2])/this.dz),0,this.nz-1);
        for(let r=z0;r<=z1;r++)for(let c=x0;c<=x1;c++)if((b[0]+c*this.dx-p.x)**2+(b[2]+r*this.dz-p.z)**2<radius*radius)this.blocked[r*n+c]=1;
      }
    }
    if(water&&!this.pondReady){for(let r=0;r<this.nz;r++)for(let c=0;c<n;c++)this.pond[r*n+c]=water.contains(b[0]+c*this.dx,b[2]+r*this.dz)?1:0;this.pondReady=true;}
  }
  step(dt,{snow=0,fire=null,world=null,water=null,wind=null}={}){
    if(!(dt>0))return;const started=performance.now();this.time+=dt;this.flux+=clamp(snow)*this.snowRate*dt;this.maskClock+=dt;
    if(this.maskClock>=.5){this.refreshMask(world,water);this.maskClock=0;}
    let visited=0;const n=this.nx,b=this.bounds;
    const gust=world&&world.time<(wind?.gustUntil??-1);
    if(gust)wind.sample(this.windPoint.set((b[0]+b[1])*.5,0,(b[2]+b[3])*.5),world.time,this.windVelocity);
    const windX=this.windVelocity.x,windZ=this.windVelocity.z,windSum=Math.abs(windX)+Math.abs(windZ),windSpeed=Math.hypot(windX,windZ);
    for(let pass=0;pass<this.rowsPerTick;pass++){
      const row=this.row;this.row=(row+1)%this.nz;const elapsed=this.time-this.rowTime[row],precip=this.flux-this.rowFlux[row];this.rowTime[row]=this.time;this.rowFlux[row]=this.flux;
      for(let col=0;col<n;col++){
        const k=row*n+col,x=b[0]+col*this.dx,z=b[2]+row*this.dz;visited++;
        if(!this.pond[k]&&!this.blocked[k]&&precip>0){const v=this.add(k,0,precip);this.stats.deposited[0]+=v;}
        if(this.pond[k]){
          for(let kind=0;kind<3;kind++)if(this.amount[kind][k]){this.stats.drained[kind]+=this.amount[kind][k]*this.area;this.set(k,kind,0);}continue;
        }
        let heat=0;if(fire?.active)heat=fire.intensity*Math.max(0,1-((fire.position.x-x)**2+(fire.position.z-z)**2)/6.25);
        const melt=Math.min(this.amount[0][k],elapsed*((1-clamp(snow))*.0006+heat*.065));
        if(melt>0){this.set(k,0,this.amount[0][k]-melt);this.stats.melted+=melt*this.area;this.wet[k]=Math.min(1,this.wet[k]+melt*12);}
        const oldWet=this.wet[k];this.wet[k]=Math.max(water?.wetAt(x,z)??0,this.wet[k]*Math.exp(-elapsed*(.012+heat*.35)));
        if(Math.abs(oldWet-this.wet[k])>1e-5)this.dirty=true;
        if(this.depth[k]<.0001)continue;
        // Two directed faces per cell; alternating direction each full sweep
        // avoids a fixed downhill or windward bias. Never remove base terrain.
        const reverse=Math.floor(this.time/(this.nz/this.rowsPerTick/120))%2===1;
        const neighborX=col+(reverse?-1:1),neighborZ=row+(reverse?-1:1);
        if(neighborX>=0&&neighborX<n)this.relax(k,row*n+neighborX,this.dx,elapsed);
        if(neighborZ>=0&&neighborZ<this.nz)this.relax(k,neighborZ*n+col,this.dz,elapsed);
        // Only strong gusts entrain exposed loose snow/sand, one grid face at
        // a time. Packed tracks and wet mud resist this surface transport.
        if(gust&&windSum>0&&!this.blocked[k])for(let kind=0;kind<2;kind++){
          const flux=this.amount[kind][k]*(1-(kind?this.sandPack[k]:this.snowPack[k]))*(1-this.wet[k])*Math.min(.025,elapsed*Math.max(0,windSpeed-8)*.008);
          const x=col+Math.sign(windX),z=row+Math.sign(windZ);
          if(x>=0&&x<n)this.transfer(k,row*n+x,kind,flux*Math.abs(windX)/windSum);
          if(z>=0&&z<this.nz)this.transfer(k,z*n+col,kind,flux*Math.abs(windZ)/windSum);
        }
      }
    }
    this.stats.cellsVisited=visited;if(this.dirty)this.revision++;
    if(world){world.terrainRevision=this.revision;for(const body of world.bodies)if(body.enabled&&body.inverseMass){const h=this.height(body.position.x,body.position.z);if(body.sleeping&&Math.abs(h-(body.materialSupportHeight??h))>.008)world.wake(body);if(!body.sleeping||body.materialSupportHeight===undefined)body.materialSupportHeight=h;}}
    this.stats.cpuMs=performance.now()-started;
  }
  relax(a,b,distance,dt){
    if(this.blocked[a]||this.blocked[b]||this.pond[a]||this.pond[b])return;
    const difference=this.base[a]+this.depth[a]-this.base[b]-this.depth[b],from=difference>0?a:b,to=difference>0?b:a;
    for(let kind=0;kind<3;kind++){
      const tangent=kind===0?.78:kind===1?.62:.15+(1-this.wet[from])*.7,excess=Math.abs(difference)-distance*tangent;
      if(excess<=0)continue;
      const density=kind===0?1+1.8*this.snowPack[from]:kind===1?1+.25*this.sandPack[from]:1;
      this.transfer(from,to,kind,Math.min(this.amount[kind][from]*.16,excess*density*.2*Math.min(1,dt*8)));
    }
  }
  sync(dt=0,force=false){
    this.uploadClock+=dt;if(!force&&(!this.dirty||this.uploadClock<.1))return;
    let peak=0,active=0;const n=this.nx;
    for(let row=0;row<this.nz;row++)for(let col=0;col<n;col++){
      const k=row*n+col,o=k*4,d=this.depth[k],snow=this.amount[0][k]/(1+1.8*this.snowPack[k]);
      this.data[o]=d;this.data[o+1]=(this.depth[row*n+Math.min(n-1,col+1)]-this.depth[row*n+Math.max(0,col-1)])/((col===0||col===n-1?1:2)*this.dx);
      this.data[o+2]=(this.depth[Math.min(this.nz-1,row+1)*n+col]-this.depth[Math.max(0,row-1)*n+col])/((row===0||row===this.nz-1?1:2)*this.dz);this.data[o+3]=snow;
      this.appearance[o]=Math.round(clamp(snow/.035)*255);this.appearance[o+1]=Math.round(clamp(this.amount[2][k]/.05)*255);this.appearance[o+2]=Math.round(clamp(this.wet[k])*255);this.appearance[o+3]=Math.round((snow>.003?this.snowPack[k]:this.sandPack[k])*255);
      peak=Math.max(peak,d);if(d>.001)active++;
    }
    this.peak=peak;this.active=active;this.texture.needsUpdate=this.appearanceTexture.needsUpdate=true;this.stats.uploads++;this.uploadClock=0;this.dirty=false;
  }
  clear(){
    for(let kind=0;kind<3;kind++){this.stats.drained[kind]+=this.totals[kind];this.amount[kind].fill(0);this.totals[kind]=0;}
    this.snowPack.fill(0);this.sandPack.fill(0);this.wet.fill(0);this.depth.fill(0);this.rowFlux.fill(this.flux);this.rowTime.fill(this.time);this.revision++;this.dirty=true;this.sync(0,true);
  }
  shader(source){
    return source.replace('uniform bool hasWind;',`uniform bool hasWind;
uniform sampler2D groundMaterialMap;
uniform sampler2D groundAppearanceMap;
uniform vec4 groundMaterialBounds;
uniform vec2 groundMaterialSize;
vec2 materialUV(vec2 p){return ((p-groundMaterialBounds.xy)/groundMaterialBounds.zw*(groundMaterialSize-1.)+.5)/groundMaterialSize;}
vec4 physicalGround(vec2 p){
  vec2 q=(p-groundMaterialBounds.xy)/groundMaterialBounds.zw;
  if(any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.))))return vec4(0.);
  return textureLod(groundMaterialMap,materialUV(p),0.);
}`)
    .replace('float cliffEdge=0.;','float cliffEdge=0.;\n  vec3 originalGroundPigment=paintColor;float originalGroundY=center.y;\n  vec4 accumulatedGround=vec4(0.),accumulatedAppearance=vec4(0.);')
    .replace('smoothstep(.018,.105,localSnowDepth(center.xz))','smoothstep(.002,.025,physicalGround(center.xz).w)')
    .replace('  if(hasWind){',`  // Ground-only override: accumulated thickness replaces the seasonal offset.
  if(snowSample(splatIndex).w>.014&&snowSample(splatIndex).w<.018){
    accumulatedGround=physicalGround(center.xz);
    accumulatedAppearance=textureLod(groundAppearanceMap,materialUV(center.xz),0.);
    vec4 material=accumulatedGround,appearance=accumulatedAppearance;
    center.y=originalGroundY+material.x;
    axisA.y+=dot(axisA.xz,material.yz);axisB.y+=dot(axisB.xz,material.yz);
    axisC=normalize(vec3(axisC.x-material.y*axisC.y,axisC.y,axisC.z-material.z*axisC.y))*length(axisC);
    float light=clamp(dot(normalize(axisC),normalize(vec3(-.797,.343,.494))),0.,1.);
    paintColor=mix(originalGroundPigment,vec3(.30,.22,.14),appearance.y*.85);
    paintColor*=1.-appearance.z*.25*(1.-appearance.x);
    vec3 snow=mix(vec3(.65,.76,.89),vec3(.98,.98,.96),.35+.65*light);
    paintColor=mix(paintColor,snow,appearance.x);
  }
  if(hasWind){`);
  }
  snapshot(){return {mode:'physical-columns',materials:[...KINDS],selected:this.material,resolution:[this.nx,this.nz],spacing:[this.dx,this.dz],rowsPerTick:this.rowsPerTick,cellsPerTick:this.rowsPerTick*this.nx,maxDepth:this.maxDepth,snowRate:this.snowRate,volume:{snow:this.totals[0],sand:this.totals[1],mud:this.totals[2]},peakDepth:this.peak??0,activeCells:this.active??0,textureBytes:this.data.byteLength+this.appearance.byteLength,revision:this.revision,...this.stats,deposited:[...this.stats.deposited],drained:[...this.stats.drained]};}
  dispose(){this.texture.dispose();this.appearanceTexture.dispose();}
}
