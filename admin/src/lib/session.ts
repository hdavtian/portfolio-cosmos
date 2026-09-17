import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./apiClient";

export interface SessionState {
  authenticated: boolean;
}

export const sessionQueryKey = ["session"] as const;

export function useSessionQuery() {
  return useQuery({
    queryKey: sessionQueryKey,
    queryFn: () => api.get<SessionState>("/api/v1/auth/session"),
    staleTime: 60_000,
    retry: false,
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (password: string) =>
      api.post<SessionState>("/api/v1/auth/login", { password }),
    onSuccess: () => {
      queryClient.setQueryData(sessionQueryKey, { authenticated: true });
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<SessionState>("/api/v1/auth/logout"),
    onSuccess: () => {
      // Drop every cached admin response, not just the session.
      queryClient.clear();
      queryClient.setQueryData(sessionQueryKey, { authenticated: false });
    },
  });
}
