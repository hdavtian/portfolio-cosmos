import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./apiClient";

/** Every stored record carries these alongside its content fields. */
export interface RecordMeta {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export type EntityRecord<T> = T & RecordMeta & { slug: string };

const META_KEYS = new Set<string>(["id", "version", "createdAt", "updatedAt", "updatedBy"]);

/** The editable content of a record, without the storage metadata. */
export const withoutMeta = <T>(record: EntityRecord<T>): T =>
  Object.fromEntries(Object.entries(record).filter(([key]) => !META_KEYS.has(key))) as T;

export interface PagedResult<T> {
  items: Array<EntityRecord<T>>;
  total: number;
  page: number;
  pageSize: number;
}

/** Grid state the API understands: one page, one sort, one search term. */
export interface ListState {
  page: number;
  pageSize: number;
  sort?: string;
  search?: string;
}

export const DEFAULT_LIST_STATE: ListState = { page: 1, pageSize: 25 };

const listPath = (entity: string, state: ListState): string => {
  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
  });
  if (state.sort) params.set("sort", state.sort);
  if (state.search) params.set("search", state.search);
  return `/api/v2/admin/${entity}?${params.toString()}`;
};

export const entityKeys = {
  list: (entity: string, state: ListState) => [entity, "list", state] as const,
  detail: (entity: string, slug: string) => [entity, "detail", slug] as const,
};

export function useEntityList<T>(entity: string, state: ListState) {
  return useQuery({
    queryKey: entityKeys.list(entity, state),
    queryFn: () => api.get<PagedResult<T>>(listPath(entity, state)),
    placeholderData: (previous) => previous,
  });
}

export function useEntity<T>(entity: string, slug: string | undefined) {
  return useQuery({
    queryKey: entityKeys.detail(entity, slug ?? ""),
    queryFn: () => api.get<EntityRecord<T>>(`/api/v2/admin/${entity}/${slug}`),
    enabled: Boolean(slug),
  });
}

/** Invalidates every cached view of an entity after a write. */
const useInvalidate = (entity: string) => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [entity] });
};

export function useCreateEntity<T>(entity: string) {
  const invalidate = useInvalidate(entity);
  return useMutation({
    mutationFn: (content: T) => api.post<EntityRecord<T>>(`/api/v2/admin/${entity}`, content),
    onSuccess: invalidate,
  });
}

export function useUpdateEntity<T>(entity: string) {
  const invalidate = useInvalidate(entity);
  return useMutation({
    // The version travels with the body; a stale one returns 409 rather than
    // overwriting someone else's edit.
    mutationFn: ({ slug, content, version }: { slug: string; content: T; version: number }) =>
      api.put<EntityRecord<T>>(`/api/v2/admin/${entity}/${slug}`, { ...content, version }),
    onSuccess: invalidate,
  });
}

export function useDeleteEntity(entity: string) {
  const invalidate = useInvalidate(entity);
  return useMutation({
    mutationFn: (slug: string) => api.delete<void>(`/api/v2/admin/${entity}/${slug}`),
    onSuccess: invalidate,
  });
}

export function useReorderEntity(entity: string) {
  const invalidate = useInvalidate(entity);
  return useMutation({
    mutationFn: (slugs: string[]) => api.put<unknown>(`/api/v2/admin/${entity}/order`, { slugs }),
    onSuccess: invalidate,
  });
}
