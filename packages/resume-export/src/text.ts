import type { ResumeModel } from "./model.js";

/**
 * The resume as plain text: the reading an applicant-tracking system or a
 * paste into a form gets. Section names in capitals, one blank line between
 * sections, "- " bullets, nothing that needs a font to be understood.
 */
export function resumeText(model: ResumeModel): string {
  const lines: string[] = [];
  const section = (name: string) => {
    lines.push("", name.toUpperCase(), "");
  };

  lines.push(model.name, model.title, model.contact);

  section("Summary");
  lines.push(model.summary);

  section("Technical skills");
  for (const line of model.skills) lines.push(`- ${line.heading}: ${line.skills}`);

  section("Experience");
  model.experience.forEach((job, index) => {
    if (index > 0) lines.push("");
    lines.push(`${job.company} - ${job.location}`);
    for (const position of job.positions) {
      lines.push(`${position.title} | ${position.dates}`);
      for (const bullet of position.bullets) lines.push(`- ${bullet}`);
    }
  });

  if (model.education.length > 0) {
    section("Education");
    for (const entry of model.education) lines.push(entry.institution, entry.degree, entry.date);
  }

  if (model.certifications.length > 0) {
    section("Certifications");
    for (const cert of model.certifications) lines.push(`${cert.name} - ${cert.date}`);
  }

  if (model.links.length > 0) {
    section("Links");
    for (const link of model.links) lines.push(`${link.title}: ${link.url}`);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
