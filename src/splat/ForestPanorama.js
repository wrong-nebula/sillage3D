import * as THREE from 'three';

// Screen anchors are measured on the user's 1079 × 284 panorama after mirroring.
// A single perspective camera unprojects them into editable 3D placements.
export const PANORAMA_SIZE=[1079,284];
export const PANORAMA_CAMERA={position:[-62,41,-98],target:[-62,8,10],focalLength:42,aspect:1079/284};
const camera=new THREE.PerspectiveCamera(45,PANORAMA_CAMERA.aspect,.1,1000);
camera.filmGauge=36;camera.setFocalLength(PANORAMA_CAMERA.focalLength);
camera.position.fromArray(PANORAMA_CAMERA.position);camera.lookAt(...PANORAMA_CAMERA.target);camera.updateMatrixWorld(true);
const raycaster=new THREE.Raycaster();
function ray(x,y){raycaster.setFromCamera(new THREE.Vector2(x/1079*2-1,1-y/284*2),camera);return raycaster.ray;}
export function panoramaAnchor(x,y,level=0){return ray(x,y).intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-level),new THREE.Vector3()).toArray();}
export function panoramaProject(p){const v=new THREE.Vector3(...p).project(camera);return [(v.x+1)*1079/2,(1-v.y)*284/2];}
function topHeight(x,y,p){const r=ray(x,y);return r.origin.y+(p[2]-r.origin.z)/r.direction.z*r.direction.y;}
export function addPanoramaModels({model,layer,source,terrainHeight}){
  const anchors=[];
  function upright(slug,px,base,top,width,level,yaw,stride=1,tint=.9,buried=0){
    const p=panoramaAnchor(px,base,level),height=topHeight(px,top,p)-level+buried;
    const worldWidth=Math.abs(p[2]-camera.position.z)*36/42*width/1079;
    const dims=source[slug].dimensions,diameter=Math.hypot(dims[0]*Math.cos(yaw),dims[2]*Math.sin(yaw));
    const stretch=worldWidth/(height*diameter*(slug==='ancient_column'?.46:1));
    const rise=level===5.9?2.5:level===2.8?1.4:0;
    model(slug,p[0],p[2],height,yaw,stride,level+rise-buried,tint,stretch,level+rise);
    anchors.push({slug,pixel:[px,base],position:p,top,width});
  }
  layer('panoramaTrunks',()=>{
    upright('rim_trunk',766,237,126,169,0,2.55,1,1.0,5.2);
    // The branch points toward screen-left and the lens, exposing its cut end.
    upright('branch_trunk',411,218,-45,136,0,2.35,1,.98,0);
    upright('broad_stump',159,305,149,175,0,2.8,1,1.10,1.6);
    upright('ancient_column',102,180,-210,108,0,3.6,2,.86,18);
    upright('snapped_trunk',232,151,38,64,2.8,2.6,1,.92,.5);
    upright('ancient_column',628,180,-230,92,5.9,2.1,2,.61,20);
    upright('ancient_column',958,151,-235,106,0,1.8,2,.87,24);
    upright('ancient_column',803,90,-180,54,0,.6,4,.63,15);
    upright('broad_stump',681,120,30,76,0,2.4,2,.67,1);
    upright('snapped_trunk',662,287,226,43,0,1.3,2,.85,3);
    upright('broad_stump',34,290,239,90,0,1.8,3,.8,.5);
  });
  function log(px,py,width,yaw,level,submerged=0,tint=.8,stride=2){
    const p=panoramaAnchor(px,py,level),dims=source.fallen_log.dimensions;
    const worldWidth=Math.abs(p[2]-camera.position.z)*36/42*width/1079;
    const height=worldWidth/Math.hypot(dims[0]*Math.cos(yaw),dims[2]*Math.sin(yaw));
    model('fallen_log',p[0],p[2],height,yaw,stride,level-submerged,tint,1,level);
  }
  layer('panoramaFallen',()=>{
    log(827,108,155,.45,0,.6,.78);
    log(971,276,205,-.24,0,2.6,.72);
    log(578,226,165,-.05,0,1.3,.63,1);
    log(439,309,184,-.9,0,.7,.92);
    log(1027,193,81,.23,0,1.6,.67);
    log(1018,233,84,-.55,0,2.9,.65);
    log(894,209,92,.55,0,.9,.65,3);
    log(903,245,158,-.28,0,4.4,.64,3);
  });
  layer('submergedTrunks',()=>{
    // Full modeled chunks continue below the surface, with the same blue paint.
    log(693,267,152,.80,0,7.2,.78,2);
    log(861,271,177,-.38,0,9.1,.75,3);
    log(1044,261,191,.28,0,7.5,.73,3);
    log(901,189,131,1.15,0,6.4,.68,3);
    log(590,276,114,-.6,0,3.8,.72,3);
  });
  layer('upstreamBackground',()=>{
    for(let row=0;row<3;row++)for(let col=0;col<12;col++){
      const x=-141+col*11+(row%2)*5,z=62+row*24+Math.sin(col*3.3)*8;
      if(x>-118&&x<-12&&z<115)continue; // Preserve the opening's original clear camera aisle.
      const ground=terrainHeight?Math.max(.2,terrainHeight(x,z)):(x<-80?.2:12.6);
      model('ancient_column',x,z,57+Math.sin(col*2+row)*10,col*1.13,12+row*4,ground,.52-row*.035,.20+((col*7)%5)*.035,x<-80?0:12.6);
    }
  });
  return anchors;
}
