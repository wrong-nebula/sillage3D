import {cliffTalusScene,createCliffPhysicsLab} from './cliffTalus.js';
let height,labSurface,desertSurface,albedo,resolution;
export const physicsLabScene={
  id:'physics-lab',label:'Physics lab',title:'Desert physics lab',physicsLab:true,biome:'desert',
  description:'A flat desert test basin framed by smooth high-resolution LibreTerrain dunes. Destructible rocks, flexible rigs and a shallow water basin with wet materials. I: inspect · P: water · U: drop in water · V: rigs · B: rock · E: explosion · H: fire · G: gust · N: snow.',
  caption:'LibreTerrain · desert physics basin',splatBudget:65000,
  camera:{position:[23,18,34],target:[0,1,0],fov:48},styleOnVisit:true,
  initialStyle:{...cliffTalusScene.initialStyle,lensDirt:false,foregroundDOF:false,mode:'gaussian',brushScale:1,coverage:1.2},
  async prepare(fetcher=globalThis.fetch){
    await cliffTalusScene.prepare(fetcher);if(height)return;
    const root=`${import.meta.env?.BASE_URL??'/'}physics-lab/`,metadata=await fetcher(root+'terrain.json');if(!metadata.ok)throw new Error('Missing desert terrain manifest');
    resolution=(await metadata.json()).resolution;if(!Number.isInteger(resolution)||resolution<129||resolution>2049)throw new Error('Invalid desert terrain resolution');
    const responses=await Promise.all(['height.f32','surface.u8','desert.u8','albedo.u8'].map(name=>fetcher(root+name)));
    if(responses.some(r=>!r.ok))throw new Error('Could not load the LibreTerrain desert ground.');
    const [data,channels,desert,colour]=await Promise.all(responses.map(r=>r.arrayBuffer()));if([data,channels,desert,colour].some(b=>b.byteLength!==resolution*resolution*4))throw new Error('Invalid desert terrain data.');
    labSurface=new Uint8Array(channels);desertSurface=new Uint8Array(desert);albedo=new Uint8Array(colour);
    const view=new DataView(data);height=new Float32Array(resolution*resolution);for(let i=0;i<height.length;i++){height[i]=view.getFloat32(i*4,true);if(!Number.isFinite(height[i]))throw new Error('Nonfinite physics ground.');}
  },
  create(){if(!height)throw new Error('Prepare the LibreTerrain desert ground first.');return createCliffPhysicsLab(height,labSurface,desertSurface,albedo);},
};
