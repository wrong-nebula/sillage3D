import {
  Color, GLSL3, Matrix4, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial,
  Vector2, Vector3, WebGLRenderTarget,
} from 'three';
import {CRYSTAL_STUDIO_FRAGMENT as fragmentShader} from './crystalStudioShader.js';

const vertexShader = /* glsl */`
  out vec2 imageUV;
  void main() {
    imageUV = uv;
    gl_Position = vec4(position.xy, 0., 1.);
  }
`;

/** Captures the live Gaussian fruit over transparent black, then resolves the
 * refractive set around it. The capture contains premultiplied display color. */
export class CrystalStudioPass {
  constructor({peachCenter, peachRadius}) {
    this.target = new WebGLRenderTarget(1, 1, {depthBuffer: false, stencilBuffer: false});
    this.scene = new Scene();
    this.camera = new OrthographicCamera();
    this.geometry = new PlaneGeometry(2, 2);
    this.material = new ShaderMaterial({
      vertexShader, fragmentShader, glslVersion: GLSL3, depthTest: false,
      depthWrite: false, toneMapped: false,
      uniforms: {
        fruit: {value: this.target.texture},
        rayFromClip: {value: new Matrix4()},
        clipFromWorld: {value: new Matrix4()},
        eye: {value: new Vector3()},
        peachCenter: {value: new Vector3(...peachCenter)},
        peachRadius: {value: new Vector3(...peachRadius)},
        resolution: {value: new Vector2()},
        paintSettings: {value: new Vector2()},
      },
    });
    const screen = new Mesh(this.geometry, this.material);
    screen.frustumCulled = false;
    this.scene.add(screen);
  }

  render(renderer, splatScene, camera, options) {
    const uniforms = this.material.uniforms;
    const output = renderer.getRenderTarget();
    const clearColor = renderer.getClearColor(new Color());
    const clearAlpha = renderer.getClearAlpha();
    renderer.getDrawingBufferSize(uniforms.resolution.value);
    const gouache = options.mode === 'ghibli';
    uniforms.paintSettings.value.set(gouache ? options.gouacheBlend : 0, gouache ? options.gouacheTexture : 0);
    const {x, y} = uniforms.resolution.value;
    this.target.setSize(x, y);

    camera.updateMatrixWorld();
    uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld);
    uniforms.rayFromClip.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    uniforms.clipFromWorld.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    try {
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0x000000, 0);
      renderer.render(splatScene, camera);
    } finally {
      renderer.setRenderTarget(output);
      renderer.setClearColor(clearColor, clearAlpha);
    }
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
