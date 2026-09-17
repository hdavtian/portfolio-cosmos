import { useEffect } from "react";
import { useResumeQuery } from "../../lib/query/contentQueries";

/**
 * Keeps the browser tab title in step with the published profile
 * (Admin → Profile) on every route of both sites. Link previews cannot run
 * this; they read the title written into index.html at build time
 * (scripts/vite-profile-head.ts).
 */
export function ProfileDocumentTitle() {
  const resume = useResumeQuery();
  const name = resume.data?.payload.personal.name;
  const title = resume.data?.payload.personal.title;

  useEffect(() => {
    if (!name) return;
    document.title = title ? `${name} - ${title}` : name;
  }, [name, title]);

  return null;
}
