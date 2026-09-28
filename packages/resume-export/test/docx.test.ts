import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { resumeDocx } from "../src/docx.js";
import type { ResumeModel } from "../src/model.js";

/**
 * The Word file has to survive the resume parsers at Indeed, LinkedIn and the
 * applicant-tracking systems behind them, which read the package far more
 * strictly than Word does. These are the package rules they hold us to.
 */
const model: ResumeModel = {
  name: "Ada Lovelace",
  title: "Full Stack Engineer",
  contact: "ada@example.com | 555-0100 | London",
  summary: "Builds things.",
  skills: [{ heading: "Backend", skills: "Node.js" }],
  experience: [
    {
      company: "Analytical Engines",
      location: "London",
      positions: [{ title: "Lead", dates: "Feb 2024 - Present", bullets: ["Led the team"] }],
    },
  ],
  education: [{ institution: "Somewhere", degree: "BS, Mathematics", date: "May 1842" }],
  links: [{ title: "LinkedIn", url: "https://www.linkedin.com/in/ada" }],
  certifications: [{ name: "A certificate", date: "Jan 2020" }],
  fileStem: "Ada Lovelace - Full Stack Engineer",
};

const open = async () => {
  const zip = await JSZip.loadAsync(await resumeDocx(model));
  const names = Object.keys(zip.files);
  const text = async (name: string) => zip.file(name)!.async("string");
  return { zip, names, text };
};

describe("the Word package", () => {
  it("puts the content types stream first, as ECMA-376 requires", async () => {
    const { names } = await open();
    expect(names[0]).toBe("[Content_Types].xml");
    expect(names[1]).toBe("_rels/.rels");
  });

  it("carries no directory entries", async () => {
    const { zip, names } = await open();
    expect(names.filter((name) => zip.files[name].dir)).toEqual([]);
    expect(names.filter((name) => name.endsWith("/"))).toEqual([]);
  });

  it("dates the core properties to whole seconds", async () => {
    const { text } = await open();
    const core = await text("docProps/core.xml");
    const dates = [...core.matchAll(/<dcterms:(?:created|modified)[^>]*>([^<]+)</g)].map((match) => match[1]);
    expect(dates).toHaveLength(2);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it("numbers every relationship id", async () => {
    const { text } = await open();
    const rels = await text("word/_rels/document.xml.rels");
    const ids = [...rels.matchAll(/ Id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toMatch(/^rId\d+$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points each hyperlink at a relationship that exists", async () => {
    const { text } = await open();
    const rels = await text("word/_rels/document.xml.rels");
    const document = await text("word/document.xml");
    const used = [...document.matchAll(/r:id="([^"]+)"/g)].map((match) => match[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(rels).toContain(`Id="${id}"`);
  });

  it("names the application that wrote it", async () => {
    const { text } = await open();
    expect(await text("docProps/app.xml")).toContain("<Application>");
  });

  it("declares a content type for every part", async () => {
    const { names, text } = await open();
    const types = await text("[Content_Types].xml");
    const defaults = new Set([...types.matchAll(/Extension="([^"]+)"/g)].map((match) => match[1].toLowerCase()));
    for (const name of names) {
      if (name === "[Content_Types].xml") continue;
      const covered = types.includes(`PartName="/${name}"`) || defaults.has(name.split(".").pop()!.toLowerCase());
      expect(covered, name).toBe(true);
    }
  });

  it("holds no tables, text boxes or images for a parser to trip on", async () => {
    const { text } = await open();
    const document = await text("word/document.xml");
    expect(document).not.toContain("<w:tbl>");
    expect(document).not.toContain("<w:drawing>");
    expect(document).not.toContain("<w:pict>");
    expect(document).toContain("Analytical Engines - London");
  });
});
