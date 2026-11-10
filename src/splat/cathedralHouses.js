/** Low, all-sided village volumes painted with the distant spire's broad soft marks. */
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const hex=s=>s.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const PLASTER=['#a7b5ce','#b5bfd2','#c1c4d3','#cbc6d0','#d4cbc9'].map(hex);
const ROOF=['#7b8ead','#8e9cb8','#9facc2','#b4bccb'].map(hex);
const RECESS=['#7487a7','#8292af','#91a0bb'].map(hex);
const ROSE=hex('#c5b2bf');
const noise=(x,y,z)=>.55*Math.sin(x*1.1+Math.sin(z*.7))+.3*Math.sin(y*1.9+x*.4)+.15*Math.sin(z*2.7);
export const DEFAULT_CATHEDRAL_HOUSES=Object.freeze([
 {x:-22.0,z:4.7,width:5.1,depth:4.6,height:4.4,roofHeight:1.75,yaw:.06,warmth:.17},
 {x:-28.0,z:3.1,width:4.4,depth:4.0,height:3.65,roofHeight:1.55,yaw:-.13,warmth:.08},
 {x:-17.8,z:2.0,width:4.0,depth:4.4,height:3.5,roofHeight:1.55,yaw:-.09,warmth:.12},
 {x:-23.8,z:-.6,width:5.0,depth:4.8,height:5.15,roofHeight:1.95,yaw:.02,warmth:.04},
 {x:-30.8,z:-.7,width:4.2,depth:4.4,height:4.15,roofHeight:1.65,yaw:.09,warmth:.19},
 {x:-18.9,z:-2.1,width:4.35,depth:4.5,height:4.65,roofHeight:1.7,yaw:-.1,warmth:.09},
]);

/** Optional houses/origin/scale let the view composition move without flattening geometry. */
export function buildCathedralHouses(F,{houses=DEFAULT_CATHEDRAL_HOUSES,origin=[0,0],scale=1}={}){
 const start=F.splats.length,bounds={min:[Infinity,0,Infinity],max:[-Infinity,0,-Infinity]};
 const rnd=F.rnd;
 for(const [houseIndex,house]of houses.entries()){
  const {x,z,width:w,depth:d,height:h,roofHeight:rh,yaw=0,warmth=0}=house;
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const rotate=v=>[c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]];
  const world=p=>add([origin[0]+x*scale,0,origin[1]+z*scale],mul(rotate(p),scale));
  const roofPalette=houseIndex%3===0?ROOF.map(v=>mix(v,ROSE,.13)):ROOF;
  function pigment(p,n,palette){
   const field=clamp(.49-.10*n[0]+.025*n[1]+noise(p[0]*.28,p[1]*.3,p[2]*.26)*.14+(rnd()-.5)*.10);
   const color=palette[Math.min(palette.length-1,Math.floor(field*palette.length))];
   return palette===PLASTER?mix(color,ROSE,warmth):color;
  }
  function emit(p,n,direction,palette=PLASTER,{width=.31,length=.61,opacity=.94}={}){
   const wp=world(p),wn=rotate(n),spread=.8+rnd()*.35;
   F.mark(wp,wn,rotate(direction),width*scale*spread,length*scale*spread,(.10+rnd()*.045)*scale,pigment(wp,wn,palette),opacity,'stone');
   for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],wp[k]);bounds.max[k]=Math.max(bounds.max[k],wp[k]);}
  }
  function face(o,u,v,{palette=PLASTER,density=2.25,cut=null,coarse=1}={}){
   const lu=Math.hypot(...u),lv=Math.hypot(...v),nx=Math.max(1,Math.ceil(lu*Math.sqrt(density))),ny=Math.max(1,Math.ceil(lv*Math.sqrt(density))),n=unit(cross(u,v));
   const direction=Math.abs(v[1])>.1?unit(v):unit(u);
   for(let row=0;row<ny;row++)for(let col=0;col<nx;col++){
    const p=add(add(o,mul(u,(col+.15+rnd()*.7)/nx)),mul(v,(row+.15+rnd()*.7)/ny));
    if(cut?.(p))continue;
    emit(p,n,direction,palette,{width:.32*coarse,length:.63*coarse});
   }
  }
  function triangle(a,b,c,palette=PLASTER){
   const ab=sub(b,a),ac=sub(c,a),cr=cross(ab,ac),area=Math.hypot(...cr)*.5,n=unit(cr),count=Math.ceil(area*2.5);
   for(let i=0;i<count;i++){
    const r=Math.sqrt(rnd()),q=rnd(),p=add(add(mul(a,1-r),mul(b,r*(1-q))),mul(c,r*q));
    emit(p,n,[.18,1,.03],palette,{width:.31,length:.57});
   }
  }
  const windowBottom=Math.min(1.7,h*.36),windowTop=windowBottom+1.12;
  const frontWindows=[-w*.26,w*.26];
  const doorway={x:-w*.06,width:.7,top:1.9};
  const openings=p=>frontWindows.some(cx=>Math.abs(p[0]-cx)<.43&&p[1]>windowBottom&&p[1]<windowTop)||(Math.abs(p[0]-doorway.x)<doorway.width/2&&p[1]<doorway.top);
  // Walls have actual omitted openings with recessed pigment planes behind them.
  face([-w/2,0,d/2],[w,0,0],[0,h,0],{cut:openings});
  face([w/2,0,-d/2],[-w,0,0],[0,h,0],{density:1.9});
  face([-w/2,0,-d/2],[0,0,d],[0,h,0],{density:2.1});
  face([w/2,0,d/2],[0,0,-d],[0,h,0],{density:2.1});
  face([-w/2,0,-d/2],[w,0,0],[0,0,d],{density:1.3});
  for(const cx of frontWindows){
   face([cx-.44,windowBottom,d/2-.18],[.88,0,0],[0,1.12,0],{palette:RECESS,density:6,coarse:.68});
   // A few muted mullion and sill marks imply windows without crisp outlines.
   for(let i=0;i<3;i++)emit([cx,windowBottom+.16+i*.37,d/2-.04],[0,0,1],[0,1,0],PLASTER,{width:.075,length:.22,opacity:.9});
   emit([cx,windowBottom-.06,d/2+.06],[0,0,1],[1,0,0],PLASTER,{width:.13,length:.39});
  }
  face([doorway.x-doorway.width/2,.02,d/2-.21],[doorway.width,0,0],[0,doorway.top-.02,0],{palette:RECESS,density:5,coarse:.72});
  // Two full roof slopes and front/rear triangular gables close the upper volume.
  const eave=.2;
  face([-w/2-eave,h,d/2+eave],[w/2+eave,rh,0],[0,0,-d-2*eave],{palette:roofPalette,density:2.35});
  face([0,h+rh,d/2+eave],[w/2+eave,-rh,0],[0,0,-d-2*eave],{palette:roofPalette,density:2.35});
  triangle([-w/2,h,d/2],[w/2,h,d/2],[0,h+rh,d/2]);
  triangle([w/2,h,-d/2],[-w/2,h,-d/2],[0,h+rh,-d/2]);
  // A small second pass breaks up each roof into broad, low-contrast paint notes.
  for(let i=0;i<36;i++){
   const side=i%2?1:-1,px=side*rnd()*(w/2+eave),pz=(rnd()-.5)*(d+2*eave);
   const p=[px,h+rh*(1-Math.abs(px)/(w/2+eave))+.045,pz],n=unit([side*rh,w/2+eave,0]);
   emit(p,n,[side*(w/2+eave),-rh,.12],roofPalette,{width:.28,length:.54,opacity:.91});
  }
  // A squat, softly painted chimney has four walls and a pale solid cap.
  const chimneyX=(houseIndex%2?-.19:.18)*w,chimneyZ=-d*.17,chimneyBottom=h+rh*.52,chimneyTop=h+rh+.6;
  const cw=.55,cd=.62,ch=chimneyTop-chimneyBottom;
  face([chimneyX-cw/2,chimneyBottom,chimneyZ+cd/2],[cw,0,0],[0,ch,0],{density:3.3,coarse:.72});
  face([chimneyX+cw/2,chimneyBottom,chimneyZ-cd/2],[-cw,0,0],[0,ch,0],{density:3.3,coarse:.72});
  face([chimneyX-cw/2,chimneyBottom,chimneyZ-cd/2],[0,0,cd],[0,ch,0],{density:3.3,coarse:.72});
  face([chimneyX+cw/2,chimneyBottom,chimneyZ+cd/2],[0,0,-cd],[0,ch,0],{density:3.3,coarse:.72});
  face([chimneyX-cw/2,chimneyTop,chimneyZ+cd/2],[cw,0,0],[0,0,-cd],{density:4,coarse:.65});
  // Scattered foundation dabs tie the walls to the pavement on every side.
  for(let i=0;i<28;i++){
   const a=i*Math.PI*2/28,p=[Math.cos(a)*w*.51,.08,Math.sin(a)*d*.51];
   emit(p,[0,1,0],[1,0,.2],PLASTER,{width:.36,length:.62,opacity:.91});
  }
 }
 return {count:F.splats.length-start,houseCount:houses.length,bounds,strokeScale:'coarse',material:'stone'};
}
