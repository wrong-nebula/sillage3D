const clamp=x=>Math.max(0,Math.min(1,x));
const unit=v=>{const length=Math.hypot(...v)||1;return v.map(x=>x/length);};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const mix=(a,b,t)=>a.map((v,k)=>v*(1-t)+b[k]*t);
const KEY=unit([-.65,.85,1]),FILL=unit([.8,.2,-.65]);
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

/** Analytic rectangular studio lights reflected in the actual surface normal.
 * This is a bounded material study, not an environment-map or ray-tracing pass.
 * The same stationary lights illuminate every surface and every camera angle. */
function studioReflection(ray,roughness,brushed,grain){
  const azimuth=Math.atan2(ray[0],ray[2]),elevation=Math.asin(clamp((ray[1]+1)*.5)*2-1);
  const width=.14+roughness*.65,height=.95+roughness*.6;
  const softbox=Math.exp(-1*(((azimuth+.65)/width)**2+((elevation-.36)/height)**6));
  const top=Math.exp(-1*(((elevation-1.03)/(.13+roughness*.5))**2+(azimuth/1.5)**6));
  const cool=Math.exp(-1*(((azimuth-1.05)/(.10+roughness*.55))**2+((elevation+.05)/.85)**4));
  const warm=Math.exp(-1*(((azimuth+2.3)/(.2+roughness*.5))**2+(elevation/.65)**4));
  const texture=brushed?.91+.09*grain:1;
  return [0,1,2].map(k=>(.007+softbox*3.3+top*1.4+cool*[.22,.7,1.2][k]+warm*[.8,.32,.12][k])*texture);
}

export function labMaterialColor(profile,point,normal,view){
  const n=unit(normal),v=unit(view),nv=clamp(dot(n,v)),reflection=n.map((x,k)=>2*nv*x-v[k]);
  const pigment=profile.color.match(/[\da-f]{2}/gi).map(x=>(parseInt(x,16)/255)**2.2);
  const field=.5+.5*Math.sin(point[0]*2.7+Math.sin(point[1]*3.1)+point[2]*4.3);
  const grain=.5+.5*Math.sin(point[1]*91+Math.sin(point[0]*8)*2);
  const roughness=profile.kind==='brushed'?.32:profile.roughness;
  const environment=studioReflection(reflection,roughness,profile.kind==='brushed',grain);
  const key=clamp(dot(n,KEY)),fill=clamp(dot(n,FILL)),fresnel=(1-nv)**5;
  const diffuse=pigment.map((c,k)=>c*(.045+key*.82+fill*[.08,.18,.24][k]));
  let result;
  if(['metal','brushed','chrome','iridescent','copper'].includes(profile.kind)){
    let reflectance=profile.kind==='chrome'?[.91,.94,.98]:profile.kind==='brushed'?[.52,.61,.68]:[1,.72,.28];
    if(profile.kind==='iridescent'){
      const thickness=330+field*210,angle=Math.sqrt(1-(1-nv*nv)/(1.45*1.45));
      reflectance=[650,550,460].map(wavelength=>.13+.84*(.5+.5*Math.cos(4*Math.PI*1.45*thickness*angle/wavelength)));
    }
    if(profile.kind==='copper')reflectance=[.95,.55,.3];
    const metal=environment.map((light,k)=>light*(reflectance[k]+(1-reflectance[k])*fresnel)+diffuse[k]*.035);
    if(profile.kind==='copper'){
      const oxide=smooth(.37,.65,field),verdigris=[.025,.29,.21].map(c=>c*(.17+key*.8+fill*.25));
      result=mix(metal,verdigris,oxide*.95);
    }else result=metal;
  }else if(profile.kind==='jade'){
    const wrapped=clamp((dot(n,KEY)+.65)/1.65),transmission=clamp(-dot(n,FILL));
    result=pigment.map((c,k)=>c*(.12+wrapped*.9+transmission*.95)+environment[k]*(.045+.45*fresnel));
  }else if(profile.kind==='ceramic'){
    const cobalt=smooth(.96,.995,.5+.5*Math.sin(point[1]*5+point[0]*2))*smooth(.35,.7,field);
    result=diffuse.map((c,k)=>c*(1-cobalt*.7)+cobalt*[.008,.025,.09][k]+environment[k]*(.065+.6*fresnel));
  }else{
    const pores=.92+.08*Math.sin(point[0]*38+point[2]*53)*Math.sin(point[1]*47);
    result=diffuse.map(c=>c*pores);
  }
  return result.map(c=>clamp(Math.max(0,c)/(1+Math.max(0,c)*.65))**(1/2.2));
}
