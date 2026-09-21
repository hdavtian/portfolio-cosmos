import { useEffect } from "react";
import { useReleaseQuery } from "../../lib/query/contentQueries";

/**
 * Keeps the browser tab title in step with the published profile
 * (Admin → Profile) on every route of both sites. Link previews cannot run
 * this; they read the title written into index.html at build time
 * (scripts/vite-profile-head.ts).
 */
export function ProfileDocumentTitle() {
  const profile = useReleaseQuery((release) => release.profile).data;
  const name = profile?.name;
  const title = profile?.title;

  useEffect(() => {
    if (!name) return;
    document.title = title ? `${name} - ${title}` : name;
  }, [name, title]);

  return null;
}
