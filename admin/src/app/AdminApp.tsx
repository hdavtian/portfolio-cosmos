import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./AdminLayout";
import { RequireSession } from "./RequireSession";
import { DashboardPage } from "../pages/DashboardPage";
import { ExperienceDetailPage } from "../pages/ExperienceDetailPage";
import { ExperiencesPage } from "../pages/ExperiencesPage";
import { LoginPage } from "../pages/LoginPage";

export function AdminApp() {
  // Admin data is never persisted to localStorage and never served stale: an
  // editor must always see what is actually in the database.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0,
            refetchOnWindowFocus: true,
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireSession>
                <AdminLayout />
              </RequireSession>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="experiences" element={<ExperiencesPage />} />
            <Route path="experiences/:slug" element={<ExperienceDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
