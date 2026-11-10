/** Distant, fully modelled splat ridges from the supplied Howl meadow reference. */
const clamp=v=>Math.max(0,Math.min(1,v));
const hex=h=>h.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a);return a.map(v=>v/l);};
const PEAKS=[[-160,10],[-142,32],[-129,47],[-118,30],[-101,56],[-90,38],[-76,52],[-65,31],[-42,68],[-32,48],[-16,36],[4,57],[18,33],[32,62],[45,43],[61,55],[77,29],[96,43],[115,58],[133,25],[151,12],[164,4]];
const DETAIL_PEAKS=[-101,-42,32,115];
const detailWeight=x=>Math.max(...DETAIL_PEAKS.map(cx=>Math.exp(-(((x-cx)/10)**4))));
export const mountainRidgeZ=x=>-95+10*Math.sin(x*.036)+4*Math.sin(x*.091);
const ridgeZ=mountainRidgeZ;
function summit(x){
 const i=Math.max(0,PEAKS.findIndex(p=>p[0]>=x)-1),a=PEAKS[i],b=PEAKS[i+1]??a,t=clamp((x-a[0])/(b[0]-a[0]||1));
 return a[1]+(b[1]-a[1])*t+2.2*Math.sin(x*1.08)+1.1*Math.sin(x*2.47);
}
export function mountainHeight(x,z){
 const ridge=ridgeZ(x),q=Math.abs(z-ridge)/(z>ridge?34:37),f=Math.max(0,1-q);
 // Broken buttresses descend away from the spine, with unequal shaded gullies.
 const flow=x+q*13*Math.sin(x*.071),crease=Math.sin(flow*.48+Math.sin(flow*.19)*1.8);
 const fracture=(Math.abs(Math.sin(x*1.9+z*.23+Math.sin(x*.31)))-.5)*.48*detailWeight(x)*Math.sin(clamp(q)*Math.PI)*f;
 return 1.4+.30*(summit(x)*f**1.12+(crease*4.5+Math.sin(x*.9-z*.13)*1.3)*Math.sin(clamp(q)*Math.PI)*f)+fracture;
}
export function buildGhibliMountains({mark,rnd}){
 const step=2.15,faces=[],details=[];let area=0,detailArea=0,snowCount=0;
 function face(a,b,c){
  let n=cross(sub(b,a),sub(c,a));const size=Math.hypot(...n)*.5;
  if(size<.001)return;n=unit(n);if(n[1]<0)n=n.map(v=>-v);
  area+=size;faces.push({a,b,c,n,total:area});
  const x=(a[0]+b[0]+c[0])/3,z=(a[2]+b[2]+c[2])/3,y=(a[1]+b[1]+c[1])/3;
  if(detailWeight(x)>.3&&y>6&&z>ridgeZ(x)&&z<ridgeZ(x)+25){detailArea+=size;details.push({a,b,c,n,total:detailArea});}
 }
 for(let x=-160;x<161;x+=step)for(let z=-147;z<-46;z+=step){
  const subdivisions=detailWeight(x+step*.5)>.15&&z>ridgeZ(x)-3&&z<ridgeZ(x)+28?3:1,d=step/subdivisions;
  for(let ix=0;ix<subdivisions;ix++)for(let iz=0;iz<subdivisions;iz++){
   const px=x+ix*d,pz=z+iz*d,a=[px,mountainHeight(px,pz),pz],b=[px+d,mountainHeight(px+d,pz),pz],c=[px,mountainHeight(px,pz+d),pz+d],e=[px+d,mountainHeight(px+d,pz+d),pz+d];
   if(Math.max(a[1],b[1],c[1],e[1])<2)continue;
   face(a,b,c);face(b,e,c);
  }
 }
 const baseCount=11400,detailCount=1800,count=baseCount+detailCount,light=unit([-.8,1,.6]);
 const rockDark=hex('#344e60'),rockLight=hex('#8e9e9e'),greenDark=hex('#476752'),greenLight=hex('#91a16b');
 const snowDark=hex('#b9ced7'),snowLight=hex('#fffdf3'),haze=hex('#b6ccd0');
 function pigmentAt(p,n){
  const pigmentNormal=unit([n[0]/.30,n[1],n[2]/.30]);
  const lit=clamp(.37+pigmentNormal.reduce((s,q,k)=>s+q*light[k],0)*.63),alt=(p[1]-1.4)/.30;
  const crag=.5+.5*Math.sin(p[0]*.42+p[2]*.19+Math.sin(p[0]*.23)*2.5);
  const snowLine=24+5*Math.sin(p[0]*.2)+3*Math.sin(p[0]*.67+p[2]*.17);
  const snowy=alt>snowLine&&(pigmentNormal[1]>.52||crag>.54||alt>summit(p[0])*.84);
  let color;
  if(snowy){color=mix(snowDark,snowLight,.38+lit*.62);snowCount++;}
  else{
   color=mix(rockDark,rockLight,lit);
   const vegetation=clamp((31-alt)/17)*clamp(n[1]*1.5-.13);
   color=mix(color,mix(greenDark,greenLight,lit),vegetation);
  }
  const pigment=(snowy?.98:.94)+rnd()*(snowy?.025:.10);color=color.map(v=>v*pigment);
  color=mix(color,haze,(snowy?.06:.12)+clamp((-p[2]-125)/65)*.16);
  return {color,snowy};
 }
 for(const [patch,source,budget,surfaceArea]of [[false,faces,baseCount,area],[true,details,detailCount,detailArea]]){
  let fi=0;const radius=Math.sqrt(surfaceArea/budget)*(patch?.38:.7);
  for(let i=0;i<budget;i++){
   const target=(i+rnd())/budget*surfaceArea;while(fi<source.length-1&&source[fi].total<target)fi++;
   const {a,b,c,n}=source[fi],u=Math.sqrt(rnd()),v=rnd(),p=a.map((q,k)=>q*(1-u)+b[k]*u*(1-v)+c[k]*u*v);
   const pigment=pigmentAt(p,n);let color=pigment.color;
   if(patch){
    // Small cliff seams and broken snow gullies sit only on selected faces.
    const seam=Math.sin(p[0]*2.8+p[2]*.53+Math.sin(p[2]*.2)*2);
    color=seam>.35?mix(color,hex('#355669'),.42):pigment.snowy?mix(color,hex('#fffef5'),.6):mix(color,hex('#a4b8b9'),.23);
    for(let k=0;k<3;k++)p[k]+=n[k]*.18;
   }
   const size=radius*(.78+rnd()*.38);
   mark(p,n,patch?[.15,-.25,1]:[.36,1,.14],size*(patch?.47:.72),size*(patch?1.35:1.1),size*(patch?.11:.04),color,'stone');
  }
 }
 return {count,snowCount,detailCount,detailPeaks:DETAIL_PEAKS,peaks:PEAKS.length-2,bounds:[-160,164,-147,-46],reference:'howl-distant-mountains.png',construction:'Continuous triangulated mountain surface, sampled into volumetric pigment'};
}
