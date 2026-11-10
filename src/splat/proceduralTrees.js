/** Editable reference-led trees. Metres, +Y up, soil anchor at origin.
 * Crown architecture is designed from the supplied painting, not a species ID.
 * Growth is sampled allometry; branch connections are explicit, not a growth simulation.
 */
import {Matrix4, Quaternion, Vector3} from 'three';
const TAU=Math.PI*2, GOLD=2.399963229728653;
export const TREE_SPECIES={broadleaf:{label:'Golden broadleaf',height:7.8,width:2.45},birch:{label:'Silver birch',height:7.4,width:1.65},oak:{label:'Spreading oak',height:6.8,width:3.1},fir:{label:'Mountain fir',height:9,width:1.8},cypress:{label:'Slender cypress',height:8,width:1.05}};
export const TREE_PALETTES={gold:{label:'Harvest gold',colors:['#3d4030','#71603a','#987526','#c5951c','#dcaa20','#e8c33f','#e2ce6e']},copper:{label:'Burnished copper',colors:['#42392e','#74482c','#ac5b29','#ce762e','#e9943c','#f0b45e','#e9c47c']},lemon:{label:'Lemon & lime',colors:['#3d4b28','#6b762e','#9ba22b','#c8bf37','#dcd64b','#efdf71','#eeea9a']},green:{label:'Forest green',colors:['#233b32','#344d36','#3f6030','#517632','#638339','#809c4b','#a6b774']},sage:{label:'Silver sage',colors:['#324b45','#4b6758','#68836b','#88a081','#a3b596','#c1cbae','#e0dfc0']},rose:{label:'Rose canopy',colors:['#493542','#724b57','#9c6073','#bd7e8e','#d79aab','#e6b9c1','#efd4d1']}};
export function rng(seed){let n=hashSeed(seed);return()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function hashSeed(s){let n=2166136261;for(const c of String(s))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
const hex=s=>s.slice(1).match(/../g).map(v=>parseInt(v,16)/255);
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const add=(a,b)=>a.map((v,k)=>v+b[k]);
const mul=(a,s)=>a.map(v=>v*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
function paletteAt(p,t){const x=clamp(t)* (p.length-1),i=Math.floor(x);return mix(p[i],p[Math.min(p.length-1,i+1)],x-i);}
function dab(list,p,n,d,l,w,c,r,material='foliage',wind=null){
 n=unit(n);let u=unit(add(d,mul(n,-d.reduce((s,v,k)=>s+v*n[k],0))));if(Math.hypot(...u)<.1)u=unit(cross(n,[.1,1,.1]));
 const v=unit(cross(n,u));
 list.push({center:p,axes:[mul(u,l),mul(v,w),mul(n,Math.max(.006,w*.25))],color:c,opacity:1,seed:r(),material,...(wind?{wind}:{})});
}
function wood(list,a,b,ra,rb,r,birch=false){
 const d=unit(b.map((v,k)=>v-a[k])),u=unit(cross(d,[0,0,1])),v=cross(d,u),length=Math.hypot(...b.map((v,k)=>v-a[k]));
 const rows=Math.max(4,Math.ceil(length/.055));
 for(let i=0;i<=rows;i++){const t=i/rows,rad=ra+(rb-ra)*t;for(let j=0;j<Math.max(6,Math.ceil(rad*130));j++){
  const angle=j/Math.max(6,Math.ceil(rad*130))*TAU,n=add(mul(u,Math.cos(angle)),mul(v,Math.sin(angle))),p=add(mix(a,b,t),mul(n,rad));
  const light=clamp(.48+n[0]*.16+n[2]*.18+(r()-.5)*.15);
  let c=birch?mix(hex('#857f62'),hex('#e7e2bb'),light):mix(hex('#3c392d'),hex('#a38a5c'),light);
  if(birch&&Math.sin(i*2.8+j*.35)>.83)c=hex('#54594d');
  dab(list,p,n,d,.047,Math.min(.028,rad*.8+.001),c,r,'wood');
 }}
}
/** Standalone rooted tree. Topology, pigments and surface details use separate streams. */
export function generateTree({species='broadleaf',palette='gold',seed=1947,height=1,width=1,density=1,age=1,origin=[0,0,0]}={}){
 if(!TREE_SPECIES[species]||!TREE_PALETTES[palette])throw new RangeError('Unknown tree species or palette');
 for(const v of [height,width,density,age,...origin])if(!Number.isFinite(v))throw new TypeError('Tree parameters must be finite');
 const form=TREE_SPECIES[species],h=form.height*clamp(height,.4,1.8)*clamp(age,.25,1),radius=form.width*clamp(width,.45,1.8)*Math.pow(clamp(age,.25,1),.8),splats=[];
 const r=rng(`${seed}:structure`),paint=rng(`${seed}:pigment`),p=TREE_PALETTES[palette].colors.map(hex),conifer=species==='fir',column=species==='cypress';
 const lean=(r()-.5)*(conifer?.48:radius*.62),base=[0,0,0],joint=[lean,h*(conifer?.76:.42),-.1];
 wood(splats,base,joint,h*.027,h*.009,r,species==='birch');
 const lobes=[],limbs=[];
 if(conifer){
  // Staggered whorls with explicit central support and ascending tips.
  for(let tier=0;tier<18;tier++){
   const t=tier/18,y=h*(.15+t*.83),rr=radius*Math.pow(1-t,.84),phase=r()*TAU;
   for(let arm=0;arm<5;arm++){
    const a=phase+arm*TAU/5,reach=rr*(.8+r()*.3),start=[lean*y/h,y,0],end=[start[0]+Math.cos(a)*reach,y+h*.025,Math.sin(a)*reach];
    wood(splats,start,end,.035*(1-t)+.009,.006,r);
    lobes.push({c:mix(start,end,.65),rad:[reach*.65,h*(.018+.008*(1-t)),reach*.24],angle:a,phase:a,tier:t});
   }
  }
  lobes.push({c:[lean,h*.96,0],rad:[.12,h*.065,.12],phase:0});
 }else{
  if(species==='broadleaf'){
   // Unequal branch masses define the contour; a small hidden core only joins them.
   lobes.push({c:[lean*.45,h*.54,0],rad:[radius*.75,h*.30,radius*.65],phase:r()*TAU,core:true});
   const masses=[[-.20,.86,-.05,.62,.18,.56],[.43,.78,-.17,.64,.21,.60],[-.48,.68,.08,.56,.24,.54],[.15,.60,.38,.60,.20,.52],[.63,.48,.08,.50,.23,.51],[-.48,.39,.10,.56,.22,.52],[.04,.28,.05,.52,.18,.51],[-.10,.62,-.48,.60,.25,.56],[.31,.87,.12,.45,.16,.46]];
   for(const [x,y,z,rx,ry,rz]of masses){
    const scale=.83+r()*.34,c=[lean*y+radius*(x+(r()-.5)*.22),h*(y+(r()-.5)*.055),radius*(z*.55+(r()-.5)*.12)];
    lobes.push({c,rad:[radius*rx*scale,h*ry*scale,radius*rz*(.95+scale*.12)],phase:r()*TAU});
    const a=[lean*.35,h*.31,0],b=mix(a,c,.53);b[1]-=h*.045;limbs.push([a,b,c]);
   }
  }else{
   const count=species==='oak'?13:column?11:10;
   if(species!=='birch')lobes.push({c:[lean,h*.59,0],rad:[radius*.80,h*.32,radius*.73],phase:r()*TAU,core:true});
   for(let i=0;i<count;i++){
    const t=(i+.5)/count,a=i*GOLD+r()*.35,band=Math.sin(Math.PI*t)**.55,reach=radius*(column?.36:.58)*band;
    const c=[lean*t+Math.cos(a)*reach,h*(.27+t*.64),Math.sin(a)*reach*.83],size=.76+r()*.3;
    lobes.push({c,rad:[radius*(species==='oak'?.51:.46)*size,h*(species==='birch'?.095:column?.19:.18)*size,radius*.44*size],phase:r()*TAU});
    const start=[lean*.55,h*(.24+t*.24),0],elbow=mix(start,c,.52);elbow[1]-=.22;
    limbs.push([start,elbow,c]);
   }
  }
  for(const [a,b,c]of limbs){wood(splats,a,b,h*.011,.035,r,species==='birch');wood(splats,b,c,.035,.008,r,species==='birch');}
 }
 const detail=clamp(density,.35,1.8),wind=[0,h,Number(hashSeed(seed)%1000)/100,2];
 for(let li=0;li<lobes.length;li++){
  const l=lobes[li],rr=l.rad,area=4*Math.PI*((rr[0]*rr[1]+rr[0]*rr[2]+rr[1]*rr[2])/3);
  const count=Math.max(110,Math.round(area*(conifer?175:species==='broadleaf'?142:138)*detail));
  for(let i=0;i<count;i++){
   const y=clamp(1-2*(i+.5+(paint()-.5)*.75)/count,-1,1),a=i*GOLD+l.phase+(paint()-.5)*.045,ring=Math.sqrt(1-y*y),dir=[ring*Math.cos(a),y,ring*Math.sin(a)];
   const wave=1+(conifer?.14:.065)*Math.sin(a*7+y*18+l.phase)+.035*Math.sin(a*13-y*31);
   let local=dir.map((v,k)=>v*rr[k]*wave);
   if(l.angle!==undefined){const [x,yy,z]=local;local=[x*Math.cos(l.angle)-z*Math.sin(l.angle),yy,x*Math.sin(l.angle)+z*Math.cos(l.angle)];}
   const pos=add(l.c,local);
   // Retain just the exterior of overlapping lobes; no visible ball seams.
   if(!conifer&&lobes.some((other,j)=>j!==li&&other.rad.reduce((s,v,k)=>s+((pos[k]-other.c[k])/v)**2,0)<.94))continue;
   let n=unit(dir.map((v,k)=>v/rr[k]));
   if(l.angle!==undefined){const [x,yy,z]=n;n=[x*Math.cos(l.angle)-z*Math.sin(l.angle),yy,x*Math.sin(l.angle)+z*Math.cos(l.angle)];}
   const envelope=unit([(pos[0]-lean*.5)/radius,(pos[1]/h-.59)*1.35,pos[2]/(radius*.8)]);
   const shadeNormal=conifer?n:unit(add(mul(envelope,.78),mul(n,.22)));
   const sun=clamp(-.02+shadeNormal[0]*.46+shadeNormal[1]*.08+shadeNormal[2]*.83);
   const band=.5+.5*Math.sin(pos[1]*12+Math.sin(a*2+l.phase)*2.8+pos[0]*.6);
   const mottled=Math.sin(pos[0]*2.8+Math.sin(pos[1]*3.1)+pos[2]*2)*.035;
   let tone=clamp(.08+sun*.72+band*.13+mottled+(paint()-.5)*.19);
   if(conifer)tone=clamp(.03+sun*.66+band*.07+(paint()-.5)*.16);
   const crease=clamp((Math.sin(pos[1]*10+Math.sin(a*1.5+l.phase)*2.6)-.45)*1.5)*(.35+.65*(1-sun));
   tone=clamp(tone-crease*.34);
   const patch=Math.sin(pos[0]*4.7+Math.sin(pos[1]*2.6)*2+pos[2]*3.2)*Math.cos(pos[1]*5.3-pos[2]*1.7);
   const cap=conifer?0:clamp((pos[1]/h-.84)/.22)*.10;
   const underside=conifer?0:clamp((-n[1]-.08)*1.3)*.12;
   tone=clamp(tone+patch*.09-cap-underside);
   const c=paletteAt(p,tone);
   // Long curved, mostly horizontal strokes echo the reference's wrapped crowns.
   const tangent=conifer?unit([Math.cos(l.angle??a),.15+Math.sin(a*3)*.2,Math.sin(l.angle??a)]):unit([-Math.sin(a),.08*Math.sin(a*2+l.phase)-.26*Math.cos(a),Math.cos(a)]);
   const size=(conifer?.050:.062)*( .65+paint()*.65)/Math.sqrt(detail);
   const length=size*(conifer?1.6:1.72),thick=size*(conifer?.34:.35);
   const twist=(paint()-.5)*.26+(conifer?0:.12*Math.sin(l.phase+pos[1]*.8)+n[1]*.08),side=unit(cross(n,tangent)),brush=add(mul(tangent,Math.cos(twist)),mul(side,Math.sin(twist)));
   dab(splats,pos,n,brush,length,thick,c,paint,'foliage',wind);
   // Fine dry-brush ridges sit above the broad stroke, without white speckles.
   if(i%3===0){const top=add(pos,mul(n,.024));dab(splats,top,n,brush,length*(.6+paint()*.7),thick*.24,mix(c,p[6],.16+paint()*.12),paint,'foliage',wind);}
   if(!conifer&&i%7===0){const top=add(pos,mul(n,.032));dab(splats,top,n,brush,length*.8,thick*.2,paletteAt(p,clamp(tone-.2)),paint,'foliage',wind);}
   // Small scumbles break the long loaded marks into close-view pigment detail.
   for(let fleck=0;fleck<1;fleck++){
    const tip=add(add(add(pos,mul(n,.04+paint()*.018)),mul(brush,(paint()-.5)*length*1.5)),mul(side,(paint()-.5)*thick));
    const pigment=paletteAt(p,clamp(tone+(paint()-.48)*.22));
    dab(splats,tip,n,brush,length*(.16+paint()*.22),thick*(.18+paint()*.19),pigment,paint,'foliage',wind);
   }
  }
 }
 if(!conifer&&!column){
  for(let j=0;j<3;j++){const a=[lean+radius*(j===1?-.32:.2),h*(.36+j*.14),radius*.5],b=[a[0]+radius*.24,a[1]+h*.035,radius*.82];wood(splats,joint,a,.025,.013,r,species==='birch');wood(splats,a,b,.013,.004,r,species==='birch');}
 }
 for(const s of splats){s.center=add(s.center,origin);if(s.wind)s.wind=[origin[1],h,wind[2],2];}
 return {splats,genome:{species,palette,seed,height,width,density,age,origin},height:h,radius,anchor:origin.slice(),lobes:lobes.length};
}
export const hillHeight=(x,z)=>2.55*Math.exp(-x*x/110-z*z/155)-.012*z-.012*x*x-.006*z*z;
export function buildTreeScene(options={}){
 const {view='grove',seed=1947,species='broadleaf',palette='gold',height=1,width=1,density=1,age=1}=options;
 const splats=[],trees=[],r=rng(`${seed}:landscape`);
 const tree=(x,z,type,pigment,scale=1,w=1)=>{
  const t=generateTree({species:type,palette:pigment,seed:`${seed}:${trees.length}`,height:height*scale,width:width*w,density,age,origin:[view==='grove'?x*1.1:x,view==='grove'?hillHeight(x*1.1,z):0,z]});
  for(const s of t.splats)splats.push(s);trees.push(t.genome);
 };
 if(view==='grove'){
  tree(-4.65,-.1,'broadleaf',palette,.88,.88);tree(-3.6,-1.6,'broadleaf',palette,1.03,.65);
  tree(-1.75,-2.4,'fir','green',1.18,1.55);tree(-3.35,-1.6,'fir','green',1.15,1.40);
  tree(2.65,-2,species,palette,1.22,1.40);tree(5.1,-.1,'broadleaf',palette,.92,.97);
  tree(1.2,.7,'birch','lemon',.70,.85);tree(3,.85,'broadleaf','copper',.67,.57);tree(-2.6,1.1,'birch','lemon',.60,.7);
 }else tree(0,0,species,palette);
 const treeSplatCount=splats.length;
 // An actual curved ground surface, with tangential paint following the ridge.
 const range=view==='grove'?22:4.8,step=view==='grove'?.18:.12;
 const litHill=(x,z)=>{const ridgeX=x+1.1,span=ridgeX<0?10.5:13;return hillHeight(x,z)+2.55*Math.exp(-((ridgeX/span)**2)-(z-2.8)**2/6);};
 const frontHill=(x,z)=>2+x*.025+1.4*Math.exp(-((x-3.5)**2)/81)-.24*(z-9)**2;
 const ground=(x,z)=>view==='grove'?Math.max(litHill(x,z),frontHill(x,z)):-.025;
 for(let z=-9;z<range;z+=step)for(let x=-range;x<range;x+=step){
  if(view!=='grove'&&x*x/22+z*z/12>1)continue;
  const px=x+(r()-.5)*step*.65,pz=z+(r()-.5)*step*.65,y=ground(px,pz);
  const n=view==='grove'?unit([(ground(px-.05,pz)-ground(px+.05,pz))/.1,1,(ground(px,pz-.05)-ground(px,pz+.05))/.1]):[0,1,0];
  const foreground=clamp((pz-(2.6+px*.22))/3.2),lit=clamp(.87-foreground*.88+.035*Math.sin(px*.4+pz*.8));
  const front=view==='grove'&&frontHill(px,pz)>litHill(px,pz);
  let c=paletteAt(['#33462d','#4a5933','#717343','#a5a34b','#c6bc4e','#ded16d'].map(hex),(front?.17+px*.002:lit)+(r()-.5)*.07);
  if(view!=='grove'){const shadow=Math.exp(-(px*px/4+(pz+.4)**2/2))*.42;c=mul(c,1-shadow);}
  dab(splats,[px,y,pz],n,[1,n[0]*-.4,.15],step*(1.15+r()*.7),step*.72,c,r,'grass');
 }
 if(view==='grove'){
  const fenceStart=splats.length,z=5.0;let last=null;
  for(let j=0;j<5;j++){const x=2.8+j*.7,y=ground(x,z),top=[x,y+.25,z];wood(splats,[x,y,z],top,.008,.006,r,true);if(last)wood(splats,last,top,.006,.006,r,true);last=top;}
  for(let i=fenceStart;i<splats.length;i++){splats[i].color=hex('#e9dfb6');splats[i].material='fence';}
 }
 // Sky wash is geometry too; the reference itself is never a render texture.
 for(let i=0;i<7500;i++){
  const y=clamp(1-2*(i+.5+r()*.7)/7500,-1,1),a=i*GOLD+r()*.05,v=Math.sqrt(1-y*y),n=[v*Math.cos(a),y,v*Math.sin(a)];
  const c=mix(hex('#89b8cf'),hex('#b0d3de'),.4+r()*.36);
  dab(splats,add(mul(n,90),[0,6,0]),mul(n,-1),[1,.15,.1],2.8,1.4,c,r,'sky');splats.at(-1).noFog=true;
 }
 return {splats,trees,treeSplatCount,background:'#9bc3d6',orbitMin:5,orbitLimit:80,orbitMaxPolar:Math.PI*.49,
  lighting:{irradiance:new Float32Array(splats.length*3),shadow:new Float32Array(splats.length),stats:{}},
  animation:{indices:splats.flatMap((s,i)=>s.wind?[i]:[])},canvasOnSubject:false};
}
/** Standard 32-byte native Gaussian .splat file, preserving all three axes. */
export function encodeTreeSplats(splats){
 const buffer=new ArrayBuffer(splats.length*32),v=new DataView(buffer),q=new Quaternion(),m=new Matrix4();
 splats.forEach((s,i)=>{
  const offset=i*32,axes=s.axes.map(a=>new Vector3(...a)),scales=axes.map(a=>a.length());
  m.makeBasis(...axes.map(a=>a.clone().normalize()));q.setFromRotationMatrix(m).normalize();
  for(let k=0;k<3;k++){v.setFloat32(offset+k*4,s.center[k],true);v.setFloat32(offset+12+k*4,scales[k],true);v.setUint8(offset+24+k,Math.round(clamp(s.color[k])*255));}
  v.setUint8(offset+27,Math.round(clamp(s.opacity)*255));[q.w,q.x,q.y,q.z].forEach((x,k)=>v.setUint8(offset+28+k,clamp(Math.round(x*128+128),0,255)));
 });return buffer;
}
