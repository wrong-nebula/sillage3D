import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AnimatedGLBSplats} from '../src/splat/AnimatedGLBSplats.js';
import {packSplats} from '../src/splat/math.js';
import {dogGround,dogPose} from '../src/splat/dogField.js';

function fixture({clip=false}={}){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0],4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
  const bone=new THREE.Bone();bone.name='joint';
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({color:'#b16c3e'}));
  mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));
  const scene=new THREE.Group();scene.add(mesh);
  const animations=clip?[new THREE.AnimationClip('step',1,[new THREE.NumberKeyframeTrack('joint.position[z]',[0,1],[0,2])])]:[];
  return {gltf:{scene,animations},bone,mesh};
}

test('surface samples follow bone deformation and keep their identity through pause and updates',()=>{
  const {gltf,bone}=fixture(),actor=new AnimatedGLBSplats(gltf,{count:100,height:1});
  const before=actor.splats.map(s=>({center:s.center.slice(),seed:s.seed,color:s.color.slice()}));
  bone.position.z=.75;actor.update();
  actor.splats.forEach((s,i)=>{
    assert.ok(Math.abs(s.center[2]-before[i].center[2]-.75)<1e-6);
    assert.equal(s.seed,before[i].seed);assert.deepEqual(s.color,before[i].color);
    assert.ok(s.axes.every(axis=>Math.hypot(...axis)>0));
  });
  const posed=JSON.stringify(actor.splats);actor.update(0);assert.equal(JSON.stringify(actor.splats),posed);
  actor.dispose();
});

test('embedded GLB clips advance the same surface pipeline',()=>{
  const {gltf}=fixture({clip:true}),actor=new AnimatedGLBSplats(gltf,{count:30,height:1});
  actor.update(.25);
  assert.deepEqual(actor.clipNames,['step']);
  actor.splats.forEach(s=>assert.ok(Math.abs(s.center[2]-.5)<1e-6));
  actor.dispose();
});

test('switching embedded clips preserves surface samples and rejects unknown clips',()=>{
  const {gltf}=fixture({clip:true});
  gltf.animations.push(new THREE.AnimationClip('hop',1,[new THREE.NumberKeyframeTrack('joint.position[z]',[0,1],[0,6])]));
  const actor=new AnimatedGLBSplats(gltf,{count:30,height:1}),samples=actor.samples,seeds=actor.splats.map(s=>s.seed);
  actor.update(.25);actor.setClip(1,{fade:0});actor.update(.25);
  assert.equal(actor.currentClip,1);assert.equal(actor.samples,samples);
  assert.deepEqual(actor.splats.map(s=>s.seed),seeds);
  actor.splats.forEach(s=>assert.ok(Math.abs(s.center[2]-1.5)<1e-6));
  assert.throws(()=>actor.setClip(5),RangeError);assert.equal(actor.currentClip,1);
  actor.dispose();
});

test('interrupted crossfades preserve the displayed pose and normalized weights',()=>{
  const {gltf}=fixture();gltf.animations=[0,2,4].map((z,i)=>new THREE.AnimationClip(`pose${i}`,2,[new THREE.NumberKeyframeTrack('joint.position[z]',[0,2],[z,z])]));
  const actor=new AnimatedGLBSplats(gltf,{count:20,height:1});actor.setClip(1,{fade:.4});actor.update(.12);
  const before=actor.splats[0].center[2];actor.setClip(2,{fade:.4});actor.update(0);
  assert.ok(Math.abs(actor.splats[0].center[2]-before)<1e-6);
  assert.ok(Math.abs(gltf.animations.reduce((sum,clip)=>sum+actor.mixer.existingAction(clip).getEffectiveWeight(),0)-1)<1e-6);
  actor.update(.4);assert.ok(Math.abs(actor.splats[0].center[2]-4)<1e-6);assert.equal(actor.mixer.existingAction(gltf.animations[0]).isScheduled(),false);actor.dispose();
});

test('surface footprints follow deformation, stay orthogonal and hide degenerate faces',()=>{
  const {gltf,bone}=fixture(),actor=new AnimatedGLBSplats(gltf,{count:20,height:1,deformCovariance:true});
  const initial=Math.hypot(...actor.splats[0].axes[0]);bone.scale.x=1.5;actor.update();
  assert.ok(Math.abs(Math.hypot(...actor.splats[0].axes[0])/initial-1.5)<1e-6);
  for(const s of actor.splats)assert.ok(Math.abs(s.axes[0].reduce((sum,v,k)=>sum+v*s.axes[1][k],0))<1e-10);
  bone.scale.x=0;actor.update();assert.ok(actor.splats.every(s=>s.opacity===0&&s.axes.flat().every(Number.isFinite)));
  bone.scale.x=1;actor.update();assert.ok(actor.splats.every(s=>s.opacity>.9));actor.dispose();
});

test('animated positions, axes, and colors update only their allocated packed records',()=>{
  const {gltf,bone}=fixture(),actor=new AnimatedGLBSplats(gltf,{count:30,height:1});
  const staticSplat={center:[2,3,4],axes:[[1,0,0],[0,1,0],[0,0,1]],color:[.1,.2,.3],seed:.1,opacity:1};
  const packed=packSplats([staticSplat,...actor.splats]),original=packed.data.slice(0,20);
  bone.rotation.y=.4;actor.update();actor.writePacked(packed.data,packed.centers,1);
  assert.deepEqual(packed.data.slice(0,20),original);
  actor.splats.forEach((s,i)=>s.center.forEach((v,k)=>assert.ok(Math.abs(packed.centers[(i+1)*3+k]-v)<1e-6)));
  assert.ok(packed.data.every(Number.isFinite));actor.dispose();
});

test('dog route loops continuously, stays in the clearing and follows the ground',()=>{
  const period=Math.PI*2/.23;
  for(let t=0;t<period;t+=.1){
    const {position:[x,y,z],yaw}=dogPose(t);
    assert.ok(Math.abs(x)<=2.05&&Math.abs(z)<=.9&&Number.isFinite(yaw));
    assert.equal(y,dogGround(x,z)+.025);
  }
  dogPose(period).position.forEach((v,i)=>assert.ok(Math.abs(v-dogPose(0).position[i])<1e-10));
});

test('wide actors normalize by span and retain source material opacity',()=>{
  const {gltf,mesh}=fixture();mesh.scale.set(4,1,1);mesh.material.opacity=.35;
  const actor=new AnimatedGLBSplats(gltf,{count:100,span:2});
  assert.equal(actor.source.scale.x,.5);
  actor.splats.forEach(s=>{assert.ok(s.center[0]>=-1&&s.center[0]<=1);assert.ok(s.center[1]<=.5);assert.equal(s.opacity,.98*.35);});
  actor.dispose();
});

test('direct skinning reproduces three.js vertex positions bit for bit, and falls back for morphs and edits',()=>{
  // Four blended bones, a non-identity bind pose, scaled parents and a normalized weight buffer.
  let state=99;const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const count=300,positions=[],indices=[],weights=[];
  for(let i=0;i<count;i++){
    positions.push(rnd()*2-1,rnd()*3,rnd()*2-1);
    const raw=[rnd(),rnd()<.4?0:rnd(),rnd()<.6?0:rnd(),rnd()<.8?0:rnd()],sum=raw.reduce((a,b)=>a+b,0);
    indices.push(...raw.map(()=>Math.floor(rnd()*5)));weights.push(...raw.map(w=>Math.round(w/sum*65535)));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('skinIndex',new THREE.Uint8BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new THREE.BufferAttribute(Uint16Array.from(weights),4,true));
  geometry.setIndex(Array.from({length:count-count%3},(_,i)=>i));
  const bones=Array.from({length:5},(_,i)=>{const bone=new THREE.Bone();bone.position.set(rnd()-.5,.4+rnd(),rnd()-.5);bone.rotation.set(rnd(),rnd(),rnd());return bone;});
  bones[1].add(bones[2]);bones[2].add(bones[3]);bones[0].add(bones[1]);
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());
  mesh.add(bones[0],bones[4]);mesh.position.set(.3,-.2,.7);mesh.rotation.y=.6;mesh.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(bones));
  const scene=new THREE.Group();scene.add(mesh);
  const actor=new AnimatedGLBSplats({scene,animations:[]},{count:200,height:1.4,deformCovariance:true}),entry=actor.meshes[0];
  const reference=()=>{
    actor.root.updateMatrixWorld(true);
    const out=new Float32Array(entry.vertices.length),v=new THREE.Vector3();
    for(let i=0;i<count;i++)mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld).toArray(out,i*3);
    return out;
  };
  for(let pose=0;pose<6;pose++){
    for(const bone of bones){bone.rotation.x+=rnd()-.5;bone.rotation.z+=rnd()-.5;bone.position.y+=(rnd()-.5)*.2;bone.scale.setScalar(.8+rnd()*.4);}
    actor.root.rotation.y=pose*.7;actor.root.position.x=pose*.31;
    actor.updateVertices();
    assert.ok(entry.skin,'skinned meshes take the direct path');
    assert.deepEqual(entry.vertices,reference());
  }
  // Packing writes the same twenty-float layout, leaving the auxiliary slots alone.
  actor.update(0);
  const data=new Float32Array((actor.splats.length+1)*20).fill(7),centers=new Float32Array((actor.splats.length+1)*3).fill(7);
  actor.writePacked(data,centers,1);
  actor.splats.forEach((splat,i)=>{
    const k=(i+1)*20,f=Math.fround;
    assert.deepEqual([...data.subarray(k,k+20)],[...splat.center.map(f),f(splat.opacity),...splat.axes[0].map(f),7,...splat.axes[1].map(f),7,...splat.axes[2].map(f),7,...splat.color.map(f),7]);
    assert.deepEqual([...centers.subarray((i+1)*3,(i+1)*3+3)],splat.center.map(f));
  });
  assert.ok(data.subarray(0,20).every(v=>v===7));
  // Re-authored attributes rebuild the tables; morph targets keep three's own path.
  const table=entry.skin;geometry.attributes.position.setX(0,5);geometry.attributes.position.needsUpdate=true;
  actor.updateVertices();assert.notEqual(entry.skin,table);assert.deepEqual(entry.vertices,reference());
  geometry.morphAttributes.position=[new THREE.Float32BufferAttribute(positions.map(()=>rnd()*.1),3)];geometry.morphTargetsRelative=true;mesh.morphTargetInfluences=[.5];
  actor.updateVertices();assert.equal(entry.skin,null);assert.deepEqual(entry.vertices,reference());
});

test('surface frames are three.js vector arithmetic bit for bit, with and without stretching',()=>{
  let state=4242;const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const count=240,positions=[],indices=[],weights=[];
  for(let i=0;i<count;i++){
    positions.push(rnd()*2-1,rnd()*3,rnd()*2-1);
    const raw=[rnd(),rnd()<.5?0:rnd(),0,0],sum=raw[0]+raw[1];
    indices.push(Math.floor(rnd()*3),Math.floor(rnd()*3),0,0);weights.push(raw[0]/sum,raw[1]/sum,0,0);
  }
  const light=new THREE.Vector3(-.8,1.1,.7).normalize();
  for(const deformCovariance of [true,false]){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const bones=Array.from({length:3},()=>{const bone=new THREE.Bone();bone.position.set(rnd()-.5,.4+rnd(),rnd()-.5);return bone;});bones[0].add(bones[1]);
    const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({color:'#8a6a4a'}));
    mesh.add(bones[0],bones[2]);mesh.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton(bones));
    const scene=new THREE.Group();scene.add(mesh);
    const actor=new AnimatedGLBSplats({scene,animations:[]},{count:400,height:1.4,deformCovariance});
    // The update as it was written with Vector3 calls.
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),edge=new THREE.Vector3(),normal=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3();
    const reference=()=>{
      const frames=new Map(),out=[];
      actor.samples.forEach((sample,i)=>{
        const {triangle,weights:w}=sample,{ids,entry}=triangle;let frame=frames.get(triangle);
        if(!frame){
          frame={u:new THREE.Vector3(),v:new THREE.Vector3(),n:new THREE.Vector3()};frames.set(triangle,frame);
          a.fromArray(entry.vertices,ids[0]*3);b.fromArray(entry.vertices,ids[1]*3);c.fromArray(entry.vertices,ids[2]*3);
          edge.subVectors(b,a);c.sub(a);normal.crossVectors(edge,c);
          frame.valid=normal.lengthSq()>1e-18;
          if(frame.valid){
            normal.normalize();frame.n.copy(normal);
            if(deformCovariance){
              u.copy(edge).multiplyScalar(1.12/triangle.restLength);
              v.copy(c).addScaledVector(edge,-triangle.restX/triangle.restLength).multiplyScalar(.92/triangle.restY);
              const theta=.5*Math.atan2(2*u.dot(v),u.lengthSq()-v.lengthSq()),cos=Math.cos(theta),sin=Math.sin(theta);
              frame.u.copy(u).multiplyScalar(cos).addScaledVector(v,sin);
              frame.v.copy(v).multiplyScalar(cos).addScaledVector(u,-sin);
              for(const axis of [frame.u,frame.v])axis.setLength(THREE.MathUtils.clamp(axis.length(),.6,1.8));
            }else{frame.u.copy(edge).normalize().multiplyScalar(1.12);frame.v.crossVectors(normal,edge).normalize().multiplyScalar(.92);}
            frame.shade=.72+.28*Math.max(0,normal.dot(light));
          }
        }
        const p=entry.vertices,center=[0,1,2].map(k=>0+p[ids[0]*3+k]*w[0]+p[ids[1]*3+k]*w[1]+p[ids[2]*3+k]*w[2]);
        if(!frame.valid){out.push({center,opacity:0});return;}
        const r=sample.radius;
        out.push({center,opacity:sample.opacity,axes:[frame.u.toArray().map(x=>x*r),frame.v.toArray().map(x=>x*r),frame.n.toArray().map(x=>x*(r*.28))],color:sample.pigment.map(x=>x*frame.shade)});
      });
      return out;
    };
    let valid=0,hidden=0,stretched=0;
    for(let pose=0;pose<5;pose++){
      for(const bone of bones){bone.rotation.set(rnd()*2,rnd()*2,rnd()*2);bone.scale.set(.5+rnd()*2,.5+rnd()*2,.5+rnd()*2);}
      // A pose that collapses the surface: its marks are hidden, not given a frame.
      if(pose===3)for(const bone of bones)bone.scale.set(0,0,0);
      actor.root.rotation.y=pose*.9;
      actor.update(0);
      reference().forEach((expected,i)=>{
        const splat=actor.splats[i];
        assert.deepEqual(splat.center,expected.center);assert.equal(splat.opacity,expected.opacity);
        if(!expected.axes){hidden++;return;}
        valid++;assert.deepEqual(splat.axes,expected.axes);assert.deepEqual(splat.color,expected.color);
        const length=Math.hypot(...splat.axes[0])/actor.samples[i].radius;if(Math.abs(length-1.12)>.01)stretched++;
      });
    }
    assert.ok(valid>1500&&hidden>100,`${valid} valid, ${hidden} hidden`);
    if(deformCovariance)assert.ok(stretched>100,'scaled bones stretch the marks');else assert.equal(stretched,0);
  }
});
