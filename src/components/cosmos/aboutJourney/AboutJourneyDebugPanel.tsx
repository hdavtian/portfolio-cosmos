import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AboutJourneyController,
  AboutJourneyState,
} from "./AboutJourneyController";
import type {
  AboutParticleSwarmDebugState,
  AboutParticleSwarmHandle,
} from "./AboutParticleSwarm";

type Props = {
  enabled: boolean;
  debugEnabled?: boolean;
  journeyRef: React.MutableRefObject<AboutJourneyController | null>;
  swarmRef: React.MutableRefObject<AboutParticleSwarmHandle | null>;
};

type PanelData = {
  journey: AboutJourneyState | null;
  swarm: AboutParticleSwarmDebugState | null;
  travelSpeedScale: number;
  travelInputDirection: -1 | 0 | 1;
  updatedAtMs: number;
};

const PANEL_W = 320;
const PANEL_H = 220;

const clampPanelPosition = (x: number, y: number): { x: number; y: number } => {
  const maxX = Math.max(8, window.innerWidth - PANEL_W - 8);
  const maxY = Math.max(8, window.innerHeight - PANEL_H - 8);
  return {
    x: Math.min(maxX, Math.max(8, x)),
    y: Math.min(maxY, Math.max(8, y)),
  };
};

export default function AboutJourneyDebugPanel({
  enabled,
  debugEnabled = false,
  journeyRef,
  swarmRef,
}: Props): React.JSX.Element | null {
  const [minimized, setMinimized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: 16,
    y: 16,
  });
  const [panelData, setPanelData] = useState<PanelData>({
    journey: null,
    swarm: null,
    travelSpeedScale: 1,
    travelInputDirection: 0,
    updatedAtMs: 0,
  });

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPanelX: number;
    startPanelY: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let raf = 0;
    let lastSyncMs = 0;

    const tick = () => {
      const now = performance.now();
      if (now - lastSyncMs >= 120) {
        lastSyncMs = now;
        const journeyCtrl = journeyRef.current;
        const journey = journeyCtrl?.state ?? null;
        const swarm = swarmRef.current?.getDebugState() ?? null;
        const travelSpeedScale = journeyCtrl?.travelSpeedScale ?? 1;
        const travelInputDirection = journeyCtrl?.travelInputDirection ?? 0;
        setPanelData({
          journey,
          swarm,
          travelSpeedScale,
          travelInputDirection,
          updatedAtMs: now,
        });
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [enabled, journeyRef, swarmRef]);

  useEffect(() => {
    if (!enabled) return;

    const onResize = () => {
      setPosition((prev) => clampPanelPosition(prev.x, prev.y));
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [enabled]);

  const onHeaderPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanelX: position.x,
      startPanelY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHeaderPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    setPosition(
      clampPanelPosition(drag.startPanelX + dx, drag.startPanelY + dy),
    );
  };

  const onHeaderPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const ageMs = useMemo(() => {
    if (!panelData.updatedAtMs) return "-";
    const age = Math.max(0, performance.now() - panelData.updatedAtMs);
    return `${Math.round(age)}ms`;
  }, [panelData.updatedAtMs]);

  if (!enabled || !debugEnabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width: PANEL_W,
        zIndex: 1500,
        color: "#d7f6ff",
        background: "rgba(4, 12, 24, 0.88)",
        border: "1px solid rgba(122, 226, 255, 0.55)",
        borderRadius: 10,
        boxShadow: "0 10px 28px rgba(0, 0, 0, 0.45)",
        fontFamily: "'IBM Plex Mono', 'Fira Code', Consolas, monospace",
        userSelect: "none",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
        style={{
          cursor: "grab",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 10px",
          borderBottom: minimized
            ? "none"
            : "1px solid rgba(122, 226, 255, 0.35)",
          background:
            "linear-gradient(90deg, rgba(18, 51, 77, 0.95), rgba(26, 29, 57, 0.95))",
          borderRadius: minimized ? 10 : "10px 10px 0 0",
        }}
      >
        <strong style={{ fontSize: 12, letterSpacing: 0.7 }}>
          ABOUT PARTICLE DEBUG
        </strong>
        <button
          type="button"
          onClick={() => setMinimized((prev) => !prev)}
          style={{
            border: "1px solid rgba(170, 242, 255, 0.55)",
            background: "rgba(8, 19, 36, 0.82)",
            color: "#c4f1ff",
            borderRadius: 5,
            fontSize: 11,
            lineHeight: 1,
            padding: "4px 6px",
            cursor: "pointer",
          }}
        >
          {minimized ? "Expand" : "Minimize"}
        </button>
      </div>

      {!minimized && (
        <div style={{ padding: 10, display: "grid", gap: 8, fontSize: 12 }}>
          <div style={{ color: "#9fd6e5", opacity: 0.92 }}>
            Live telemetry age: {ageMs}
          </div>

          <div
            style={{
              padding: 8,
              border: "1px solid rgba(130, 220, 255, 0.2)",
              borderRadius: 6,
            }}
          >
            <div style={{ marginBottom: 4, color: "#82d9f1", fontWeight: 700 }}>
              Journey
            </div>
            <div>phase: {panelData.journey?.phaseName ?? "-"}</div>
            <div>phase id: {panelData.journey?.phase ?? "-"}</div>
            <div>
              phase age:{" "}
              {panelData.journey
                ? `${Math.round((performance.now() - panelData.journey.phaseStartedAt) / 1000)}s`
                : "-"}
            </div>
            <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
              <div>
                travel speed: {panelData.travelSpeedScale.toFixed(2)}x
                {Math.abs(panelData.travelSpeedScale) <= 0.02
                  ? " (stopped)"
                  : panelData.travelSpeedScale < 0
                    ? " (reverse)"
                    : " (forward)"}
              </div>
              <div style={{ color: "#9fd6e5" }}>
                Held input:{" "}
                {panelData.travelInputDirection === 0
                  ? "neutral"
                  : panelData.travelInputDirection > 0
                    ? "forward"
                    : "reverse"}
              </div>
            </div>
          </div>

          <div
            style={{
              padding: 8,
              border: "1px solid rgba(130, 220, 255, 0.2)",
              borderRadius: 6,
            }}
          >
            <div style={{ marginBottom: 4, color: "#82d9f1", fontWeight: 700 }}>
              Path Swarm
            </div>
            <div>hold mode: {panelData.swarm?.holdMode ? "yes" : "no"}</div>
            <div>
              path complete: {panelData.swarm?.pathComplete ? "yes" : "no"}
            </div>
            <div>
              active particles: {panelData.swarm?.activeParticles ?? "-"}
            </div>
            <div>
              path head t:{" "}
              {panelData.swarm ? panelData.swarm.pathHeadT.toFixed(3) : "-"}
            </div>
            <div>
              pulse profile: {panelData.swarm?.holdPulseProfileName ?? "-"}
            </div>
            <div>
              profile switch in:{" "}
              {panelData.swarm
                ? `${Math.max(0, Math.ceil(panelData.swarm.nextProfileSwitchInMs / 1000))}s`
                : "-"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
