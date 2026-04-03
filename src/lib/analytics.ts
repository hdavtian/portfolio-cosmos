import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

const PRODUCTION_HOSTNAMES: ReadonlySet<string> = new Set([
  "harmadavtian.com",
  "www.harmadavtian.com",
]);

function isProductionHost(): boolean {
  try {
    return PRODUCTION_HOSTNAMES.has(window.location.hostname);
  } catch {
    return false;
  }
}

let initialized = false;

export function initAnalytics(): void {
  if (initialized || !POSTHOG_KEY) return;
  if (!isProductionHost()) return;
  initialized = true;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST || "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
  });
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
