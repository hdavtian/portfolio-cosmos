import { describe, expect, it } from "vitest";
import { sanitizeComment, sanitizeImageComments } from "../src/v2/imageComments.js";

describe("sanitizeComment", () => {
  it("keeps the allowed formatting", () => {
    expect(sanitizeComment("<p>Built with <strong>React</strong> and <em>GSAP</em>.</p><ul><li>One</li></ul>")).toBe(
      "<p>Built with <strong>React</strong> and <em>GSAP</em>.</p><ul><li>One</li></ul>",
    );
  });

  it("strips scripts, handlers, styles and unsafe links", () => {
    const clean = sanitizeComment(
      '<p style="color:red" onclick="x()">Hi<script>alert(1)</script><img src=x onerror=alert(1)> <a href="javascript:alert(1)">bad</a></p>',
    );
    expect(clean).toBe("<p>Hi <a target=\"_blank\" rel=\"noopener noreferrer\">bad</a></p>");
  });

  it("opens links in a new tab", () => {
    expect(sanitizeComment('<a href="https://example.com">site</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>',
    );
  });

  it("turns an empty editor value into no comment", () => {
    expect(sanitizeComment("<p><br></p>")).toBe("");
    expect(sanitizeComment("<p>&nbsp;</p>")).toBe("");
    expect(sanitizeComment(undefined)).toBe("");
  });
});

describe("sanitizeImageComments", () => {
  it("cleans the cover, gallery and client site comments", () => {
    const result = sanitizeImageComments({
      title: "Project",
      coverComment: "<p>Cover<script>x</script></p>",
      galleryMedia: [{ slug: "a", comment: "<p onclick='x'>One</p>" }],
      clientVariants: [{ slug: "v", coverComment: "<p><br></p>", galleryMedia: [{ slug: "b", comment: "<b>Two</b>" }] }],
    });
    expect(result).toEqual({
      title: "Project",
      coverComment: "<p>Cover</p>",
      galleryMedia: [{ slug: "a", comment: "<p>One</p>" }],
      clientVariants: [{ slug: "v", coverComment: "", galleryMedia: [{ slug: "b", comment: "<b>Two</b>" }] }],
    });
  });
});
