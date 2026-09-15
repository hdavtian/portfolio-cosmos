import * as THREE from "three";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/**
 * Two touches for the Falcon parked outside the Career Gallery:
 *  - heat haze: a screen pass that wobbles the image in a soft patch around
 *    the engines (one texture read per pixel; disabled when not needed);
 *  - rim light: a fresnel shell over the hull so its outline separates from
 *    the globe behind it.
 */

const heatHazeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRadius: { value: new THREE.Vector2(0.1, 0.05) },
    uStrength: { value: 0 },
    uTime: { value: 0 },
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
    uniform vec2 uCenter;
    uniform vec2 uRadius;
    uniform float uStrength;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec2 d = (vUv - uCenter) / uRadius;
      float mask = 1.0 - smoothstep(0.35, 1.0, length(d));
      if (mask <= 0.0 || uStrength <= 0.0) {
        gl_FragColor = texture2D(tDiffuse, vUv);
        return;
      }
      // Rising, rippling hot air: layered waves scrolling at different speeds.
      vec2 p = vUv * vec2(90.0, 60.0);
      vec2 wobble = vec2(
        sin(p.y * 1.3 - uTime * 7.0 + sin(p.x * 0.7 + uTime * 2.1)),
        cos(p.x * 1.1 + uTime * 5.3 + sin(p.y * 0.9 - uTime * 1.7))
      );
      vec2 offset = wobble * uStrength * mask * uRadius.y * 0.06;
      vec4 color = texture2D(tDiffuse, vUv + offset);
      // The faintest warm lift, so the air feels hot without a visible blob.
      color.rgb += vec3(0.015, 0.006, 0.0) * mask * uStrength;
      gl_FragColor = color;
    }
  `,
};

export type HeatHazePass = ShaderPass;

export const createHeatHazePass = (): HeatHazePass => {
  const pass = new ShaderPass(heatHazeShader);
  pass.enabled = false;
  return pass;
};

const rimVertexShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uPush;
  varying float vFacing;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 viewNormal = normalize(normalMatrix * normal);
    // Grow slightly outward on screen so the rim sits on the silhouette.
    mvPosition.xy += viewNormal.xy * uPush * -mvPosition.z;
    vFacing = abs(dot(viewNormal, normalize(-mvPosition.xyz)));
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
  }
`;

const rimFragmentShader = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFacing;
  void main() {
    #include <logdepthbuf_fragment>
    float rim = pow(1.0 - vFacing, 4.0);
    gl_FragColor = vec4(uColor * rim * uOpacity, 1.0);
  }
`;

/** A fresnel rim shell over every mesh of the ship; toggle with setVisible. */
export class ShipRimLight {
  private readonly material = new THREE.ShaderMaterial({
    vertexShader: rimVertexShader,
    fragmentShader: rimFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(0.55, 0.8, 1.0).multiplyScalar(0.45) },
      uOpacity: { value: 1 },
      uPush: { value: 0.0025 },
    },
  });
  private readonly shells: THREE.Mesh[] = [];

  constructor(ship: THREE.Object3D) {
    const meshes: THREE.Mesh[] = [];
    ship.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && !(mesh as unknown as THREE.Sprite).isSprite && mesh.geometry?.getAttribute("normal")) {
        meshes.push(mesh);
      }
    });
    for (const mesh of meshes) {
      const shell = new THREE.Mesh(mesh.geometry, this.material);
      shell.name = "ShipRimLight";
      shell.renderOrder = 101;
      shell.visible = false;
      shell.frustumCulled = false;
      mesh.add(shell);
      this.shells.push(shell);
    }
  }

  setVisible(visible: boolean): void {
    for (const shell of this.shells) shell.visible = visible;
  }

  /**
   * "z-index" for the parked ship: its meshes draw after the gallery's flying
   * images and shards (renderOrder 20/21), so those never paint over it.
   */
  setOnTop(onTop: boolean): void {
    for (const shell of this.shells) {
      const mesh = shell.parent as THREE.Mesh | null;
      if (!mesh) continue;
      if (onTop) {
        if (mesh.userData.rimBaseRenderOrder === undefined) {
          mesh.userData.rimBaseRenderOrder = mesh.renderOrder;
        }
        mesh.renderOrder = 100;
      } else if (mesh.userData.rimBaseRenderOrder !== undefined) {
        mesh.renderOrder = mesh.userData.rimBaseRenderOrder as number;
        delete mesh.userData.rimBaseRenderOrder;
      }
    }
  }

  dispose(): void {
    for (const shell of this.shells) shell.removeFromParent();
    this.material.dispose();
  }
}
