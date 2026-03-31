import type React from "react";
import * as THREE from "three";

export const createFocusedMoonRotationHandlers = (deps: {
  mountRef: React.RefObject<HTMLDivElement | null>;
  focusedMoonRef: React.MutableRefObject<THREE.Mesh | null>;
  isDraggingRef: React.MutableRefObject<boolean>;
  lastPointerRef: React.MutableRefObject<{
    x: number;
    y: number;
    t: number;
  } | null>;
  sceneRef: React.MutableRefObject<{
    controls?: { enabled: boolean } | undefined;
  }>;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  camera: THREE.Camera;
  orbitActiveRef?: React.MutableRefObject<boolean>;
}) => {
  const {
    mountRef,
    focusedMoonRef,
    isDraggingRef,
    lastPointerRef,
    sceneRef,
    raycaster,
    pointer,
    camera,
    orbitActiveRef,
  } = deps;

  const onPointerDownRotate = (event: PointerEvent) => {
    // During orbit, don't intercept drags for moon rotation — let camera-controls handle them
    if (orbitActiveRef?.current) return;
    if (!mountRef.current || !focusedMoonRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const py = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointer.x = px;
    pointer.y = py;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(focusedMoonRef.current, true);
    if (intersects.length > 0) {
      isDraggingRef.current = true;
      lastPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
        t: Date.now(),
      };
      if (sceneRef.current && sceneRef.current.controls) {
        sceneRef.current.controls.enabled = false;
      }
    }
  };

  const onPointerMoveRotate = (event: PointerEvent) => {
    if (
      !isDraggingRef.current ||
      !focusedMoonRef.current ||
      !lastPointerRef.current
    )
      return;
    const now = Date.now();
    const dt = Math.max((now - lastPointerRef.current.t) / 1000, 1 / 120);
    const dx = event.clientX - lastPointerRef.current.x;
    const dy = event.clientY - lastPointerRef.current.y;

    // Map drag delta to rotation deltas
    const rotY = dx * 0.008; // horizontal drag -> rotate around Y
    const rotX = dy * 0.008; // vertical drag -> rotate around X
    focusedMoonRef.current.rotation.y += rotY;
    focusedMoonRef.current.rotation.x += rotX;

    // Compute spin velocity to continue after release (inverse mapping)
    const vx = rotX / dt;
    const vy = rotY / dt;
    focusedMoonRef.current.userData.spinVelocity = new THREE.Vector3(
      vx * 0.15,
      vy * 0.15,
      0,
    );

    lastPointerRef.current = { x: event.clientX, y: event.clientY, t: now };
  };

  const onPointerUpRotate = (_event: PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      if (sceneRef.current && sceneRef.current.controls) {
        sceneRef.current.controls.enabled = true;
      }
    }
  };

  return { onPointerDownRotate, onPointerMoveRotate, onPointerUpRotate };
};

export const createPointerInteractionHandlers = (deps: {
  mountRef: React.RefObject<HTMLDivElement | null>;
  camera: THREE.Camera;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  clickablePlanets: THREE.Object3D[];
  overlayClickables: THREE.Object3D[];
  handleNavigation: (target: string) => void | Promise<void>;
  resumeData: any;
  exitFocusedMoon: () => void;
  vlog: (message: string) => void;
  /** Optional: ref to the Star Destroyer group for click/hover detection */
  starDestroyerRef?: React.MutableRefObject<THREE.Group | null>;
  /** Callback when the Star Destroyer is clicked */
  onStarDestroyerClick?: () => void;
  insideShipRef?: React.MutableRefObject<boolean>;
  /** When true, overlay-exit and same-moon clicks are suppressed */
  orbitActiveRef?: React.MutableRefObject<boolean>;
  /** Currently focused moon while orbiting, if any */
  focusedMoonRef?: React.MutableRefObject<THREE.Mesh | null>;
  /** Optional 3D hologram panels that can be clicked */
  getHologramPanelClickables?: () => THREE.Object3D[];
  /** Callback when a hologram panel was picked */
  onHologramPanelPicked?: (panelIndex: number) => void;
  /** Callback when hovering hologram controls */
  onHologramPanelHover?: (panelIndex: number | null) => void;
  /** Callback when clicking empty space while hologram panels are active */
  onHologramEmptyClick?: () => void;
}) => {
  const {
    mountRef,
    camera,
    raycaster,
    pointer,
    clickablePlanets,
    overlayClickables,
    handleNavigation,
    resumeData,
    exitFocusedMoon,
    vlog,
    starDestroyerRef,
    onStarDestroyerClick,
    insideShipRef,
    orbitActiveRef,
    focusedMoonRef,
    getHologramPanelClickables,
    onHologramPanelPicked,
    onHologramPanelHover,
    onHologramEmptyClick,
  } = deps;

  let hoveredObject: THREE.Object3D | null = null;
  let hoveredHologramPanelIndex: number | null = null;

  const setHologramHover = (index: number | null) => {
    if (index !== hoveredHologramPanelIndex) {
      hoveredHologramPanelIndex = index;
      onHologramPanelHover?.(index);
    }
  };

  const onPointerMove = (event: MouseEvent) => {
    // Interior mode: ship hull blocks all external object hover interactions.
    if (insideShipRef?.current) {
      document.body.style.cursor = "default";
      setHologramHover(null);
      return;
    }
    if (!mountRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Check for hover
    raycaster.setFromCamera(pointer, camera);

    // Prioritize hologram badges/panels so hover does not bounce to planet hits
    // behind the screen-space HUD elements.
    const hologramPanelPickables = getHologramPanelClickables?.() ?? [];
    if (hologramPanelPickables.length > 0) {
      const hologramHits = raycaster.intersectObjects(hologramPanelPickables, false);
      if (hologramHits.length > 0) {
        if (hoveredObject) {
          const prev = hoveredObject;
          prev.userData.isPointerOver = false;
          if (!prev.userData.flashActive) prev.userData.hoverStartTime = 0;
          if (prev.userData.hasHaloLayers) {
            prev.userData.auroraTargetOpacity = 0;
            prev.userData.ringTargetOpacity = 0;
            prev.userData.coreTargetOpacity = 0;
          }
          hoveredObject = null;
        }
        const code = Number(
          (hologramHits[0].object.userData as { hologramPanelIndex?: number })
            .hologramPanelIndex,
        );
        setHologramHover(Number.isFinite(code) ? code : null);
        document.body.style.cursor = "pointer";
        return;
      }
    }

    const intersects = raycaster.intersectObjects(clickablePlanets, false);

    // Determine the object under pointer (if any)
    const hit = intersects.find(
      (h) => h.object.userData.sectionIndex !== undefined,
    );

    const now = Date.now();

    // If we hit a valid planet
    if (hit && hit.object.userData.sectionIndex !== undefined) {
      setHologramHover(null);
      const obj = hit.object;

      // If focused/paused, don't activate hover halo
      if (obj.userData.pauseOrbit) {
        // Ensure we clear any previous hover state if pointer moved from another object
        if (hoveredObject && hoveredObject !== obj) {
          const prev = hoveredObject;
          prev.userData.isPointerOver = false;
          if (!prev.userData.flashActive) prev.userData.hoverStartTime = 0;
          if (prev.userData.hasHaloLayers) {
            prev.userData.auroraTargetOpacity = 0;
            prev.userData.ringTargetOpacity = 0;
            prev.userData.coreTargetOpacity = 0;
          }
          document.body.style.cursor = "default";
          hoveredObject = null;
        }
      } else {
        // If pointer moved from another object, clear previous
        if (hoveredObject && hoveredObject !== obj) {
          const prev = hoveredObject;
          prev.userData.isPointerOver = false;
          if (!prev.userData.flashActive) prev.userData.hoverStartTime = 0;
          if (prev.userData.hasHaloLayers) {
            prev.userData.auroraTargetOpacity = 0;
            prev.userData.ringTargetOpacity = 0;
            prev.userData.coreTargetOpacity = 0;
          }
        }

        hoveredObject = obj;

        // Detect enter transition (distinct hover)
        const becameOver = !obj.userData.isPointerOver;
        obj.userData.isPointerOver = true;

        if (becameOver) {
          // Increment the hover count (counts distinct enter events)
          obj.userData.hoverCount = (obj.userData.hoverCount || 0) + 1;
          const superEvery = obj.userData.superEvery || 4;
          const lastSuper = obj.userData.lastSuperFlashAt || 0;
          const superCooldown = 2000; // ms minimum between super flashes

          // Decide whether this enter should be a 'super' flash (every N hovers)
          const shouldSuper =
            obj.userData.hoverCount % superEvery === 0 &&
            now - lastSuper > superCooldown;

          if (shouldSuper) {
            // Super flash
            obj.userData.hoverStartTime = now;
            obj.userData.flashActive = true;
            obj.userData.flashStrength = 0.6 + Math.random() * 1.0; // strong
            obj.userData.lastFlashAt = now;
            obj.userData.lastSuperFlashAt = now;

            if (obj.userData.hasHaloLayers) {
              obj.userData.auroraTargetOpacity = 0.6;
              obj.userData.ringTargetOpacity = 0.4;
              obj.userData.coreTargetOpacity = 1.0;
            }
          } else {
            // Small/subtle emission that still sends light out
            obj.userData.hoverStartTime = now;
            obj.userData.flashActive = true;
            obj.userData.flashStrength = 0.12 + Math.random() * 0.12; // small
            obj.userData.lastFlashAt = now;

            if (obj.userData.hasHaloLayers) {
              obj.userData.auroraTargetOpacity = 0.18;
              obj.userData.ringTargetOpacity = 0.12;
              obj.userData.coreTargetOpacity = 0.22;
            }
          }

          document.body.style.cursor = "pointer";
        }
      }
    } else {
      // No hit: clear previous hovered object if any
      if (hoveredObject) {
        const prev = hoveredObject;
        prev.userData.isPointerOver = false;
        if (!prev.userData.flashActive) prev.userData.hoverStartTime = 0;
        if (prev.userData.hasHaloLayers) {
          prev.userData.auroraTargetOpacity = 0;
          prev.userData.ringTargetOpacity = 0;
          prev.userData.coreTargetOpacity = 0;
        }
        hoveredObject = null;
      }

      // Check Star Destroyer hover (pointer cursor when over it)
      if (starDestroyerRef?.current) {
        const sdHits = raycaster.intersectObject(
          starDestroyerRef.current,
          true,
        );
        if (sdHits.length > 0) {
          document.body.style.cursor = "pointer";
          return;
        }
      }

      setHologramHover(null);
      document.body.style.cursor = "default";
    }
  };

  const onClick = (event: MouseEvent) => {
    // Interior mode: ship hull blocks all external object clicks.
    if (insideShipRef?.current) return;

    // Don't process clicks on UI elements (buttons, sliders, etc.)
    // Only raycast when the click lands on the 3D canvas itself.
    if (mountRef.current && !mountRef.current.contains(event.target as Node)) {
      return;
    }

    // Update pointer from the actual click position to avoid stale coords
    if (mountRef.current) {
      const rect = mountRef.current.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    raycaster.setFromCamera(pointer, camera);

    const hologramPanelPickables = getHologramPanelClickables?.() ?? [];
    if (hologramPanelPickables.length > 0) {
      const hologramHits = raycaster.intersectObjects(hologramPanelPickables, false);
      if (hologramHits.length > 0) {
        const firstHit = hologramHits[0];
        const panelIndex = Number(
          (firstHit.object.userData as { hologramPanelIndex?: number })
            .hologramPanelIndex,
        );
        if (Number.isFinite(panelIndex)) {
          onHologramPanelPicked?.(panelIndex);
          return;
        }
      }
    }

    // First, check for overlay clicks (exit focused moon)
    // Skip during orbit — clicking the moon should not exit focus.
    if (!orbitActiveRef?.current) {
      const overlayHits = raycaster.intersectObjects(
        overlayClickables.filter((o) => !o.userData.isOverlay),
        false,
      );
      if (overlayHits.length > 0) {
        exitFocusedMoon();
        return;
      }
    }

    // Check Star Destroyer click (recursive — GLTF model has nested meshes)
    if (starDestroyerRef?.current && onStarDestroyerClick) {
      const sdHits = raycaster.intersectObject(
        starDestroyerRef.current,
        true,
      );
      if (sdHits.length > 0) {
        vlog("🔺 Star Destroyer clicked — initiating escort");
        exitFocusedMoon();          // leave moon view if active
        onStarDestroyerClick();
        return;
      }
    }

    onHologramEmptyClick?.();

    const intersects = raycaster.intersectObjects(clickablePlanets, false);

    if (intersects.length > 0) {
      // Find first object with userData.sectionIndex
      const hit = intersects.find(
        (hit) => hit.object.userData.sectionIndex !== undefined,
      );
      if (hit && hit.object.userData.sectionIndex !== undefined) {
        // While orbiting, clicking the currently focused moon should be a no-op.
        if (orbitActiveRef?.current && focusedMoonRef?.current) {
          const normalizeId = (value: unknown) =>
            String(value ?? "")
              .toLowerCase()
              .trim()
              .replace(/\s+/g, "-");
          const focused = focusedMoonRef.current;
          const focusedId = normalizeId(
            focused.userData?.moonId ||
              focused.userData?.systemId ||
              focused.userData?.planetName,
          );
          const clickedId = normalizeId(
            hit.object.userData?.moonId ||
              hit.object.userData?.systemId ||
              hit.object.userData?.planetName,
          );
          if (hit.object === focused || (focusedId && focusedId === clickedId)) {
            return;
          }
        }

        const planetName = hit.object.userData.planetName;

        // Main planets: Fly to them using handleNavigation (same as quick nav)
        if (
          planetName === "Experience" ||
          planetName === "Skills" ||
          planetName === "Projects" ||
          planetName === "Portfolio"
        ) {
          const pname = planetName.toLowerCase();
          const target =
            pname === "experience"
              ? "experience"
              : pname === "skills"
                ? "skills"
                : pname === "portfolio"
                  ? "portfolio"
                  : "projects";

          vlog(`🌍 Planet clicked: ${planetName}, flying to ${target}`);
          handleNavigation(target);
          return;
        }

        // Special handling for job moons - show cosmic overlay
        const jobData = resumeData.experience.find(
          (job: any) => job.company === planetName,
        );
        if (jobData) {
          // Trigger the same travel + focus behavior as navigator clicks
          try {
            const cid =
              (jobData as any).id ||
              (jobData.company || "").toLowerCase().replace(/\s+/g, "-");
            // fire-and-forget: start the camera travel and moon focus
            handleNavigation(`experience-${cid}`);
          } catch (e) {
            // ignore if function not yet defined
          }
        }
      }
    }
  };

  return { onPointerMove, onClick };
};
