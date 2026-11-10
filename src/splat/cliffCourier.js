import {MathUtils, Quaternion, Raycaster, Vector2, Vector3} from 'three';
import {createCliffBirds} from './cliffBirds.js';
import {loadTenguCourier} from './tenguCourier.js';
import {collideCliffRocks} from './cliffRockCollision.js';
import {SeasonalAmbience} from './SeasonalAmbience.js';
import {SnowFootprints} from './SnowFootprints.js';
import {SnowShedding} from './SnowShedding.js';
import {CliffPhysics, CLIFF_PHYSICS_KEYS} from './CliffPhysics.js';
import {PhysicsLabMouse} from './PhysicsLabMouse.js';

// Intersect the actual terrain, rather than a flat plane, to place the entrance
// in the lower-left of whichever camera framing is active when the actor loads.
function screenGround(camera, height, x, y) {
  const raycaster = new Raycaster(), point = new Vector3();
  raycaster.setFromCamera(new Vector2(x, y), camera);
  let near = 0;
  for (let far = 1; far <= 220; far += .5) {
    raycaster.ray.at(far, point);
    if (point.y > height(point.x, point.z)) { near = far; continue; }
    for (let i = 0; i < 18; i++) {
      const middle = (near + far) / 2;
      raycaster.ray.at(middle, point);
      if (point.y > height(point.x, point.z)) near = middle;
      else far = middle;
    }
    raycaster.ray.at((near + far) / 2, point);
    return point;
  }
  return new Vector3(-15, height(-15, 35), 35);
}

export async function loadCliffCourier(height, rocks = [], physicsOptions = {}) {
  const birds = createCliffBirds(height);
  let engine, physics, elapsed = 0, start, destination, duration = 4;
  const projected = new Vector3();
  const ground = (x, z) => (physics?.materials?physics.height(x,z):height(x, z)) + .04 +
    (!physics?.materials&&engine?.cliffSeasons ? .075 * engine.cliffSeasons.state.y * (1 - engine.cliffSeasons.state.z) : 0);
  let crow;
  try {
    crow = await loadTenguCourier({count: 14000, height: 2.95, shadowCount: 240, groundHeight: ground,
      constrain(controller, previous) {
        if (elapsed < duration) return;
        collideCliffRocks(controller, previous, rocks, ground);
        const p = controller.position;
        projected.set(p.x, ground(p.x, p.z) + p.y + 1.8, p.z).project(engine.camera);
        const outside = Math.max(Math.abs(projected.x) - .94, Math.abs(projected.y) - .9, 0);
        projected.set(previous.x, ground(previous.x, previous.z) + previous.y + 1.8, previous.z).project(engine.camera);
        const wasOutside = Math.max(Math.abs(projected.x) - .94, Math.abs(projected.y) - .9, 0);
        const leavingFrame = outside > 0 && outside >= wasOutside;
        projected.set(p.x, ground(p.x, p.z) + p.y + 1.8, p.z).project(engine.camera);
        const slope = Math.hypot(ground(p.x + .4, p.z) - ground(p.x - .4, p.z),
          ground(p.x, p.z + .4) - ground(p.x, p.z - .4)) / .8;
        if (leavingFrame ||
          Math.abs(projected.z) > 1 || Math.hypot(p.x / 65, (p.z - 17) / 60) > .92 ||
          (controller.grounded && slope > 1.15)) {
          p.x = previous.x; p.z = previous.z;
          controller.velocity.x = controller.velocity.z = 0;
        }
      },
    });
  } catch (error) { birds.dispose(); throw error; }
  if(physicsOptions.desert)for(const mark of crow.shadow.splats)mark.color.splice(0,3,.29,.24,.19);
  physics = new CliffPhysics(height, rocks, physicsOptions);
  crow.footPlant.groundHeight = ground;
  const winterWeight = () => MathUtils.smoothstep(engine?.cliffSeasons?.state.x ?? 0, .28, .88);
  const motionStep = crow.motionLayer.step.bind(crow.motionLayer);
  let winterBank = 0, winterPitch = 0;
  crow.motionLayer.step = dt => {
    crow.motionLayer.bank -= winterBank; crow.motionLayer.pitch -= winterPitch;
    motionStep(dt);
    winterBank = winterPitch = 0;
    const cold = winterWeight(), c = crow.controller;
    const phase = crow.action.time / crow.action.getClip().duration * Math.PI * 2;
    if (c.flying) {
      winterBank = cold * (.045 * Math.sin(elapsed * 7.3) + .023 * Math.sin(elapsed * 13.1));
      winterPitch = cold * .024 * Math.sin(elapsed * 8.7);
    } else if (c.grounded && Math.hypot(c.velocity.x, c.velocity.z) > .1) {
      winterPitch = cold * .13;
      winterBank = cold * .035 * Math.sin(phase);
    }
    crow.motionLayer.bank += winterBank; crow.motionLayer.pitch += winterPitch;
  };
  const update = crow.update, beforePose = crow.onBeforePose, onPose = crow.onPose;
  const snowPose = new Map(), axis = new Vector3(1, 0, 0), rotation = new Quaternion();
  crow.onBeforePose = () => {
    for (const [bone, orientation] of snowPose) bone.quaternion.copy(orientation);
    snowPose.clear(); beforePose();
  };
  crow.onPose = dt => {
    onPose(dt);
    const cold = winterWeight(), c = crow.controller;
    if (!c.grounded || Math.hypot(c.velocity.x, c.velocity.z) < .1 || cold === 0) return;
    // Lift the free leg over the snow while leaving the planted foot anchored.
    const phase = crow.action.time / crow.action.getClip().duration;
    for (const [i, leg] of crow.footPlant.legs.entries()) {
      if (!leg.hip) continue;
      const lift = Math.max(0, Math.sin((phase + i * .5) * Math.PI * 2));
      snowPose.set(leg.hip, leg.hip.quaternion.clone());
      leg.hip.quaternion.multiply(rotation.setFromAxisAngle(axis, -.24 * cold * lift * (1 - leg.weight)));
    }
  };
  crow.update = dt => {
    if (crow.controller.grounded && crow.controller.motion === 'Walk') {
      const phase = crow.action.time / crow.action.getClip().duration * Math.PI * 4;
      crow.action.setEffectiveTimeScale(crow.action.getEffectiveTimeScale() *
        MathUtils.lerp(1, .82 + .25 * Math.sin(phase) ** 2, winterWeight()));
    }
    update(dt);
  };
  const footprints = new SnowFootprints(physics.materials?physics.height:height,{materials:physics.materials,onStamp:physics.sand?(x,z,yaw)=>physics.sand.atlas.stamp(x,z,yaw,.17,.28,'foot',1,true):null});
  const snowShedding = new SnowShedding(crow, height, {wind: physics.wind});
  const splats = [...birds.splats, ...crow.splats, ...footprints.splats, ...snowShedding.splats, ...physics.splats];
  const seasonalSnow = new Uint8Array(splats.length * 4);
  for (let i = 0; i < splats.length; i++) seasonalSnow[i * 4 + 3] = 96;
  for (let i = birds.splats.length + crow.splats.length; i < splats.length; i++) seasonalSnow[i * 4 + 3] = 144;
  const sheddingStart = birds.splats.length + crow.splats.length + footprints.splats.length;
  for (let i = sheddingStart; i < sheddingStart + snowShedding.splats.length; i++) seasonalSnow[i * 4 + 3] = 136;
  // Physical particles already carry their seasonal visibility. Avoid the
  // footprint shader's snow gate on fire, dust and prefractured rigid clusters.
  for (let i = sheddingStart + snowShedding.splats.length; i < splats.length; i++) seasonalSnow[i * 4 + 3] = 96;
  for(let i=0;i<splats.length;i++){if(splats[i].material==='lab-water')seasonalSnow[i*4+3]=104;else if(physics.surfaceSnow&&splats[i].material==='cloth')seasonalSnow[i*4+3]=132;}
  // Keep the eyes and ground shadow clean. Stable surface samples carry snow
  // on the upper body; the shader follows their animated surface normals.
  for (let i = 0; i < crow.samples.length; i++) {
    const offset = (birds.splats.length + i) * 4;
    seasonalSnow[offset] = Math.round(255 * MathUtils.smoothstep(crow.splats[i].center[1], 1.1, 1.9));
    seasonalSnow[offset + 3] = 120;
  }
  const advanceCrow = crow.advance;
  const ambience = new SeasonalAmbience();
  const actor = {
    splats, seasonalSnow, doves: birds.doves, crow, rocks, root: crow.root, audio: crow.audio, ambience, footprints, snowShedding, physics,
    autoplay: true,
    get time() { return elapsed; },
    get entranceComplete() { return elapsed >= duration; },
    get activity() { return elapsed < duration ? 'Crow arriving' : 'WASD to walk · Shift to run · Space to jump'; },
    // Input is handed over only after the authored walk has finished.
    controller: {
      setKey(code, down) {
        if (elapsed < duration) return false;
        if (CLIFF_PHYSICS_KEYS.has(code)) {
          if (down) {
            if (code === 'KeyN') engine?.cliffSeasons?.seek(physics.snow > .2 ? 0 : .47);
            else physics.command(code, crow.controller);
          }
          return true;
        }
        return crow.controller.setKey(code, down);
      },
      clearKeys() { crow.controller.clearKeys(); },
      snapshot() { return {...crow.controller.snapshot(), entranceComplete: elapsed >= duration}; },
    },
    attachEngine(value) {
      engine = value; crow.attachEngine(engine);
      physics.onNativeChange=rock=>{
        const seasonal=engine.cliffSeasons?.texture;
        for(const chunk of rock.chunks)for(const r of chunk.records){engine.activeSplats[r.index]=r.splat;if(seasonal)seasonal.image.data[r.index*4+3]=96;}
        if(seasonal)seasonal.needsUpdate=true;
        physics.motionBlur?.bindAuthored(rock);
        engine.depthCache=null;engine.visibilityKey=null;engine.nativeMovingCache=null;
      };
      start = screenGround(engine.camera, ground, -1.55, -.94);
      destination = screenGround(engine.camera, ground, -.66, -.70);
      duration = Math.max(2, Math.hypot(destination.x - start.x, destination.z - start.z) / 2);
      if(physicsOptions.playerStart){start=new Vector3(...physicsOptions.playerStart);destination=start;duration=0;}
      Object.assign(crow.controller.position, {x: start.x, y: 0, z: start.z});
      crow.controller.yaw = Math.atan2(destination.x - start.x, destination.z - start.z);
      if(physicsOptions.playerStart)crow.controller.yaw=Math.PI;
      this.advance(0);
      physics.motionBlur?.attach(engine,physics.clusters,physicsOptions.environmentSplats.length+sheddingStart+snowShedding.splats.length);
      physics.surfaceSnow?.attach(engine);
      if(physics.water)physics.motionBlur?.bindRange(physicsOptions.environmentSplats.length+splats.length-physics.water.splats.length+physics.water.surfaceCount,physics.water.splats.length-physics.water.surfaceCount,physics.water.float);
      if(physicsOptions.playerStart)physics.mouse=new PhysicsLabMouse(engine,physics,{onGrab:()=>crow.audio.unlock().catch(()=>{})});
      if(physics.flexibles)physics.onViewFlexible=()=>{physics.mouse?.cancel();const p=physics.flexibles.focus,scale=Math.max(1,1.45/engine.camera.aspect);engine.controls.target.copy(p);engine.camera.position.set(p.x+10*scale,p.y+6*scale,p.z+12*scale);engine.controls.update();engine.dirty=true;engine.onInvalidate?.();};
      if(physics.water)physics.onViewWater=()=>{
        physics.mouse?.cancel();const w=physics.water,center=new Vector3(w.x,w.level,w.z),offset=new Vector3(-8,7,10),edge=new Vector3();let scale=1;
        engine.applyLensAspect(engine.getViewportAspect());engine.controls.target.copy(center);
        // Fit the shoreline against the physical lens rather than assuming a
        // fixed vertical FOV; portrait viewports retain a different film gate.
        for(let iteration=0;iteration<5;iteration++){
          engine.camera.position.copy(center).addScaledVector(offset,scale);engine.controls.update();engine.camera.updateMatrixWorld(true);let fit=1;
          for(let i=0;i<24;i++){const a=i*Math.PI/12;edge.set(w.x+Math.cos(a)*w.rx*1.1,w.level,w.z+Math.sin(a)*w.rz*1.1).project(engine.camera);fit=Math.max(fit,Math.abs(edge.x)/.86,Math.abs(edge.y)/.76);}
          if(fit<=1.001)break;scale*=fit*1.02;
        }
        engine.dirty=true;engine.onInvalidate?.();
      };
    },
    advance(dt) {
      ambience.update(engine?.cliffSeasons?.position??0, elapsed);
      if (this.entrancePaused) { birds.advance(dt); return; }
      const wasEntering = elapsed < duration;
      const cold = winterWeight();
      const snow = engine?.cliffSeasons?.state;
      const cover = snow ? MathUtils.smoothstep(snow.y - snow.z, .04, .25) : 0;
      crow.audio.setFootstepSurface(cover > .85 ? 0 : .11 * (1 - cover), 380);
      elapsed += dt * (wasEntering ? MathUtils.lerp(1, .55, cold) : 1);
      crow.controller.speedScale = MathUtils.lerp(1, crow.controller.flying ? .78 : .55, cold)*(1-.4*(physics.water?.characterSubmersion??0));
      if(physics.materials&&!crow.controller.flying){const m=physics.materials.at(crow.controller.position.x,crow.controller.position.z,physics.materials.scratch);crow.controller.speedScale*=1-MathUtils.clamp(m.snow*.65+m.mud*m.wetness*.8,0,.6);}
      crow.controller.allowRunning = cold < .45;
      birds.advance(dt);
      if (wasEntering) {
        const t = MathUtils.clamp(elapsed / duration, 0, 1), c = crow.controller;
        c.clearKeys();
        c.position.x = MathUtils.lerp(start.x, destination.x, t);
        c.position.z = MathUtils.lerp(start.z, destination.z, t);
        const pace = MathUtils.lerp(1, .55, cold);
        c.velocity.x = (destination.x - start.x) / duration * pace;
        c.velocity.z = (destination.z - start.z) / duration * pace;
        c.setMotion(t < 1 ? 'Walk' : 'Idle');
        crow.root.position.set(c.position.x, 0, c.position.z);
        crow.motionLayer.step(dt);
        crow.root.rotation.set(crow.motionLayer.pitch, c.yaw, crow.motionLayer.bank, 'YXZ');
        crow.action.setEffectiveTimeScale(pace);
        crow.time += dt; crow.update(dt);
        crow.audio.update(dt, t < 1 ? 'Walk' : 'Idle', c,
          {time: crow.action.time, duration: crow.action.getClip().duration});
        if (t === 1) c.velocity.x = c.velocity.z = 0;
      } else advanceCrow(dt);
      physics.update(dt, crow.controller, snow ? Math.max(0, snow.y - snow.z) : 0);
      if(engine?.cliffSeasons)engine.cliffSeasons.uniforms.cliffPhysicsGust.value = physics.world.time < physics.wind.gustUntil ? 1 : 0;
      physics.materials?.footsteps(dt,crow);
      const groundSnow=physics.materials?physics.materials.snowDepth(crow.controller.position.x,crow.controller.position.z)*5:snow?Math.max(0,snow.y-snow.z):0;
      footprints.update(dt, crow, groundSnow);
      physics.sand?.update(dt,crow,groundSnow,physics.wind,physics.time);
      snowShedding.update(dt, crow, snow ? Math.max(0, snow.y - snow.z) : 0);
    },
    writePacked(data, centers, offset) {
      birds.writePacked(data, centers, offset);
      crow.writePacked(data, centers, offset + birds.splats.length);
      footprints.writePacked(data, centers, offset + birds.splats.length + crow.splats.length);
      snowShedding.writePacked(data, centers, offset + birds.splats.length + crow.splats.length + footprints.splats.length);
      physics.writePacked(data, centers, offset + sheddingStart + snowShedding.splats.length);
      physics.writeNativePacked(data,centers,engine?.textureUploads);
    },
    dispose() { physics.dispose(); ambience.dispose(); birds.dispose(); crow.dispose(); },
  };
  return actor;
}
