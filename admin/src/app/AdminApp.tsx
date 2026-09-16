import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./AdminLayout";
import { RequireSession } from "./RequireSession";
import { ENTITY_DEFINITIONS } from "../entities/definitions";
import { DashboardPage } from "../pages/DashboardPage";
import { EntityEditPage } from "../pages/EntityEditPage";
import { EntityListPage } from "../pages/EntityListPage";
import { ExperienceDetailPage } from "../pages/ExperienceDetailPage";
import { ExperiencesPage } from "../pages/ExperiencesPage";
import { LoginPage } from "../pages/LoginPage";
import { ProfilePage } from "../pages/ProfilePage";
import { ReleasesPage } from "../pages/ReleasesPage";
import { MediaDetailPage } from "../pages/MediaDetailPage";
import { MediaPage } from "../pages/MediaPage";
import { PortfolioCoreEditPage } from "../pages/PortfolioCoreEditPage";
import { PortfolioCoresPage } from "../pages/PortfolioCoresPage";
import { PortfolioEntriesPage } from "../pages/PortfolioEntriesPage";
import { PortfolioEntryEditPage } from "../pages/PortfolioEntryEditPage";
import { PathMessageEditPage } from "../pages/PathMessageEditPage";

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
            <Route path="profile" element={<ProfilePage />} />
            <Route path="releases" element={<ReleasesPage />} />
            <Route path="media" element={<MediaPage />} />
            <Route path="media/:id" element={<MediaDetailPage />} />
            <Route path="portfolioEntries" element={<PortfolioEntriesPage />} />
            <Route path="portfolioEntries/:slug" element={<PortfolioEntryEditPage />} />
            <Route path="portfolioCores" element={<PortfolioCoresPage />} />
            <Route path="portfolioCores/:slug" element={<PortfolioCoreEditPage />} />
            <Route path="pathTravelMessages/:slug" element={<PathMessageEditPage />} />
            {/* Config-driven sections; keyed so switching entity resets grid state. */}
            {ENTITY_DEFINITIONS.flatMap((definition) => [
              <Route
                key={`${definition.entity}-list`}
                path={definition.entity}
                element={<EntityListPage key={definition.entity} definition={definition} />}
              />,
              ...(definition.customEditor
                ? []
                : [
                    <Route
                      key={`${definition.entity}-edit`}
                      path={`${definition.entity}/:slug`}
                      element={<EntityEditPage key={definition.entity} definition={definition} />}
                    />,
                  ]),
            ])}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
