import React, { useEffect, useMemo, useRef, useState } from "react";
import "./UniverseLogsTerminal.scss";

type UniverseLogsTerminalProps = {
  logs: string[];
  visible?: boolean;
};

const getRandomDelay = () => Math.floor(Math.random() * 90 + 20);

const UniverseLogsTerminal: React.FC<UniverseLogsTerminalProps> = ({
  logs,
  visible = true,
}) => {
  const [typingText, setTypingText] = useState<string | null>(null);
  const [typingDisplay, setTypingDisplay] = useState<string>("");
  const lastLogRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    if (logs.length === 0) {
      lastLogRef.current = null;
      setTypingText(null);
      setTypingDisplay("");
      return;
    }

    const latest = logs[logs.length - 1];
    if (latest !== lastLogRef.current) {
      lastLogRef.current = latest;
      setTypingText(latest);
      setTypingDisplay("");
    }
  }, [logs, visible]);

  useEffect(() => {
    if (!typingText) return;

    if (typingDisplay.length >= typingText.length) {
      setTypingText(null);
      setTypingDisplay("");
      return;
    }

    const timeout = window.setTimeout(() => {
      setTypingDisplay(typingText.slice(0, typingDisplay.length + 1));
    }, getRandomDelay());

    return () => window.clearTimeout(timeout);
  }, [typingDisplay, typingText]);

  const renderedLogs = useMemo(() => {
    if (logs.length === 0) return [] as string[];

    const staticLogs = logs.slice(0, -1);
    const latest = logs[logs.length - 1];
    const displayLatest = typingText ? typingDisplay : latest;
    const combined = [...staticLogs, displayLatest].filter(Boolean);

    return combined.slice().reverse();
  }, [logs, typingDisplay, typingText]);

  if (!visible) return null;

  return (
    <div className="universe-terminal__wrapper">
      <output className="universe-terminal" aria-live="polite">
        {renderedLogs.length === 0 ? (
          <div className="universe-terminal__empty">
            [ UNIVERSE LOGS - READY ]
          </div>
        ) : (
          renderedLogs.map((log, index) => {
            const isTypingLine =
              typingText && index === 0 && log === typingDisplay;
            return (
              <q
                key={`${index}-${log.slice(0, 12)}`}
                className={`universe-terminal__line${
                  isTypingLine ? " universe-terminal__line--typing" : ""
                }`}
              >
                {log}
              </q>
            );
          })
        )}
      </output>
    </div>
  );
};

export default UniverseLogsTerminal;
