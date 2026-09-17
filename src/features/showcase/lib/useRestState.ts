import { useEffect, useState } from "react";

/**
 * "awake"   the visitor is active.
 * "fading"  they've gone still; the page is letting go.
 * "resting" they're just watching; the page shows as a watermark.
 * "waking"  they moved again; the page comes back.
 */
export type RestState = "awake" | "fading" | "resting" | "waking";

const FADE_MS = 1600;
const WAKE_MS = 1100;
const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "wheel", "keydown", "scroll", "touchstart"] as const;

/** Tracks whether the visitor has gone still long enough to just be watching. */
export function useRestState(idleMs: number): RestState {
  const [state, setState] = useState<RestState>("awake");

  useEffect(() => {
    let current: RestState = "awake";
    let idleTimer = 0;
    let stepTimer = 0;
    const set = (next: RestState) => {
      current = next;
      setState(next);
    };
    const scheduleRest = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        set("fading");
        stepTimer = window.setTimeout(() => set("resting"), FADE_MS);
      }, idleMs);
    };
    const onActivity = () => {
      if (current === "fading" || current === "resting") {
        window.clearTimeout(stepTimer);
        set("waking");
        stepTimer = window.setTimeout(() => set("awake"), WAKE_MS);
      }
      scheduleRest();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
    scheduleRest();
    return () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(stepTimer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [idleMs]);

  return state;
}
