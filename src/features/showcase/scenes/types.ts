import type * as THREE from "three";
import type { TechStackTreeNode } from "../../../lib/api/contentV2";
import type { PortfolioCoreSeed } from "../../fast/types";
import type { ShowcaseProject } from "../lib/useShowcaseProjects";

export type ThreeModule = typeof import("three");

/** Pointer position relative to the viewport centre, each axis in -0.5..0.5. */
export interface ScenePointer {
  x: number;
  y: number;
}

export interface SceneData {
  projects: ShowcaseProject[];
  techStack: TechStackTreeNode[];
  portfolioCores: PortfolioCoreSeed[];
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
  create(three: ThreeModule, data: SceneData): Promise<ShowcaseScene>;
}
