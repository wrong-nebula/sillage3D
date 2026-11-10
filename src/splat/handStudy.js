import {Box3, Color, MathUtils, Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimatedGLBSplats} from './AnimatedGLBSplats.js';
import {poseHand} from './handPose.js';
import {THERMAL_PALETTE as PALETTE} from './thermalMotion.js';
import {buildThermalSkeleton} from './thermalSkeleton.js';

const SAMPLE_COUNT = 22000;
const MODEL_URL = `${import.meta.env?.BASE_URL ?? '/'}hand-study/hand.glb`;
const STROKE_DIRECTION = new Vector3(.78, .62, .12).normalize();
const GROUND = '#100b1c';
const GROUND_PIGMENT = new Color(GROUND).convertLinearToSRGB().toArray();
const ORB_RIM = [1, .78, .27];
const SCUMBLE_LIMIT = 480;
const FRINGE_LIMIT = 520;
const ORB_SAMPLES = 2100;
// Nail plate centers and half widths in the unposed sculpt, in millimeters.
const NAILS = [
  [-69, -97, 3.5, 4.8, .14],
  [-31, -124, 4.1, 5.3, 0],
  [-.5, -135, 4.7, 5.8, -.04],
  [34, -120, 4.5, 5.4, -.16],
  [66, -43, 4.8, 6.0, -.68],
].map(([x, y, width, length, tilt]) => ({x, y, width, length, sin: Math.sin(tilt), cos: Math.cos(tilt)}));
const KNUCKLES = [[-62, -77], [-33, -94], [-3, -100], [27, -91], [53, -28]];
let splats, skeleton;

function anatomicalPaint(point, normalZ) {
  const {x, y} = point;
  const dorsal = MathUtils.smoothstep(normalZ, .25, .73);
  let nail = 0, cuticle = 0, tendon = 0, crease = 0;
  if (dorsal > 0) {
    for (const plate of NAILS) {
      const dx = x - plate.x, dy = y - plate.y;
      const side = (dx * plate.cos - dy * plate.sin) / plate.width;
      const along = (dx * plate.sin + dy * plate.cos) / plate.length;
      const edge = (side ** 4 + along ** 4) ** .25;
      const fill = 1 - MathUtils.smoothstep(edge, .72, 1.09);
      nail = Math.max(nail, fill * dorsal);
      const rim = MathUtils.smoothstep(edge, .76, .97) * (1 - MathUtils.smoothstep(edge, .98, 1.28));
      cuticle = Math.max(cuticle, rim * dorsal * MathUtils.smoothstep(along, -.35, .5));
    }
    // Follow the fan of the extensor tendons from the wrist to the knuckles.
    const palm = MathUtils.smoothstep(y, -59, -43) * (1 - MathUtils.smoothstep(y, 12, 40));
    if (palm > 0) {
      const reach = MathUtils.smoothstep(y, -51, 33);
      for (const knuckle of [-41, -25, -7, 12]) {
        const ridge = MathUtils.lerp(knuckle, knuckle * .42 - 9, reach);
        const distance = (x - ridge) / 2.8;
        tendon += Math.exp(-(distance ** 2)) - .58 * Math.exp(-((distance - 1.45) ** 2));
      }
      tendon *= palm * dorsal;
    }
    for (const [jointX, jointY] of KNUCKLES) {
      const across = (x - jointX) / 8;
      const along = y - jointY;
      const taper = Math.exp(-(across ** 2));
      const fold = along - across * across * 1.6;
      crease = Math.max(crease, taper * Math.exp(-((fold / 1.9) ** 2)) * dorsal);
    }
  }
  return {nail, cuticle, tendon, crease};
}

function pigmentHash(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function paintNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = MathUtils.smoothstep(x - ix, 0, 1), fy = MathUtils.smoothstep(y - iy, 0, 1);
  return MathUtils.lerp(
    MathUtils.lerp(pigmentHash(ix, iy), pigmentHash(ix + 1, iy), fx),
    MathUtils.lerp(pigmentHash(ix, iy + 1), pigmentHash(ix + 1, iy + 1), fx), fy,
  ) - .5;
}

function loadedBrush(along, across, drag) {
  const column = Math.floor(along), row = Math.floor(across);
  let pigment = 0;
  // Jittered, overlapping flat-brush passes group the small splats into
  // longer marks, with a narrow broken rim where each pass runs out of paint.
  for (let y = row - 1; y <= row + 1; y++) {
    for (let x = column - 1; x <= column + 1; x++) {
      const pressure = pigmentHash(x + 14, y - 9);
      const u = (along - x - .15 - .7 * pigmentHash(x, y)) / (.48 + .45 * pressure);
      const v = (across - y - .2 - .6 * pigmentHash(y, x + 7) - u * (pressure - .5) * .32) / (.30 + .22 * pressure);
      const edge = (u ** 4 + v ** 4) ** .25 + drag * .24;
      const body = 1 - MathUtils.smoothstep(edge, .59, 1.12);
      const rim = MathUtils.smoothstep(edge, .66, .90) * (1 - MathUtils.smoothstep(edge, .91, 1.16));
      pigment += (pressure - .49) * body - rim * .057;
    }
  }
  return MathUtils.clamp(pigment, -.55, .55);
}

function apparentHeat({x, y}, facing, anatomy) {
  // Illustrative heat in rest coordinates, so it stays on the surface through
  // the finger bends and when the viewer orbits the hand.
  const core = Math.exp(-(((x + 13) / 48) ** 2 + ((y + 16) / 64) ** 2));
  const thenar = Math.exp(-(((x - 19) / 24) ** 2 + ((y + 3) / 43) ** 2));
  const fingers = MathUtils.smoothstep(-y, 53, 140);
  const thumb = MathUtils.smoothstep(x, 40, 72);
  const wrist = MathUtils.smoothstep(y, 35, 138);
  return .44 + .36 * core + .083 * thenar + .105 * facing
    - .205 * fingers - .135 * thumb - .18 * wrist
    + .034 * anatomy.tendon - .026 * anatomy.nail;
}

function makePalmOrb(center) {
  const radius = .39;
  const spread = Math.sqrt(4 * Math.PI / ORB_SAMPLES) * radius * .83;
  const normal = new Vector3(), tangent = new Vector3(), across = new Vector3();
  const up = new Vector3(0, 1, 0);
  const whiteGold = [1, 1, .85];
  return Array.from({length: ORB_SAMPLES}, (_, i) => {
    const y = 1 - 2 * (i + .5) / ORB_SAMPLES;
    const ring = Math.sqrt(1 - y * y), angle = i * 2.39996323;
    normal.set(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
    tangent.crossVectors(up, normal).normalize();
    across.crossVectors(normal, tangent);
    return {
      center: center.clone().addScaledVector(normal, radius).toArray(),
      axes: [tangent.multiplyScalar(spread).toArray(), across.multiplyScalar(spread).toArray(), normal.clone().multiplyScalar(spread * .5).toArray()],
      color: whiteGold.slice(),
      opacity: 1, seed: i / ORB_SAMPLES, material: 'orb', softParticle: true,
    };
  });
}

async function prepareHand(fetcher = globalThis.fetch) {
  if (splats) return;
  const response = await fetcher(MODEL_URL);
  if (!response.ok) throw new Error('Could not load the hand model.');
  const model = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
  const restGeometry = new Map();
  model.scene.traverse(mesh => {
    if (!mesh.isMesh || restGeometry.has(mesh.geometry)) return;
    const {position, normal} = mesh.geometry.attributes;
    restGeometry.set(mesh.geometry, {position: position.clone(), normal: normal.clone()});
    poseHand(mesh.geometry);
  });
  const hand = new AnimatedGLBSplats(model, {count: SAMPLE_COUNT, span: 3.8, seed: 917});
  try {
    // Present the palm so the orb sits above the hand's curled fingers.
    hand.root.rotation.set(.15, Math.PI - .24, 2.25, 'ZYX');
    hand.root.updateMatrixWorld(true);
    const center = new Box3().setFromObject(hand.root, true).getCenter(new Vector3());
    hand.root.position.sub(center);
    hand.update();

    const orbCenter = hand.source.localToWorld(new Vector3(-.012, -.022, -.062));
    const toOrb = new Vector3();
    skeleton = buildThermalSkeleton(hand.source, restGeometry);
    const localPoint = new Vector3(), sourcePoint = new Vector3();
    const normal = new Vector3(), vertexNormal = new Vector3();
    const tangent = new Vector3(), across = new Vector3();
    const scumble = [], fringe = [];
    for (let i = 0; i < hand.splats.length; i++) {
      const splat = hand.splats[i];
      const {triangle, weights, radius} = hand.samples[i];
      const mesh = triangle.entry.mesh;
      const normals = mesh.geometry.attributes.normal;
      const rest = restGeometry.get(mesh.geometry);
      normal.set(0, 0, 0);
      sourcePoint.set(0, 0, 0);
      let sourceNormalZ = 0;
      triangle.ids.forEach((id, j) => {
        vertexNormal.fromBufferAttribute(normals, id);
        normal.addScaledVector(vertexNormal, weights[j]);
        vertexNormal.fromBufferAttribute(rest.position, id);
        sourcePoint.addScaledVector(vertexNormal, weights[j] * 1000);
        sourceNormalZ += rest.normal.getZ(id) * weights[j];
      });
      normal.transformDirection(mesh.matrixWorld);
      const anatomy = anatomicalPaint(sourcePoint, sourceNormalZ);

      const [x, y, z] = splat.center;
      const along = x * STROKE_DIRECTION.x + y * STROKE_DIRECTION.y;
      const cross = y * STROKE_DIRECTION.x - x * STROKE_DIRECTION.y + z * .32;
      const block = paintNoise(along * 2.7 + z * 2.2, cross * 6.5);
      const dragged = paintNoise(along * 5.6 - z * 3, cross * 28 + block);
      const loaded = loadedBrush(along * 3.6 + z * 2, cross * 10.6 + block, dragged);

      const facing = MathUtils.smoothstep(Math.abs(normal.z), .12, .92);
      const modelY = sourcePoint.y / 1000;
      const forearm = MathUtils.smoothstep(modelY + block * .014, .046, .145);
      const lowerHand = (1 - MathUtils.smoothstep(cross, -.82, -.39)) *
        (1 - MathUtils.smoothstep(along, .40, 1.08));
      const rough = Math.max(MathUtils.smoothstep(modelY, .025, .109), lowerHand);
      const grazing = 1 - MathUtils.smoothstep(Math.abs(normal.z), .16, .68);
      const fray = rough * grazing;
      const dryStroke = splat.seed > .86;
      const heat = MathUtils.clamp(
        apparentHeat(sourcePoint, facing, anatomy) + block * .055 + loaded * .052 + dragged * .025,
        0, .999,
      );

      // Loaded strokes follow the tendons; occasional cross strokes catch
      // the light on the joint planes.
      tangent.copy(STROKE_DIRECTION);
      tangent.y += block * .65 + loaded * .37 + (splat.seed - .5) * .22;
      if (dryStroke && dragged > .12) tangent.set(.36, .88, .22);
      tangent.addScaledVector(normal, -normal.dot(tangent));
      if (tangent.lengthSq() < .001) {
        tangent.fromArray(splat.axes[0]);
        tangent.addScaledVector(normal, -normal.dot(tangent));
      }
      tangent.normalize();
      across.crossVectors(normal, tangent);
      const length = dryStroke ? MathUtils.lerp(1.35, 2.85, Math.abs(normal.z)) : 1.52 + .77 * splat.seed;
      const tip = 1 - MathUtils.smoothstep(sourcePoint.y, -141, -111);
      const contour = MathUtils.smoothstep(Math.abs(normal.z), .15, .7);
      const detail = 1 - .35 * Math.max(anatomy.nail, anatomy.cuticle, anatomy.crease);
      const edgeLength = 1 - .22 * tip * (1 - contour) + rough * (.14 + .45 * splat.seed);
      tangent.multiplyScalar(radius * length * detail * edgeLength).toArray(splat.axes[0]);
      across.multiplyScalar(radius * (dryStroke ? .64 : .89) * detail * (1 + fray * .30)).toArray(splat.axes[1]);
      vertexNormal.copy(normal).multiplyScalar(radius * .17).toArray(splat.axes[2]);

      const value = heat * (PALETTE.length - 1);
      const band = Math.floor(value);
      const blend = MathUtils.smoothstep(value - band, .10, .92);
      splat.color = PALETTE[band].map((channel, j) => MathUtils.lerp(channel, PALETTE[band + 1][j], blend));
      const foldShade = 1 - anatomy.cuticle * .065 - anatomy.crease * .065;
      splat.color = splat.color.map(channel => MathUtils.clamp(channel * foldShade, 0, 1));
      if (dryStroke) {
        const load = 1 + .12 * dragged + .07 * block;
        splat.color = splat.color.map(channel => MathUtils.clamp(channel * load, 0, 1));
        splat.opacity *= .81;
      }
      // Use the orb's position to light the inner edges of the digits. Both
      // distance and the fingertip gradient limit how far the gold reaches.
      toOrb.copy(orbCenter).sub(localPoint.fromArray(splat.center));
      const distance = toOrb.length();
      const incidence = MathUtils.smoothstep(normal.dot(toOrb.normalize()), .05, .72);
      const finger = MathUtils.smoothstep(-sourcePoint.y, 27, 65)
        * (1 - MathUtils.smoothstep(-sourcePoint.y, 64, 135));
      const thumb = MathUtils.smoothstep(sourcePoint.x, 27, 51)
        * (1 - MathUtils.smoothstep(sourcePoint.x, 49, 75));
      const rim = .86 * incidence * Math.max(finger, thumb) * (.31 + .69 * grazing)
        * (1 - MathUtils.smoothstep(distance, .43, 1.58));
      splat.color = splat.color.map((channel, j) => MathUtils.lerp(channel, ORB_RIM[j], rim));
      const lostEdge = MathUtils.smoothstep(modelY + dragged * .019, .088, .14);
      splat.color = splat.color.map((channel, j) => MathUtils.lerp(channel, GROUND_PIGMENT[j], lostEdge * .98));
      splat.opacity *= (1 - .92 * lostEdge) * (1 - fray * (.28 + .42 * splat.seed));
      const travel = Math.hypot((sourcePoint.x + 12) * .76, sourcePoint.y + 18) / 100;
      const motion = (1 - lostEdge) * (.79 + .21 * facing) * (1 - rim * .52);
      splat.thermal = [heat, travel, motion];
      splat.material = 'skin';
      // Loose, translucent marks break up the forearm and lower silhouette.
      if (fray > .25 && splat.seed > .73 && lostEdge < .86 && fringe.length < FRINGE_LIMIT) {
        fringe.push({
          center: localPoint.fromArray(splat.center).addScaledVector(normal, radius * (.8 + splat.seed * 1.7) * fray).toArray(),
          axes: [
            tangent.clone().setLength(radius * (2.2 + splat.seed * 2.1)).toArray(),
            across.clone().setLength(radius * (.7 + fray * .48)).toArray(),
            splat.axes[2],
          ],
          color: splat.color.map((channel, j) => MathUtils.lerp(channel, GROUND_PIGMENT[j], .32 + splat.seed * .24)),
          opacity: fray * (1 - lostEdge) * (.12 + Math.abs(dragged) * .21),
          seed: splat.seed,
          material: 'skin',
          thermal: [heat, travel, motion * .48],
        });
      }
      if (splat.seed > .948 && heat > .59 && lostEdge < .35 && scumble.length < SCUMBLE_LIMIT) {
        const pressure = (.13 + Math.abs(dragged) * .12) * (1 - forearm * .62);
        scumble.push({
          center: localPoint.fromArray(splat.center).addScaledVector(normal, .006).toArray(),
          axes: [
            tangent.setLength(radius * (2.6 + 1.8 * Math.abs(loaded)) * detail).toArray(),
            across.setLength(radius * (.49 + .27 * Math.abs(dragged))).toArray(),
            splat.axes[2],
          ],
          color: splat.color.map(channel => MathUtils.clamp(channel * 1.04, 0, 1)),
          opacity: pressure,
          seed: splat.seed,
          material: 'skin',
          thermal: [heat, travel, motion],
        });
      }
    }
    splats = [...hand.splats, ...scumble, ...fringe, ...makePalmOrb(orbCenter)];
  } finally {
    hand.dispose();
  }
}

export const handStudyScene = {
  id: 'hand-study',
  label: 'Hand study',
  title: 'Study of a hand',
  description: 'Slow waves of false-color heat move through a hand holding a luminous yellow sphere.',
  caption: 'Thermal palette',
  camera: {position: [.70, .39, 7.2], target: [.39, .285, 0], fov: 23.1, focalLength: 55},
  splatBudget: SAMPLE_COUNT + SCUMBLE_LIMIT + FRINGE_LIMIT + ORB_SAMPLES,
  styleOnVisit: true,
  lockStyle: true,
  initialStyle: {
    quality: 'studio', mode: 'ghibli', brushScale: 1.12, coverage: 1.12, softness: .32,
    gouacheTexture: .16, gouacheBlend: .39, gouacheTone: .04,
    indirect: false, tintedShadows: false, sun: false, foregroundDOF: false,
    lensDirt: true, lensDirtStrength: .5, lensDirtScale: 1.5, lensFlare: false, painterlyVignette: false,
  },
  prepare: prepareHand,
  create: () => ({
    splats,
    background: GROUND,
    canvasOnSubject: true,
    thermalMotion: true,
    thermalSkeleton: skeleton,
    emission: {start: splats.length - ORB_SAMPLES},
    orbitLimit: 18,
    lighting: {irradiance: new Float32Array(splats.length * 3), shadow: new Float32Array(splats.length), stats: {}},
  }),
};
