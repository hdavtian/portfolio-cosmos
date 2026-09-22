export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8080";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^\[fc00:/i,
  /^\[fd[0-9a-f]{2}:/i,
];

function isPrivateHost(host: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

/**
 * Modern Chromium browsers prompt the user with a "wants to access other apps
 * and services on this device" / "local network" dialog whenever a public
 * origin (e.g. https://harmadavtian.com) issues a fetch to a private/loopback
 * address (Local Network Access). If the build did not get a real
 * VITE_API_BASE_URL injected and the page is being served from a public host,
 * skip the network call entirely and use the bundled fallback content.
 */
export function shouldSkipApiRequest(): boolean {
  try {
    const apiUrl = new URL(API_BASE_URL, window.location.href);
    const pageHost = window.location.hostname;
    if (!isPrivateHost(apiUrl.hostname)) return false;
    if (isPrivateHost(pageHost)) return false;
    return true;
  } catch {
    return false;
  }
}
