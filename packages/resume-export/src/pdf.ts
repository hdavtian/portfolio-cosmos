import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { ResumeModel } from "./model.js";

/**
 * The resume as a PDF, laid out to match the Word document: US Letter,
 * half-inch margins, Helvetica (a font every PDF reader has, so nothing is
 * embedded and the text stays selectable and searchable). A small layout
 * engine wraps lines, indents bullets and starts a new page when the current
 * one is full, keeping a heading with what follows it.
 */
const PAGE = { width: 612, height: 792 };
const MARGIN = 36;
const WIDTH = PAGE.width - MARGIN * 2;
const BODY = 11;
const NAME = 18;
const SECTION = 14;
const COMPANY = 12;
const ROLE = 11;
const LEADING = 1.3;
const BULLET_INDENT = 16;
const INK = rgb(0.07, 0.07, 0.07);
const LINK = rgb(0.02, 0.39, 0.76);

interface Writer {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  regular: PDFFont;
  bold: PDFFont;
}

const wrap = (text: string, font: PDFFont, size: number, width: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const newPage = (writer: Writer) => {
  writer.page = writer.doc.addPage([PAGE.width, PAGE.height]);
  writer.y = PAGE.height - MARGIN;
};

/** Makes room for `height` points, starting a new page if the current one is full. */
const ensure = (writer: Writer, height: number) => {
  if (writer.y - height < MARGIN) newPage(writer);
};

const write = (
  writer: Writer,
  text: string,
  options: { size?: number; bold?: boolean; indent?: number; color?: ReturnType<typeof rgb>; after?: number; keepWith?: number } = {},
) => {
  const size = options.size ?? BODY;
  const font = options.bold ? writer.bold : writer.regular;
  const indent = options.indent ?? 0;
  const lines = wrap(text, font, size, WIDTH - indent);
  const lineHeight = size * LEADING;
  // A heading is never left alone at the foot of a page.
  ensure(writer, lineHeight * lines.length + (options.keepWith ?? 0));
  for (const line of lines) {
    ensure(writer, lineHeight);
    writer.page.drawText(line, { x: MARGIN + indent, y: writer.y - size, size, font, color: options.color ?? INK });
    writer.y -= lineHeight;
  }
  writer.y -= options.after ?? 2;
};

const bullet = (writer: Writer, runs: Array<{ text: string; bold?: boolean }>) => {
  const size = BODY;
  const lineHeight = size * LEADING;
  // Bold lead-in ("Frontend: ") then the rest, wrapped as one paragraph.
  const full = runs.map((part) => part.text).join("");
  const lines = wrap(full, writer.regular, size, WIDTH - BULLET_INDENT);
  ensure(writer, lineHeight * lines.length);
  lines.forEach((line, index) => {
    ensure(writer, lineHeight);
    if (index === 0) writer.page.drawText("•", { x: MARGIN + 4, y: writer.y - size, size, font: writer.regular, color: INK });
    let x = MARGIN + BULLET_INDENT;
    if (index === 0 && runs[0]?.bold && line.startsWith(runs[0].text)) {
      writer.page.drawText(runs[0].text, { x, y: writer.y - size, size, font: writer.bold, color: INK });
      x += writer.bold.widthOfTextAtSize(runs[0].text, size);
      writer.page.drawText(line.slice(runs[0].text.length), { x, y: writer.y - size, size, font: writer.regular, color: INK });
    } else {
      writer.page.drawText(line, { x, y: writer.y - size, size, font: writer.regular, color: INK });
    }
    writer.y -= lineHeight;
  });
  writer.y -= 1;
};

const section = (writer: Writer, name: string) => {
  writer.y -= 10;
  write(writer, name.toUpperCase(), { size: SECTION, bold: true, after: 4, keepWith: BODY * LEADING * 2 });
};

export async function resumePdf(model: ResumeModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.name} - ${model.title}`);
  doc.setAuthor(model.name);
  const writer: Writer = {
    doc,
    page: doc.addPage([PAGE.width, PAGE.height]),
    y: PAGE.height - MARGIN,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  write(writer, model.name, { size: NAME, bold: true, after: 0 });
  write(writer, model.title, { after: 0 });
  write(writer, model.contact);

  section(writer, "Summary");
  write(writer, model.summary);

  section(writer, "Technical skills");
  for (const line of model.skills) bullet(writer, [{ text: `${line.heading}: `, bold: true }, { text: line.skills }]);

  // Every role is its own block with the company above it (see docx.ts).
  section(writer, "Experience");
  let first = true;
  for (const job of model.experience) {
    for (const position of job.positions) {
      if (!first) writer.y -= 8;
      write(writer, `${job.company} - ${job.location}`, { size: COMPANY, bold: true, after: 0, keepWith: ROLE * LEADING + BODY * LEADING * 2 });
      write(writer, `${position.title} | ${position.dates}`, { size: ROLE, bold: true, after: 3, keepWith: BODY * LEADING * 2 });
      for (const item of position.bullets) bullet(writer, [{ text: item }]);
      first = false;
    }
  }

  if (model.education.length > 0) {
    section(writer, "Education");
    for (const entry of model.education) {
      write(writer, entry.institution, { bold: true, after: 0 });
      write(writer, entry.degree, { after: 0 });
      write(writer, entry.date);
    }
  }

  if (model.certifications.length > 0) {
    section(writer, "Certifications");
    for (const cert of model.certifications) write(writer, `${cert.name} - ${cert.date}`);
  }

  if (model.links.length > 0) {
    section(writer, "Links");
    for (const link of model.links) {
      const lead = `${link.title}: `;
      const size = BODY;
      const lineHeight = size * LEADING;
      ensure(writer, lineHeight);
      writer.page.drawText(lead, { x: MARGIN, y: writer.y - size, size, font: writer.regular, color: INK });
      writer.page.drawText(link.url, {
        x: MARGIN + writer.regular.widthOfTextAtSize(lead, size),
        y: writer.y - size,
        size,
        font: writer.regular,
        color: LINK,
      });
      writer.y -= lineHeight + 2;
    }
  }

  return doc.save();
}
