import { createAboutRideScene } from "./aboutRideScene";
import { createCareerGalleryScene } from "./careerGalleryScene";
import { createOrbitalPortfolioScene } from "./orbitalPortfolioScene";
import { createSkillsLatticeScene } from "./skillsLatticeScene";
import { createUniverseTourScene } from "./universeTourScene";
import { createJobMoonScene } from "./jobMoonScene";
import type { SceneDefinition } from "./types";

/** Scenes in tour order. The first is shown first. */
export const SCENE_DEFINITIONS: SceneDefinition[] = [
  { id: "skills-lattice", label: "Skills lattice", create: createSkillsLatticeScene },
  { id: "career-gallery", label: "Career gallery", create: createCareerGalleryScene },
  { id: "orbital-portfolio", label: "Orbital portfolio", create: createOrbitalPortfolioScene },
  { id: "about-ride", label: "About ride", create: createAboutRideScene },
  { id: "universe-tour", label: "Universe tour", create: createUniverseTourScene },
  { id: "job-moon", label: "Job moon", create: createJobMoonScene },
];
