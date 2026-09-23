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

/** Every page of an entity, fetched in turn and joined; the API caps a page at 100. */
export async function fetchAllEntities<T>(entity: string): Promise<Array<EntityRecord<T>>> {
  const first = await api.get<PagedResult<T>>(listPath(entity, { page: 1, pageSize: 100, sort: "sortOrder" }));
  const pages = Math.ceil(first.total / first.pageSize);
  if (pages <= 1) return first.items;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) =>
      api.get<PagedResult<T>>(listPath(entity, { page: index + 2, pageSize: 100, sort: "sortOrder" })),
    ),
  );
  return [first, ...rest].flatMap((page) => page.items);
}

/**
 * Every record of an entity, in saved order, for grids in local mode and for
 * pickers. Fetches every page, so a list that grows past 100 - the master
 * technology list did - is never silently cut off at the API's page cap.
 */
export function useAllEntities<T>(entity: string) {
  const query = useQuery({
    queryKey: [entity, "all"],
    queryFn: () => fetchAllEntities<T>(entity),
    placeholderData: (previous) => previous,
  });
  return {
    ...query,
    items: query.data,
    /** Kept for callers that still render a notice; nothing is cut off any more. */
    truncated: false,
  };
}

export function useEntity<T>(entity: string, slug: string | undefined) {
  return useQuery({
    queryKey: entityKeys.detail(entity, slug ?? ""),
    queryFn: () => api.get<EntityRecord<T>>(`/api/v2/admin/${entity}/${slug}`),
    enabled: Boolean(slug),
  });
}

/**
 * Invalidates every cached view of an entity after a write. Deliberately does
 * not return the promise: TanStack awaits a hook-level onSuccess before running
 * the callbacks passed to mutate(), and by the time the refetch resolves the
 * editor - keyed by record version - has remounted, so those callbacks (the
 * navigation back to the list, the success message) were dropped on the floor.
 */
const useInvalidate = (entity: string) => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [entity] });
  };
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
