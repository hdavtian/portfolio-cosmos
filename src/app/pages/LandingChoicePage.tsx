import { Link } from "react-router-dom";

export function LandingChoicePage() {
  return (
    <section className="landing-choice grid min-h-screen grid-cols-1 md:grid-cols-2">
      <article className="landing-choice__panel landing-choice__panel--cinematic">
        <div className="landing-choice__panel-content">
          <p className="landing-choice__eyebrow">Immersive Experience</p>
          <h1 className="landing-choice__title">Cinematic Universe</h1>
          <p className="landing-choice__copy">
            Navigate the interactive ThreeJS world and explore the original cinematic
            storytelling experience.
          </p>
          <Link className="landing-choice__button" to="/cinematic">
            Enter Cinematic
          </Link>
        </div>
      </article>

      <article className="landing-choice__panel landing-choice__panel--fast">
        <div className="landing-choice__panel-content">
          <p className="landing-choice__eyebrow">Fast Access</p>
          <h2 className="landing-choice__title">Mainstream Portfolio</h2>
          <p className="landing-choice__copy">
            Browse portfolio and resume content quickly with filtering, sorting, favorites,
            and responsive navigation.
          </p>
          <Link className="landing-choice__button" to="/fast">
            Enter Mainstream Portfolio
          </Link>
        </div>
      </article>
    </section>
  );
}
