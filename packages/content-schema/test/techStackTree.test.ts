import { describe, expect, it } from "vitest";
import {
  buildTechStackTree,
  techStackIssues,
  techStackTreeFromSkills,
  type TechStackNodeRecord,
} from "../src/techStackTree.js";

const node = (slug: string, parentSlug: string, sortOrder: number, name = slug): TechStackNodeRecord => ({
  slug,
  parentSlug,
  sortOrder,
  name,
});

describe("buildTechStackTree", () => {
  it("nests any depth and orders siblings by sortOrder", () => {
    const tree = buildTechStackTree([
      node("react", "frameworks", 3),
      node("frontend", "", 0),
      node("vue", "frameworks", 2),
      node("frameworks", "frontend", 1),
      node("backend", "", 4),
    ]);

    expect(tree.map((n) => n.slug)).toEqual(["frontend", "backend"]);
    expect(tree[0].children[0].slug).toBe("frameworks");
    expect(tree[0].children[0].children.map((n) => n.slug)).toEqual(["vue", "react"]);
  });

  it("leaves out nodes with a missing parent or in a loop", () => {
    const tree = buildTechStackTree([
      node("root", "", 0),
      node("orphan", "nowhere", 1),
      node("a", "b", 2),
      node("b", "a", 3),
    ]);
    expect(tree).toEqual([{ slug: "root", name: "root", children: [] }]);
  });
});

describe("techStackIssues", () => {
  it("reports self-parenting, missing parents and loops", () => {
    const nodes = [node("self", "self", 0), node("orphan", "nowhere", 1), node("a", "b", 2), node("b", "a", 3), node("ok", "", 4)];
    expect(techStackIssues(nodes)).toEqual([
      { index: 0, message: "cannot be its own parent" },
      { index: 1, message: 'has a parent ("nowhere") that does not exist' },
      { index: 2, message: "is inside a loop of parents" },
      { index: 3, message: "is inside a loop of parents" },
    ]);
  });
});

describe("techStackTreeFromSkills", () => {
  it("builds category → skill from the resume skill map", () => {
    const tree = techStackTreeFromSkills({ Frontend: ["React"], Backend: [] });
    expect(tree.map((n) => [n.name, n.children.map((c) => c.name)])).toEqual([
      ["Frontend", ["React"]],
      ["Backend", []],
    ]);
  });
});
