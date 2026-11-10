const TAU=Math.PI*2;
const hex=s=>s.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255);
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(v=>v/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

/** Macro flower beds use the existing Canopy/Howl meadow palette and geometry
 * vocabulary. The only externally sourced subjects are the credited CC0 assets. */
export function buildDemoGarden(canopy,kind){
  let seed=kind==='bee'?8021:4207;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  const splats=canopy.splats.map(s=>({...s,center:[s.center[0]*.65,s.center[1]*.65,s.center[2]*.65-9],axes:s.axes.map(a=>a.map(v=>v*.65)),color:s.color.slice()}));
  function mark(p,n,r,color,material='foliage'){
    const normal=unit(n),t=unit(cross(normal,Math.abs(normal[1])>.9?[1,0,0]:[0,1,0])),b=cross(normal,t);
    splats.push({center:p,axes:[t.map(v=>v*r),b.map(v=>v*r*.85),normal.map(v=>v*r*.26)],color,opacity:.97,seed:rnd(),material});
  }
  function shell(center,axes,count,color){
    for(let i=0;i<count;i++){
      const y=1-2*(i+.5)/count,a=i*2.3999632297,r=Math.sqrt(1-y*y),u=[Math.cos(a)*r,y,Math.sin(a)*r];
      const p=center.map((v,c)=>v+axes.reduce((sum,axis,k)=>sum+axis[c]*u[k],0));
      const n=unit(axes.reduce((v,axis,k)=>v.map((value,c)=>value+axis[c]*u[k]/Math.max(.000001,axis.reduce((sum,t)=>sum+t*t,0))),[0,0,0]));
      const shade=.75+.25*Math.max(0,n[1]*.8-n[0]*.4+n[2]*.25);
      const size=Math.sqrt(axes.reduce((sum,axis)=>sum+Math.hypot(...axis),0)**2/count)*.42;
      mark(p,n,size,color.map(v=>v*shade));
    }
  }
  // Fine turf joins the macro flowers to the larger, existing background field.
  for(let i=0;i<3200;i++){
    const x=(rnd()-.5)*19,z=(rnd()-.5)*18,y=-.12+.025*Math.sin(x*.7+z*.5);
    mark([x,y,z],[0,1,0],.23+rnd()*.13,hex(rnd()>.5?'#789346':'#98aa60'),'grass');
  }
  const specs=[[-1.15,1.15,.3],[1.5,1.45,-.5],[-2.8,1.4,-1.3],[2.8,1.9,-2.4],[.1,1.2,-2.2],[-3.2,.85,2.8],[2.7,1.1,2.5],[-1.4,1.6,-4],[1.3,1.8,-4.4]];
  const petals=(kind==='bee'?['#eee2b4','#f2d574','#e5c763']:['#dfb9ce','#d4c1e1','#e4c8ac']).map(hex);
  for(const [f,[x,h,z]] of specs.entries()){
    for(let j=0;j<110;j++){
      const t=rnd(),a=rnd()*TAU;
      mark([x+.07*Math.sin(t*2)+Math.cos(a)*.022,h*t,z+Math.sin(a)*.022],[Math.cos(a),0,Math.sin(a)],.026,hex('#59723e'));
    }
    for(const side of [-1,1])shell([x+side*.22,h*.47,z],[[side*.34,.13,0],[0,.035,0],[0,0,.12]],160,hex(side<0?'#688649':'#83994c'));
    const petalCount=kind==='bee'?11:8;
    for(let j=0;j<petalCount;j++){
      const a=j*TAU/petalCount+f*.7,c=Math.cos(a),s=Math.sin(a),length=.27+(f%3)*.035;
      shell([x+c*.23,h+.025*Math.cos(a*2),z+s*.23],[[c*length,.025,s*length],[0,.038,0],[-s*.1,0,c*.1]],85,petals[f%petals.length]);
    }
    shell([x,h+.045,z],[[.14,0,0],[0,.08,0],[0,0,.14]],150,hex('#bd8c34'));
  }
  return {splats,background:kind==='bee'?'#afcbb4':'#aabac7',orbitLimit:35,atmosphere:{color:'#bbcbb8',start:10,density:.018,max:.55}};
}
