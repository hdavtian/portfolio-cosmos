import type * as THREE from "three";
import type CameraControls from "camera-controls";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { MoonPortfolioCompanyMapping } from "../../data/moonPortfolioMapping";
import type { DiagramStyleOptions } from "../DiagramSettings";
import type { PortfolioCoreSeed } from "./portfolioData";

export interface ResumeSpace3DProps {
  onNavigate: (section: number) => void;
  options: DiagramStyleOptions;
  onOptionsChange?: (options: DiagramStyleOptions) => void;
  onReloadUniverse?: () => void;
  /** Published portfolio (or the bundled copy), loaded before the scene mounts. */
  portfolioCores: PortfolioCoreSeed[];
  moonPortfolioMapping: MoonPortfolioCompanyMapping[];
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
  sunMaterial?: THREE.MeshBasicMaterial | THREE.ShaderMaterial;
  sunGlowMaterial?: THREE.SpriteMaterial;
}
