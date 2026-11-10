/** Identical geometry/pigment with different surface parameters makes temporal
 * highlights inspectable without changing any authored production scene. */
export function createTemporalMaterialStudy(){
  const splats=[],count=900;
  for(const [side,material] of [[-1,'metal'],[1,'stone']])for(let i=0;i<count;i++){
    const z=1-2*(i+.5)/count,angle=i*2.399963229728653,r=Math.sqrt(1-z*z),n=[Math.cos(angle)*r,Math.sin(angle)*r,z];
    const u=[-Math.sin(angle),Math.cos(angle),0],v=[-z*Math.cos(angle),-z*Math.sin(angle),r],seed=((i*73.31)%1);
    const diffuse=Math.max(0,(-.4*n[0]+.7*n[1]+.5*n[2])/Math.sqrt(.9));
    const color=[.4,.44,.48].map(c=>c*(.22+.78*Math.sqrt(diffuse))*(.94+.06*Math.cos(i*2.3)));
    splats.push({center:[side*.95+n[0]*.7,n[1]*.7,n[2]*.7],axes:[u.map(x=>x*.075),v.map(x=>x*.065),n.map(x=>x*.015)],color,opacity:.94,seed,material});
  }
  return {splats,background:'#111e29',lighting:{irradiance:new Float32Array(splats.length*3),shadow:new Float32Array(splats.length),stats:{}}};
}
