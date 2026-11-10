/** Dense, all-sided grass paint and anchored wind-blown blades.
 * Totoro041 / Omoide026 field references and the supplied Howl flower meadow.
 */
import {PATH_START,PATH_END,PATH_GROWTH,pathOvergrowth} from './ghibliPath.js';
import {MEADOW_ROCKS} from './ghibliProps.js';
import {GUARDIAN_SITE} from './ghibliMoss.js';
const TAU=Math.PI*2;
const hex=h=>h.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
export function buildMeadowGrass({mark,rnd,height,normal,colorAt,pondDistance,pathX,pathWidth}){
 let tufts=0,blades=0,flowers=0,seedHeads=0,vergeBlades=0,pathTufts=0;
 const varieties=[0,0,0,0];
 const highlights=['#b3c777','#d0ce8d','#92b861','#668f53','#7aab70','#c0cb81'].map(hex);
 function clear(x,z){
  if(pondDistance(x,z)<1.13)return false;
  if(z>PATH_START&&z<PATH_END&&Math.abs(x-pathX(z))<pathWidth(z)*(.80+.055*Math.sin(z*2.4))&&pathOvergrowth(x,z)<.12)return false;
  if(MEADOW_ROCKS.some(([rx,rz,sx,,sz])=>Math.hypot((x-rx)/sx,(z-rz)/sz)<.82))return false;
  if(Math.hypot(x-GUARDIAN_SITE.x,z-GUARDIAN_SITE.z)<GUARDIAN_SITE.radius*.9)return false;
  return true;
 }
 function blade(x,z,h,phase,base,light,kind){
  const a=rnd()*TAU,bend=.10+rnd()*(kind===3?.5:.3),ground=height(x,z);
  const dx=.94*bend+Math.cos(a)*.16,dz=.34*bend+Math.sin(a)*.16;
  const width=((kind===0?.014:kind===3?.032:.018)+rnd()*(kind===3?.024:.016))*.52;
  mark([x+dx*h*.46,ground+h*.47,z+dz*h*.46],
   [Math.cos(a),0,Math.sin(a)],[dx,1,dz],width,h*.39,.006,
   mix(base,light,.38+rnd()*.32),'grass',{wind:[ground,h,phase,2]});blades++;
 }
 for(let i=0;i<16800;i++){
  const near=i<14000,x=near?-54+rnd()*96:-90+rnd()*180,z=near?-40+rnd()*86:-95+rnd()*115;
  if(!clear(x,z))continue;
  const y=height(x,z),n=normal(x,z),phase=rnd()*TAU;
  // Coherent patches of fine grass, long meadow leaves, broad bent sedges and
  // straw seed heads break up the height, colour and rhythm of the field.
  const patch=.5+.22*Math.sin(x*.49+Math.sin(z*.27))+.18*Math.cos(z*.57-x*.18);
  const kind=Math.min(3,Math.floor((patch*.7+rnd()*.3)*4));varieties[kind]++;
  const h=([.20,.34,.50,.39][kind]+rnd()*[.14,.24,.27,.27][kind])*.4;
  const base=colorAt(x,z),light=highlights[(kind+Math.floor(rnd()*3))%highlights.length];
  const dir=[.94,.18+rnd()*.22,.34],color=mix(base,light,.20+rnd()*.20);
  mark([x,y+.035,z],n,dir,.065+rnd()*.09,.14+rnd()*.23,.027,color,'grass',{wind:[y,h,phase,2]});tufts++;
  if(!near)continue;
  const count=3+(rnd()<.4?1:0);
  for(let j=0;j<count;j++){
   const a=rnd()*TAU,spread=.06+rnd()*.24,bx=x+Math.cos(a)*spread,bz=z+Math.sin(a)*spread;
   if(!clear(bx,bz))continue;
   const bh=Math.min(.32,h*(.72+rnd()*.4));
   blade(bx,bz,bh,phase+j*.52,base,light,kind);
   if(kind===2&&j===0&&i%3===0){
    const gy=height(bx,bz),c=mix(light,hex('#ded5a3'),.56);
    mark([bx+.12*bh,gy+bh*.94,bz+.04*bh],[Math.cos(a),0,Math.sin(a)],[.18,1,.06],.018,.032,.009,c,'foliage',{wind:[gy,bh,phase,2]});seedHeads++;
   }
  }
  if(i%24===0&&z>-16){
   const c=hex(i%5<2?'#ead795':i%5<4?'#e1dba9':'#8aa5b4');
   mark([x,y+h,z],[.1,.8,1],[1,.1,.2],.022,.036,.013,c,'foliage',{wind:[y,h,phase,2]});flowers++;
  }
 }
 // Unequal little fans fringe the path, with occasional gaps of bare soil.
 for(let i=0;i<400;i++){
  const z=PATH_START+rnd()*(PATH_END-PATH_START),side=rnd()>.5?1:-1;
  const x=pathX(z)+side*(pathWidth(z)*(.86+rnd()*.38)+rnd()*.28);
  if(!clear(x,z))continue;
  const h=(.16+rnd()*.28)*.4,base=colorAt(x,z),light=highlights[Math.floor(rnd()*highlights.length)];
  blade(x,z,h,rnd()*TAU,base,light,0);vergeBlades++;
 }
 for(const [cz,side,rx,rz]of PATH_GROWTH)for(let i=0;i<38;i++){
  const a=rnd()*TAU,r=Math.sqrt(rnd())*.86,x=pathX(cz)+side*pathWidth(cz)+Math.cos(a)*rx*r,z=cz+Math.sin(a)*rz*r;
  if(!clear(x,z))continue;
  const y=height(x,z),h=(.18+rnd()*.29)*.4,phase=rnd()*TAU,base=colorAt(x,z),light=highlights[Math.floor(rnd()*highlights.length)];
  mark([x,y+.03,z],normal(x,z),[.94,.2,.34],.065,.14,.02,mix(base,light,.26),'grass',{wind:[y,h,phase,2]});tufts++;pathTufts++;
  for(let j=0;j<2;j++)blade(x+(rnd()-.5)*.13,z+(rnd()-.5)*.13,h,phase+j*.5,base,light,j); 
 }
 return {tufts,blades,flowers,seedHeads,vergeBlades,pathTufts,varieties,reference:['totoro/totoro041.jpg','omoide/omoide026.jpg','/ghibli-references/howl-meadow-house.jpg']};
}
