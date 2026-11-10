/** One world-space LibreTerrain bake; no repeated tiles or separate bank pads. */
export const FOREST_LANDSCAPE_BOUNDS=[-174,-104,18,256];
const CHANNELS=8,MASK_CHANNELS=8;
let data,heights,masks,mapSide=1025,heightSide=2049;
export const forestLandscapeReady=()=>Boolean(data);
export async function loadForestLandscape(fetcher=globalThis.fetch){
  if(data)return;
  const metadata=await fetcher('/blue-forest/landscape.json');
  if(!metadata.ok)throw new Error('Could not load the LibreTerrain forest landscape.');
  const meta=await metadata.json();mapSide=meta.map_resolution||meta.resolution;heightSide=meta.resolution;
  const names=meta.map_resolution?['landscape.f32','landscape-height.f32','landscape-masks.u8']:['landscape.f32'];
  const responses=await Promise.all(names.map(name=>fetcher(`/blue-forest/${name}`)));
  if(responses.some(r=>!r.ok))throw new Error('Could not load the LibreTerrain forest landscape.');
  const [field,height,mask]=await Promise.all(responses.map(r=>r.arrayBuffer()));
  const nextData=new Float32Array(field),nextHeights=height?new Float32Array(height):Float32Array.from({length:mapSide*mapSide},(_,i)=>nextData[i*CHANNELS]);
  const nextMasks=mask?new Uint8Array(mask):new Uint8Array(mapSide*mapSide*MASK_CHANNELS);
  if(nextData.length!==mapSide*mapSide*CHANNELS||nextHeights.length!==heightSide*heightSide||nextMasks.length!==mapSide*mapSide*MASK_CHANNELS||
    !nextData.every(Number.isFinite)||!nextHeights.every(Number.isFinite))throw new Error('Invalid forest landscape.');
  data=nextData;heights=nextHeights;masks=nextMasks;
}
export function forestLandscapeSample(x,z,channel=0){
  if(!data)throw new Error('Prepare the forest landscape first.');
  const side=channel===0?heightSide:mapSide,last=side-1;
  const u=Math.max(0,Math.min(last,(x+174)/192*last)),v=Math.max(0,Math.min(last,(z+104)/360*last));
  const at=channel===0?(i,j)=>heights[j*side+i]:channel>=8?(i,j)=>masks[(j*side+i)*MASK_CHANNELS+channel-8]/255:(i,j)=>data[(j*side+i)*CHANNELS+channel];
  // Categorical water and circular directions must not interpolate across seams.
  if(channel===6||channel===7||channel===12)return at(Math.round(u),Math.round(v));
  const i=Math.min(last-1,Math.floor(u)),j=Math.min(last-1,Math.floor(v)),a=u-i,b=v-j;
  return (at(i,j)*(1-a)+at(i+1,j)*a)*(1-b)+(at(i,j+1)*(1-a)+at(i+1,j+1)*a)*b;
}
export const forestLandscapeHeight=(x,z)=>forestLandscapeSample(x,z);
export function forestLandscapeOpacity(x,z){
  if(x<-174||x>18||z<-104||z>256)return 0;
  // Same broad, irregular dissolving edge used by Cliff, without a basin wall.
  const radius=1-forestLandscapeSample(x,z,4)/85;
  const t=Math.max(0,Math.min(1,(radius-.72)/.27));
  return Math.pow(1-t*t*(3-2*t),2.25);
}
export function forestLandscapeWater(x,z){
  if(forestLandscapeOpacity(x,z)<.002)return 0;
  return forestLandscapeSample(x,z,6);
}
export function forestDryShoreDistance(x,z){
  if(forestLandscapeSample(x,z,6)!==0)return 0;
  for(const radius of [.4,1,2,3.5,5.2])for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,kind=forestLandscapeSample(x+Math.cos(angle)*radius,z+Math.sin(angle)*radius,6);
    if(kind===1||kind===2)return radius;
  }
  return Infinity;
}
export function forestLandscapeGradient(x,z){
  return [(forestLandscapeHeight(x+.3,z)-forestLandscapeHeight(x-.3,z))/.6,
    (forestLandscapeHeight(x,z+.3)-forestLandscapeHeight(x,z-.3))/.6];
}
