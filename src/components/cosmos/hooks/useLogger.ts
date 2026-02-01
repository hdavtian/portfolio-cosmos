/**
 * useLogger - Hook for managing on-screen logging with timestamps
 */

import { useState, useRef, useCallback } from "react";

export interface LoggerOptions {
  maxConsoleLog?: number;
  maxShipLogs?: number;
  enableTimestamps?: boolean;
}

export interface LoggerResult {
  consoleLogs: string[];
  shipLogs: string[];
  vlog: (message: string) => void;
  shipLog: (message: string) => void;
  clearConsoleLogs: () => void;
  clearShipLogs: () => void;
  clearAllLogs: () => void;
}

/**
 * Manage on-screen logging with timestamps
 */
export function useLogger(options: LoggerOptions = {}): LoggerResult {
  const {
    maxConsoleLog = 50,
    maxShipLogs = 20,
    enableTimestamps = true,
  } = options;

  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [shipLogs, setShipLogs] = useState<string[]>([]);

  const consoleLogsRef = useRef<string[]>([]);
  const shipLogsRef = useRef<string[]>([]);

  // Format timestamp
  const getTimestamp = useCallback(() => {
    if (!enableTimestamps) return "";
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const seconds = now.getSeconds().toString().padStart(2, "0");
    return `[${hours}:${minutes}:${seconds}]`;
  }, [enableTimestamps]);

  // Virtual console log (main console)
  const vlog = useCallback(
    (message: string) => {
      const timestamp = getTimestamp();
      const logMessage = timestamp ? `${timestamp} ${message}` : message;

      console.log(logMessage);

      consoleLogsRef.current.push(logMessage);
      if (consoleLogsRef.current.length > maxConsoleLog) {
        consoleLogsRef.current.shift();
      }

      setConsoleLogs([...consoleLogsRef.current]);
    },
    [getTimestamp, maxConsoleLog],
  );

  // Spaceship mission control log
  const shipLog = useCallback(
    (message: string) => {
      const timestamp = getTimestamp();
      const logMessage = timestamp ? `${timestamp} ${message}` : message;

      console.log(`[SHIP] ${logMessage}`);

      shipLogsRef.current.push(logMessage);
      if (shipLogsRef.current.length > maxShipLogs) {
        shipLogsRef.current.shift();
      }

      setShipLogs([...shipLogsRef.current]);
    },
    [getTimestamp, maxShipLogs],
  );

  // Clear console logs
  const clearConsoleLogs = useCallback(() => {
    consoleLogsRef.current = [];
    setConsoleLogs([]);
  }, []);

  // Clear ship logs
  const clearShipLogs = useCallback(() => {
    shipLogsRef.current = [];
    setShipLogs([]);
  }, []);

  // Clear all logs
  const clearAllLogs = useCallback(() => {
    clearConsoleLogs();
    clearShipLogs();
  }, [clearConsoleLogs, clearShipLogs]);

  return {
    consoleLogs,
    shipLogs,
    vlog,
    shipLog,
    clearConsoleLogs,
    clearShipLogs,
    clearAllLogs,
  };
}
