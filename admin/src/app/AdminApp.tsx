import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./AdminLayout";
import { RequireSession } from "./RequireSession";
import { PENDING_CHANGES_KEY } from "../lib/pendingChanges";
import { ENTITY_DEFINITIONS } from "../entities/definitions";
import { DashboardPage } from "../pages/DashboardPage";
import { EntityEditPage } from "../pages/EntityEditPage";
import { EntityListPage } from "../pages/EntityListPage";
import { ExperienceDetailPage } from "../pages/ExperienceDetailPage";
import { ExperiencesPage } from "../pages/ExperiencesPage";
import { LoginPage } from "../pages/LoginPage";
import { ProfilePage } from "../pages/ProfilePage";
import { ResumeSkillsPage } from "../pages/ResumeSkillsPage";
import { ReleasesPage } from "../pages/ReleasesPage";
import { MediaDetailPage } from "../pages/MediaDetailPage";
import { MediaPage } from "../pages/MediaPage";
import { PortfolioCoreEditPage } from "../pages/PortfolioCoreEditPage";
import { PortfolioCoresPage } from "../pages/PortfolioCoresPage";
import { PortfolioEntriesPage } from "../pages/PortfolioEntriesPage";
import { PortfolioEntryEditPage } from "../pages/PortfolioEntryEditPage";
import { PathMessageEditPage } from "../pages/PathMessageEditPage";
import { TaggingPage } from "../pages/TaggingPage";
import { TechnologiesPage } from "../pages/TechnologiesPage";

export function AdminApp() {
  // Admin data is never persisted to localStorage and never served stale: an
  // editor must always see what is actually in the database.
  const [queryClient] = useState(() => {
    const client: QueryClient = new QueryClient({
      // Any successful save, delete, reorder, upload or publish may change what
      // is waiting to be published, so the sidebar badge and the Publishing
      // page's change list are recomputed after every one.
      mutationCache: new MutationCache({
        onSuccess: () => void client.invalidateQueries({ queryKey: PENDING_CHANGES_KEY }),
      }),
      defaultOptions: {
        queries: {
          staleTime: 0,
          refetchOnWindowFocus: true,
          retry: false,
        },
      },
    });
    return client;
  });

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
            <Route path="resumeSkills" element={<ResumeSkillsPage />} />
            <Route path="releases" element={<ReleasesPage />} />
            <Route path="media" element={<MediaPage />} />
            <Route path="media/:id" element={<MediaDetailPage />} />
            <Route path="portfolioEntries" element={<PortfolioEntriesPage />} />
            {/* Before the :slug route, or "tagging" would be read as a project. */}
            <Route path="portfolioEntries/tagging" element={<TaggingPage />} />
            <Route path="portfolioEntries/:slug" element={<PortfolioEntryEditPage />} />
            <Route path="portfolioCores" element={<PortfolioCoresPage />} />
            <Route path="portfolioCores/:slug" element={<PortfolioCoreEditPage />} />
            <Route path="pathTravelMessages/:slug" element={<PathMessageEditPage />} />
            <Route path="technologies" element={<TechnologiesPage />} />
            {/* Config-driven sections; keyed so switching entity resets grid state. */}
            {ENTITY_DEFINITIONS.flatMap((definition) => [
              ...(definition.customList
                ? []
                : [
                    <Route
                      key={`${definition.entity}-list`}
                      path={definition.entity}
                      element={<EntityListPage key={definition.entity} definition={definition} />}
                    />,
                  ]),
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
