import {Vector3} from 'three';

// The Klein model has straight geodesics. Moving its points into the conformal
// Poincaré ball turns them into arcs orthogonal to the ideal boundary sphere.
export const KLEIN_SCALE = .135;
export const BALL_SCALE = 10.5;
export function kleinToPoincare(p) {
  const squared = p.reduce((sum, v) => sum + v * v, 0);
  if (squared >= 1) throw new RangeError('Klein coordinates must lie inside the unit ball.');
  const denominator = 1 + Math.sqrt(1 - squared);
  return p.map(v => v / denominator);
}

/** Left Möbius addition: an isometry of the curvature -1 Poincaré ball. */
export function mobiusAdd(a, p) {
  const aa = a.reduce((s, v) => s + v * v, 0), pp = p.reduce((s, v) => s + v * v, 0);
  if (aa >= 1 || pp >= 1) throw new RangeError('Möbius operands must lie inside the unit ball.');
  const ap = a.reduce((s, v, i) => s + v * p[i], 0);
  const denominator = 1 + 2 * ap + aa * pp;
  return a.map((v, i) => ((1 + 2 * ap + pp) * v + (1 - aa) * p[i]) / denominator);
}

export function hyperbolicDistance(a, b) {
  const aa = a.reduce((s, v) => s + v * v, 0), bb = b.reduce((s, v) => s + v * v, 0);
  if (aa >= 1 || bb >= 1) throw new RangeError('Distance points must lie inside the unit ball.');
  const delta = a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
  return Math.acosh(1 + 2 * delta / ((1 - aa) * (1 - bb)));
}

const GLSL = `
uniform bool hyperbolicEnabled;
uniform vec3 hyperbolicTranslation;
vec3 hyperbolicPoint(vec3 position){
  vec3 k=position*${KLEIN_SCALE};
  vec3 p=k/(1.+sqrt(max(.00001,1.-dot(k,k))));
  vec3 a=hyperbolicTranslation;
  float aa=dot(a,a),pp=dot(p,p),ap=dot(a,p);
  vec3 q=((1.+2.*ap+pp)*a+(1.-aa)*p)/(1.+2.*ap+aa*pp);
  // Recenter the coordinate chart for viewing; the isometry is q above.
  return (q-a)*${BALL_SCALE};
}
vec3 hyperbolicAxis(vec3 p,vec3 axis){
  return .5*(hyperbolicPoint(p+axis)-hyperbolicPoint(p-axis));
}
`;

/** Scene-local shader extension. CPU depth sort uses the identical map. */
export class HyperbolicFractal {
  constructor(engine) {
    this.engine = engine; this.enabled = true;
    this.source = engine.centers.slice();
    this.translation = new Vector3();
    const material = engine.material;
    this.original = material.vertexShader;
    const hook = 'vec3 p=(modelViewMatrix*vec4(center.xyz,1.)).xyz;';
    if (!this.original.includes(hook)) throw new Error('Hyperbolic projection shader hook is missing.');
    material.vertexShader = GLSL + this.original.replace(hook, `
      if(hyperbolicEnabled){
        axisA=hyperbolicAxis(center.xyz,axisA);
        axisB=hyperbolicAxis(center.xyz,axisB);
        axisC=hyperbolicAxis(center.xyz,axisC);
        center.xyz=hyperbolicPoint(center.xyz);
      }
      ${hook}`)
      .replace('float sigma=max(length(readSplat(1).xyz),max(length(readSplat(2).xyz),length(readSplat(3).xyz)))*brushScale;',
        'float sigma=max(length(axisA),max(length(axisB),length(axisC)))*brushScale;');
    material.uniforms.hyperbolicEnabled = {value: true};
    material.uniforms.hyperbolicTranslation = {value: this.translation};
    material.needsUpdate = true;
    // Rest-pose culling bounds cannot bound a curved-space projection.
    this.previousCulling = engine.frustumCulling; engine.frustumCulling = false;
    this.update(0);
  }
  update(time) {
    const engine = this.engine;
    this.translation.set(.29 * Math.sin(time * .17), .16 * Math.sin(time * .13), .23 * Math.sin(time * .11));
    engine.material.uniforms.hyperbolicEnabled.value = this.enabled;
    if (!this.enabled) engine.centers.set(this.source);
    else {
      const {x: a, y: b, z: c} = this.translation, aa = a * a + b * b + c * c;
      const source = this.source, target = engine.centers;
      // Allocation-free counterpart of the shader, including chart recentering.
      for (let i = 0; i < source.length; i += 3) {
        let x = source[i] * KLEIN_SCALE, y = source[i + 1] * KLEIN_SCALE, z = source[i + 2] * KLEIN_SCALE;
        const root = 1 + Math.sqrt(Math.max(.00001, 1 - x * x - y * y - z * z));
        x /= root; y /= root; z /= root;
        const pp = x * x + y * y + z * z, ap = a * x + b * y + c * z;
        const denominator = 1 + 2 * ap + aa * pp, factor = 1 + 2 * ap + pp;
        target[i] = ((factor * a + (1 - aa) * x) / denominator - a) * BALL_SCALE;
        target[i + 1] = ((factor * b + (1 - aa) * y) / denominator - b) * BALL_SCALE;
        target[i + 2] = ((factor * c + (1 - aa) * z) / denominator - c) * BALL_SCALE;
      }
    }
    engine.visibilityKey = null; engine.sortDirty = true; engine.dirty = true;
  }
  dispose() {
    const engine = this.engine;
    engine.material.vertexShader = this.original; engine.material.needsUpdate = true;
    delete engine.material.uniforms.hyperbolicEnabled; delete engine.material.uniforms.hyperbolicTranslation;
    engine.centers.set(this.source); engine.frustumCulling = this.previousCulling;
    engine.sortDirty = true; engine.dirty = true;
  }
}
