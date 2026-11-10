import {Vector3} from 'three';
import {loadTenguCourier} from './tenguCourier.js';
import {hillsideHeight} from './ghibli.js';
import {POND,pondDistance} from './wetlands.js';

const HOME={x:-22,z:38};
// Keep the courier above the shallows where the painted water covers the ground.
const ground=(x,z)=>Math.max(hillsideHeight(x,z),pondDistance(x,z)<1?POND.level:-Infinity)+.12;

function screenLimits(camera){
 const corner=new Vector3();
 // The entire envelope must fit, including wing spread, banking, splat edges,
 // and room for a full jump. Reserve it even when the courier is standing still.
 const fits=(x,z)=>{
  if(x< -65||x>35||z< -42||z>54)return false;
  const y=ground(x,z);
  for(const dx of [-3.1,3.1])for(const dz of [-3.1,3.1])for(const dy of [-.25,5.9]){
   corner.set(x+dx,y+dy,z+dz).project(camera);
   if(Math.abs(corner.x)>.98||Math.abs(corner.y)>.98||Math.abs(corner.z)>1)return false;
  }
  return true;
 };
 return (controller,previous)=>{
  const {position,velocity}=controller;
  if(fits(position.x,position.z))return;
  let {x,z}=previous;
  if(!fits(x,z)){
   // A resize or pond orbit can put the old position outside the new frame.
   // Pull toward the starting area and keep as much progress as will fit.
   let home=HOME;
   if(!fits(home.x,home.z)){
    for(let depth=HOME.z;depth>=-42;depth-=2){
     const center=camera.getWorldDirection(corner);
     const cx=camera.position.x+(depth-camera.position.z)*center.x/center.z;
     if(fits(cx,depth)){home={x:cx,z:depth};break;}
    }
   }
   x=home.x;z=home.z;
  }
  // Clip each component independently so diagonal input slides along an edge.
  for(const axis of ['x','z']){
   const start=axis==='x'?x:z,end=position[axis];
   const allowed=value=>axis==='x'?fits(value,z):fits(x,value);
   let next=end;
   if(!allowed(end)){
    let lo=0,hi=1;
    for(let i=0;i<12;i++){
     const t=(lo+hi)/2;
     if(allowed(start+(end-start)*t))lo=t;else hi=t;
    }
    next=start+(end-start)*lo;velocity[axis]=0;
   }
   if(axis==='x')x=next;else z=next;
  }
  position.x=x;position.z=z;
 };
}

export async function loadSummerAnimals(loadAnimals){
 const animals=await loadAnimals();
 let limit;
 try{
  const crow=await loadTenguCourier({count:10000,shadowCount:192,groundHeight:ground,
   constrain:(controller,previous)=>limit?.(controller,previous)});
  Object.assign(crow.controller.position,HOME);
  crow.controller.yaw=-.55;crow.advance(0);
  return {
   crow,splats:[...animals.splats,...crow.splats],root:animals.root,
   get time(){return animals.time;},
   audio:crow.audio,
   attachEngine(engine){
    limit=screenLimits(engine.camera);crow.attachEngine(engine);
   },
   advance(dt){animals.advance(dt);crow.advance(dt);},
   writePacked(data,centers,start){
    animals.writePacked(data,centers,start);
    crow.writePacked(data,centers,start+animals.splats.length);
   },
   dispose(){animals.dispose();crow.dispose();},
  };
 }catch(error){animals.dispose();throw error;}
}
