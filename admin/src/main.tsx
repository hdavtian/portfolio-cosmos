import { StrictMode } from "react";
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
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
