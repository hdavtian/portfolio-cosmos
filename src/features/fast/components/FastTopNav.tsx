import { NavLink } from "react-router-dom";
import { useTheme } from "../../../theme/ThemeProvider";

export function FastTopNav() {
  const { themeId, setThemeId, themes } = useTheme();

  return (
    <header className="fast-top-nav">
      <div className="fast-top-nav__inner">
        <NavLink to="/fast" className="fast-top-nav__brand">
          Fast Experience
        </NavLink>

        <nav className="fast-top-nav__links" aria-label="Primary">
          <NavLink to="/fast" end className={({ isActive }) => navClass(isActive)}>
            Overview
          </NavLink>
          <NavLink to="/fast/portfolio" className={({ isActive }) => navClass(isActive)}>
            Portfolio
          </NavLink>
        </nav>

        <div className="fast-top-nav__tools">
          <label htmlFor="theme-picker" className="fast-top-nav__theme-label">
            Theme
          </label>
          <select
            id="theme-picker"
            className="fast-top-nav__theme-select"
            value={themeId}
            onChange={(event) => setThemeId(event.target.value)}
          >
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
          <NavLink to="/cinematic" className="fast-top-nav__cinematic-link">
            Cinematic
          </NavLink>
        </div>
      </div>
    </header>
  );
}

function navClass(isActive: boolean) {
  return `fast-top-nav__link${isActive ? " fast-top-nav__link--active" : ""}`;
}
