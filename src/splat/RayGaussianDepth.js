/** StopThePop's maximum-contribution ray depth:
 * t = (r^T Sigma^-1 mu) / (r^T Sigma^-1 r), camera origin zero.
 * Rays have z=-1, so t is positive view depth, not Euclidean distance.
 * https://r4dl.github.io/StopThePop/ — independent implementation. */
export function writeRayGaussian(data,index,view,output,brushScale=1){
  const k=index*20,j=index*12,m=view;
  const x=data[k],y=data[k+1],z=data[k+2],mu=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];
  const axes=[4,8,12].map(slot=>{
    const x=data[k+slot]*brushScale,y=data[k+slot+1]*brushScale,z=data[k+slot+2]*brushScale;
    return [m[0]*x+m[4]*y+m[8]*z,m[1]*x+m[5]*y+m[9]*z,m[2]*x+m[6]*y+m[10]*z];
  });
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const rows=[cross(axes[1],axes[2]),cross(axes[2],axes[0]),cross(axes[0],axes[1])];
  if(dot(axes[0],rows[0])===0)throw new Error('Per-ray sorting requires full-rank Gaussian axes.');
  // Sigma=A*A^T. Whiten with inverse(A), whose common determinant cancels.
  // Squared row dot products avoid the catastrophic quadratic cancellation
  // that an expanded precision matrix suffers on thin, grazing splats.
  const scale=Math.max(...rows.map(r=>Math.hypot(...r)));
  for(let i=0;i<3;i++){const row=rows[i].map(v=>v/scale);output.set([...row,dot(row,mu)],j+i*4);}
}
export function rayGaussianDepth(data,index,rx,ry){
  const j=index*12,a=data[j]*rx+data[j+1]*ry-data[j+2],b=data[j+4]*rx+data[j+5]*ry-data[j+6],c=data[j+8]*rx+data[j+9]*ry-data[j+10];
  return Math.max(0,(a*data[j+3]+b*data[j+7]+c*data[j+11])/Math.max(a*a+b*b+c*c,1e-30));
}
