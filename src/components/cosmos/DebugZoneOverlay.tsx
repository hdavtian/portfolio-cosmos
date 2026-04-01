import { useEffect, useMemo, useRef, useState } from "react";

type ZoneName =
  | "Navicomputer"
  | "Portfolio area"
  | "job description"
  | "tech chips"
  | "large image area"
  | "thumbnails"
  | "thumbnail description";

type ZoneRecord = {
  id: string;
  name: ZoneName;
  note: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type InteractionState =
  | {
      type: "move";
      zoneId: string;
      startMouse: { x: number; y: number };
      startRect: ZoneRecord;
    }
  | {
      type: "resize";
      zoneId: string;
      handle: ResizeHandle;
      startMouse: { x: number; y: number };
      startRect: ZoneRecord;
    };

const ZONE_NAMES: ZoneName[] = [
  "Navicomputer",
  "Portfolio area",
  "job description",
  "tech chips",
  "large image area",
  "thumbnails",
  "thumbnail description",
];

const SNAP_THRESHOLD = 8;
const MIN_ZONE_SIZE = 24;

const clampRect = (rect: ZoneRecord): ZoneRecord => {
  const x = Math.max(0, Math.min(window.innerWidth, rect.x));
  const y = Math.max(0, Math.min(window.innerHeight, rect.y));
  const maxWidth = Math.max(MIN_ZONE_SIZE, window.innerWidth - x);
  const maxHeight = Math.max(MIN_ZONE_SIZE, window.innerHeight - y);
  return {
    ...rect,
    x,
    y,
    width: Math.max(MIN_ZONE_SIZE, Math.min(maxWidth, rect.width)),
    height: Math.max(MIN_ZONE_SIZE, Math.min(maxHeight, rect.height)),
  };
};

export default function DebugZoneOverlay({ enabled }: { enabled: boolean }): React.JSX.Element | null {
  const [toolOpen, setToolOpen] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [zones, setZones] = useState<ZoneRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ZoneRecord | null>(null);
  const [ctrlHeld, setCtrlHeld] = useState(false);
  const [panelPos, setPanelPos] = useState({ x: 12, y: 12 });
  const [snapGuides, setSnapGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });

  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<ZoneRecord | null>(null);
  const controlPanelRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const panelDragRef = useRef<{ startMouse: { x: number; y: number }; startPos: { x: number; y: number } } | null>(null);

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedId) ?? null,
    [zones, selectedId],
  );

  const buildSnapGuides = (activeId: string) => {
    const x: number[] = [0, window.innerWidth];
    const y: number[] = [0, window.innerHeight];
    for (const z of zones) {
      if (z.id === activeId) continue;
      x.push(z.x, z.x + z.width, z.x + z.width / 2);
      y.push(z.y, z.y + z.height, z.y + z.height / 2);
    }
    return { x, y };
  };

  const snapValue = (value: number, candidates: number[]) => {
    let best = value;
    let delta = SNAP_THRESHOLD + 1;
    for (const candidate of candidates) {
      const d = candidate - value;
      if (Math.abs(d) < Math.abs(delta)) {
        delta = d;
        best = candidate;
      }
    }
    if (Math.abs(delta) <= SNAP_THRESHOLD) return { value: best, snapped: best };
    return { value, snapped: null as number | null };
  };

  const snapRect = (rect: ZoneRecord, activeId: string, interaction: InteractionState) => {
    const guides = buildSnapGuides(activeId);
    const snappedX: number[] = [];
    const snappedY: number[] = [];
    let next = { ...rect };

    if (interaction.type === "move") {
      const sx = snapValue(next.x, guides.x);
      const sy = snapValue(next.y, guides.y);
      if (sx.snapped !== null) snappedX.push(sx.snapped);
      if (sy.snapped !== null) snappedY.push(sy.snapped);
      next.x = sx.value;
      next.y = sy.value;
      const sRight = snapValue(next.x + next.width, guides.x);
      if (sRight.snapped !== null) {
        next.x += sRight.value - (next.x + next.width);
        snappedX.push(sRight.value);
      }
      const sBottom = snapValue(next.y + next.height, guides.y);
      if (sBottom.snapped !== null) {
        next.y += sBottom.value - (next.y + next.height);
        snappedY.push(sBottom.value);
      }
    } else {
      const h = interaction.handle;
      if (h.includes("e")) {
        const se = snapValue(next.x + next.width, guides.x);
        if (se.snapped !== null) {
          next.width = Math.max(MIN_ZONE_SIZE, se.value - next.x);
          snappedX.push(se.value);
        }
      }
      if (h.includes("s")) {
        const ss = snapValue(next.y + next.height, guides.y);
        if (ss.snapped !== null) {
          next.height = Math.max(MIN_ZONE_SIZE, ss.value - next.y);
          snappedY.push(ss.value);
        }
      }
      if (h.includes("w")) {
        const sw = snapValue(next.x, guides.x);
        if (sw.snapped !== null) {
          const right = next.x + next.width;
          next.x = sw.value;
          next.width = Math.max(MIN_ZONE_SIZE, right - next.x);
          snappedX.push(sw.value);
        }
      }
      if (h.includes("n")) {
        const sn = snapValue(next.y, guides.y);
        if (sn.snapped !== null) {
          const bottom = next.y + next.height;
          next.y = sn.value;
          next.height = Math.max(MIN_ZONE_SIZE, bottom - next.y);
          snappedY.push(sn.value);
        }
      }
    }
    setSnapGuides({ x: [...new Set(snappedX)], y: [...new Set(snappedY)] });
    return clampRect(next);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control") setCtrlHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control") setCtrlHeld(false);
    };
    const onBlur = () => setCtrlHeld(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!enabled || !drawMode) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!event.ctrlKey) return;
      const panel = controlPanelRef.current;
      if (panel && event.target instanceof Node && panel.contains(event.target)) return;
      drawStartRef.current = { x: event.clientX, y: event.clientY };
      setDraft({
        id: "draft",
        name: "Portfolio area",
        note: "",
        x: event.clientX,
        y: event.clientY,
        width: MIN_ZONE_SIZE,
        height: MIN_ZONE_SIZE,
      });
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drawStartRef.current) return;
      const x = Math.min(drawStartRef.current.x, event.clientX);
      const y = Math.min(drawStartRef.current.y, event.clientY);
      const width = Math.max(MIN_ZONE_SIZE, Math.abs(event.clientX - drawStartRef.current.x));
      const height = Math.max(MIN_ZONE_SIZE, Math.abs(event.clientY - drawStartRef.current.y));
      setDraft({
        id: "draft",
        name: "Portfolio area",
        note: "",
        x,
        y,
        width,
        height,
      });
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onPointerUp = (event: PointerEvent) => {
      const activeDraft = draftRef.current;
      if (!drawStartRef.current || !activeDraft) return;
      drawStartRef.current = null;
      const id = `zone-${Date.now()}`;
      const zone: ZoneRecord = clampRect({ ...activeDraft, id });
      setZones((prev) => [...prev, zone]);
      setSelectedId(id);
      setDraft(null);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
    };
  }, [enabled, drawMode]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const dx = event.clientX - interaction.startMouse.x;
      const dy = event.clientY - interaction.startMouse.y;
      let next: ZoneRecord = { ...interaction.startRect };
      if (interaction.type === "move") {
        next.x = interaction.startRect.x + dx;
        next.y = interaction.startRect.y + dy;
      } else {
        if (interaction.handle.includes("e")) next.width = Math.max(MIN_ZONE_SIZE, interaction.startRect.width + dx);
        if (interaction.handle.includes("s")) next.height = Math.max(MIN_ZONE_SIZE, interaction.startRect.height + dy);
        if (interaction.handle.includes("w")) {
          next.x = interaction.startRect.x + dx;
          next.width = Math.max(MIN_ZONE_SIZE, interaction.startRect.width - dx);
        }
        if (interaction.handle.includes("n")) {
          next.y = interaction.startRect.y + dy;
          next.height = Math.max(MIN_ZONE_SIZE, interaction.startRect.height - dy);
        }
      }
      next = snapRect(next, interaction.zoneId, interaction);
      setZones((prev) => prev.map((z) => (z.id === interaction.zoneId ? next : z)));
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onPointerUp = () => {
      if (!interactionRef.current) return;
      interactionRef.current = null;
      setSnapGuides({ x: [], y: [] });
    };
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
    };
  }, [zones]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!panelDragRef.current) return;
      const dx = event.clientX - panelDragRef.current.startMouse.x;
      const dy = event.clientY - panelDragRef.current.startMouse.y;
      setPanelPos({
        x: Math.max(0, panelDragRef.current.startPos.x + dx),
        y: Math.max(0, panelDragRef.current.startPos.y + dy),
      });
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    const onPointerUp = () => {
      panelDragRef.current = null;
    };
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", onPointerUp, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
    };
  }, []);

  const updateZone = (id: string, patch: Partial<ZoneRecord>) => {
    setZones((prev) =>
      prev.map((zone) => (zone.id === id ? clampRect({ ...zone, ...patch }) : zone)),
    );
  };

  const handleExport = () => {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const payload = {
      kind: "moon-orbital-zone-export",
      exportedAt: new Date().toISOString(),
      viewport,
      zones: zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        note: zone.note,
        rect: {
          x: Math.round(zone.x),
          y: Math.round(zone.y),
          width: Math.round(zone.width),
          height: Math.round(zone.height),
        },
        percent: {
          x: Number(((zone.x / viewport.width) * 100).toFixed(3)),
          y: Number(((zone.y / viewport.height) * 100).toFixed(3)),
          width: Number(((zone.width / viewport.width) * 100).toFixed(3)),
          height: Number(((zone.height / viewport.height) * 100).toFixed(3)),
        },
      })),
    };
    console.log("[zone-debug-export]", payload);
  };

  if (!enabled) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 12000, pointerEvents: "none" }}>
      {snapGuides.x.map((x) => (
        <div
          key={`vx-${x}`}
          style={{
            position: "absolute",
            left: x,
            top: 0,
            bottom: 0,
            width: 1,
            background: "rgba(180,255,232,0.7)",
            pointerEvents: "none",
            zIndex: 12020,
          }}
        />
      ))}
      {snapGuides.y.map((y) => (
        <div
          key={`hy-${y}`}
          style={{
            position: "absolute",
            top: y,
            left: 0,
            right: 0,
            height: 1,
            background: "rgba(180,255,232,0.7)",
            pointerEvents: "none",
            zIndex: 12020,
          }}
        />
      ))}

      {zones.map((zone) => {
        const selected = zone.id === selectedId;
        return (
          <div
            key={zone.id}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              setSelectedId(zone.id);
              interactionRef.current = {
                type: "move",
                zoneId: zone.id,
                startMouse: { x: event.clientX, y: event.clientY },
                startRect: zone,
              };
              event.preventDefault();
              event.stopPropagation();
            }}
            style={{
              position: "absolute",
              left: zone.x,
              top: zone.y,
              width: zone.width,
              height: zone.height,
              border: selected
                ? "2px solid rgba(180,255,232,0.96)"
                : "2px solid rgba(93,242,191,0.75)",
              background: selected ? "rgba(93,242,191,0.13)" : "rgba(93,242,191,0.08)",
              color: "#cffff1",
              textAlign: "left",
              padding: 6,
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 12,
              pointerEvents: "auto",
              cursor: "move",
              overflow: "hidden",
              zIndex: 12005,
            }}
            title={zone.note || zone.name}
          >
            <div style={{ fontWeight: 700 }}>{zone.name}</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>
              {Math.round(zone.x)},{Math.round(zone.y)} · {Math.round(zone.width)}x{Math.round(zone.height)}
            </div>
            {selected &&
              (["n", "s", "e", "w", "ne", "nw", "se", "sw"] as ResizeHandle[]).map((handle) => {
                const size = 10;
                const style: React.CSSProperties = {
                  position: "absolute",
                  width: size,
                  height: size,
                  background: "rgba(180,255,232,0.9)",
                  border: "1px solid rgba(3,20,16,0.8)",
                  borderRadius: 2,
                  pointerEvents: "auto",
                };
                if (handle.includes("n")) style.top = -size / 2;
                if (handle.includes("s")) style.bottom = -size / 2;
                if (handle.includes("e")) style.right = -size / 2;
                if (handle.includes("w")) style.left = -size / 2;
                if (handle === "n" || handle === "s") style.left = "50%";
                if (handle === "e" || handle === "w") style.top = "50%";
                if (handle === "n" || handle === "s") style.transform = "translateX(-50%)";
                if (handle === "e" || handle === "w") style.transform = "translateY(-50%)";
                return (
                  <div
                    key={`${zone.id}-${handle}`}
                    onPointerDown={(event) => {
                      interactionRef.current = {
                        type: "resize",
                        zoneId: zone.id,
                        handle,
                        startMouse: { x: event.clientX, y: event.clientY },
                        startRect: zone,
                      };
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    style={style}
                  />
                );
              })}
          </div>
        );
      })}

      {draft && (
        <div
          style={{
            position: "absolute",
            left: draft.x,
            top: draft.y,
            width: draft.width,
            height: draft.height,
            border: "2px dashed rgba(180,255,232,0.95)",
            background: "rgba(93,242,191,0.08)",
            pointerEvents: "none",
            zIndex: 12012,
          }}
        />
      )}

      <div
        ref={controlPanelRef}
        style={{
          position: "absolute",
          top: panelPos.y,
          left: panelPos.x,
          width: 360,
          borderRadius: 10,
          border: "1px solid rgba(93,242,191,0.5)",
          background: "rgba(4, 14, 22, 0.9)",
          color: "#9fffe0",
          fontFamily: "'Rajdhani', sans-serif",
          letterSpacing: 0.4,
          boxShadow: "0 8px 22px rgba(0,0,0,0.45)",
          pointerEvents: "auto",
          zIndex: 12040,
        }}
      >
        <div
          onPointerDown={(event) => {
            panelDragRef.current = {
              startMouse: { x: event.clientX, y: event.clientY },
              startPos: panelPos,
            };
            event.preventDefault();
          }}
          style={{
            display: "flex",
            gap: 8,
            padding: "8px 10px",
            alignItems: "center",
            cursor: "grab",
            userSelect: "none",
          }}
        >
          <strong style={{ flex: 1, fontSize: 14 }}>Zone Debugger</strong>
          <button
            type="button"
            onClick={() => setToolOpen((prev) => !prev)}
            style={{
              border: "1px solid rgba(93,242,191,0.45)",
              background: "rgba(7,28,20,0.7)",
              color: "#97f0d4",
              borderRadius: 8,
              padding: "4px 8px",
              cursor: "pointer",
            }}
          >
            {toolOpen ? "Hide" : "Show"}
          </button>
        </div>
        {toolOpen && (
          <div style={{ borderTop: "1px solid rgba(93,242,191,0.25)", padding: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <button
                type="button"
                onClick={() => setDrawMode((prev) => !prev)}
                style={{
                  border: "1px solid rgba(93,242,191,0.45)",
                  background: drawMode ? "rgba(18,86,58,0.9)" : "rgba(7,28,20,0.7)",
                  color: "#97f0d4",
                  borderRadius: 8,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                {drawMode ? "Drawing ON" : "Drawing OFF"}
              </button>
              <button
                type="button"
                onClick={handleExport}
                style={{
                  border: "1px solid rgba(93,242,191,0.45)",
                  background: "rgba(7,28,20,0.7)",
                  color: "#97f0d4",
                  borderRadius: 8,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                Export to Console
              </button>
              <button
                type="button"
                onClick={() => {
                  setZones([]);
                  setSelectedId(null);
                }}
                style={{
                  border: "1px solid rgba(255,120,120,0.55)",
                  background: "rgba(35,10,10,0.7)",
                  color: "#ff9b9b",
                  borderRadius: 8,
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                Clear All
              </button>
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
              Hold <strong>Ctrl</strong> and drag to draw. Drag zones to move. Use handles to resize.
            </div>
            <div style={{ fontSize: 12, opacity: 0.82 }}>
              Zones: <strong>{zones.length}</strong>
            </div>
            {selectedZone && (
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Name
                  <select
                    value={selectedZone.name}
                    onChange={(event) =>
                      updateZone(selectedZone.id, { name: event.target.value as ZoneName })
                    }
                    style={{
                      border: "1px solid rgba(93,242,191,0.4)",
                      background: "rgba(6,20,16,0.9)",
                      color: "#9fffe0",
                      borderRadius: 6,
                      padding: "5px 6px",
                    }}
                  >
                    {ZONE_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                  Explanation
                  <textarea
                    rows={3}
                    value={selectedZone.note}
                    onChange={(event) => updateZone(selectedZone.id, { note: event.target.value })}
                    style={{
                      border: "1px solid rgba(93,242,191,0.4)",
                      background: "rgba(6,20,16,0.9)",
                      color: "#9fffe0",
                      borderRadius: 6,
                      padding: "6px",
                      resize: "vertical",
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setZones((prev) => prev.filter((zone) => zone.id !== selectedZone.id));
                    setSelectedId(null);
                  }}
                  style={{
                    border: "1px solid rgba(255,120,120,0.55)",
                    background: "rgba(35,10,10,0.7)",
                    color: "#ff9b9b",
                    borderRadius: 8,
                    padding: "6px 10px",
                    cursor: "pointer",
                    width: "fit-content",
                  }}
                >
                  Delete Selected Zone
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          cursor: drawMode && ctrlHeld ? "crosshair" : "default",
          zIndex: 12001,
        }}
      />
    </div>
  );
}
