const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as
  | string
  | undefined;

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

export function initGA() {
  if (initialized || !GA_MEASUREMENT_ID) return;
  if (!isProductionHost()) return;
  initialized = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  }
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, {
    debug_mode: !isProductionHost(),
  });
}

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}
