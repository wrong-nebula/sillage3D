/** Volumetric Gothic cathedral, authored as pigment-bearing Gaussian splats.
 * Front faces +Z. No image projection, sprites, mesh proxy or view-dependent geometry.
 */
const TAU=Math.PI*2;
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const hex=s=>s.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const STONE=['#4f6392','#5c6d9b','#6977a2','#7981a9','#8a89ae','#9b96b4','#b0a7bc','#c2b9c5'].map(hex);
const RECESS=['#40577e','#4a6088','#576a93','#67759e','#7a81a7'].map(hex);
const WARM=['#9990aa','#b0a0b0','#c2adb8','#cbbbca','#d5c5cf'].map(hex);
const ROOF=['#4c638c','#5b6d97','#6d7aa0','#8188ac'].map(hex);
const toLinear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const toSRGB=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
const luminance=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722;
const LOWER_RIGHT_BLUE=hex('#5a77b5').map(toLinear);
const blueLuminance=luminance(LOWER_RIGHT_BLUE);
const smoothRange=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const noise=(x,y,z)=>.5*Math.sin(x*1.73+Math.sin(z*.9))+.32*Math.sin(y*2.1+x*.42)+.18*Math.sin(z*3.1-y*.8);
const archHeight=(x,r,spring)=>spring+Math.sqrt(Math.max(0,4*r*r-(Math.abs(x)+r)**2));
const insideArch=(x,y,r,spring,base=0)=>Math.abs(x)<r&&y>=base&&y<archHeight(x,r,spring);

export function buildCathedralArchitecture(F){
 const start=F.splats.length;
 const rnd=F.rnd;
 function colorAt(p,n,palette=STONE,offset=0,texture=1){
  const broad=noise(p[0]*.18,p[1]*.14,p[2]*.17),pigment=noise(p[0]*4.1,p[1]*4.4,p[2]*3.7);
  const upper=clamp((p[1]-4)/29),left=clamp((10-p[0])/25);
  // The facade is a painted value field: cool cobalt at lower right, violet
  // midtones, and restrained warm scumbling toward the upper-left stone.
  const value=.27+upper*.16+left*.16-n[0]*.06+n[1]*.025+n[2]*.015
   +broad*.105+(pigment*.12+(rnd()-.5)*.22)*texture+offset*.28;
  let c=palette[Math.min(palette.length-1,Math.floor(clamp(value)*palette.length))];
  const warmth=upper*left*clamp(.5+broad);
  if(palette===STONE&&rnd()<warmth*.58)c=mix(c,WARM[1+Math.floor(rnd()*3)],.32+.25*texture);
  if(palette===STONE){
   // A restrained local cobalt glaze keeps the painted light/dark value intact.
   // It fades through the central portal and out completely above the lower facade.
   const amount=.26*smoothRange(-5,10,p[0])*(1-smoothRange(5,17,p[1]));
   if(amount>0){
    const linear=c.map(toLinear),gain=luminance(linear)/blueLuminance;
    c=linear.map((v,i)=>toSRGB(v*(1-amount)+LOWER_RIGHT_BLUE[i]*gain*amount));
   }
  }
  return c;
 }

 function mark(p,n,d,w,l,color,opacity=.97,depth=.045){
  F.mark(p,n,d,w,l,depth,color,opacity,'stone');
 }
 function plane(origin,u,v,{density=3.2,detail=.5,palette=STONE,cut=null,offset=0,normal=null}={}){
  const lu=Math.hypot(...u),lv=Math.hypot(...v),n=normal||unit(cross(u,v));
  if(lu<.001||lv<.001)return;
  const nu=unit(u),nv=unit(v),vertical=Math.abs(nv[1])>.35?nv:nu;
  for(let pass=0;pass<2;pass++){
   const d=pass?density*detail*2.25:density;
   const nx=Math.max(1,Math.ceil(lu*Math.sqrt(d))),ny=Math.max(1,Math.ceil(lv*Math.sqrt(d)));
   const step=Math.sqrt((lu/nx)*(lv/ny));
   for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){
    const a=(i+.15+rnd()*.7)/nx,b=(j+.15+rnd()*.7)/ny;
    const p=add(add(origin,mul(u,a)),mul(v,b));
    if(cut?.(p))continue;
    const c=colorAt(p,n,palette,offset,pass?1:.18),spread=.7+rnd()*.55;
    const direction=pass?add(vertical,mul(nu,.38*noise(p[0]*.7,p[1]*.8,p[2]*.65))):vertical;
    mark(add(p,mul(n,pass?.047:0)),n,direction,
     (pass?.06:step*.51)*spread,(pass?.13:step*.69)*spread,c,pass?.93:.98,pass?.026:.065);
   }
  }
 }
 function triangle(a,b,c,{density=3,palette=STONE,offset=0}={}){
  const ab=sub(b,a),ac=sub(c,a),cr=cross(ab,ac),area=Math.hypot(...cr)*.5,n=unit(cr);
  const count=Math.ceil(area*density);
  for(let i=0;i<count;i++){
   const t=Math.sqrt(rnd()),q=rnd(),p=add(add(mul(a,1-t),mul(b,t*(1-q))),mul(c,t*q));
   mark(p,n,[.1,1,.05],.21,.33,colorAt(p,n,palette,offset,.25),.98,.065);
  }
 }
 function box(center,size,{density=2.2,palette=STONE,frontCut=null,front=true,back=true,top=true}={}){
  const [x,y,z]=center,[w,h,d]=size,left=x-w/2,bottom=y-h/2,rear=z-d/2,near=z+d/2;
  if(front)plane([left,bottom,near],[w,0,0],[0,h,0],{density,palette,cut:frontCut});
  if(back)plane([x+w/2,bottom,rear],[-w,0,0],[0,h,0],{density:density*.55,detail:.2,palette});
  plane([left,bottom,rear],[0,0,d],[0,h,0],{density:density*.65,detail:.25,palette});
  plane([x+w/2,bottom,near],[0,0,-d],[0,h,0],{density:density*.65,detail:.25,palette});
  if(top)plane([left,y+h/2,near],[w,0,0],[0,0,-d],{density:density*.5,detail:0,palette});
 }
 function line(a,b,{radius=.09,density=7,palette=STONE,offset=.035}={}){
  const delta=sub(b,a),length=Math.hypot(...delta),axis=unit(delta);
  const u=unit(cross(axis,Math.abs(axis[1])>.8?[0,0,1]:[0,1,0])),v=unit(cross(axis,u));
  const count=Math.max(6,Math.ceil(length*density));
  for(let i=0;i<count;i++){
   const t=(i+rnd())/count,angle=i*2.399963229728653,n=add(mul(u,Math.cos(angle)),mul(v,Math.sin(angle)));
   const p=add(add(a,mul(delta,t)),mul(n,radius*(.82+rnd()*.32)));
   mark(p,n,axis,Math.max(.035,radius*.66),.10+rnd()*.055,colorAt(p,n,palette,offset-.035,.65),.9+rnd()*.07,Math.max(.025,radius*.38));
  }
 }
 function curve(points,options){for(let i=1;i<points.length;i++)line(points[i-1],points[i],options);}
 function pointed(cx,base,spring,r,z,{radius=.12,palette=STONE,offset=.025,density=8}={}){
  const points=[[cx-r,base,z],[cx-r,spring,z]];
  for(let j=1;j<=18;j++){
   const a=Math.PI-j*Math.PI/54;points.push([cx+r+2*r*Math.cos(a),spring+2*r*Math.sin(a),z]);
  }
  for(let j=1;j<=18;j++){
   const a=2*Math.PI/3+j*Math.PI/54;points.push([cx-r-2*r*Math.cos(a),spring+2*r*Math.sin(a),z]);
  }
  points.push([cx+r,base,z]);curve(points,{radius,palette,offset,density});
 }
 function niche(cx,base,r,spring,z,{mullions=1,density=5,palette=RECESS}={}){
  plane([cx-r,base,z],[r*2,0,0],[0,spring+Math.sqrt(3)*r-base,0],{density,detail:.25,palette,cut:p=>!insideArch(p[0]-cx,p[1],r,spring,base)});
  pointed(cx,base,spring,r,z+.13,{radius:.075,density:5});
  for(let k=1;k<=mullions;k++){
   const x=cx-r+k*2*r/(mullions+1);
   line([x,base,z+.17],[x,archHeight(x-cx,r,spring)-.16,z+.17],{radius:.035,density:5,offset:.05});
  }
 }
 function pinnacle(x,y,z,h=2.5,r=.29){
  box([x,y+.32,z],[r*1.6,.65,r*1.6],{density:3,back:true});
  const corners=[[x-r,y+.65,z-r],[x+r,y+.65,z-r],[x+r,y+.65,z+r],[x-r,y+.65,z+r]],tip=[x,y+h,z];
  for(let i=0;i<4;i++){
   triangle(corners[i],corners[(i+1)%4],tip,{density:7,offset:.08});
   line(corners[i],tip,{radius:.045,density:5,offset:.16});
  }
 }

 // A complete nave and side aisles extend twenty metres behind the facade.
 box([0,9.1,-10],[21.5,18.2,20],{density:1.45,front:false,palette:STONE});
 box([0,20.1,-10.3],[12.6,7.4,19.4],{density:1.55,front:false,palette:STONE});
 // Pitched nave roof, with separate slopes and a closed eastern gable.
 plane([-6.6,23.6,-.6],[6.6,5.6,0],[0,0,-19.4],{density:1.55,detail:.18,palette:ROOF});
 plane([0,29.2,-.6],[6.6,-5.6,0],[0,0,-19.4],{density:1.55,detail:.18,palette:ROOF});
 triangle([-6.6,23.6,-20],[0,29.2,-20],[6.6,23.6,-20],{density:2,palette:STONE});
 line([0,29.25,-.6],[0,29.25,-20],{radius:.12,density:5,palette:ROOF});
 // Polygonal rear apse keeps the silhouette architectural from a reverse view.
 for(let k=0;k<6;k++){
  const a=Math.PI+k*Math.PI/6,b=Math.PI+(k+1)*Math.PI/6;
  const pa=[Math.cos(a)*6.2,0,-20+Math.sin(a)*5.2],pb=[Math.cos(b)*6.2,0,-20+Math.sin(b)*5.2];
  plane(pa,sub(pb,pa),[0,19,0],{density:1.3,detail:.2,normal:[Math.cos((a+b)/2),0,Math.sin((a+b)/2)]});
  triangle(add(pa,[0,19,0]),add(pb,[0,19,0]),[0,25,-21],{density:1.5,palette:ROOF});
  line(add(pa,[0,0,0]),add(pa,[0,20,0]),{radius:.16,density:4,offset:.08});
 }

 // Nave side windows are actual recessed planes between vertical buttress piers.
 for(const side of [-1,1])for(let k=0;k<5;k++){
  const z=-3-k*3.65,x=side*10.9;
  box([x,9,z],[.62,18,1.0],{density:1.8});
  box([side*11.35,3.8,z],[1.0,7.6,1.25],{density:1.7});
  // Side lancets are transformed from a local vertical Gothic outline.
  const r=.95,base=8.2,spring=13.1,windowZ=z-1.65;
  const count=160;
  for(let i=0;i<count;i++){
   const u=(rnd()-.5)*r*2,y=base+rnd()*(spring+Math.sqrt(3)*r-base);
   if(!insideArch(u,y,r,spring,base))continue;
   const p=[side*10.78,y,windowZ+u];mark(p,[side,0,0],[0,1,0],.1,.23,colorAt(p,[side,0,0],RECESS),.98);
  }
  for(const dz of [-r,0,r])line([side*10.97,base,windowZ+dz],[side*10.97,spring,windowZ+dz],{radius:.065,density:4});
  const flying=[side*6.6,21.4,z];
  curve([[side*11.3,13.4,z],[side*10.7,16.7,z],[side*9.2,19.3,z],flying],{radius:.18,density:5,offset:.12});
  pinnacle(side*11.05,18.1,z,2.0,.23);
 }

 const portals=[{x:-8.65,r:1.7,spring:3.75},{x:0,r:2.2,spring:5.0},{x:8.65,r:1.7,spring:3.75}];
 const rose={x:0,y:15.7,r:3.15};
 const facadeCut=p=>portals.some(a=>insideArch(p[0]-a.x,p[1],a.r,a.spring))||Math.hypot(p[0]-rose.x,p[1]-rose.y)<rose.r;
 // Front curtain wall. Openings are omitted rather than painted on top of solid stone.
 plane([-13,0,.12],[26,0,0],[0,23.2,0],{density:4.1,detail:.65,cut:facadeCut});
 // Recessed portals include jamb depth, nested archivolts and oak-coloured blue shadows.
 for(const portal of portals){
  const {x,r,spring}=portal,top=spring+Math.sqrt(3)*r;
  plane([x-r,.05,-1.15],[2*r,0,0],[0,top-.05,0],{density:4.2,detail:.4,palette:RECESS,cut:p=>!insideArch(p[0]-x,p[1],r,spring)});
  plane([x-r,0,-1.15],[0,0,1.25],[0,spring,0],{density:4,detail:.3,palette:RECESS,normal:[1,0,0]});
  plane([x+r,0,.12],[0,0,-1.25],[0,spring,0],{density:4,detail:.3,palette:RECESS,normal:[-1,0,0]});
  for(let ring=0;ring<5;ring++){
   pointed(x,0,spring+ring*.11,r+ring*.18,.18+ring*.14,{radius:.08+ring*.012,density:5,offset:ring%2?.13:-.03});
  }
  // A slender trumeau and tympanum tracery preserve the characteristic three-portal rhythm.
  line([x,0,-.8],[x,spring+.75,-.8],{radius:.11,density:9,offset:.08});
  for(const side of [-1,1])pointed(x+side*r*.43,spring*.72,spring+.25,r*.35,-.7,{radius:.035,density:4,offset:.02});
  const gableY=top+2.1,gableHalf=r+1.25;
  curve([[x-gableHalf,spring+1.1,.85],[x,gableY,.85],[x+gableHalf,spring+1.1,.85]],{radius:.15,density:8,offset:.15});
  pinnacle(x,gableY,.8,1.35,.18);
  // Small statues are abstracted as stone brush clusters, not repeated black slots.
  for(const side of [-1,1])for(let level=0;level<3;level++){
   const px=x+side*(r+.63),py=1.4+level*1.8;
   line([px,py-.3,.82],[px,py+.45,.82],{radius:.11,density:10,offset:.12});
   pinnacle(px,py+.6,.8,.5,.1);
  }
 }

 // Rose window: deep blue glass behind radial stone ribs and a double circular archivolt.
 for(let i=0;i<550;i++){
  const a=rnd()*TAU,r=Math.sqrt(rnd())*rose.r,p=[Math.cos(a)*r,rose.y+Math.sin(a)*r,-.47];
  mark(p,[0,0,1],[.3,1,0],.12,.19,colorAt(p,[0,0,1],RECESS,-.04),.99);
 }
 const circle=(cx,cy,r,z,options={})=>{const pts=[];for(let i=0;i<=72;i++)pts.push([cx+Math.cos(i*TAU/72)*r,cy+Math.sin(i*TAU/72)*r,z]);curve(pts,options);};
 for(const [r,z]of [[3.15,.2],[3.38,.4],[3.58,.48],[.54,.29]])circle(0,rose.y,r,z,{radius:.07,density:4,offset:.15});
 for(let k=0;k<12;k++){
  const a=k*TAU/12,ca=Math.cos(a),sa=Math.sin(a);
  line([ca*.58,rose.y+sa*.58,.28],[ca*3.04,rose.y+sa*3.04,.28],{radius:.065,density:6,offset:.15});
  circle(ca*2.04,rose.y+sa*2.04,.67,.29,{radius:.045,density:2,offset:.12});
 }
 // Tall central gable and its blind lancets sit between, not on top of, the towers.
 triangle([-6.1,23.15,.16],[6.1,23.15,.16],[0,27.0,.16],{density:5,offset:.03});
 curve([[-6.35,23.1,.55],[0,27.2,.55],[6.35,23.1,.55]],{radius:.14,density:6,offset:.15});
 for(let x=-4.8;x<=4.9;x+=1.6)niche(x,20.35,.48,21.7,.29,{mullions:0,density:3.5});
 line([-12.95,19.9,.53],[12.95,19.9,.53],{radius:.13,density:6,offset:.12});
 line([-12.95,23.2,.5],[12.95,23.2,.5],{radius:.16,density:6,offset:.12});

 // Unequal square bell towers: Saint-Romain-like left tower and a lower ornate right tower.
 for(const tower of [{x:-9.6,w:6.5,h:33.8},{x:9.6,w:6.5,h:30.8}]){
  const {x,w,h}=tower,base=18.9;
  const bellR=.73,bellSpring=h-3.8,bellBase=base+5;
  const bellCenters=[x-1.5,x,x+1.5];
  const cut=p=>bellCenters.some(cx=>insideArch(p[0]-cx,p[1],bellR,bellSpring,bellBase));
  box([x,(base+h)/2,-2.8],[w,h-base,5.8],{density:2.7,frontCut:cut});
  for(const cx of bellCenters)niche(cx,bellBase,bellR,bellSpring,-.5,{mullions:1,density:3.8});
  for(const yy of [base+.5,base+3.7,h-1.0,h+.03]){
   line([x-w/2-.15,yy,.45],[x+w/2+.15,yy,.45],{radius:.13,density:6,offset:.12});
   line([x-w/2-.12,yy,.15],[x-w/2-.12,yy,-5.8],{radius:.13,density:4,offset:.04});
   line([x+w/2+.12,yy,.15],[x+w/2+.12,yy,-5.8],{radius:.13,density:4,offset:.04});
  }
  for(const dx of [-w/2+.16,w/2-.16]){
   box([x+dx,(h+1)/2,.5],[.6,h+1,1.0],{density:2.1,back:false});
   pinnacle(x+dx,h+.6,.5,2.5,.34);
   pinnacle(x+dx,h+.05,-5.6,2.25,.3);
  }
  // Bell louvers have depth and avoid the texture of a flat dark window sticker.
  for(const cx of bellCenters)for(let y=bellBase+.5;y<bellSpring-.15;y+=.68){
   line([cx-.53,y,-.35],[cx+.53,y,-.35],{radius:.065,density:3,palette:ROOF,offset:.03});
  }
  for(let i=0;i<9;i++){
   const xx=x-w/2+.35+i*(w-.7)/8;
   box([xx,h+.38,.05],[.25,.72,.55],{density:4,back:false});
  }
 }
 // Facade piers, staged buttresses and their pinnacles establish the Gothic vertical cadence.
 for(const x of [-12.9,-5.95,5.95,12.9]){
  box([x,6.0,.82],[.9,12,1.25],{density:2.4,back:false});
  box([x,15.0,.65],[.68,6.4,.95],{density:2.4,back:false});
  box([x,20.0,.48],[.5,3.6,.7],{density:2.4,back:false});
  pinnacle(x,22.1,.5,3.25,.31);
 }
 // Crossing lantern and distant slim spire remain visible when orbiting the nave.
 box([0,28.5,-11.3],[2.9,4.2,2.9],{density:1.8});
 for(let k=0;k<8;k++){
  const a=k*TAU/8,b=(k+1)*TAU/8;
  triangle([Math.cos(a)*1.7,30.55,-11.3+Math.sin(a)*1.7],[Math.cos(b)*1.7,30.55,-11.3+Math.sin(b)*1.7],[0,38.3,-11.3],{density:2.8,palette:ROOF});
 }
 // The high background spire is deliberately painted more sparsely and broadly.
 // Appending it preserves every previously authored foreground sample and seed.
 const backgroundStart=F.splats.length,spireX=-33.3,spireZ=-22;
 const distantStone=['#b4c1d6','#becbdc','#cad0dd','#d0ccd6','#d9d4d1'].map(hex);
 const distantRecess=['#9daec8','#abb9d0','#b7c1d4'].map(hex);
 const distantMark=(p,n,d,{recess=false,across=false}={})=>{
  const field=clamp(.48-n[0]*.12+n[1]*.05+noise(p[0]*.26,p[1]*.2,p[2]*.2)*.15+(rnd()-.5)*.15);
  const tones=recess?distantRecess:distantStone;
  const color=tones[Math.min(tones.length-1,Math.floor(field*tones.length))];
  F.mark(p,n,d,.62+rnd()*.52,across?1.0+rnd()*.25:.67+rnd()*.39,.14+rnd()*.08,color,.89+rnd()*.07,'stone');
 };
 const half=5.5,base=22,shoulder=39.5;
 // The square bell stage has an actual recessed pointed opening on all four faces.
 for(let side=0;side<4;side++){
  const a=side*Math.PI/2,n=[Math.sin(a),0,Math.cos(a)],u=[Math.cos(a),0,-Math.sin(a)];
  for(let row=0;row<20;row++)for(let col=0;col<8;col++){
   const horizontal=-half+(col+.22+rnd()*.56)*half*2/8;
   const y=base+(row+.2+rnd()*.6)*(shoulder-base)/20;
   const inOpening=[-2.08,2.08].some(cx=>insideArch(horizontal-cx,y,1.05,34.9,29.4));
   if(inOpening)continue;
   const p=add(add([spireX,y,spireZ],mul(n,half)),mul(u,horizontal));
   distantMark(p,n,[0,1,0]);
  }
  for(const cx of [-2.08,2.08])for(let i=0;i<16;i++){
   const horizontal=cx+(rnd()-.5)*1.65,y=29.6+rnd()*6.4;
   if(!insideArch(horizontal-cx,y,1.05,34.9,29.4))continue;
   const p=add(add([spireX,y,spireZ],mul(n,half-.4)),mul(u,horizontal));
   distantMark(p,n,[0,1,0],{recess:true});
  }
 }
 // Closed base and shoulder surfaces remain visible from high and low orbit views.
 for(const [y,normal]of [[base,[0,-1,0]],[shoulder,[0,1,0]]])for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const p=[spireX-half+(col+.15+rnd()*.7)*half*2/8,y,spireZ-half+(row+.15+rnd()*.7)*half*2/8];
  distantMark(p,normal,[1,0,.2],{across:true});
 }
 // A broad, fully volumetric octagonal Gothic spire rises eighteen metres higher.
 const tipY=57.5,spireRadius=6.0;
 const spirePoint=(side,t,q)=>{
  const a=side*TAU/8,b=(side+1)*TAU/8,r=spireRadius*Math.pow(1-t,1.08);
  return [spireX+(Math.cos(a)*(1-q)+Math.cos(b)*q)*r,shoulder+(tipY-shoulder)*t,spireZ+(Math.sin(a)*(1-q)+Math.sin(b)*q)*r];
 };
 for(let side=0;side<8;side++)for(let row=0;row<12;row++)for(let col=0;col<5;col++){
  const t=(row+.2+rnd()*.6)/12,q=(col+.15+rnd()*.7)/5,p=spirePoint(side,t,q);
  const tangent=sub(spirePoint(side,Math.min(.9999,t+.002),q),p);
  let n=unit(cross(sub(spirePoint(side,t,Math.min(1,q+.002)),p),tangent));
  if(dot(n,[p[0]-spireX,0,p[2]-spireZ])<0)n=mul(n,-1);
  distantMark(p,n,tangent);
 }
 // Soft broken cornices suggest stone courses without bright wire-like tracery.
 for(const y of [28.2,37.9,39.7])for(let i=0;i<24;i++){
  const a=i*TAU/24,n=[Math.cos(a),0,Math.sin(a)],perimeter=(half+.18)/Math.max(Math.abs(n[0]),Math.abs(n[2])),p=[spireX+n[0]*perimeter,y,spireZ+n[2]*perimeter];
  distantMark(p,n,[-n[2],0,n[0]],{across:true});
 }
 // Broad pale masonry grounds the separate campanile in every orbit view.
 // This connection is appended so the already authored upper stage keeps its samples.
 const connectionStart=F.splats.length;
 for(let side=0;side<4;side++){
  const a=side*Math.PI/2,n=[Math.sin(a),0,Math.cos(a)],u=[Math.cos(a),0,-Math.sin(a)];
  for(let row=0;row<14;row++)for(let col=0;col<6;col++){
   const horizontal=-half+(col+.18+rnd()*.64)*half*2/6,y=(row+.18+rnd()*.64)*base/14;
   const p=add(add([spireX,y,spireZ],mul(n,half)),mul(u,horizontal));
   const color=distantStone[Math.floor(clamp(.43-n[0]*.08+noise(p[0]*.18,p[1]*.14,p[2]*.15)*.14+(rnd()-.5)*.1)*distantStone.length)];
   F.mark(p,n,[0,1,0],1.18+rnd()*.3,1.08+rnd()*.2,.16+rnd()*.07,color,.94,'stone');
  }
 }
 for(let row=0;row<6;row++)for(let col=0;col<6;col++){
  const p=[spireX-half+(col+.2+rnd()*.6)*half*2/6,0,spireZ-half+(row+.2+rnd()*.6)*half*2/6];
  F.mark(p,[0,-1,0],[1,0,.1],1.35,1.5,.18,distantStone[1],.94,'stone');
 }
 const backgroundSpire={count:F.splats.length-backgroundStart,connectionCount:F.splats.length-connectionStart,center:[spireX,28.75,spireZ],bounds:{min:[-40,0,-29],max:[-27,58,-15]},tip:[spireX,tipY,spireZ],strokeScale:'coarse',palette:'pale blue and ivory'};
 return {count:F.splats.length-start,bounds:{min:[-40,0,-29],max:[13.6,58,1.55]},backgroundSpire,camera:{position:[8.5,11,51],target:[0,16,-3],fov:51}};
}
