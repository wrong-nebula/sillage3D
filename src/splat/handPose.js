import {MathUtils, Vector3} from 'three';

// Knuckle, middle joint and distal joint on the centered source mesh, in mm.
// Curl goes toward the palm. Splay is the rotation at the base of each finger.
export const HAND_FINGERS = [
  {joints: [[-51, -45, 2], [-64, -76, -9], [-68, -91, -16]], splay: 17, curl: [27, 33, 13]},
  {joints: [[-32, -53, 3], [-34, -93, -8], [-33, -115, -15]], splay: 7, curl: [10, 21, 8]},
  {joints: [[-8, -55, 4], [-3, -100, -5], [-1, -123, -14]], splay: 0, curl: [4, 8, 6]},
  {joints: [[16, -52, 4], [27, -91, -2], [33, -112, -8]], splay: -12, curl: [8, 16, 10]},
];
const across = new Vector3(1, 0, 0);
const depth = new Vector3(0, 0, 1);
const bend = HAND_FINGERS.map(({joints, splay, curl}) => ({
  joints: joints.map(joint => new Vector3(...joint)),
  splay: MathUtils.degToRad(splay),
  curl: curl.map(MathUtils.degToRad),
}));

export function poseHandPoint(rest, posed, digit) {
  posed.copy(rest);
  const {x, y} = rest;
  if (y >= -31) return posed;

  // Follow the valleys between the fingers. Blend across the webbing so
  // each knuckle can turn without leaving a seam at the base of the digit.
  const along = Math.max(0, -y - 54);
  const ring = MathUtils.smoothstep(x + along * .19, -49, -42);
  const middle = MathUtils.smoothstep(x, -24, -16);
  const indexFinger = MathUtils.smoothstep(x - along * .25, 1, 9);
  const weights = [1 - ring, ring - middle, middle - indexFinger, indexFinger];
  const thumb = MathUtils.smoothstep(x, 32, 47) * MathUtils.smoothstep(y, -62, -48);
  for (let i = 0; i < bend.length; i++) {
    if (weights[i] <= 0) continue;
    const {joints, splay, curl} = bend[i];
    const root = joints[0];
    const influence = (1 - thumb) * weights[i] * MathUtils.smoothstep(root.y - y, -14, 11);
    if (influence === 0) continue;
    digit.copy(rest);
    // Rotate the last joint first in rest space, then carry it with its parents.
    for (let j = 2; j >= 0; j--) {
      const pivot = joints[j];
      const angle = curl[j] * MathUtils.smoothstep(pivot.y - y, -7, 8);
      digit.sub(pivot).applyAxisAngle(across, angle);
      if (j === 0) digit.applyAxisAngle(depth, splay);
      digit.add(pivot);
    }
    posed.addScaledVector(digit.sub(rest), influence);
  }
  return posed;
}

export function poseHand(geometry) {
  const positions = geometry.attributes.position;
  const rest = new Vector3(), posed = new Vector3(), digit = new Vector3();
  for (let index = 0; index < positions.count; index++) {
    rest.fromBufferAttribute(positions, index).multiplyScalar(1000);
    poseHandPoint(rest, posed, digit);
    positions.setXYZ(index, posed.x / 1000, posed.y / 1000, posed.z / 1000);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
