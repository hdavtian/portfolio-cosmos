import type * as THREE from "three";
import type CameraControls from "camera-controls";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { MoonPortfolioCompanyMapping } from "../../data/moonPortfolioMapping";
import type { AboutPathTravelMessage, TechStackTreeNode } from "../../lib/api/contentV2";
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
  aboutPathTravelMessages: AboutPathTravelMessage[];
  /** Drives the Skills Lattice: top-level nodes are the cores, deeper nodes orbit their parent. */
  techStack: TechStackTreeNode[];
  /** Name and title shown in the HUD badge and the loader (Admin → Profile). */
  profile: { name: string; title: string };
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
