import { useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useReleaseQuery } from "../../../lib/query/contentQueries";
import { useBackdropTint } from "../lib/backdropTint";

/**
 * The technical skills summary, the way it reads on the printed resume:
 * one line per heading, the skills under it in the tree's order. A heading
 * is one of the few ticked Featured (Admin -> Technologies); a skill appears
 * when ticked for the Resume surface and sits anywhere under that heading.
 * Until any heading is featured, every heading with such skills is shown, so
 * the section reads with content while it is being curated.
 */
type TechnologyRow = { slug: string; name: string; parentSlug: string; sortOrder: number; isGrouping: boolean; featured: boolean; surfaces: string[] };

const technicalSkills = (technologies: TechnologyRow[]) => {
  const ordered = [...technologies].sort((a, b) => a.sortOrder - b.sortOrder);
  const bySlug = new Map(ordered.map((record) => [record.slug, record]));
  const rootOf = (record: TechnologyRow) => {
    let current = record;
    const seen = new Set<string>();
    while (current.parentSlug && !seen.has(current.slug)) {
      seen.add(current.slug);
      const parent = bySlug.get(current.parentSlug);
      if (!parent) break;
      current = parent;
    }
    return current;
  };
  const roots = ordered.filter((record) => !record.parentSlug && record.isGrouping);
  const featured = roots.filter((record) => record.featured);
  const shownRoots = featured.length > 0 ? featured : roots;
  return shownRoots
    .map((root) => ({
      slug: root.slug,
      name: root.name,
      skills: ordered
        .filter((record) => !record.isGrouping && record.surfaces.includes("resume") && rootOf(record).slug === root.slug)
        .map((record) => record.name),
    }))
    .filter((row) => row.skills.length > 0);
};

const dateRange = (start?: string, end?: string) =>
  start && end ? `${start} – ${end}` : (start ?? end ?? "");

/**
 * What follows a role's title: its dates, then where. A role with no dates of
 * its own takes the job's; no end date anywhere means it is still held.
 */
const positionDetails = (
  position: { startDate?: string; endDate?: string },
  job: { startDate?: string; endDate?: string; location?: string },
) => {
  const start = position.startDate ?? job.startDate;
  const end = position.endDate ?? (position.startDate ? undefined : job.endDate) ?? job.endDate ?? "Present";
  return [dateRange(start, start ? end : undefined), job.location].filter(Boolean);
};

/** The resume, kept simple: who, summary and contact on the left, the record on the right. */
export function ShowcaseResumePage() {
  const { data, isPending, isError } = useReleaseQuery();
  const { setTint } = useBackdropTint();
  const navigate = useNavigate();

  useEffect(() => {
    setTint(null);
    window.scrollTo({ top: 0 });
  }, [setTint]);

  // Escape leaves the resume, like a project page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      navigate("/");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  if (isPending || isError) {
    return (
      <div className="showcase-resume">
        <p className="showcase-label">{isPending ? "Loading resume…" : "The resume could not be loaded. Refresh to try again."}</p>
      </div>
    );
  }

  const personal = data.profile;
  const { summary } = data.profile;
  const { experiences: experience, certifications } = data.collections;
  const [education] = data.collections.education;
  const skills = useMemo(() => technicalSkills(data.collections.technologies ?? []), [data.collections.technologies]);

  return (
    <article className="showcase-resume">
      <header className="showcase-resume__intro">
        <Link to="/" className="showcase-back showcase-resume__back">
          <span className="showcase-back__arrow" aria-hidden="true" />
          Back
        </Link>
        <p className="showcase-label">Résumé</p>
        <h1 className="showcase-resume__name">{personal.name}</h1>
        <p className="showcase-resume__role">{personal.title}</p>
        {summary ? <p className="showcase-resume__summary">{summary}</p> : null}

        <dl className="showcase-spec">
          <div>
            <dt>Contact</dt>
            <dd>
              <a className="showcase-resume__link" href={`mailto:${personal.email}`}>
                {personal.email}
              </a>
            </dd>
          </div>
          {personal.location ? (
            <div>
              <dt>Based in</dt>
              <dd>{personal.location}</dd>
            </div>
          ) : null}
        </dl>

        <nav className="showcase-resume__jump" aria-label="Resume sections">
          {skills.length ? <a href="#resume-skills">Skills</a> : null}
          <a href="#resume-experience">Experience</a>
          {education ? <a href="#resume-education">Education</a> : null}
          {certifications?.length ? <a href="#resume-certifications">Certifications</a> : null}
        </nav>
      </header>

      <div className="showcase-resume__record">
        {skills.length ? (
          <section aria-labelledby="resume-skills">
            <h2 id="resume-skills" className="showcase-label showcase-resume__heading">
              Technical skills
            </h2>
            <ul className="showcase-resume__skills">
              {skills.map((row) => (
                <li key={row.slug}>
                  <span className="showcase-resume__skills-heading">{row.name}</span>
                  <span className="showcase-resume__skills-list">{row.skills.join(", ")}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section aria-labelledby="resume-experience">
          <h2 id="resume-experience" className="showcase-label showcase-resume__heading">
            Experience
          </h2>
          <ol className="showcase-resume__jobs">
            {experience.map((job) => (
              <li key={job.slug} className="showcase-resume__job">
                <header className="showcase-resume__job-head">
                  <h3 className="showcase-resume__company">{job.navLabel || job.company}</h3>
                </header>
                {job.positions.map((position, index) => (
                  <div key={`${job.slug}-${index}`} className="showcase-resume__position">
                    <h4 className="showcase-resume__position-title">
                      {position.title}
                      {positionDetails(position, job).map((detail) => (
                        <span key={detail} className="showcase-resume__position-dates">
                          {detail}
                        </span>
                      ))}
                    </h4>
                    {position.responsibilities.length ? (
                      <ul className="showcase-resume__bullets">
                        {position.responsibilities.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </section>

        {education ? (
          <section aria-labelledby="resume-education" className="showcase-resume__block">
            <h2 id="resume-education" className="showcase-label showcase-resume__heading">
              Education
            </h2>
            <h3 className="showcase-resume__company">{education.institution}</h3>
            <p className="showcase-resume__detail">{[education.degree, education.major].filter(Boolean).join(", ")}</p>
            {education.graduationDate ? <p className="showcase-label">{education.graduationDate}</p> : null}
          </section>
        ) : null}

        {certifications?.length ? (
          <section aria-labelledby="resume-certifications" className="showcase-resume__block">
            <h2 id="resume-certifications" className="showcase-label showcase-resume__heading">
              Certifications
            </h2>
            <ul className="showcase-resume__certs">
              {certifications.map((cert) => (
                <li key={`${cert.name}-${cert.date}`}>
                  <span>{cert.name}</span>
                  {cert.date ? <span className="showcase-label">{cert.date}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}
