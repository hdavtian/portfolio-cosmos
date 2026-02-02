import type { MutableRefObject } from "react";
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import {
  updateOrbit,
  type OrbitAnchor,
  type OrbitItem,
} from "../ResumeSpace3D.orbital";
import { easeOutCubic } from "../ResumeSpace3D.helpers";

export const useOrbitSystem = (params: {
  sceneRef: MutableRefObject<{ camera?: THREE.Camera }>;
  focusedMoonRef: MutableRefObject<THREE.Mesh | null>;
  spaceshipRef: MutableRefObject<THREE.Group | null>;
  vlog: (message: string) => void;
}) => {
  const { sceneRef, focusedMoonRef, spaceshipRef, vlog } = params;

  const updateOrbitSystem = (args: {
    items: OrbitItem[];
    orbitAnchors: OrbitAnchor[];
    camera: THREE.Camera;
    options: {
      spaceOrbitSpeed?: number;
      spaceMoonOrbitSpeed?: number;
      spaceMoonSpinSpeed?: number;
    };
  }) => {
    const { items, orbitAnchors, camera, options } = args;

    const time = Date.now() * 0.001;

    items.forEach((item) => {
      if (item.mesh.userData.flashActive) {
        const flashDuration = 900;
        const elapsed = Date.now() - (item.mesh.userData.hoverStartTime || 0);
        const material = item.mesh.material as THREE.MeshStandardMaterial;

        if (elapsed < flashDuration) {
          const progress = elapsed / flashDuration;
          let intensity;
          if (progress < 0.18) {
            intensity =
              (progress / 0.18) * (item.mesh.userData.flashStrength || 0.8);
          } else {
            intensity =
              (item.mesh.userData.flashStrength || 0.8) *
              Math.max(0, 1 - (progress - 0.18) / 0.82);
          }

          const r = 0.2 * intensity;
          const g = 0.35 * intensity;
          const b = 0.6 * intensity;
          material.emissive.setRGB(r, g, b);
        } else {
          material.emissive.copy(item.mesh.userData.originalEmissive);
          item.mesh.userData.flashActive = false;
          item.mesh.userData.hoverStartTime = 0;
          item.mesh.userData.lastFlashAt = Date.now();
        }
      } else {
        const material = item.mesh.material as THREE.MeshStandardMaterial;
        material.emissive.copy(item.mesh.userData.originalEmissive);
      }

      if (item.mesh.userData.hasHaloLayers) {
        const aurora = item.mesh.userData.auroraSprite as THREE.Sprite;
        const ring = item.mesh.userData.ringSprite as THREE.Sprite;
        const core = item.mesh.userData.coreSprite as THREE.Sprite;
        const aMat = aurora.material as THREE.SpriteMaterial;
        const rMat = ring.material as THREE.SpriteMaterial;
        const cMat = core.material as THREE.SpriteMaterial;
        const targetAurora = item.mesh.userData.auroraTargetOpacity || 0;
        const targetRing = item.mesh.userData.ringTargetOpacity || 0;
        const targetCore = item.mesh.userData.coreTargetOpacity || 0;
        const haloSpeed = item.mesh.userData.haloSpeedVariance || 1;

        aMat.opacity += (targetAurora - aMat.opacity) * 0.08;
        rMat.opacity += (targetRing - rMat.opacity) * 0.08;
        cMat.opacity += (targetCore - cMat.opacity) * 0.12;

        aurora.visible = aMat.opacity > 0.005;
        ring.visible = rMat.opacity > 0.005;
        core.visible = cMat.opacity > 0.005;

        aMat.rotation = (time * 0.06 * haloSpeed) % (Math.PI * 2);
        rMat.rotation = (-time * 0.12 * haloSpeed) % (Math.PI * 2);

        const baseCoreScale = (core.scale.x + core.scale.y) / 2 || 1;
        const pulse = 1 + Math.sin(time * 2.0 * haloSpeed) * 0.06;
        core.scale.set(baseCoreScale * pulse, baseCoreScale * pulse, 1);
      }

      if (item.mesh.userData.detailOverlay) {
        const panel = item.mesh.userData.detailOverlay as THREE.Mesh;
        if (panel && sceneRef.current && sceneRef.current.camera) {
          const panelWorldPos = new THREE.Vector3();
          panel.getWorldPosition(panelWorldPos);
          const camPos = sceneRef.current.camera.position.clone();

          const dir = camPos.sub(panelWorldPos);
          dir.y = 0;
          const angle = Math.atan2(dir.x, dir.z);

          panel.rotation.y = angle;
          panel.rotation.x = 0;
          panel.rotation.z = 0;
        }
      }

      const multi = item.mesh.userData.detailOverlays as
        | THREE.Mesh[]
        | undefined;
      if (
        multi &&
        multi.length &&
        sceneRef.current &&
        sceneRef.current.camera
      ) {
        const camPos = sceneRef.current.camera.position;
        const baseWorld = new THREE.Vector3();
        const size =
          ((item.mesh.geometry as any)?.parameters?.radius as number) || 5;
        const dt = 1 / 60;
        multi.forEach((ov, ovIdx) => {
          if (ov.userData?.isTitleOverlay) {
            item.mesh.getWorldPosition(baseWorld);
            const titleOffset =
              (ov.userData.titleOffset as number) || size * 0.03;
            ov.position.set(
              baseWorld.x,
              baseWorld.y + size + titleOffset,
              baseWorld.z,
            );
            const dirT = new THREE.Vector3().subVectors(camPos, ov.position);
            dirT.y = 0;
            ov.rotation.set(0, Math.atan2(dirT.x, dirT.z), 0);
            return;
          }

          const isBullet = ov.userData?.isBulletOverlay;
          if (isBullet) {
            item.mesh.getWorldPosition(baseWorld);

            const titleMesh = item.mesh.userData?.titleOverlay as
              | THREE.Mesh
              | undefined;
            const titlePos = new THREE.Vector3();
            if (titleMesh) {
              titleMesh.getWorldPosition(titlePos);
            } else {
              titlePos.set(
                baseWorld.x,
                baseWorld.y + size + size * 0.03,
                baseWorld.z,
              );
            }

            const planeH = ov.userData?.planeHeight ?? size * 0.35;
            const planeW = ov.userData?.planeWidth ?? planeH * 2;
            const index = ov.userData?.bulletIndex ?? 0;
            const spacing = planeH * 0.45;

            const titleWidth =
              (titleMesh && titleMesh.userData?.planeWidth) || size * 1.2;
            const titleLeft = titlePos.x - titleWidth * 0.5;
            const inset = Math.min(planeW * 0.15, titleWidth * 0.05);
            const bulletTargetX = titleLeft + planeW * 0.5 + inset;

            const targetPos = new THREE.Vector3(
              bulletTargetX,
              titlePos.y - planeH * 0.6 - index * spacing,
              titlePos.z,
            );

            const sp = ov.userData?.slideProgress ?? 0;
            const active =
              !!item.mesh.userData.pauseOrbit ||
              focusedMoonRef.current === item.mesh;
            const slideRate = 3.0;
            const nextSp = active
              ? Math.min(1, sp + slideRate * dt)
              : Math.max(0, sp - slideRate * dt);
            ov.userData.slideProgress = nextSp;
            const t = easeOutCubic(nextSp);

            const startOffset = (titleWidth || planeW) * 0.9;
            const sd = ov.userData?.slideDir ?? 1;
            const startPos = new THREE.Vector3(
              targetPos.x + sd * startOffset,
              targetPos.y,
              targetPos.z,
            );
            ov.position.lerpVectors(startPos, targetPos, t);

            const dirT = new THREE.Vector3().subVectors(camPos, ov.position);
            dirT.y = 0;
            ov.rotation.set(0, Math.atan2(dirT.x, dirT.z), 0);

            ov.visible = nextSp > 0.01;

            try {
              const pname = item.mesh.userData?.planetName as
                | string
                | undefined;
              if (pname && pname.toLowerCase().includes("investcloud")) {
                vlog(
                  `INVESTCLOUD_OVERLAY_BULLET ${ovIdx} ${JSON.stringify({
                    index,
                    slide: nextSp,
                    pos: ov.position.clone().toArray(),
                    target: targetPos.toArray(),
                  })}`,
                );
              }
            } catch (e) {
              // ignore
            }
          } else {
            ov.rotation.x = 0;
            ov.rotation.z = 0;
            const dirT = new THREE.Vector3().subVectors(camPos, ov.position);
            dirT.y = 0;
            ov.rotation.y = Math.atan2(dirT.x, dirT.z);
          }
        });
      }
    });

    updateOrbit({
      items,
      orbitAnchors,
      options,
      focusedMoon: focusedMoonRef.current,
    });

    const raycaster = new THREE.Raycaster();
    raycaster.camera = camera;
    const cameraDirection = new THREE.Vector3();

    items.forEach((item) => {
      if (!item.mesh || !item.mesh.matrixWorld) return;

      const label = item.mesh.children.find(
        (child) => child instanceof CSS2DObject,
      ) as CSS2DObject | undefined;

      if (label) {
        try {
          const labelPos = new THREE.Vector3();
          label.getWorldPosition(labelPos);

          cameraDirection.copy(labelPos).sub(camera.position).normalize();
          raycaster.set(camera.position, cameraDirection);
          const distanceToLabel = camera.position.distanceTo(labelPos);

          let isOccluded = false;

          for (const otherItem of items) {
            if (
              otherItem !== item &&
              otherItem.mesh &&
              otherItem.mesh.matrixWorld
            ) {
              const intersects = raycaster.intersectObject(
                otherItem.mesh,
                false,
              );
              if (
                intersects.length > 0 &&
                intersects[0].distance < distanceToLabel - 5
              ) {
                isOccluded = true;
                break;
              }
            }
          }

          if (
            !isOccluded &&
            spaceshipRef.current &&
            spaceshipRef.current.matrixWorld
          ) {
            const intersects = raycaster.intersectObject(
              spaceshipRef.current,
              false,
            );
            if (
              intersects.length > 0 &&
              intersects[0].distance < distanceToLabel - 5
            ) {
              isOccluded = true;
            }
          }

          if (label.element) {
            label.element.style.transition = "opacity 0.2s ease-in-out";
            label.element.style.opacity = isOccluded ? "0" : "1";
          }
        } catch (error) {
          // ignore
        }
      }
    });
  };

  return { updateOrbitSystem };
};
