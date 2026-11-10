import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Bone,Group,Object3D,Vector3} from 'three';
import {MeadowDogGait,RUN_STRIDE,RUN_LEGS,runningFoot} from '../src/splat/animation/meadowDogGait.js';
import {createMeadowDogRoute} from '../src/splat/meadowDog.js';
import {hillsideHeight} from '../src/splat/ghibli.js';

// Load the actual joint hierarchy without textures or a browser.
function rig(){
 const bytes=readFileSync(new URL('../public/models/dog.glb',import.meta.url));
 const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12))),joints=new Set(gltf.skins.flatMap(s=>s.joints));
 const nodes=gltf.nodes.map((n,i)=>{const o=joints.has(i)?new Bone():new Object3D();o.name=n.name;
  if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);return o;});
 gltf.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));
 const source=new Group(),root=new Group();gltf.scenes[gltf.scene].nodes.forEach(i=>source.add(nodes[i]));root.add(source);
 const bounds=gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION],scale=1.65/(bounds.max[1]-bounds.min[1]);
 source.scale.setScalar(scale);source.position.set(-(bounds.min[0]+bounds.max[0])*.5,-bounds.min[1],-(bounds.min[2]+bounds.max[2])*.5).multiplyScalar(scale);
 root.updateMatrixWorld(true);return root;
}

test('the gallop plants each paw at one world point, then has a suspension phase',()=>{
 const route=createMeadowDogRoute(hillsideHeight),period=RUN_STRIDE/route.speed,rest=new Vector3(.3,.058,.4);
 for(const leg of Object.values(RUN_LEGS)){
  const a=runningFoot((4+leg.touch+.02)*period,leg,rest,route,hillsideHeight);
  const b=runningFoot((4+leg.touch+leg.stance-.02)*period,leg,rest,route,hillsideHeight);
  assert.ok(a.contact&&b.contact);assert.ok(a.target.distanceTo(b.target)<1e-12);
 }
 for(const leg of Object.values(RUN_LEGS))assert.equal(runningFoot(4.9*period,leg,rest,route,hillsideHeight).contact,false);
});

test('actual rig keeps limb lengths, grounded contacts and deterministic poses around the pond loop',()=>{
 const root=rig(),route=createMeadowDogRoute(hillsideHeight),gait=new MeadowDogGait(root,route,hillsideHeight);
 // Steepest ground within reach of the paws, as rise over run.
 const steepness=(x,z)=>Math.max(...[[0,0],[.8,0],[-.8,0],[0,.8],[0,-.8]].map(([dx,dz])=>Math.hypot(hillsideHeight(x+dx+.4,z+dz)-hillsideHeight(x+dx-.4,z+dz),hillsideHeight(x+dx,z+dz+.4)-hillsideHeight(x+dx,z+dz-.4))/.8));
 const gentle={frames:0,contact:0,reach:0},steep={frames:0,contact:0,reach:0,missed:0};let worst;
 for(let t=0;t<route.period;t+=1/60){
  gait.update(t);const pose=route.pose(t),bank=steepness(pose.position[0],pose.position[2])>=.5,group=bank?steep:gentle;let contact=0,reach=0;
  for(const leg of Object.values(gait.legs)){
   const p=leg.bs.map(b=>b.getWorldPosition(new Vector3()));
   assert.ok(Math.abs(p[0].distanceTo(p[1])-leg.upper)<1e-4,`upper ${p[0].distanceTo(p[1])-leg.upper}`);assert.ok(Math.abs(p[1].distanceTo(p[2])-leg.lower)<1e-4,`lower ${p[1].distanceTo(p[2])-leg.lower}`);
   reach=Math.max(reach,leg.reachError);
   if(leg.contact){const miss=p[3].distanceTo(leg.target);contact=Math.max(contact,miss);if(miss>group.contact)worst={...worst,[bank?'steep':'gentle']:{time:t,leg:leg.bones[0],position:pose.position,miss}};}
  }
  group.frames++;group.contact=Math.max(group.contact,contact);group.reach=Math.max(group.reach,reach);
  if(bank&&(contact>.06||reach>.18))steep.missed++;
 }
 // On ground up to about 27 degrees every planted paw holds its world point
 // and every swing stays within the leg.
 assert.ok(gentle.frames>1900,`gentle frames ${gentle.frames}`);
 assert.ok(gentle.contact<.01,`contact reach error ${gentle.contact} ${JSON.stringify(worst?.gentle)}`);assert.ok(gentle.reach<.06,`swing reach error ${gentle.reach}`);
 // Known limit: the loop crosses the steep banks between the ponds, where a
 // fully extended leg cannot reach its plant for a few frames around
 // touchdown. Bounded here so it cannot grow unnoticed; fixing it needs a
 // shorter stride on banks or a route that avoids them.
 assert.ok(steep.missed<=70,`steep-bank misses ${steep.missed}`);
 assert.ok(steep.contact<.25,`steep contact reach error ${steep.contact} ${JSON.stringify(worst?.steep)}`);assert.ok(steep.reach<.42,`steep swing reach error ${steep.reach}`);
 gait.update(3);const expected=Object.values(gait.b).map(b=>b.matrixWorld.elements.slice());
 for(let i=0;i<=180;i++)gait.update(i/60);assert.deepEqual(Object.values(gait.b).map(b=>b.matrixWorld.elements.slice()),expected);
});
