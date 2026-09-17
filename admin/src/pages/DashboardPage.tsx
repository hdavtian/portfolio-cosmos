import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/apiClient";

interface ReleaseStatus {
  current: { id: number; notes: string; publishedAt: string; publishedBy: string } | null;
  unpublishedChanges: number;
  neverPublished: boolean;
}

interface PagedResponse {
  total: number;
}

// Counts come from each list endpoint with pageSize=1: cheap, and avoids a
// bespoke summary endpoint that would need maintaining alongside the entities.
const COUNTED = [
  { key: "experiences", label: "Experience" },
  { key: "portfolioEntries", label: "Projects" },
  { key: "skills", label: "Skills" },
  { key: "aboutDeckSlides", label: "About slides" },
  { key: "pathTravelMessages", label: "Path messages" },
  { key: "media", label: "Media" },
] as const;

export function DashboardPage() {
  const status = useQuery({
    queryKey: ["releases", "status"],
    queryFn: () => api.get<ReleaseStatus>("/api/v2/admin/releases/status"),
  });

  const counts = useQuery({
    queryKey: ["dashboard", "counts"],
    queryFn: async () => {
      const entries = await Promise.all(
        COUNTED.map(async ({ key, label }) => {
          const page = await api.get<PagedResponse>(`/api/v2/admin/${key}?pageSize=1`);
          return [label, page.total] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
  });

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1>Dashboard</h1>
          <p>What is live, and what is waiting to be published.</p>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: 18 }}>
        {status.isLoading ? (
          <p className="admin-status">Loading publish status…</p>
        ) : status.isError ? (
          <p className="admin-error">Could not load publish status.</p>
        ) : status.data?.neverPublished ? (
          <>
            <div className="admin-card__label">Published</div>
            <div className="admin-card__value">Never</div>
            <p className="admin-status" style={{ marginTop: 6 }}>
              The public API returns 404 until the first publish.
            </p>
          </>
        ) : (
          <>
            <div className="admin-card__label">Live release</div>
            <div className="admin-card__value">#{status.data?.current?.id}</div>
            <p className="admin-status" style={{ marginTop: 6 }}>
              Published {new Date(status.data!.current!.publishedAt).toLocaleString()} by{" "}
              {status.data?.current?.publishedBy}
              {status.data?.current?.notes ? ` — ${status.data.current.notes}` : ""}
              {" · "}
              {status.data!.unpublishedChanges > 0
                ? `${status.data!.unpublishedChanges} change${status.data!.unpublishedChanges === 1 ? "" : "s"} not yet published`
                : "No unpublished changes"}
            </p>
          </>
        )}
      </div>

      <div className="admin-card-grid">
        {COUNTED.map(({ label }) => (
          <div className="admin-card" key={label}>
            <div className="admin-card__label">{label}</div>
            <div className="admin-card__value">
              {counts.isLoading ? "…" : (counts.data?.[label] ?? "—")}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
