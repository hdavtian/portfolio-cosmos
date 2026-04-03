import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initAnalytics } from "./lib/analytics.ts";
import "@fortawesome/fontawesome-free/css/all.min.css";

initAnalytics();
createRoot(document.getElementById("root")!).render(<App />);
