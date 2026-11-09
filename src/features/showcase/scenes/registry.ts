import { CINEMATIC_PATH } from "../../../app/cinematic/keepAlive";
import { FILM_PATH } from "../../../app/film/FilmHost";
import { createAboutRideScene } from "./aboutRideScene";
import { createCareerGalleryScene } from "./careerGalleryScene";
import { createOrbitalPortfolioScene } from "./orbitalPortfolioScene";
import { createSkillsLatticeScene } from "./skillsLatticeScene";
import { createUniverseTourScene } from "./universeTourScene";
import { createJobMoonScene, JOB_ID } from "./jobMoonScene";
import { createGotSkillzScene } from "./gotSkillzScene";
import type { SceneDefinition } from "./types";

/** "Go to the Universe and visit …": the universe has no deep links, so the words say where to go once inside. */
const inUniverse = (place: string) => ({ to: CINEMATIC_PATH, text: `Go to the Universe and visit ${place}` });

/** Scenes in tour order. The first is shown first. */
export const SCENE_DEFINITIONS: SceneDefinition[] = [
  {
    id: "skills-lattice",
    label: "Skills lattice",
    destination: () => inUniverse("Skills"),
    create: createSkillsLatticeScene,
  },
  {
    id: "got-skillz",
    label: "GOT inspired Skillz",
    destination: () => ({ to: FILM_PATH, text: "Go to Tech Progression" }),
    create: createGotSkillzScene,
  },
  {
    id: "career-gallery",
    label: "Career gallery",
    destination: () => inUniverse("the Career Gallery"),
    create: createCareerGalleryScene,
  },
  {
    id: "orbital-portfolio",
    label: "Orbital portfolio",
    destination: () => inUniverse("the Portfolio"),
    create: createOrbitalPortfolioScene,
  },
  {
    id: "about-ride",
    label: "About ride",
    destination: () => ({ to: CINEMATIC_PATH, text: "Go to the Universe and take the About ride" }),
    create: createAboutRideScene,
  },
  {
    id: "universe-tour",
    label: "Universe tour",
    destination: () => ({ to: CINEMATIC_PATH, text: "Go to the Universe" }),
    create: createUniverseTourScene,
  },
  {
    id: "job-moon",
    label: "Job moon",
    destination: (data) => {
      // The same job the scene shows (it falls back to the first one).
      const job = data.jobs.find((entry) => entry.slug === JOB_ID) ?? data.jobs[0];
      const name = job ? job.navLabel || job.company : "";
      return inUniverse(name ? `the ${name} moon in Experience` : "Experience");
    },
    create: createJobMoonScene,
  },
];
