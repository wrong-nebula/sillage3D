import * as THREE from 'three';

/** Conservative particle protection, including the optical sampling footprint. */
export class LensParticleMask {
  constructor() {
    this.target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,stencilBuffer:false,
      minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,colorSpace:THREE.NoColorSpace});
    this.geometry=new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
    this.geometry.setIndex([0,1,2,0,2,3]);
    this.material=new THREE.ShaderMaterial({
      uniforms:{viewport:{value:new THREE.Vector2()},margin:{value:0},brushScale:{value:1}},
      vertexShader:`
        attribute vec3 particleCenter;
        attribute float particleRadius;
        uniform vec2 viewport;
        uniform float margin;
        uniform float brushScale;
        varying vec2 local;
        varying float feather;
        void main(){
          vec4 p=modelViewMatrix*vec4(particleCenter,1.);
          if(p.z>=-.08){gl_Position=vec4(2.,2.,2.,1.);return;}
          float focal=max(projectionMatrix[0][0]*viewport.x,projectionMatrix[1][1]*viewport.y)*.5;
          float extent=3.*particleRadius*brushScale*focal/(-p.z)+margin+2.;
          local=position.xy;feather=2./extent;
          gl_Position=projectionMatrix*p;
          gl_Position.xy+=position.xy*extent*2./viewport*gl_Position.w;
        }`,
      fragmentShader:`
        varying vec2 local;
        varying float feather;
        void main(){
          float mask=1.-smoothstep(1.-feather,1.,length(local));
          gl_FragColor=vec4(vec3(mask),1.);
        }`,
      depthTest:false,depthWrite:false,blending:THREE.CustomBlending,
      blendEquation:THREE.MaxEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,
      toneMapped:false,
    });
    this.scene=new THREE.Scene();
    const mesh=new THREE.Mesh(this.geometry,this.material);mesh.frustumCulled=false;
    this.scene.add(mesh);this.clearColor=new THREE.Color();
  }

  render(renderer,camera,particles,width,height,brushScale,margin) {
    const {indices,centers,data}=particles;
    if(this.indices!==indices||this.data!==data){
      if(this.positions)this.geometry.dispose();
      this.indices=indices;this.data=data;
      this.positions=new THREE.InstancedBufferAttribute(new Float32Array(indices.length*3),3).setUsage(THREE.DynamicDrawUsage);
      const radii=new Float32Array(indices.length);
      for(let i=0;i<indices.length;i++){
        const offset=indices[i]*20;
        radii[i]=Math.max(Math.hypot(...data.subarray(offset+4,offset+7)),
          Math.hypot(...data.subarray(offset+8,offset+11)),Math.hypot(...data.subarray(offset+12,offset+15)));
      }
      this.geometry.setAttribute('particleCenter',this.positions);
      this.geometry.setAttribute('particleRadius',new THREE.InstancedBufferAttribute(radii,1));
      this.geometry.instanceCount=indices.length;
    }
    for(let i=0;i<indices.length;i++){
      const source=indices[i]*3,target=i*3;
      this.positions.array[target]=centers[source];
      this.positions.array[target+1]=centers[source+1];
      this.positions.array[target+2]=centers[source+2];
    }
    this.positions.needsUpdate=true;
    const w=Math.max(1,Math.round(width*.5)),h=Math.max(1,Math.round(height*.5));
    if(this.target.width!==w||this.target.height!==h)this.target.setSize(w,h);
    this.material.uniforms.viewport.value.set(width,height);
    this.material.uniforms.margin.value=margin;
    this.material.uniforms.brushScale.value=brushScale;
    const previous=renderer.getRenderTarget(),alpha=renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    try{
      renderer.setRenderTarget(this.target);renderer.setClearColor(0,0);
      renderer.render(this.scene,camera);
    }finally{renderer.setRenderTarget(previous);renderer.setClearColor(this.clearColor,alpha);}
    return this.target.texture;
  }

  dispose(){this.target.dispose();this.geometry.dispose();this.material.dispose();}
}
