import test from 'node:test';
import assert from 'node:assert/strict';
import {createCathedral} from '../src/splat/cathedral.js';
import {packSplats} from '../src/splat/math.js';
import {prepareColorResponse,applyColorResponse} from '../src/splat/colorResponse.js';

// Build once here; generic scene validation already covers every covariance,
// all numeric fields and repeatable generation for this and the other studies.
const scene=createCathedral();
const {environment,architecture,houses}=scene.composition;
const baseCount=environment.underpaintCount+(environment.apronCount||0);
const skyStart=baseCount+environment.patchCount+environment.glintCount;
const sky=scene.splats.slice(skyStart,environment.total);
const pavement=scene.splats.slice(0,skyStart);
const building=scene.splats.slice(environment.total,environment.total+architecture.count);
const village=scene.splats.slice(environment.total+architecture.count);
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} ≠ ${b}`);


test('cathedral composition accounts separately for pavement, light touches, sky and architecture',()=>{
  assert.equal(environment.total,skyStart+environment.skyCount);
  assert.equal(sky.length,environment.skyCount);
  assert.equal(environment.skyCount,environment.skyUnderpaintCount+environment.cloudCount);
  assert.equal(environment.skyScumbleCount,0,'the smooth sky must not contain a directional scumble layer');
  assert.equal(building.length,architecture.count);
  assert.equal(scene.splats.length,environment.total+architecture.count+houses.count);
  assert.equal(village.length,houses.count);
  assert.ok(environment.glintCount>=500&&environment.glintCount<=1500);
  assert.ok(environment.skyUnderpaintCount>=18000&&environment.skyCount<35000);
  assert.ok(scene.atmosphere.density>0&&scene.atmosphere.max>0&&scene.atmosphere.max<1);
});

test('smooth sky surrounds all eight octants and round cloud volumes bypass fog and surface-light baking',()=>{
  const counts=new Uint32Array(8),center=environment.sky.center;
  for(let i=0;i<sky.length;i++){
    const splat=sky[i];
    assert.equal(splat.material,'cloud');assert.equal(splat.noFog,true);
    const radial=splat.center.map((v,i)=>v-center[i]);
    const distance=Math.hypot(...radial),axes=splat.axes.map(axis=>Math.hypot(...axis));
    close(axes[0],axes[1]);
    if(i<environment.skyUnderpaintCount){
      close(distance,environment.sky.radius);
      const octant=(radial[0]>0?1:0)|(radial[1]>0?2:0)|(radial[2]>0?4:0);
      counts[octant]++;
    }else{
      const [minRadius,maxRadius]=environment.sky.cloudRadiusRange;
      assert.ok(distance>=minRadius-1e-6&&distance<=maxRadius+1e-6,'cloud volumes remain inside their authored spherical shell');
      close(axes[1],axes[2]);
    }
    assert.ok(splat.axes[2].reduce((sum,v,i)=>sum+v*radial[i],0)<0,'sky surfaces face inward');
  }
  assert.ok(counts.every(count=>count>environment.skyUnderpaintCount/12),'the sky must include rear and lower directions as well as the front view');
});

test('pavement and reflected-light touches stay flat, within their ground bounds, and contain no grass',()=>{
  const {min,max}=environment.pavementBounds;
  for(const splat of pavement){
    assert.equal(splat.material,'stone');assert.notEqual(splat.noFog,true);
    for(let axis=0;axis<3;axis++)assert.ok(splat.center[axis]>=min[axis]-1e-6&&splat.center[axis]<=max[axis]+1e-6);
    close(splat.axes[0][1],0);close(splat.axes[1][1],0);
    close(splat.axes[2][0],0);close(splat.axes[2][2],0);assert.ok(splat.axes[2][1]>0);
  }
  for(const splat of pavement.slice(0,baseCount))close(splat.center[1],min[1]);
  const glints=pavement.slice(baseCount+environment.patchCount);
  assert.equal(glints.length,environment.glintCount);
  assert.ok(glints.every(s=>s.center[1]>=0&&s.center[1]<=.02),'light touches hug the level pavement');
});

test('cathedral has front, rear, side and roof surfaces plus real portal recess depth',()=>{
  const normal=s=>s.axes[2].map(v=>v/Math.hypot(...s.axes[2]));
  const faces={front:0,rear:0,left:0,right:0,roof:0,recess:0,jambs:0};
  for(const splat of building){
    const [x,y,z]=splat.center,n=normal(splat);
    assert.equal(splat.material,'stone');assert.notEqual(splat.noFog,true);
    if(z>.05&&n[2]>.7)faces.front++;
    if(z<-19&&n[2]<-.7)faces.rear++;
    if(x<-9.6&&n[0]<-.7)faces.left++;
    if(x>architecture.bounds.max[0]-4&&n[0]>.7)faces.right++;
    if(y>18&&n[1]>.5)faces.roof++;
    if(Math.abs(x)<2.2&&y>.1&&y<4.7&&z<-1&&z>-1.3)faces.recess++;
    if(Math.abs(Math.abs(x)-2.2)<.08&&y>.1&&y<4.8&&z<0&&z>-1.16&&Math.abs(n[0])>.9)faces.jambs++;
  }
  for(const key of ['front','rear','left','right','roof'])assert.ok(faces[key]>300,`${key} must contain real volumetric surface samples: ${faces[key]}`);
  assert.ok(faces.recess>50&&faces.jambs>20,'portal shadows must be recessed surfaces with depth-bearing jambs, not a front-plane decal');
});

test('the pale background spire has grounded masonry on every side',()=>{
  const spire=building.slice(-architecture.backgroundSpire.count);
  const base=spire.filter(s=>s.center[1]<20);
  assert.ok(Math.min(...base.map(s=>s.center[1]))<1,'the tower must reach pavement level');
  for(const [axis,sign] of [[0,-1],[0,1],[2,-1],[2,1]]){
    assert.ok(base.filter(s=>s.axes[2][axis]*sign/Math.hypot(...s.axes[2])>.7).length>30,'grounded walls must surround the tower');
  }
});

test('village houses are low grounded volumes with pitched roofs and visible rear walls',()=>{
  assert.equal(houses.houseCount,6);
  assert.ok(village.every(s=>s.material==='stone'&&s.center[1]>=0));
  assert.ok(village.some(s=>s.center[1]<.1));
  const normal=s=>s.axes[2].map(v=>v/Math.hypot(...s.axes[2]));
  for(const [axis,sign] of [[0,-1],[0,1],[2,-1],[2,1]])assert.ok(village.filter(s=>normal(s)[axis]*sign>.8).length>150);
  assert.ok(village.filter(s=>s.center[1]>3&&normal(s)[1]>.5&&normal(s)[1]<.95).length>100,'roof pitches carry actual three-dimensional splats');
});

test('fog-exempt seed packing round-trips without altering pigment or irradiance channels',()=>{
  const sample=[{...pavement[0],seed:0},{...sky[0],seed:0},{...sky[1],seed:.1234567},{...building[0],seed:.999}];
  const incoming=new Float32Array([.01,.03,.02,.11,.02,.07,.05,.09,.04,.08,.12,.03]);
  const packed=packSplats(sample,8,incoming);
  const withoutFlags=packSplats(sample.map(s=>({...s,noFog:false})),8,incoming);
  for(let i=0;i<sample.length;i++){
    const base=i*20,encoded=packed.data[base+19],exempt=encoded<0,seed=exempt?-1-encoded:encoded;
    assert.equal(exempt,!!sample[i].noFog);close(seed,sample[i].seed,1e-7);
    for(let c=0;c<3;c++){
      close(packed.data[base+16+c],sample[i].color[c]);
      close(packed.data[base+7+c*4],incoming[i*3+c]);
    }
    for(let c=0;c<19;c++)assert.equal(packed.data[base+c],withoutFlags.data[base+c]);
  }
  const snapshot=packed.data.slice(),prepared=prepareColorResponse(sample,{irradiance:incoming,shadow:new Float32Array(sample.length)});
  applyColorResponse(prepared,{indirect:false,tintedShadows:false},packed.data);
  assert.deepEqual(packed.data,snapshot,'disabling color response must preserve the packed sky flag, seed, radiance and original colors');
});
