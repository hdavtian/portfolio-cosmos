import { useState } from "react";
import { Link } from "react-router-dom";
import { useReleaseQuery } from "../../../lib/query/contentQueries";

/**
 * The resume as a file: Word, PDF and plain text, each written in the browser
 * from the published release the moment it is asked for, so every download is
 * the current truth and there is nothing to keep in sync. The writers are
 * loaded on the click, not with the page.
 */
type Format = "docx" | "pdf" | "txt";

const FORMATS: Array<{ format: Format; label: string; note: string; type: string }> = [
  {
    format: "docx",
    label: "Word",
    note: "The version to send. One column, real headings and bullets, so it reads cleanly in Word, Google Docs and applicant-tracking systems.",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    format: "pdf",
    label: "PDF",
    note: "The same document, fixed. US Letter, selectable text, standard fonts.",
    type: "application/pdf",
  },
  {
    format: "txt",
    label: "Plain text",
    note: "For forms that want it pasted in: capitals for sections, dashes for bullets, nothing that needs a font.",
    type: "text/plain",
  },
];

export function ShowcaseResumeDownloadPage() {
  const release = useReleaseQuery().data;
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async (format: Format) => {
    if (!release || busy) return;
    setBusy(format);
    setError(null);
    try {
      const { resumeModel } = await import("@hd/resume-export/model");
      const model = resumeModel(release);
      let bytes: BlobPart;
      if (format === "docx") bytes = await (await import("@hd/resume-export/docx")).resumeDocx(model);
      else if (format === "pdf") bytes = (await (await import("@hd/resume-export/pdf")).resumePdf(model)) as BlobPart;
      else bytes = (await import("@hd/resume-export/text")).resumeText(model);
      const blob = new Blob([bytes], { type: FORMATS.find((entry) => entry.format === format)!.type });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${model.fileStem}.${format}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      console.error("[resume] could not write the file", cause);
      setError("The file could not be written. Refresh and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="showcase-resume showcase-resume--download">
      <header className="showcase-resume__intro">
        <Link to="/resume" className="showcase-back showcase-resume__back">
          <span className="showcase-back__arrow" aria-hidden="true" />
          Résumé
        </Link>
        <p className="showcase-label">Download</p>
        <h1 className="showcase-resume__name">{release?.profile.name ?? "Résumé"}</h1>
        <p className="showcase-resume__summary">
          Each file is written from the same published data as the page, the moment you ask for it. What you
          download is always the current version.
        </p>
      </header>

      <section className="showcase-resume__downloads" aria-label="Formats">
        {FORMATS.map((entry) => (
          <div className="showcase-resume__download" key={entry.format}>
            <button
              type="button"
              className="showcase-resume__download-button"
              disabled={!release || busy !== null}
              onClick={() => void download(entry.format)}
            >
              {busy === entry.format ? "Writing…" : `Download ${entry.label}`}
            </button>
            <p>{entry.note}</p>
          </div>
        ))}
        {error ? <p className="showcase-resume__download-error">{error}</p> : null}
        {!release ? <p className="showcase-label">Loading the résumé…</p> : null}
      </section>
    </article>
  );
}
