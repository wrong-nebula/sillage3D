/** A worn footpath, with the shrine opening following its local direction. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hex=h=>h.replace('#','').match(/../g).map(v=>parseInt(v,16)/255);
export const PATH_START=-82,PATH_JOIN=-24,PATH_END=61;
const nearPath=z=>-8.055+5.5*Math.sin((z-1)*.078);
const nearSlope=z=>5.5*.078*Math.cos((z-1)*.078);
const HILL_ROUTE=[[-82,72],[-73,63],[-65,70],[-57,43],[-50,29],[-43,23],[-36,-6],[-24,nearPath(-24)]];
export function pathX(z){
 if(z>=PATH_JOIN)return nearPath(z);
 const zz=clamp(z,PATH_START,PATH_JOIN),i=Math.min(HILL_ROUTE.length-2,Math.max(0,HILL_ROUTE.findIndex(p=>p[0]>=zz)-1));
 const [z0,x0]=HILL_ROUTE[i],[z1,x1]=HILL_ROUTE[i+1],span=z1-z0,t=(zz-z0)/span;
 const tangent=j=>j===HILL_ROUTE.length-1?nearSlope(PATH_JOIN):j===0?(HILL_ROUTE[1][1]-HILL_ROUTE[0][1])/(HILL_ROUTE[1][0]-HILL_ROUTE[0][0]):(HILL_ROUTE[j+1][1]-HILL_ROUTE[j-1][1])/(HILL_ROUTE[j+1][0]-HILL_ROUTE[j-1][0]);
 return (2*t**3-3*t*t+1)*x0+(t**3-2*t*t+t)*span*tangent(i)+(-2*t**3+3*t*t)*x1+(t**3-t*t)*span*tangent(i+1);
}
export const pathSlope=z=>z>=PATH_JOIN?nearSlope(z):(pathX(z+.02)-pathX(z-.02))/.04;
export const pathWidth=z=>(z<PATH_JOIN?.25+.35*clamp((z-PATH_START)/(PATH_JOIN-PATH_START),0,1):.6+.022*clamp(z+18,0,60))*(1+.085*Math.sin(z*.71)+.055*Math.sin(z*1.63+.8));
export const TORII_SITE={x:pathX(3),z:3,height:6.35,yaw:Math.PI+Math.atan2(pathSlope(3),1)};
// A few central islands and alternating incursions leave a wandering worn strip.
export const PATH_GROWTH=[[-21,.65,.55,1.9],[-14,-.64,.62,2.2],[-8,.08,.40,1.6],[-2,.75,.65,1.8],
 [9,-.72,.72,2.1],[16,.05,.50,2.6],[22,.76,.76,2.0],[29,-.2,.45,2.5],[35,-.74,.8,2.3],[43,.55,.78,2.5]];
export function pathOvergrowth(x,z){
 let growth=0;
 for(const [cz,side,rx,rz]of PATH_GROWTH){
  const cx=pathX(cz)+side*pathWidth(cz),d=Math.hypot((x-cx)/rx,(z-cz)/rz);
  growth=Math.max(growth,Math.max(0,1-d));
 }
 return growth;
}

export function buildMeadowPath({mark,rnd,height,normal}){
 const earth=['#9d9973','#b0a47a','#c5b78b','#d5c69c','#dcd1ad'].map(hex);
 const gravel=['#7f8270','#a5a28a','#c6c0a5'].map(hex);
 let strokes=0,pebbles=0,distantStrokes=0;
 // A continuous worn centre, with muted, uneven shoulders for encroaching grass.
 for(let i=0;i<4100;i++){
  const z=PATH_JOIN+rnd()*(48-PATH_JOIN),side=rnd()*2-1;
  const x=pathX(z)+side*pathWidth(z),edge=Math.abs(side),n=normal(x,z);
  if(pathOvergrowth(x,z)>.22)continue;
  const band=Math.max(0,Math.min(4,Math.floor(3.9-edge*2.7+(rnd()-.5)*1.8)));
  mark([x,height(x,z)+.075,z],n,[pathSlope(z),0,1],
   .10+rnd()*(edge>.8?.10:.21),.25+rnd()*.42,.018,earth[band],'stone');strokes++;
 }
 // Small embedded gravel gathers on the shoulders; the centre stays walkable.
 for(let i=0;i<360;i++){
  const z=PATH_JOIN+rnd()*(48-PATH_JOIN),side=(rnd()>.5?1:-1)*(.55+rnd()*.55);
  const x=pathX(z)+side*pathWidth(z),size=.025+rnd()*.055;
  mark([x,height(x,z)+.09,z],normal(x,z),[1,.1,.3],size,size*(1+rnd()*.7),.018+rnd()*.02,gravel[Math.floor(rnd()*3)],'stone');pebbles++;
 }
 // A continuous tapering ribbon climbs the right-hand ridge. Sample by arc
 // length so its long traverses and tighter bends have equal paint coverage.
 const route=[];let length=0;
 for(let z=PATH_JOIN;z>=PATH_START;z-=.12){const x=pathX(z),previous=route.at(-1);if(previous)length+=Math.hypot(x-previous.x,z-previous.z);route.push({x,z,length});}
 let k=1;
 for(let i=0;i<2100;i++){
  const distance=(i+rnd())/2100*length;while(k<route.length-1&&route[k].length<distance)k++;
  const a=route[k-1],b=route[k],t=(distance-a.length)/(b.length-a.length),z=a.z+(b.z-a.z)*t;
  const width=pathWidth(z),x=pathX(z)+(rnd()-.5)*width*1.7,fade=clamp((PATH_JOIN-z)/(PATH_JOIN-PATH_START),0,1);
  const color=earth[2+Math.floor(rnd()*2)].map((v,j)=>v*(1-fade*.25)+[.64,.69,.57][j]*fade*.25);
  mark([x,height(x,z)+.075,z],normal(x,z),[pathSlope(z),0,1],width*(.35+rnd()*.17),.22+rnd()*.3,.012,color,'stone');strokes++;distantStrokes++;
 }
 // Continue the foreground without resampling the existing trail pigment.
 for(let i=0;i<800;i++){
  const z=47.6+rnd()*(PATH_END-47.6),side=rnd()*2-1,x=pathX(z)+side*pathWidth(z);
  const band=Math.max(0,Math.min(4,Math.floor(3.9-Math.abs(side)*2.7+(rnd()-.5)*1.8)));
  mark([x,height(x,z)+.075,z],normal(x,z),[pathSlope(z),0,1],.13+rnd()*.16,.25+rnd()*.42,.018,earth[band],'stone');strokes++;
 }
 return {strokes,pebbles,distantStrokes,foregroundStrokes:800,hillRoute:HILL_ROUTE,start:PATH_START,end:PATH_END,gate:{...TORII_SITE}};
}

/** Finer ground kernels along the trail prevent large grass washes covering it. */
export function refinePathGround({mark,splats,groundLayer,height,normal,colorAt}){
 let refined=0;
 for(let i=groundLayer.start;i<groundLayer.start+groundLayer.count;i++){
  const s=splats[i],[x,,z]=s.center;
  if(z<PATH_START-2||z>PATH_END+2||Math.abs(x-pathX(z))>pathWidth(z)+2||Math.hypot(...s.axes[0])<1.2)continue;
  s.axes=s.axes.map(a=>a.map(v=>v/3));refined++;
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
   if(dx===0&&dz===0)continue;
   const px=x+dx*2/3,pz=z+dz*2/3;
   mark([px,height(px,pz),pz],normal(px,pz),[1,.12,.25],.407,.517,.037,colorAt(px,pz));
  }
 }
 return {refined};
}
