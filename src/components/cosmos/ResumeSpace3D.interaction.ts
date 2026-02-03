import type React from "react";
import * as THREE from "three";
import type { OverlayContent } from "../CosmicContentOverlay";

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
  } = deps;

  const onPointerDownRotate = (event: PointerEvent) => {
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
  handleExperienceCompanyNavigation: (
    companyId: string,
  ) => void | Promise<void>;
  resumeData: any;
  setContentLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setOverlayContent: React.Dispatch<
    React.SetStateAction<OverlayContent | null>
  >;
  exitFocusedMoon: () => void;
  vlog: (message: string) => void;
}) => {
  const {
    mountRef,
    camera,
    raycaster,
    pointer,
    clickablePlanets,
    overlayClickables,
    handleNavigation,
    handleExperienceCompanyNavigation,
    resumeData,
    setContentLoading,
    setOverlayContent,
    exitFocusedMoon,
    vlog,
  } = deps;

  let hoveredObject: THREE.Object3D | null = null;

  const onPointerMove = (event: MouseEvent) => {
    if (!mountRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Check for hover
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(clickablePlanets, false);

    // Determine the object under pointer (if any)
    const hit = intersects.find(
      (h) => h.object.userData.sectionIndex !== undefined,
    );

    const now = Date.now();

    // If we hit a valid planet
    if (hit && hit.object.userData.sectionIndex !== undefined) {
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
        document.body.style.cursor = "default";
        hoveredObject = null;
      }
    }
  };

  const onClick = (event: MouseEvent) => {
    // Update pointer from the actual click position to avoid stale coords
    if (mountRef.current) {
      const rect = mountRef.current.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    }

    raycaster.setFromCamera(pointer, camera);

    // First, check for overlay clicks (exit focused moon)
    // Filter out objects marked as overlays since they should not block interaction
    const overlayHits = raycaster.intersectObjects(
      overlayClickables.filter((o) => !o.userData.isOverlay),
      false,
    );
    if (overlayHits.length > 0) {
      // Exit focused moon view when overlay is clicked
      exitFocusedMoon();
      return;
    }

    // Clicking empty space should not exit moon focus — only overlay clicks or navigation/zoom do.
    const intersects = raycaster.intersectObjects(clickablePlanets, false);

    if (intersects.length > 0) {
      // Find first object with userData.sectionIndex
      const hit = intersects.find(
        (hit) => hit.object.userData.sectionIndex !== undefined,
      );
      if (hit && hit.object.userData.sectionIndex !== undefined) {
        const planetName = hit.object.userData.planetName;

        // Main planets: Fly to them using handleNavigation (same as quick nav)
        if (
          planetName === "Experience" ||
          planetName === "Skills" ||
          planetName === "Projects"
        ) {
          const pname = planetName.toLowerCase();
          const target =
            pname === "experience"
              ? "experience"
              : pname === "skills"
                ? "skills"
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
          setContentLoading(true);

          // Trigger the same travel + focus behavior as navigator clicks
          try {
            const cid =
              (jobData as any).id ||
              (jobData.company || "").toLowerCase().replace(/\s+/g, "-");
            // fire-and-forget: start the camera travel and moon focus
            // handleExperienceCompanyNavigation is defined later in this scope
            // but it's safe to call here because this handler runs on user interaction later.
            (handleExperienceCompanyNavigation as any)?.(cid);
          } catch (e) {
            // ignore if function not yet defined
          }

          // Build comprehensive job content sections
          const sections: any[] = [];

          // Add each position as a section
          jobData.positions?.forEach((position: any, idx: number) => {
            const posWithDates = position as any;
            sections.push({
              id: `position-${idx}`,
              title: position.title,
              content: position.responsibilities.join("\n\n• "),
              type: "text",
              data: {
                startDate: posWithDates.startDate,
                endDate: posWithDates.endDate,
              },
            });
          });

          const jobContent: OverlayContent = {
            title: jobData.company,
            subtitle: `${jobData.startDate} - ${jobData.endDate || "Present"} • ${jobData.location}`,
            description:
              jobData.positions?.[0]?.responsibilities[0] ||
              `Professional experience at ${jobData.company}.`,
            sections,
            actions: [
              {
                label: "View Career Journey",
                action: "tour:career-journey",
                icon: "📈",
              },
            ],
          };

          // Simulate loading delay for smooth animation
          setTimeout(() => {
            setOverlayContent(jobContent);
            setContentLoading(false);
          }, 300);
        }
      }
    }
  };

  return { onPointerMove, onClick };
};
