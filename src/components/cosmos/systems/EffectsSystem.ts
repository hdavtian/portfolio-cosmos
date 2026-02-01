/**
 * Effects System - Manages visual effects (halos, flash animations, overlays)
 * Extracted from ResumeSpace3D.tsx
 */

import * as THREE from "three";
import type { OrbitalItem } from "../types";

export interface HaloAnimationConfig {
  auroraOpacity: number;
  ringOpacity: number;
  coreOpacity: number;
  speedVariance?: number;
}

/**
 * Manages visual effects for celestial bodies
 */
export class EffectsSystem {
  private time: number = 0;

  /**
   * Update time-based animations
   */
  updateTime(delta: number): void {
    this.time += delta;
  }

  /**
   * Get current time in seconds
   */
  getTime(): number {
    return this.time;
  }

  /**
   * Animate halo layers for an item
   */
  animateHalo(item: OrbitalItem, _camera: THREE.Camera): void {
    if (!item.mesh.userData.hasHaloLayers) {
      return;
    }

    const aurora = item.mesh.userData.auroraSprite as THREE.Sprite;
    const ring = item.mesh.userData.ringSprite as THREE.Sprite;
    const core = item.mesh.userData.coreSprite as THREE.Sprite;

    if (!aurora || !ring || !core) {
      return;
    }

    const aMat = aurora.material as THREE.SpriteMaterial;
    const rMat = ring.material as THREE.SpriteMaterial;
    const cMat = core.material as THREE.SpriteMaterial;

    const targetAurora = item.mesh.userData.auroraTargetOpacity || 0;
    const targetRing = item.mesh.userData.ringTargetOpacity || 0;
    const targetCore = item.mesh.userData.coreTargetOpacity || 0;
    const haloSpeed = item.mesh.userData.haloSpeedVariance || 1;

    // Smoothly lerp opacities toward targets
    aMat.opacity += (targetAurora - aMat.opacity) * 0.08;
    rMat.opacity += (targetRing - rMat.opacity) * 0.08;
    cMat.opacity += (targetCore - cMat.opacity) * 0.12;

    // Visibility toggles
    aurora.visible = aMat.opacity > 0.005;
    ring.visible = rMat.opacity > 0.005;
    core.visible = cMat.opacity > 0.005;

    // Rotate aurora and ring for subtle motion
    aMat.rotation = (this.time * 0.06 * haloSpeed) % (Math.PI * 2);
    rMat.rotation = (-this.time * 0.12 * haloSpeed) % (Math.PI * 2);

    // Pulsing core scale
    const baseCoreScale = (core.scale.x + core.scale.y) / 2 || 1;
    const pulse = 1 + Math.sin(this.time * 2.0 * haloSpeed) * 0.06;
    core.scale.set(baseCoreScale * pulse, baseCoreScale * pulse, 1);
  }

  /**
   * Set halo visibility for an item
   */
  setHaloVisible(
    item: OrbitalItem,
    visible: boolean,
    config?: HaloAnimationConfig,
  ): void {
    if (!item.mesh.userData.hasHaloLayers) {
      return;
    }

    if (visible && config) {
      item.mesh.userData.auroraTargetOpacity = config.auroraOpacity;
      item.mesh.userData.ringTargetOpacity = config.ringOpacity;
      item.mesh.userData.coreTargetOpacity = config.coreOpacity;
      if (config.speedVariance !== undefined) {
        item.mesh.userData.haloSpeedVariance = config.speedVariance;
      }
    } else if (!visible) {
      item.mesh.userData.auroraTargetOpacity = 0;
      item.mesh.userData.ringTargetOpacity = 0;
      item.mesh.userData.coreTargetOpacity = 0;
    }
  }

  /**
   * Handle color flash effect on hover
   */
  updateFlashEffect(item: OrbitalItem): void {
    if (!item.mesh.userData.flashActive) {
      // Not in an active flash: ensure emissive is at original
      const material = item.mesh.material as THREE.MeshStandardMaterial;
      if (item.mesh.userData.originalEmissive) {
        material.emissive.copy(item.mesh.userData.originalEmissive);
      }
      return;
    }

    const flashDuration = 900; // ms for flash animation
    const elapsed = Date.now() - (item.mesh.userData.hoverStartTime || 0);
    const material = item.mesh.material as THREE.MeshStandardMaterial;

    if (elapsed < flashDuration) {
      const progress = elapsed / flashDuration;
      // stronger quick peak then faster decay
      let intensity;
      if (progress < 0.18) {
        intensity =
          (progress / 0.18) * (item.mesh.userData.flashStrength || 0.8);
      } else {
        intensity =
          (item.mesh.userData.flashStrength || 0.8) *
          Math.max(0, 1 - (progress - 0.18) / 0.82);
      }

      // Color skew toward cyan/blue but modulated by intensity
      const r = 0.2 * intensity;
      const g = 0.35 * intensity;
      const b = 0.6 * intensity;
      material.emissive.setRGB(r, g, b);
    } else {
      // Flash complete: ensure emissive resets and mark inactive
      if (item.mesh.userData.originalEmissive) {
        material.emissive.copy(item.mesh.userData.originalEmissive);
      }
      item.mesh.userData.flashActive = false;
      item.mesh.userData.hoverStartTime = 0;
      item.mesh.userData.lastFlashAt = Date.now();
    }
  }

  /**
   * Trigger flash effect on an item
   */
  triggerFlash(item: OrbitalItem, strength: number = 0.8): void {
    const now = Date.now();
    const flashCooldown = 1200; // ms cooldown between flashes
    const lastFlash = item.mesh.userData.lastFlashAt || 0;

    if (now - lastFlash < flashCooldown) {
      return; // Still in cooldown
    }

    // Store original emissive color if not already stored
    if (!item.mesh.userData.originalEmissive) {
      const material = item.mesh.material as THREE.MeshStandardMaterial;
      item.mesh.userData.originalEmissive = material.emissive.clone();
    }

    item.mesh.userData.flashActive = true;
    item.mesh.userData.hoverStartTime = now;
    item.mesh.userData.flashStrength = strength;
  }

  /**
   * Orient overlay panel to face camera (billboard effect, but keep upright)
   */
  orientOverlayToCamera(item: OrbitalItem, camera: THREE.Camera): void {
    const panel = item.mesh.userData.detailOverlay as THREE.Mesh;
    if (!panel) {
      return;
    }

    // Get world positions
    const panelWorldPos = new THREE.Vector3();
    panel.getWorldPosition(panelWorldPos);
    const camPos = camera.position.clone();

    // Compute vector from panel to camera, project to XZ plane to keep upright
    const dir = camPos.sub(panelWorldPos);
    dir.y = 0; // zero out vertical component
    const angle = Math.atan2(dir.x, dir.z);

    // Apply rotation around Y so panel faces camera horizontally
    panel.rotation.y = angle;
    panel.rotation.x = 0;
    panel.rotation.z = 0;
  }

  /**
   * Update all effects for registered items
   */
  updateAll(items: OrbitalItem[], camera: THREE.Camera): void {
    items.forEach((item) => {
      this.updateFlashEffect(item);
      this.animateHalo(item, camera);

      if (item.mesh.userData.detailOverlay) {
        this.orientOverlayToCamera(item, camera);
      }
    });
  }
}
