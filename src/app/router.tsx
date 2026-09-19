import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from "react-router-dom";
import { RootLayout } from "./layouts/RootLayout";

const FastLayout = lazy(() =>
  import("./layouts/FastLayout").then((module) => ({
    default: module.FastLayout,
  })),
);
const ShowcaseLayout = lazy(() =>
  import("../features/showcase/ShowcaseLayout").then((module) => ({
    default: module.ShowcaseLayout,
  })),
);
const ShowcaseIndexPage = lazy(() =>
  import("../features/showcase/pages/ShowcaseIndexPage").then((module) => ({
    default: module.ShowcaseIndexPage,
  })),
);
const ShowcaseProjectPage = lazy(() =>
  import("../features/showcase/pages/ShowcaseProjectPage").then((module) => ({
    default: module.ShowcaseProjectPage,
  })),
);
const PortfolioPage = lazy(() =>
  import("../features/fast/pages/PortfolioPage").then((module) => ({
    default: module.PortfolioPage,
  })),
);
const PortfolioDetailPage = lazy(() =>
  import("../features/fast/pages/PortfolioDetailPage").then((module) => ({
    default: module.PortfolioDetailPage,
  })),
);
// Sketches for the skill timeline (mock data, not linked from the site).
const SkillsLabPage = lazy(() =>
  import("../features/lab/SkillsLabPage").then((module) => ({
    default: module.SkillsLabPage,
  })),
);
const SkillsTitlesPage = lazy(() =>
  import("../features/lab/SkillsTitlesPage").then((module) => ({
    default: module.SkillsTitlesPage,
  })),
);
const ShowcaseResumePage = lazy(() =>
  import("../features/showcase/pages/ShowcaseResumePage").then((module) => ({
    default: module.ShowcaseResumePage,
  })),
);

const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        // The redesigned portfolio: its index is the homepage, projects live
        // under /portfolio. One layout route, so the background scenes keep
        // running between the two.
        element: <LazyRoute><ShowcaseLayout /></LazyRoute>,
        children: [
          { index: true, element: <LazyRoute><ShowcaseIndexPage /></LazyRoute> },
          { path: "resume", element: <LazyRoute><ShowcaseResumePage /></LazyRoute> },
          // Rendered by CinematicHost in RootLayout, which can keep it alive.
          // It sits in this layout so the portfolio's scenes can wait, paused,
          // underneath it.
          { path: "cinematic", element: null },
          {
            path: "portfolio",
            children: [
              { index: true, element: <Navigate to="/" replace /> },
              {
                path: ":portfolioId",
                element: <LazyRoute><ShowcaseProjectPage /></LazyRoute>,
              },
              { path: "*", element: <Navigate to="/" replace /> },
            ],
          },
        ],
      },
      // Sketches for the skill timeline: mock data, not linked from the site.
      { path: "lab/skills", element: <LazyRoute><SkillsLabPage /></LazyRoute> },
      { path: "lab/titles", element: <LazyRoute><SkillsTitlesPage /></LazyRoute> },
      {
        // Previous portfolio, kept for comparison until the redesign is approved.
        path: "portfolio-classic",
        element: <LazyRoute><FastLayout /></LazyRoute>,
        children: [
          { index: true, element: <LazyRoute><PortfolioPage /></LazyRoute> },
          {
            path: ":portfolioId",
            element: <LazyRoute><PortfolioDetailPage /></LazyRoute>,
          },
          { path: "*", element: <Navigate to="/portfolio-classic" replace /> },
        ],
      },
      {
        path: "fast",
        children: [
          { index: true, element: <Navigate to="/" replace /> },
          { path: "portfolio", element: <Navigate to="/" replace /> },
          {
            path: "portfolio/:portfolioId",
            element: <Navigate to="/" replace />,
          },
          { path: "resume", element: <Navigate to="/" replace /> },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
];

const router = createBrowserRouter(routes);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

function LazyRoute({
  children,
  message = "Loading...",
}: {
  children: ReactNode;
  message?: string;
}) {
  return <Suspense fallback={<div className="route-loading">{message}</div>}>{children}</Suspense>;
}
