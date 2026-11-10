/** Conservative submission culling. These bounds enclose the vertex shader's
 * existing rejection guard, including every DOF/LOD footprint during a pull.
 * Transparent overlap is deliberately not treated as opaque occlusion. */
export class SplatVisibility {
  constructor(data,count){this.update(data,count);}
  update(data,count){
    if(!this.sigma||this.sigma.length<count)this.sigma=new Float32Array(count);
    for(let i=0;i<count;i++){
      const k=i*20;
      this.sigma[i]=Math.max(Math.hypot(data[k+4],data[k+5],data[k+6]),Math.hypot(data[k+8],data[k+9],data[k+10]),Math.hypot(data[k+12],data[k+13],data[k+14]));
    }
  }
  write(order,centers,camera,options,foreground,background,flags,{width,height,wind,actorStart=Infinity,reflection=false,transition=false}={}){
    camera.updateMatrixWorld(true);
    const m=camera.matrixWorldInverse.elements,p=camera.projectionMatrix.elements;
    const tx=1/p[0],ty=1/p[5],brush=options.brushScale??1;
    // The maximum focus envelope avoids reculling/uploading indices during
    // focus pulls and LOD fades, while retaining even their largest soft edges.
    const blur=options.foregroundDOF&&!reflection?(options.dofStrength??.65):0;
    const footprint=(transition?1.08:1)*(1+blur*1.5)*(options.mode==='ghibli'?1+(options.gouacheBlend??.7)*.18:1);
    const rx=3*brush*footprint*Math.sqrt(1+tx*tx),ry=3*brush*footprint*Math.sqrt(1+ty*ty);
    const gx=tx+6*height*.024*blur/(width*p[0]*.5),gy=ty+6*height*.024*blur/(height*p[5]*.5);
    let front=0,back=0;
    for(const index of order){
      // Shader-deformed plants, drifting clouds and skinned actors retain their
      // full submission. Rest-pose bounds must never clip moving silhouettes.
      if(index<actorStart&&!(wind?.[index*4+3]>.5)){
        const k=index*3,x=centers[k],y=centers[k+1],z=centers[k+2],sigma=this.sigma[index];
        const px=m[0]*x+m[4]*y+m[8]*z+m[12],py=m[1]*x+m[5]*y+m[9]*z+m[13];
        const d=-(m[2]*x+m[6]*y+m[10]*z+m[14]);
        // Expand in world/view units to absorb float32 GPU rounding at edges.
        const margin=1e-4*(1+Math.abs(px)+Math.abs(py)+Math.abs(d)+sigma*brush);
        if(d<Math.max(camera.near,.08,sigma*brush*1.5)-margin||d>camera.far+margin
          ||Math.abs(px)>d*gx+sigma*rx+margin||Math.abs(py)>d*gy+sigma*ry+margin)continue;
      }
      if(background&&flags[index])background[back++]=index;
      else foreground[front++]=index;
    }
    return {foreground:front,background:back,submitted:front+back,culled:order.length-front-back};
  }
}
