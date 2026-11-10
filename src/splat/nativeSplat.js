/** antimatter15 .splat: XYZ, three scales, RGBA, then quantized WXYZ rotation.
 * Native Gaussian shape/opacity/color are preserved; no mesh resampling or SH
 * reconstruction is involved. https://github.com/antimatter15/splat */
export function decodeNativeSplat(buffer,{height=3,flipYZ=true}={}){
  if(!(buffer instanceof ArrayBuffer)||!buffer.byteLength||buffer.byteLength%32)throw new Error('Invalid .splat byte length.');
  const count=buffer.byteLength/32;if(count>500000)throw new Error('This study supports up to 500,000 native splats.');
  const view=new DataView(buffer),bytes=new Uint8Array(buffer),splats=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<count;i++){
    const k=i*32,p=[0,1,2].map(c=>view.getFloat32(k+c*4,true)),scales=[0,1,2].map(c=>view.getFloat32(k+12+c*4,true));
    if(![...p,...scales].every(Number.isFinite)||scales.some(s=>s<=0))throw new Error(`Invalid native splat ${i}.`);
    const q=[0,1,2,3].map(c=>(bytes[k+28+c]-128)/128),length=Math.hypot(...q);
    if(length<.001)throw new Error(`Invalid native splat rotation ${i}.`);
    const [w,x,y,z]=q.map(v=>v/length);
    const axes=[[1-2*(y*y+z*z),2*(x*y+z*w),2*(x*z-y*w)],
      [2*(x*y-z*w),1-2*(x*x+z*z),2*(y*z+x*w)],
      [2*(x*z+y*w),2*(y*z-x*w),1-2*(x*x+y*y)]].map((axis,a)=>axis.map((v,c)=>v*scales[a]*(flipYZ&&c? -1:1)));
    const center=p.map((v,c)=>v*(flipYZ&&c?-1:1));
    for(let c=0;c<3;c++){min[c]=Math.min(min[c],center[c]);max[c]=Math.max(max[c],center[c]);}
    splats.push({center,axes,color:[bytes[k+24]/255,bytes[k+25]/255,bytes[k+26]/255],opacity:bytes[k+27]/255,seed:((Math.imul(i+1,2654435761)>>>0)/2**32),material:'native-splat'});
  }
  const scale=height/(max[1]-min[1]);if(!Number.isFinite(scale)||scale<=0)throw new Error('Native splat height must be positive.');
  const origin=[(min[0]+max[0])*.5,min[1],(min[2]+max[2])*.5];
  for(const s of splats){s.center=s.center.map((v,c)=>(v-origin[c])*scale);s.axes=s.axes.map(axis=>axis.map(v=>v*scale));}
  return splats;
}
