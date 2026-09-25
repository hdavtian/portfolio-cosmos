import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ResumeModel } from "./model.js";

/**
 * The resume as a Word document, in the shape of the one Harma has sent for
 * years: US Letter, half-inch margins, one column, the name large, section
 * names in bold capitals, "Company - Location" and "Title | dates" in bold,
 * real bullet lists. Nothing an applicant-tracking system trips on: no
 * tables, text boxes, columns or images.
 */
const FONT = "Arial";
const BODY = 22; // half-points: 11pt
const NAME = 36; // 18pt
const SECTION = 28; // 14pt
const COMPANY = 24; // 12pt
const ROLE = 22; // 11pt
const BULLETS = "bullets";

const run = (text: string, options: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, size: options.size ?? BODY, bold: options.bold, color: options.color });

const paragraph = (runs: TextRun[] | string, options: { after?: number; before?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({
    children: typeof runs === "string" ? [run(runs)] : runs,
    spacing: { after: options.after ?? 60, before: options.before ?? 0 },
    alignment: options.alignment,
  });

const sectionHeading = (name: string) =>
  paragraph([run(name.toUpperCase(), { bold: true, size: SECTION })], { before: 240, after: 100 });

const bullet = (runs: TextRun[] | string) =>
  new Paragraph({
    children: typeof runs === "string" ? [run(runs)] : runs,
    numbering: { reference: BULLETS, level: 0 },
    spacing: { after: 40 },
  });

export function resumeDocument(model: ResumeModel): Document {
  const children: Paragraph[] = [];

  children.push(paragraph([run(model.name, { bold: true, size: NAME })], { after: 20 }));
  children.push(paragraph(model.title, { after: 20 }));
  children.push(paragraph(model.contact, { after: 0 }));

  children.push(sectionHeading("Summary"));
  children.push(paragraph(model.summary));

  children.push(sectionHeading("Technical skills"));
  for (const line of model.skills) {
    children.push(bullet([run(`${line.heading}: `, { bold: true }), run(line.skills)]));
  }

  // Every role is its own block with the company above it, so a parser that
  // reads "title + dates" as one job always finds the company beside it.
  children.push(sectionHeading("Experience"));
  let first = true;
  for (const job of model.experience) {
    for (const position of job.positions) {
      children.push(
        paragraph([run(`${job.company} - ${job.location}`, { bold: true, size: COMPANY })], { before: first ? 0 : 160, after: 20 }),
      );
      children.push(paragraph([run(`${position.title} | ${position.dates}`, { bold: true, size: ROLE })], { after: 60 }));
      for (const item of position.bullets) children.push(bullet(item));
      first = false;
    }
  }

  if (model.education.length > 0) {
    children.push(sectionHeading("Education"));
    for (const entry of model.education) {
      children.push(paragraph([run(entry.institution, { bold: true })], { after: 0 }));
      children.push(paragraph(entry.degree, { after: 0 }));
      children.push(paragraph(entry.date));
    }
  }

  if (model.certifications.length > 0) {
    children.push(sectionHeading("Certifications"));
    for (const cert of model.certifications) children.push(paragraph(`${cert.name} - ${cert.date}`));
  }

  if (model.links.length > 0) {
    children.push(sectionHeading("Links"));
    for (const link of model.links) {
      children.push(
        bullet([
          run(`${link.title}: `),
          new ExternalHyperlink({
            link: link.url,
            children: [run(link.url, { color: "0563C1" })],
          }) as unknown as TextRun,
        ]),
      );
    }
  }

  return new Document({
    creator: model.name,
    title: `${model.name} - ${model.title}`,
    styles: { default: { document: { run: { font: FONT, size: BODY } } } },
    numbering: {
      config: [
        {
          reference: BULLETS,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 260 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });
}

/** The .docx bytes; works in the browser and in Node alike. */
export const resumeDocx = (model: ResumeModel): Promise<ArrayBuffer> => Packer.toArrayBuffer(resumeDocument(model));
