import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBackdropTint } from "../lib/backdropTint";
import { useShowcaseProjects, type ShowcaseProject } from "../lib/useShowcaseProjects";

/**
 * The work index: one list of project names in very large type, narrowed by
 * core and technology chips (kept in the URL so a filtered view can be shared).
 */
export function ShowcaseIndexPage() {
  const { projects, cores, topTech, yearRange, personal, isLoading } = useShowcaseProjects();
  const { setTint } = useBackdropTint();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeId, setActiveId] = useState<string | null>(null);

  const coreFilter = searchParams.get("core");
  const techFilter = searchParams.get("tech");

  const visible = useMemo(
    () =>
      projects.filter(
        (project) =>
          (!coreFilter || project.category === coreFilter) &&
          (!techFilter || project.technologies.includes(techFilter)),
      ),
    [projects, coreFilter, techFilter],
  );

  const active = visible.find((project) => project.id === activeId) ?? null;
  const filterCore = cores.find((core) => core.name === coreFilter);

  useEffect(() => {
    setTint(active?.coreColor ?? filterCore?.color ?? null);
  }, [active, filterCore, setTint]);

  const toggleFilter = (key: "core" | "tech", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const activate = (project: ShowcaseProject | null) => setActiveId(project?.id ?? null);

  return (
    <div className={`showcase-index${active ? " showcase-index--has-active" : ""}`}>
      <section className="showcase-index__work" aria-label="Projects">
        <div className="showcase-filters" role="group" aria-label="Filter projects">
          <div className="showcase-filters__row">
            <span className="showcase-label">Core</span>
            {cores.map((core) => (
              <button
                key={core.name}
                type="button"
                className="showcase-chip"
                aria-pressed={coreFilter === core.name}
                style={{ "--chip-color": core.color } as React.CSSProperties}
                onClick={() => toggleFilter("core", core.name)}
              >
                {core.name}
                <span className="showcase-chip__count">{core.count}</span>
              </button>
            ))}
          </div>
          <div className="showcase-filters__row">
            <span className="showcase-label">Tech</span>
            {topTech.map((tech) => (
              <button
                key={tech}
                type="button"
                className="showcase-chip"
                aria-pressed={techFilter === tech}
                onClick={() => toggleFilter("tech", tech)}
              >
                {tech}
              </button>
            ))}
            {coreFilter || techFilter ? (
              <button
                type="button"
                className="showcase-chip showcase-chip--clear"
                onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
              >
                Clear
              </button>
            ) : null}
          </div>
          <p className="showcase-label showcase-filters__count" aria-live="polite">
            {visible.length} of {projects.length} projects
          </p>
        </div>

        {isLoading && projects.length === 0 ? <p className="showcase-label">Loading work…</p> : null}
        {!isLoading && visible.length === 0 ? (
          <p className="showcase-empty">Nothing matches those filters.</p>
        ) : null}

        <ul className="showcase-list" onMouseLeave={() => activate(null)}>
          {visible.map((project) => (
            <li
              key={project.id}
              className={`showcase-list__item${project.id === activeId ? " is-active" : ""}`}
            >
              <Link
                to={`/portfolio/${project.id}`}
                className="showcase-list__link"
                onMouseEnter={() => activate(project)}
                onFocus={() => activate(project)}
                onBlur={() => activate(null)}
              >
                <span className="showcase-list__title">{project.title}</span>
                {project.image ? (
                  <img
                    className="showcase-list__thumb"
                    src={project.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : null}
                <span className="showcase-list__meta">
                  {project.category}
                  {project.isClientVariation ? ` / ${project.subcategory}` : ""}
                  {project.year ? ` / ${project.year}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <aside className="showcase-index__aside" aria-label="About">
        <p className="showcase-label">
          Portfolio of
          <br />
          <strong>{personal?.name ?? "Harma Davtian"}</strong>
        </p>
        <p className="showcase-label">
          <strong>{personal?.title ?? "Full Stack Engineer"}</strong>
          {personal?.location ? (
            <>
              <br />
              {personal.location}
            </>
          ) : null}
        </p>
        <p className="showcase-label">
          {projects.length} projects
          {yearRange ? (
            <>
              <br />
              {yearRange.from}–{yearRange.to}
            </>
          ) : null}
        </p>
      </aside>
    </div>
  );
}
