import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {MARK_CLUSTER_SWITCH,plainStaticMark,markPixels,buildMarkClusters,selectMarkClusters,clusterOwners,refreshClusterStill} from '../src/splat/MarkClusters.js';
import {packSplats} from '../src/splat/math.js';

const source=name=>readFileSync(new URL(`../src/splat/${name}`,import.meta.url),'utf8');
const camera={position:[0,2,30],target:[0,0,0],fov:40};
// A flat sheet of small stone marks in front of the camera, colored by position.
function sheet(side=40,spacing=.03,sigma=.028){
  const splats=[];
  for(let j=0;j<side;j++)for(let i=0;i<side;i++){
    const x=(i-side/2)*spacing,z=(j-side/2)*spacing;
    splats.push({center:[x,0,z],axes:[[sigma,0,0],[0,0,sigma],[0,.004,0]],color:[.2+.6*i/side,.5,.2+.6*j/side],opacity:.96,seed:((i*7+j*13)%97)/97,material:'stone'});
  }
  return splats;
}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const viewOf=(position,target,fov,aspect=1.6)=>{const c=new THREE.PerspectiveCamera(fov,aspect,.08,600);c.position.fromArray(position);c.lookAt(new THREE.Vector3(...target));c.updateMatrixWorld(true);return {view:[...c.matrixWorldInverse.elements],projection:[...c.projectionMatrix.elements]};};

test('eligibility is limited to plain, wind-free environment marks',()=>{
  const base={center:[0,0,0],axes:[[1,0,0],[0,1,0],[0,0,1]],color:[1,1,1],opacity:1,seed:.5};
  assert.equal(plainStaticMark(base),true);
  for(const extra of [{wind:[0,0,0,2]},{noFog:true},{skyBackground:true},{softParticle:true},{celPaint:true},{sandGlint:true},{reefGlow:0},{thermal:[0,0,0]},{surfaceType:17},{jade:true}])
    assert.equal(plainStaticMark({...base,...extra}),false,JSON.stringify(extra));
});

test('projection agrees with the camera the renderer uses',()=>{
  const {view,projection}=viewOf(camera.position,camera.target,camera.fov),height=688,focal=height*.5/Math.tan(camera.fov*Math.PI/360);
  assert.ok(Math.abs(projection[5]*height*.5-focal)<1e-9);
  const splats=sheet(4);splats.push({center:[0,0,60],axes:[[1,0,0],[0,1,0],[0,0,1]],color:[1,1,1],opacity:1,seed:0});
  const before=splats.length,clusters=buildMarkClusters(splats,{camera,height,pixels:2});
  // The build derives the same view from position and target alone.
  for(const index of clusters.merged){
    const s=splats[index],a=markPixels(s.center,s.axes,view,focal,focal);
    assert.ok(a.size>0&&a.size<2*MARK_CLUSTER_SWITCH.hide*2&&a.depth>25);
  }
  assert.equal(markPixels([0,0,60],splats[before-1].axes,view,focal,focal).size,Infinity);
  assert.throws(()=>buildMarkClusters(splats,{height,pixels:2}),RangeError);
});

test('each group becomes one stand-in with its center, pigment, area and normal',()=>{
  const splats=sheet(),original=splats.length,clusters=buildMarkClusters(splats,{camera,height:688,pixels:2});
  assert.ok(clusters.merged.length>40);
  assert.equal(splats.length,original+clusters.merged.length);
  // Stand-ins follow the marks they summarize, in one block, and every member belongs to one group.
  clusters.merged.forEach((index,c)=>assert.equal(index,original+c));
  assert.equal(new Set(clusters.members).size,clusters.members.length);assert.ok(clusters.members.every(index=>index<original));
  assert.equal(clusters.starts.at(-1),clusters.members.length);assert.equal(clusters.rest.length,clusters.members.length*3);
  let covered=0;
  clusters.merged.forEach((index,c)=>{
    const stand=splats[index],group=[...clusters.members.subarray(clusters.starts[c],clusters.starts[c+1])].map(i=>splats[i]);
    assert.ok(group.length>=2);covered+=group.length;
    assert.equal(stand.markCluster,true);assert.equal(stand.material,'stone');assert.equal(stand.seed,group[0].seed);assert.equal(stand.opacity,.96);
    for(let k=0;k<3;k++){
      const lo=Math.min(...group.map(s=>s.center[k])),hi=Math.max(...group.map(s=>s.center[k]));assert.ok(stand.center[k]>=lo-1e-9&&stand.center[k]<=hi+1e-9);
      assert.ok(stand.color[k]>=Math.min(...group.map(s=>s.color[k]))-1e-9&&stand.color[k]<=Math.max(...group.map(s=>s.color[k]))+1e-9);
    }
    const lengths=stand.axes.map(a=>Math.hypot(...a));
    // The same painted area as the members together, on perpendicular axes.
    assert.ok(Math.abs(lengths[0]*lengths[1]-group.length*.028*.028)<1e-9);
    for(let p=0;p<3;p++)for(let q=p+1;q<3;q++)assert.ok(Math.abs(dot(stand.axes[p],stand.axes[q]))/(lengths[p]*lengths[q])<1e-8);
    // The thin axis is the sheet's upward normal, at least as thick as a member.
    assert.ok(stand.axes[2][1]/lengths[2]>.999&&lengths[2]>=.004-1e-12);
  });
  assert.ok(covered>original*.8,`grouped ${covered} of ${original}`);
  assert.ok(packSplats(splats).data.every(Number.isFinite));
  // Deterministic, and marks that are already large are left alone.
  const again=sheet();assert.deepEqual(buildMarkClusters(again,{camera,height:688,pixels:2}).members,clusters.members);assert.deepEqual(again.at(-1),splats.at(-1));
  assert.equal(buildMarkClusters(sheet(10,.6,.5),{camera,height:688,pixels:2}),null);
  // Different materials and ineligible marks never share a stand-in.
  const mixed=sheet();mixed.forEach((s,i)=>{if(i%2)s.material='foliage';});
  const two=buildMarkClusters(mixed,{camera,height:688,pixels:2});
  two.merged.forEach((index,c)=>{for(let m=two.starts[c];m<two.starts[c+1];m++)assert.equal(mixed[two.members[m]].material,mixed[index].material);});
  const windy=sheet();windy.forEach(s=>{s.wind=[0,0,0,2];});assert.equal(buildMarkClusters(windy,{camera,height:688,pixels:2}),null);
});

test('the renderer draws a stand-in or its members, never both, and steps aside when a member moves',()=>{
  const splats=sheet(),clusters=buildMarkClusters(splats,{camera,height:688,pixels:2}),packed=packSplats(splats),groups=clusters.merged.length;
  const shown=new Uint8Array(groups),hidden=new Uint8Array(splats.length),at=(position,enabled=true)=>selectMarkClusters(clusters,shown,hidden,packed.data,{...viewOf(position,camera.target,camera.fov),width:1100,height:688,enabled});
  const exclusive=()=>clusters.merged.forEach((index,c)=>{for(let m=clusters.starts[c];m<clusters.starts[c+1];m++)assert.notEqual(hidden[clusters.members[m]],hidden[index]);});
  // From the authored camera most groups show their stand-in.
  const far=at(camera.position);exclusive();assert.ok(far>groups*.6,`${far} of ${groups}`);
  assert.equal(hidden.reduce((a,b)=>a+b,0),[...shown].reduce((sum,use,c)=>sum+(use?clusters.starts[c+1]-clusters.starts[c]:1),0));
  // Close up every group returns to its members; disabled, likewise.
  assert.equal(at([0,5,2]),0);exclusive();assert.ok(clusters.merged.every(index=>hidden[index]===1));
  at(camera.position);assert.equal(at(camera.position,false),0);exclusive();
  // The switch has hysteresis: a group at a size between the two limits keeps its state.
  const size=c=>{const k=clusters.merged[c]*20,{view,projection}=viewOf(camera.position,camera.target,camera.fov);
    return markPixels([...packed.data.subarray(k,k+3)],[0,1,2].map(j=>[...packed.data.subarray(k+4+j*4,k+7+j*4)]),view,projection[0]*550,projection[5]*344).size;};
  shown.fill(0);at(camera.position);const off=[...shown];shown.fill(1);at(camera.position);const on=[...shown];
  for(let c=0;c<groups;c++){const px=size(c);
    if(px<2*MARK_CLUSTER_SWITCH.show)assert.equal(off[c],1);
    if(px>=2*MARK_CLUSTER_SWITCH.hide)assert.equal(on[c],0);
    if(px>=2*MARK_CLUSTER_SWITCH.show&&px<2*MARK_CLUSTER_SWITCH.hide){assert.equal(off[c],0);assert.equal(on[c],1);}
  }
  // Physics moves one member: only its group gives way, and returns when the member is back.
  shown.fill(0);at(camera.position);const victim=shown.indexOf(1),member=clusters.members[clusters.starts[victim]],before=[...shown];
  packed.data[member*20+1]+=.5;at(camera.position);exclusive();
  assert.equal(shown[victim],0);assert.equal(hidden[clusters.merged[victim]],1);assert.equal(hidden[member],0);
  assert.deepEqual([...shown].filter((_,c)=>c!==victim),before.filter((_,c)=>c!==victim));
  packed.data[member*20+1]-=.5;at(camera.position);assert.equal(shown[victim],1);
  // With the groups at rest known, a moving camera reads no member: only the
  // groups of the marks physics names are rechecked, and the choice matches.
  const owner=clusterOwners(clusters,splats.length),still=new Uint8Array(groups).fill(1);
  clusters.merged.forEach((index,c)=>{assert.equal(owner[index],-1);for(let m=clusters.starts[c];m<clusters.starts[c+1];m++)assert.equal(owner[clusters.members[m]],c);});
  const trusted=position=>selectMarkClusters(clusters,shown,hidden,packed.data,{...viewOf(position,camera.target,camera.fov),width:1100,height:688,still,verify:false});
  shown.fill(0);const full=at(camera.position),fullShown=[...shown];shown.fill(0);assert.equal(trusted(camera.position),full);assert.deepEqual([...shown],fullShown);
  packed.data[member*20+1]+=.5;
  shown.fill(0);trusted(camera.position);assert.equal(shown[victim],1,'an unannounced move is not seen until the next full check');
  refreshClusterStill(clusters,still,packed.data,[member,clusters.merged[0]],owner);assert.equal(still[victim],0);assert.equal(still.reduce((a,b)=>a+b,0),groups-1);
  shown.fill(0);trusted(camera.position);exclusive();assert.equal(shown[victim],0);
  // A full check rewrites what is known.
  packed.data[member*20+1]-=.5;
  shown.fill(0);selectMarkClusters(clusters,shown,hidden,packed.data,{...viewOf(camera.position,camera.target,camera.fov),width:1100,height:688,still,verify:true});
  assert.equal(still[victim],1);assert.deepEqual([...shown],fullShown);
});

test('the cliff builds its stand-ins before the tables that index its splats',()=>{
  const cliff=source('cliffTalus.js'),renderer=source('GaussianBrushRenderer.js');
  const built=cliff.indexOf('const markClusters = buildMarkClusters(splats,');
  assert.ok(built>cliff.indexOf('const visibleBoulders = fadeCliffPerimeter(splats, boulderEnd);'));
  assert.ok(built<cliff.indexOf('splats, markClusters, seasonalSnow: winterSplats(splats, visibleBoulders, sample, height)'));
  assert.match(cliff,/height: lod\.clusterHeight, pixels: lod\.pixels/);
  // Every way of building the submitted list removes the losing side.
  assert.equal(renderer.split('this.hideClusterLosers(camera,reflection,width,height,').length,4);
  assert.match(renderer,/enabled:this\.markLodPixels\(\)>0,still:this\.clusterStill,verify\}\);/);
  // A new view trusts the groups known to be at rest; a repeated one reads every member.
  assert.match(renderer,/fresh=key===null\|\|key!==this\.clusterKey,verify=key===null\|\|\(!fresh&&this\.clusterVerified!==key\);/);
  assert.match(renderer,/if\(moving\?\.length&&!verify\)refreshClusterStill\(clusters,this\.clusterStill,data,moving,this\.clusterOwner\);/);
  assert.match(renderer,/for\(const index of clusters\.merged\)this\.clusterHidden\[index\]=1;/);
});
