import type * as THREE from "three";
import type CameraControls from "camera-controls";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { DiagramStyleOptions } from "../DiagramSettings";

export interface ResumeSpace3DProps {
  onNavigate: (section: number) => void;
  options: DiagramStyleOptions;
  onOptionsChange?: (options: DiagramStyleOptions) => void;
  aboutHallInitialLevelId?: string;
  aboutHallColumnAngleMultiplier?: number;
  onHallwayContentModeChange?: (mode: "projects" | "about") => void;
  onProjectShowcaseActiveChange?: (active: boolean) => void;
  onReloadUniverse?: () => void;
}

export interface SceneRef {
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  controls?: CameraControls;
  ambientLight?: THREE.AmbientLight;
  sunLight?: THREE.PointLight;
  fillLight?: THREE.PointLight;
  labelRendererDom?: HTMLElement;
  bloomPass?: UnrealBloomPass;
  bokehPass?: unknown;
  sunMaterial?: THREE.MeshBasicMaterial | THREE.ShaderMaterial;
  sunGlowMaterial?: THREE.SpriteMaterial;
}
