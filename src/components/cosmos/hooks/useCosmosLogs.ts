import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useRef, useState } from "react";
import type { ShipLogEntry } from "../../ui/ShipTerminal";

type LogFn = (message: string, data?: any) => void;
type ShipLogFn = (
  message: string,
  category?: ShipLogEntry["category"],
) => void;

/** Debug log entry — verbose internal tracing for the Debug tab */
export interface DebugLogEntry {
  id: number;
  text: string;
  source: string;   // e.g. "orbit", "nav", "render", "drone"
  timestamp: string;
}

type DebugLogFn = (source: string, message: string) => void;

type UseCosmosLogsResult = {
  consoleVisible: boolean;
  setConsoleVisible: Dispatch<SetStateAction<boolean>>;
  consoleLogs: string[];
  consoleLogsRef: MutableRefObject<string[]>;
  missionControlLogs: string[];
  missionControlLogsRef: MutableRefObject<string[]>;
  setConsoleLogs: Dispatch<SetStateAction<string[]>>;
  setMissionControlLogs: Dispatch<SetStateAction<string[]>>;
  vlog: LogFn;
  missionLog: LogFn;
  /** User-facing ship terminal log — typewriter effect in the HUD */
  shipLog: ShipLogFn;
  shipLogs: ShipLogEntry[];
  shipLogsRef: MutableRefObject<ShipLogEntry[]>;
  setShipLogs: Dispatch<SetStateAction<ShipLogEntry[]>>;
  /** Verbose debug log — shown in the Debug tab of the terminal */
  debugLog: DebugLogFn;
  debugLogs: DebugLogEntry[];
  debugLogsRef: MutableRefObject<DebugLogEntry[]>;
  setDebugLogs: Dispatch<SetStateAction<DebugLogEntry[]>>;
  /** Total debug logs ever produced (not capped by buffer) */
  debugLogTotal: number;
};

const MAX_SHIP_LOGS = 50;
const MAX_DEBUG_LOGS = 500;
let _shipLogId = 0;
let _debugLogId = 0;

export const useCosmosLogs = (): UseCosmosLogsResult => {
  const [consoleVisible, setConsoleVisible] = useState(true);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const consoleLogsRef = useRef<string[]>([]);

  const [missionControlLogs, setMissionControlLogs] = useState<string[]>([]);
  const missionControlLogsRef = useRef<string[]>([]);

  const [shipLogs, setShipLogs] = useState<ShipLogEntry[]>([]);
  const shipLogsRef = useRef<ShipLogEntry[]>([]);

  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const debugLogsRef = useRef<DebugLogEntry[]>([]);
  const [debugLogTotal, setDebugLogTotal] = useState(0);

  const vlog = useCallback<LogFn>((message, _data) => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 1,
    });
    const logMessage = `[${timestamp}] ${message}`;

    const newLogs = [...consoleLogsRef.current, logMessage];
    consoleLogsRef.current = newLogs;
    setConsoleLogs(newLogs);
  }, []);

  const missionLog = useCallback<LogFn>((message, _data) => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const logMessage = `[${timestamp}] ${message}`;

    const newLogs = [...missionControlLogsRef.current, logMessage];
    missionControlLogsRef.current = newLogs;
    setMissionControlLogs(newLogs);
  }, []);

  const shipLog = useCallback<ShipLogFn>((message, category = "info") => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const entry: ShipLogEntry = {
      id: ++_shipLogId,
      text: message,
      category,
      timestamp,
    };
    const next = [...shipLogsRef.current, entry];
    const trimmed = next.length > MAX_SHIP_LOGS ? next.slice(-MAX_SHIP_LOGS) : next;
    shipLogsRef.current = trimmed;
    setShipLogs(trimmed);
  }, []);

  const debugLog = useCallback<DebugLogFn>((source, message) => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 2,
    });
    const entry: DebugLogEntry = {
      id: ++_debugLogId,
      text: message,
      source,
      timestamp,
    };
    const next = [...debugLogsRef.current, entry];
    const trimmed = next.length > MAX_DEBUG_LOGS ? next.slice(-MAX_DEBUG_LOGS) : next;
    debugLogsRef.current = trimmed;
    setDebugLogs(trimmed);
    setDebugLogTotal(_debugLogId);
  }, []);

  return {
    consoleVisible,
    setConsoleVisible,
    consoleLogs,
    consoleLogsRef,
    missionControlLogs,
    missionControlLogsRef,
    setConsoleLogs,
    setMissionControlLogs,
    vlog,
    missionLog,
    shipLog,
    shipLogs,
    shipLogsRef,
    setShipLogs,
    debugLog,
    debugLogs,
    debugLogsRef,
    setDebugLogs,
    debugLogTotal,
  };
};
