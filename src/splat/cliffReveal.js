const SIDE=513;
const clamp=x=>Math.max(0,Math.min(1,x));
function sample(data,x,z,stride=1,channel=0){
 const u=clamp(.5+x/118)*512,v=clamp(.5+z/108)*512;
 const col=Math.min(511,u|0),row=Math.min(511,v|0),fx=u-col,fz=v-row;
 const at=(x,y)=>data[(y*SIDE+x)*stride+channel]/255;
 return (at(col,row)*(1-fx)+at(col+1,row)*fx)*(1-fz)+(at(col,row+1)*(1-fx)+at(col+1,row+1)*fx)*fz;
}
/** Grow the construction out from LibreTerrain's eroded drainage network. */
export function makeCliffRevealField(maps){
 const distance=new Float32Array(SIDE*SIDE);
 for(let i=0;i<distance.length;i++)distance[i]=maps.erosion[i]>42?0:10000;
 for(let y=0;y<SIDE;y++)for(let x=0;x<SIDE;x++){
  const i=y*SIDE+x;
  if(x)distance[i]=Math.min(distance[i],distance[i-1]+1);
  if(y)distance[i]=Math.min(distance[i],distance[i-SIDE]+1);
  if(x&&y)distance[i]=Math.min(distance[i],distance[i-SIDE-1]+1.4142);
  if(x<SIDE-1&&y)distance[i]=Math.min(distance[i],distance[i-SIDE+1]+1.4142);
 }
 for(let y=SIDE-1;y>=0;y--)for(let x=SIDE-1;x>=0;x--){
  const i=y*SIDE+x;
  if(x<SIDE-1)distance[i]=Math.min(distance[i],distance[i+1]+1);
  if(y<SIDE-1)distance[i]=Math.min(distance[i],distance[i+SIDE]+1);
  if(x<SIDE-1&&y<SIDE-1)distance[i]=Math.min(distance[i],distance[i+SIDE+1]+1.4142);
  if(x&&y<SIDE-1)distance[i]=Math.min(distance[i],distance[i+SIDE-1]+1.4142);
 }
 const field=new Uint8Array(distance.length);
 for(let i=0;i<distance.length;i++)field[i]=Math.round(255*distance[i]/(distance[i]+28));
 return (x,y,z,seed,cover=false)=>{
  const drainage=sample(field,x,z),mineral=sample(maps.surface,x,z,5,2);
  if(cover){const density=sample(maps.vegetation,x,Math.min(z,108-z),4,0);return 6.1+.85*(1-density)+.45*drainage+.2*seed;}
  return .25+2.15*drainage+.36*clamp(y/38)+.42*mineral+.15*seed;
 };
}
