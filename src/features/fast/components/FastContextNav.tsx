import { NavLink } from "react-router-dom";

export interface ContextNavItem {
  to: string;
  label: string;
  exact?: boolean;
}

interface FastContextNavProps {
  title: string;
  items: ContextNavItem[];
}

export function FastContextNav({ title, items }: FastContextNavProps) {
  return (
    <aside className="fast-context-nav" aria-label={`${title} navigation`}>
      <h2 className="fast-context-nav__title">{title}</h2>
      <div className="fast-context-nav__links">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `fast-context-nav__link${isActive ? " fast-context-nav__link--active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </aside>
  );
}
