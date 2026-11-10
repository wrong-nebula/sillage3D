export const GHIBLI_CAMERA={position:[-27.367772053568206,19.351899312098325,82.64711408603358],target:[-23.004809373094275,-1.2923668443295366,-3.1997907167559134],focalLength:43,fov:34.85972563533566};
export const GHIBLI_ORBIT={pivot:[-25,-1.22,16],degrees:4};

/** Remove only distant outliers beyond the entire limited orbit and its mirror.
 * A circular 38° half cone contains the 43 mm lens at every aspect ratio,
 * diagonal corners included, plus the full ±4° orbit. Another 28 world units
 * cover camera translation and the bake's 20-unit shadow / 6-unit bounce reach.
 * Clouds are retained: they drift into frame later. No density reduction.
 */
export function trimGhibliFrame(splats,layers){
 const p=GHIBLI_CAMERA.position,d=GHIBLI_CAMERA.target.map((v,k)=>v-p[k]),len=Math.hypot(...d),forward=d.map(v=>v/len);
 const angle=38*Math.PI/180,sine=Math.sin(angle),cosine=Math.cos(angle);
 const views=[{p,f:forward},{p:[p[0],2*GHIBLI_ORBIT.pivot[1]-p[1],p[2]],f:[forward[0],-forward[1],forward[2]]}];
 const kept=[],indices=[],report={sourceCount:splats.length,removed:0,layers:{}};
 function visible(s){
  if(s.wind?.[3]===4)return true;
  const radius=3*1.6*Math.hypot(...s.axes.map(a=>Math.hypot(...a)))+(s.skyBackground?8:28)+.8;
  return views.some(({p,f})=>{
   const v=s.center.map((x,k)=>x-p[k]),depth=v.reduce((sum,x,k)=>sum+x*f[k],0),lateral=Math.sqrt(Math.max(0,v.reduce((sum,x)=>sum+x*x,0)-depth*depth));
   return depth>-radius&&lateral*cosine-depth*sine<radius;
  });
 }
 for(const [name,l]of Object.entries(layers)){
  const start=kept.length,sourceCount=l.count;
  for(let i=l.start;i<l.start+l.count;i++)if(visible(splats[i])){if(splats[i].wind)indices.push(kept.length);kept.push(splats[i]);}
  l.start=start;l.count=kept.length-start;l.sourceCount=sourceCount;
  report.layers[name]=sourceCount-l.count;
 }
 report.removed=report.sourceCount-kept.length;report.kept=kept.length;
 return {splats:kept,indices,report};
}
