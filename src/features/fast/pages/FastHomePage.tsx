import { Link } from "react-router-dom";

export function FastHomePage() {
  return (
    <section className="fast-home">
      <header className="fast-home__hero">
        <p className="fast-home__eyebrow">Fast Experience</p>
        <h1 className="fast-home__title">Work, portfolio, and resume content at speed</h1>
        <p className="fast-home__lead">
          This mode prioritizes quick scanning and direct navigation while preserving the
          cinematic route as a separate experience.
        </p>
        <div className="fast-home__actions">
          <Link to="/portfolio" className="fast-home__cta">
            Explore Portfolio
          </Link>
          <Link to="/resume" className="fast-home__cta fast-home__cta--secondary">
            Open Resume
          </Link>
        </div>
      </header>
    </section>
  );
}
