import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { experienceSchema } from "./resume.js";
import { technologySchema } from "./technology.js";
import { technologyIssues, type TechnologyRecord } from "./technologyTree.js";

// Proves that what `npm run skills:write` produced actually satisfies the
// schema, rather than trusting the writer. Skipped when the migrated database
// is not on this machine, so it never fails a clean checkout or CI.
const DB = "resume_cosmos_migrated";

const read = (collection: string): unknown[] =>
  JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "scrolling-resume-mongo",
        "mongosh",
        "--quiet",
        "--eval",
        `JSON.stringify(db.getSiblingDB("${DB}").${collection}.find({}, { _id: 0 }).toArray())`,
      ],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] },
    ),
  );

let technologies: unknown[] = [];
let experiences: unknown[] = [];
let available = false;
try {
  technologies = read("technologies");
  experiences = read("experiences");
  available = technologies.length > 0;
} catch {
  available = false;
}

describe.skipIf(!available)("the migrated database", () => {
  it("has technologies that all satisfy the schema", () => {
    const failures = technologies
      .map((record) => ({ record, parsed: technologySchema.safeParse(record) }))
      .filter((row) => !row.parsed.success)
      .map((row) => `${(row.record as { name?: string }).name}: ${row.parsed.error?.issues[0]?.message}`);
    expect(failures).toEqual([]);
  });

  it("has experiences that all satisfy the schema", () => {
    const failures = experiences
      .map((record) => ({ record, parsed: experienceSchema.safeParse(record) }))
      .filter((row) => !row.parsed.success)
      .map((row) => `${(row.record as { slug?: string }).slug}: ${row.parsed.error?.issues[0]?.message}`);
    expect(failures).toEqual([]);
  });

  it("is a valid tree with no name or alias collisions", () => {
    const records = technologies as TechnologyRecord[];
    const issues = technologyIssues(records).map(
      (issue) => `${records[issue.index]?.name}: ${issue.message}`,
    );
    expect(issues).toEqual([]);
  });

  // The failure that would be invisible on screen: a use pointing at nothing.
  it("has no skill use pointing at a technology that does not exist", () => {
    const slugs = new Set((technologies as TechnologyRecord[]).map((record) => record.slug));
    const dangling = (experiences as { slug: string; skillsUsed?: { technologySlug: string }[] }[])
      .flatMap((experience) =>
        (experience.skillsUsed ?? []).map((use) => ({ job: experience.slug, slug: use.technologySlug })),
      )
      .filter((use) => !slugs.has(use.slug))
      .map((use) => `${use.job} -> ${use.slug}`);
    expect(dangling).toEqual([]);
  });

  // D12's actual promise: the two types that held technology names are gone.
  // A `memory` whose prose happens to be a technology name is content, not a
  // migration failure, and is listed in the report for Harma to judge.
  it("left no tech or code memory behind", () => {
    const leftovers = (experiences as { slug: string; jobMemories?: { text: string; type: string }[] }[])
      .flatMap((experience) => (experience.jobMemories ?? []).map((memory) => ({ ...memory, job: experience.slug })))
      .filter((memory) => memory.type === "tech" || memory.type === "code")
      .map((memory) => `${memory.job}: ${memory.type} "${memory.text}"`);
    expect(leftovers).toEqual([]);
  });
});
