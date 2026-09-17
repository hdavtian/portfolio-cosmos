import { useCallback, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { useLocation } from "react-router-dom";
import { ApiError } from "../lib/apiClient";
import { friendlyDetailLines } from "../lib/validationMessages";
import { StatusContext, type StatusApi, type StatusMessage, type StatusSeverity } from "../lib/status";

const SUCCESS_TIMEOUT_MS = 6000;

/**
 * Action results for the whole admin: one on-page status line instead of
 * pop-ups. Success clears itself; errors stay until dismissed or replaced.
 */
export function StatusProvider({ children }: PropsWithChildren) {
  const location = useLocation();
  const [current, setCurrent] = useState<StatusMessage | null>(null);
  const nextId = useRef(1);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback(
    (severity: StatusSeverity, message: string, details: string[] = []) => {
      window.clearTimeout(timer.current);
      const id = nextId.current++;
      setCurrent({ id, severity, message, details, pathname: location.pathname });

      if (severity === "Success" || severity === "Info") {
        timer.current = window.setTimeout(() => {
          // Only clear the message this timer was started for.
          setCurrent((existing) => (existing?.id === id ? null : existing));
        }, SUCCESS_TIMEOUT_MS);
      }
    },
    [location.pathname],
  );

  const api = useMemo<StatusApi>(
    () => ({
      // Errors belong to the page they happened on. Success messages survive
      // navigation (e.g. creating a record moves to its new URL) and expire.
      current:
        current && (current.severity !== "Error" || current.pathname === location.pathname)
          ? current
          : null,
      success: (message) => show("Success", message),
      info: (message) => show("Info", message),
      failure: (message, details = []) => show("Error", message, details),
      error: (error, fallback = "Something went wrong.") => {
        if (error instanceof ApiError) {
          const details = friendlyDetailLines(error.details);
          const message = error.isConflict
            ? `${error.message} Your changes are still on screen: reload to see the current version, then reapply them.`
            : details.length > 0
              ? `${fallback} ${details.length === 1 ? "One field needs" : `${details.length} fields need`} fixing; each is marked on the form.`
              : error.message || fallback;
          show("Error", message, details);
          return;
        }
        show("Error", fallback);
      },
      clear: () => {
        window.clearTimeout(timer.current);
        setCurrent(null);
      },
    }),
    [current, location.pathname, show],
  );

  return <StatusContext.Provider value={api}>{children}</StatusContext.Provider>;
}
