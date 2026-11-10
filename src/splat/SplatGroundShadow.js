export const COURIER_SHADOW_SPLATS=1280;

/** Soft projected surface samples, drawn in the same splat pass as the courier. */
export class SplatGroundShadow {
  constructor(bodyCount,count=COURIER_SHADOW_SPLATS){
    this.bodyCount=bodyCount;
    this.sources=Array.from({length:count},(_,i)=>Math.floor((i+.5)*bodyCount/count));
    this.splats=this.sources.map((_,i)=>({center:[0,.012,0],axes:[[.12,0,0],[0,0,.12],[0,.004,0]],
      color:[.18,.32,.56],opacity:.04,seed:i/count,material:'actor-shadow',softParticle:true}));
  }
  update(body){
    let clearance=Infinity;
    for(let i=0;i<this.bodyCount;i++)clearance=Math.min(clearance,body[i].center[1]);
    clearance=Math.max(0,clearance);
    for(let i=0;i<this.splats.length;i++){
      const source=body[this.sources[i]],shadow=this.splats[i],[x,y,z]=source.center,height=Math.max(0,y);
      // Keep near-contact marks tight; separation from the floor widens the penumbra.
      const radius=.055+.095*height+.055*clearance;
      const density=Math.min(1,((.065+.055*height+.045*clearance)/radius)**1.4);
      const contact=1+.65*Math.exp(-((height/.16)**2));
      shadow.center[0]=x+.25*height;shadow.center[2]=z-.18*height;
      shadow.axes[0][0]=radius;shadow.axes[1][2]=radius;
      shadow.opacity=.033*density*contact*Math.exp(-clearance*.32)/(1+height*.18)*source.opacity;
    }
  }
}
