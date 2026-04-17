import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../../../theme/ThemeProvider";
import { trackEvent } from "../../../lib/analytics";

export function FastTopNav() {
  const { themeId, setThemeId, themes } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="fast-top-nav">
      <div className="fast-top-nav__inner">
        <NavLink to="/portfolio" className="fast-top-nav__brand">
          HarmaDavtian.com
        </NavLink>

        <button
          type="button"
          className="fast-top-nav__menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="fast-primary-nav"
          onClick={() => setMenuOpen((current) => !current)}
        >
          Menu
        </button>

        <nav
          id="fast-primary-nav"
          className={`fast-top-nav__links ${menuOpen ? "is-open" : ""}`}
          aria-label="Primary navigation"
        >
          <NavLink to="/portfolio" className={({ isActive }) => navClass(isActive)}>
            Portfolio
          </NavLink>
        </nav>

        <div className={`fast-top-nav__tools ${menuOpen ? "is-open" : ""}`}>
          <label htmlFor="theme-picker" className="fast-top-nav__theme-label">
            Theme
          </label>
          <select
            id="theme-picker"
            className="fast-top-nav__theme-select"
            value={themeId}
            onChange={(event) => {
              const nextThemeId = event.target.value;
              trackEvent("mainstream_theme_switch", {
                previous_theme_id: themeId,
                next_theme_id: nextThemeId,
              });
              setThemeId(nextThemeId);
            }}
          >
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}

function navClass(isActive: boolean) {
  return `fast-top-nav__link${isActive ? " fast-top-nav__link--active" : ""}`;
}
