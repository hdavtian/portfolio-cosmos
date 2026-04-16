import { lazy, Suspense } from "react";
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from "react-router-dom";
import { RootLayout } from "./layouts/RootLayout";
import { FastLayout } from "./layouts/FastLayout";
import { LandingChoicePage } from "./pages/LandingChoicePage";
import { FastHomePage } from "../features/fast/pages/FastHomePage";
import { PortfolioPage } from "../features/fast/pages/PortfolioPage";
import { PortfolioDetailPage } from "../features/fast/pages/PortfolioDetailPage";
import { ResumePage } from "../features/fast/pages/ResumePage";

const CinematicExperience = lazy(() => import("../App"));

const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <LandingChoicePage /> },
      {
        path: "cinematic",
        element: (
          <Suspense fallback={<div className="route-loading">Loading cinematic experience...</div>}>
            <CinematicExperience />
          </Suspense>
        ),
      },
      {
        path: "fast",
        element: <FastLayout />,
        children: [
          { index: true, element: <FastHomePage /> },
          { path: "portfolio", element: <PortfolioPage /> },
          { path: "portfolio/:portfolioId", element: <PortfolioDetailPage /> },
          { path: "resume", element: <ResumePage /> },
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
