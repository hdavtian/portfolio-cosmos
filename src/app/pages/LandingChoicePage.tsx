import { Link } from "react-router-dom";
import { trackEvent } from "../../lib/analytics";

export function LandingChoicePage() {
  const currentYear = new Date().getFullYear();

  return (
    <section className="landing-shell" aria-label="Choose your experience">
      <header className="landing-shell__header landing-shell__section">
        <div className="landing-shell__header-content">
          <p className="landing-shell__brand">HarmaDavtian.com</p>
          <h1 className="landing-shell__welcome">
            Welcome, I am Harma Davtian, a full-stack engineer who loves turning ideas into
            software. Pick how you&apos;d like to explore my work below.
          </h1>
        </div>
      </header>

      <div className="landing-choice landing-shell__section">
        <article className="landing-choice__panel landing-choice__panel--cinematic">
          <div className="landing-choice__panel-content">
            <p className="landing-choice__eyebrow">Immersive Experience</p>
            <h2 className="landing-choice__title">Cinematic Universe</h2>
            <p className="landing-choice__copy">
              Navigate the interactive ThreeJS world and explore the original{" "}
              <span className="landing-choice__highlight">cinematic</span> storytelling
              experience.
            </p>
            <Link
              className="landing-choice__button"
              to="/cinematic"
              onClick={() =>
                trackEvent("landing_entry_click", {
                  entry_target: "cinematic",
                })
              }
            >
              Enter Cinematic
            </Link>
            <p className="landing-choice__note">
              Best viewed on desktop.
            </p>
          </div>
        </article>

        <article className="landing-choice__panel landing-choice__panel--fast">
          <div className="landing-choice__panel-content">
            <p className="landing-choice__eyebrow">Fast Access</p>
            <h2 className="landing-choice__title">Mainstream Portfolio</h2>
            <p className="landing-choice__copy">
              Browse portfolio and resume content{" "}
              <span className="landing-choice__highlight">quickly</span> with filtering,
              sorting, favorites, and responsive navigation.
            </p>
            <Link
              className="landing-choice__button"
              to="/portfolio"
              onClick={() =>
                trackEvent("landing_entry_click", {
                  entry_target: "mainstream",
                })
              }
            >
              Enter Mainstream Portfolio
            </Link>
            <p className="landing-choice__note">Mobile friendly.</p>
          </div>
        </article>
      </div>

      <footer className="landing-shell__footer landing-shell__section">
        <p>harmadavtian.com | {currentYear}</p>
      </footer>
    </section>
  );
}
