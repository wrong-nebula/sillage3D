/**
 * Static, camera-independent one-bounce diffuse transport for authored splats.
 *
 * Splat footprints are conservatively sampled into a bounded voxel grid. Each
 * receiver gathers the first visible voxel along a cosine-weighted hemisphere.
 * Returned RGB is incoming irradiance / pi in linear light: receiver albedo is
 * intentionally NOT applied here. Painted source colors approximate reflected
 * radiance; this is a local color-bleed bake, not Three.js VXGI or path tracing.
 */
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
export const srgbToLinear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
export const linearToSrgb=v=>v<=.0031308?v*12.92:1.055*Math.max(0,v)**(1/2.4)-.055;
const clock=()=>globalThis.performance?.now?.()??Date.now();

export function bakeIrradiance(splats,options={}) {
  const started=clock(),irradiance=new Float32Array(splats.length*3),shadow=new Float32Array(splats.length);
  let cellSize=options.cellSize??.65;
  const maxDistance=options.maxDistance??6;
  const shadowDistance=options.shadowDistance??20,shadowRays=Math.round(clamp(options.shadowRays??5,1,16));
  const sunDirection=options.sunDirection??[-.8,1.1,.7],sunLength=Math.hypot(...sunDirection);
  if(sunDirection.length!==3||!sunDirection.every(Number.isFinite)||!Number.isFinite(sunLength)||sunLength<1e-8||!Number.isFinite(shadowDistance)||shadowDistance<=0||!Number.isFinite(shadowRays))throw new Error('Shadow direction, distance and ray count must be finite and nonzero.');
  const sun=sunDirection.map(v=>v/sunLength);
  const rays=Math.round(clamp(options.rays??18,4,64));
  const maxCells=Math.round(clamp(options.maxCells??2_000_000,1000,8_000_000));
  if(!Number.isFinite(cellSize)||cellSize<=0||!Number.isFinite(maxDistance)||maxDistance<=0)throw new Error('Irradiance cell size and distance must be positive and finite.');
  cellSize=Math.max(.1,cellSize);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const sources=[];
  for(let i=0;i<splats.length;i++){
    const s=splats[i];
    if(s.material==='cloud'||s.material==='fog'||s.softParticle)continue;
    if(s.center?.length!==3||s.axes?.length!==3||s.axes.some(a=>a.length!==3)||s.color?.length!==3||![...s.center,...s.axes.flat(),...s.color,s.opacity].every(Number.isFinite))throw new Error(`Invalid irradiance source ${i}`);
    const lengths=s.axes.map(a=>Math.hypot(...a));
    if(lengths.some(v=>v<=0)||s.opacity<=0)continue;
    sources.push({s,i,lengths});
    for(let k=0;k<3;k++){
      const radius=1.65*(Math.abs(s.axes[0][k])+Math.abs(s.axes[1][k]));
      min[k]=Math.min(min[k],s.center[k]-radius);max[k]=Math.max(max[k],s.center[k]+radius);
    }
  }
  if(!sources.length)return {irradiance,shadow,stats:{voxelCount:0,bakeMs:clock()-started,cellSize,rays,maxDistance,gridCells:0,shadowRays,shadowHits:0,shadowDistance}};
  // Empty grid cells cost four bytes. Grow cells, rather than memory, for a
  // pathological world extent. Two cells of padding include normal offsets.
  let origin,dimensions,gridCells;
  do {
    origin=min.map(v=>Math.floor(v/cellSize)*cellSize-2*cellSize);
    dimensions=max.map((v,k)=>Math.ceil((v-origin[k])/cellSize)+3);
    gridCells=dimensions[0]*dimensions[1]*dimensions[2];
    if(gridCells>maxCells)cellSize*=Math.max(1.05,Math.cbrt(gridCells/maxCells)*1.01);
  } while(gridCells>maxCells);
  const [nx,ny,nz]=dimensions,xy=nx*ny,grid=new Int32Array(gridCells);
  const red=[],green=[],blue=[],normalX=[],normalY=[],normalZ=[],weight=[];
  const inverseCell=1/cellSize,support=1.65;
  function stamp(x,y,z,n0,n1,n2,r,g,b,w){
    const ix=Math.floor((x-origin[0])*inverseCell),iy=Math.floor((y-origin[1])*inverseCell),iz=Math.floor((z-origin[2])*inverseCell);
    if(ix<0||iy<0||iz<0||ix>=nx||iy>=ny||iz>=nz)return;
    const address=ix+iy*nx+iz*xy;
    let id=grid[address]-1;
    if(id<0){id=weight.length;grid[address]=id+1;red.push(0);green.push(0);blue.push(0);normalX.push(0);normalY.push(0);normalZ.push(0);weight.push(0);}
    red[id]+=r*w;green[id]+=g*w;blue[id]+=b*w;
    normalX[id]+=n0*w;normalY[id]+=n1*w;normalZ[id]+=n2*w;weight[id]+=w;
  }
  for(const {s,lengths}of sources){
    const [u,v,n]=s.axes,p=s.center;
    const r=srgbToLinear(clamp(s.color[0])),g=srgbToLinear(clamp(s.color[1])),b=srgbToLinear(clamp(s.color[2]));
    const n0=n[0]/lengths[2],n1=n[1]/lengths[2],n2=n[2]/lengths[2];
    const along=Math.max(1,Math.min(24,Math.ceil(2*support*lengths[0]/(cellSize*.65))));
    const across=Math.max(1,Math.min(24,Math.ceil(2*support*lengths[1]/(cellSize*.65))));
    for(let j=0;j<=along;j++)for(let k=0;k<=across;k++){
      const a=along===1?0:(j/along*2-1)*support;
      const c=across===1?0:(k/across*2-1)*support;
      if(a*a+c*c>support*support)continue;
      const w=clamp(s.opacity)*Math.exp(-.5*(a*a+c*c));
      stamp(p[0]+u[0]*a+v[0]*c,p[1]+u[1]*a+v[1]*c,p[2]+u[2]*a+v[2]*c,n0,n1,n2,r,g,b,w);
    }
    // Always include the center (a short axis can leave no interior grid point).
    stamp(...p,n0,n1,n2,r,g,b,clamp(s.opacity));
  }
  for(let id=0;id<weight.length;id++){
    red[id]/=weight[id];green[id]/=weight[id];blue[id]/=weight[id];
    const n=Math.hypot(normalX[id],normalY[id],normalZ[id]);
    if(n>1e-5){normalX[id]/=n;normalY[id]/=n;normalZ[id]/=n;}
  }
  const directions=Array.from({length:rays},(_,i)=>{
    const radius=Math.sqrt((i+.5)/rays),phi=i*2.399963229728653;
    return [radius*Math.cos(phi),radius*Math.sin(phi),Math.sqrt(1-radius*radius)];
  });
  let hits=0;
  for(const {s,i,lengths}of sources){
    const p=s.center,n=s.axes[2].map(v=>v/lengths[2]);
    // Duff et al. orthonormal basis, independent of camera and brush rotation.
    const sign=n[2]>=0?1:-1,a=-1/(sign+n[2]),b=n[0]*n[1]*a;
    const tangent=[1+sign*n[0]*n[0]*a,sign*b,-sign*n[0]];
    const bitangent=[b,sign+n[1]*n[1]*a,-n[1]];
    const offset=cellSize*.85+Math.min(lengths[2],cellSize)*.25;
    const ox=p[0]+n[0]*offset,oy=p[1]+n[1]*offset,oz=p[2]+n[2]*offset;
    const cellX=Math.floor((ox-origin[0])*inverseCell),cellY=Math.floor((oy-origin[1])*inverseCell),cellZ=Math.floor((oz-origin[2])*inverseCell);
    if(cellX<0||cellY<0||cellZ<0||cellX>=nx||cellY>=ny||cellZ>=nz)continue;
    const selfX=Math.floor((p[0]-origin[0])*inverseCell),selfY=Math.floor((p[1]-origin[1])*inverseCell),selfZ=Math.floor((p[2]-origin[2])*inverseCell);
    const selfVoxel=grid[selfX+selfY*nx+selfZ*xy]-1;
    let ir=0,ig=0,ib=0;
    for(const local of directions){
      const dx=tangent[0]*local[0]+bitangent[0]*local[1]+n[0]*local[2];
      const dy=tangent[1]*local[0]+bitangent[1]*local[1]+n[1]*local[2];
      const dz=tangent[2]*local[0]+bitangent[2]*local[1]+n[2]*local[2];
      let ix=cellX,iy=cellY,iz=cellZ,t=0;
      const sx=dx>=0?1:-1,sy=dy>=0?1:-1,sz=dz>=0?1:-1;
      const stepX=cellSize/Math.abs(dx),stepY=cellSize/Math.abs(dy),stepZ=cellSize/Math.abs(dz);
      let tx=Math.abs(dx)<1e-12?Infinity:(origin[0]+(ix+(sx>0?1:0))*cellSize-ox)/dx;
      let ty=Math.abs(dy)<1e-12?Infinity:(origin[1]+(iy+(sy>0?1:0))*cellSize-oy)/dy;
      let tz=Math.abs(dz)<1e-12?Infinity:(origin[2]+(iz+(sz>0?1:0))*cellSize-oz)/dz;
      while(t<maxDistance){
        const id=grid[ix+iy*nx+iz*xy]-1;
        if(id>=0&&!(id===selfVoxel&&t<cellSize*2)){
          // A hit blocks later surfaces even if its back face emits no light.
          // Lambertian outgoing radiance has no extra cosine factor; hemisphere
          // cosine weighting is already accounted for by the sampling PDF.
          const facing=-(normalX[id]*dx+normalY[id]*dy+normalZ[id]*dz);
          if(facing>.015){
            const distance=t+offset,falloff=1/(1+(distance/(maxDistance*.55))**2);
            const edge=clamp((maxDistance-distance)/(cellSize*2));
            const gain=falloff*edge/rays;
            ir+=red[id]*gain;ig+=green[id]*gain;ib+=blue[id]*gain;hits++;
          }
          break;
        }
        if(tx<=ty&&tx<=tz){t=tx;tx+=stepX;ix+=sx;if(ix<0||ix>=nx)break;}
        else if(ty<=tz){t=ty;ty+=stepY;iy+=sy;if(iy<0||iy>=ny)break;}
        else {t=tz;tz+=stepZ;iz+=sz;if(iz<0||iz>=nz)break;}
      }
    }
    irradiance[i*3]=ir;irradiance[i*3+1]=ig;irradiance[i*3+2]=ib;
  }
  // Directional visibility is a separate pass: changing shadow settings never
  // changes the previously baked incoming RGB. The cone gives a small area-sun
  // penumbra; the normal-facing term includes the object's own unlit side.
  const sunSign=sun[2]>=0?1:-1,sunA=-1/(sunSign+sun[2]),sunB=sun[0]*sun[1]*sunA;
  const sunTangent=[1+sunSign*sun[0]*sun[0]*sunA,sunSign*sunB,-sunSign*sun[0]];
  const sunBitangent=[sunB,sunSign+sun[1]*sun[1]*sunA,-sun[1]];
  const coneAngle=.075;
  const sunRays=Array.from({length:shadowRays},(_,i)=>{
    const radius=i===0?0:Math.tan(coneAngle)*Math.sqrt((i-.5)/Math.max(1,shadowRays-1));
    const phi=i*2.399963229728653,cx=radius*Math.cos(phi),cy=radius*Math.sin(phi);
    const d=sun.map((v,k)=>v+sunTangent[k]*cx+sunBitangent[k]*cy),length=Math.hypot(...d);
    return d.map(v=>v/length);
  });
  function sunBlocked(ox,oy,oz,dx,dy,dz,selfVoxel){
    let ix=Math.floor((ox-origin[0])*inverseCell),iy=Math.floor((oy-origin[1])*inverseCell),iz=Math.floor((oz-origin[2])*inverseCell),t=0;
    if(ix<0||iy<0||iz<0||ix>=nx||iy>=ny||iz>=nz)return false;
    const sx=dx>=0?1:-1,sy=dy>=0?1:-1,sz=dz>=0?1:-1;
    const stepX=cellSize/Math.abs(dx),stepY=cellSize/Math.abs(dy),stepZ=cellSize/Math.abs(dz);
    let tx=Math.abs(dx)<1e-12?Infinity:(origin[0]+(ix+(sx>0?1:0))*cellSize-ox)/dx;
    let ty=Math.abs(dy)<1e-12?Infinity:(origin[1]+(iy+(sy>0?1:0))*cellSize-oy)/dy;
    let tz=Math.abs(dz)<1e-12?Infinity:(origin[2]+(iz+(sz>0?1:0))*cellSize-oz)/dz;
    while(t<shadowDistance){
      const id=grid[ix+iy*nx+iz*xy]-1;
      // The bias and short self-cell exclusion avoid voxel acne, at the cost
      // of losing some contact shadows thinner than approximately one cell.
      if(id>=0&&!(id===selfVoxel&&t<cellSize*2))return true;
      if(tx<=ty&&tx<=tz){t=tx;tx+=stepX;ix+=sx;if(ix<0||ix>=nx)return false;}
      else if(ty<=tz){t=ty;ty+=stepY;iy+=sy;if(iy<0||iy>=ny)return false;}
      else {t=tz;tz+=stepZ;iz+=sz;if(iz<0||iz>=nz)return false;}
    }
    return false;
  }
  let shadowHits=0,shadowTests=0;
  for(const {s,i,lengths}of sources){
    const p=s.center,n=s.axes[2].map(v=>v/lengths[2]);
    const cosine=n[0]*sun[0]+n[1]*sun[1]+n[2]*sun[2];
    const lightFacing=clamp((cosine+.12)/.67);
    const facingShadow=1-lightFacing*lightFacing*(3-2*lightFacing);
    if(facingShadow>.999){shadow[i]=1;continue;}
    const offset=cellSize*1.2+Math.min(lengths[2],cellSize)*.25;
    const ox=p[0]+n[0]*offset,oy=p[1]+n[1]*offset,oz=p[2]+n[2]*offset;
    const ix=Math.floor((p[0]-origin[0])*inverseCell),iy=Math.floor((p[1]-origin[1])*inverseCell),iz=Math.floor((p[2]-origin[2])*inverseCell);
    const selfVoxel=grid[ix+iy*nx+iz*xy]-1;
    let blocked=0;
    for(const [dx,dy,dz]of sunRays){
      if(sunBlocked(ox,oy,oz,dx,dy,dz,selfVoxel)){blocked++;shadowHits++;}
      shadowTests++;
    }
    shadow[i]=facingShadow+(1-facingShadow)*blocked/shadowRays;
  }
  return {irradiance,shadow,stats:{voxelCount:weight.length,bakeMs:clock()-started,cellSize,rays,maxDistance,gridCells,hits,shadowRays,shadowHits,shadowTests,shadowDistance}};
}
