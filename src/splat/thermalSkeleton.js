import {Vector3} from 'three';
import {HAND_FINGERS, poseHandPoint} from './handPose.js';

const fingertips = [[-69, -102, -22], [-31, -130, -22], [-1, -141, -15], [34, -126, -14]];
const wristEnds = [[-31, 34, -6], [-23, 38, -7], [-14, 40, -8], [-3, 36, -10]];
const thumb = [[-4, 32, -10], [30, 4, -18], [51, -25, -21], [67, -46, -24]];
const carpals = [
  [[-35, 46, -5], [-31, 36, -7], 4.7, .40],
  [[-25, 50, -5], [-22, 38, -8], 5.1, .42],
  [[-14, 47, -7], [-13, 35, -9], 4.8, .43],
  [[-4, 46, -9], [-3, 36, -11], 4.3, .38],
];
const bones = [
  ...HAND_FINGERS.flatMap(({joints}, finger) => {
    const points = [wristEnds[finger], ...joints.map(([x, y, z])=>[x,y,z-3]), fingertips[finger]];
    return points.slice(1).map((point, index) =>
      [points[index], point, index === 0 ? 4.8 : 3.9 - index * .35, index === 0 ? .97 : .86],
    );
  }),
  ...thumb.slice(1).map((point, index) => [thumb[index], point, index === 0 ? 4.9 : 3.7, .87]),
  ...carpals,
  [[-33, 119, -1], [-28, 46, -5], 4.9, .56],
  [[-7, 123, -1], [-7, 46, -7], 6.1, .64],
];

// Read both skin surfaces in the unposed scan before bending the skeleton.
// This fits the shadows to the hand's actual thickness, including the fingers.
function skinDepthAt(x, y, restMeshes) {
  let palm = Infinity, back = -Infinity;
  for (const [geometry, {position}] of restMeshes) {
    const indices = geometry.index;
    const count = indices?.count ?? position.count;
    for (let i = 0; i < count; i += 3) {
      const a = indices ? indices.getX(i) : i;
      const b = indices ? indices.getX(i + 1) : i + 1;
      const c = indices ? indices.getX(i + 2) : i + 2;
      const ax = position.getX(a), ay = position.getY(a);
      const bx = position.getX(b), by = position.getY(b);
      const cx = position.getX(c), cy = position.getY(c);
      if (x < Math.min(ax, bx, cx) || x > Math.max(ax, bx, cx) ||
          y < Math.min(ay, by, cy) || y > Math.max(ay, by, cy)) continue;
      const determinant = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(determinant) < 1e-12) continue;
      const u = ((x - ax) * (cy - ay) - (y - ay) * (cx - ax)) / determinant;
      const v = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / determinant;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const z = (1 - u - v) * position.getZ(a) + u * position.getZ(b) + v * position.getZ(c);
      palm = Math.min(palm, z);back = Math.max(back, z);
    }
  }
  return back - palm > .001 ? {palm, back} : null;
}

export function buildThermalSkeleton(source, restMeshes) {
  const rest = new Vector3(), posed = new Vector3(), scratch = new Vector3();
  const worldPoint = point => {
    rest.fromArray(point);
    const skin = skinDepthAt(rest.x * .001, rest.y * .001, restMeshes);
    if (skin) {
      const depth = rest.y < -42 ? .44 : .54;
      rest.z = (skin.back - (skin.back - skin.palm) * depth) * 1000;
    } else {
      rest.z -= 3;
    }
    poseHandPoint(rest, posed, scratch);
    return source.localToWorld(posed.multiplyScalar(.001)).toArray();
  };
  const scale = new Vector3().setFromMatrixScale(source.matrixWorld).x;
  return {
    dorsal: new Vector3(0, 0, 1).transformDirection(source.matrixWorld),
    starts: bones.map(([a,,width]) => [...worldPoint(a), width * scale * .001]),
    ends: bones.map(([,b,,density]) => [...worldPoint(b), density]),
  };
}

export const THERMAL_SKELETON_GLSL = `
uniform vec3 thermalDorsal;
uniform vec4 thermalBoneStarts[${bones.length}];
uniform vec4 thermalBoneEnds[${bones.length}];
vec3 thermalTissuePigment(vec3 pigment,vec3 surface,vec3 eye,float hotArea){
  vec3 ray=normalize(surface-eye);
  float side=dot(-ray,thermalDorsal);
  float palm=1.-smoothstep(-.68,-.15,side);
  pigment=mix(pigment,palmHighlight(pigment,hotArea),palm);
  float dorsal=smoothstep(.19,.64,side);
  if(dorsal<=0.)return pigment;
  float coreDensity=0.;
  float scatteredDensity=0.;
  float closestShaft=0.;
  float secondShaft=0.;
  for(int i=0;i<${bones.length};i++){
    vec3 start=thermalBoneStarts[i].xyz-surface;
    vec3 axis=thermalBoneEnds[i].xyz-thermalBoneStarts[i].xyz;
    vec3 flatAxis=axis-ray*dot(axis,ray);
    float along=-dot(flatAxis,start)/max(dot(flatAxis,flatAxis),.000001);
    float t=clamp(along,.13,.87);
    vec3 closest=start+t*axis;
    float depth=dot(closest,ray);
    float inside=smoothstep(.018,.075,depth)*(1.-smoothstep(.47,.83,depth));
    if(inside<=0.)continue;
    float distance2=max(0.,dot(closest,closest)-depth*depth);
    float head=smoothstep(.32,.72,abs(2.*t-1.));
    float radius=thermalBoneStarts[i].w*(.68+.39*head);
    float tissue=max(0.,depth-radius);
    float width=radius+.040*tissue;
    float spread=width+.022+.11*tissue;
    float density=thermalBoneEnds[i].w*inside*exp(-1.95*tissue);
    coreDensity=max(coreDensity,density*exp(-.5*distance2/(width*width)));
    scatteredDensity=max(scatteredDensity,density*exp(-.5*distance2/(spread*spread)));
    if(i<16&&i%4==0){
      // Light pools in tissue flanked by two metacarpals, away from the joints.
      float span=smoothstep(.07,.26,along)*(1.-smoothstep(.75,.95,along));
      float reach=spread+.078;
      float proximity=inside*span*exp(-.5*distance2/(reach*reach));
      secondShaft=max(secondShaft,min(closestShaft,proximity));
      closestShaft=max(closestShaft,proximity);
    }
  }
  // Light spreads through the tissue around each shaft. The buried core
  // absorbs more than its blurred edge, and deep bones lose contrast.
  float shadow=1.-exp(-.87*scatteredDensity*dorsal);
  float core=smoothstep(.12,.76,coreDensity)*dorsal;
  float gap=smoothstep(.14,.60,secondShaft)*(1.-smoothstep(.20,.57,coreDensity))*dorsal;
  float hot=smoothstep(.54,.88,pigment.g)*dorsal;
  pigment=mix(pigment,min(pigment,vec3(1.,.67,.32)),hot);
  vec3 violet=mix(vec3(.12,.043,.22),vec3(.25,.105,.36),clamp(pigment.r,0.,1.));
  vec3 colored=mix(pigment,vec3(pigment.r*.68,pigment.g*.46,max(pigment.b,.25)),shadow);
  vec3 skin=mix(colored,violet,core*.72);
  // Each shadowed splat picks up the animated gradient at its own position.
  skin=mix(skin,pigment,.40);
  return mix(skin,vec3(1.,.97,.79),gap*hotArea*.38);
}
`;
