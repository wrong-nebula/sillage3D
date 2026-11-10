import {DataTexture,RGBAFormat,UnsignedByteType,LinearFilter,ClampToEdgeWrapping,Vector4} from 'three';

/** Persistent world-space paint, independent of the recent-impression ring.
 * RG = sand hollow/rim; BA = snow hollow/rim. Overlap refreshes the same texels,
 * so burst size never evicts a trail elsewhere. One vertex lookup, no pass.
 */
export class TerrainTraceAtlas{
  constructor({bounds=[-30,30,-28,28],size=1024,fadeSeconds=240,holdSeconds=90}={}){
    this.bounds=bounds;this.size=size;this.fadeSeconds=fadeSeconds;this.holdSeconds=holdSeconds;
    this.data=new Uint8Array(size*size*4);this.rowTime=new Float64Array(size);
    this.rowPaintTime=new Float64Array(size).fill(-Infinity);
    this.texture=new DataTexture(this.data,size,size,RGBAFormat,UnsignedByteType);
    this.texture.minFilter=this.texture.magFilter=LinearFilter;this.texture.wrapS=this.texture.wrapT=ClampToEdgeWrapping;
    this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
    this.uniforms={terrainTraceMap:{value:this.texture},terrainTraceBounds:{value:new Vector4(bounds[0],bounds[2],bounds[1]-bounds[0],bounds[3]-bounds[2])}};
    this.time=0;this.sweep=0;this.rowCarry=0;this.uploadTime=.1;this.dirty=false;this.stamps=0;this.uploads=0;this.occupied=0;
  }
  stamp(x,z,yaw,width,length,kind='track',strength=1,snow=false){
    const [x0,x1,z0,z1]=this.bounds,n=this.size;
    const fx=Math.sin(yaw),fz=Math.cos(yaw),rx=fz,rz=-fx;
    // The terrain's .25m Gaussian spacing needs slightly broader paint than
    // the fine splats to retain narrow chip tracks between ground samples.
    width=Math.max(.20,width);length=Math.max(.20,length);
    const reachX=1.6*(Math.abs(rx)*width+Math.abs(fx)*length),reachZ=1.6*(Math.abs(rz)*width+Math.abs(fz)*length);
    if(x+reachX<x0||x-reachX>x1||z+reachZ<z0||z-reachZ>z1)return;
    const loX=Math.max(0,Math.floor((x-reachX-x0)/(x1-x0)*n)),hiX=Math.min(n-1,Math.ceil((x+reachX-x0)/(x1-x0)*n));
    const loZ=Math.max(0,Math.floor((z-reachZ-z0)/(z1-z0)*n)),hiZ=Math.min(n-1,Math.ceil((z+reachZ-z0)/(z1-z0)*n));
    const channel=snow?2:0,ink=Math.min(1,strength)*(kind==='impact'?1:.9);
    for(let row=loZ;row<=hiZ;row++){
      this.decayRow(row);
      this.rowPaintTime[row]=this.time;
      const dz=z0+(row+.5)/n*(z1-z0)-z;
      for(let col=loX;col<=hiX;col++){
        const dx=x0+(col+.5)/n*(x1-x0)-x,side=(dx*rx+dz*rz)/width,ahead=(dx*fx+dz*fz)/length,q=side*side+ahead*ahead;
        if(q>2.6)continue;
        const hollow=Math.exp(-2.2*q),rim=Math.exp(-25*(Math.sqrt(q)-1.05)**2)*.62;
        const k=(row*n+col)*4,was=this.data[k]|this.data[k+1]|this.data[k+2]|this.data[k+3];
        this.data[k+channel]=Math.max(this.data[k+channel],Math.round(hollow*ink*255));
        this.data[k+channel+1]=Math.max(this.data[k+channel+1],Math.round(rim*ink*255));
        if(!was&&(this.data[k]|this.data[k+1]|this.data[k+2]|this.data[k+3]))this.occupied++;
      }
    }
    this.stamps++;this.dirty=true;
  }
  decayRow(row){
    // A short full-strength hold avoids visibly washing out fresh trails.
    // Per-row epochs use 8KB instead of a timestamp texture per texel.
    const start=Math.max(this.rowTime[row],this.rowPaintTime[row]+this.holdSeconds);
    const steps=Math.floor((this.time-start)*255/this.fadeSeconds);
    if(steps<1)return;
    this.rowTime[row]=start+steps*this.fadeSeconds/255;
    const end=(row+1)*this.size*4;
    for(let k=row*this.size*4;k<end;k+=4){
      const was=this.data[k]|this.data[k+1]|this.data[k+2]|this.data[k+3];if(!was)continue;
      for(let c=0;c<4;c++)this.data[k+c]=Math.max(0,this.data[k+c]-steps);
      if(!(this.data[k]|this.data[k+1]|this.data[k+2]|this.data[k+3]))this.occupied--;
      this.dirty=true;
    }
  }
  update(dt,windSpeed=0){
    // A gust speeds infill gently; it cannot erase minutes of history at once.
    this.time+=dt*(1+Math.min(1.5,windSpeed*windSpeed*.008));
    this.rowCarry=Math.min(this.size,this.rowCarry+dt*this.size/4);
    const rows=Math.min(64,Math.floor(this.rowCarry));this.rowCarry-=rows;
    for(let i=0;i<rows;i++){this.decayRow(this.sweep);this.sweep=(this.sweep+1)%this.size;}
    this.uploadTime+=dt;
    if(this.dirty&&this.uploadTime>=.1){this.texture.needsUpdate=true;this.dirty=false;this.uploadTime=0;this.uploads++;}
  }
  sample(x,z,snow=false){
    const [x0,x1,z0,z1]=this.bounds,n=this.size;
    if(x<x0||x>x1||z<z0||z>z1)return [0,0];
    const col=Math.min(n-1,Math.floor((x-x0)/(x1-x0)*n)),row=Math.min(n-1,Math.floor((z-z0)/(z1-z0)*n));
    this.decayRow(row);const k=(row*n+col)*4+(snow?2:0);return [this.data[k]/255,this.data[k+1]/255];
  }
  shader(source,{physical=false}={}){
    return source.replace('uniform bool hasWind;',`uniform bool hasWind;
uniform sampler2D terrainTraceMap;
uniform vec4 terrainTraceBounds;`)
      .replace('  if(hasWind){',`  // Lab sand has a dedicated seasonal metadata tag (4/255).
  if(snowSample(splatIndex).w>.014&&snowSample(splatIndex).w<.018){
    vec2 traceUV=(center.xz-terrainTraceBounds.xy)/terrainTraceBounds.zw;
    if(all(greaterThanEqual(traceUV,vec2(0.)))&&all(lessThanEqual(traceUV,vec2(1.)))){
      vec4 traces=textureLod(terrainTraceMap,traceUV,0.);
      float snowy=${physical?'smoothstep(.003,.03,accumulatedGround.w)':'smoothstep(.025,.16,settledSnow(snowSample(splatIndex),normalize(axisC)))'};
      vec2 ink=mix(traces.rg,traces.ba,snowy);
      ${physical?'ink*=mix(1.,.35+.65*accumulatedAppearance.w,snowy);':''}
      vec3 hollow=mix(vec3(.35,.245,.145),vec3(.38,.49,.65),snowy);
      vec3 rim=mix(vec3(.88,.72,.48),vec3(.92,.96,1.),snowy);
      paintColor=mix(paintColor,hollow,ink.x*.72);
      paintColor=mix(paintColor,rim,ink.y*.42*(1.-ink.x));
      center.y+=ink.y*.012-ink.x*.008;
    }
  }
  if(hasWind){`);
  }
  snapshot(){return {mode:'persistent-terrain',resolution:this.size,bytes:this.data.byteLength,stamps:this.stamps,occupiedTexels:this.occupied,holdSeconds:this.holdSeconds,fadeSeconds:this.fadeSeconds,uploads:this.uploads};}
  dispose(){this.texture.dispose();}
}
