import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initGA } from "./lib/analytics.ts";
import "@fortawesome/fontawesome-free/css/all.min.css";

initGA();
createRoot(document.getElementById("root")!).render(<App />);
