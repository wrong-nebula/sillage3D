import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera} from 'three';
import {SORT_WORKER_DEFAULTS,SORT_WORKER_MIN_SPLATS,SORT_WORKER_SLACK,createSortScene,runSort,standInRows} from '../src/splat/SplatSortJob.js';
import {SplatSortClient} from '../src/splat/SplatSortClient.js';
import {SplatVisibility} from '../src/splat/SplatVisibility.js';
import {buildMarkClusters,selectMarkClusters,clusterOwners,refreshClusterStill} from '../src/splat/MarkClusters.js';
import {packSplats,depthOrder} from '../src/splat/math.js';

const source=name=>readFileSync(new URL(`../src/splat/${name}`,import.meta.url),'utf8');
let state=11;const random=()=>(state=(state*1664525+1013904223)>>>0)/4294967296;
// A sheet of small marks far from the camera (they merge), larger marks around it, and three "actor" marks at the end.
function sceneFixture(){
  const splats=[];
  for(let j=0;j<40;j++)for(let i=0;i<40;i++)splats.push({center:[(i-20)*.03,0,(j-20)*.03],axes:[[.028,0,0],[0,0,.028],[0,.004,0]],color:[.2+.015*i,.5,.2+.015*j],opacity:.96,seed:((i*7+j*13)%97)/97,material:'stone'});
  for(let i=0;i<500;i++)splats.push({center:[(random()-.5)*90,(random()-.5)*60,-random()*100+20],axes:[[.2+random(),0,0],[0,.2+random(),0],[0,0,.05]],color:[.5,.4,.3],opacity:.8,seed:.5,wind:i%9===0?[0,0,0,2]:undefined});
  const authored={position:[0,2,30],target:[0,0,0],fov:40};
  const clusters=buildMarkClusters(splats,{camera:authored,height:688,pixels:2});
  const environment=splats.length;
  for(let i=0;i<3;i++)splats.push({center:[i-1,1,-i],axes:[[.3,0,0],[0,.3,0],[0,0,.3]],color:[1,0,0],opacity:1,seed:.2});
  const packed=packSplats(splats),count=splats.length,wind=new Float32Array(count*4),flags=new Uint8Array(count);
  splats.forEach((s,i)=>{if(s.wind)wind[i*4+3]=s.wind[3];if(i%13===5&&i>=1600&&i<environment)flags[i]=1;});
  return {splats,packed,count,wind,flags,clusters,environment,authored};
}
const cameraAt=(position,target,fov=40,aspect=1100/688)=>{const camera=new PerspectiveCamera(fov,aspect,.08,600);camera.position.set(...position);camera.lookAt(...target);camera.updateMatrixWorld(true);return camera;};

// What the renderer does on the main thread for one changing view.
function mainThread(f,camera,options,shown,still,{slack=0}={}){
  const {packed,count,wind,flags,clusters,environment}=f,order=depthOrder(packed.centers,camera.matrixWorldInverse.elements,new Uint32Array(count));
  const culler=new SplatVisibility(packed.data,count),front=new Float32Array(count),back=new Float32Array(count);
  const counts=culler.write(order,packed.centers,camera,options,front,back,flags,{width:1100,height:688,wind,actorStart:environment,reach:2,slack});
  const hidden=new Uint8Array(count),clusterShown=selectMarkClusters(clusters,shown,hidden,packed.data,
    {view:camera.matrixWorldInverse.elements,projection:camera.projectionMatrix.elements,width:1100,height:688,footprint:options.brushScale,still,verify:false});
  const kept=[];for(let i=0;i<counts.foreground;i++)if(!hidden[front[i]])kept.push(front[i]);
  return {foreground:kept,background:Array.from(back.subarray(0,counts.background)),culled:counts.culled,clusterShown};
}
function job(f,camera,options,shown,still,extra={}){
  return {centers:packed32(f),view:Array.from(camera.matrixWorldInverse.elements),projection:Array.from(camera.projectionMatrix.elements),near:camera.near,far:camera.far,width:1100,height:688,
    options,reach:2,footprint:options.brushScale,clusterEnabled:true,still,shown,foreground:new Float32Array(f.count),background:new Float32Array(f.count),...extra};
}
const packed32=f=>Float32Array.from(f.packed.centers);

test('the job a worker runs returns the list the main thread builds',()=>{
  assert.equal(SORT_WORKER_DEFAULTS.sortWorker,true);assert.ok(SORT_WORKER_MIN_SPLATS>=10_000);assert.ok(SORT_WORKER_SLACK>0&&SORT_WORKER_SLACK<1);
  const f=sceneFixture(),{clusters,packed,count}=f;assert.ok(clusters&&clusters.merged.length>20);
  const scene=createSortScene({count,actorStart:f.environment,sigma:new SplatVisibility(packed.data,count).sigma,wind:f.wind,flags:f.flags,
    clusters:{starts:clusters.starts,members:clusters.members,merged:clusters.merged,pixels:clusters.pixels,standIns:standInRows(clusters,packed.data)}});
  const options={brushScale:1.2,mode:'ghibli',gouacheBlend:.44},groups=clusters.merged.length;
  const still=new Uint8Array(groups).fill(1),workerShown=new Uint8Array(groups),mainShown=new Uint8Array(groups);
  // A walk of views: the stand-in choice has hysteresis, so its history must agree too.
  const views=[[[0,2,30],[0,0,0]],[[3,3,28],[0,0,0]],[[0,5,2],[0,0,0]],[[0,2,9],[0,0,0]],[[20,4,10],[0,0,0]],[[0,2,30],[0,0,0]]];
  let merged=0,members=0;
  for(const [position,target] of views){
    const camera=cameraAt(position,target),expected=mainThread(f,camera,options,mainShown,still),request=job(f,camera,options,workerShown,still);
    const {counts,clusterShown}=runSort(scene,request);
    assert.deepEqual(Array.from(request.foreground.subarray(0,counts.foreground)),expected.foreground);
    assert.deepEqual(Array.from(request.background.subarray(0,counts.background)),expected.background);
    assert.equal(counts.culled,expected.culled);assert.equal(counts.submitted,counts.foreground+counts.background);
    assert.equal(clusterShown,expected.clusterShown);assert.deepEqual([...workerShown],[...mainShown]);
    merged+=clusterShown;members+=groups-clusterShown;
  }
  assert.ok(merged>0&&members>0,'the walk shows both stand-ins and members');
  // A member physics has moved: the main thread says so, and the group gives way in the job too.
  const victim=workerShown.indexOf(1),member=clusters.members[clusters.starts[victim]];
  packed.data[member*20+1]+=.5;packed.centers[member*3+1]+=.5;
  refreshClusterStill(clusters,still,packed.data,[member],clusterOwners(clusters,count));assert.equal(still[victim],0);
  const camera=cameraAt(...views[0]),request=job(f,camera,options,workerShown,still),{counts}=runSort(scene,request),list=Array.from(request.foreground.subarray(0,counts.foreground));
  assert.equal(workerShown[victim],0);assert.ok(list.includes(member));assert.ok(!list.includes(clusters.merged[victim]));
});

test('slack widens the frustum without changing the order of what was already listed',()=>{
  const f=sceneFixture(),{packed,count,clusters}=f,options={brushScale:1};
  const scene=createSortScene({count,actorStart:f.environment,sigma:new SplatVisibility(packed.data,count).sigma,wind:f.wind,flags:null,clusters:null});
  const camera=cameraAt([0,2,30],[0,0,0]);
  const tight=job(f,camera,options,null,null,{background:null}),wide=job(f,camera,options,null,null,{background:null,slack:SORT_WORKER_SLACK});
  const a=runSort(scene,tight).counts,b=runSort(scene,wide).counts;
  const tightList=Array.from(tight.foreground.subarray(0,a.foreground)),wideList=Array.from(wide.foreground.subarray(0,b.foreground));
  assert.ok(b.foreground>a.foreground,'more marks are kept');
  const kept=new Set(tightList);assert.deepEqual(wideList.filter(index=>kept.has(index)),tightList);
  // Turned by less than the slack, the wide list still holds every mark the new view needs.
  const turned=cameraAt([0,2,30],[2,0,0]),next=job(f,turned,options,null,null,{background:null}),c=runSort(scene,next).counts;
  const widened=new Set(wideList);for(const index of next.foreground.subarray(0,c.foreground))assert.ok(widened.has(index));
});

test('the worker serves only dragged or orbiting views, and rest is built on the main thread',()=>{
  const renderer=source('GaussianBrushRenderer.js'),worker=source('SplatSortWorker.js'),client=source('SplatSortClient.js');
  assert.equal(SplatSortClient.supported(),typeof Worker==='function');
  // The sort asks the worker first; otherwise the main thread's list voids any job still out.
  assert.match(renderer,/if\(this\.sortThroughWorker\(start\)\)\{this\.sortDirty=false;this\.stats\.sortMs=performance\.now\(\)-start;return;\}\s+\/\/[^\n]*\n\s+this\.sortEpoch\+\+;this\.sortMoving=false;this\.sortedOnce=true;/);
  assert.match(renderer,/const moving=changed&&\(this\.autoOrbit\|\|now-this\.lastPointerTime<SORT_WORKER_LINGER\|\|this\.sortStreak\)&&this\.sortWorkerEligible\(\);/);
  // Exports, mirrors, water and plant level of detail never use it.
  assert.match(renderer,/this\.options\.sortWorker!==false&&this\.sortedOnce&&!this\.exporting&&SplatSortClient\.supported\(\)/);
  assert.match(renderer,/!this\.lod&&!this\.desert&&!this\.reflectionConfig&&!this\.refraction&&!this\.upperWater&&!this\.fossilMirrors\?\.length&&!this\.crystalStudio/);
  // The worker's list is not rebuilt by the frame, and a view waiting for it is not at rest.
  assert.match(renderer,/if\(camera&&!reflection&&this\.sortMoving\)return;/);
  assert.match(renderer,/\(this\.dirty\|\|this\.sortMoving\|\|/);
  // Every answer marks the order dirty: a view that moved on is asked again, a stopped one is rebuilt exactly.
  assert.match(renderer,/request\.epoch!==this\.sortEpoch\|\|request\.generation!==result\.generation\)return;/);
  // An answer for a view that has moved on asks again at once; one for the current view hands back to the main thread.
  assert.match(renderer,/if\(view!==request\.view&&this\.sortWorkerEligible\(\)\)this\.postWorkerSort\(view\);else this\.sortDirty=true;/);
  assert.match(renderer,/slack:SORT_WORKER_SLACK,/);
  // A worker list with no job out and no request pending is replaced by the main thread's.
  assert.match(renderer,/if\(this\.sortMoving&&!this\.sortDirty&&!this\.sortClient\?\.busy\)\{this\.sortDirty=true;this\.dirty=true;\}/);
  // The buffers travel both ways, also when a job is answered without a result.
  assert.match(worker,/const transfer=\[centers\.buffer,foreground\.buffer\];if\(background\)transfer\.push\(background\.buffer\);/);
  assert.match(client,/if\(this\.busy\|\|this\.failed\)return 0;/);
  assert.match(client,/new Worker\(new URL\('\.\/SplatSortWorker\.js',import\.meta\.url\),\{type:'module'\}\)/);
});
