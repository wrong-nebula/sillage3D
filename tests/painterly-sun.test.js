import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PainterlySun,solarDirection,solarRadius,SOLAR_DIAMETER_DEGREES,SUN_DEFAULTS,SUN_SPLAT_SUPPORT} from '../src/splat/PainterlySun.js';

const close=(a,b,tolerance=1e-10)=>assert.ok(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(a),Math.abs(b)),`${a} ≠ ${b}`);
const closeVector=(a,b)=>a.forEach((v,i)=>close(v,b[i]));
function camera(){const result=new THREE.PerspectiveCamera(42,16/9,.1,600);result.updateMatrixWorld(true);return result;}

// The Gaussian cluster's fifty-percent contour retains the mean terrestrial
// solar angular diameter when its size is one.
test('size one represents a .533 degree solar diameter, independent of distance',()=>{
  assert.equal(SOLAR_DIAMETER_DEGREES,.533);
  for(const distance of [1,40,480,10000]){
    const radius=solarRadius(distance,1);
    close(2*Math.atan(radius/distance)*180/Math.PI,.533);
    close(solarRadius(distance*3,1),radius*3);
    close(2*Math.atan(solarRadius(distance,2)/distance)*180/Math.PI,1.066);
  }
});

test('solar heading convention and elevation produce a normalized direction',()=>{
  closeVector(solarDirection(0,0),[0,0,-1]);
  closeVector(solarDirection(90,0),[1,0,0]);
  closeVector(solarDirection(-90,0),[-1,0,0]);
  closeVector(solarDirection(0,90),[0,1,0]);
  for(const a of [-180,-35,0,120,360])for(const e of [-60,0,16,80])close(Math.hypot(...solarDirection(a,e)),1);
});

test('camera translation causes no solar parallax and preserves apparent size',()=>{
  const sun=new PainterlySun(),view=camera(),options={...SUN_DEFAULTS,sunAzimuth:10,sunElevation:8};
  try{
    view.position.set(3,2,8);view.rotation.set(.08,.12,.01);view.updateMatrixWorld(true);
    sun.update(view,options);sun.mesh.updateMatrixWorld(true);
    const beforeCenter=sun.mesh.position.clone().project(view);
    const beforeEdge=sun.mesh.localToWorld(new THREE.Vector3(1/SUN_SPLAT_SUPPORT,0,0)).project(view);
    const offset=sun.mesh.position.clone().sub(view.position);
    view.position.add(new THREE.Vector3(120,-30,60));view.updateMatrixWorld(true);
    sun.update(view,options);sun.mesh.updateMatrixWorld(true);
    closeVector(sun.mesh.position.clone().sub(view.position).toArray(),offset.toArray());
    closeVector(sun.mesh.position.clone().project(view).toArray(),beforeCenter.toArray());
    closeVector(sun.mesh.localToWorld(new THREE.Vector3(1/SUN_SPLAT_SUPPORT,0,0)).project(view).toArray(),beforeEdge.toArray());
  }finally{sun.dispose();}
});

test('Gaussian core projection matches the physical angular radius as far clip changes',()=>{
  const sun=new PainterlySun(),view=camera(),options={...SUN_DEFAULTS,sunAzimuth:0,sunElevation:0,sunSize:1};
  try{
    for(const far of [100,600,2000]){
      view.far=far;view.updateProjectionMatrix();view.updateMatrixWorld(true);
      sun.update(view,options);sun.mesh.updateMatrixWorld(true);
      const center=sun.mesh.position.clone().project(view);
      // One nominal solar radius is one support fraction of the quad half-width.
      const edge=sun.mesh.localToWorld(new THREE.Vector3(1/SUN_SPLAT_SUPPORT,0,0)).project(view);
      close(center.x,0);close(center.y,0);
      close(edge.x-center.x,Math.tan(.533*Math.PI/360)/Math.tan(view.fov*Math.PI/360)/view.aspect);
      assert.ok(center.z>-1&&center.z<1,'sun must remain inside the camera clipping volume');
    }
  }finally{sun.dispose();}
});

test('sun remains a color-only mesh with stable resources and explicit visibility',()=>{
  const sun=new PainterlySun(),view=camera(),geometry=sun.geometry,material=sun.material;
  try{
    const options={...SUN_DEFAULTS};
    sun.update(view,options);
    assert.equal(sun.mesh.isMesh,true);assert.equal(sun.mesh.isLight,undefined);
    assert.equal(sun.mesh.castShadow,false);assert.equal(sun.mesh.receiveShadow,false);
    assert.equal(material.depthTest,false);assert.equal(material.depthWrite,false);assert.equal(material.toneMapped,false);
    assert.equal(sun.mesh.visible,true);
    sun.update(view,{...options,sunIntensity:.25,sunAzimuth:80,sunSize:3});
    assert.equal(material.uniforms.brightness.value,.25);
    assert.equal(sun.geometry,geometry);assert.equal(sun.material,material);
    sun.update(view,{...options,sun:false});assert.equal(sun.mesh.visible,false);
    sun.update(view,{...options,sunIntensity:0});assert.equal(sun.mesh.visible,false);
    assert.deepEqual(options,SUN_DEFAULTS,'updates must not mutate controls or lighting defaults');
  }finally{sun.dispose();}
});

test('inverse-alpha solar mask survives clear, sun blend and translucent occlusion',()=>{
  const sun=new PainterlySun();
  try{
    assert.equal(sun.material.blending,THREE.CustomBlending);
    assert.equal(sun.material.blendEquationAlpha,THREE.AddEquation);
    assert.equal(sun.material.blendSrcAlpha,THREE.ZeroFactor);
    assert.equal(sun.material.blendDstAlpha,THREE.OneMinusSrcAlphaFactor);
    for(const coverage of [0,.15,.8,1])for(const occluders of [[],[0],[.2],[1],[.3,.4,.9]]){
      let destinationAlpha=1;
      // Sun's configured Zero / OneMinusSrcAlpha alpha factors.
      destinationAlpha=coverage*0+destinationAlpha*(1-coverage);
      for(const opacity of occluders)destinationAlpha=opacity+destinationAlpha*(1-opacity);
      const expectedVisibleSun=coverage*occluders.reduce((transmission,a)=>transmission*(1-a),1);
      close(1-destinationAlpha,expectedVisibleSun);
      assert.ok(destinationAlpha>=0&&destinationAlpha<=1);
    }
  }finally{sun.dispose();}
});


test('seven isotropic kernels form a circular solar core without peripheral lobes',()=>{
  const sun=new PainterlySun();
  try{
    const kernels=sun.material.uniforms.splatKernels.value;
    assert.equal(kernels.length,7);
    close(kernels[0].x,0);close(kernels[0].y,0);
    for(const kernel of kernels.slice(1)){
      close(Math.hypot(kernel.x,kernel.y),.3);
      // Each kernel has a single scalar sigma: no elongated covariance axis.
      close(kernel.z,.48);assert.ok(kernel.w>0);
    }
    const coverage=(x,y)=>{
      const density=kernels.reduce((sum,kernel)=>sum+kernel.w*Math.exp(-.5*((x-kernel.x)**2+(y-kernel.y)**2)/(kernel.z*kernel.z)),0);
      const r=Math.hypot(x,y),t=Math.min(1,Math.max(0,(r-1.75)/.25));
      return (1-Math.exp(-density*sun.material.uniforms.densityScale.value))*(1-t*t*(3-2*t));
    };
    assert.ok(coverage(0,0)>.98,'the overlapping center should form a coherent warm-white disc');
    for(let i=0;i<72;i++){
      const angle=i*Math.PI/36,c=Math.cos(angle),s=Math.sin(angle);
      assert.ok(Math.abs(coverage(c,s)-.5)<.001,'nominal edge must remain circular, not petal-shaped');
      assert.ok(coverage(c*.5,s*.5)>coverage(c,s));
      assert.ok(coverage(c,s)>coverage(c*1.5,s*1.5));
      close(coverage(c*SUN_SPLAT_SUPPORT,s*SUN_SPLAT_SUPPORT),0);
    }
  }finally{sun.dispose();}
});
