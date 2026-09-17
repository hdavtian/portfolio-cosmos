import { useQuery } from "@tanstack/react-query";
import { api } from "./apiClient";

export interface MediaThumb {
  id: string;
  url: string;
  altText: string;
  width?: number;
  height?: number;
}

/** Resolves many media ids to thumbnails in a single request. */
export function useMediaLookup(ids: Array<string | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))].sort();

  const query = useQuery({
    queryKey: ["media", "lookup", unique],
    queryFn: () => api.get<{ items: MediaThumb[] }>(`/api/v2/admin/media/lookup?ids=${unique.join(",")}`),
    enabled: unique.length > 0,
    staleTime: 60_000,
  });

  const byId = new Map((query.data?.items ?? []).map((item) => [item.id, item]));
  return { byId, isLoading: query.isLoading };
}
