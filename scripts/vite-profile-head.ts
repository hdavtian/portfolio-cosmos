import type { Plugin } from "vite";

// Writes the published profile into index.html during production builds, so
// link previews (LinkedIn, Slack, X, iMessage) and crawlers that do not run
// JavaScript see the current name and title. The browser tab is kept current
// separately at runtime (src/app/providers/ProfileDocumentTitle.tsx).
//
// Build-time only: a change published in the admin reaches link previews on the
// next deploy. If the API is unreachable or has nothing published, the defaults
// already in index.html are kept and the build carries on.

interface Profile {
  name: string;
  title: string;
  summary: string;
}

const FETCH_TIMEOUT_MS = 8000;
const DESCRIPTION_MAX = 200;

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const describe = (summary: string) => {
  const text = summary.replace(/\s+/g, " ").trim();
  if (text.length <= DESCRIPTION_MAX) return text;
  const cut = text.slice(0, DESCRIPTION_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
};

async function fetchProfile(apiBaseUrl: string): Promise<Profile | null> {
  const url = `${apiBaseUrl.replace(/\/$/, "")}/api/v2/content/release`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      console.warn(`[profile-head] ${url} returned ${response.status}; keeping the default title.`);
      return null;
    }
    const release = (await response.json()) as {
      content?: { singletons?: { profile?: Partial<Profile> } };
    };
    const profile = release.content?.singletons?.profile;
    if (!profile?.name) return null;
    return { name: profile.name, title: profile.title ?? "", summary: profile.summary ?? "" };
  } catch (error) {
    console.warn(`[profile-head] Could not reach ${url}; keeping the default title.`, (error as Error).message);
    return null;
  }
}

/** Replaces the content of the tags index.html already declares. */
function applyProfile(html: string, profile: Profile): string {
  const fullTitle = escapeHtml(profile.title ? `${profile.name} - ${profile.title}` : profile.name);
  const description = escapeHtml(describe(profile.summary));
  const setMeta = (source: string, attribute: "name" | "property", key: string, value: string) =>
    source.replace(
      new RegExp(`(<meta\\s+${attribute}="${key}"\\s+content=")[^"]*(")`),
      `$1${value}$2`,
    );

  let result = html.replace(/<title>[^<]*<\/title>/, `<title>${fullTitle}</title>`);
  result = setMeta(result, "property", "og:title", fullTitle);
  result = setMeta(result, "name", "twitter:title", fullTitle);
  if (description) {
    result = setMeta(result, "name", "description", description);
    result = setMeta(result, "property", "og:description", description);
    result = setMeta(result, "name", "twitter:description", description);
  }
  return result;
}

export function profileHeadPlugin(apiBaseUrl: string | undefined): Plugin {
  let profile: Profile | null | undefined;
  return {
    name: "profile-head",
    apply: "build",
    async buildStart() {
      if (!apiBaseUrl) {
        console.warn("[profile-head] VITE_API_BASE_URL is not set; keeping the default title.");
        profile = null;
        return;
      }
      profile = await fetchProfile(apiBaseUrl);
      if (profile) console.log(`[profile-head] Title: ${profile.name} - ${profile.title}`);
    },
    transformIndexHtml: {
      order: "pre",
      handler: (html) => (profile ? applyProfile(html, profile) : html),
    },
  };
}
