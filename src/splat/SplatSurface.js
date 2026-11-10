/** Material response is separate from visibility ordering. In particular,
 * polished metal never gets deliberately unstable transparency sorting. */
const profiles={
  stone:{roughness:.9,metalness:0,sparkle:0},wood:{roughness:.8,metalness:0,sparkle:0},
  foliage:{roughness:.7,metalness:0,sparkle:0},metal:{roughness:.16,metalness:1,sparkle:1},
  'rough-metal':{roughness:.65,metalness:1,sparkle:.35},
};
/** Positive semantic ranges above the existing reef tags. Keep film variation
 * object-anchored without allocating a sixth texel or changing visibility. */
export function splatMaterialSeed(splat){
  const explicit=splat.surfaceType;
  const tag=Number.isInteger(explicit)&&explicit>=17&&explicit<=25?explicit:splat.iridescent?17:splat.jade?18:splat.anisotropic?19:0;
  return tag?tag+Math.max(0,Math.min(.999999,splat.filmPhase??splat.seed)):null;
}
export function splatSurface(splat){
  const base=profiles[splat.material]??profiles.stone,result={};
  for(const key of ['roughness','metalness','sparkle']){
    const value=splat[key]??base[key];if(!Number.isFinite(value))throw new Error(`Invalid surface ${key}.`);
    result[key]=Math.max(key==='roughness'?.04:0,Math.min(1,value));
  }
  // Surface samplers put the normal in the thickness axis. An explicit normal
  // overrides this convention for volumetric/imported Gaussians.
  const normal=splat.surfaceNormal??splat.axes[2],length=Math.hypot(...normal);
  if(normal.length!==3||!normal.every(Number.isFinite)||length<1e-12)throw new Error('A surface response needs a finite nonzero normal.');
  result.normal=normal.map(v=>v/length);return result;
}

/** Object-anchored microfacet orientation. No clock or frame-dependent noise.
 * Broad rough lobes preserve structure; polished metal has narrow glints.
 * This is a bounded artistic highlight layer over the authored display color,
 * not a replacement for the renderer's baked diffuse illumination. */
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);},dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
export function microfacetNormal(normal,seed){
  const n=unit(normal);
  const helper=Math.abs(n[2])<.9?[0,0,1]:[0,1,0],t=unit([n[1]*helper[2]-n[2]*helper[1],n[2]*helper[0]-n[0]*helper[2],n[0]*helper[1]-n[1]*helper[0]]),b=[n[1]*t[2]-n[2]*t[1],n[2]*t[0]-n[0]*t[2],n[0]*t[1]-n[1]*t[0]];
  const angle=seed*6.28318530718,radius=.12*(.35+.65*(seed*17.13%1));
  return unit(n.map((x,i)=>x+radius*(Math.cos(angle)*t[i]+Math.sin(angle)*b[i])));
}
export function surfaceHighlight(color,normal,view,light,{roughness,metalness,sparkle},seed){
  if(sparkle<=0)return [...color];
  let n=microfacetNormal(normal,seed),v=unit(view),l=unit(light);if(dot(n,v)<0)n=n.map(x=>-x);
  // Roughness directly controls this artistic lobe's angular width. Squaring
  // twice would produce sub-sample highlights on the authored coarse splats.
  const h=unit(v.map((x,i)=>x+l[i])),power=Math.min(2048,Math.max(2,2/(roughness**2)-2));
  const highlight=sparkle*(1-roughness)**2*Math.max(0,dot(n,l))*Math.max(0,dot(n,h))**power;
  return color.map(c=>Math.min(1,Math.max(0,c+(1-c)*(.04*(1-metalness)+(.35+.65*c)*metalness)*highlight)));
}
