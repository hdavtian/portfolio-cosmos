import { useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { isCinematicLoaded, setCinematicLaunch, subscribeCinematicLaunch } from "../../../app/cinematic/launchStore";

export type NavHintId = "home" | "tech" | "resume" | "cinematic" | "contact";

/**
 * The panel under the site nav: a hint for whichever pill the pointer is on.
 * Shown only while hovering. For Cinematic it is also the way in, with the
 * same hand-off as the pill itself.
 */
export function NavHint({ hovered, onEnterCinematic }: { hovered: NavHintId | null; onEnterCinematic: () => void }) {
  const cinematicLoaded = useSyncExternalStore(subscribeCinematicLaunch, isCinematicLoaded, isCinematicLoaded);
  if (!hovered) return null;

  const hints: Record<NavHintId, { eyebrow: string; title: string; note: string }> = {
    home: {
      eyebrow: "Home",
      title: "The work",
      note: "Every project, filtered by company or technology, over a fragment of the cinematic universe",
    },
    tech: {
      eyebrow: "Tech Progression",
      title: "Technology and skill, through the years",
      note: "A short film inspired by the Game of Thrones opening: each place built from the skills learned there",
    },
    resume: {
      eyebrow: "Résumé",
      title: "The record",
      note: "Roles, dates and responsibilities, on one page",
    },
    cinematic: {
      eyebrow: "Cinematic",
      title: cinematicLoaded ? "Back to the full experience" : "Enter the full experience",
      note: cinematicLoaded
        ? "Still loaded — returns where you left it"
        : "A 3D universe of the career: planets, moons, a ship. Sound, and a few seconds to load",
    },
    contact: {
      eyebrow: "Contact",
      title: "Say hello",
      note: "Opens your mail client with an email to Harma",
    },
  };
  const hint = hints[hovered];

  const body = (
    <>
      <span className="showcase-gateway__eyebrow">{hint.eyebrow}</span>
      <span className="showcase-gateway__link">
        {hint.title}
        {hovered === "cinematic" ? <span className="showcase-gateway__arrow" aria-hidden="true" /> : null}
      </span>
      <span className="showcase-gateway__note">{hint.note}</span>
    </>
  );

  if (hovered === "cinematic") {
    return (
      <Link
        to="/cinematic"
        className="showcase-gateway"
        onClick={(event) => {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          setCinematicLaunch("loading");
          onEnterCinematic();
        }}
      >
        {body}
      </Link>
    );
  }
  return <div className="showcase-gateway showcase-gateway--hint">{body}</div>;
}
