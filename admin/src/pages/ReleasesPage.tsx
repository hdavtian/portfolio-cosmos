import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import {
  ColumnDirective,
  ColumnsDirective,
  GridComponent,
  Inject,
  Page,
  Resize,
  Sort,
} from "@syncfusion/ej2-react-grids";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useStatus } from "../lib/status";
import { api } from "../lib/apiClient";
import { confirmAction } from "../lib/confirm";

interface ReleaseSummary {
  id: number;
  notes: string;
  publishedAt: string;
  publishedBy: string;
  current: boolean;
  etag: string;
  rolledBackFrom?: number;
}

interface ReleaseStatus {
  current: { id: number; notes: string; publishedAt: string; publishedBy: string } | null;
  unpublishedChanges: number;
  neverPublished: boolean;
}

interface PendingChanges {
  neverPublished: boolean;
  lines: string[];
}

// Passed to the grid as a constant: a new object on each render makes
// Syncfusion refresh the grid.
const HISTORY_PAGE_SETTINGS = { pageSize: 25 };

// Matches the API's limit on release notes.
const NOTES_MAX = 500;

/** Joins change lines into notes, trimming whole lines to stay within the limit. */
const toNotes = (lines: string[]): string => {
  let notes = "";
  for (const [index, line] of lines.entries()) {
    const remaining = lines.length - index - 1;
    const next = notes ? `${notes}; ${line}` : line;
    const suffix = remaining > 0 ? `; and ${remaining} more` : "";
    if ((next + suffix).length > NOTES_MAX) {
      return `${notes}; and ${lines.length - index} more`.slice(0, NOTES_MAX);
    }
    notes = next;
  }
  return notes;
};

// The history grid uses plain text columns, not React templates: its template
// cells rendered empty, which also hid the per-row Roll back buttons. Rolling
// back now works on the selected row instead.
type HistoryRow = ReleaseSummary & { publishedLabel: string; notesLabel: string };

const toHistoryRow = (release: ReleaseSummary): HistoryRow => ({
  ...release,
  publishedLabel: new Date(release.publishedAt).toLocaleString(),
  notesLabel: `${release.current ? "LIVE · " : ""}${release.notes || "No notes"}`,
});

export function ReleasesPage() {
  const queryClient = useQueryClient();
  const statusLine = useStatus();
  const [notes, setNotes] = useState("");

  const status = useQuery({
    queryKey: ["releases", "status"],
    queryFn: () => api.get<ReleaseStatus>("/api/v2/admin/releases/status"),
  });

  const history = useQuery({
    queryKey: ["releases", "history"],
    queryFn: () => api.get<{ items: ReleaseSummary[] }>("/api/v2/admin/releases"),
  });

  // Recomputed from the drafts each time the page is shown or refocused.
  const pending = useQuery({
    queryKey: ["releases", "pending-changes"],
    queryFn: () => api.get<PendingChanges>("/api/v2/admin/releases/pending-changes"),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["releases"] });

  const copyChanges = async (lines: string[]) => {
    try {
      await navigator.clipboard.writeText(lines.map((line) => `- ${line}`).join("\n"));
      statusLine.success("Changes copied to the clipboard.");
    } catch {
      statusLine.failure("Could not copy. Select the text in the list and copy it instead.");
    }
  };

  const check = useMutation({
    mutationFn: () => api.get<{ ok: boolean }>("/api/v2/admin/releases/draft-check"),
    onSuccess: () => statusLine.success("Drafts are valid: everything passes validation and can be published."),
    onError: (error) => statusLine.error(error, "Drafts need fixing before publishing."),
  });

  const publish = useMutation({
    mutationFn: () => api.post<ReleaseSummary>("/api/v2/admin/releases/publish", { notes: notes.trim() }),
    onSuccess: (release) => {
      setNotes("");
      void refresh();
      statusLine.success(`Release #${release.id} is live on both sites.`);
    },
    onError: (error) => statusLine.error(error, "Could not publish."),
  });

  const rollback = useMutation({
    mutationFn: (id: number) => api.post<ReleaseSummary>(`/api/v2/admin/releases/${id}/rollback`),
    onSuccess: (release) => {
      setSelectedRelease(null);
      void refresh();
      statusLine.success(
        `Rolled back to release #${release.rolledBackFrom}, published as release #${release.id}. Your drafts are unchanged.`,
      );
    },
    onError: (error) => statusLine.error(error, "Could not roll back."),
  });

  const confirmPublish = () => {
    if (publish.isPending) return;
    confirmAction({
      title: "Publish all drafts?",
      content: "Both sites will switch to the current drafts. You can roll back afterwards.",
      confirmText: "Publish",
      onConfirm: () => publish.mutate(),
    });
  };

  const confirmRollback = (release: ReleaseSummary) => {
    if (rollback.isPending) return;
    confirmAction({
      title: `Roll back to release #${release.id}?`,
      content:
        "Its content is republished as a new release, so the sites show it again. History is kept, and your drafts are not changed.",
      confirmText: "Roll back",
      confirmClass: "e-danger e-outline",
      onConfirm: () => rollback.mutate(release.id),
    });
  };


  const historyRows = useMemo(() => (history.data?.items ?? []).map(toHistoryRow), [history.data]);
  const [selectedRelease, setSelectedRelease] = useState<ReleaseSummary | null>(null);

  const busy = publish.isPending || check.isPending;
  const s = status.data;

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Publishing</h1>
          <p>Edits are drafts until published. Publishing freezes a snapshot that both sites serve.</p>
        </div>
      </div>

      <section className="admin-card">
        <div className="admin-card__label">Status</div>
        {status.isLoading ? (
          <p className="admin-status">Loading…</p>
        ) : s?.neverPublished ? (
          <p style={{ margin: "6px 0 0" }}>Nothing published yet. The public API returns 404 until you publish.</p>
        ) : (
          <p style={{ margin: "6px 0 0" }}>
            Release <strong>#{s?.current?.id}</strong> is live, published{" "}
            {s?.current ? new Date(s.current.publishedAt).toLocaleString() : ""}.{" "}
            {pending.data
              ? pending.data.lines.length > 0
                ? `${pending.data.lines.length} change${pending.data.lines.length === 1 ? "" : "s"} waiting to be published.`
                : "No unpublished changes."
              : s && s.unpublishedChanges > 0
                ? `${s.unpublishedChanges} draft change${s.unpublishedChanges === 1 ? "" : "s"} not yet published.`
                : "No unpublished changes."}
          </p>
        )}

        <div className="admin-form__row" style={{ marginTop: 12 }}>
          <div className="admin-form__label">Changes</div>
          <div className="admin-form__control">
            {pending.isLoading ? (
              <p className="admin-status">Working out what changed…</p>
            ) : pending.isError ? (
              <p className="admin-error">Could not work out the changes.</p>
            ) : pending.data && pending.data.lines.length > 0 ? (
              <>
                <ul className="admin-change-list" aria-label="Changes waiting to be published">
                  {pending.data.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <ButtonComponent
                    cssClass="e-small e-flat e-outline"
                    onClick={() => setNotes(toNotes(pending.data.lines))}
                  >
                    Use as notes
                  </ButtonComponent>
                  <ButtonComponent cssClass="e-small e-flat e-outline" onClick={() => void copyChanges(pending.data.lines)}>
                    Copy
                  </ButtonComponent>
                </div>
              </>
            ) : (
              <p className="admin-status" style={{ margin: 0 }}>Nothing has changed since the live release.</p>
            )}
          </div>
        </div>

        <div className="admin-form__row" style={{ marginTop: 12 }}>
          <div className="admin-form__label">Notes</div>
          <div className="admin-form__control">
            <TextBoxComponent
              placeholder="What changed? (optional)"
              multiline
              maxLength={NOTES_MAX}
              value={notes}
              input={(event: { value: string }) => setNotes(event.value)}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <ButtonComponent cssClass="e-flat e-outline" disabled={busy} onClick={() => check.mutate()}>
            {check.isPending ? "Checking…" : "Check drafts"}
          </ButtonComponent>
          <ButtonComponent cssClass="e-primary e-outline" disabled={busy} onClick={confirmPublish}>
            {publish.isPending ? "Publishing…" : "Publish"}
          </ButtonComponent>
        </div>
      </section>

      <section className="admin-card admin-section">
        <div className="admin-section__header">
          <h2>History</h2>
        </div>
        {history.isError ? <p className="admin-error">Could not load release history.</p> : null}
        {history.isLoading ? <p className="admin-status">Loading…</p> : null}
        {history.data ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px" }}>
              <ButtonComponent
                cssClass="e-small e-danger e-outline"
                disabled={!selectedRelease || selectedRelease.current || rollback.isPending}
                onClick={() => selectedRelease && confirmRollback(selectedRelease)}
              >
                {rollback.isPending ? "Rolling back…" : "Roll back to selected release"}
              </ButtonComponent>
              <span className="admin-status">
                {selectedRelease
                  ? selectedRelease.current
                    ? `Release #${selectedRelease.id} is already live.`
                    : `Release #${selectedRelease.id} selected.`
                  : "Select an earlier release to roll back to it."}
              </span>
            </div>
            <GridComponent
              key={history.data.items[0]?.id ?? "empty"}
              dataSource={historyRows}
              allowPaging
              allowSorting
              allowResizing
              pageSettings={HISTORY_PAGE_SETTINGS}
              gridLines="Horizontal"
              rowSelected={(args: { data?: HistoryRow }) => setSelectedRelease(args.data ?? null)}
              rowDeselected={() => setSelectedRelease(null)}
            >
              <ColumnsDirective>
                <ColumnDirective field="id" headerText="#" width={70} textAlign="Right" />
                <ColumnDirective field="publishedLabel" headerText="Published" width={190} allowSorting={false} />
                <ColumnDirective field="publishedBy" headerText="By" width={110} />
                <ColumnDirective field="notesLabel" headerText="Notes" width={420} clipMode="EllipsisWithTooltip" />
              </ColumnsDirective>
              <Inject services={[Page, Sort, Resize]} />
            </GridComponent>
          </>
        ) : null}
      </section>
    </>
  );
}
