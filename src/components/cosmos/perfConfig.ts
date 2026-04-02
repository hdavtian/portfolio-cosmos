/**
 * Runtime performance profile configuration.
 *
 * Resolution order (last wins):
 *   defaults → VITE_COSMOS_PERF_PROFILE env → localStorage → URL ?cosmosPerf=
 *
 * Profiles:
 *   "baseline" — no runtime mitigations, current behavior.
 *   "balanced" — adaptive DPR + secondary-pass throttling under sustained pressure.
 */

export type PerfProfile = "baseline" | "balanced";

export interface PerfFlags {
  profile: PerfProfile;
  /** Cap DPR to this value (0 = no cap, use device default). */
  maxDpr: number;
  /** Minimum internal render scale during adaptive degradation (0–1). */
  minRenderScale: number;
  /** Frame-time threshold (ms) above which we begin degrading. */
  spikeThresholdMs: number;
  /** Number of consecutive heavy frames before degrading. */
  degradeAfterFrames: number;
  /** Number of consecutive stable frames before recovering. */
  recoverAfterFrames: number;
  /** When true, skip TV/dashcam updates during sustained pressure. */
  throttleSecondaryPasses: boolean;
  /** Run label occlusion raycasts every Nth frame (1 = every frame). */
  labelOcclusionCadence: number;
}

const DEFAULTS: Record<PerfProfile, PerfFlags> = {
  baseline: {
    profile: "baseline",
    maxDpr: 0,
    minRenderScale: 1,
    spikeThresholdMs: 50,
    degradeAfterFrames: 6,
    recoverAfterFrames: 90,
    throttleSecondaryPasses: false,
    labelOcclusionCadence: 1,
  },
  balanced: {
    profile: "balanced",
    maxDpr: 2,
    minRenderScale: 0.7,
    spikeThresholdMs: 38,
    degradeAfterFrames: 4,
    recoverAfterFrames: 60,
    throttleSecondaryPasses: true,
    labelOcclusionCadence: 3,
  },
};

let _cached: PerfFlags | null = null;

function resolveProfile(): PerfProfile {
  let profile: PerfProfile = "balanced";

  try {
    const envVal = (import.meta as any).env?.VITE_COSMOS_PERF_PROFILE;
    if (envVal === "baseline" || envVal === "balanced") profile = envVal;
  } catch { /* noop */ }

  try {
    const ls = localStorage.getItem("cosmosPerfProfile");
    if (ls === "baseline" || ls === "balanced") profile = ls;
  } catch { /* noop */ }

  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("cosmosPerf");
    if (param === "baseline" || param === "balanced") profile = param;
  } catch { /* noop */ }

  return profile;
}

export function getCosmosPerfFlags(): PerfFlags {
  if (_cached) return _cached;
  const profile = resolveProfile();
  _cached = { ...DEFAULTS[profile] };
  return _cached;
}

/** Force-reset cache (for testing / live override). */
export function resetPerfFlagsCache(): void {
  _cached = null;
}
