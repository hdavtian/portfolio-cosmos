import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";

/**
 * Focus for the Skills lattice: the chosen system stays sharp wherever its
 * parts are - a node, its parent, its siblings and children sit all around
 * it in depth, like moons round a planet - and everything else goes soft,
 * as if an invisible box held the one system in focus.
 *
 * Not a lens: a lens blurs by distance to a focal plane, and a moon in front
 * of its planet would go soft. This blurs by membership. Objects on
 * FOCUS_LAYER are drawn once more, white on black, into a mask; the frame is
 * then blurred everywhere the mask is dark, and left as it is where it is
 * lit. `strength` (0-1) eases the effect in and out.
 */
// The universe already uses layers 0, 1 (showcase cards), 3 (the lattice)
// and 4 (the portfolio); this one is the mask's alone.
export const FOCUS_LAYER = 9;

const shader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tMask: { value: null as THREE.Texture | null },
    uStrength: { value: 0 },
    // Blur radius as a fraction of the screen's height.
    uRadius: { value: 0.014 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tMask;
    uniform float uStrength;
    uniform float uRadius;
    uniform float uAspect;
    varying vec2 vUv;

    // A disc of taps, spiralled so the blur is round rather than boxy.
    const int TAPS = 24;
    const float GOLDEN = 2.39996323;

    void main() {
      vec4 sharp = texture2D(tDiffuse, vUv);
      float lit = texture2D(tMask, vUv).r;
      float soft = (1.0 - lit) * uStrength;
      if (soft <= 0.001) {
        gl_FragColor = sharp;
        return;
      }
      vec4 sum = vec4(0.0);
      float weight = 0.0;
      for (int i = 0; i < TAPS; i++) {
        float f = float(i);
        float r = sqrt((f + 0.5) / float(TAPS));
        float a = f * GOLDEN;
        vec2 offset = vec2(cos(a) / uAspect, sin(a)) * r * uRadius * soft;
        vec2 at = vUv + offset;
        // A sharp pixel does not smear into its soft surroundings.
        float w = 1.0 - texture2D(tMask, at).r * 0.85;
        sum += texture2D(tDiffuse, at) * w;
        weight += w;
      }
      vec4 blurred = sum / max(weight, 0.001);
      // Soft things also sit back a little, so the sharp system reads first.
      blurred.rgb *= 1.0 - 0.22 * soft;
      gl_FragColor = mix(sharp, blurred, soft);
    }
  `,
};

export class LatticeFocusPass extends Pass {
  /** How far in the effect is, 0 (off) to 1. */
  strength = 0;

  private readonly mask: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly clearColor = new THREE.Color();

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;

  constructor(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.mask = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(shader.uniforms),
      vertexShader: shader.vertexShader,
      fragmentShader: shader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.setSize(width, height);
  }

  override setSize(width: number, height: number): void {
    this.mask.setSize(width, height);
    this.material.uniforms.uAspect.value = width / Math.max(1, height);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    // The mask: only the focused layer, white on black.
    const layersBefore = this.camera.layers.mask;
    const overrideBefore = this.scene.overrideMaterial;
    const backgroundBefore = this.scene.background;
    const targetBefore = renderer.getRenderTarget();
    const autoClearBefore = renderer.autoClear;
    renderer.getClearColor(this.clearColor);
    const clearAlphaBefore = renderer.getClearAlpha();

    this.camera.layers.set(FOCUS_LAYER);
    this.scene.overrideMaterial = this.white;
    this.scene.background = null;
    renderer.setRenderTarget(this.mask);
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = true;
    renderer.clear();
    renderer.render(this.scene, this.camera);

    this.camera.layers.mask = layersBefore;
    this.scene.overrideMaterial = overrideBefore;
    this.scene.background = backgroundBefore;
    renderer.setClearColor(this.clearColor, clearAlphaBefore);
    renderer.autoClear = autoClearBefore;

    // The composite.
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.material.uniforms.tMask.value = this.mask.texture;
    this.material.uniforms.uStrength.value = this.strength;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this.quad.render(renderer);
    renderer.setRenderTarget(targetBefore);
  }

  override dispose(): void {
    this.mask.dispose();
    this.material.dispose();
    this.white.dispose();
    this.quad.dispose();
  }
}

/** Puts an object (and what it contains) on the focused layer, or takes it off. */
export const setFocused = (object: THREE.Object3D, focused: boolean): void => {
  object.traverse((child) => {
    if (focused) child.layers.enable(FOCUS_LAYER);
    else child.layers.disable(FOCUS_LAYER);
  });
};
