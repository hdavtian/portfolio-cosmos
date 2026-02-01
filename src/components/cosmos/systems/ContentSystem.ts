/**
 * Content System - Manages overlay content loading and display
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";
import type { OrbitalItem, OverlayDefinition } from "../types";

export interface ContentConfig {
  resumeData: any;
  cosmicNarrative: any;
}

/**
 * Manages content overlays and detail panels for celestial bodies
 */
export class ContentSystem {
  private resumeData: any;
  private cosmicNarrative: any;
  private overlays: Map<string, OverlayDefinition[]> = new Map();

  constructor(config: ContentConfig) {
    this.resumeData = config.resumeData;
    this.cosmicNarrative = config.cosmicNarrative;
  }

  /**
   * Get resume data
   */
  getResumeData(): any {
    return this.resumeData;
  }

  /**
   * Get cosmic narrative
   */
  getCosmicNarrative(): any {
    return this.cosmicNarrative;
  }

  /**
   * Register overlays for a planet
   */
  registerOverlays(planetId: string, overlays: OverlayDefinition[]): void {
    this.overlays.set(planetId, overlays);
  }

  /**
   * Get overlays for a planet
   */
  getOverlays(planetId: string): OverlayDefinition[] | undefined {
    return this.overlays.get(planetId);
  }

  /**
   * Get experience data for a company
   */
  getExperienceByCompany(company: string): any {
    return this.resumeData.experience.find(
      (exp: any) => exp.company.toLowerCase() === company.toLowerCase(),
    );
  }

  /**
   * Get experience by ID
   */
  getExperienceById(id: string): any {
    return this.resumeData.experience.find((exp: any) => exp.id === id);
  }

  /**
   * Get skills data
   */
  getSkills(): any[] {
    return this.resumeData.skills || [];
  }

  /**
   * Get projects data
   */
  getProjects(): any[] {
    return this.resumeData.projects || [];
  }

  /**
   * Get planet narrative
   */
  getPlanetNarrative(planetName: string): string | undefined {
    const key = planetName.toLowerCase();
    return this.cosmicNarrative?.[key]?.intro;
  }

  /**
   * Get section data by name
   */
  getSectionData(sectionName: string): any {
    const section = sectionName.toLowerCase();

    switch (section) {
      case "experience":
        return this.resumeData.experience;
      case "skills":
        return this.resumeData.skills;
      case "projects":
        return this.resumeData.projects;
      case "education":
        return this.resumeData.education;
      case "certifications":
        return this.resumeData.certifications;
      default:
        return null;
    }
  }

  /**
   * Format content for overlay display
   */
  formatOverlayContent(data: any, type: string): string[] {
    const lines: string[] = [];

    switch (type) {
      case "experience":
        if (data.role) lines.push(`Role: ${data.role}`);
        if (data.duration) lines.push(`Duration: ${data.duration}`);
        if (data.location) lines.push(`Location: ${data.location}`);
        if (data.highlights) {
          lines.push("Highlights:");
          data.highlights.forEach((h: string) => lines.push(`• ${h}`));
        }
        break;

      case "skills":
        if (data.category) lines.push(data.category);
        if (data.items) {
          data.items.forEach((item: string) => lines.push(`• ${item}`));
        }
        break;

      case "projects":
        if (data.name) lines.push(data.name);
        if (data.description) lines.push(data.description);
        if (data.technologies) {
          lines.push(`Tech: ${data.technologies.join(", ")}`);
        }
        break;

      default:
        lines.push(JSON.stringify(data));
    }

    return lines;
  }

  /**
   * Show overlay for an item
   */
  showOverlay(item: OrbitalItem, visible: boolean = true): void {
    if (!item.mesh.userData.detailOverlay) {
      return;
    }

    const panel = item.mesh.userData.detailOverlay as THREE.Mesh;
    panel.visible = visible;

    // Update overlay user data
    if (item.mesh.userData.overlays) {
      item.mesh.userData.overlays.forEach((overlay: any) => {
        if (overlay.mesh) {
          overlay.mesh.visible = visible;
        }
      });
    }
  }

  /**
   * Hide all overlays for items
   */
  hideAllOverlays(items: OrbitalItem[]): void {
    items.forEach((item) => {
      this.showOverlay(item, false);
    });
  }

  /**
   * Update content data
   */
  updateResumeData(data: any): void {
    this.resumeData = data;
  }

  /**
   * Update cosmic narrative
   */
  updateCosmicNarrative(data: any): void {
    this.cosmicNarrative = data;
  }

  /**
   * Clear all registered overlays
   */
  clear(): void {
    this.overlays.clear();
  }

  /**
   * Get all registered overlay planet IDs
   */
  getRegisteredPlanets(): string[] {
    return Array.from(this.overlays.keys());
  }
}
