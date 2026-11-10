const materials=['stone','foliage','wood','water','emissive'];
const unit=a=>{const length=Math.hypot(...a);return a.map(v=>v/length);};
const half=bits=>{
  const sign=bits&32768?-1:1,exponent=(bits>>>10)&31,mantissa=bits&1023;
  return exponent===0?sign*mantissa*2**-24:exponent===31?(mantissa?NaN:sign*Infinity):sign*(1+mantissa/1024)*2**(exponent-15);
};

/** 40-byte records: float32 positions, normalized int16 frames, half sizes. */
export function decodePlantDetail(buffer,group,level){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<16)throw new Error('Incomplete plant detail.');
  const view=new DataView(buffer),count=view.getUint32(8,true);
  if(view.getUint32(0,true)!==0x444f4c4e||view.getUint32(4,true)!==1||view.getUint32(12,true)!==40||count!==group.levels[level-1]?.count||count>100000||buffer.byteLength!==16+count*40)throw new Error('Unsupported or incomplete plant detail.');
  const splats=[],parents=new Uint32Array(count);
  for(let i=0;i<count;i++){
    const k=16+i*40,center=[0,1,2].map(j=>view.getFloat32(k+j*4,true));
    const n=unit([0,1,2].map(j=>view.getInt16(k+12+j*2,true)/32767));
    const direction=[0,1,2].map(j=>view.getInt16(k+18+j*2,true)/32767);
    const dot=direction.reduce((sum,v,j)=>sum+v*n[j],0),t=unit(direction.map((v,j)=>v-dot*n[j]));
    const b=[n[1]*t[2]-n[2]*t[1],n[2]*t[0]-n[0]*t[2],n[0]*t[1]-n[1]*t[0]];
    const sizes=[0,1,2].map(j=>half(view.getUint16(k+24+j*2,true)));
    const color=[0,1,2].map(j=>view.getUint8(k+30+j)/255),opacity=view.getUint8(k+33)/255;
    const parent=view.getUint16(k+36,true),material=materials[view.getUint8(k+38)];
    if(![...center,...n,...t,...sizes].every(Number.isFinite)||sizes.some(v=>v<=0)||!opacity||!material||parent>=group.count)throw new Error(`Invalid plant detail record ${i}.`);
    splats.push({center,axes:[t.map(v=>v*sizes[0]),b.map(v=>v*sizes[1]),n.map(v=>v*sizes[2])],color,opacity,seed:view.getUint16(k+34,true)/65536,material});
    parents[i]=group.start+parent;
  }
  return {splats,parents};
}

export async function loadPlantDetail(group,level,signal,fetcher=globalThis.fetch){
  const file=group.levels[level-1],response=await fetcher(file.url,{signal});
  if(!response.ok)throw new Error(`Plant detail could not load (${response.status}).`);
  const compressed=await response.arrayBuffer();
  // Some static servers label .gz files Content-Encoding: gzip, so Fetch has
  // already decompressed them. Others serve the gzip bytes as an opaque file.
  if(compressed.byteLength>=16&&new DataView(compressed).getUint32(0,true)===0x444f4c4e)return decodePlantDetail(compressed,group,level);
  if(compressed.byteLength!==file.bytes)throw new Error('Incomplete plant detail download.');
  const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const bytes=await new Response(stream).arrayBuffer();
  if(signal?.aborted)throw new DOMException('Plant detail cancelled.','AbortError');
  return decodePlantDetail(bytes,group,level);
}
