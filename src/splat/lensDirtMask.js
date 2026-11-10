/** Deterministic, seamless painterly optical-dirt mask; no canvas or dependencies. */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
function random(seed){
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6D2B79F5)|0;
    let t=Math.imul(state^(state>>>15),1|state);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}

/**
 * Returns an RGBA8 grayscale mask. Large requests clamp to 1024 square (4 MiB).
 * Each dab is rasterized toroidally so RepeatWrapping has no cut brush edges.
 */
export function createLensDirtMask(size=512,seed=0x514f28a3){
  if(!Number.isFinite(size)||size<=0)throw new RangeError('Lens-dirt size must be positive and finite.');
  if(!Number.isFinite(seed))throw new RangeError('Lens-dirt seed must be finite.');
  size=Math.round(clamp(size,64,1024));
  const rng=random(seed),field=new Float32Array(size*size);
  function dab(cx,cy,length,width,angle,strength,dry=0){
    cx*=size;cy*=size;length*=size;width*=size;
    const cosine=Math.cos(angle),sine=Math.sin(angle),phase=rng()*Math.PI*2;
    const bx=(Math.abs(cosine)*length+Math.abs(sine)*width)*1.18;
    const by=(Math.abs(sine)*length+Math.abs(cosine)*width)*1.18;
    for(let y=Math.floor(cy-by);y<=Math.ceil(cy+by);y++)for(let x=Math.floor(cx-bx);x<=Math.ceil(cx+bx);x++){
      const dx=x+.5-cx,dy=y+.5-cy;
      const u=(dx*cosine+dy*sine)/length,v=(-dx*sine+dy*cosine)/width;
      const tip=Math.max(0,Math.abs(u)-.48)/.52;
      const radius=Math.hypot(v,tip)+.045*Math.sin(u*7+phase)+.025*Math.sin(v*11-phase);
      const edge=1-smooth(.58,1.06,radius);
      if(edge<=0)continue;
      // Soft parallel gaps and a broken edge suggest a lightly loaded brush.
      const bristle=1-dry*smooth(.35,.85,Math.sin(v*21+phase+.8*Math.sin(u*4)));
      const broken=1-dry*.22*smooth(.55,.98,radius)*(.5+.5*Math.sin(u*23+phase));
      const amount=clamp(strength*edge*bristle*broken,0,1);
      const target=((y%size+size)%size)*size+((x%size+size)%size);
      field[target]=1-(1-field[target])*(1-amount);
    }
  }
  function position(){
    // Subtle peripheral weighting keeps the center useful without an empty hole.
    let x,y,r;
    do{x=rng();y=rng();r=Math.hypot(x-.5,y-.5);}while(rng()>.75+.25*smooth(.12,.58,r));
    return [x,y,.78+.22*smooth(.12,.58,r)];
  }
  // Broad faint smears establish the optical layer without reading as particles.
  for(let i=0;i<8;i++){
    const [x,y,peripheral]=position();
    dab(x,y,.065+rng()*.055,.025+rng()*.025,rng()*Math.PI,.025+rng()*.035*peripheral,.06);
  }
  // Mostly small, elongated and softly bounded marks, with no circular confetti.
  for(let i=0;i<430;i++){
    const [x,y,peripheral]=position();
    const length=.009+rng()*.016,width=.0045+rng()*.0085;
    dab(x,y,length,width,rng()*Math.PI,(.11+rng()*.4)*peripheral,.12+rng()*.25);
  }
  for(let i=0;i<10;i++){
    const [x,y,peripheral]=position();
    dab(x,y,.038+rng()*.027,.005+rng()*.008,rng()*Math.PI,(.07+rng()*.15)*peripheral,.3);
  }
  const data=new Uint8Array(size*size*4);
  for(let i=0;i<field.length;i++){
    const value=Math.round(clamp(field[i],0,1)*255),offset=i*4;
    data[offset]=data[offset+1]=data[offset+2]=value;data[offset+3]=255;
  }
  return {data,width:size,height:size};
}

/** Centered cover UV scaling, matching Three's lensDirt aspect-ratio mapping. */
export function dirtUVScale(screenAspect,maskAspect=1,scale=1){
  if(![screenAspect,maskAspect,scale].every(v=>Number.isFinite(v)&&v>0))throw new RangeError('Lens-dirt aspects and scale must be positive and finite.');
  const ratio=clamp(screenAspect/maskAspect,1/64,64),boundedScale=clamp(scale,.25,4);
  return [Math.min(ratio,1)/boundedScale,Math.min(1/ratio,1)/boundedScale];
}
