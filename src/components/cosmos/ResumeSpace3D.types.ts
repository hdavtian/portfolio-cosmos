import type * as THREE from "three";
import type CameraControls from "camera-controls";
import type { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { TechStackTreeNode } from "@hd/content-schema/tech-stack-tree";
import type { DiagramStyleOptions } from "../DiagramSettings";
import type { PortfolioCoreSeed } from "./portfolioData";
import type { SpaceAboutSlide, SpaceMoonMapping, SpaceResume, SpaceTravelMessage } from "./spaceContent";

export interface ResumeSpace3DProps {
  onNavigate: (section: number) => void;
  options: DiagramStyleOptions;
  onOptionsChange?: (options: DiagramStyleOptions) => void;
  onReloadUniverse?: () => void;
  /** Published content (see spaceContent.ts), loaded before the scene mounts. */
  portfolioCores: PortfolioCoreSeed[];
  moonPortfolioMapping: SpaceMoonMapping[];
  aboutPathTravelMessages: SpaceTravelMessage[];
  /** Jobs (the Experience moons), skills (the Skills planet), education and links. */
  resumeData: SpaceResume;
  /** Slides of the About deck. */
  aboutSlides: SpaceAboutSlide[];
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
