import { createRoot } from "react-dom/client";
import { initAnalytics } from "./lib/analytics.ts";
import { AppRouter } from "./app/router.tsx";
import { AppProviders } from "./app/providers/AppProviders.tsx";
import { applyInitialTheme } from "./theme/themeInit.ts";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./styles/tailwind.css";
import "./styles/tokens.base.css";
import "./styles/themes/theme-modern.css";
import "./styles/themes/theme-matrix.css";
import "./styles/themes/theme-star-wars.css";
import "./styles/themes/theme-eighties.css";
import "./styles/themes/theme-film-noir.css";
import "./styles/fast-experience.css";

initAnalytics();
applyInitialTheme();

createRoot(document.getElementById("root")!).render(
  <AppProviders>
    <AppRouter />
  </AppProviders>,
);
