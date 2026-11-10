/** Tiny animated wool-and-stone-colored sheep from the supplied Howl hillside. */
export const SHEEP_SITES=[[3,-47],[7,-46],[10,-49],[1,-51],[5,-51],[9,-53],[13,-51],[4,-55],[8,-57],[12,-56],[16,-55],[10,-60],[15,-59],[19,-58]];
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const WOOL=[1,.98,.9],SHADE=[.73,.81,.78],FACE=[.28,.34,.30];
export function createSheepFlock(height,{entrance=false}={}){
 const splats=[],sheep=[];
 function part(parts,p,r,color,kind='body',extra={}){
  const s={center:[0,0,0],axes:[[r[0],0,0],[0,r[1],0],[0,0,r[2]]],color:[...color],opacity:.98,seed:(splats.length*.61803398875)%1,material:'actor'};
  const record={s,p,r,kind,...extra};parts.push(record);splats.push(s);return record;
 }
 SHEEP_SITES.forEach(([x,z],i)=>{
  const parts=[],scale=1.02+(i%5)*.065;
  for(let j=0;j<12;j++){
   const y=1-2*(j+.5)/12,a=j*2.39996323,ring=Math.sqrt(1-y*y);
   const p=[Math.cos(a)*ring*.17,.42+y*.15,Math.sin(a)*ring*.27];
   const light=.60+.4*(y+1)*.5,color=SHADE.map((v,k)=>v+(WOOL[k]-v)*light);
   part(parts,p,[.125,.12,.15],color);
  }
  part(parts,[0,.4,.29],[.09,.12,.12],WOOL,'neck');
  part(parts,[0,.49,.39],[.105,.12,.12],WOOL,'head');
  part(parts,[0,.44,.48],[.065,.075,.085],FACE,'head');
  for(const side of [-1,1]){
   part(parts,[side*.13,.51,.37],[.08,.035,.045],SHADE,'head');
   part(parts,[side*.082,.49,.46],[.018,.018,.019],[.18,.23,.20],'head');
  }
  for(const side of [-1,1])for(const end of [-1,1]){
   part(parts,[side*.135,.23,end*.19],[.035,.13,.04],SHADE,'leg',{side,end,lower:false});
   part(parts,[side*.135,.08,end*.19],[.028,.085,.035],FACE,'leg',{side,end,lower:true});
  }
  part(parts,[0,.43,-.34],[.06,.08,.07],WOOL,'tail');
  for(let j=0;j<3;j++){const p=part(parts,[(j-1)*.1,.025,(j-1)*.16],[.16,.008,.17],[.25,.35,.28],'shadow');p.s.opacity=.13;p.s.material='actor-shadow';}
  sheep.push({x,z,scale,phase:i*2.39996323,parts,position:[x,height(x,z),z]});
 });
 function update(time){
  for(const [i,a]of sheep.entries()){
   const arrival=entrance?1-smooth(i*.15,18+i*.15,time):0,walking=entrance?1-smooth(14+i*.15,18+i*.15,time):0;
   const cycle=time*(.11+i%4*.009)+a.phase,grazing=(1-walking)*(1-smooth(-.25,.5,Math.sin(time*.21+a.phase)));
   // Start just below the far side of the crest, so the first heads appear
   // during the dog's entrance rather than after a long unseen approach.
   const behind=-69-(i%3)*.6-a.z;
   const x=a.x+Math.sin(cycle)*.7+arrival*3,z=a.z+Math.cos(cycle*.83)*.5+arrival*behind,y=height(x,z);
   const wanderYaw=Math.atan2(Math.cos(cycle)*.7,-Math.sin(cycle*.83)*.415),entryYaw=Math.atan2(-3,-behind);
   const yaw=entryYaw+Math.atan2(Math.sin(wanderYaw-entryYaw),Math.cos(wanderYaw-entryYaw))*(1-walking),c=Math.cos(yaw),s=Math.sin(yaw);
   a.position[0]=x;a.position[1]=y;a.position[2]=z;
   const stride=(1-grazing)*(.06+walking*.06),bob=Math.abs(Math.sin(time*4+a.phase))*.009*(1-grazing);
   for(const q of a.parts){
    const p=[...q.p],r=q.r;
    if(['body','head','neck','tail'].includes(q.kind))p[1]+=.1;
    if(q.kind==='leg'&&!q.lower)p[1]+=.04;
    if(q.kind==='head'){p[1]-=grazing*.30;p[2]+=.07*grazing;}
    if(q.kind==='neck')p[1]-=grazing*.13;
    if(q.kind==='leg'){const step=Math.sin(time*4+a.phase+(q.side===q.end?0:Math.PI));p[2]+=step*stride*(q.lower?1:.5);p[1]+=Math.max(0,step)*stride*.45;}
    if(q.kind==='tail')p[0]+=.025*Math.sin(time*2+a.phase);
    const px=p[0]*a.scale,pz=p[2]*a.scale,splat=q.s;
    splat.center[0]=x+c*px+s*pz;splat.center[2]=z-s*px+c*pz;
    splat.center[1]=q.kind==='shadow'?height(splat.center[0],splat.center[2])+.025:y+p[1]*a.scale+bob;
    const rx=r[0]*a.scale,ry=r[1]*a.scale,rz=r[2]*a.scale;
    splat.axes[0][0]=c*rx;splat.axes[0][2]=-s*rx;splat.axes[1][1]=ry;splat.axes[2][0]=s*rz;splat.axes[2][2]=c*rz;
   }
  }
 }
 update(0);
 return {splats,sheep,update,count:SHEEP_SITES.length,reference:'howl-rocky-altitude.png'};
}

export function attachSheepFlock(dog,height,options={}){
 const flock=createSheepFlock(height,options),advanceDog=dog.advance;
 dog.dogSplatCount=dog.splats.length;dog.splats.push(...flock.splats);dog.flock=flock;dog.activity='Dog running · sheep grazing';
 dog.advance=dt=>{advanceDog(dt);flock.update(dog.time);};
 return dog;
}
