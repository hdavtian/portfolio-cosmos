import type * as THREE from "three";
import type { TechStackTreeNode } from "@hd/content-schema/tech-stack-tree";
import type { PortfolioCore, PortfolioEntry } from "@hd/content-schema";
import type { ShowcaseProject } from "../lib/useShowcaseProjects";

export type ThreeModule = typeof import("three");

/** Pointer position relative to the viewport centre, each axis in -0.5..0.5. */
export interface ScenePointer {
  x: number;
  y: number;
}

/** A job as the scenes need it (from the published resume). */
export interface SceneJob {
  slug: string;
  company: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  droneIntroText?: string;
  positions: Array<{ title: string; startDate?: string; endDate?: string }>;
  memories: Array<{ type: string; text: string }>;
  tech: string[];
}

/** The published portfolio as stored: cores, their entries, and where images live. */
export interface ScenePortfolio {
  cores: PortfolioCore[];
  entries: PortfolioEntry[];
  media: Record<string, { url: string }>;
}

export const EMPTY_PORTFOLIO: ScenePortfolio = { cores: [], entries: [], media: {} };

export interface SceneData {
  /** Name and title from the published profile. */
  profile: { name: string; title: string };
  projects: ShowcaseProject[];
  techStack: TechStackTreeNode[];
  portfolio: ScenePortfolio;
  jobs: SceneJob[];
  /** The film's timeline (places and skill spans), for its home-page preview. */
  skills: {
    places: SkillsPlace[];
    spans: SkillsSpan[];
    /** Which line each skill prints on, and which lines roll up into one tower. */
    lineOf: ReadonlyMap<string, string>;
    lineNames: ReadonlyMap<string, string>;
    rolled: ReadonlySet<string>;
  };
}

export interface SkillsPlace {
  slug: string;
  name: string;
  from: number;
  to: number;
}

export interface SkillsSpan {
  skill: string;
  skillName: string;
  place: string;
  from: number;
  to: number;
}

/** What the host shares with scenes. */
export interface SceneContext {
  renderer: THREE.WebGLRenderer;
}

/**
 * One fragment of the cinematic universe shown behind the portfolio. Scenes
 * own their THREE.Scene and camera; the host owns the renderer, loop and
 * transitions, and renders only the active scene.
 */
export interface ShowcaseScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** 0..1 loading progress; 1 means it can be shown. */
  progress(): number;
  /**
   * Advance by dt seconds. `visible` is false while the scene preloads out of
   * sight, when it should only do the work loading needs.
   */
  update(dt: number, pointer: ScenePointer, visible: boolean): void;
  resize(width: number, height: number): void;
  /** Technologies of the project open on the page (scenes may light them). */
  setHighlights?(technologies: string[]): void;
  /** Project open on the page (scenes may bring it into view). */
  setFocusProject?(projectId: string | null): void;
  dispose(): void;
}

export interface SceneDefinition {
  id: string;
  /** Name in the switcher, e.g. "Career gallery". */
  label: string;
  create(three: ThreeModule, data: SceneData, context: SceneContext): Promise<ShowcaseScene>;
}
