import {DataTexture,FloatType,NearestFilter,RGBAFormat} from 'three';

/** One tiny velocity/pose texture per world. Splat/body membership reuses the
 * existing wind metadata texture and changes only when ownership changes.
 * Shader-side rank-one covariance broadening models a short shutter interval.
 */
export class ObjectMotionBlur {
  constructor(world,{strength=.8,exposure=1/60}={}){
    this.world=world;this.width=64;this.exposure=exposure;this.engine=null;
    this.data=new Float32Array(64*Math.ceil(world.capacity*3/64)*4);
    this.texture=new DataTexture(this.data,64,this.data.length/(64*4),RGBAFormat,FloatType);
    this.texture.minFilter=this.texture.magFilter=NearestFilter;this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
    this.uniforms={objectMotionData:{value:this.texture},objectMotionWidth:{value:64},objectMotionStrength:{value:strength},objectMotionExposure:{value:exposure}};
  }
  attach(engine,clusters,start){
    this.engine=engine;for(const c of clusters){c.motionStart=start;start+=c.splats.length;this.bindCluster(c);}
  }
  bindRange(start,count,body){
    const texture=this.engine?.windTexture;if(!texture)return;
    const data=texture.image.data;
    for(let i=start;i<start+count;i++){data[i*4]=body.id;data[i*4+1]=0;data[i*4+2]=0;data[i*4+3]=31;}
    texture.needsUpdate=true;
  }
  bindCluster(cluster){
    if(cluster.motionStart===undefined)return;
    if(!cluster.broken&&!cluster.damage)this.bindRange(cluster.motionStart,cluster.splats.length,cluster.body);
    else for(let i=0;i<cluster.chunks.length;i++){const detached=cluster.damage?!!(cluster.damage.detached&(1<<i)):cluster.broken;this.bindRange(cluster.motionStart+i*cluster.splats.length/6,cluster.splats.length/6,detached?cluster.chunks[i].body:cluster.body);}
  }
  bindAuthored(rock){
    const texture=this.engine?.windTexture;if(!texture)return;
    const data=texture.image.data;for(const c of rock.chunks)for(const r of c.records){data[r.index*4]=c.body.id;data[r.index*4+1]=0;data[r.index*4+2]=0;data[r.index*4+3]=31;}
    texture.needsUpdate=true;
  }
  update(){
    for(const b of this.world.bodies){const k=b.id*12,p=b.position,v=b.velocity,w=b.angularVelocity;
      const alpha=this.world.alpha;
      this.data[k]=b.previous.x+(p.x-b.previous.x)*alpha;this.data[k+1]=b.previous.y+(p.y-b.previous.y)*alpha;this.data[k+2]=b.previous.z+(p.z-b.previous.z)*alpha;this.data[k+3]=b.enabled&&b.inverseMass&&!b.sleeping&&v.lengthSq()+w.lengthSq()>1e-8?1:0;
      this.data[k+4]=v.x;this.data[k+5]=v.y;this.data[k+6]=v.z;this.data[k+7]=b.wetness??0;
      this.data[k+8]=w.x;this.data[k+9]=w.y;this.data[k+10]=w.z;this.data[k+11]=0;
    }
    this.texture.needsUpdate=true;
  }
  setStrength(value){if(!Number.isFinite(value))return;this.uniforms.objectMotionStrength.value=Math.max(0,Math.min(2,value));if(this.engine){this.engine.dirty=true;this.engine.onInvalidate?.();}}
  setPaused(value){this.uniforms.objectMotionExposure.value=value?0:this.exposure;}
  shader(source){
    return source
      .replace('uniform bool hasWind;',`uniform bool hasWind;
uniform sampler2D objectMotionData;
uniform int objectMotionWidth;
uniform float objectMotionStrength;
uniform float objectMotionExposure;
vec4 objectMotionRead(int address){return texelFetch(objectMotionData,ivec2(address%objectMotionWidth,address/objectMotionWidth),0);}`)
      .replace('vec3 windOffset(vec3 p,vec4 wind) {','vec3 windOffset(vec3 p,vec4 wind) {\n  if(wind.w>30.5)return vec3(0.);')
      .replace('float windKind=0.,trampled=0.,glintFloor=0.;','float objectMotionBody=-1.;\n  float windKind=0.,trampled=0.,glintFloor=0.;')
      .replace('windKind=wind.w;','windKind=wind.w;\n    if(wind.w>30.5)objectMotionBody=wind.x;')
      .replace('vec3 p=(modelViewMatrix*vec4(center.xyz,1.)).xyz;',`vec3 objectMotion=vec3(0.);
  if(objectMotionBody>=0.&&objectMotionStrength>0.&&objectMotionExposure>0.){
    int address=int(objectMotionBody)*3;vec4 pose=objectMotionRead(address);
    if(pose.w>.5){vec3 velocity=objectMotionRead(address+1).xyz+cross(objectMotionRead(address+2).xyz,center.xyz-pose.xyz);
      objectMotion=velocity*(objectMotionExposure*objectMotionStrength);
      objectMotion*=min(1.,1.2/max(length(objectMotion),.0001));
    }
  }
  vec3 p=(modelViewMatrix*vec4(center.xyz,1.)).xyz;`)
      .replace('float d=-p.z;\n  defocusAmount=','sigma+=length(objectMotion)*.5;\n  float d=-p.z;\n  defocusAmount=')
      .replace('vec2 screen=p.xy/max(d,.08)*focal;',`float motionDet=max(xx*yy-xy*xy,.00001);
  vec2 motion=projectAxis(viewRotation*objectMotion,p,focal);
  xx+=motion.x*motion.x/12.;xy+=motion.x*motion.y/12.;yy+=motion.y*motion.y/12.;
  opacity*=sqrt(motionDet/max(xx*yy-xy*xy,.00001));
  vec2 screen=p.xy/max(d,.08)*focal;`);
  }
  dispose(){this.texture.dispose();this.engine=null;}
}
