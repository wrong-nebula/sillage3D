import {srgbToLinear} from './irradiance.js';

const spheres=[[-1.1,.42,2,.41],[0,.42,2,.41],[1.1,.42,2,.41]];
function occluded(x,y,z,dx,dy,dz,distance){
  for(const [cx,cy,cz,r] of spheres){
    const ox=x-cx,oy=y-cy,oz=z-cz,b=ox*dx+oy*dy+oz*dz,c=ox*ox+oy*oy+oz*oz-r*r,h=b*b-c;
    if(h>0){const t=-b-Math.sqrt(h);if(t>.045&&t<distance-.06)return true;}
  }
  // Conservative sphere tracing of the ring gives smooth area-light penumbrae
  // without a voxel grid or random per-splat transport samples.
  let t=.045;
  for(let step=0;step<24&&t<distance-.06;step++){
    const px=x+dx*t,py=y+dy*t-1.8,pz=z+dz*t;
    const d=Math.hypot(Math.hypot(px,py)-1.1,pz)-.37;
    if(d<.009)return true;
    t+=Math.max(.025,d*.9);
  }
  return false;
}

/** Deterministic one-bounce integration for this finite two-reflector study.
 * The warm/cool fields are cached once; display controls only reweight them. */
export function bakeStudioBounce(splats){
  const started=performance.now(),count=splats.length,warm=new Float32Array(count*3),cool=new Float32Array(count*3),shadow=new Float32Array(count),irradiance=new Float32Array(count*3);
  const sourceColors=[[.969,.522,.341],[.314,.835,.91]].map(rgb=>rgb.map(srgbToLinear)),patches=[];
  for(let side=0;side<2;side++)for(let row=0;row<6;row++)for(let col=0;col<5;col++){
    const sign=side===0?-1:1,z=-2.5+(col+.5)*3.5/5;
    const length=Math.hypot(1,.32);
    patches.push({side,x:sign*(2.25+.32*z),y:(row+.5)*3.5/6,z,nx:-sign/length,nz:.32/length,area:3.5*3.5*length/30});
  }
  for(let i=0;i<count;i++){
    const s=splats[i];if(s.bounceEmitter)continue;
    const axis=s.axes[2],length=Math.hypot(...axis),nx=axis[0]/length,ny=axis[1]/length,nz=axis[2]/length;
    const x=s.center[0]+nx*.035,y=s.center[1]+ny*.035,z=s.center[2]+nz*.035;
    let directVisibility=0;
    for(const shift of [-.08,0,.08]){
      const sx=-.45+shift,sy=.8,sz=.6-shift,length=Math.hypot(sx,sy,sz);
      if(!occluded(x,y,z,sx/length,sy/length,sz/length,8))directVisibility++;
    }
    for(let c=0;c<3;c++)s.color[c]*=.78*(.55+.45*directVisibility/3);
    let visible=0,total=0;
    for(const patch of patches){
      let dx=patch.x-x,dy=patch.y-y,dz=patch.z-z;const d2=dx*dx+dy*dy+dz*dz,d=Math.sqrt(d2);dx/=d;dy/=d;dz/=d;
      const cosine=Math.max(0,nx*dx+ny*dy+nz*dz)*Math.max(0,-patch.nx*dx-patch.nz*dz);
      if(cosine<=0)continue;
      const weight=cosine*patch.area/(Math.PI*d2+patch.area);total+=weight;
      if(occluded(x,y,z,dx,dy,dz,d))continue;
      visible+=weight;
      const target=patch.side===0?warm:cool,color=sourceColors[patch.side];
      for(let c=0;c<3;c++)target[i*3+c]+=color[c]*weight*1.5;
    }
    shadow[i]=total>0?1-visible/total:0;
  }
  const lighting={irradiance,warm,cool,shadow,stats:{bakeMs:performance.now()-started,patches:patches.length,method:'area-patch'}};
  balanceStudioBounce(lighting,.5);return lighting;
}

export function balanceStudioBounce(lighting,balance=.5,prepared){
  const mix=Math.max(0,Math.min(1,Number.isFinite(balance)?balance:.5));
  for(let i=0;i<lighting.irradiance.length;i++){
    const light=lighting.warm[i]*2*(1-mix)+lighting.cool[i]*2*mix;
    lighting.irradiance[i]=light;
    if(prepared)prepared.bounce[i]=Math.sqrt(prepared.linear[i])*light*1.5;
  }
  lighting.balance=mix;
}
