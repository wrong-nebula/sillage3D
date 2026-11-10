import {ShaderChunk,Vector4} from 'three';

export const SPLAT_MATERIAL_DEFAULTS=Object.freeze({iridescenceThickness:450,iridescenceIOR:1.46,
  iridescenceRoughness:.16,iridescenceStrength:1,iridescenceVariation:.32,
  jadeThickness:.47,jadeTransmission:.85,anisotropy:.85,metalRoughness:.28,metalReflectionStrength:1,metalRotation:0,studioIntensity:1.2,studioRotation:0});

export function materialSettings(options={}){
  const bounded=(key,min,max)=>Math.max(min,Math.min(max,Number.isFinite(options[key])?options[key]:SPLAT_MATERIAL_DEFAULTS[key]));
  return {film:[bounded('iridescenceThickness',0,1600),bounded('iridescenceIOR',1,2.5),bounded('iridescenceRoughness',.04,1),bounded('iridescenceStrength',0,1)],
    variation:bounded('iridescenceVariation',0,1),surface:[bounded('jadeThickness',.05,2),bounded('jadeTransmission',0,1),bounded('metalRoughness',.06,1),bounded('anisotropy',0,.95)],
    metal:[bounded('metalReflectionStrength',0,2),bounded('metalRotation',0,180)*Math.PI/180,0,0],environment:[bounded('studioIntensity',0,4),bounded('studioRotation',0,360)*Math.PI/180]};
}
export function splatMaterialUniforms(options={}){
  const settings=materialSettings(options);
  return {splatFilm:{value:new Vector4(...settings.film)},splatFilmVariation:{value:settings.variation},splatSurface:{value:new Vector4(...settings.surface)},splatMetal:{value:new Vector4(...settings.metal)},splatEnvironment:{value:null},splatEnvironmentState:{value:new Vector4(0,settings.environment[0],settings.environment[1],0)}};
}

// Reuse Three's MIT-licensed Belcour/Barla thin-film evaluator, including the
// fitted XYZ spectral sensitivity and two interference orders. Namespacing
// allows it to coexist with the custom paint shaders without common.glsl.
let film=ShaderChunk.iridescence_fragment.replace('#ifdef USE_IRIDESCENCE','').replace(/\n#endif\s*$/,'');
for(const name of ['Fresnel0ToIor','IorToFresnel0','evalSensitivity','evalIridescence','pow2','F_Schlick'])
  film=film.replace(new RegExp(`\\b${name}\\b`,'g'),`sg_${name}`);
film=film.replace(/\bPI\b/g,'SG_PI');

/** Included only by opt-in scenes. Spectral response, GGX and transmission are
 * evaluated per vertex/instance; overlapping fragments just composite pigment.
 * One cached HDRI cube; no extra varyings, per-frame passes or per-pixel spectral loops. */
export const SPLAT_MATERIAL_GLSL=/* glsl */`
const float SG_PI=3.141592653589793;
float sg_pow2(float x){return x*x;}
vec3 sg_pow2(vec3 x){return x*x;}
float sg_F_Schlick(float f0,float f90,float cosine){float f=exp2((-5.55473*cosine-6.98316)*cosine);return mix(f0,f90,f);}
vec3 sg_F_Schlick(vec3 f0,float f90,float cosine){float f=exp2((-5.55473*cosine-6.98316)*cosine);return mix(f0,vec3(f90),f);}
${film}
uniform vec4 splatFilm;
uniform float splatFilmVariation;
uniform vec4 splatSurface;
uniform vec4 splatMetal;
uniform samplerCube splatEnvironment;
uniform vec4 splatEnvironmentState;
// Object-anchored value noise for clouds, veins, pores and patina. It is read
// at a mark's place on the object, so a pattern turns with the object.
float sg_hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float sg_noise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(sg_hash(i),sg_hash(i+vec3(1.,0.,0.)),f.x),mix(sg_hash(i+vec3(0.,1.,0.)),sg_hash(i+vec3(1.,1.,0.)),f.x),f.y),
    mix(mix(sg_hash(i+vec3(0.,0.,1.)),sg_hash(i+vec3(1.,0.,1.)),f.x),mix(sg_hash(i+vec3(0.,1.,1.)),sg_hash(i+vec3(1.,1.,1.)),f.x),f.y),f.z);
}
float sg_fbm(vec3 p){float sum=0.,weight=.5;for(int i=0;i<4;i++){sum+=weight*sg_noise(p);p=p*2.03+vec3(11.7,5.3,8.1);weight*=.5;}return sum/.9375;}
vec3 sg_display(vec3 light){return pow(max(light,vec3(0.))/(vec3(1.)+max(light,vec3(0.))),vec3(1./2.2));}
float sg_lightPanel(vec2 angle,vec2 center,vec2 halfSize,float softness){
  vec2 delta=abs(angle-center);delta.x=min(delta.x,2.*SG_PI-delta.x);
  vec2 edge=max(vec2(0.),delta-halfSize)/max(.035,softness);
  return exp(-dot(edge,edge));
}
vec3 sg_studio(vec3 ray,float roughness){
  if(splatEnvironmentState.x>.5){
    float rotation=splatEnvironmentState.z,c=cos(rotation),s=sin(rotation);
    vec3 direction=vec3(c*ray.x+s*ray.z,ray.y,-s*ray.x+c*ray.z);
    // Three r187 PMREM uses a true GGX-prefiltered cubemap. This is the
    // inverse of PMREMGenerator.lodToRoughness(), also used by MeshPhysicalMaterial.
    float r=clamp(roughness,0.,1.),lod=splatEnvironmentState.w*r*(2.-r);
    return textureLod(splatEnvironment,direction,lod).rgb*splatEnvironmentState.y;
  }
  float a=atan(ray.x,ray.z),e=asin(clamp(ray.y,-1.,1.));
  vec2 angle=vec2(a,e);float softness=.16+roughness*roughness*.7;
  float box=sg_lightPanel(angle,vec2(-.58,.38),vec2(.22,.88),softness);
  float top=sg_lightPanel(angle,vec2(.25,1.03),vec2(1.15,.055),softness);
  float blue=sg_lightPanel(angle,vec2(1.12,.02),vec2(.055,.95),softness);
  float warm=sg_lightPanel(angle,vec2(-2.2,.15),vec2(.075,.65),softness);
  float energy=1./(1.+roughness*.65);
  return vec3(.045+.045*smoothstep(-.5,.7,ray.y))
    +energy*(vec3(box*4.4+top*2.2)+blue*vec3(.22,.6,1.)+warm*vec3(.7,.28,.11));
}
// The reflection in a polished non-metal. It returns only a few percent, so
// what registers is the lights themselves, and the 1k studio map with its
// prefiltering holds those well below their true radiance (median .3, lights
// 10 to 40, a peak of 520 on a handful of texels). This restores the sources
// and leaves the dim reflection of the room alone, so nothing veils the body.
vec3 sg_gloss(vec3 ray,float roughness){
  vec3 light=sg_studio(ray,roughness);
  float level=dot(light,vec3(.2126,.7152,.0722))/max(splatEnvironmentState.y,.001);
  return light*(1.+3.2*smoothstep(1.,6.,level));
}
vec3 sg_anisotropicLight(vec3 n,vec3 t,vec3 b,vec3 v,vec3 l,vec3 radiance,float roughness,float anisotropy){
  float nv=max(.001,dot(n,v)),nl=max(0.,dot(n,l));
  vec3 h=normalize(v+l+vec3(.00001));
  float aspect=sqrt(1.-.9*anisotropy),alpha=roughness*roughness;
  float ax=max(.035,alpha/aspect),ay=max(.035,alpha*aspect);
  float tx=dot(t,h)/ax,by=dot(b,h)/ay,nh=max(0.,dot(n,h));
  float denominator=tx*tx+by*by+nh*nh;
  float distribution=1./max(.00001,SG_PI*ax*ay*denominator*denominator);
  float vv=length(vec3(ax*dot(t,v),ay*dot(b,v),nv));
  float ll=length(vec3(ax*dot(t,l),ay*dot(b,l),nl));
  float visibility=.5/max(.0001,nl*vv+nv*ll);
  return radiance*distribution*visibility*nl*sg_F_Schlick(vec3(.58,.64,.71),1.,max(0.,dot(v,h)));
}
vec3 splatMaterialPigment(float type,vec3 pigment,vec3 normal,vec3 view,vec3 axis,float phase,vec3 anchor){
  vec3 v=normalize(view),n=normalize(normal);if(dot(n,v)<0.)n=-n;
  float nv=max(.001,dot(n,v));
  vec3 reflection=reflect(-v,n),key=normalize(vec3(-.65,.85,1.)),fill=normalize(vec3(.8,.2,-.65));
  bool studio=splatEnvironmentState.x>.5;
  if(type>24.5){
    // Terracotta: unglazed fired clay. No coat; the surface is porous, so
    // light falls off more gently than Lambert and the grain shows as small
    // changes of tone: paler dusty bloom, darker pits, a little iron-red drift.
    float body=sg_fbm(anchor*2.1),grain=sg_fbm(anchor*19.),pit=smoothstep(.66,.8,sg_noise(anchor*41.));
    vec3 albedo=mix(vec3(.50,.150,.070),vec3(.66,.245,.120),smoothstep(.3,.7,body));
    albedo=mix(albedo,vec3(.70,.40,.28),smoothstep(.55,.85,grain)*.28)*(1.-.34*pit)*(.9+.2*grain);
    vec3 front=sg_studio(n,1.),wide=sg_studio(normalize(n+.75*v),1.);
    // Rough microfacets send light back toward the viewer at grazing angles.
    vec3 diffuse=albedo*mix(front,wide,.32*(1.-nv));
    vec3 sheen=sg_studio(reflection,.82)*sg_F_Schlick(vec3(.035),1.,nv)*.55;
    return sg_display(diffuse+sheen);
  }
  if(type>23.5){
    // Glazed porcelain: a thin glassy coat over a white body that lets a
    // little light through. The glaze gives sharp reflections of the lights
    // and takes its Fresnel share away from the body beneath.
    float glaze=sg_fbm(anchor*1.4+vec3(5.,2.,8.));
    vec3 albedo=mix(vec3(.80,.785,.745),vec3(.765,.80,.79),smoothstep(.35,.75,glaze)*.55);
    vec3 fresnel=sg_F_Schlick(vec3(.047),1.,nv);
    vec3 front=sg_studio(n,1.),far=sg_studio(-n,1.);
    vec3 diffuse=albedo*(front*.9+far*vec3(.14,.12,.10))*(1.-fresnel);
    vec3 coat=(sg_gloss(reflection,.07)*.75+sg_gloss(reflection,.24)*.25)*fresnel;
    return sg_display(diffuse+coat);
  }
  if(type<17.5){
    float thickness=splatFilm.x*(1.+splatFilmVariation*(phase*2.-1.));
    vec3 spectrum=sg_evalIridescence(1.,splatFilm.y,nv,max(0.,thickness),vec3(.42,.44,.47));
    spectrum=mix(spectrum,vec3(dot(spectrum,vec3(.2126,.7152,.0722))),splatFilm.z*splatFilm.z*.65);
    vec3 response=sg_display(spectrum*(vec3(.22)+sg_studio(reflection,splatFilm.z)));
    return mix(pigment,response,splatFilm.w);
  }
  if(type<18.5){
    // Nephrite jade. The stone: milky clouds in a deeper green, finer
    // mottling, pale veins along winding sheets and a few dark inclusions.
    vec3 p=anchor*1.35;
    float warp=sg_fbm(p*.9+vec3(4.,1.,7.));
    float cloud=sg_fbm(p*1.7+warp*1.6),mottle=sg_fbm(p*5.5+vec3(2.));
    float ridge=abs(sg_fbm(p*1.25+vec3(9.,3.,5.)+warp)-.5)*2.;
    float vein=(1.-smoothstep(0.,.085,ridge))*(.55+.45*mottle);
    float speck=smoothstep(.74,.86,sg_noise(p*17.))*smoothstep(.35,.6,mottle);
    vec3 body=mix(vec3(.020,.215,.115),vec3(.105,.43,.255),smoothstep(.2,.62,cloud));
    body=mix(body,vec3(.50,.71,.52),smoothstep(.34,.72,cloud*.75+mottle*.25)*.5);
    body=mix(body,vec3(.66,.80,.66),vein*.6)*(1.-.6*speck);
    float wrapped=clamp((dot(n,key)+.65)/1.65,0.,1.),back=max(0.,dot(-n,fill));
    vec3 front=studio?sg_studio(n,1.):vec3(.1+wrapped*.8);
    vec3 far=studio?sg_studio(-n,1.):vec3(.2+back);
    vec3 behind=studio?sg_studio(-v,.85):vec3(.15+.5*back);
    // Light scatters under the surface before it leaves, so the shading
    // follows a wide neighbourhood of the normal and the far side leaks in.
    float depth=splatSurface.x,pass=splatSurface.y;
    vec3 scattered=mix(front,front*.7+far*.3,pass);
    // Red and blue are absorbed first. The chord through a rounded form
    // shortens toward its silhouette, so edges pass the most light.
    vec3 absorb=vec3(3.6,.5,1.9);
    vec3 thin=exp(-absorb*depth*max(.1,nv)),thick=exp(-absorb*depth);
    vec3 tint=mix(vec3(.22,.62,.36),body,.45);
    vec3 glow=(thin*behind*(.25+.75*pow(1.-nv,1.5))+thick*far*.3)*tint*pass*1.5;
    // Light that stays long in the stone leaves deeper in colour.
    vec3 inner=body*scattered+body*body*far*.35*pass;
    // A polished surface with jade's waxy lustre: one sharp lobe, one broad.
    vec3 fresnel=sg_F_Schlick(vec3(.052),1.,nv);
    vec3 coat=(sg_gloss(reflection,.1)*.7+sg_gloss(reflection,.42)*.3)*fresnel;
    return sg_display(inner*(1.-fresnel)+glow+coat);
  }
  float roughness=splatSurface.z;
  vec3 environment=sg_studio(reflection,roughness)*splatMetal.x;
  if(type>19.5&&abs(type-21.)>.1){
    vec3 f0=type<20.5?vec3(1.,.66,.19):type<22.5?vec3(.95,.56,.32):vec3(.91,.94,.98);
    vec3 metal=environment*sg_F_Schlick(f0,1.,nv);
    if(type>21.5&&type<22.5){
      // Verdigris grows in crusty patches with a dark tarnished margin; it
      // is a chalky powder, lit like a matte surface, not like the metal.
      float field=sg_fbm(anchor*1.15+vec3(3.,7.,1.))*.72+sg_fbm(anchor*6.3)*.28;
      float oxide=smoothstep(.47,.6,field),margin=smoothstep(.38,.5,field)*(1.-oxide);
      float crust=sg_fbm(anchor*23.);
      vec3 powder=mix(vec3(.030,.255,.185),vec3(.20,.50,.42),smoothstep(.35,.8,crust));
      vec3 patina=powder*(studio?sg_studio(n,1.):vec3(.14+.82*max(0.,dot(n,key))));
      metal=mix(metal,metal*vec3(.34,.20,.15),margin*.85);
      metal=mix(metal,patina,oxide*(.86+.14*crust));
    }
    return sg_display(metal);
  }
  vec3 tangent=normalize(axis-n*dot(n,axis)),bitangent=cross(n,tangent);
  vec3 t=tangent*cos(splatMetal.y)+bitangent*sin(splatMetal.y),b=cross(n,t);
  float anisotropy=type>20.5?splatSurface.w*.72:splatSurface.w;
  float grain=1.-(type>20.5?.045:.025)*(.5+.5*sin(phase*293.));
  if(splatEnvironmentState.x>.5){
    // Filament/Three's bent-normal approximation stretches the actual HDRI
    // reflection around the brush tangent without extra fragment work.
    vec3 bent=cross(b,v);bent=normalize(cross(bent,b));
    float weight=pow(1.-anisotropy*(1.-roughness),4.);
    bent=normalize(mix(bent,n,weight));
    vec3 ray=normalize(mix(reflect(-v,bent),n,pow(roughness,4.)));
    vec3 radiance=sg_studio(ray,roughness)*sg_F_Schlick(vec3(.58,.64,.71),1.,nv)*splatMetal.x;
    return sg_display(radiance*grain);
  }
  vec3 metal=sg_anisotropicLight(n,t,b,v,key,vec3(2.7,2.5,2.2),roughness,anisotropy)
    +sg_anisotropicLight(n,t,b,v,fill,vec3(.4,.75,1.1),roughness,anisotropy);
  metal=metal*splatMetal.x+environment*vec3(.32,.37,.43);
  return sg_display(metal*grain+vec3(.009,.012,.016));
}
`;
