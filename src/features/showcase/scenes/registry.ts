import { createCareerGalleryScene } from "./careerGalleryScene";
import { createSkillsLatticeScene } from "./skillsLatticeScene";
import type { SceneDefinition } from "./types";

/** Scenes in tour order. The first is shown first. */
export const SCENE_DEFINITIONS: SceneDefinition[] = [
  { id: "career-gallery", label: "Career gallery", create: createCareerGalleryScene },
  { id: "skills-lattice", label: "Skills lattice", create: createSkillsLatticeScene },
];
