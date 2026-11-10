/** Experimental only: evaluate the existing final alpha before pigment noise.
 * Rejected for production: sharp train rendering regressed in the GPU test.
 * Derivatives must stay before the new discard so adjacent lanes agree.
 * Kept in step with the kernel by tests/ghibli-paint.test.js. */
export function coverageFirstGouache(shader){
  const once=(text,from,to)=>{
    const parts=text.split(from);
    if(parts.length!==2)throw new Error(`Gouache fixture no longer matches (${parts.length-1} found): ${from}`);
    return parts.join(to);
  };
  // The watercolor kernel shares several lines with gouache: edit only the
  // gouache function body.
  const signature='vec4 gouacheMark(vec2 q,vec2 brush,vec3 surface,vec3 pigment,float alpha,float markSeed,float edgeSoftness,vec3 settings){';
  const finish='  return vec4(clamp(color,0.,1.),clamp(markAlpha,0.,.995));\n}';
  const start=shader.indexOf(signature),end=shader.indexOf(finish,start);
  if(start<0||end<0||shader.indexOf(signature,start+1)>=0)throw new Error('Gouache fixture no longer matches: kernel bounds');
  let kernel=shader.slice(start,end+finish.length),rest=shader.slice(end+finish.length);
  kernel=once(kernel,signature,signature.replace('vec3 settings){','vec3 settings,vec4 alphaSettings){'));
  kernel=once(kernel,'  float wash=paintNoise(paper*4.5);\n','');
  kernel=once(kernel,'  float grain=0.;\n  if(grainFade>0.)grain=(paintGrainNoise(grainUV)-.5)*grainFade;\n','');
  kernel=once(kernel,'  vec3 color=pigment;',`  float resolvedAlpha=mix(clamp(markAlpha,0.,.995),alphaSettings.x,alphaSettings.y)*alphaSettings.z;
  if(alphaSettings.w<.99999)resolvedAlpha=1.-pow(max(1.-resolvedAlpha,.00001),alphaSettings.w);
  if(resolvedAlpha<.004)discard;
  float wash=paintNoise(paper*4.5);
  float grain=0.;
  if(grainFade>0.)grain=(paintGrainNoise(grainUV)-.5)*grainFade;
  vec3 color=pigment;`);
  // The main call. Watercolor and oil strokes share its tail, so it is found by name.
  const call=rest.match(/gouacheMark\(localCoord,brush,[^;]*?opacity\*coverage,seed,edgeSoftness,settings\);/g)??[];
  if(call.length!==1)throw new Error(`Gouache fixture no longer matches (${call.length} found): the main call`);
  rest=rest.replace(call[0],call[0].replace('settings);','settings,vec4(baseAlpha,blurMix,defocusCoverage,lodWeight));'));
  // Reef light shafts call the kernel for its texture only and are never
  // discarded by its alpha: resolve to opaque so the new test passes them.
  rest=rest.replace('opacity*coverage,seed,.7,gouacheSettings);','opacity*coverage,seed,.7,gouacheSettings,vec4(1.,1.,1.,1.));');
  return shader.slice(0,start)+kernel+rest;
}
