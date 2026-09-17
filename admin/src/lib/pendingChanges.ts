import { useQuery } from "@tanstack/react-query";
import { api } from "./apiClient";

export interface PendingChanges {
  neverPublished: boolean;
  lines: string[];
}

/** Shared by the sidebar badge and the Publishing page, so both always agree. */
export const PENDING_CHANGES_KEY = ["releases", "pending-changes"] as const;

export function usePendingChanges() {
  return useQuery({
    queryKey: PENDING_CHANGES_KEY,
    queryFn: () => api.get<PendingChanges>("/api/v2/admin/releases/pending-changes"),
  });
}
