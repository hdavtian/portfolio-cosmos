import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { TextBoxComponent } from "@syncfusion/ej2-react-inputs";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/apiClient";
import { useMediaLookup, type MediaThumb } from "../lib/mediaLookup";
import { ImagePreview } from "./ImagePreview";

const PAGE_SIZE = 24;

interface MediaPickerProps {
  value: string | undefined;
  onChange: (mediaId: string) => void;
}

/**
 * Chooses an image from the media library. It opens as a panel inside the page
 * rather than a pop-up, so the editor stays one continuous form.
 */
export function MediaPicker({ value, onChange }: MediaPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [previewing, setPreviewing] = useState(false);
  const selected = useMediaLookup([value]).byId.get(value ?? "");

  const results = useQuery({
    queryKey: ["media", "picker", search, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search.trim()) params.set("search", search.trim());
      return api.get<{ items: MediaThumb[]; total: number }>(`/api/v2/admin/media?${params.toString()}`);
    },
    enabled: open,
    placeholderData: (previous) => previous,
  });

  const totalPages = Math.max(1, Math.ceil((results.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {selected ? (
          <button
            type="button"
            className="admin-thumb-button"
            title="Click to enlarge"
            onClick={() => setPreviewing(true)}
          >
            <img
              src={selected.url}
              alt={selected.altText}
              style={{ width: 96, height: 64, objectFit: "cover", borderRadius: 4, display: "block" }}
            />
          </button>
        ) : (
          <div
            className="admin-status"
            style={{ width: 96, height: 64, display: "grid", placeItems: "center", border: "1px dashed #dfe3e8", borderRadius: 4 }}
          >
            {value ? "…" : "None"}
          </div>
        )}
        <ButtonComponent cssClass="e-small e-outline e-primary" onClick={() => setOpen((current) => !current)}>
          {open ? "Close library" : value ? "Change image" : "Choose image"}
        </ButtonComponent>
      </div>

      <ImagePreview image={previewing && selected ? selected : null} onClose={() => setPreviewing(false)} />

      {open ? (
        <div style={{ marginTop: 10, border: "1px solid #dfe3e8", borderRadius: 6, padding: 10 }}>
          <TextBoxComponent
            placeholder="Search by file name or alt text"
            value={search}
            input={(event: { value: string }) => {
              setSearch(event.value);
              setPage(1);
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
              gap: 8,
              marginTop: 10,
            }}
          >
            {(results.data?.items ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.altText || item.url.split("/").pop()}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                style={{
                  padding: 0,
                  cursor: "pointer",
                  background: "none",
                  borderRadius: 4,
                  border: item.id === value ? "2px solid #1f6feb" : "1px solid #dfe3e8",
                }}
              >
                <img
                  src={item.url}
                  alt={item.altText}
                  loading="lazy"
                  style={{ width: "100%", height: 76, objectFit: "cover", display: "block", borderRadius: 3 }}
                />
              </button>
            ))}
          </div>
          {results.data?.items.length === 0 ? <p className="admin-status">No images match.</p> : null}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <ButtonComponent cssClass="e-small e-flat e-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </ButtonComponent>
            <span className="admin-status">
              Page {page} of {totalPages}
            </span>
            <ButtonComponent
              cssClass="e-small e-flat e-outline"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </ButtonComponent>
          </div>
        </div>
      ) : null}
    </div>
  );
}
