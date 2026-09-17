import { createContext, useContext } from "react";

export type StatusSeverity = "Success" | "Error" | "Warning" | "Info";

export interface StatusMessage {
  id: number;
  severity: StatusSeverity;
  message: string;
  /** Extra lines, e.g. each invalid field from a validation failure. */
  details: string[];
  /** The page the message belongs to; it is hidden once you navigate away. */
  pathname: string;
}

export interface StatusApi {
  current: StatusMessage | null;
  success: (message: string) => void;
  /** Reports an API or unexpected error, listing field details when present. */
  error: (error: unknown, fallback?: string) => void;
  /** An error that did not come from a single API call, e.g. a batch of uploads. */
  failure: (message: string, details?: string[]) => void;
  info: (message: string) => void;
  clear: () => void;
}

// Lives outside StatusProvider.tsx so that file exports only a component (fast refresh).
export const StatusContext = createContext<StatusApi | null>(null);

export function useStatus(): StatusApi {
  const api = useContext(StatusContext);
  if (!api) throw new Error("useStatus must be used inside StatusProvider");
  return api;
}
