import type { MutableRefObject } from "react";
import * as THREE from "three";
import {
  updateOrbit,
  type OrbitAnchor,
  type OrbitItem,
} from "../ResumeSpace3D.orbital";
import { easeOutCubic } from "../ResumeSpace3D.helpers";

// ─── Reusable temps (module-level, avoids per-frame GC) ────────────────────
const _raycaster = new THREE.Raycaster();
const _panelWorldPos = new THREE.Vector3();
const _baseWorld = new THREE.Vector3();
const _dirT = new THREE.Vector3();
const _titlePos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _startPos = new THREE.Vector3();
const _ovPos = new THREE.Vector3();
const _ovDir = new THREE.Vector3();

export const useOrbitSystem = (params: {
  sceneRef: MutableRefObject<{ camera?: THREE.Camera }>;
  focusedMoonRef: MutableRefObject<THREE.Mesh | null>;
  spaceshipRef: MutableRefObject<THREE.Group | null>;
  starDestroyerRef: MutableRefObject<THREE.Group | null>;
  insideShipRef: MutableRefObject<boolean>;
  vlog: (message: string) => void;
}) => {
  // Label visibility (occlusion, moon-name decluttering) lives in
  // labelVisibility.ts; this hook only animates orbits and overlays.
  const { sceneRef, focusedMoonRef, starDestroyerRef, vlog } = params;

  const updateOrbitSystem = (args: {
    items: OrbitItem[];
    orbitAnchors: OrbitAnchor[];
    camera: THREE.Camera;
    options: {
      spaceOrbitSpeed?: number;
      spaceMoonOrbitSpeed?: number;
      spaceMoonSpinSpeed?: number;
    };
    occlusionFrame?: number;
    occlusionCadence?: number;
    skipOcclusion?: boolean;
  }) => {
    const { items, orbitAnchors, camera, options } = args;
    const occlusionCadence = args.occlusionCadence ?? 1;
    const runOcclusion = !args.skipOcclusion && (args.occlusionFrame ?? 0) % occlusionCadence === 0;

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
          panel.getWorldPosition(_panelWorldPos);
          _dirT.copy(sceneRef.current.camera.position).sub(_panelWorldPos);
          _dirT.y = 0;

          panel.rotation.y = Math.atan2(_dirT.x, _dirT.z);
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
        const size =
          ((item.mesh.geometry as any)?.parameters?.radius as number) || 5;
        const dt = 1 / 60;
        multi.forEach((ov, ovIdx) => {
          if (ov.userData?.isTitleOverlay) {
            item.mesh.getWorldPosition(_baseWorld);
            const titleOffset =
              (ov.userData.titleOffset as number) || size * 0.03;
            ov.position.set(
              _baseWorld.x,
              _baseWorld.y + size + titleOffset,
              _baseWorld.z,
            );
            _dirT.subVectors(camPos, ov.position);
            _dirT.y = 0;
            ov.rotation.set(0, Math.atan2(_dirT.x, _dirT.z), 0);
            return;
          }

          const isBullet = ov.userData?.isBulletOverlay;
          if (isBullet) {
            item.mesh.getWorldPosition(_baseWorld);

            const titleMesh = item.mesh.userData?.titleOverlay as
              | THREE.Mesh
              | undefined;
            if (titleMesh) {
              titleMesh.getWorldPosition(_titlePos);
            } else {
              _titlePos.set(
                _baseWorld.x,
                _baseWorld.y + size + size * 0.03,
                _baseWorld.z,
              );
            }

            const planeH = ov.userData?.planeHeight ?? size * 0.35;
            const planeW = ov.userData?.planeWidth ?? planeH * 2;
            const index = ov.userData?.bulletIndex ?? 0;
            const spacing = planeH * 0.45;

            const titleWidth =
              (titleMesh && titleMesh.userData?.planeWidth) || size * 1.2;
            const titleLeft = _titlePos.x - titleWidth * 0.5;
            const inset = Math.min(planeW * 0.15, titleWidth * 0.05);
            const bulletTargetX = titleLeft + planeW * 0.5 + inset;

            _targetPos.set(
              bulletTargetX,
              _titlePos.y - planeH * 0.6 - index * spacing,
              _titlePos.z,
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
            _startPos.set(
              _targetPos.x + sd * startOffset,
              _targetPos.y,
              _targetPos.z,
            );
            ov.position.lerpVectors(_startPos, _targetPos, t);

            _dirT.subVectors(camPos, ov.position);
            _dirT.y = 0;
            ov.rotation.set(0, Math.atan2(_dirT.x, _dirT.z), 0);

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
                    target: _targetPos.toArray(),
                  })}`,
                );
              }
            } catch (e) {
              // ignore
            }
          } else {
            ov.rotation.x = 0;
            ov.rotation.z = 0;
            _dirT.subVectors(camPos, ov.position);
            _dirT.y = 0;
            ov.rotation.y = Math.atan2(_dirT.x, _dirT.z);
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

    _raycaster.camera = camera;

    // ── 3D overlay occlusion (title / bullet planes) ────────────
    // These meshes use depthTest:false so they render on top of
    // everything.  Raycast from the camera to each visible overlay;
    // if the Star Destroyer blocks the line of sight, fade it out.
    if (runOcclusion && !args.skipOcclusion && starDestroyerRef.current?.matrixWorld) {
      const sdGroup = starDestroyerRef.current;

      items.forEach((item) => {
        const overlays = item.mesh.userData.detailOverlays as
          | THREE.Mesh[]
          | undefined;
        if (!overlays?.length) return;

        overlays.forEach((ov) => {
          if (!ov.visible) return;

          ov.getWorldPosition(_ovPos);
          _ovDir.copy(_ovPos).sub(camera.position).normalize();
          _raycaster.set(camera.position, _ovDir);

          const distToOverlay = camera.position.distanceTo(_ovPos);
          const hits = _raycaster.intersectObject(sdGroup, true);

          const occluded =
            hits.length > 0 && hits[0].distance < distToOverlay - 5;

          // Smoothly fade via material opacity
          const mat = ov.material as THREE.MeshBasicMaterial;
          if (mat && mat.transparent) {
            const baseOpacity =
              (ov.userData.baseOpacity as number | undefined) ??
              mat.opacity;
            // Store the base opacity the first time so we can restore it
            if (ov.userData.baseOpacity === undefined) {
              ov.userData.baseOpacity = mat.opacity;
            }
            const targetOpacity = occluded ? 0 : baseOpacity;
            // Simple per-frame lerp toward target (acts as a fade)
            mat.opacity += (targetOpacity - mat.opacity) * 0.15;
          }
        });
      });
    }
  };

  return { updateOrbitSystem };
};
