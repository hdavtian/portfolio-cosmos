import { useEffect } from "react";
import { useReleaseQuery } from "../../../lib/query/contentQueries";
import { useBackdropTint } from "../lib/backdropTint";

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

  useEffect(() => {
    setTint(null);
    window.scrollTo({ top: 0 });
  }, [setTint]);

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

  return (
    <article className="showcase-resume">
      <header className="showcase-resume__intro">
        <p className="showcase-label">Resume</p>
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
          <a href="#resume-experience">Experience</a>
          {education ? <a href="#resume-education">Education</a> : null}
          {certifications?.length ? <a href="#resume-certifications">Certifications</a> : null}
        </nav>
      </header>

      <div className="showcase-resume__record">
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
