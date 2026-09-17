import { Outlet } from "react-router-dom";
import { CinematicHost } from "../cinematic/CinematicHost";

export function RootLayout() {
  return (
    <div className="app-shell">
      <Outlet />
      {/* Above the routes, so it can stay alive between visits. */}
      <CinematicHost />
    </div>
  );
}
