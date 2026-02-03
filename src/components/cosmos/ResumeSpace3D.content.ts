import * as THREE from "three";
import type { OverlayContent } from "../CosmicContentOverlay";

export type OrbitItem = {
  mesh: THREE.Mesh;
  orbitSpeed: number;
  angle: number;
  distance: number;
  parent?: THREE.Object3D;
  detached?: boolean;
  originalParent?: THREE.Object3D;
  overlayMeshes?: THREE.Mesh[];
  overlayOffsets?: number[];
  overlayHeights?: number[];
};

export const createFinalizeFocusOnMoon = (deps: {
  scene: THREE.Scene;
  items: OrbitItem[];
  attachMultiNoteOverlays: (
    planetMesh: THREE.Mesh,
    overlayDefs: Array<
      string | { type?: string; text?: string; lines?: string[] }
    >,
    options?: { radiusOffset?: number; opacity?: number },
  ) => THREE.Mesh[];
  setContentLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setOverlayContent: React.Dispatch<
    React.SetStateAction<OverlayContent | null>
  >;
  vlog: (message: string) => void;
  sceneRef: React.MutableRefObject<{ camera?: THREE.Camera }>;
  focusedMoonRef: React.MutableRefObject<THREE.Mesh | null>;
  focusedMoonCameraDistanceRef: React.MutableRefObject<number | null>;
  onFocus?: () => void;
}) => {
  const {
    scene,
    items,
    attachMultiNoteOverlays,
    setContentLoading,
    setOverlayContent,
    vlog,
    sceneRef,
    focusedMoonRef,
    focusedMoonCameraDistanceRef,
    onFocus,
  } = deps;

  return (moonMesh: THREE.Mesh, company: any) => {
    try {
      onFocus?.();
      const moonWorldPos = new THREE.Vector3();
      moonMesh.getWorldPosition(moonWorldPos);

      const detailLines: string[] = [];
      detailLines.push(company.company.toUpperCase());
      const firstPos = company.positions?.[0];
      if (firstPos) {
        const fp: any = firstPos as any;
        detailLines.push(
          `${fp.title} (${fp.startDate || ""} - ${fp.endDate || "Present"})`,
        );
      }
      detailLines.push(company.location || "");

      const jobNotes = (company as any).notes || [];
      const overlayDefs: Array<
        string | { type?: string; text?: string; lines?: string[] }
      > = [];
      overlayDefs.push({ type: "title", lines: detailLines });
      if (Array.isArray(jobNotes) && jobNotes.length) {
        jobNotes.forEach((n: string) => overlayDefs.push(n));
      }

      // Prepare right-pane content
      const sections: any[] = [];
      company.positions?.forEach((position: any, idx: number) => {
        sections.push({
          id: `position-${idx}`,
          title: position.title,
          content: (position.responsibilities || []).join("\n\n• "),
          type: "text",
          data: {
            startDate: position.startDate,
            endDate: position.endDate,
          },
        });
      });

      const jobContent: OverlayContent = {
        title: company.company,
        subtitle: `${company.startDate || ""} - ${company.endDate || "Present"} • ${company.location || ""}`,
        description:
          company.positions?.[0]?.responsibilities?.[0] ||
          `Professional experience at ${company.company}.`,
        sections,
        actions: [
          {
            label: "View Career Journey",
            action: "tour:career-journey",
            icon: "📈",
          },
        ],
      };

      // Show right-pane content (simulate load)
      setContentLoading(true);
      setTimeout(() => {
        setOverlayContent(jobContent);
        setContentLoading(false);
      }, 300);

      // Attach overlays
      attachMultiNoteOverlays(moonMesh, overlayDefs, {
        radiusOffset: 0.04,
        opacity: 0.95,
      });

      // Mark moon as focused: pause orbital revolution but allow spinning/interaction
      moonMesh.userData.pauseOrbit = true;
      if (!moonMesh.userData.spinVelocity) {
        moonMesh.userData.spinVelocity = new THREE.Vector3(0, 0, 0);
      }

      // Disable halo on focused moon
      if (moonMesh.userData.hasHaloLayers) {
        moonMesh.userData.auroraTargetOpacity = 0;
        moonMesh.userData.ringTargetOpacity = 0;
        moonMesh.userData.coreTargetOpacity = 0;
        const a = moonMesh.userData.auroraSprite as THREE.Sprite | undefined;
        const r = moonMesh.userData.ringSprite as THREE.Sprite | undefined;
        const c = moonMesh.userData.coreSprite as THREE.Sprite | undefined;
        if (a && a.material) {
          (a.material as THREE.SpriteMaterial).opacity = 0;
          a.visible = false;
        }
        if (r && r.material) {
          (r.material as THREE.SpriteMaterial).opacity = 0;
          r.visible = false;
        }
        if (c && c.material) {
          (c.material as THREE.SpriteMaterial).opacity = 0;
          c.visible = false;
        }
      }

      // Detach moon from its orbital parent so it stops inheriting parent's revolution
      const itemEntry = items.find((it) => it.mesh === moonMesh);
      if (itemEntry) {
        itemEntry.originalParent = itemEntry.parent;
        const worldPos = new THREE.Vector3();
        moonMesh.getWorldPosition(worldPos);

        vlog(`🔄 Detaching moon from parent`);
        vlog(
          `   World pos before detach: [${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)}]`,
        );
        vlog(
          `   Local pos before detach: [${moonMesh.position.x.toFixed(1)}, ${moonMesh.position.y.toFixed(1)}, ${moonMesh.position.z.toFixed(1)}]`,
        );
        vlog(`   Parent: ${itemEntry.parent?.type || "unknown"}`);

        scene.add(moonMesh);
        moonMesh.position.copy(worldPos);
        itemEntry.detached = true;
        itemEntry.parent = scene;

        vlog(
          `   Position after detach: [${moonMesh.position.x.toFixed(1)}, ${moonMesh.position.y.toFixed(1)}, ${moonMesh.position.z.toFixed(1)}]`,
        );
        vlog(
          `   Moon visible: ${moonMesh.visible}, in scene: ${moonMesh.parent === scene}`,
        );

        // Note: Orbital speeds were already frozen before camera flight
        vlog(`   (Orbital speeds already frozen during pre-flight)`);
      }

      focusedMoonRef.current = moonMesh;
      focusedMoonCameraDistanceRef.current =
        sceneRef.current?.camera?.position.distanceTo(moonWorldPos) || null;
    } catch (e) {}
  };
};
