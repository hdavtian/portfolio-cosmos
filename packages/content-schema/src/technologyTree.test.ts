import { describe, expect, it } from "vitest";
import { technologySchema } from "./technology.js";
import { skillUseSchema } from "./resume.js";
import {
  buildTechnologyTree,
  flattenTechnologies,
  hasVisibleChildren,
  headingFor,
  latticeByHeading,
  latticeTree,
  resumeSkillLines,
  technologyIssues,
  wouldCycle,
  type TechnologyRecord,
} from "./technologyTree.js";

const record = (over: Partial<TechnologyRecord> & { slug: string; name: string }): TechnologyRecord => ({
  sortOrder: 0,
  parentSlug: "",
  ...over,
});

/** The shape of the settled tree, in miniature. */
const tree: TechnologyRecord[] = [
  record({ slug: "frontend", name: "Frontend", isGrouping: true, sortOrder: 0, surfaces: ["resume"] }),
  record({ slug: "spa", name: "SPA frameworks", parentSlug: "frontend", isGrouping: true, sortOrder: 1 }),
  record({ slug: "react", name: "React", parentSlug: "spa", sortOrder: 2, surfaces: ["resume", "lattice"] }),
  record({ slug: "hooks", name: "Hooks", parentSlug: "react", sortOrder: 3, surfaces: ["lattice"] }),
  record({ slug: "html", name: "HTML", parentSlug: "frontend", sortOrder: 4, surfaces: ["resume"] }),
  record({ slug: "ai", name: "AI", isGrouping: true, sortOrder: 5, surfaces: ["resume"] }),
];

describe("technologyIssues", () => {
  it("passes a valid tree", () => {
    expect(technologyIssues(tree)).toEqual([]);
  });

  it("catches a parent that does not exist", () => {
    const issues = technologyIssues([record({ slug: "a", name: "A", parentSlug: "nowhere" })]);
    expect(issues[0]?.message).toContain("does not exist");
  });

  it("catches a loop", () => {
    const issues = technologyIssues([
      record({ slug: "a", name: "A", parentSlug: "b" }),
      record({ slug: "b", name: "B", parentSlug: "a" }),
    ]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toContain("loop");
  });

  // R2: the collision the whole consolidation exists to remove.
  it("catches two names that differ only by case", () => {
    const issues = technologyIssues([
      record({ slug: "html", name: "HTML" }),
      record({ slug: "html-2", name: "html" }),
    ]);
    expect(issues[0]?.message).toContain("already used");
  });

  // D25: an alias pointing at two records makes the picker ambiguous.
  it("catches an alias claimed by two records", () => {
    const issues = technologyIssues([
      record({ slug: "dotnet", name: ".NET", aliases: ["C# Web API"] }),
      record({ slug: "aspnet", name: "ASP.NET Core Web API", aliases: ["C# Web API"] }),
    ]);
    expect(issues[0]?.message).toContain("already used");
  });

  it("catches an alias that collides with another record's name", () => {
    const issues = technologyIssues([
      record({ slug: "react", name: "React" }),
      record({ slug: "angular", name: "Angular", aliases: ["react"] }),
    ]);
    expect(issues[0]?.message).toContain("already used");
  });

  it("lets a record keep its own name as an alias", () => {
    expect(technologyIssues([record({ slug: "react", name: "React", aliases: ["React"] })])).toEqual([]);
  });
});

describe("wouldCycle", () => {
  it("refuses a move under a record's own descendant", () => {
    expect(wouldCycle(tree, "frontend", "hooks")).toBe(true);
  });

  it("refuses a move under itself", () => {
    expect(wouldCycle(tree, "react", "react")).toBe(true);
  });

  it("allows an ordinary move", () => {
    expect(wouldCycle(tree, "html", "spa")).toBe(false);
  });

  it("allows a move to the top level", () => {
    expect(wouldCycle(tree, "react", "")).toBe(false);
  });
});

describe("buildTechnologyTree", () => {
  it("nests by parent and orders siblings by sortOrder", () => {
    const built = buildTechnologyTree(tree);
    expect(built.map((node) => node.slug)).toEqual(["frontend", "ai"]);
    expect(built[0]?.children.map((node) => node.slug)).toEqual(["spa", "html"]);
    expect(built[0]?.children[0]?.children[0]?.slug).toBe("react");
  });

  it("leaves out a broken record rather than the whole tree", () => {
    const built = buildTechnologyTree([...tree, record({ slug: "orphan", name: "Orphan", parentSlug: "gone" })]);
    expect(built.map((node) => node.slug)).toEqual(["frontend", "ai"]);
  });
});

describe("flattenTechnologies", () => {
  // D16: the bug this rule exists to prevent. React and AWS have children and
  // are still real technologies; only marked groupings drop out.
  it("drops groupings but keeps a technology that has children", () => {
    const flat = flattenTechnologies(tree).map((record) => record.slug);
    expect(flat).toContain("react");
    expect(flat).not.toContain("frontend");
    expect(flat).not.toContain("spa");
  });

  it("narrows to one surface", () => {
    const flat = flattenTechnologies(tree, "lattice").map((record) => record.slug);
    expect(flat).toEqual(["react", "hooks"]);
  });
});

describe("hasVisibleChildren", () => {
  // D25: AI arrives with no records and its surfaces ticked on (D15).
  it("is false for an empty grouping, so no bare heading renders", () => {
    expect(hasVisibleChildren(tree, "ai", "resume")).toBe(false);
  });

  it("is true when a descendant shows on that surface", () => {
    expect(hasVisibleChildren(tree, "frontend", "resume")).toBe(true);
  });

  it("looks past a grouping to its descendants", () => {
    expect(hasVisibleChildren(tree, "spa", "lattice")).toBe(true);
  });

  it("is false when the only descendants are hidden on that surface", () => {
    expect(hasVisibleChildren(tree, "spa", "filters")).toBe(false);
  });
});

describe("headingFor", () => {
  it("returns the top-level ancestor, however deep", () => {
    expect(headingFor(tree, "hooks")?.slug).toBe("frontend");
  });

  it("returns the record itself when it is already top level", () => {
    expect(headingFor(tree, "frontend")?.slug).toBe("frontend");
  });
});

describe("technologySchema", () => {
  it("fills in the defaults so a bare record is valid", () => {
    const parsed = technologySchema.parse({ slug: "react", sortOrder: 0, name: "React" });
    expect(parsed).toMatchObject({
      parentSlug: "",
      isGrouping: false,
      current: false,
      surfaces: [],
      aliases: [],
    });
  });

  it("refuses a slug that is not a slug", () => {
    expect(() => technologySchema.parse({ slug: "React!", sortOrder: 0, name: "React" })).toThrow();
  });

  it("refuses an unknown surface", () => {
    expect(() =>
      technologySchema.parse({ slug: "react", sortOrder: 0, name: "React", surfaces: ["homepage"] }),
    ).toThrow();
  });
});

describe("skillUseSchema", () => {
  // D18: one field taking either, so 1997 costs no more to record than 2018.
  it("takes a bare year and a month with a year", () => {
    expect(skillUseSchema.parse({ technologySlug: "html", from: "1997", to: "04/2001" })).toMatchObject({
      from: "1997",
      to: "04/2001",
    });
  });

  it("refuses a date in any other shape", () => {
    expect(() => skillUseSchema.parse({ technologySlug: "html", from: "1997-04" })).toThrow();
    expect(() => skillUseSchema.parse({ technologySlug: "html", from: "13/1997" })).toThrow();
  });

  // Plan 4.3, way four: what every migrated label becomes.
  it("is valid with nothing but a technology", () => {
    expect(skillUseSchema.parse({ technologySlug: "html" })).toMatchObject({
      surfaces: [],
      highlightMatches: [],
    });
  });

  it("refuses an unknown surface or style", () => {
    expect(() => skillUseSchema.parse({ technologySlug: "html", surfaces: ["resume"] })).toThrow();
    expect(() => skillUseSchema.parse({ technologySlug: "html", style: "neon" })).toThrow();
  });
});

describe("resumeSkillLines", () => {
  const t = (slug: string, parentSlug: string, sortOrder: number, isGrouping: boolean, resume = true) => ({
    slug,
    name: slug,
    parentSlug,
    sortOrder,
    isGrouping,
    surfaces: resume ? ["resume"] : [],
  });
  const tree = [
    t("frontend", "", 0, true),
    t("react", "frontend", 1, false),
    t("styling", "frontend", 2, true),
    t("sass", "styling", 3, false),
    t("tailwind", "styling", 4, false, false),
    t("animation", "frontend", 5, true, false),
    t("gsap", "animation", 6, false),
    t("backend", "", 7, true),
    t("csharp", "backend", 8, false),
    t("empty", "", 9, true),
  ];

  it("gives a ticked heading its own line and rolls unticked headings' skills up", () => {
    expect(resumeSkillLines(tree)).toEqual([
      { slug: "frontend", name: "frontend", skills: ["react", "gsap"], skillSlugs: ["react", "gsap"] },
      { slug: "styling", name: "styling", skills: ["sass"], skillSlugs: ["sass"] },
      { slug: "backend", name: "backend", skills: ["csharp"], skillSlugs: ["csharp"] },
    ]);
  });

  it("orders lines by headingOrder, unlisted ones after in tree order", () => {
    expect(resumeSkillLines(tree, ["backend"]).map((line) => line.slug)).toEqual(["backend", "frontend", "styling"]);
    expect(resumeSkillLines(tree, ["styling", "gone", "backend"]).map((line) => line.slug)).toEqual([
      "styling",
      "backend",
      "frontend",
    ]);
  });
});

describe("latticeTree", () => {
  const t = (slug: string, parentSlug: string, sortOrder: number, isGrouping: boolean, lattice = true) => ({
    slug,
    name: slug,
    parentSlug,
    sortOrder,
    isGrouping,
    surfaces: lattice ? ["lattice"] : [],
  });
  const tree = [
    t("frontend", "", 0, true),
    t("react", "frontend", 1, false),
    t("hooks", "react", 2, false),
    t("redux", "react", 3, false, false),
    t("patterns", "frontend", 4, true),
    t("context", "patterns", 5, false),
    t("empty", "", 6, true),
    t("orphan-heading", "", 7, true),
    t("hidden", "orphan-heading", 8, false, false),
  ];

  it("nests ticked records and drops headings with nothing visible under them", () => {
    expect(latticeTree(tree)).toEqual([
      {
        slug: "frontend",
        name: "frontend",
        children: [
          { slug: "react", name: "react", children: [{ slug: "hooks", name: "hooks", children: [] }] },
          { slug: "patterns", name: "patterns", children: [{ slug: "context", name: "context", children: [] }] },
        ],
      },
    ]);
  });

  it("lists each heading's skills for the Skills planet, any depth, no headings", () => {
    expect(latticeByHeading(tree)).toEqual({ frontend: ["react", "hooks", "context"] });
  });
});
