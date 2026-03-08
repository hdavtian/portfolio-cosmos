import React, { useEffect, useMemo, useState } from "react";
import {
  subscribeOnScreenMessages,
  subscribeOnScreenTelemetry,
  type OnScreenMessage,
  type OnScreenTelemetry,
} from "./onScreenMessaging";

const MAX_VISIBLE_MESSAGES = 3;
const FADE_DURATION_MS = 420;

const UserOnScreenMessages: React.FC = () => {
  const [messages, setMessages] = useState<OnScreenMessage[]>([]);
  const [visibleIds, setVisibleIds] = useState<Record<number, boolean>>({});
  const [telemetry, setTelemetry] = useState<OnScreenTelemetry>({
    distance: null,
    speed: null,
  });
  const [displayDistance, setDisplayDistance] = useState(0);
  const [displaySpeed, setDisplaySpeed] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeOnScreenMessages((message) => {
      setMessages((prev) => [message, ...prev].slice(0, MAX_VISIBLE_MESSAGES));

      setVisibleIds((prev) => ({ ...prev, [message.id]: false }));
      window.setTimeout(() => {
        setVisibleIds((prev) => ({ ...prev, [message.id]: true }));
      }, 10);

      window.setTimeout(() => {
        setVisibleIds((prev) => ({ ...prev, [message.id]: false }));
      }, Math.max(0, message.durationMs - FADE_DURATION_MS));

      window.setTimeout(() => {
        setMessages((prev) => prev.filter((entry) => entry.id !== message.id));
        setVisibleIds((prev) => {
          const next = { ...prev };
          delete next[message.id];
          return next;
        });
      }, message.durationMs);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    return subscribeOnScreenTelemetry((nextTelemetry) => {
      setTelemetry(nextTelemetry);
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDisplayDistance((prev) => {
        const target = telemetry.distance ?? 0;
        if (Math.abs(target - prev) < 0.5) return target;
        const delta = target - prev;
        const step = Math.max(0.8, Math.abs(delta) * 0.18);
        return prev + Math.sign(delta) * step;
      });
      setDisplaySpeed((prev) => {
        const target = telemetry.speed ?? 0;
        if (Math.abs(target - prev) < 0.05) return target;
        const delta = target - prev;
        const step = Math.max(0.03, Math.abs(delta) * 0.22);
        return prev + Math.sign(delta) * step;
      });
    }, 70);
    return () => window.clearInterval(timer);
  }, [telemetry.distance, telemetry.speed]);

  const renderedMessages = useMemo(
    () => messages.slice(0, MAX_VISIBLE_MESSAGES),
    [messages],
  );
  const showKpis = telemetry.distance !== null || telemetry.speed !== null;
  if (!showKpis && renderedMessages.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: "max(92px, calc(env(safe-area-inset-bottom) + 92px))",
        transform: "translateX(-50%)",
        zIndex: 1116,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        width: "min(76vw, 760px)",
      }}
    >
      {showKpis && (
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            justifyContent: "center",
            gap: 6,
            width: "100%",
          }}
        >
          {telemetry.distance !== null && (
            <div
              style={{
                minWidth: 112,
                padding: "3px 6px",
                borderRadius: 6,
                border: "1px solid rgba(80, 220, 255, 0.65)",
                background: "rgba(4, 14, 24, 0.72)",
                boxShadow: "0 0 8px rgba(48, 196, 255, 0.2)",
                fontFamily: "'Orbitron', 'Share Tech Mono', 'Courier New', monospace",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 8, color: "rgba(138, 225, 255, 0.78)", letterSpacing: 0.9 }}>
                DIST
              </div>
              <div
                style={{
                  marginTop: 1,
                  fontSize: 12,
                  color: "#b8f3ff",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textShadow: "0 0 8px rgba(83, 218, 255, 0.3)",
                }}
              >
                {`${Math.max(0, displayDistance).toFixed(0)}u`}
              </div>
            </div>
          )}

          {telemetry.speed !== null && (
            <div
              style={{
                minWidth: 112,
                padding: "3px 6px",
                borderRadius: 6,
                border: "1px solid rgba(124, 247, 170, 0.65)",
                background: "rgba(4, 20, 14, 0.72)",
                boxShadow: "0 0 8px rgba(107, 239, 173, 0.2)",
                fontFamily: "'Orbitron', 'Share Tech Mono', 'Courier New', monospace",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 8, color: "rgba(154, 255, 197, 0.78)", letterSpacing: 0.9 }}>
                SPEED
              </div>
              <div
                style={{
                  marginTop: 1,
                  fontSize: 12,
                  color: "#d2ffe7",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textShadow: "0 0 8px rgba(90, 245, 171, 0.3)",
                }}
              >
                {`${Math.max(0, displaySpeed).toFixed(2)}u/s`}
              </div>
            </div>
          )}
        </div>
      )}

      {renderedMessages.length === 0 ? null : renderedMessages.map((message, index) => {
        const isNewest = index === 0;
        const visible = !!visibleIds[message.id];
        return (
          <div
            key={message.id}
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0px)" : "translateY(4px)",
              transition: `opacity ${FADE_DURATION_MS}ms ease, transform ${FADE_DURATION_MS}ms ease`,
              color: isNewest ? "rgba(156, 239, 255, 0.98)" : "rgba(156, 239, 255, 0.58)",
              fontSize: isNewest ? 18 : 13,
              fontWeight: isNewest ? 700 : 500,
              letterSpacing: isNewest ? 0.45 : 0.2,
              lineHeight: 1.3,
              textAlign: "center",
              textShadow: isNewest
                ? "0 0 12px rgba(68, 215, 255, 0.45)"
                : "0 0 6px rgba(68, 215, 255, 0.22)",
              fontFamily: "'Rajdhani', 'Segoe UI', sans-serif",
              maxWidth: "100%",
            }}
          >
            {message.text}
          </div>
        );
      })}
    </div>
  );
};

export default UserOnScreenMessages;
