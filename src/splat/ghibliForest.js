/** Reference-led foliage and terrain-following Gaussian ground mist.
 * Trees: Totoro oak studies 01919 / 06879, The Wind Rises kazetachinu050.
 * Mist principles: https://github.com/yomotsu/ground-fog/blob/main/src/FogLayers.js
 * Independently implemented as sparse Gaussian volumes, without the demo's
 * mesh layers, simulation render targets, or pressure-solver passes.
 */
const TAU=Math.PI*2;
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const hex=h=>h.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const noise=(x,z)=>Math.sin(x*.73+Math.sin(z*.51))*.52+Math.sin(z*1.3+x*.38)*.3+Math.cos(x*1.9-z*.89)*.18;
const LEAF=['#293d2b','#3c5637','#587947','#789653','#98b469','#bacb81','#d5dc9c'].map(hex);
const BUSH=['#294637','#3b5d45','#4f7a52','#6b935d','#8eae68','#b1c279','#ccd292'].map(hex);
export const FOREST_TREES=[[-18,-9,12.6,6.5,0],[15,-18,12.3,5.4,1],[-44,-9,8.4,4.1,5]];

// A leaf fan has a dark underside and small, overlapping leaf-shaped strokes.
// The narrow vertical radius and ragged sprays avoid a spherical topiary outline.
function fan({mark,rnd},center,radii,count,base,height,phase,shade=0,palette=LEAF){
 const [rx,ry,rz]=radii;
 for(let i=0;i<count;i++){
  const a=i*2.3999632297+phase,v=1-2*(i+.5)/count,ring=Math.sqrt(1-v*v);
  const n=unit([Math.cos(a)*ring/rx,v/ry,Math.sin(a)*ring/rz]);
  const ripple=1+.14*Math.sin(a*5+phase)+.1*noise(Math.cos(a)*4+phase,Math.sin(a)*4);
  const p=[center[0]+Math.cos(a)*ring*rx*ripple,center[1]+v*ry+.12*ry*Math.sin(a*3+phase)*ring,center[2]+Math.sin(a)*ring*rz*ripple];
  const light=clamp(.42+.25*v-.20*n[0]+.09*n[2]+shade+.055*noise(p[0]*1.8,p[2]*1.8));
  const c=palette[Math.min(6,Math.floor(light*7))],under=i%4===0,size=.8+rnd()*.45;
  const wind=height>3?[base+height*.27,height*.52,phase,2]:[base,height,phase,2];
  mark(p,n,[Math.cos(a)*.3,v<.3?-.85:.16,Math.sin(a)*.3],(under?.30:.09)*size,(under?.45:.22)*size,under?.10:.035,c,'foliage',{wind});
  if(i%3===0){
   const tip=[p[0]+Math.cos(a)*.16,p[1]+.04,p[2]+Math.sin(a)*.16];
   mark(tip,n,[Math.cos(a+.7)*.3,-.7,Math.sin(a+.7)*.3],.065,.18,.025,c,'foliage',{wind});
  }
 }
}

export function buildGhibliTrees({mark,rnd,height,branch}){
 for(const [x,z,h,r,k]of FOREST_TREES){
  const y=height(x,z),airy=k%2===1,hero=k<2,lean=(airy?.9:-1.05);
  const root=[x,y,z],elbow=[x+lean,y+h*.16,z+.24],fork=[x+lean*.8,y+h*(airy?.35:.31),z-.22];
  branch(root,elbow,airy?.49:.98,airy?.36:.69,hero?230:150);
  branch(elbow,fork,airy?.36:.69,airy?.23:.39,hero?220:150);
  for(let j=0;j<8;j++){
   const a=j*TAU/8+k*.53,reach=(airy?1.65:2.5)*(1+rnd()*.25);
   const mid=[x+Math.cos(a)*reach*.4,y+.16,z+Math.sin(a)*reach*.4];
   const end=[x+Math.cos(a)*reach,height(x+Math.cos(a)*reach,z+Math.sin(a)*reach)+.025,z+Math.sin(a)*reach];
   branch([x,y+.52,z],mid,airy?.16:.3,.12,35);branch(mid,end,.12,.02,25);
  }
  // A continuous, asymmetrical shadow mass joins the leaf fans. The old oaks
  // have a low spreading crown; open trees keep gaps around the main forks.
  const crownLobes=airy?11:17;
  for(let i=0;i<crownLobes;i++){
   const a=i*2.3999632297+k*.63,v=1-2*(i+.5)/crownLobes,ring=Math.sqrt(1-v*v);
   const reach=r*(airy?.53:.67)*(1+.12*Math.sin(a*3+k));
   const c=[x+Math.cos(a)*ring*reach,y+h*(airy?.67:.64)+v*h*.21,z+Math.sin(a)*ring*reach*.8];
   const scale=.84+rnd()*.3;
   fan({mark,rnd},c,[r*(airy?.34:.39)*scale,h*.16*scale,r*.32*scale],hero?60:50,y,h,k*9+i*.63,-.075+v*.06);
  }
  const limbs=airy?7:8;
  for(let limb=0;limb<limbs;limb++){
   const a=limb*2.3999632297+k*.63,upper=limb%3===0,reach=r*(upper?.52:.88)*(1+(rnd()-.5)*.25);
   const top=upper?.86:airy?.69:.65;
   const joint=[fork[0]+Math.cos(a)*reach*.33,y+h*(top-.16),z+Math.sin(a)*reach*.23];
   const end=[x+Math.cos(a)*reach,y+h*top+(rnd()-.5)*h*.08,z+Math.sin(a)*reach*.78];
   branch(fork,joint,airy?.15:.25,.1,hero?65:42);branch(joint,end,.1,.035,hero?60:40);
   const fans=hero?4:3;
   for(let j=0;j<fans;j++){
    const b=a+j*2.3999632297,spread=r*(airy?.22:.25),t=j/(fans-1);
    const c=[end[0]+Math.cos(b)*spread,end[1]+Math.sin(b*1.7)*h*.055+(rnd()-.5)*h*.04,end[2]+Math.sin(b)*spread*.8];
    if(j<3)branch(end,[c[0],c[1]-.15,c[2]],.034,.012,20);
    const scale=.78+rnd()*.44;
    fan({mark,rnd},c,[r*(airy?.23:.28)*scale,h*(airy?.12:.11)*scale,r*.22*scale],hero?40:32,y,h,k*7+limb*.8+j*.3,(upper?.04:-.045)+.03*t);
   }
  }
 }
 return {count:FOREST_TREES.length,reference:['painted-trees-rocks.jpg','oak_tree/totoro_01919.png','oak_tree/totoro_06879.png','oak_tree/kazetachinu050.png']};
}

export function buildBushes({mark,rnd,height,pondDistance,pathX}){
 const sites=[];
 for(const [x,z,h,r,k]of FOREST_TREES)for(let j=0;j<5;j++){
  const a=j*2.3999632297+k*.7,reach=r*(.5+rnd()*.8);
  sites.push([x+Math.cos(a)*reach,z+Math.sin(a)*reach,.8+rnd()*.6]);
 }
 sites.push([4,-12,1.1],[10,-12,1.3],[13,-9,.8],[27,-16,1.2],[-15,-19,1.3]);
 let groups=0;
 for(const [x,z,h]of sites){
  if(z<-24||pondDistance(x,z)<1.18||Math.abs(x-pathX(z))<2)continue;
  groups++;const y=height(x,z),r=h*1.6;
  for(let j=0;j<5;j++){
   const a=j*2.3999632297,reach=r*(j===0?0:.55),px=x+Math.cos(a)*reach,pz=z+Math.sin(a)*reach;
   fan({mark,rnd},[px,height(px,pz)+h*(j===0?.75:.5),pz],[r*.49,h*.43,r*.43],18,y,h,groups*.72+j*.8,.03,BUSH);
  }
 }
 return {groups,reference:'oak_tree/totoro_01919.png'};
}

export function forestMask(x,z){
 let mask=0;
 for(const [tx,tz,,r]of FOREST_TREES){
  const d=Math.hypot((x-tx)/(r*1.9),(z-tz)/(r*1.5));
  mask=Math.max(mask,1-smooth(.3,1,d));
 }
 return mask;
}

export function buildForestFog({mark,rnd,height,normal,pondDistance,pathX}){
 let count=0;
 // Terrain, slope and valley weighting are baked once. GPU advection only
 // changes smooth density at these fixed sites, keeping depth ordering stable.
 for(let z=-43;z<-5;z+=2.25)for(let x=-54;x<34;x+=2.25){
  const px=x+(rnd()-.5)*.9,pz=z+(rnd()-.5)*.9,mask=forestMask(px,pz);
  if(mask<.035||pondDistance(px,pz)<1.18||Math.abs(px-pathX(pz))<2.2)continue;
  const y=height(px,pz),n=normal(px,pz),slope=smooth(.7,.99,n[1]),valley=1-.55*smooth(0,10,y);
  const weight=mask*(.3+.7*slope)*valley;
  for(let layer=0;layer<2;layer++){
   const rise=layer===0?.42:.95,thickness=layer===0?.3:.42;
   const c=mix(hex('#9bbaa9'),hex('#dfdfcb'),layer===0?.36:.62);
   mark([px,y+rise,pz],n,[.94,0,.34],1.05+rnd()*.25,1.8+rnd()*.4,thickness,c,'fog',
    {noFog:true,opacity:weight*(layer===0?.11:.055),wind:[y,rise,rnd()*TAU,5]});count++;
  }
 }
 return {count,maxSplats:900,source:'https://yomotsu.github.io/ground-fog/',method:'terrain-following Gaussian density, advected in the existing vertex shader',extraRenderPasses:0};
}
