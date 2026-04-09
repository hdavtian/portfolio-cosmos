import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined;
const POSTHOG_OWNER_ID =
  (import.meta.env.VITE_POSTHOG_OWNER_ID as string | undefined) ||
  "owner:harmad";
const POSTHOG_OWNER_EMAIL =
  (import.meta.env.VITE_POSTHOG_OWNER_EMAIL as string | undefined) ||
  "harmad@harmadavtian.com";

const PRODUCTION_HOSTNAMES: ReadonlySet<string> = new Set([
  "harmadavtian.com",
  "www.harmadavtian.com",
]);

const OWNER_STORAGE_KEY = "__so_enabled";
const OWNER_URL_PARAM = "__so";
const OWNER_EVENT_PROPERTIES: Readonly<Record<string, unknown>> = {
  traffic_type: "owner",
  is_internal_owner: true,
};

type OwnerModeSource = "manual" | "url" | "storage";

type OwnerStatus = {
  initialized: boolean;
  productionHost: boolean;
  ownerMarked: boolean;
  distinctId: string | null;
};

type SiteOwnerConsoleApi = {
  enable: () => boolean;
  disable: () => void;
  status: () => OwnerStatus;
};

declare global {
  interface Window {
    __so?: SiteOwnerConsoleApi;
  }
}

function isProductionHost(): boolean {
  try {
    return PRODUCTION_HOSTNAMES.has(window.location.hostname);
  } catch {
    return false;
  }
}

let initialized = false;

function readOwnerMarker(): boolean {
  try {
    return window.localStorage.getItem(OWNER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOwnerMarker(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.setItem(OWNER_STORAGE_KEY, "1");
      return;
    }
    window.localStorage.removeItem(OWNER_STORAGE_KEY);
  } catch {
    // Ignore storage failures (private browsing, blocked storage, etc.)
  }
}

function isOwnerUrlActivationRequested(): boolean {
  try {
    const paramValue = new URLSearchParams(window.location.search).get(
      OWNER_URL_PARAM,
    );
    if (paramValue === null) return false;
    if (paramValue === "") return true;
    const normalized = paramValue.toLowerCase();
    return (
      normalized === "1" ||
      normalized === "true" ||
      normalized === "yes" ||
      normalized === "on"
    );
  } catch {
    return false;
  }
}

function clearOwnerUrlActivationParam(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(OWNER_URL_PARAM)) return;
    url.searchParams.delete(OWNER_URL_PARAM);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  } catch {
    // Ignore URL rewrite failures
  }
}

function buildOwnerSetProperties(source: OwnerModeSource): Record<string, unknown> {
  return {
    email: POSTHOG_OWNER_EMAIL,
    owner_label: "harmad",
    is_internal_owner: true,
    owner_mode_source: source,
  };
}

function ensureOwnerIdentity(source: OwnerModeSource): boolean {
  if (!initialized) return false;

  const currentDistinctId = posthog.get_distinct_id();
  if (currentDistinctId !== POSTHOG_OWNER_ID) {
    posthog.identify(POSTHOG_OWNER_ID, buildOwnerSetProperties(source), {
      owner_first_identified_at: new Date().toISOString(),
      owner_first_identified_source: source,
    });
  }

  posthog.register(OWNER_EVENT_PROPERTIES);
  return true;
}

function enableOwnerMode(source: OwnerModeSource): boolean {
  if (!initialized) return false;
  writeOwnerMarker(true);
  return ensureOwnerIdentity(source);
}

function disableOwnerMode(): void {
  if (!initialized) {
    writeOwnerMarker(false);
    return;
  }

  writeOwnerMarker(false);
  posthog.unregister("traffic_type");
  posthog.unregister("is_internal_owner");
  posthog.reset();
}

function getOwnerStatus(): OwnerStatus {
  return {
    initialized,
    productionHost: isProductionHost(),
    ownerMarked: readOwnerMarker(),
    distinctId: initialized ? posthog.get_distinct_id() : null,
  };
}

function registerOwnerConsoleApi(): void {
  // Minimal global surface so you can toggle owner mode directly from browser devtools.
  window.__so = {
    enable: () => enableOwnerMode("manual"),
    disable: () => disableOwnerMode(),
    status: () => getOwnerStatus(),
  };
}

export function initAnalytics(): void {
  if (initialized || !POSTHOG_KEY) return;
  if (!isProductionHost()) return;
  initialized = true;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST || "https://us.i.posthog.com",
    defaults: "2026-01-30",
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
  });

  registerOwnerConsoleApi();

  if (readOwnerMarker()) {
    ensureOwnerIdentity("storage");
  }

  if (isOwnerUrlActivationRequested()) {
    enableOwnerMode("url");
    clearOwnerUrlActivationParam();
  }
}

export function trackEvent(
  name: string,
  properties?: Record<string, unknown>,
): void {
  if (!initialized) return;
  posthog.capture(name, properties);
}

export function trackPageView(
  path: string,
  properties?: Record<string, unknown>,
): void {
  if (!initialized) return;
  posthog.capture("$pageview", { $current_url: path, ...properties });
}
