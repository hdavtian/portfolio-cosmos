import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useRef, useState } from "react";

type LogFn = (message: string, data?: any) => void;

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
};

export const useCosmosLogs = (): UseCosmosLogsResult => {
  const [consoleVisible, setConsoleVisible] = useState(true);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const consoleLogsRef = useRef<string[]>([]);

  const [missionControlLogs, setMissionControlLogs] = useState<string[]>([]);
  const missionControlLogsRef = useRef<string[]>([]);

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
  };
};
