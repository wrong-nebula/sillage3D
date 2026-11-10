const TAU=Math.PI*2;

/** Keep source/LOD record addresses intact, replacing each tiny sampled shell
 * with a few concentric, full-rank Gaussian layers of the same ivory pigment. */
export function softenSpores(splats,groups){
  for(const {start,count} of groups){
    if(start<0||count<1||start+count>splats.length)throw new Error('Invalid source spore range.');
    const anchor=[0,0,0];
    for(let i=start;i<start+count;i++)for(let c=0;c<3;c++)anchor[c]+=splats[i].center[c]/count;
    const seed=splats[start].seed;
    const motion={anchor,phase:seed*TAU,rate:.14+seed*.07,amplitude:[.18+seed*.12,.12+seed*.08,.12+seed*.12]};
    for(let j=0;j<count;j++){
      const s=splats[start+j],radius=(.014+seed*.006)*(.8+.4*j/Math.max(1,count-1));
      s.center=anchor.slice();s.axes=[[radius,0,0],[0,radius,0],[0,0,radius]];
      s.opacity=1-Math.pow(1-.82,1/count);s.softParticle=true;s.sporeMotion=motion;
    }
  }
}

/** Continuous, bounded paths: no spawning, wrap jumps, flicker or random walks. */
export function sporeOffset(motion,time,result=[0,0,0],origin=null){
  const p=motion.phase,t=time*motion.rate,a=motion.amplitude;
  result[0]=a[0]*(Math.sin(t+p)-(origin?.[0]??Math.sin(p)));
  result[1]=a[1]*(Math.sin(t*.73+p*1.7)-(origin?.[1]??Math.sin(p*1.7)));
  result[2]=a[2]*(Math.cos(t*.83+p*.6)-(origin?.[2]??Math.cos(p*.6)));
  return result;
}

export class SporeDrift {
  constructor(splats){this.offset=[0,0,0];this.position=[0,0,0];this.rows=new Map();this.setSplats(splats);}
  setSplats(splats){
    const groups=new Map();this.records=[];
    splats.forEach((s,index)=>{
      if(!s.sporeMotion)return;
      if(!groups.has(s.sporeMotion))groups.set(s.sporeMotion,[]);
      groups.get(s.sporeMotion).push(index);this.records.push(index);
    });
    this.groups=groups;
    this.motions=Array.from(groups,([motion,indices])=>({motion,indices,phase:NaN,origin:[0,0,0]}));
    this.appliedTime=null;
  }
  get count(){return this.groups.size;}
  write(texture,centers,time,fullUpload=false,uploads=null){
    if(!this.count||time===this.appliedTime)return false;
    const data=texture.image.data,rows=this.rows,rowSize=texture.image.width*4;
    rows.clear();
    for(const entry of this.motions){
      const {motion,indices,origin}=entry;
      if(entry.phase!==motion.phase){
        entry.phase=motion.phase;
        origin[0]=Math.sin(motion.phase);origin[1]=Math.sin(motion.phase*1.7);origin[2]=Math.cos(motion.phase*.6);
      }
      const offset=sporeOffset(motion,time,this.offset,origin),position=this.position;
      for(let c=0;c<3;c++)position[c]=motion.anchor[c]+offset[c];
      for(const index of indices){
        data.set(position,index*20);centers.set(position,index*3);
        if(!fullUpload){
          const start=index*20,end=start+4,row=Math.floor(start/rowSize),range=rows.get(row);
          if(range){range[0]=Math.min(range[0],start);range[1]=Math.max(range[1],end);}
          else rows.set(row,[start,end]);
        }
      }
    }
    // Coalesce into at most a few short row uploads, not the complete LOD atlas.
    if(!fullUpload)for(const [start,end] of rows.values()){
      if(uploads)uploads.mark(start,end-start);else texture.addUpdateRange(start,end-start);
    }
    if(fullUpload||!uploads)texture.needsUpdate=true;this.appliedTime=time;return true;
  }
}
