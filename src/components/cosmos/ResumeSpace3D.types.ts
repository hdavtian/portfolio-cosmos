import type * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import type { DiagramStyleOptions } from "../DiagramSettings";

export interface ResumeSpace3DProps {
  onNavigate: (section: number) => void;
  options: DiagramStyleOptions;
  onOptionsChange?: (options: DiagramStyleOptions) => void;
}

export interface SceneRef {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  controls?: OrbitControls;
  sunLight?: THREE.PointLight;
  labelRendererDom?: HTMLElement;
  bloomPass?: UnrealBloomPass;
  bokehPass?: BokehPass;
  sunMaterial?: THREE.MeshBasicMaterial | THREE.ShaderMaterial;
  sunGlowMaterial?: THREE.SpriteMaterial;
}
