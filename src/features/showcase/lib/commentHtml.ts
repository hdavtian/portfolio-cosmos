import DOMPurify from "dompurify";

/*
 * Image comments (HD-14) arrive as HTML. The API already cleans them on save;
 * this is the second line, so nothing but this short list of formatting can
 * reach the page whatever the release holds.
 */
const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "a", "ul", "ol", "li", "code"];
const ALLOWED_ATTR = ["href", "target", "rel"];

let hooked = false;

/** Cleaned comment HTML, or "" when there is nothing to show. */
export function cleanCommentHtml(html: string | undefined): string {
  if (!html?.trim()) return "";
  if (!hooked) {
    // Links in a comment open in a new tab, like the project links.
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
    hooked = true;
  }
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
  });
  const text = clean.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return text ? clean : "";
}
