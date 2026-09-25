import { describe, expect, it } from "vitest";
import { summarizeChanges, type ContentSide } from "../src/v2/changeSummary.js";

const side = (collections: ContentSide["collections"], singletons: ContentSide["singletons"] = {}): ContentSide => ({
  singletons,
  collections,
});

const project = (slug: string, sortOrder: number, extra: Record<string, unknown> = {}) => ({
  slug,
  sortOrder,
  title: slug.toUpperCase(),
  galleryMedia: [],
  ...extra,
});

describe("summarizeChanges", () => {
  it("reports nothing when drafts match the release, whatever the key order", () => {
    const live = side({ portfolioEntries: [{ title: "A", slug: "a", sortOrder: 0 }] });
    const draft = side({ portfolioEntries: [{ sortOrder: 0, slug: "a", title: "A" }] });
    expect(summarizeChanges(live, draft)).toEqual([]);
  });

  it("names added, updated and deleted records with the changed fields", () => {
    const live = side({ portfolioEntries: [project("keep", 0), project("gone", 1)] });
    const draft = side({
      portfolioEntries: [
        project("keep", 0, { galleryMedia: [{ slug: "x" }], description: "new" }),
        project("fresh", 1),
      ],
    });

    expect(summarizeChanges(live, draft)).toEqual([
      'Added project "FRESH"',
      'Updated project "KEEP" (gallery, description)',
      'Deleted project "GONE"',
    ]);
  });

  it("reports a reorder once, and not for shifts caused by a deletion", () => {
    const messages = (order: string[]) =>
      order.map((slug, index) => ({ slug, sortOrder: index, textContent: `Message ${slug}` }));

    expect(
      summarizeChanges(side({ pathTravelMessages: messages(["a", "b", "c"]) }), side({ pathTravelMessages: messages(["c", "a", "b"]) })),
    ).toEqual(["Reordered ride messages"]);

    expect(
      summarizeChanges(side({ pathTravelMessages: messages(["a", "b", "c"]) }), side({ pathTravelMessages: messages(["b", "c"]) })),
    ).toEqual(['Deleted ride message "Message a"']);
  });

  it("shortens long labels and turns line-break markers into spaces", () => {
    const live = side({ pathTravelMessages: [] });
    const draft = side({
      pathTravelMessages: [
        { slug: "m", sortOrder: 0, textContent: "Clean. Scalable./n/nNot over-engineered, not rushed, built with intent." },
      ],
    });
    expect(summarizeChanges(live, draft)).toEqual(['Added ride message "Clean. Scalable. Not over-engineered, n…"']);
  });

  it("counts adds instead of listing them when there are many", () => {
    const nodes = Array.from({ length: 6 }, (_, i) => ({ slug: `n${i}`, sortOrder: i, name: `Node ${i}` }));
    expect(summarizeChanges(side({ technologies: [] }), side({ technologies: nodes }))).toEqual([
      "Added 6 technologies",
    ]);
  });

  it("summarises singleton edits", () => {
    const live = side({}, { profile: { name: "H", summary: "old" } });
    const draft = side({}, { profile: { name: "H", summary: "new" } });
    expect(summarizeChanges(live, draft)).toEqual(["Updated profile (summary)"]);
  });
});
