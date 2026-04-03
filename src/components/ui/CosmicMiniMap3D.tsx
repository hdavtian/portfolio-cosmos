import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitItem } from "../cosmos/ResumeSpace3D.orbital";
import { trackEvent } from "../../lib/analytics";

type Props = {
  visible: boolean;
  containerStyle?: React.CSSProperties;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  initiallyMinified?: boolean;
  projectModeSignal?: boolean;
  spaceshipRef: React.MutableRefObject<THREE.Object3D | null>;
  starDestroyerRef: React.MutableRefObject<THREE.Object3D | null>;
  itemsRef: React.MutableRefObject<OrbitItem[]>;
  skillsAnchorRef: React.MutableRefObject<THREE.Vector3 | null>;
  aboutAnchorRef: React.MutableRefObject<THREE.Vector3 | null>;
  projectsAnchorRef: React.MutableRefObject<THREE.Vector3 | null>;
  portfolioAnchorRef: React.MutableRefObject<THREE.Vector3 | null>;
  currentNavigationTarget: string | null;
  onNavigateToTarget: (targetId: string, targetType: "section" | "moon") => void;
  onCoordinatePing?: (message: string) => void;
};

type MarkerKind = "ship" | "sun" | "planet" | "moon" | "star-destroyer" | "anchor";

type DrawEntity = {
  id: string;
  label: string;
  kind: MarkerKind;
  world: THREE.Vector3;
  targetId?: string;
  targetType?: "section" | "moon";
};

const MINIMAP_DIR_STORAGE_KEY = "cosmic-minimap-show-direction-v1";
const MINIMAP_VISIBLE_STORAGE_KEY = "cosmic-minimap-visible-v1";
const MINIMAP_WIDTH_STORAGE_KEY = "cosmic-minimap-width-v1";
const MINIMAP_HEIGHT_STORAGE_KEY = "cosmic-minimap-height-v1";
const MINIMAP_CENTER_MODE_STORAGE_KEY = "cosmic-minimap-center-mode-v1";

const MAP_SIZE_MIN = 180;
const MAP_SIZE_MAX = 420;
const MAP_WIDTH_MIN = 220;
const MAP_WIDTH_MAX = 520;
const MAP_DEFAULT_SIZE = 332;
const MAP_ZOOM_MIN = 0.4;
const MAP_ZOOM_MAX = 4.5;
const HOVER_PICK_RADIUS_PX = 22;
const MAP_INNER_RANGE = 2600;
const MAP_OUTER_RANGE = 36000;
const PING_TTL_MS = 7000;

const toDisplayLabel = (value: string): string =>
  value
    .replace(/^moon-/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const markerColor = (kind: MarkerKind): string => {
  switch (kind) {
    case "ship":
      return "#8ef2ff";
    case "sun":
      return "#ffbb44";
    case "planet":
      return "#ff8c64";
    case "moon":
      return "#87d9ff";
    case "star-destroyer":
      return "#ff6b7c";
    case "anchor":
      return "#c29fff";
    default:
      return "#9acfff";
  }
};

const markerRadius = (kind: MarkerKind): number => {
  switch (kind) {
    case "ship":
      return 4.2;
    case "sun":
      return 5;
    case "planet":
      return 3.2;
    case "moon":
      return 2.2;
    case "star-destroyer":
      return 3.6;
    case "anchor":
      return 2.6;
    default:
      return 2.8;
  }
};

const compressRadius = (distance: number, maxRadius: number): number => {
  if (distance <= MAP_INNER_RANGE) {
    return (distance / MAP_INNER_RANGE) * (maxRadius * 0.46);
  }
  const t = THREE.MathUtils.clamp(
    (distance - MAP_INNER_RANGE) / (MAP_OUTER_RANGE - MAP_INNER_RANGE),
    0,
    1,
  );
  const curved = Math.log10(1 + t * 9);
  return maxRadius * (0.46 + curved * 0.5);
};

const decompressRadius = (screenRadius: number, maxRadius: number): number => {
  const r = Math.max(0, screenRadius);
  const linearMax = maxRadius * 0.46;
  if (r <= linearMax || linearMax <= 0) {
    return (r / Math.max(linearMax, 1e-6)) * MAP_INNER_RANGE;
  }
  const curved = THREE.MathUtils.clamp((r / maxRadius - 0.46) / 0.5, 0, 1);
  const t = (Math.pow(10, curved) - 1) / 9;
  return MAP_INNER_RANGE + t * (MAP_OUTER_RANGE - MAP_INNER_RANGE);
};

const formatUnits = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M u`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k u`;
  return `${value.toFixed(0)} u`;
};

const shortestAngleDelta = (from: number, to: number): number =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

const CosmicMiniMap3D: React.FC<Props> = ({
  visible,
  containerStyle,
  containerRef,
  initiallyMinified = false,
  projectModeSignal = false,
  spaceshipRef,
  starDestroyerRef,
  itemsRef,
  skillsAnchorRef,
  aboutAnchorRef,
  projectsAnchorRef,
  portfolioAnchorRef,
  currentNavigationTarget,
  onNavigateToTarget,
  onCoordinatePing,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showDirection, setShowDirection] = useState(true);
  const [mapVisible, setMapVisible] = useState(!initiallyMinified);
  const [projectAutoHidden, setProjectAutoHidden] = useState(false);
  const [centerMode, setCenterMode] = useState<"ship" | "sun">("ship");
  const [mapSize, setMapSize] = useState(MAP_DEFAULT_SIZE);
  const [mapWidth, setMapWidth] = useState(MAP_DEFAULT_SIZE);
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [zoomUi, setZoomUi] = useState(1);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const projectSignalPrevRef = useRef(false);

  const mapYawRef = useRef(0);
  const headingYawRef = useRef(0);
  const mapZoomRef = useRef(1);
  const mapPanRef = useRef({ x: 0, y: 0 });
  const hoverTargetsRef = useRef<Array<{ x: number; y: number; label: string }>>([]);
  const clickTargetsRef = useRef<Array<{
    x: number;
    y: number;
    targetId: string;
    targetType: "section" | "moon";
  }>>([]);
  const objectPickTargetsRef = useRef<Array<{
    x: number;
    y: number;
    label: string;
    worldX: number;
    worldZ: number;
  }>>([]);
  const pingMarkersRef = useRef<Array<{
    id: number;
    worldX: number;
    worldZ: number;
    label: string;
    expiresAt: number;
  }>>([]);
  const nextPingIdRef = useRef(1);
  const sweepPhaseRef = useRef(0);

  const resizeStateRef = useRef<{
    active: boolean;
    mode: "diagonal" | "horizontal";
    pointerId: number;
    startX: number;
    startY: number;
    startSize: number;
    startWidth: number;
  }>({
    active: false,
    mode: "diagonal",
    pointerId: -1,
    startX: 0,
    startY: 0,
    startSize: MAP_DEFAULT_SIZE,
    startWidth: MAP_DEFAULT_SIZE,
  });

  const dragStateRef = useRef<{
    active: boolean;
    mode: "angle" | "pan";
    pointerId: number;
    startX: number;
    startY: number;
    startYaw: number;
    startPanX: number;
    startPanY: number;
  }>({
    active: false,
    mode: "angle",
    pointerId: -1,
    startX: 0,
    startY: 0,
    startYaw: 0,
    startPanX: 0,
    startPanY: 0,
  });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(MINIMAP_DIR_STORAGE_KEY);
      if (raw === "0") setShowDirection(false);
      if (raw === "1") setShowDirection(true);
      const centerRaw = window.localStorage.getItem(MINIMAP_CENTER_MODE_STORAGE_KEY);
      if (centerRaw === "sun" || centerRaw === "ship") setCenterMode(centerRaw);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (initiallyMinified) {
      setMapVisible(false);
    }
  }, [initiallyMinified]);

  useEffect(() => {
    try {
      const rawH = window.localStorage.getItem(MINIMAP_HEIGHT_STORAGE_KEY);
      if (rawH) {
        const v = Number(rawH);
        if (Number.isFinite(v)) setMapSize(THREE.MathUtils.clamp(v, MAP_SIZE_MIN, MAP_SIZE_MAX));
      }
      const rawW = window.localStorage.getItem(MINIMAP_WIDTH_STORAGE_KEY);
      if (rawW) {
        const v = Number(rawW);
        if (Number.isFinite(v)) setMapWidth(THREE.MathUtils.clamp(v, MAP_WIDTH_MIN, MAP_WIDTH_MAX));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(MINIMAP_DIR_STORAGE_KEY, showDirection ? "1" : "0");
    } catch {
      // ignore
    }
  }, [showDirection]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MINIMAP_VISIBLE_STORAGE_KEY, mapVisible ? "1" : "0");
    } catch {
      // ignore
    }
  }, [mapVisible]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MINIMAP_CENTER_MODE_STORAGE_KEY, centerMode);
    } catch {
      // ignore
    }
  }, [centerMode]);

  useEffect(() => {
    const prev = projectSignalPrevRef.current;
    if (!prev && projectModeSignal) {
      // Entering Projects: auto-hide by default, but keep user's visibility preference.
      setProjectAutoHidden(true);
    } else if (prev && !projectModeSignal) {
      // Leaving Projects: return to user's map visibility state.
      setProjectAutoHidden(false);
    }
    projectSignalPrevRef.current = projectModeSignal;
  }, [projectModeSignal]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MINIMAP_HEIGHT_STORAGE_KEY, String(mapSize));
      window.localStorage.setItem(MINIMAP_WIDTH_STORAGE_KEY, String(mapWidth));
    } catch {
      // ignore
    }
  }, [mapSize, mapWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible || !mapVisible || projectAutoHidden) return;
    canvas.width = mapWidth;
    canvas.height = mapSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const vCenter = new THREE.Vector3();
    const vShipForward = new THREE.Vector3();
    const entities: DrawEntity[] = [];

    let raf = 0;
    let last = 0;
    const tick = (ts: number) => {
      raf = window.requestAnimationFrame(tick);
      if (ts - last < 50) return;
      const dt = Math.min(0.08, (ts - last) / 1000 || 0.05);
      last = ts;

      try {
        const ship = spaceshipRef.current;
        const sd = starDestroyerRef.current;
        if (centerMode === "sun") vCenter.set(0, 0, 0);
        else if (ship) ship.getWorldPosition(vCenter);
        else vCenter.set(0, 0, 0);

        let shipHeading = headingYawRef.current;
        if (ship) {
          ship.getWorldDirection(vShipForward);
          const hLen = vShipForward.x * vShipForward.x + vShipForward.z * vShipForward.z;
          if (hLen > 1e-6) {
            const a = Math.atan2(vShipForward.z, vShipForward.x);
            if (Number.isFinite(a)) {
              headingYawRef.current = a;
              shipHeading = a;
            }
          }
        }
        const manualYaw = mapYawRef.current;
        const targetYaw = showDirection ? (-Math.PI / 2 - shipHeading) : manualYaw;
        mapYawRef.current += shortestAngleDelta(mapYawRef.current, targetYaw) * 0.16;
        const mapYaw = mapYawRef.current;

        sweepPhaseRef.current += dt * 0.85;
        const cx = mapWidth * 0.5 + mapPanRef.current.x;
        const cy = mapSize * 0.5 + mapPanRef.current.y;
        const radiusMax = Math.max(24, Math.min(mapWidth, mapSize) * 0.46);
        const zoom = mapZoomRef.current;

        ctx.clearRect(0, 0, mapWidth, mapSize);
        ctx.save();
        ctx.translate(cx, cy);

        // Static grid + distance markers (distance labels are zoom-aware)
        const rings = [0.28, 0.5, 0.72, 0.92];
        ctx.strokeStyle = "rgba(77,165,207,0.42)";
        ctx.lineWidth = 1;
        rings.forEach((p, idx) => {
          const ringPx = radiusMax * p;
          ctx.beginPath();
          ctx.arc(0, 0, ringPx, 0, Math.PI * 2);
          ctx.stroke();

          // Ring value markers reflect current zoom scaling.
          const worldDist = decompressRadius(ringPx / Math.max(zoom, 1e-6), radiusMax);
          const lx = ringPx * 0.72;
          const ly = -ringPx * 0.72 + idx * 2;
          const text = formatUnits(worldDist);
          ctx.save();
          ctx.fillStyle = "rgba(6, 19, 36, 0.78)";
          const w = Math.max(42, text.length * 6.4);
          ctx.fillRect(lx - 4, ly - 8, w, 11);
          ctx.fillStyle = "rgba(188, 232, 255, 0.94)";
          ctx.font = "10px Rajdhani, Segoe UI, sans-serif";
          ctx.fillText(text, lx, ly);
          ctx.restore();
        });
        ctx.beginPath();
        ctx.moveTo(-radiusMax, 0);
        ctx.lineTo(radiusMax, 0);
        ctx.moveTo(0, -radiusMax);
        ctx.lineTo(0, radiusMax);
        ctx.strokeStyle = "rgba(77,165,207,0.28)";
        ctx.stroke();

        // Sweep arc
        ctx.save();
        ctx.rotate(sweepPhaseRef.current);
        ctx.beginPath();
        ctx.strokeStyle = "rgba(87,208,255,0.18)";
        ctx.lineWidth = 3;
        ctx.arc(0, 0, radiusMax * 0.96, 0, Math.PI * 0.35);
        ctx.stroke();
        ctx.restore();

        entities.length = 0;
        entities.push({
          id: "sun",
          label: "Sun",
          kind: "sun",
          world: new THREE.Vector3(0, 0, 0),
          targetId: "home",
          targetType: "section",
        });

        if (ship) {
          entities.push({
            id: "ship",
            label: "Millennium Falcon",
            kind: "ship",
            world: ship.getWorldPosition(new THREE.Vector3()),
          });
        }
        if (sd) {
          entities.push({
            id: "sd",
            label: "Star Destroyer",
            kind: "star-destroyer",
            world: sd.getWorldPosition(new THREE.Vector3()),
          });
        }
        for (const item of itemsRef.current) {
          if (!item?.mesh) continue;
          const ud = item.mesh.userData as Record<string, any>;
          const idBase =
            (ud?.moonId as string | undefined)
            || (ud?.planetName as string | undefined)
            || item.mesh.uuid;
          const id = idBase.toLowerCase();
          const labelBase =
            (ud?.planetName as string | undefined)
            || (ud?.moonId as string | undefined)
            || idBase;
          const kind: MarkerKind = ud?.isMoon ? "moon" : "planet";
          const ent: DrawEntity = {
            id,
            label: toDisplayLabel(labelBase),
            kind,
            world: item.mesh.getWorldPosition(new THREE.Vector3()),
          };
          if (id.startsWith("moon-")) {
            ent.targetId = id.slice(5);
            ent.targetType = "moon";
          } else if (["experience", "skills", "projects", "portfolio", "about", "home"].includes(id)) {
            ent.targetId = id;
            ent.targetType = "section";
          }
          entities.push(ent);
        }
        if (skillsAnchorRef.current) {
          entities.push({
            id: "skills-anchor",
            label: "Skills Lattice",
            kind: "anchor",
            world: skillsAnchorRef.current.clone(),
            targetId: "skills",
            targetType: "section",
          });
        }
        if (aboutAnchorRef.current) {
          entities.push({
            id: "about-anchor",
            label: "About Memory Square",
            kind: "anchor",
            world: aboutAnchorRef.current.clone(),
            targetId: "about",
            targetType: "section",
          });
        }
        if (projectsAnchorRef.current) {
          entities.push({
            id: "projects-anchor",
            label: "Project Showcase",
            kind: "anchor",
            world: projectsAnchorRef.current.clone(),
            targetId: "projects",
            targetType: "section",
          });
        }
        if (portfolioAnchorRef.current) {
          entities.push({
            id: "portfolio-anchor",
            label: "Portfolio Registry",
            kind: "anchor",
            world: portfolioAnchorRef.current.clone(),
            targetId: "portfolio",
            targetType: "section",
          });
        }

        const idMap = new Map<string, { x: number; y: number; ent: DrawEntity }>();
        hoverTargetsRef.current = [];
        clickTargetsRef.current = [];
        objectPickTargetsRef.current = [];
        const targetLower = currentNavigationTarget?.toLowerCase() ?? null;

        const drawEntityPoint = (ent: DrawEntity) => {
          const dx = ent.world.x - vCenter.x;
          const dz = ent.world.z - vCenter.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const angle = Math.atan2(dz, dx);
          const cr = compressRadius(dist, radiusMax);
          const rx = Math.cos(angle + mapYaw) * cr * zoom;
          const ry = Math.sin(angle + mapYaw) * cr * zoom;
          const sx = rx;
          const sy = ry;

          const r = markerRadius(ent.kind);
          ctx.beginPath();
          ctx.fillStyle = markerColor(ent.kind);
          ctx.globalAlpha = ent.kind === "moon" ? 0.86 : 0.96;
          if (ent.kind === "ship" || ent.kind === "star-destroyer") {
            ctx.save();
            ctx.translate(sx, sy);
            const forward = ent.kind === "ship" && ship
              ? Math.atan2(vShipForward.z, vShipForward.x) + mapYaw
              : 0;
            ctx.rotate(forward);
            ctx.moveTo(r + 2, 0);
            ctx.lineTo(-r, r * 0.8);
            ctx.lineTo(-r, -r * 0.8);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          } else {
            ctx.arc(sx, sy, r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;

          const isTarget =
            !!targetLower &&
            (ent.id === targetLower
              || ent.id === `moon-${targetLower}`
              || (ent.targetId && ent.targetId.toLowerCase() === targetLower));
          if (isTarget) {
            const pulse = 1 + Math.sin(ts * 0.009) * 0.16;
            ctx.beginPath();
            ctx.strokeStyle = "rgba(185,240,255,0.9)";
            ctx.lineWidth = 1.5;
            ctx.arc(sx, sy, (r + 3) * pulse, 0, Math.PI * 2);
            ctx.stroke();
          }

          const canvasX = cx + sx;
          const canvasY = cy + sy;
          hoverTargetsRef.current.push({ x: canvasX, y: canvasY, label: ent.label });
          objectPickTargetsRef.current.push({
            x: canvasX,
            y: canvasY,
            label: ent.label,
            worldX: ent.world.x,
            worldZ: ent.world.z,
          });
          if (ent.targetId && ent.targetType) {
            clickTargetsRef.current.push({
              x: canvasX,
              y: canvasY,
              targetId: ent.targetId,
              targetType: ent.targetType,
            });
          }
          idMap.set(ent.id, { x: sx, y: sy, ent });
        };

        entities.forEach(drawEntityPoint);

        // Route line always on if target exists
        const shipPoint = idMap.get("ship");
        let targetPoint: { x: number; y: number; ent: DrawEntity } | undefined;
        if (targetLower) {
          targetPoint = idMap.get(targetLower);
          if (!targetPoint) targetPoint = idMap.get(`moon-${targetLower}`);
          if (!targetPoint) {
            for (const p of idMap.values()) {
              if (p.ent.targetId?.toLowerCase() === targetLower) {
                targetPoint = p;
                break;
              }
            }
          }
        }
        if (shipPoint && targetPoint) {
          ctx.beginPath();
          ctx.strokeStyle = "rgba(117,214,255,0.9)";
          ctx.setLineDash([5, 4]);
          ctx.moveTo(shipPoint.x, shipPoint.y);
          ctx.lineTo(targetPoint.x, targetPoint.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Ephemeral pings (7s) drawn in world-space so they follow map transforms.
        const now = performance.now();
        pingMarkersRef.current = pingMarkersRef.current.filter((p) => p.expiresAt > now);
        for (const ping of pingMarkersRef.current) {
          const dx = ping.worldX - vCenter.x;
          const dz = ping.worldZ - vCenter.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const angle = Math.atan2(dz, dx);
          const cr = compressRadius(dist, radiusMax);
          const px = Math.cos(angle + mapYaw) * cr * zoom;
          const py = Math.sin(angle + mapYaw) * cr * zoom;
          const age = THREE.MathUtils.clamp((ping.expiresAt - now) / PING_TTL_MS, 0, 1);
          const alpha = 0.3 + age * 0.7;

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = "rgba(255, 236, 157, 0.95)";
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(px - 6, py);
          ctx.lineTo(px + 6, py);
          ctx.moveTo(px, py - 6);
          ctx.lineTo(px, py + 6);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, py, 8, 0, Math.PI * 2);
          ctx.stroke();

          const txt = ping.label;
          const tw = Math.max(76, txt.length * 6.1);
          ctx.fillStyle = "rgba(18, 22, 30, 0.86)";
          ctx.fillRect(px + 8, py - 18, tw, 14);
          ctx.fillStyle = "rgba(255, 241, 182, 0.96)";
          ctx.font = "10px Rajdhani, Segoe UI, sans-serif";
          ctx.fillText(txt, px + 11, py - 8);
          ctx.restore();
        }

        ctx.restore();
      } catch {
        // keep minimap isolated from main scene stability
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [
    visible,
    mapVisible,
    projectAutoHidden,
    mapWidth,
    mapSize,
    showDirection,
    centerMode,
    currentNavigationTarget,
    spaceshipRef,
    starDestroyerRef,
    itemsRef,
    skillsAnchorRef,
    aboutAnchorRef,
    projectsAnchorRef,
    portfolioAnchorRef,
  ]);

  if (!visible) return null;

  if (!mapVisible || projectAutoHidden) {
    return (
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          right: 16,
          bottom: 18,
          zIndex: 1117,
          pointerEvents: "auto",
          ...containerStyle,
        }}
      >
        <button
          type="button"
          onClick={() => {
            trackEvent("minimap_toggle", { action: "show" });
            setMapVisible(true);
            setProjectAutoHidden(false);
          }}
          style={{
            borderRadius: 8,
            border: "1px solid rgba(122, 201, 255, 0.55)",
            background: "rgba(8, 20, 36, 0.84)",
            color: "rgba(192, 236, 255, 0.95)",
            padding: "6px 10px",
            fontSize: 10,
            letterSpacing: 0.8,
            fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 0 12px rgba(75, 163, 255, 0.2)",
          }}
        >
          Show Mini Map
        </button>
      </div>
    );
  }

  const onMapPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const mode: "angle" | "pan" = event.shiftKey ? "pan" : "angle";
    dragStateRef.current = {
      active: true,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startYaw: mapYawRef.current,
      startPanX: mapPanRef.current.x,
      startPanY: mapPanRef.current.y,
    };
    setIsDraggingMap(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onMapPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (drag.active && drag.pointerId === event.pointerId) {
      event.stopPropagation();
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (drag.mode === "pan") {
        mapPanRef.current.x = drag.startPanX + dx * 0.28;
        mapPanRef.current.y = drag.startPanY + dy * 0.28;
        setHoverInfo(null);
        return;
      }
      if (!showDirection) {
        mapYawRef.current = drag.startYaw - dx * 0.0065;
      }
      setHoverInfo(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best: { label: string; d: number } | null = null;
    for (const target of hoverTargetsRef.current) {
      const dx = target.x - x;
      const dy = target.y - y;
      const d = dx * dx + dy * dy;
      if (d > HOVER_PICK_RADIUS_PX * HOVER_PICK_RADIUS_PX) continue;
      if (!best || d < best.d) best = { label: target.label, d };
    }
    if (best) setHoverInfo({ x: x + 3, y: y - 4, label: best.label });
    else setHoverInfo(null);
  };

  const onMapPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    const isTap = moved <= 5;
    drag.active = false;
    drag.pointerId = -1;
    setIsDraggingMap(false);
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (isTap && drag.mode === "pan") {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const cx = mapWidth * 0.5 + mapPanRef.current.x;
      const cy = mapSize * 0.5 + mapPanRef.current.y;
      const sx = (x - cx) / Math.max(mapZoomRef.current, 1e-6);
      const sy = (y - cy) / Math.max(mapZoomRef.current, 1e-6);
      const radial = Math.sqrt(sx * sx + sy * sy);
      const worldDist = decompressRadius(radial, Math.max(24, Math.min(mapWidth, mapSize) * 0.46));
      const mapYaw = mapYawRef.current;
      const theta = Math.atan2(sy, sx) - mapYaw;
      const ship = spaceshipRef.current;
      const center =
        centerMode === "sun"
          ? new THREE.Vector3(0, 0, 0)
          : ship
            ? ship.getWorldPosition(new THREE.Vector3())
            : new THREE.Vector3(0, 0, 0);
      const worldX = center.x + Math.cos(theta) * worldDist;
      const worldZ = center.z + Math.sin(theta) * worldDist;

      let nearestObject:
        | { label: string; worldX: number; worldZ: number; d: number }
        | null = null;
      for (const target of objectPickTargetsRef.current) {
        const dx = target.x - x;
        const dy = target.y - y;
        const d = dx * dx + dy * dy;
        if (d > HOVER_PICK_RADIUS_PX * HOVER_PICK_RADIUS_PX) continue;
        if (!nearestObject || d < nearestObject.d) {
          nearestObject = {
            label: target.label,
            worldX: target.worldX,
            worldZ: target.worldZ,
            d,
          };
        }
      }
      const snappedX = nearestObject ? nearestObject.worldX : worldX;
      const snappedZ = nearestObject ? nearestObject.worldZ : worldZ;
      const coordLabel = `X ${snappedX.toFixed(0)}, Y ${snappedZ.toFixed(0)}`;
      const label = nearestObject ? `${nearestObject.label} | ${coordLabel}` : coordLabel;
      pingMarkersRef.current.push({
        id: nextPingIdRef.current++,
        worldX: snappedX,
        worldZ: snappedZ,
        label,
        expiresAt: performance.now() + PING_TTL_MS,
      });
      onCoordinatePing?.(`MINIMAP PING: ${label}`);
      try {
        const clipboardText = nearestObject
          ? `${nearestObject.label}: ${coordLabel}`
          : coordLabel;
        void navigator.clipboard.writeText(clipboardText);
      } catch {
        // ignore clipboard write failures (permissions/browser policy)
      }
      return;
    }

    if (isTap && drag.mode === "angle") {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let best:
        | { targetId: string; targetType: "section" | "moon"; d: number }
        | null = null;
      for (const target of clickTargetsRef.current) {
        const dx = target.x - x;
        const dy = target.y - y;
        const d = dx * dx + dy * dy;
        if (d > HOVER_PICK_RADIUS_PX * HOVER_PICK_RADIUS_PX) continue;
        if (!best || d < best.d) {
          best = { targetId: target.targetId, targetType: target.targetType, d };
        }
      }
      if (best) onNavigateToTarget(best.targetId, best.targetType);
    }
  };

  const onMapWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    const next = THREE.MathUtils.clamp(mapZoomRef.current * factor, MAP_ZOOM_MIN, MAP_ZOOM_MAX);
    mapZoomRef.current = next;
    setZoomUi(next);
  };

  const resetMapView = () => {
    mapZoomRef.current = 1;
    mapPanRef.current = { x: 0, y: 0 };
    setZoomUi(1);
  };

  const onResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    resizeStateRef.current = {
      active: true,
      mode: "diagonal",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startSize: mapSize,
      startWidth: mapWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeHorizontalPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    resizeStateRef.current = {
      active: true,
      mode: "horizontal",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startSize: mapSize,
      startWidth: mapWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rs = resizeStateRef.current;
    if (!rs.active || rs.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const dx = event.clientX - rs.startX;
    const dy = event.clientY - rs.startY;
    if (rs.mode === "horizontal") {
      let width = rs.startWidth;
      if (dx < 0) width = rs.startWidth + Math.abs(dx);
      else if (dx > 0) width = rs.startWidth - dx;
      setMapWidth(THREE.MathUtils.clamp(width, MAP_WIDTH_MIN, MAP_WIDTH_MAX));
      return;
    }
    let next = rs.startSize;
    const isNorthEastDrag = dx > 0 && dy < 0;
    if (isNorthEastDrag) {
      const dd = (dx + Math.abs(dy)) * 0.5;
      next = rs.startSize - dd;
    } else if (dx < 0) {
      next = rs.startSize + Math.abs(dx);
    } else if (dx > 0) {
      next = rs.startSize - dx;
    }
    next = THREE.MathUtils.clamp(next, MAP_SIZE_MIN, MAP_SIZE_MAX);
    setMapSize(next);
    setMapWidth(next);
  };

  const onResizePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const rs = resizeStateRef.current;
    if (!rs.active || rs.pointerId !== event.pointerId) return;
    rs.active = false;
    rs.pointerId = -1;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        right: 16,
        bottom: 18,
        width: mapWidth,
        zIndex: 1117,
        borderRadius: 12,
        border: "1px solid rgba(108, 183, 255, 0.48)",
        background:
          "radial-gradient(circle at 50% 40%, rgba(8, 28, 52, 0.72), rgba(4, 10, 22, 0.86))",
        boxShadow:
          "0 0 20px rgba(56, 148, 255, 0.24), inset 0 0 24px rgba(84, 188, 255, 0.08)",
        padding: 8,
        pointerEvents: "auto",
        backdropFilter: "blur(4px)",
        ...containerStyle,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          color: "rgba(169, 226, 255, 0.88)",
          fontSize: 10,
          letterSpacing: 1.1,
          textTransform: "uppercase",
          fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
          marginBottom: 6,
          paddingInline: 2,
          gap: 8,
        }}
      >
        <span style={{ whiteSpace: "nowrap", paddingTop: 2 }}>Mini Map</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            flexWrap: "wrap",
            gap: 6,
            rowGap: 4,
            minWidth: 0,
            flex: 1,
          }}
        >
          <button
            type="button"
            onClick={() => setShowDirection((prev) => !prev)}
            style={{
              borderRadius: 5,
              border: showDirection
                ? "1px solid rgba(126, 230, 255, 0.75)"
                : "1px solid rgba(112, 149, 176, 0.55)",
              background: showDirection
                ? "rgba(24, 95, 130, 0.52)"
                : "rgba(18, 34, 51, 0.52)",
              color: showDirection
                ? "rgba(190, 245, 255, 0.96)"
                : "rgba(148, 183, 207, 0.86)",
              fontSize: 9,
              letterSpacing: 0.8,
              fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
              fontWeight: 700,
              padding: "2px 6px",
              cursor: "pointer",
            }}
          >
            DIR {showDirection ? "HEADING-UP" : "NORTH-UP"}
          </button>
          <button
            type="button"
            onClick={() =>
              setCenterMode((prev) => (prev === "ship" ? "sun" : "ship"))
            }
            style={{
              borderRadius: 5,
              border: "1px solid rgba(145, 198, 230, 0.55)",
              background: "rgba(18, 34, 51, 0.48)",
              color: "rgba(174, 214, 236, 0.92)",
              fontSize: 9,
              letterSpacing: 0.8,
              fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
              fontWeight: 700,
              padding: "2px 6px",
              cursor: "pointer",
            }}
          >
            CENTER {centerMode === "sun" ? "SUN" : "SHIP"}
          </button>
          <button
            type="button"
            onClick={resetMapView}
            style={{
              borderRadius: 5,
              border: "1px solid rgba(145, 198, 230, 0.55)",
              background: "rgba(18, 34, 51, 0.48)",
              color: "rgba(174, 214, 236, 0.92)",
              fontSize: 9,
              letterSpacing: 0.8,
              fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
              fontWeight: 700,
              padding: "2px 6px",
              cursor: "pointer",
            }}
          >
            RESET
          </button>
          <button
            type="button"
            onClick={() => {
              trackEvent("minimap_toggle", { action: "hide" });
              setMapVisible(false);
            }}
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: "1px solid rgba(255, 140, 140, 0.28)",
              background: "rgba(18, 34, 51, 0.55)",
              color: "rgba(255, 170, 170, 0.82)",
              fontSize: 10,
              fontFamily: "'Courier New', monospace",
              fontWeight: 700,
              lineHeight: 1,
              padding: 0,
              cursor: "pointer",
            }}
          >
            X
          </button>
        </div>
      </div>

      <div
        onPointerDown={onMapPointerDown}
        onPointerMove={onMapPointerMove}
        onPointerUp={onMapPointerUp}
        onPointerCancel={onMapPointerUp}
        onPointerLeave={() => setHoverInfo(null)}
        onWheel={onMapWheel}
        style={{
          position: "relative",
          cursor: isDraggingMap ? "grabbing" : "crosshair",
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid rgba(98, 161, 218, 0.35)",
          boxShadow: "inset 0 0 12px rgba(62, 138, 196, 0.16)",
        }}
      >
        <canvas ref={canvasRef} width={mapWidth} height={mapSize} style={{ display: "block", width: mapWidth, height: mapSize }} />
        {hoverInfo && (
          <div
            style={{
              position: "absolute",
              left: hoverInfo.x,
              top: hoverInfo.y,
              transform: "translate(0, -100%)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              padding: "3px 7px",
              borderRadius: 6,
              border: "1px solid rgba(131, 202, 255, 0.58)",
              background: "rgba(6, 19, 36, 0.88)",
              color: "rgba(203, 237, 255, 0.98)",
              fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
              fontSize: 10,
              letterSpacing: 0.4,
              boxShadow: "0 0 10px rgba(85, 180, 255, 0.25)",
              zIndex: 4,
            }}
          >
            {hoverInfo.label}
          </div>
        )}

        <div
          onPointerDown={onResizeHorizontalPointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          style={{
            position: "absolute",
            left: 2,
            top: "50%",
            transform: "translateY(-50%)",
            width: 8,
            height: 44,
            cursor: "ew-resize",
            borderLeft: "2px solid rgba(153, 214, 255, 0.75)",
            background: "transparent",
            zIndex: 5,
            pointerEvents: "auto",
          }}
          title="Resize mini map horizontally"
        />

        <div
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          style={{
            position: "absolute",
            left: 2,
            top: 2,
            width: 16,
            height: 16,
            cursor: "nwse-resize",
            borderTop: "2px solid rgba(153, 214, 255, 0.7)",
            borderLeft: "2px solid rgba(153, 214, 255, 0.7)",
            borderRadius: "8px 0 0 0",
            background: "linear-gradient(315deg, transparent 52%, rgba(82,166,220,0.35) 100%)",
            zIndex: 5,
            pointerEvents: "auto",
          }}
          title="Resize mini map"
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: 38,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 1,
            height: 12,
            background: "linear-gradient(to bottom, rgba(120,220,255,0.96), rgba(120,220,255,0.2))",
          }}
        />
        <div
          style={{
            fontFamily: "'Orbitron', 'Share Tech Mono', 'Courier New', monospace",
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "rgba(170, 236, 255, 0.98)",
            textShadow: "0 0 8px rgba(85, 200, 255, 0.45)",
            lineHeight: 1,
          }}
        >
          N
        </div>
      </div>

      <div
        style={{
          marginTop: 6,
          color: "rgba(145, 198, 230, 0.74)",
          fontSize: 9,
          letterSpacing: 0.4,
          fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        {centerMode === "sun" ? "Sun centered" : "Ship centered"} | wheel zoom {zoomUi.toFixed(2)}x | shift+drag pan
      </div>
      <div
        style={{
          marginTop: 2,
          color: "rgba(156, 206, 235, 0.62)",
          fontSize: 8,
          letterSpacing: 0.35,
          fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
          textAlign: "center",
        }}
      >
        Coordinates are sun-origin (0,0) on orbital plane
      </div>
    </div>
  );
};

export default CosmicMiniMap3D;
