/** Occasional distant white doves, drawn entirely as animated 3D splats. */
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
export const DOVE_COUNT=12,DOVE_PERIOD=90;
export function createDoveFlock(height=()=>10,{pose}={}){
 const splats=[],birds=[];
 for(let i=0;i<DOVE_COUNT;i++){
  const parts=[];
  function part(p,r,kind,side=0){
   const s={center:[0,0,0],axes:[[r[0],0,0],[0,r[1],0],[0,0,r[2]]],color:kind==='wing'?[1,1,.97]:[.92,.96,.94],opacity:0,seed:(i*.618+parts.length*.17)%1,material:'actor'};
   parts.push({s,p,r,kind,side});splats.push(s);
  }
  part([0,0,0],[.20,.085,.09],'body');
  part([.22,.025,0],[.085,.075,.07],'head');
  part([-.24,-.015,0],[.13,.04,.12],'tail');
  for(const side of [-1,1])for(let j=0;j<3;j++)part([-.03-j*.045,0,side*(.12+j*.12)],[.13-j*.022,.034,.10-j*.014],'wing',side);
  birds.push({parts,scale:1.2+(i%4)*.11,phase:i*2.39996323,position:[0,0,0]});
 }
 function update(time){
  const cycle=((time%DOVE_PERIOD)+DOVE_PERIOD)%DOVE_PERIOD;
  for(const [i,b]of birds.entries()){
   const flight=(cycle-8-i*.15)/26,t=clamp(flight);
   let alpha=smooth(flight*16)*smooth((1-flight)*16);
   let x=-67+t*165-(i%4)*1.1,z=-53-t*12+(i%4-1.5)*1.5;
   let y=height(x,z)+6.8+(Math.floor(i/4)-1)*.65+.3*Math.sin(t*6+b.phase);
   let yaw=Math.atan2(12,165),bank=0;
   if(pose){
    const placement=pose(time,i);
    [x,y,z]=placement.position;
    yaw=placement.yaw;bank=placement.bank??0;alpha=placement.opacity??1;
   }
   b.position[0]=x;b.position[1]=y;b.position[2]=z;
   const c=Math.cos(yaw),s=Math.sin(yaw),cb=Math.cos(bank),sb=Math.sin(bank);
   const flap=Math.sin(time*7.4+b.phase)*.78+.18;
   for(const q of b.parts){
    let [px,py,pz]=q.p;const r=q.r,splat=q.s,wing=q.kind==='wing';
    if(wing){py+=Math.abs(pz)*Math.sin(flap);pz*=Math.cos(flap);}
    const by=py*cb+pz*sb;pz=pz*cb-py*sb;py=by;
    px*=b.scale;py*=b.scale;pz*=b.scale;
    splat.center[0]=x+c*px+s*pz;splat.center[1]=y+py;splat.center[2]=z-s*px+c*pz;splat.opacity=alpha*.99;
    const a=(wing?q.side*flap:0)+bank,ca=Math.cos(a),sa=Math.sin(a),rx=r[0]*b.scale,ry=r[1]*b.scale,rz=r[2]*b.scale;
    splat.axes[0]=[c*rx,0,-s*rx];splat.axes[1]=[-s*sa*ry,ca*ry,-c*sa*ry];splat.axes[2]=[s*ca*rz,sa*rz,c*ca*rz];
   }
  }
 }
 update(0);
 return {splats,birds,update,count:DOVE_COUNT,period:DOVE_PERIOD};
}
export function attachDoveFlock(actor,height){
 const doves=createDoveFlock(height),advance=actor.advance;
 actor.splats.push(...doves.splats);actor.doves=doves;
 actor.activity='Dog running · sheep grazing · doves passing';
 actor.advance=dt=>{advance(dt);doves.update(actor.time);};
 return actor;
}
