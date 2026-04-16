import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from "react-router-dom";
import { RootLayout } from "./layouts/RootLayout";

const CinematicExperience = lazy(() => import("../App"));
const FastLayout = lazy(() =>
  import("./layouts/FastLayout").then((module) => ({
    default: module.FastLayout,
  })),
);
const LandingChoicePage = lazy(() =>
  import("./pages/LandingChoicePage").then((module) => ({
    default: module.LandingChoicePage,
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
const ResumePage = lazy(() =>
  import("../features/fast/pages/ResumePage").then((module) => ({
    default: module.ResumePage,
  })),
);

const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <LazyRoute><LandingChoicePage /></LazyRoute> },
      {
        path: "cinematic",
        element: (
          <LazyRoute message="Loading cinematic experience...">
            <CinematicExperience />
          </LazyRoute>
        ),
      },
      {
        path: "fast",
        element: <LazyRoute><FastLayout /></LazyRoute>,
        children: [
          { index: true, element: <Navigate to="/fast/portfolio" replace /> },
          { path: "portfolio", element: <LazyRoute><PortfolioPage /></LazyRoute> },
          {
            path: "portfolio/:portfolioId",
            element: <LazyRoute><PortfolioDetailPage /></LazyRoute>,
          },
          { path: "resume", element: <LazyRoute><ResumePage /></LazyRoute> },
          { path: "*", element: <Navigate to="/fast" replace /> },
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
