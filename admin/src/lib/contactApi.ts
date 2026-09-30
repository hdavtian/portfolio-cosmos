import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ContactSettings, ContactStatus } from "@hd/content-schema";
import { api } from "./apiClient";
import type { ListState } from "./entityApi";

/**
 * Contact Form Submissions, client side. HD-4.
 *
 * Its own hooks rather than `entityApi`'s, because a submission is not a
 * content entity: it has no slug, it is keyed by id, it is never created from
 * here, and the list carries per-status counts the generic paged shape has no
 * room for. Reusing `useEntityList` would have meant widening it for the one
 * caller that is not an entity.
 */

const BASE = "/api/v2/admin/contactSubmissions";

export interface ContactSubmissionRecord {
  id: string;
  reference: string;
  name: string;
  email: string;
  message: string;
  status: ContactStatus;
  notes: string;
  submittedAt: string;
  sourcePath?: string;
  userAgent?: string;
  mailError?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ContactSubmissionPage {
  items: ContactSubmissionRecord[];
  total: number;
  page: number;
  pageSize: number;
  /** How many messages sit in each status, for the filter chips. */
  counts: Partial<Record<ContactStatus, number>>;
}

export type ContactSettingsRecord = ContactSettings & {
  version: number;
  /** False when no Gmail credential is set, so the page can say so plainly. */
  mailConfigured: boolean;
};

export const CONTACT_KEY = ["contactSubmissions"] as const;

const listPath = (state: ListState, status?: ContactStatus): string => {
  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
  });
  if (state.sort) params.set("sort", state.sort);
  if (state.search) params.set("search", state.search);
  if (status) params.set("status", status);
  return `${BASE}?${params.toString()}`;
};

export function useContactSubmissions(state: ListState, status?: ContactStatus) {
  return useQuery({
    queryKey: [...CONTACT_KEY, "list", state, status ?? "all"],
    queryFn: () => api.get<ContactSubmissionPage>(listPath(state, status)),
    placeholderData: (previous) => previous,
  });
}

export function useContactSubmission(id: string | undefined) {
  return useQuery({
    queryKey: [...CONTACT_KEY, "detail", id ?? ""],
    queryFn: () => api.get<ContactSubmissionRecord>(`${BASE}/${id}`),
    enabled: Boolean(id),
  });
}

/**
 * Invalidates every cached view after a write. Deliberately does not return the
 * promise, for the reason spelled out in `entityApi`'s `useInvalidate`: awaiting
 * a refetch here drops the callbacks passed to `mutate()`, which are the
 * navigation back to the list and the success message.
 */
const useInvalidate = () => {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: CONTACT_KEY });
  };
};

export function usePatchContactSubmission() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      status,
      notes,
      version,
    }: {
      id: string;
      status?: ContactStatus;
      notes?: string;
      version: number;
    }) =>
      api.patch<ContactSubmissionRecord>(`${BASE}/${id}`, {
        ...(status === undefined ? {} : { status }),
        ...(notes === undefined ? {} : { notes }),
        version,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteContactSubmission() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`${BASE}/${id}`),
    onSuccess: invalidate,
  });
}

export const CONTACT_SETTINGS_KEY = [...CONTACT_KEY, "settings"] as const;

export function useContactSettings() {
  return useQuery({
    queryKey: CONTACT_SETTINGS_KEY,
    queryFn: () => api.get<ContactSettingsRecord>(`${BASE}/settings`),
  });
}

export function useSaveContactSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: ContactSettings & { version: number }) =>
      api.put<ContactSettingsRecord>(`${BASE}/settings`, settings),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CONTACT_SETTINGS_KEY });
    },
  });
}
