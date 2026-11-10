import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const light=new THREE.Vector3(-.8,1.1,.7).normalize();
const random=seed=>()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};

function textureSampler(material){
  const map=material.map,uv=new THREE.Vector2(),color=new THREE.Color();
  let pixels,width,height;
  if(map?.image){
    const canvas=document.createElement('canvas');
    width=canvas.width=map.image.width;height=canvas.height=map.image.height;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(map.image,0,0);pixels=context.getImageData(0,0,width,height).data;
    map.updateMatrix();
  }
  const sample=(u,v)=>{
    color.copy(material.color??new THREE.Color(1,1,1));
    let opacity=material.opacity??1;
    if(pixels){
      map.transformUv(uv.set(u,v));
      const x=Math.min(width-1,Math.max(0,Math.floor(uv.x*width)));
      const y=Math.min(height-1,Math.max(0,Math.floor(uv.y*height)));
      const offset=(y*width+x)*4;
      color.multiply(new THREE.Color().setRGB(pixels[offset]/255,pixels[offset+1]/255,pixels[offset+2]/255,THREE.SRGBColorSpace));
      if(material.transparent||material.alphaTest>0)opacity*=pixels[offset+3]/255;
    }
    if(opacity<(material.alphaTest??0))opacity=0;
    return [...color.convertLinearToSRGB().toArray(),opacity];
  };
  sample.channel=map?.channel??0;return sample;
}

const boneMatrix=new THREE.Matrix4(),slowVertex=new THREE.Vector3();

/** Static skinning inputs of one mesh, read once through the attribute
 * accessors (which also resolve normalized and interleaved storage). */
function skinTable(mesh){
  const {position,skinIndex,skinWeight}=mesh.geometry.attributes,count=position.count;
  const rest=new Float64Array(count*3),bones=new Uint16Array(count*4),weights=new Float64Array(count*4);
  for(let i=0;i<count;i++){
    rest[i*3]=position.getX(i);rest[i*3+1]=position.getY(i);rest[i*3+2]=position.getZ(i);
    bones[i*4]=skinIndex.getX(i);bones[i*4+1]=skinIndex.getY(i);bones[i*4+2]=skinIndex.getZ(i);bones[i*4+3]=skinIndex.getW(i);
    weights[i*4]=skinWeight.getX(i);weights[i*4+1]=skinWeight.getY(i);weights[i*4+2]=skinWeight.getZ(i);weights[i*4+3]=skinWeight.getW(i);
  }
  return {rest,bones,weights,matrices:new Float64Array(mesh.skeleton.bones.length*16),
    attributes:[position,skinIndex,skinWeight],versions:[position.version,skinIndex.version,skinWeight.version]};
}

/** World positions of every vertex of a skinned mesh, bit-identical to
 * `mesh.getVertexPosition(i).applyMatrix4(mesh.matrixWorld)`.
 * three's SkinnedMesh.applyBoneTransform multiplies each influencing bone's
 * world matrix by its inverse bind matrix again for every vertex. Here that
 * product is formed once per bone per frame; every later operation keeps
 * three's expression and evaluation order, so the doubles agree exactly. */
function skinVertices(mesh,skin,vertices){
  const {rest,bones,weights,matrices}=skin,skeleton=mesh.skeleton;
  for(let b=0;b<skeleton.bones.length;b++)matrices.set(boneMatrix.multiplyMatrices(skeleton.bones[b].matrixWorld,skeleton.boneInverses[b]).elements,b*16);
  const bind=mesh.bindMatrix.elements,inverse=mesh.bindMatrixInverse.elements,world=mesh.matrixWorld.elements;
  for(let i=0,count=vertices.length/3;i<count;i++){
    let x=rest[i*3],y=rest[i*3+1],z=rest[i*3+2];
    // Vector4(x,y,z,1).applyMatrix4(bindMatrix)
    const bx=bind[0]*x+bind[4]*y+bind[8]*z+bind[12]*1,by=bind[1]*x+bind[5]*y+bind[9]*z+bind[13]*1;
    const bz=bind[2]*x+bind[6]*y+bind[10]*z+bind[14]*1,bw=bind[3]*x+bind[7]*y+bind[11]*z+bind[15]*1;
    x=0;y=0;z=0;
    for(let k=i*4,end=k+4;k<end;k++){
      const weight=weights[k];
      if(weight!==0){
        const m=bones[k]*16;
        x+=(matrices[m]*bx+matrices[m+4]*by+matrices[m+8]*bz+matrices[m+12]*bw)*weight;
        y+=(matrices[m+1]*bx+matrices[m+5]*by+matrices[m+9]*bz+matrices[m+13]*bw)*weight;
        z+=(matrices[m+2]*bx+matrices[m+6]*by+matrices[m+10]*bz+matrices[m+14]*bw)*weight;
      }
    }
    // Vector3.applyMatrix4(bindMatrixInverse), then the mesh's world matrix.
    let w=1/(inverse[3]*x+inverse[7]*y+inverse[11]*z+inverse[15]);
    const sx=(inverse[0]*x+inverse[4]*y+inverse[8]*z+inverse[12])*w,sy=(inverse[1]*x+inverse[5]*y+inverse[9]*z+inverse[13])*w,sz=(inverse[2]*x+inverse[6]*y+inverse[10]*z+inverse[14])*w;
    w=1/(world[3]*sx+world[7]*sy+world[11]*sz+world[15]);
    vertices[i*3]=(world[0]*sx+world[4]*sy+world[8]*sz+world[12])*w;
    vertices[i*3+1]=(world[1]*sx+world[5]*sy+world[9]*sz+world[13])*w;
    vertices[i*3+2]=(world[2]*sx+world[6]*sy+world[10]*sz+world[14])*w;
  }
}

/** Fixed barycentric surface samples follow skinning and morph targets.
 * Mesh vertices are deformed once per frame; sampling is never repeated.
 * The source meshes are not rendered. All samples join the world's depth sort.
 */
export class AnimatedGLBSplats {
  static async load(url,options){
    const gltf=await new GLTFLoader().loadAsync(url);
    try{return new AnimatedGLBSplats(gltf,options);}
    catch(error){disposeGLTF(gltf.scene);throw error;}
  }
  constructor(gltf,{count=18000,height=1.5,span,seed=2718,clip=0,deformCovariance=false}={}){
    this.deformCovariance=deformCovariance;this.surfaceVersion=0;
    this.root=new THREE.Group();this.root.add(gltf.scene);this.source=gltf.scene;
    this.root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(this.source,true),size=bounds.getSize(new THREE.Vector3());
    if(!(size.y>0))throw new Error('The GLB has no visible surface.');
    const scale=span?span/Math.max(size.x,size.y,size.z):height/size.y;
    this.source.scale.multiplyScalar(scale);
    this.source.position.add(new THREE.Vector3(-(bounds.min.x+bounds.max.x)*.5,-bounds.min.y,-(bounds.min.z+bounds.max.z)*.5).multiplyScalar(scale));
    this.root.updateMatrixWorld(true);
    this.normalization=this.source.matrix.clone();
    this.meshes=[];this.splats=[];this.samples=[];
    this.source.traverse(mesh=>{
      if(mesh.isMesh&&mesh.geometry.getAttribute('position'))this.meshes.push({mesh,vertices:new Float32Array(mesh.geometry.getAttribute('position').count*3)});
    });
    this.updateVertices();
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),edge=new THREE.Vector3(),normal=new THREE.Vector3();
    const triangles=[];let area=0;
    for(const entry of this.meshes){
      const {mesh,vertices}=entry,g=mesh.geometry,index=g.index;
      const samplers=(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(textureSampler);
      for(let i=0;i<(index?.count??g.attributes.position.count);i+=3){
        const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
        a.fromArray(vertices,ids[0]*3);b.fromArray(vertices,ids[1]*3);c.fromArray(vertices,ids[2]*3);
        const triangleArea=normal.crossVectors(edge.subVectors(b,a),c.sub(a)).length()*.5;
        if(triangleArea<1e-12)continue;
        area+=triangleArea;
        const materialIndex=g.groups.find(group=>i>=group.start&&i<group.start+group.count)?.materialIndex??0;
        const restLength=edge.length(),restX=c.dot(edge)/restLength,restY=triangleArea*2/restLength;
        triangles.push({entry,ids,total:area,restLength,restX,restY,sampleColor:samplers[materialIndex]??samplers[0]});
      }
    }
    if(!triangles.length)throw new Error('The GLB has no triangles to sample.');
    const rnd=random(seed),radius=Math.sqrt(area/count)*.76;
    // Stratified area sampling retains small features without favoring dense topology.
    let ti=0;
    for(let i=0;i<count;i++){
      const target=(i+rnd())/count*area;
      while(ti<triangles.length-1&&triangles[ti].total<target)ti++;
      const triangle=triangles[ti],r=Math.sqrt(rnd()),s=rnd(),weights=[1-r,r*(1-s),r*s];
      const channel=triangle.sampleColor.channel,uv=triangle.entry.mesh.geometry.getAttribute(channel?`uv${channel}`:'uv');let u=0,v=0;
      if(uv)triangle.ids.forEach((id,k)=>{u+=uv.getX(id)*weights[k];v+=uv.getY(id)*weights[k];});
      const sampled=triangle.sampleColor(u,v),pigment=sampled.slice(0,3);
      const splat={center:[0,0,0],axes:[[radius,0,0],[0,radius,0],[0,0,radius*.28]],color:pigment.slice(),opacity:.98*sampled[3],seed:rnd(),material:'actor'};
      const restCenter=[0,1,2].map(k=>triangle.ids.reduce((sum,id,j)=>sum+triangle.entry.vertices[id*3+k]*weights[j],0));
      this.samples.push({triangle,weights,pigment,restCenter,opacity:splat.opacity,radius:radius*(deformCovariance?.94+rnd()*.12:.88+rnd()*.24)});this.splats.push(splat);
    }
    this.clips=gltf.animations??[];
    this.mixer=this.clips.length?new THREE.AnimationMixer(this.source):null;
    this.clipNames=this.clips.map(animation=>animation.name);
    if(this.mixer)this.setClip(this.clips[clip]?clip:0,{fade:0});
    this.update();
  }
  setClip(index,{fade=.2,phase,restart=false}={}){
    if(!this.mixer||!this.clips[index])throw new RangeError('Unknown animation clip.');
    const previous=this.action,next=this.mixer.clipAction(this.clips[index]);
    if(previous===next&&!restart)return;
    const actions=this.clips.map(clip=>this.mixer.existingAction(clip)).filter(Boolean);
    const from=new Map(actions.map(action=>[action,action.isScheduled()&&action.enabled?action.getEffectiveWeight():0]));
    const total=[...from.values()].reduce((a,b)=>a+b,0);
    if(restart||!from.get(next))next.reset();
    next.stopFading().stopWarping().setEffectiveTimeScale(1).play();
    if(phase!==undefined)next.time=Math.max(0,Math.min(1,phase))*this.clips[index].duration;
    if(previous&&fade>0&&total>0){
      for(const [action,weight] of from){from.set(action,weight/total);action.stopFading().setEffectiveWeight(weight/total);}
      if(!from.has(next)){from.set(next,0);next.setEffectiveWeight(0);}
      this.clipBlend={from,to:next,duration:fade,elapsed:0};
    }else{
      for(const action of actions)if(action!==next)action.stop();
      next.setEffectiveWeight(1);this.clipBlend=null;
    }
    this.action=next;this.currentClip=index;
  }
  advanceAnimation(dt){
    const blend=this.clipBlend;
    if(blend){
      blend.elapsed+=dt;const t=Math.min(1,blend.elapsed/blend.duration),smooth=t*t*(3-2*t);
      for(const [action,start] of blend.from)action.setEffectiveWeight(start*(1-smooth)+(action===blend.to?smooth:0));
    }
    this.mixer?.update(dt);
    if(blend&&blend.elapsed>=blend.duration){for(const action of blend.from.keys())if(action!==blend.to)action.stop();this.clipBlend=null;}
  }
  updateVertices(){
    this.root.updateMatrixWorld(true);
    for(const entry of this.meshes){
      const {mesh,vertices}=entry,geometry=mesh.geometry,attributes=geometry.attributes;
      // Morphed, unskinned or re-authored geometry keeps three's own path.
      const direct=mesh.isSkinnedMesh&&attributes.skinIndex&&attributes.skinWeight&&!(geometry.morphAttributes.position&&mesh.morphTargetInfluences);
      if(!direct){
        entry.skin=null;
        for(let i=0;i<vertices.length/3;i++)mesh.getVertexPosition(i,slowVertex).applyMatrix4(mesh.matrixWorld).toArray(vertices,i*3);
        continue;
      }
      const skin=entry.skin;
      if(!skin||skin.matrices.length!==mesh.skeleton.bones.length*16||skin.attributes[0]!==attributes.position||skin.attributes[1]!==attributes.skinIndex||skin.attributes[2]!==attributes.skinWeight
        ||skin.attributes.some((attribute,i)=>attribute.version!==skin.versions[i]))entry.skin=skinTable(mesh);
      skinVertices(mesh,entry.skin,vertices);
    }
  }
  /** Flat copies of what the per-frame loop reads of each sample's triangle.
   * The sample objects remain the source for pigment, radius and opacity,
   * which scenes adjust after loading; triangles and weights never change. */
  surfaceTables(){
    const samples=this.samples;
    if(this.tables?.samples===samples.length)return this.tables;
    const triangles=[],seen=new Map(),entries=[],triangleOf=new Uint32Array(samples.length),weights=new Float64Array(samples.length*3);
    samples.forEach((sample,i)=>{
      let t=seen.get(sample.triangle);
      if(t===undefined){t=triangles.length;seen.set(sample.triangle,t);triangles.push(sample.triangle);}
      triangleOf[i]=t;weights.set(sample.weights,i*3);
    });
    const count=triangles.length,ids=new Uint32Array(count*3),rest=new Float64Array(count*3),entryOf=new Uint16Array(count);
    triangles.forEach((triangle,t)=>{
      ids.set(triangle.ids,t*3);rest.set([triangle.restLength,triangle.restX,triangle.restY],t*3);
      let e=entries.indexOf(triangle.entry.vertices);if(e<0){e=entries.length;entries.push(triangle.entry.vertices);}
      entryOf[t]=e;
    });
    // Per triangle: the u, v and normal axes of its surface frame, then its shade.
    return this.tables={samples:samples.length,count,triangleOf,weights,ids,rest,entryOf,entries,frames:new Float64Array(count*10),valid:new Uint8Array(count)};
  }
  update(dt=0){
    this.onBeforePose?.();this.advanceAnimation(dt);this.onPose?.(dt);this.updateVertices();this.onVertices?.(this.meshes);
    this.surfaceVersion++;
    const {count,triangleOf,weights,ids,rest,entryOf,entries,frames,valid}=this.surfaceTables(),samples=this.samples,splats=this.splats,deform=this.deformCovariance,lx=light.x,ly=light.y,lz=light.z;
    // The surface frame of each deformed triangle. This is three's Vector3
    // arithmetic written out (subVectors, crossVectors, normalize,
    // addScaledVector, setLength), in the same order, so the doubles are the
    // ones the vector calls gave.
    for(let t=0;t<count;t++){
      const p=entries[entryOf[t]],k=t*3,f=t*10,j0=ids[k]*3,j1=ids[k+1]*3,j2=ids[k+2]*3,ax=p[j0],ay=p[j0+1],az=p[j0+2];
      const ex=p[j1]-ax,ey=p[j1+1]-ay,ez=p[j1+2]-az,cx=p[j2]-ax,cy=p[j2+1]-ay,cz=p[j2+2]-az;
      let nx=ey*cz-ez*cy,ny=ez*cx-ex*cz,nz=ex*cy-ey*cx;
      if(!(nx*nx+ny*ny+nz*nz>1e-18)){valid[t]=0;continue;}
      valid[t]=1;
      let scale=1/(Math.sqrt(nx*nx+ny*ny+nz*nz)||1);nx*=scale;ny*=scale;nz*=scale;
      frames[f+6]=nx;frames[f+7]=ny;frames[f+8]=nz;
      if(deform){
        scale=1.12/rest[k];const ux=ex*scale,uy=ey*scale,uz=ez*scale;
        const along=-rest[k+1]/rest[k];scale=.92/rest[k+2];
        const vx=(cx+ex*along)*scale,vy=(cy+ey*along)*scale,vz=(cz+ez*along)*scale;
        const theta=.5*Math.atan2(2*(ux*vx+uy*vy+uz*vz),(ux*ux+uy*uy+uz*uz)-(vx*vx+vy*vy+vz*vz)),cos=Math.cos(theta),sin=Math.sin(theta),back=-sin;
        let x=ux*cos+vx*sin,y=uy*cos+vy*sin,z=uz*cos+vz*sin,length=Math.sqrt(x*x+y*y+z*z);
        scale=1/(length||1);x*=scale;y*=scale;z*=scale;scale=Math.max(.6,Math.min(1.8,length));frames[f]=x*scale;frames[f+1]=y*scale;frames[f+2]=z*scale;
        x=vx*cos+ux*back;y=vy*cos+uy*back;z=vz*cos+uz*back;length=Math.sqrt(x*x+y*y+z*z);
        scale=1/(length||1);x*=scale;y*=scale;z*=scale;scale=Math.max(.6,Math.min(1.8,length));frames[f+3]=x*scale;frames[f+4]=y*scale;frames[f+5]=z*scale;
      }else{
        scale=1/(Math.sqrt(ex*ex+ey*ey+ez*ez)||1);frames[f]=ex*scale*1.12;frames[f+1]=ey*scale*1.12;frames[f+2]=ez*scale*1.12;
        const x=ny*ez-nz*ey,y=nz*ex-nx*ez,z=nx*ey-ny*ex;
        scale=1/(Math.sqrt(x*x+y*y+z*z)||1);frames[f+3]=x*scale*.92;frames[f+4]=y*scale*.92;frames[f+5]=z*scale*.92;
      }
      frames[f+9]=.72+.28*Math.max(0,nx*lx+ny*ly+nz*lz);
    }
    // The same sums, products and order as before, without per-splat
    // closures or temporaries. A collapsed triangle hides its marks and
    // leaves their last axes and color in place.
    for(let i=0;i<samples.length;i++){
      const t=triangleOf[i],k=t*3,w=i*3,p=entries[entryOf[t]],i0=ids[k]*3,i1=ids[k+1]*3,i2=ids[k+2]*3,w0=weights[w],w1=weights[w+1],w2=weights[w+2],splat=splats[i],center=splat.center;
      center[0]=0+p[i0]*w0+p[i1]*w1+p[i2]*w2;
      center[1]=0+p[i0+1]*w0+p[i1+1]*w1+p[i2+1]*w2;
      center[2]=0+p[i0+2]*w0+p[i1+2]*w1+p[i2+2]*w2;
      if(!valid[t]){splat.opacity=0;continue;}
      const sample=samples[i],f=t*10,radius=sample.radius,thickness=radius*.28,pigment=sample.pigment,shade=frames[f+9],axes=splat.axes,color=splat.color,au=axes[0],av=axes[1],an=axes[2];
      splat.opacity=sample.opacity;
      au[0]=frames[f]*radius;au[1]=frames[f+1]*radius;au[2]=frames[f+2]*radius;
      av[0]=frames[f+3]*radius;av[1]=frames[f+4]*radius;av[2]=frames[f+5]*radius;
      an[0]=frames[f+6]*thickness;an[1]=frames[f+7]*thickness;an[2]=frames[f+8]*thickness;
      color[0]=pigment[0]*shade;color[1]=pigment[1]*shade;color[2]=pigment[2]*shade;
    }
  }
  writePacked(data,centers,start){
    const splats=this.splats;
    for(let i=0;i<splats.length;i++){
      const splat=splats[i],offset=(start+i)*20,center=splat.center,axes=splat.axes,color=splat.color,target=(start+i)*3;
      const x=center[0],y=center[1],z=center[2],a=axes[0],b=axes[1],c=axes[2];
      data[offset]=x;data[offset+1]=y;data[offset+2]=z;data[offset+3]=splat.opacity;
      data[offset+4]=a[0];data[offset+5]=a[1];data[offset+6]=a[2];
      data[offset+8]=b[0];data[offset+9]=b[1];data[offset+10]=b[2];
      data[offset+12]=c[0];data[offset+13]=c[1];data[offset+14]=c[2];
      data[offset+16]=color[0];data[offset+17]=color[1];data[offset+18]=color[2];
      centers[target]=x;centers[target+1]=y;centers[target+2]=z;
    }
  }
  dispose(){this.mixer?.stopAllAction();this.mixer?.uncacheRoot(this.source);disposeGLTF(this.source);}
}

function disposeGLTF(root){
  const resources=new Set(),images=new Set();
  root.traverse(object=>{
    if(object.geometry)resources.add(object.geometry);
    if(object.skeleton)resources.add(object.skeleton);
    for(const material of object.material?(Array.isArray(object.material)?object.material:[object.material]):[]){
      resources.add(material);
      for(const value of Object.values(material))if(value?.isTexture){resources.add(value);if(value.image?.close)images.add(value.image);}
    }
  });
  resources.forEach(resource=>resource.dispose());images.forEach(image=>image.close());
}
