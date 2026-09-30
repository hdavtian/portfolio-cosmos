import posthog from "posthog-js";

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as
  | string
  | undefined;

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

type GtagCommand = (...args: unknown[]) => void;

declare global {
  interface Window {
    __so?: SiteOwnerConsoleApi;
    dataLayer?: unknown[];
    gtag?: GtagCommand;
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
let gaLoaded = false;

/* ---------------------------------------------------------------------------
 * Google Analytics
 *
 * The tag is loaded here rather than pasted into index.html, so it is held to
 * the same rule as PostHog: production hostnames only. In the document head it
 * would also run on localhost, on previews and in the admin app, and report all
 * of that as traffic to the site.
 *
 * Page views are left to GA: `config` sends one for the first load, and the
 * stream's Enhanced measurement sends one per history change, which is what a
 * client-side route change is here. None are sent from this file, so there is
 * nothing to double-count. If route changes ever stop appearing in GA, check
 * that setting before adding anything here.
 * ------------------------------------------------------------------------- */

// The documented snippet pushes `arguments`; this keeps that shape exactly.
const gtag: GtagCommand = function gtag() {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer?.push(arguments);
} as GtagCommand;

/**
 * Owner traffic is marked for GA the way it is for PostHog. `traffic_type:
 * "internal"` is the parameter GA's own internal-traffic filter reads, so the
 * site's owner can be excluded from reports without excluding anyone else.
 */
function gaParameters(
  properties?: Record<string, unknown>,
): Record<string, unknown> {
  return readOwnerMarker()
    ? { ...properties, ...OWNER_EVENT_PROPERTIES, traffic_type: "internal" }
    : { ...properties };
}

function initGoogleAnalytics(): void {
  if (gaLoaded || !GA_MEASUREMENT_ID) return;
  gaLoaded = true;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, {
    ...gaParameters(),
    // The owner's own visits show up in GA's DebugView, which is how this
    // integration is checked without waiting on reports.
    ...(readOwnerMarker() ? { debug_mode: true } : {}),
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

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
  // The marker is written whichever destination is configured, so owner mode
  // still works on a site that has GA but no PostHog.
  writeOwnerMarker(true);
  if (gaLoaded) gtag("set", { ...OWNER_EVENT_PROPERTIES, traffic_type: "internal" });
  if (!initialized) return false;
  return ensureOwnerIdentity(source);
}

function disableOwnerMode(): void {
  writeOwnerMarker(false);
  // GA has no "unset": the marker is what gaParameters reads, so events stop
  // carrying it from here. This clears what the config call already set.
  if (gaLoaded) gtag("set", { traffic_type: undefined, is_internal_owner: undefined });
  if (!initialized) return;

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
  // One gate for both: nothing reports from localhost, a preview or the admin.
  if (!isProductionHost()) return;
  initGoogleAnalytics();
  if (initialized || !POSTHOG_KEY) return;
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

/**
 * One call, both destinations. Every event in the site goes through here, so
 * adding GA meant changing this function rather than the 25 places that raise
 * an event. The two are independent: whichever is configured receives it.
 */
export function trackEvent(
  name: string,
  properties?: Record<string, unknown>,
): void {
  if (initialized) posthog.capture(name, properties);
  // GA event names allow letters, numbers and underscores; ours are snake_case
  // already, so they carry across unchanged and the two can be compared.
  if (gaLoaded) gtag("event", name, gaParameters(properties));
}

export function trackPageView(
  path: string,
  properties?: Record<string, unknown>,
): void {
  if (!initialized) return;
  posthog.capture("$pageview", { $current_url: path, ...properties });
}
