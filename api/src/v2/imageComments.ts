import sanitizeHtml from "sanitize-html";

/*
 * Image comments (HD-14) are HTML from the admin's rich-text editor. Only this
 * short list of formatting is kept on save; everything else (scripts, styles,
 * event handlers, images, iframes) is stripped. The site cleans them again
 * before showing them.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "code"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  // Comment links open in a new tab, like the project links.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
};

/** Cleaned HTML, or "" when nothing readable is left (an editor's empty `<p><br></p>`). */
export function sanitizeComment(html: string | undefined): string {
  const clean = sanitizeHtml(html ?? "", OPTIONS).trim();
  const text = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, " ").trim();
  return text ? clean : "";
}

type Gallery = { comment?: string }[] | undefined;
type WithComments = {
  coverComment?: string;
  galleryMedia?: Gallery;
  clientVariants?: { coverComment?: string; galleryMedia?: Gallery }[];
};

const cleanGallery = (items: Gallery) =>
  items?.map((item) => ({ ...item, comment: sanitizeComment(item.comment) }));

/** A portfolio entry with every image comment cleaned. Other records pass through. */
export function sanitizeImageComments<T>(record: T): T {
  const entry = record as T & WithComments;
  if (!entry || typeof entry !== "object") return record;
  return {
    ...entry,
    ...(entry.coverComment !== undefined ? { coverComment: sanitizeComment(entry.coverComment) } : {}),
    ...(entry.galleryMedia ? { galleryMedia: cleanGallery(entry.galleryMedia) } : {}),
    ...(entry.clientVariants
      ? {
          clientVariants: entry.clientVariants.map((variant) => ({
            ...variant,
            ...(variant.coverComment !== undefined ? { coverComment: sanitizeComment(variant.coverComment) } : {}),
            ...(variant.galleryMedia ? { galleryMedia: cleanGallery(variant.galleryMedia) } : {}),
          })),
        }
      : {}),
  };
}
