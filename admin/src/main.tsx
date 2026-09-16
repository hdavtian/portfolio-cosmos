import { createRoot } from "react-dom/client";
import "./syncfusion-license";
import { AdminApp } from "./app/AdminApp";

// Syncfusion component styles. Each package ships its own theme file.
import "@syncfusion/ej2-base/styles/material.css";
import "@syncfusion/ej2-buttons/styles/material.css";
import "@syncfusion/ej2-inputs/styles/material.css";
import "@syncfusion/ej2-popups/styles/material.css";
import "@syncfusion/ej2-navigations/styles/material.css";
import "@syncfusion/ej2-dropdowns/styles/material.css";
import "@syncfusion/ej2-calendars/styles/material.css";
import "@syncfusion/ej2-grids/styles/material.css";
import "@syncfusion/ej2-notifications/styles/material.css";
import "./styles.css";

// No StrictMode here, deliberately: its development-only mount → unmount →
// remount leaves Syncfusion grids holding settings objects from the destroyed
// first instance, so grids rendered "No records" or blank template cells
// despite holding their data. Production never double-mounts, but the admin
// must be reviewable locally, so StrictMode stays off for this app.
createRoot(document.getElementById("root")!).render(<AdminApp />);
