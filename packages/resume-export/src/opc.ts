import JSZip from "jszip";

/**
 * The .docx the `docx` package writes is a valid Word document, but it is not
 * the *shape* of package that applicant-tracking systems read. Word writes a
 * zip whose first entry is the content-types stream, with no directory
 * entries, and core properties dated to whole seconds. The writer here gives
 * us a zip in library order, with `word/`, `_rels/` and `docProps/` present as
 * empty entries, and timestamps carrying milliseconds. Indeed and LinkedIn
 * feed uploads to strict OPC readers (Apache POI and friends), which is where
 * "we can't read your file" comes from.
 *
 * So the package is rewritten once before it leaves: same parts, same bytes,
 * put in the order and the form a reader expects.
 */

/** ECMA-376 Part 2 §10.1.2: the content types stream comes first. */
const FIRST = [
  "[Content_Types].xml",
  "_rels/.rels",
  "docProps/core.xml",
  "docProps/app.xml",
  "docProps/custom.xml",
  "word/document.xml",
  "word/_rels/document.xml.rels",
  "word/styles.xml",
  "word/numbering.xml",
  "word/settings.xml",
  "word/fontTable.xml",
];

const rank = (name: string) => {
  const index = FIRST.indexOf(name);
  return index === -1 ? FIRST.length : index;
};

/** `dcterms:W3CDTF` has no fractional seconds; POI rejects the ones that do. */
const wholeSeconds = (xml: string) => xml.replace(/(\d{2}:\d{2}:\d{2})\.\d+(Z|[+-]\d{2}:\d{2})/g, "$1$2");

/** Says who wrote the file, where the library leaves an empty element. */
const application = (xml: string) =>
  xml.includes("<Application>")
    ? xml
    : xml.replace(
        /<Properties([^>]*)\/>/,
        "<Properties$1><Application>harmadavtian.com</Application><DocSecurity>0</DocSecurity></Properties>",
      );

/**
 * Relationship ids the library generates at random (`rIdawtclv2jy3…` for every
 * hyperlink) are legal but unusual; readers that assume `rId<number>` — Apache
 * POI among them — stumble on them. Renumbered here, in both the part and the
 * relationships beside it.
 */
function renumberRelationships(rels: string, part: string): { rels: string; part: string } {
  const ids = [...rels.matchAll(/ Id="([^"]+)"/g)].map((match) => match[1]);
  const taken = new Set(ids.filter((id) => /^rId\d+$/.test(id)));
  let next = 1;
  for (const id of ids) {
    if (/^rId\d+$/.test(id)) continue;
    while (taken.has(`rId${next}`)) next += 1;
    const replacement = `rId${next}`;
    taken.add(replacement);
    rels = rels.split(`"${id}"`).join(`"${replacement}"`);
    part = part.split(`"${id}"`).join(`"${replacement}"`);
  }
  return { rels, part };
}

const TEXT = /\.(xml|rels)$/;

/** The same document, packaged the way a strict OPC reader expects it. */
export async function conformPackage(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const source = await JSZip.loadAsync(bytes);
  const names = Object.keys(source.files).filter((name) => !source.files[name].dir);

  const parts = new Map<string, string | Uint8Array>();
  for (const name of names) {
    const file = source.files[name];
    parts.set(name, TEXT.test(name) ? await file.async("string") : await file.async("uint8array"));
  }

  const core = parts.get("docProps/core.xml");
  if (typeof core === "string") parts.set("docProps/core.xml", wholeSeconds(core));
  const app = parts.get("docProps/app.xml");
  if (typeof app === "string") parts.set("docProps/app.xml", application(app));

  const rels = parts.get("word/_rels/document.xml.rels");
  const document = parts.get("word/document.xml");
  if (typeof rels === "string" && typeof document === "string") {
    const renumbered = renumberRelationships(rels, document);
    parts.set("word/_rels/document.xml.rels", renumbered.rels);
    parts.set("word/document.xml", renumbered.part);
  }

  const ordered = [...parts.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const out = new JSZip();
  for (const name of ordered) out.file(name, parts.get(name)!, { createFolders: false, date: new Date(0) });

  return out.generateAsync({ type: "arraybuffer", compression: "DEFLATE", streamFiles: false });
}
