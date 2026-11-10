import {Matrix4, Vector3, Quaternion, MathUtils} from 'three';
import {portalCameraMatrix} from './escherGeometry.js';

export const RELATIVITY_TOUR_DURATION = 56;
const V = a => new Vector3(...a);
function pose(position, target, up = [0, 1, 0], fov = 40) {
  const p = V(position), q = new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(p, V(target), V(up)));
  return {position: p, quaternion: q, fov};
}
function transformPose(p, entry, exit) {
  const matrix = new Matrix4().compose(p.position, p.quaternion, new Vector3(1, 1, 1));
  const mapped = portalCameraMatrix(entry, exit, matrix);
  const position = new Vector3(), quaternion = new Quaternion(); mapped.decompose(position, quaternion, new Vector3());
  return {position, quaternion, fov: p.fov};
}
export function createRelativityTour(portals) {
  const a = portals[0].frame.matrixWorld, b = portals[1].frame.matrixWorld, c = portals[2].frame.matrixWorld;
  const opening = pose([0, 0, 38], [0, 0, 0], [0, 1, 0], 23.8);
  const entry = pose([-3.4, 3.5, 2.34], [-3.4, 3.5, 1.3]);
  const exit = transformPose(entry, a, b);
  const exitLook = new Vector3(0, 0, -1).applyQuaternion(exit.quaternion);
  const away = {position: exit.position.clone().addScaledVector(exitLook, 3.4), quaternion: exit.quaternion.clone(), fov: 43};
  const ceiling = pose([0, 5.75, 4.2], [0, 4.8, 1], [-1, 0, 0]);
  const ceilingEntry = pose([0, 4.82, 1.05], [0, 4.4, 0], [-1, 0, 0]);
  const ceilingExit = transformPose(ceilingEntry, c, a);
  const after = {position: ceilingExit.position.clone().add(new Vector3(0, 0, -1).applyQuaternion(ceilingExit.quaternion).multiplyScalar(4)), quaternion: ceilingExit.quaternion.clone(), fov: 43};
  const phases = [
    {start: 0, end: 4, from: opening, to: opening, label: 'The composed view'},
    {start: 4, end: 11, from: opening, to: pose([-1.9, -3.9, 15], [-3.3, 1, 3], [0, 1, 0], 37), label: 'Up the first staircase'},
    {start: 11, end: 17, from: pose([-1.9, -3.9, 15], [-3.3, 1, 3], [0, 1, 0], 37), to: pose([-3.4, 3.5, 5.4], [-3.4, 3.5, 2.3]), label: 'Approaching the doorway'},
    {start: 17, end: 21, from: pose([-3.4, 3.5, 5.4], [-3.4, 3.5, 2.3]), to: entry, label: 'Crossing the first gravity frame'},
    {start: 21, end: 28, from: exit, to: away, label: 'The wall becomes the floor', teleport: true},
    {start: 28, end: 35, from: away, to: ceiling, label: 'Towards the ceiling stair'},
    {start: 35, end: 39, from: ceiling, to: ceilingEntry, label: 'Through the second doorway'},
    {start: 39, end: 45, from: ceilingExit, to: after, label: 'A third direction of up', teleport: true},
    {start: 45, end: 56, from: after, to: opening, label: 'Returning to the drawing'},
  ];
  return {
    duration: RELATIVITY_TOUR_DURATION, phases,
    sample(seconds) {
      const time = MathUtils.clamp(seconds, 0, RELATIVITY_TOUR_DURATION);
      const phase = phases.find(p => time >= p.start && time < p.end) ?? phases.at(-1);
      const f = MathUtils.smootherstep(time, phase.start, phase.end);
      return {position: phase.from.position.clone().lerp(phase.to.position, f),
        quaternion: phase.from.quaternion.clone().slerp(phase.to.quaternion, f),
        fov: MathUtils.lerp(phase.from.fov, phase.to.fov, f), label: phase.label, phase};
    },
  };
}
