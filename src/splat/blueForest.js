/** The blue petrified forest. Generated meshes are sampled with their painted
 * UVs, as in the torii/cottage study. Every visible surface is a 3D splat. */
import {addForestWaterfalls,FOREST_CASCADES,FOREST_WATERFALL_TRUNKS,upperWaterContains,lowerReachContains,OPENING_OFFSET,openingPoint} from './ForestWaterfalls.js';
import {addDeepPool} from './ForestDeepPool.js';
import {PANORAMA_CAMERA,addPanoramaModels} from './ForestPanorama.js';
import {loadForestLandscape,forestLandscapeHeight,forestLandscapeWater,forestLandscapeOpacity} from './ForestLandscape.js';
import {addForestLandscape} from './ForestLandscapeSurfaces.js';
import {createForestSediment} from './ForestSediment.js';
import {loadForestBankDetails,forestBankSample,createPillarSandField,paintForestCeilingRays} from './ForestBankDetails.js';
const TAU=Math.PI*2;
const add=(a,b)=>a.map((v,k)=>v+b[k]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const hex=h=>h.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const random=initial=>{let s=initial;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};
const slugs=['ancient_column','broad_stump','snapped_trunk','fallen_log','branch_trunk','rim_trunk'];
let assets,pending;
export async function prepareBlueForest(fetcher=globalThis.fetch){
  if(assets)return;
  if(!pending)pending=(async()=>{
    const response=await fetcher('/blue-forest/models.json');
    if(!response.ok)throw new Error(`Could not load the forest models (${response.status}).`);
    const manifest=await response.json(),loaded={};
    await Promise.all(slugs.map(async slug=>{
      const meta=manifest.assets.find(a=>a.slug===slug);
      if(!meta)throw new Error(`Missing forest model: ${slug}`);
      const response=await fetcher(`/blue-forest/${slug}.bin`);
      if(!response.ok)throw new Error(`Could not load ${slug}.`);
      const data=new Float32Array(await response.arrayBuffer());
      if(data.length!==meta.count*9||!data.every(Number.isFinite))throw new Error(`Invalid forest surface: ${slug}`);
      loaded[slug]={...meta,samples:data};
    }));
    await Promise.all([loadForestBankDetails(fetcher),loadForestLandscape(fetcher)]);
    assets=loaded;
  })().finally(()=>{pending=null;});
  await pending;
}

export function createBlueForest(source=assets){
  if(!source)throw new Error('Prepare the forest models first.');
  const rnd=random(611063),splats=[],animated=[],layers={},instances=[],fossilMirrors=[];
  let LIGHT=unit([-.6,.85,.65]),panoramaLighting=false;
  function mark(p,n,d,length,width,depth,color,extra={}){
    n=unit(n);let u=d.map((v,k)=>v-n[k]*dot(n,d));
    if(Math.hypot(...u)<.01)u=cross(n,Math.abs(n[1])>.9?[1,0,0]:[0,1,0]);
    u=unit(u);
    const s={center:p,axes:[mul(u,length),mul(unit(cross(n,u)),width),mul(n,depth)],color:typeof color==='string'?hex(color):color,opacity:.99,material:'wood',seed:rnd(),...extra};
    // Keep the random sequence stable while omitting fully faded waterfall marks.
    if(s.opacity===0)return s;
    if(s.wind)animated.push(splats.length);splats.push(s);return s;
  }
  const layer=(name,fn)=>{const start=splats.length;fn();layers[name]={start,count:splats.length-start};};
  const localGround=(x,z)=>forestLandscapeHeight(OPENING_OFFSET[0]-x,OPENING_OFFSET[2]-z)-12.6;
  const localDry=(x,z)=>{
    const wx=OPENING_OFFSET[0]-x,wz=OPENING_OFFSET[2]-z;
    return forestLandscapeWater(wx,wz)===0?clamp((localGround(x,z)-.02)/.65)*forestLandscapeOpacity(wx,wz):0;
  };
  function model(slug,x,z,height,yaw=0,stride=1,y=.22,tint=1,stretch=1,waterLevel=0){
    // Re-seat the original props without changing their horizontal arrangement.
    if(!panoramaLighting&&y>=0)y=Math.max(y,localGround(x,z)-.12);
    const asset=source[slug],cs=Math.cos(yaw),sn=Math.sin(yaw);
    const rotate=a=>[cs*a[0]+sn*a[2],a[1],-sn*a[0]+cs*a[2]],start=splats.length;
    const slanted=slug==='snapped_trunk',polished=slanted||slug==='rim_trunk'||slug==='broad_stump',mirror=polished?fossilMirrors.length:-1;
    const capBase=slanted?.858:.94,slope=slanted?[.170,-.393]:[0,0];
    const rx=slug==='broad_stump'?.631:slanted?.234:.362,rz=slug==='broad_stump'?.633:slanted?.285:.397;
    const cutOutline=a=>{
      if(slanted)return .985+.008*Math.sin(a*5);
      const sector=TAU/9,facet=Math.cos(Math.PI/9)/Math.cos(((a+.21)%sector+sector)%sector-sector*.5);
      const gap=b=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
      return facet*(1-.115*Math.exp(-(gap(.65)**2)/.018)-.065*Math.exp(-(gap(3.5)**2)/.035));
    };
    const capPlane=(lx,lz)=>slug==='rim_trunk'&&lx*.7+lz>.13?1.015:capBase+slope[0]*lx+slope[1]*lz;
    const capNormal=unit(rotate([-slope[0]/stretch,1,-slope[1]/stretch]));
    if(polished){
      const radius=Math.max(asset.dimensions[0],asset.dimensions[2])*height*stretch*.55;
      fossilMirrors.push({level:y+height*capBase,point:[x,y+height*capBase,z],normal:capNormal,bounds:[x-radius,z-radius,x+radius,z+radius]});
    }
    for(let i=0;i<asset.count;i+=stride){
      const k=i*9,d=asset.samples;
      let lx=d[k],ly=d[k+1],lz=d[k+2],normal=[d[k+3],d[k+4],d[k+5]];
      if(panoramaLighting&&slug==='branch_trunk'){
        if(lz>.065){lz=.065+(lz-.065)*1.85;normal[2]/=1.85;}lz+=.035;
      }
      const cap=polished&&ly>(slanted?.65:.82)&&normal[1]>.55;
      const wedge=slug==='rim_trunk'&&lx*.7+lz>.13;
      if(cap)continue; // Replaced below by a continuous, densely sampled cut face.
      if(polished&&!slanted){
        const amount=clamp((ly-.68)/.24),factor=1+(cutOutline(Math.atan2(lz/rz,lx/rx))-1)*amount;
        lx*=factor;lz*=factor;
      }
      if(polished){
        const plane=capPlane(lx,lz);
        if(slanted)ly=Math.min(ly,plane-.002);
        else if(ly>.72){ly=.72+(ly-.72)*(plane-.72)/.28;normal[1]*=.28/(plane-.72);}
      }
      const local=[lx*height*stretch,ly*height,lz*height*stretch];
      const p=add([x,y,z],rotate(local)),n=unit(rotate([normal[0]/stretch,normal[1],normal[2]/stretch]));
      const radial=slug==='fallen_log'?[0,ly-.48,lz]:[lx,.02,lz];
      const paintedNormal=unit(add(mul(n,.26),mul(unit(rotate(radial)),.74)));
      const light=(panoramaLighting ? .43+.72*Math.max(0,dot(paintedNormal,LIGHT)) : .55+.52*Math.max(0,dot(paintedNormal,LIGHT)))*tint;
      let pigment=[d[k+6],d[k+7],d[k+8]];
      if(slug==='rim_trunk')pigment=pigment.map((v,i)=>(v-[.256,.349,.458][i])*2.6+[.33,.49,.62][i]);
      else if(slug==='branch_trunk')pigment=pigment.map((v,i)=>(v-[.268,.501,.646][i])*.95+[.31,.44,.54][i]);
      else pigment=[pigment[0],pigment[1]-.006,pigment[2]+.035];
      let color=pigment.map(v=>clamp(v*light));
      {
        const angle=slug==='fallen_log'?Math.atan2(lz,ly-.48):Math.atan2(lz,lx),along=slug==='fallen_log'?lx:ly;
        const vein=Math.pow(.5+.5*Math.sin(angle*47+.38*Math.sin(along*9)),7);
        const fissure=Math.pow(.5+.5*Math.sin(angle*83+.30*Math.sin(along*7+1)),12);
        color=mix(color,hex('#9baccc'),vein*.20*Math.max(.2,dot(paintedNormal,LIGHT)));
        color=mix(color,hex('#122c45'),fissure*.22);
      }
      // Dark blue pigment gathers in submerged bark, preserving sampled paint.
      if(p[1]<waterLevel+.15)color=mix(color,hex('#122d49'),panoramaLighting?.60:.35);
      const size=asset.radius*height*Math.sqrt(stride)*Math.sqrt(stretch);
      const grain=slug==='fallen_log'?[1,.035,.02]:[.025,1,.018];
      const long=1.75,wide=.61;
      const edgeDistance=Math.min(polished?Math.max(.01,y+height*capPlane(lx,lz)-p[1]):Infinity,
        panoramaLighting?Math.max(.008,Math.abs(p[1]-waterLevel)):Infinity);
      if(edgeDistance<size*long*3){
        const tangent=unit(cross(n,[0,1,0]));
        mark(p,n,tangent,size*.72,Math.max(size*.055,Math.min(size*.52,edgeDistance/3)),size*.045,color);
      }else mark(p,n,rotate(grain),size*long,size*wide,size*.065,color);
      // Small crystalline facets, pinned to the bark; their specular response is
      // view-dependent in the forest-only shader, so they do not blink randomly.
      if(panoramaLighting&&!cap&&p[1]>waterLevel+.4&&i%101===0&&dot(n,LIGHT)>.32){
        mark(add(p,mul(n,size*.12)),n,rotate(grain),size*.40,size*.20,size*.025,'#f3eef7',
          {material:'mineral glint',opacity:.94,wind:[0,.7,0,12]});
      }
    }
    if(polished){
      // Match the cut's measured perimeter, not the wider root/base bounds.
      const outline=cutOutline;
      const plane=capPlane;
      const place=(lx,ly,lz)=>add([x,y,z],rotate([lx*height*stretch,ly*height,lz*height*stretch]));
      const count=Math.max(600,Math.round((slanted?1350:2400)/Math.sqrt(stride))),radius=Math.sqrt(Math.PI*rx*rz/count)*height*stretch;
      const topPigment=hex(panoramaLighting?'#527b96':'#789cab');
      for(let j=0;j<count;j++){
        const a=j*2.39996323,r=Math.sqrt((j+.5)/count)*outline(a),lx=Math.cos(a)*rx*r,lz=Math.sin(a)*rz*r,ly=plane(lx,lz);
        const rings=Math.sin(r*62+.45*Math.sin(a*3))*.009;
        mark(place(lx,ly,lz),capNormal,rotate([1,slope[0]/stretch,0]),radius*.77,radius*.77,.002*height,
          topPigment.map(v=>clamp(v+rings)),{material:'polished fossil',wind:[mirror,.88,0,11]});
      }
      // A slender lit bevel follows the real edge, including the raised wedge.
      for(let j=0;j<240;j++){
        const a=j/240*TAU,r=outline(a),lx=Math.cos(a)*rx*r,lz=Math.sin(a)*rz*r,ly=plane(lx,lz);
        const radial=rotate([Math.cos(a),.25,Math.sin(a)]),tangent=rotate([-Math.sin(a),(-slope[0]*Math.sin(a)+slope[1]*Math.cos(a))/stretch,Math.cos(a)]);
        mark(place(lx,ly+.001,lz),radial,tangent,radius*.55,radius*.055,.012,'#d9dfea',
          {material:'fossil rim light',opacity:.84,wind:[0,0,0,14]});
      }
      if(slug==='rim_trunk'){
        for(let j=0;j<65;j++){
          const lx=-rx+j/64*rx*2,lz=.13-lx*.7;
          if((lx/rx)**2+(lz/rz)**2>.96)continue;
          for(let k=0;k<5;k++){
            mark(place(lx,.94+(k+.5)/5*.075,lz),rotate([-.7,0,-1]),rotate([1,0,-.7]),radius*.66,height*.009,.018,'#34516b');
          }
          mark(place(lx,1.016,lz),[0,1,0],rotate([1,0,-.7]),radius*.6,radius*.045,.01,'#d1dbe8',
            {material:'fossil rim light',opacity:.8,wind:[0,0,0,14]});
        }
      }
      if(!slanted)for(const angle of [.65,3.5,5.1])for(let j=0;j<32;j++){
        const r=.60+j/31*.39,a=angle+.018*Math.sin(j*.6),edge=outline(a),lx=Math.cos(a)*rx*r*edge,lz=Math.sin(a)*rz*r*edge;
        mark(place(lx,plane(lx,lz)+.0015,lz),capNormal,rotate([Math.cos(a),0,Math.sin(a)]),radius*.22,radius*.026,.005,'#27465c',
          {material:'cut fracture',opacity:.55+j/31*.35});
      }
    }
    instances.push({slug,position:[x,y,z],height,yaw,stride,stretch,radius:Math.hypot(asset.dimensions[0],asset.dimensions[2])*height*stretch*.5,start,count:splats.length-start});
  }
  // Unequal rows leave an open aisle and stagger the silhouettes in depth.
  const columns=[[-18,-10,46,1.1,1,.91], [23,-18,53,3.6,1,.82],[-38,-22,49,.5,3,.72], [-2,-32,52,2.6,3,.64],[-20,-40,55,4.1,4,.61],[32,-45,58,1.5,4,.58]];
  for(let row=0;row<4;row++)for(let col=0;col<8;col++){
    const x=-47+col*14+(rnd()-.5)*7,z=-43-row*16+(rnd()-.5)*9;
    columns.push([x,z,43+rnd()*20,rnd()*TAU,12+row*3,.54-row*.035]);
  }
  layer('columns',()=>columns.forEach(([x,z,h,yaw,stride,tint])=>model('ancient_column',x,z,h,yaw,stride,.18,tint,.45+rnd()*.18)));
  layer('stumps',()=>{
    model('broad_stump',-7.5,1.2,5.9,.6,1,.12,1.15);
    model('snapped_trunk',7,-7,10.2,.2,1,.24,1.05);
    model('broad_stump',19,-19,4.4,2.1,3,.24,.74);
    model('snapped_trunk',-19,-16,6.2,4.5,3,.2,.76);
    model('broad_stump',13.5,8,2.3,.2,3,-.35,.82);
    model('snapped_trunk',-30,1,3.8,1.7,4,.2,.74);
  });
  layer('fallen',()=>{
    model('fallen_log',-9,11,2.2,2.5,1,-.4,.97);
    model('fallen_log',4,-.7,1.35,.15,2,.15,1.0);
    model('fallen_log',-23,-17,2.1,-.8,3,.1,.67);
  });
  const obstacles=[[-9,11,3.1],[13.5,8,2.1],[-7.5,1.2,3.7]];
  const pillarBases=instances.filter(p=>p.slug!=='fallen_log'&&p.position[1]>=0&&localDry(p.position[0],p.position[2])>.1).map(p=>{
    const outline=new Array(48).fill(0),data=source[p.slug].samples;
    for(let i=0;i<data.length;i+=9){
      if(data[i+1]>.065)continue;
      const a=(Math.atan2(data[i+2],data[i])+TAU)%TAU,index=Math.floor(a/TAU*48);
      outline[index]=Math.max(outline[index],Math.hypot(data[i],data[i+2])*p.height*p.stretch);
    }
    const radius=Math.max(...outline);
    for(let i=0;i<48;i++)if(!outline[i])outline[i]=radius*.72;
    return {x:p.position[0],z:p.position[2],yaw:-p.yaw,outline,radius};
  });
  const pillarSand=createPillarSandField(pillarBases,localDry);
  const sandHeight=(x,z)=>localGround(x,z)+pillarSand(x,z);
  layer('pillarSandDrifts',()=>{
    // Finer grains at the contact zones make the wind-built shoulders readable
    // against the roots while the same continuous field supplies the ground.
    let count=0;
    for(let i=0;i<6200&&count<2600;i++){
      const x=-33+66*((i*.61803398875)%1),z=-34+40*((i*.75487766625)%1);
      if(pillarSand(x,z)<.18||localDry(x,z)<.2)continue;
      if(pillarBases.some(p=>Math.hypot(x-p.x,z-p.z)<p.radius*.60))continue;
      const y=sandHeight(x,z),dx=(sandHeight(x+.12,z)-sandHeight(x-.12,z))/.24,dz=(sandHeight(x,z+.12)-sandHeight(x,z-.12))/.24;
      const n=unit([-dx,1,-dz]),shade=clamp(.42+.40*dot(n,LIGHT)+.08*(forestBankSample(x,z,2)-.5));
      mark([x,y+.018,z],n,[1,dx,0],.32,.30,.012,mix(hex('#7497b6'),hex('#c2d2e5'),shade),{material:'forest sand drift'});
      count++;
    }
  });
  // Skeletal canopy filaments continue from column tops: no leaf blobs.
  function branch(a,yaw,reach,rise,r,level){
    const b=add(a,[Math.cos(yaw)*reach,rise,Math.sin(yaw)*reach]);
    const control=add(a,[Math.cos(yaw)*reach*.28,rise*.83,Math.sin(yaw)*reach*.28]);
    const length=Math.hypot(reach,rise),rows=Math.ceil(length/.7),radial=4;
    for(let j=0;j<rows;j++){
      const t=(j+.5)/rows,q=1-t;
      const center=a.map((v,k)=>q*q*v+2*q*t*control[k]+t*t*b[k]);
      const axis=unit(a.map((_,k)=>2*q*(control[k]-a[k])+2*t*(b[k]-control[k])));
      const u=unit(cross(axis,[0,1,0])),v=cross(axis,u),radius=r*(1-t*.52);
      for(let k=0;k<radial;k++){
        const ang=k/radial*TAU,n=add(mul(u,Math.cos(ang)),mul(v,Math.sin(ang)));
        mark(add(center,mul(n,radius)),n,axis,length/rows*.56,radius*.78,radius*.18,mix(hex('#203d4e'),hex('#608c9b'),clamp(.27+dot(n,LIGHT)*.25)));
      }
    }
    if(level>0)for(const sign of [-1,1])branch(b,yaw+sign*(.25+rnd()*.27),reach*.62,rise*.46,r*.51,level-1);
  }
  layer('canopy',()=>columns.slice(0,10).forEach(([x,z,h])=>{
    for(let j=0;j<6;j++)branch([x,h*.84+Math.max(0,localGround(x,z)-.3),z],j/6*TAU+.7,h*.11,h*.21,.48,3);
  }));
  layer('lightshafts',()=>{
    paintForestCeilingRays(splats,[
      {from:[12,43,-9],to:[-2,.7,3],width:.38,strength:.09},
      {from:[-4,52,-29],to:[-21,1,-17],width:.28,strength:.072},
      {from:[25,57,-42],to:[3,1,-30],width:.48,strength:.08},
    ]);
  });
  layer('submergedOpeningLog',()=>model('fallen_log',5,13,.68,.7,6,localGround(5,13)+.05,.9));
  // Rigid placement of the complete initial scene on the shallow upper reach.
  // Relative prop positions, mesh scales and rotations within the group are retained.
  const openingCount=splats.length;
  for(const s of splats){s.center=openingPoint(s.center);for(const a of s.axes){a[0]=-a[0];a[2]=-a[2];}}
  for(const instance of instances){instance.position=openingPoint(instance.position);instance.yaw+=Math.PI;}
  for(const obstacle of obstacles){obstacle[0]=OPENING_OFFSET[0]-obstacle[0];obstacle[1]=OPENING_OFFSET[2]-obstacle[1];}
  for(const mirror of fossilMirrors){
    mirror.level+=OPENING_OFFSET[1];
    mirror.point=openingPoint(mirror.point);mirror.normal=[-mirror.normal[0],mirror.normal[1],-mirror.normal[2]];
    const [x0,z0,x1,z1]=mirror.bounds;
    mirror.bounds=[OPENING_OFFSET[0]-x1,OPENING_OFFSET[2]-z1,OPENING_OFFSET[0]-x0,OPENING_OFFSET[2]-z0];
  }
  LIGHT=unit([.65,.7,-.65]);panoramaLighting=true;
  obstacles.push(...FOREST_WATERFALL_TRUNKS);
  addForestWaterfalls({mark,layer,random:rnd,splats});
  const panoramaAnchors=addPanoramaModels({model,layer,source,terrainHeight:forestLandscapeHeight});
  addDeepPool({mark,layer,random:rnd});
  const sediment=createForestSediment(instances);
  const terrainHeight=(x,z)=>forestLandscapeHeight(x,z)+pillarSand(OPENING_OFFSET[0]-x,OPENING_OFFSET[2]-z)+sediment.height(x,z);
  const landscape=addForestLandscape({mark,layer,splats,height:terrainHeight,instances,sediment});
  layer('panoramaCeilingRays',()=>paintForestCeilingRays(splats,[
      {from:[-52,65,41],to:[-34,1,18],width:.42,strength:.075},
      {from:[-103,72,38],to:[-84,.5,15],width:.30,strength:.058},
  ]));
  // Solid submerged receivers retain the elevation of their own reach.
  for(let i=0;i<splats.length;i++){
    const s=splats[i];s.opacity*=Math.max(.000001,forestLandscapeOpacity(s.center[0],s.center[2]));
    if(s.wind||!['wood','stone'].includes(s.material))continue;
    const [x,y,z]=s.center,level=upperWaterContains(x,z)?12.6:lowerReachContains(x,z)?0:null;
    if(level===null||y>=level-.025)continue;
    s.wind=[level,0,0,16];animated.push(i);
  }
  return {splats,background:'#132e3e',orbitLimit:280,animation:{indices:animated},
    forestCaustics:{scale:8,speed:.18,strength:1.45},
    shoreGlitter:true,waterfalls:true,waterfallPaths:FOREST_CASCADES.map(c=>[...c.flow,c.top,c.bottom]),waterfallWidths:FOREST_CASCADES.map(c=>[c.near,c.far]),fossilMirrors,
    upperWater:{level:12.6,bounds:[-125,20,3,123],contains:upperWaterContains,absorption:[.22,.08,.06]},
    reflection:{level:0,bounds:[-174,-104,18,70],blend:[.74,.22],minReflectance:.40,distortion:[.00015,.00015],blur:.00025,waveAmplitude:.025},
    refraction:{ior:1.333,strength:1,clarity:.84,maxDepth:24,absorption:[.10,.042,.028]},
    dynamicWater:{amplitude:.035,speed:.65,flow:[-.9,-.25],obstacles,contains:(x,z)=>upperWaterContains(x,z)||lowerReachContains(x,z)},
    atmosphere:{color:'#234d70',horizonColor:'#4d7698',start:75,density:.0025,max:.86,heightStart:45,heightDensity:.011},
    lighting:{irradiance:new Float32Array(splats.length*3),shadow:new Float32Array(splats.length),stats:{bakeMs:0}},
    composition:{layers,instances,opening:{count:openingCount,offset:OPENING_OFFSET,rotationY:Math.PI,level:12.6},assets:slugs,panoramaAnchors,waterfalls:FOREST_CASCADES,landscape,bankRelief:'/blue-forest/bank-relief.json',method:'Meshy 7.1 geometry, reference-guided PBR, UV-colored surface splats; fresh LibreTerrain two-lake map with dunes, hydraulic erosion, native basin masks and an open fading perimeter'},
  };
}

export const blueForestScene={id:'blue-forest',label:'Blue forest',title:'Beneath the petrified forest',caption:'Ancient trunks & living water',description:'Broken blue trunks above a still pool. Click the water to make ripples.',
  reference:'/blue-forest/reference.png',shortcut:'b',aspect:16/10,styleOnVisit:true,splatBudget:550000,
  camera:{position:openingPoint([9,10,39]),target:openingPoint([-3,4.6,-13]),focalLength:34},
  panoramaView:{...PANORAMA_CAMERA,reference:'/blue-forest/panorama-reference.png',mirror:true},
  terrainView:{position:[-184,157,-130],target:[-63,7,65],focalLength:31,aspect:16/10},
  waterfallView:{position:[-44,41,-98],target:[-44,8,10],focalLength:91,aspect:500/316,reference:'/blue-forest/water-animation-reference.gif',mirror:true},
  initialStyle:{quality:'draft',mode:'gaussian',brushScale:1.02,coverage:1.12,softness:.28,gouacheTexture:.45,gouacheBlend:.35,gouacheTone:.25,indirect:false,tintedShadows:false,sun:false,lensFlare:false,lensDirt:false,foregroundDOF:false,painterlyVignette:false,vignetteStrength:.16,vignetteSpread:.4,vignetteSwirl:0},
  prepare:prepareBlueForest,create:createBlueForest};
