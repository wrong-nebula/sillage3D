/** A few distant stone silhouettes: broad planes, restrained detail and haze. */
import {pathX} from './ghibliPath.js';
const hex=h=>h.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);};
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
export function buildHillRocks({mark,rnd,height}){
 const rocks=[],colors=['#526d72','#879c96','#bbc1a5'].map(hex),haze=hex('#afc2b4');
 let count=0;
 for(const [group,z]of [-39,-54,-67,-61,-73,-79].entries()){
  const high=group>=3,cx=pathX(z)+(high?[11,-9,12][group-3]:group===1?-5:5);
  for(let j=0;j<3;j++){
   const x=cx+j*.94,pz=z+[0,1.1,-.6][j],r=[1.1,.55,.32][j]*(high?1.9:1-group*.12),h=r*(high?.42:.78),y=height(x,pz);
   const lower=[],upper=[];
   for(let k=0;k<5;k++){
    const a=k*Math.PI*2/5+.6+group,radius=r*(.85+rnd()*.2);
    lower.push([x+Math.cos(a)*radius,y-.07,pz+Math.sin(a)*radius*.72]);
    upper.push([x+Math.cos(a)*radius*.7+r*.12,y+h*(.58+rnd()*.16),pz+Math.sin(a)*radius*.48]);
   }
   const top=[x-r*.13,y+h,pz+r*.04],faces=[];let area=0;
   function face(a,b,c){let n=cross(sub(b,a),sub(c,a));const size=Math.hypot(...n)*.5;n=unit(n);if(n[1]<0)n=n.map(v=>-v);area+=size;faces.push({a,b,c,n,total:area});}
   for(let k=0;k<5;k++){const next=(k+1)%5;face(lower[k],lower[next],upper[k]);face(lower[next],upper[next],upper[k]);face(upper[k],upper[next],top);}
   const budget=[48,28,18][j],size=Math.sqrt(area/budget)*.69;let fi=0;
   for(let i=0;i<budget;i++){
    const target=(i+rnd())/budget*area;while(fi<faces.length-1&&faces[fi].total<target)fi++;
    const {a,b,c,n}=faces[fi],u=Math.sqrt(rnd()),v=rnd(),p=a.map((q,k)=>q*(1-u)+b[k]*u*(1-v)+c[k]*u*v);
    const light=-n[0]*.6+n[1]*.7+n[2]*.3,base=colors[light>.65?2:light>.1?1:0];
    const pigment=mix(base,haze,.22+Math.min(group,2)*.10);
    mark(p,n,[1,.2,.35],size*.8,size*1.1,size*.17,pigment,'stone');count++;
   }
   // Two quiet olive strokes suggest growth without adding close-up texture.
   for(let i=0;i<2;i++){mark([x+(i-.5)*r*.4,y+h*.86,pz], [0,1,0],[1,.05,.3],r*.12,r*.23,.025,mix(hex('#788b5d'),haze,.3+Math.min(group,2)*.1),'foliage');count++;}
   rocks.push({center:[x,y,pz],radius:r,height:h,count:budget+2});
  }
 }
 return {groups:6,rocks,count,reference:'howl-hillside-rocks.jpg'};
}
