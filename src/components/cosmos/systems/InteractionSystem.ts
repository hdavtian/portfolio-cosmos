/**
 * Interaction System - Manages raycasting, hover detection, and click handling
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";

export interface HoverConfig {
  superFlashEvery: number;
  superCooldown: number;
  normalFlashStrength: number;
  superFlashStrength: number;
  normalHalo: {
    aurora: number;
    ring: number;
    core: number;
  };
  superHalo: {
    aurora: number;
    ring: number;
    core: number;
  };
}

export interface ClickResult {
  hit: boolean;
  object?: THREE.Object3D;
  point?: THREE.Vector3;
  sectionIndex?: number;
  planetName?: string;
  isMoon?: boolean;
  company?: string;
}

/**
 * Manages mouse/pointer interactions with 3D objects
 */
export class InteractionSystem {
  private raycaster: THREE.Raycaster;
  private pointer: THREE.Vector2;
  private hoveredObject: THREE.Object3D | null = null;
  private hoverConfig: HoverConfig;

  constructor(config?: Partial<HoverConfig>) {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.hoverConfig = {
      superFlashEvery: config?.superFlashEvery ?? 4,
      superCooldown: config?.superCooldown ?? 2000,
      normalFlashStrength: config?.normalFlashStrength ?? 0.12,
      superFlashStrength: config?.superFlashStrength ?? 0.8,
      normalHalo: config?.normalHalo ?? {
        aurora: 0.18,
        ring: 0.12,
        core: 0.22,
      },
      superHalo: config?.superHalo ?? { aurora: 0.6, ring: 0.4, core: 1.0 },
    };
  }

  /**
   * Update pointer position from mouse event
   */
  updatePointer(event: MouseEvent, container: HTMLElement): void {
    const rect = container.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  /**
   * Get current pointer position
   */
  getPointer(): THREE.Vector2 {
    return this.pointer.clone();
  }

  /**
   * Handle hover detection and effects
   */
  handleHover(
    camera: THREE.Camera,
    clickableObjects: THREE.Object3D[],
  ): THREE.Object3D | null {
    this.raycaster.setFromCamera(this.pointer, camera);
    const intersects = this.raycaster.intersectObjects(clickableObjects, false);

    const hit = intersects.find(
      (h) => h.object.userData.sectionIndex !== undefined,
    );
    const now = Date.now();

    if (hit && hit.object.userData.sectionIndex !== undefined) {
      const obj = hit.object;

      // If focused/paused, don't activate hover halo
      if (obj.userData.pauseOrbit) {
        this.clearHoveredObject();
        return null;
      }

      // If pointer moved from another object, clear previous
      if (this.hoveredObject && this.hoveredObject !== obj) {
        this.clearObjectHover(this.hoveredObject);
      }

      this.hoveredObject = obj;

      // Detect enter transition (distinct hover)
      const becameOver = !obj.userData.isPointerOver;
      obj.userData.isPointerOver = true;

      if (becameOver) {
        this.triggerHoverEffect(obj, now);
        document.body.style.cursor = "pointer";
      }

      return obj;
    } else {
      // No hit: clear previous hovered object if any
      this.clearHoveredObject();
      return null;
    }
  }

  /**
   * Trigger hover effect with flash and halo
   */
  private triggerHoverEffect(obj: THREE.Object3D, now: number): void {
    // Increment the hover count (counts distinct enter events)
    obj.userData.hoverCount = (obj.userData.hoverCount || 0) + 1;
    const superEvery =
      obj.userData.superEvery || this.hoverConfig.superFlashEvery;
    const lastSuper = obj.userData.lastSuperFlashAt || 0;

    // Decide whether this enter should be a 'super' flash
    const shouldSuper =
      obj.userData.hoverCount % superEvery === 0 &&
      now - lastSuper > this.hoverConfig.superCooldown;

    if (shouldSuper) {
      // Super flash
      obj.userData.hoverStartTime = now;
      obj.userData.flashActive = true;
      obj.userData.flashStrength =
        this.hoverConfig.superFlashStrength + Math.random() * 0.2;
      obj.userData.lastFlashAt = now;
      obj.userData.lastSuperFlashAt = now;

      if (obj.userData.hasHaloLayers) {
        obj.userData.auroraTargetOpacity = this.hoverConfig.superHalo.aurora;
        obj.userData.ringTargetOpacity = this.hoverConfig.superHalo.ring;
        obj.userData.coreTargetOpacity = this.hoverConfig.superHalo.core;
      }
    } else {
      // Normal flash
      obj.userData.hoverStartTime = now;
      obj.userData.flashActive = true;
      obj.userData.flashStrength =
        this.hoverConfig.normalFlashStrength + Math.random() * 0.12;
      obj.userData.lastFlashAt = now;

      if (obj.userData.hasHaloLayers) {
        obj.userData.auroraTargetOpacity = this.hoverConfig.normalHalo.aurora;
        obj.userData.ringTargetOpacity = this.hoverConfig.normalHalo.ring;
        obj.userData.coreTargetOpacity = this.hoverConfig.normalHalo.core;
      }
    }
  }

  /**
   * Clear hover state for an object
   */
  private clearObjectHover(obj: THREE.Object3D): void {
    obj.userData.isPointerOver = false;
    if (!obj.userData.flashActive) {
      obj.userData.hoverStartTime = 0;
    }
    if (obj.userData.hasHaloLayers) {
      obj.userData.auroraTargetOpacity = 0;
      obj.userData.ringTargetOpacity = 0;
      obj.userData.coreTargetOpacity = 0;
    }
  }

  /**
   * Clear currently hovered object
   */
  clearHoveredObject(): void {
    if (this.hoveredObject) {
      this.clearObjectHover(this.hoveredObject);
      document.body.style.cursor = "default";
      this.hoveredObject = null;
    }
  }

  /**
   * Get currently hovered object
   */
  getHoveredObject(): THREE.Object3D | null {
    return this.hoveredObject;
  }

  /**
   * Handle click detection
   */
  handleClick(
    camera: THREE.Camera,
    clickableObjects: THREE.Object3D[],
  ): ClickResult {
    this.raycaster.setFromCamera(this.pointer, camera);
    const intersects = this.raycaster.intersectObjects(clickableObjects, false);

    if (intersects.length === 0) {
      return { hit: false };
    }

    const hit = intersects.find(
      (h) => h.object.userData.sectionIndex !== undefined,
    );

    if (hit && hit.object.userData.sectionIndex !== undefined) {
      return {
        hit: true,
        object: hit.object,
        point: hit.point,
        sectionIndex: hit.object.userData.sectionIndex,
        planetName: hit.object.userData.planetName,
        isMoon: hit.object.userData.isMoon === true,
        company: hit.object.userData.company,
      };
    }

    return { hit: false };
  }

  /**
   * Check for overlay clicks
   */
  checkOverlayClick(
    camera: THREE.Camera,
    overlayObjects: THREE.Object3D[],
  ): boolean {
    this.raycaster.setFromCamera(this.pointer, camera);
    const overlayHits = this.raycaster.intersectObjects(
      overlayObjects.filter((o) => !o.userData.isOverlay),
      false,
    );
    return overlayHits.length > 0;
  }

  /**
   * Cast ray and get all intersections
   */
  raycast(
    camera: THREE.Camera,
    objects: THREE.Object3D[],
    recursive: boolean = false,
  ): THREE.Intersection[] {
    this.raycaster.setFromCamera(this.pointer, camera);
    return this.raycaster.intersectObjects(objects, recursive);
  }

  /**
   * Get raycaster instance
   */
  getRaycaster(): THREE.Raycaster {
    return this.raycaster;
  }

  /**
   * Reset all interaction state
   */
  reset(): void {
    this.clearHoveredObject();
    this.pointer.set(0, 0);
  }
}
