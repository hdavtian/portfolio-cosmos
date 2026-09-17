import type { ApiErrorDetail } from "./apiClient";

// The API reports validation failures in schema terms ("galleryMedia.0.title:
// Too small: expected string to have >=1 characters"). These helpers turn them
// into wording an editor can act on, shared by the status line and the forms.

const FIELD_LABELS: Record<string, string> = {
  galleryMedia: "Gallery image",
  clientVariants: "Client site",
  positions: "Position",
  projects: "Project",
  jobMemories: "Memory",
  jobTech: "Tech",
  planes: "Plane",
  rings: "Ring",
  mediaId: "Image",
  coreSlug: "Core",
  categorySlug: "Category",
  navLabel: "Short name",
  startDate: "Start date",
  endDate: "End date",
  orbitColor: "Orbit color",
  altText: "Alt text",
};

const humanize = (key: string) => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** "galleryMedia.0.title" → "Gallery image 1 › Title". */
export const fieldLabel = (path: string): string => {
  const parts: string[] = [];
  for (const segment of path.split(".")) {
    if (/^\d+$/.test(segment) && parts.length > 0) {
      parts[parts.length - 1] += ` ${Number(segment) + 1}`;
    } else {
      parts.push(FIELD_LABELS[segment] ?? humanize(segment));
    }
  }
  return parts.join(" › ");
};

/** Rewrites a schema message as a short sentence ending, e.g. "is required". */
export const friendlyMessage = (message: string): string => {
  const tooSmallText = /Too small: expected string to have >=(\d+) character/.exec(message);
  if (tooSmallText) return tooSmallText[1] === "1" ? "is required" : `needs at least ${tooSmallText[1]} characters`;

  const tooBigText = /Too big: expected string to have <=(\d+) character/.exec(message);
  if (tooBigText) return `can be at most ${tooBigText[1]} characters`;

  const tooSmallArray = /Too small: expected array to have >=(\d+) item/.exec(message);
  if (tooSmallArray) return tooSmallArray[1] === "1" ? "needs at least one entry" : `needs at least ${tooSmallArray[1]} entries`;

  const tooSmallNumber = /Too small: expected number to be >=(-?[\d.]+)/.exec(message);
  if (tooSmallNumber) return `must be ${tooSmallNumber[1]} or more`;

  const tooBigNumber = /Too big: expected number to be <=(-?[\d.]+)/.exec(message);
  if (tooBigNumber) return `must be ${tooBigNumber[1]} or less`;

  if (/expected number/.test(message)) return "must be a number";
  if (/Invalid id/.test(message)) return "needs to be chosen";
  if (/Invalid option|expected one of/.test(message)) return "needs to be chosen from the list";

  // Custom schema messages are already written for people ("Use lowercase…").
  return message.charAt(0).toLowerCase() + message.slice(1);
};

/**
 * One message per field (a blank slug also fails its pattern check; only the
 * first, most basic problem is useful), keyed by the field's path.
 */
export const friendlyFieldErrors = (details: ApiErrorDetail[]): Record<string, string> => {
  const byPath: Record<string, string> = {};
  for (const detail of details) {
    byPath[detail.path] ??= friendlyMessage(detail.message);
  }
  return byPath;
};

/** Lines for the status line: "Gallery image 1 › Title is required". */
export const friendlyDetailLines = (details: ApiErrorDetail[]): string[] =>
  Object.entries(friendlyFieldErrors(details)).map(([path, message]) =>
    path ? `${fieldLabel(path)} ${message}` : message.charAt(0).toUpperCase() + message.slice(1),
  );
