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

const FORMATS: Array<{ format: Format; label: string; type: string }> = [
  { format: "docx", label: "Word (.docx)", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  { format: "pdf", label: "PDF (.pdf)", type: "application/pdf" },
  { format: "txt", label: "Plain text (.txt)", type: "text/plain" },
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
      </header>

      <section className="showcase-resume__downloads" aria-label="Formats">
        {FORMATS.map((entry) => (
          <button
            key={entry.format}
            type="button"
            className="showcase-resume__download-button"
            disabled={!release || busy !== null}
            onClick={() => void download(entry.format)}
          >
            {busy === entry.format ? "Writing…" : entry.label}
          </button>
        ))}
        {error ? <p className="showcase-resume__download-error">{error}</p> : null}
        {!release ? <p className="showcase-label">Loading the résumé…</p> : null}
      </section>
    </article>
  );
}
