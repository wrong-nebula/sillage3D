import {DataTexture,FloatType,RGBAFormat,RedFormat,LinearFilter,NearestFilter} from 'three';
import {rosetteGrowth} from './rosetteAnatomy.js';

/** Rooted allometry from Moebius RPG's flora-film presentation. The original
 * genomes supply topology, pigment, age, and habitat; this extends their shoot
 * extension/crown opening to splat centers AND all three covariance axes. */
export const DESERT_GLSL=`
uniform sampler2D desertPlants;
uniform sampler2D desertOrgans;
uniform int desertWidth;
uniform sampler2D desertHeightMap;
uniform float desertAge;
uniform float desertGrowthStart;
float desertHeight(vec2 p){return texture(desertHeightMap,((p+vec2(0.,12.))/144.+.5)*(512./513.)+.5/513.).r;}
vec3 desertDrift(vec3 p,vec4 w){
  float span=w.w<17.5?28.:18.;
  float phase=fract(w.z+windTime*w.y/span);
  vec2 move=vec2(.94,.34)*(phase-w.z)*span;
  return vec3(move.x,desertHeight(p.xz+move)+w.x-p.y,move.y);
}
`;

export const DESERT_GROWTH_GLSL=`
  vec4 plant=texelFetch(desertPlants,ivec2(int(splatIndex)%desertWidth,int(splatIndex)/desertWidth),0);
  if(plant.w>0.){
    vec4 w=texelFetch(windData,ivec2(int(splatIndex)%windWidth,int(splatIndex)/windWidth),0);
    float age=desertAge>=0.?desertAge:clamp((desertGrowthStart<0.?windTime-w.z:windTime-desertGrowthStart)/25.,.015,1.);
    float rise=.055+.945*pow(age,.72);
    float level=clamp((center.y-plant.y)/plant.w,0.,1.);
    float opening=mix(.32,1.,smoothstep(level*.32,.65+level*.35,age));
    float spread=(.025+.975*pow(age,1.18))*opening;
    vec3 growth=vec3(spread,rise,spread);
    vec4 organ=texelFetch(desertOrgans,ivec2(int(splatIndex)%desertWidth,int(splatIndex)/desertWidth),0);
    if(organ.w>=0.){
      float leafAge=smoothstep(organ.w,organ.w+.47,age);
      float baseSpread=.025+.975*pow(age,1.18);
      growth=vec3(baseSpread*(.20+.80*leafAge),rise*(.16+.84*pow(leafAge,.72)),baseSpread*(.20+.80*leafAge));
      vec3 radial=normalize(vec3(organ.x-plant.x,0.,organ.z-plant.z));
      vec3 hinge=cross(radial,vec3(0.,1.,0.));
      float fold=(1.-leafAge)*mix(.92,.20,smoothstep(.20,.43,organ.w));
      float c=cos(fold),s=sin(fold),k=1.-c,x=hinge.x,z=hinge.z;
      mat3 turn=mat3(c+x*x*k,z*s,x*z*k, -z*s,c,x*s, x*z*k,-x*s,c+z*z*k);
      float rootLevel=clamp((organ.y-plant.y)/plant.w,0.,1.);
      float rootOpening=mix(.32,1.,smoothstep(rootLevel*.32,.65+rootLevel*.35,age));
      vec3 root=plant.xyz+(organ.xyz-plant.xyz)*vec3(baseSpread*rootOpening,rise,baseSpread*rootOpening);
      center.xyz=root+(turn*(center.xyz-organ.xyz))*growth;
      axisA=(turn*axisA)*growth;axisB=(turn*axisB)*growth;axisC=(turn*axisC)*growth;
    }else{
      center.xyz=plant.xyz+(center.xyz-plant.xyz)*growth;
      axisA*=growth;axisB*=growth;axisC*=growth;
    }
    vec3 leafNormal=normalize(cross(axisA,axisB)),eye=normalize(cameraPosition-center.xyz);
    if(dot(leafNormal,axisC)<0.)leafNormal=-leafNormal;
    // Opposing colored tissues never bleed through a thin translucent shell.
    if(organ.w>=0.)opacity*=smoothstep(-.015,.08,dot(leafNormal,eye));
    vec3 halfLight=normalize(eye+normalize(vec3(-.77,.53,.35)));
    float cuticle=pow(max(0.,dot(leafNormal,halfLight)),34.);
    paintColor+=vec3(.10,.092,.08)*cuticle;
  }
`;

export const DESERT_DUST_GLSL=`
    if(windKind>16.5&&windKind<18.5){
      float span=windKind<17.5?28.:18.;
      float phase=fract(wind.z+windTime*wind.y/span);
      opacity*=smoothstep(0.,.12,phase)*(1.-smoothstep(.84,1.,phase));
      // Keep the specimen free of airborne grains and dust-sheet overlap.
      vec3 drifted=center.xyz+desertDrift(center.xyz,wind);
      opacity*=smoothstep(2.8,3.6,length(drifted.xz));
    }
`;

export function desertShader(shader){
  return shader.replace('vec3 windOffset(vec3 p,vec4 wind) {',DESERT_GLSL+`
vec3 windOffset(vec3 p,vec4 wind) {
  if(wind.w>16.5&&wind.w<18.5)return desertDrift(p,wind);
  if(wind.w>15.5&&wind.w<16.5){
    float h=max(0.,p.y-wind.x),weight=clamp(h/max(.01,wind.y),0.,1.);
    float sway=.045*sin(windTime*1.4+wind.z+p.x*.3)+.025*sin(windTime*2.7+p.z*.4);
    return vec3(.94,0.,.34)*weight*weight*sway*min(wind.y,3.);
  }
`).replace('vec3 axisA=readSplat(1).xyz,axisB=readSplat(2).xyz,axisC=readSplat(3).xyz;',
    'vec3 axisA=readSplat(1).xyz,axisB=readSplat(2).xyz,axisC=readSplat(3).xyz;'+DESERT_GROWTH_GLSL)
    .replace('windKind=wind.w;','windKind=wind.w;'+DESERT_DUST_GLSL)
    .replace('bool groundFog=windKind>4.5&&windKind<5.5;',
      'bool groundFog=(windKind>4.5&&windKind<5.5)||(windKind>16.5&&windKind<17.5);');
}

export class DesertEcosystem {
  constructor(definition){
    const {splats,desert}=definition;
    const width=1024,height=Math.ceil(splats.length/width);
    const data=new Float32Array(width*height*4),organData=new Float32Array(width*height*4);
    splats.forEach((s,i)=>{if(s.desertPlant){data.set(s.desertPlant,i*4);organData.set(s.desertOrgan??[0,0,0,-1],i*4);}});
    this.plants=new DataTexture(data,width,height,RGBAFormat,FloatType);
    this.plants.minFilter=this.plants.magFilter=NearestFilter;
    this.plants.generateMipmaps=false;this.plants.needsUpdate=true;
    this.organs=new DataTexture(organData,width,height,RGBAFormat,FloatType);
    this.organs.minFilter=this.organs.magFilter=NearestFilter;this.organs.generateMipmaps=false;this.organs.needsUpdate=true;
    this.heightMap=new DataTexture(desert.heights,513,513,RedFormat,FloatType);
    this.heightMap.minFilter=this.heightMap.magFilter=LinearFilter;
    this.heightMap.generateMipmaps=false;this.heightMap.needsUpdate=true;
    this.uniforms={desertPlants:{value:this.plants},desertOrgans:{value:this.organs},desertWidth:{value:width},desertHeightMap:{value:this.heightMap},desertAge:{value:-1},desertGrowthStart:{value:-1}};
    this.records=[];
    splats.forEach((s,i)=>{if(s.desertPlant||(s.wind?.[3]>=17&&s.wind?.[3]<=18))this.records.push({i,p:s.center,w:s.wind,plant:s.desertPlant,organ:s.desertOrgan});});
    this.heights=desert.heights;
    this.stats=desert.stats;
  }
  updateCenters(centers,time){
    const ageOverride=this.uniforms.desertAge.value,start=this.uniforms.desertGrowthStart.value;
    const key=`${time}/${ageOverride}/${start}`;if(this.last===key)return false;this.last=key;
    const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
    const organTransforms=new Map();
    for(const {i,p,w,plant,organ}of this.records){
      let x=p[0],y=p[1],z=p[2];
      if(plant){
        const age=ageOverride>=0?ageOverride:Math.max(.015,Math.min(1,(start<0?time-w[2]:time-start)/25));
        if(organ){
          let m=organTransforms.get(organ);
          if(!m){
            const origin=rosetteGrowth([0,0,0],plant,plant[3],age,organ);
            const a=rosetteGrowth([1,0,0],plant,plant[3],age,organ),b=rosetteGrowth([0,1,0],plant,plant[3],age,organ),c=rosetteGrowth([0,0,1],plant,plant[3],age,organ);
            m=[a[0]-origin[0],b[0]-origin[0],c[0]-origin[0],a[1]-origin[1],b[1]-origin[1],c[1]-origin[1],a[2]-origin[2],b[2]-origin[2],c[2]-origin[2],...origin];organTransforms.set(organ,m);
          }
          x=m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[9];y=m[3]*p[0]+m[4]*p[1]+m[5]*p[2]+m[10];z=m[6]*p[0]+m[7]*p[1]+m[8]*p[2]+m[11];
        }else{
          const rise=.055+.945*age**.72,level=Math.max(0,Math.min(1,(y-plant[1])/plant[3]));
          const spread=(.025+.975*age**1.18)*(.32+.68*smooth(level*.32,.65+level*.35,age));
          x=plant[0]+(x-plant[0])*spread;y=plant[1]+(y-plant[1])*rise;z=plant[2]+(z-plant[2])*spread;
        }
        const weight=Math.max(0,Math.min(1,(y-w[0])/w[1]));
        const sway=(.045*Math.sin(time*1.4+w[2]+x*.3)+.025*Math.sin(time*2.7+z*.4))*weight*weight*Math.min(w[1],3);
        x+=.94*sway;z+=.34*sway;
      }else{
        const span=w[3]===17?28:18,phase=((w[2]+time*w[1]/span)%1+1)%1;
        x+=.94*(phase-w[2])*span;z+=.34*(phase-w[2])*span;y=this.height(x,z)+w[0];
      }
      centers[i*3]=x;centers[i*3+1]=y;centers[i*3+2]=z;
    }
    return true;
  }
  height(x,z){
    // Texel-centered texture coordinates match the original heightfield exactly.
    const u=Math.max(0,Math.min(512,(x/144+.5)*512));
    const v=Math.max(0,Math.min(512,((z+12)/144+.5)*512));
    const ix=Math.min(511,Math.floor(u)),iz=Math.min(511,Math.floor(v)),i=iz*513+ix,a=u-ix,b=v-iz,h=this.heights;
    return (h[i]*(1-a)+h[i+1]*a)*(1-b)+(h[i+513]*(1-a)+h[i+514]*a)*b;
  }
  replay(time){this.uniforms.desertAge.value=-1;this.uniforms.desertGrowthStart.value=time;}
  setAge(age){this.uniforms.desertAge.value=Math.max(0,Math.min(1,age));}
  dispose(){this.plants.dispose();this.organs.dispose();this.heightMap.dispose();}
}
