/** Signed shoreline fields keep terrain edges continuous across their splats. */
export function organicOvalDistance(x,z,cx,cz,rx,rz,phase=0){
  const dx=(x-cx)/rx,dz=(z-cz)/rz,a=Math.atan2(dz,dx);
  const rim=1+.055*Math.sin(a*3+phase)+.028*Math.sin(a*7-phase)+.018*Math.sin(a*11+.7);
  return (rim-Math.hypot(dx,dz))*Math.min(rx,rz);
}
export const openingWaterDistance=(x,z)=>organicOvalDistance(x,z,0,31,54,35,.8);
export const openingLandDistance=(x,z)=>organicOvalDistance(x,z,0,-49,68,77,1.7);
export const deepBasinDistance=(x,z)=>organicOvalDistance(x,z,-86,-13,61,68,.3);
export const upperBasinDistance=(x,z)=>organicOvalDistance(x,z,-54,49,31,37,1.2);
export function downstreamBankDistance(x,z){
  const front=6.1+.4*Math.sin(x*.24)-z,west=-72+1.5*Math.sin(z*.13)-x;
  const join=.5*(front+west+Math.sqrt((front-west)**2+9));
  return Math.min(deepBasinDistance(x,z),join);
}
