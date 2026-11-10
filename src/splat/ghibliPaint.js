/** Background-paint study, after painted film backgrounds studied on the author's machine.
 * Continuous pigment values, opaque underpainting, broken edges and fine scumble.
 * No reference pixels are used as textures or camera-facing scene replacements.
 */
export const GHIBLI_DEFAULTS=Object.freeze({gouacheTexture:.55,gouacheBlend:.7,gouacheTone:.65,paperScale:1});
/** The wash varies 4.5 times per world unit and a painted dab is about 3.2 of
 * its longest sigma, so a scene of small dabs sees less than one wash cell
 * per dab and a scene of large ones several. */
export const PAPER_WASH_FREQUENCY=4.5;
export const PAPER_DAB_SIGMAS=3.2;
/** Median longest sigma of the canopy study, whose paper the look was tuned on. */
export const PAPER_REFERENCE_SIGMA=.49;
export const PAPER_SCALE_RANGE=Object.freeze([.02,20]);
/** How the shared wash and grain sit on a scene's dabs. `sigma` is the
 * scene's median longest mark sigma in world units, `brush` the footprint
 * the style applies to it, `scale` the paper scale in effect. `matched` is
 * the scale at which a dab spans as many wash cells as in the reference. */
export function paperFit(sigma,brush=1,scale=1){
  if(!(sigma>0))return {scale,dab:0,cells:0,matched:1};
  const dab=PAPER_DAB_SIGMAS*sigma*brush;
  return {scale,dab,cells:PAPER_WASH_FREQUENCY*dab/scale,matched:Math.min(PAPER_SCALE_RANGE[1],Math.max(PAPER_SCALE_RANGE[0],sigma*brush/PAPER_REFERENCE_SIGMA))};
}
export const RENDER_MODES=Object.freeze({
  paint:{label:'Painted splats',description:'Layered dabs with defined edges and a visible brush direction.'},
  gaussian:{label:'Soft Gaussians',description:'The same 3D marks with a soft, Gaussian falloff.'},
  ghibli:{label:'Gouache',description:'Layered color, broken brush edges, and fine pigment grain.'},
});

// Pigment is constant across a splat: grade it before fragment rasterization.
export const GHIBLI_COLOR_GLSL=`
vec3 gouacheColor(vec3 pigment,float tone){
  float y=dot(pigment,vec3(.2126,.7152,.0722));
  float shaped=mix(y,smoothstep(.025,.98,y),tone*.32);
  vec3 color=pigment*(shaped/max(y,.001));
  color=mix(vec3(shaped),color,1.-tone*.08);
  float shadow=1.-smoothstep(.12,.52,y),light=smoothstep(.42,.9,y);
  color*=mix(vec3(1.),vec3(.9,1.01,1.055),shadow*tone);
  color*=mix(vec3(1.),vec3(1.035,1.01,.94),light*tone);
  return color;
}
`;
/** Lattice values of every paint noise field. */
export const PAINT_HASH_GLSL=`
float paintHash(vec2 p){
  vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);
  return fract((q.x+q.y)*q.z);
}
`;
/** The value noise as it was first written: four hashes per sample. It
 * remains the definition of the field; PaintNoiseMap.js tabulates it. */
const proceduralNoise=name=>`
float ${name}(vec2 p){
  vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(paintHash(cell),paintHash(cell+vec2(1.,0.)),f.x),
    mix(paintHash(cell+vec2(0.,1.)),paintHash(cell+1.),f.x),f.y);
}
`;
export const PAINT_NOISE_PROCEDURAL_GLSL=proceduralNoise('paintNoise');
/** Fine pigment grain runs at 83 cells per world unit, far beyond any
 * tabulated window, and is only evaluated up close. It stays procedural so
 * its pattern is unchanged everywhere. */
export const PAINT_GRAIN_NOISE_GLSL=proceduralNoise('paintGrainNoise');
export const PAINT_NOISE_SIZE=4096;
/** The same field from one filtered fetch. The map holds paintHash for the
 * cells -2048..2047 on each axis, so hardware bilinear filtering between two
 * texel centers with the smoothstep weight is the mix() above. Cells outside
 * that window repeat it. */
export const PAINT_NOISE_GLSL=`
uniform sampler2D paintNoiseMap;
float paintNoise(vec2 p){
  vec2 cell=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return textureLod(paintNoiseMap,(cell+f+${PAINT_NOISE_SIZE/2+.5})*${1/PAINT_NOISE_SIZE},0.).r;
}
`;
export const GHIBLI_FRAGMENT_GLSL=`${PAINT_HASH_GLSL}${PAINT_NOISE_GLSL}${PAINT_GRAIN_NOISE_GLSL}
// tanh with one exponential. The built-in took about a fifth of a gouache
// frame on an Apple M1 through Chrome's Metal translation; this form gave the
// same pixels. It saturates correctly: exp overflows to infinity or
// underflows to zero.
float paintTanh(float x){return 1.-2./(exp(2.*x)+1.);}
vec4 gouacheMark(vec2 q,vec2 brush,vec3 surface,vec3 pigment,float alpha,float markSeed,float edgeSoftness,vec3 settings){
  // The two scales share a world-space field across adjacent surface samples.
  // Seed affects the brush silhouette, never the entire dab's brightness.
  vec2 paper=vec2(surface.x+surface.z*.731,surface.y+surface.z*.417);
  float wash=paintNoise(paper*4.5);
  vec2 grainUV=paper*83.;
  float grainFade=1.-smoothstep(.35,1.5,length(fwidth(grainUV)));
  float grain=0.;
  if(grainFade>0.)grain=(paintGrainNoise(grainUV)-.5)*grainFade;
  float tooth=paintNoise(brush*vec2(2.3,8.5)+markSeed*71.);
  float fibreFade=1.-smoothstep(.4,2.,fwidth(brush.y*31.));
  float bristle=0.;
  if(fibreFade>0.)bristle=sin(brush.y*31.+markSeed*37.+sin(brush.x*2.4)*1.6);
  // A loaded flat brush: broad belly, unequal tapered ends, broken dry edge.
  vec2 shape=abs(q);
  shape.y*=1.+.12*paintTanh(q.x*1.4+sin(markSeed*19.));
  float roundShape=pow(pow(shape.x,2.8)+pow(shape.y,2.8),1./2.8);
  float edge=roundShape+.13*(tooth-.5)+.035*bristle*fibreFade*settings.x;
  float feather=.12+.18*edgeSoftness;
  float body=1.-smoothstep(1.53-feather,1.65+feather,edge);
  float underpaint=(1.-smoothstep(.8,2.5,length(q)))*.48;
  float dry=1.-settings.x*.2*smoothstep(.7,1.65,roundShape)*(1.-tooth);
  float loadedPaint=1.-exp(-3.8*alpha*exp(-.14*dot(q,q)));
  // Translucent underpainting unifies neighboring pigments; the loaded stroke
  // supplies a broken, firmer edge over it instead of a field of opaque discs.
  float washAlpha=min(.995,alpha*exp(-.5*dot(q,q)));
  float markAlpha=mix(washAlpha,loadedPaint*max(body*dry,underpaint),.34);
  vec3 color=pigment;
  float scumble=(wash-.5)*.075+grain*.14+.009*bristle*fibreFade;
  color*=1.+scumble*settings.x;
  // Pigment gathers just inside a painted edge, without an ink outline.
  float rim=smoothstep(1.12,1.5,edge)*(1.-smoothstep(1.5,1.78,edge));
  color*=1.-rim*.045*settings.x;
  return vec4(clamp(color,0.,1.),clamp(markAlpha,0.,.995));
}
`;
