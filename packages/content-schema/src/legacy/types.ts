// Shapes of the original src/data files that are still in use. Only used to
// import them and to prove the new model reproduces them exactly.

export interface LegacyResume {
  personal: { name: string; title: string; email: string; phone: string; location: string };
  summary: string;
  skills: Record<string, string[]>;
  experience: Array<{
    id: string;
    company: string;
    droneIntroText: string;
    jobMemories: Array<{ type: string; text: string }>;
    jobTech: Array<{ label: string; highlightMatches: string[] }>;
    navLabel: string;
    location: string;
    startDate: string;
    endDate: string;
    Projects?: Array<{ id: string; title: string; summary: string }>;
    positions: Array<{
      title: string;
      startDate?: string;
      endDate?: string;
      responsibilities: string[];
    }>;
  }>;
  education: { institution: string; degree: string; major: string; graduationDate: string };
  links: Array<{ title: string; url: string }>;
  certifications: Array<{ name: string; date: string }>;
}

export interface LegacyGalleryMedia {
  id: string;
  type: string;
  image: string;
  title: string;
  description: string;
  fit: string;
}

export interface LegacyClientVariant {
  id: string;
  title: string;
  image: string;
  description: string;
  technologies: string[];
  year: number | null;
  fit: string;
  galleryMedia?: LegacyGalleryMedia[];
}

export interface LegacyPortfolioEntry {
  id: string;
  title: string;
  image: string;
  description: string;
  technologies: string[];
  year: number | null;
  fit: string;
  galleryMedia?: LegacyGalleryMedia[];
  clientVariants?: LegacyClientVariant[];
}

export interface LegacyPortfolioCore {
  core: string;
  coreColor: string;
  plains: Array<{
    angle: number;
    items: Array<{ orbitColor: string; items: LegacyPortfolioEntry[] }>;
  }>;
}

export interface LegacyMoonPortfolioMapping {
  companyId: string;
  coreTitles?: string[];
  includeEntryIds?: string[];
  excludeEntryIds?: string[];
  tabs?: Array<{ id: string; title: string; includeEntryIds?: string[] }>;
}

export interface LegacyAboutDeck {
  aboutDeck: {
    slides: Array<{
      id: string;
      holdMs: number;
      explodeAfter: boolean;
      reveal: { pattern: string; blockStaggerMs: number; cellRevealMs: number };
      blocks: Array<{ type: string; title: string; body?: string; src?: string }>;
    }>;
  };
}

export interface LegacyPathTravelMessage {
  id: string;
  textContent: string;
  fontFamily: string[];
  fontSize: string;
  fontColor: string;
  fontShadow: string;
}

export interface LegacyCosmicNarrative {
  cosmicNarrative: {
    introduction: { title: string; subtitle: string; description: string };
    guidedTours: Array<{
      id: string;
      name: string;
      description: string;
      duration: string;
      waypoints: string[];
    }>;
    planets: Record<string, { cosmicName: string; description: string; atmosphere: string }>;
  };
}

export interface LegacyContent {
  resume: LegacyResume;
  portfolioCores: LegacyPortfolioCore[];
  moonPortfolioMapping: LegacyMoonPortfolioMapping[];
  aboutDeck: LegacyAboutDeck;
  aboutPathTravelMessages: LegacyPathTravelMessage[];
  cosmicNarrative: LegacyCosmicNarrative;
}

// Parts of the legacy files that exist but are intentionally not modeled
// (not read by either experience). Matched as path prefixes; `*` is one segment.
export const LEGACY_EXCLUDED_PATHS = [
  "cosmicNarrative.cosmicNarrative.planets.*.cameraPositions",
  "cosmicNarrative.cosmicNarrative.planets.*.visualEffects",
  "cosmicNarrative.cosmicNarrative.planets.*.moons",
  "cosmicNarrative.cosmicNarrative.navigationModes",
  "cosmicNarrative.cosmicNarrative.ambientElements",
] as const;
