import { describe, expect, it } from "vitest";
import { monthYear, resumeModel, type ResumeSource } from "../src/model.js";
import { resumeText } from "../src/text.js";

const source: ResumeSource = {
  profile: {
    name: "Ada Lovelace",
    title: "Full Stack Engineer",
    email: "ada@example.com",
    phone: "555-0100",
    location: "London",
    summary: "Builds things.",
  },
  resumeSkills: { headingOrder: ["backend", "frontend"] },
  collections: {
    technologies: [
      { slug: "frontend", sortOrder: 0, name: "Frontend", parentSlug: "", isGrouping: true, surfaces: ["resume"] },
      { slug: "html", sortOrder: 1, name: "HTML", parentSlug: "frontend", surfaces: ["resume"] },
      { slug: "css", sortOrder: 2, name: "CSS", parentSlug: "frontend", surfaces: [] },
      { slug: "backend", sortOrder: 3, name: "Backend", parentSlug: "", isGrouping: true, surfaces: ["resume"] },
      { slug: "node", sortOrder: 4, name: "Node.js", parentSlug: "backend", surfaces: ["resume"] },
    ],
    experiences: [
      {
        sortOrder: 0,
        company: "Analytical Engines",
        location: "London",
        startDate: "04/2018",
        positions: [
          { title: "Lead", startDate: "02/2024", responsibilities: ["Led the team", ""] },
          { title: "Engineer", startDate: "04/2018", endDate: "02/2024", responsibilities: ["Built the engine"] },
        ],
      },
    ],
    education: [{ sortOrder: 0, institution: "Royal Society", degree: "BA", major: "Mathematics", graduationDate: "06/1996" }],
    certifications: [{ sortOrder: 0, name: "CSPO", date: "06/2025" }],
    links: [{ sortOrder: 1, title: "GitHub", url: "https://github.com/ada" }, { sortOrder: 0, title: "Site", url: "https://ada.dev" }],
  },
};

describe("resumeModel", () => {
  it("reads dates as month and year", () => {
    expect(monthYear("07/2025")).toBe("Jul 2025");
    expect(monthYear("2025")).toBe("2025");
    expect(monthYear(undefined)).toBe("");
  });

  it("builds the resume's lines in the curated order, skills ticked for the resume only", () => {
    const model = resumeModel(source);
    expect(model.skills).toEqual([
      { heading: "Backend", skills: "Node.js" },
      { heading: "Frontend", skills: "HTML" },
    ]);
  });

  it("dates each position from its own dates, the job's when it has none, Present when open", () => {
    const [job] = resumeModel(source).experience;
    expect(job.positions.map((p) => p.dates)).toEqual(["Feb 2024 - Present", "Apr 2018 - Feb 2024"]);
    expect(job.positions[0].bullets).toEqual(["Led the team"]);
  });

  it("orders links and names the file after the person and title", () => {
    const model = resumeModel(source);
    expect(model.links.map((l) => l.title)).toEqual(["Site", "GitHub"]);
    expect(model.fileStem).toBe("Ada Lovelace - Full Stack Engineer");
  });
});

describe("resumeText", () => {
  it("repeats the company above every role and uses plain bullets", () => {
    const text = resumeText(resumeModel(source));
    expect(text).toContain("EXPERIENCE\n\nAnalytical Engines - London\nLead | Feb 2024 - Present\n- Led the team\n\nAnalytical Engines - London\nEngineer | Apr 2018 - Feb 2024\n- Built the engine");
    expect(text).toContain("- Backend: Node.js");
    expect(text).toContain("- Site: https://ada.dev");
  });
});
