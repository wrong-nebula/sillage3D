import {Color, Mesh, PlaneGeometry, ShaderMaterial} from 'three';

// Reconstruct the ground intersection per pixel so the wash and splats stay
// fixed in world space as the camera follows the crow in any direction.
export class BluePlane extends Mesh {
  constructor() {
    super(new PlaneGeometry(2, 2), new ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        cameraWorld: {value: null},
        inverseProjection: {value: null},
        reveal: {value: 0},
        sky: {value: new Color('#bacfe9').convertLinearToSRGB()},
        horizon: {value: new Color('#91b8d6').convertLinearToSRGB()},
        ground: {value: new Color('#5888b8').convertLinearToSRGB()},
      },
      vertexShader: `
        varying vec2 screen;
        void main() {
          screen = position.xy;
          gl_Position = vec4(position.xy, 0., 1.);
        }
      `,
      fragmentShader: `
        uniform mat4 cameraWorld;
        uniform mat4 inverseProjection;
        uniform float reveal;
        uniform vec3 sky;
        uniform vec3 horizon;
        uniform vec3 ground;
        varying vec2 screen;

        vec2 hash(vec2 p) {
          vec3 q = fract(p.xyx * vec3(.1031, .1030, .0973));
          q += dot(q, q.yzx + 33.33);
          return fract((q.xx + q.yz) * q.zy);
        }

        float pigment(vec2 p) {
          vec2 cell = floor(p);
          float ink = 0.;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 id = cell + vec2(float(x), float(y));
              vec2 random = hash(id);
              vec2 d = p - id - mix(vec2(.13), vec2(.87), random);
              vec2 brush = vec2(d.x + d.y * .47, d.y - d.x * .23);
              ink += (random.x - .47) * exp(-dot(brush * vec2(1.7, 3.4), brush * vec2(1.7, 3.4)));
            }
          }
          return ink;
        }

        void main() {
          vec3 direction = normalize(mat3(cameraWorld) * (inverseProjection * vec4(screen, 1., 1.)).xyz);
          float depth = cameraWorld[3].y / max(.002, -direction.y);
          vec2 contact = cameraWorld[3].xz + direction.xz * depth;
          float floorWeight = smoothstep(.005, .19, -direction.y);
          vec3 skyColor = mix(horizon, sky, smoothstep(-.045, .12, direction.y));
          skyColor += .016 * sin(direction.x * 4. - direction.z * 2.);
          float wash = .26 * sin(contact.x * .055 + contact.y * .042)
                     + .24 * sin(contact.x * .021 - contact.y * .096);
          vec3 floorColor = ground + vec3(.11, .11, .08) * wash;
          vec2 brush = contact;
          float marks = pigment(brush / 3.9) + .36 * pigment(brush / 1.55 + 17.);
          floorColor += vec3(.037, .056, .079) * marks * exp(-depth * .021);
          vec3 color = mix(skyColor, floorColor, floorWeight);
          float softEdge = 1. - .095 * dot(screen, screen) * (1. - reveal);
          gl_FragColor = vec4(color * reveal * softEdge, 1.);
        }
      `,
    }));
    this.frustumCulled = false;
    this.renderOrder = -3;
  }

  onBeforeRender(renderer, scene, camera) {
    this.material.uniforms.cameraWorld.value = camera.matrixWorld;
    this.material.uniforms.inverseProjection.value = camera.projectionMatrixInverse;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
