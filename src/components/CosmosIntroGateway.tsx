import { useCallback, useMemo, useState } from "react";
import { trackEvent } from "../lib/analytics";
import "./CosmosIntroGateway.scss";

interface CosmosIntroGatewayProps {
  onEnter: () => void;
}

const STAR_COUNT = 80;

function generateStars(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: 1 + Math.random() * 2,
    twinkleDur: `${2 + Math.random() * 4}s`,
    twinkleDelay: `${Math.random() * 5}s`,
  }));
}

export default function CosmosIntroGateway({ onEnter }: CosmosIntroGatewayProps) {
  const [exiting, setExiting] = useState(false);
  const stars = useMemo(() => generateStars(STAR_COUNT), []);

  const handleEnter = useCallback(() => {
    if (exiting) return;
    trackEvent("enter_the_universe_click");
    setExiting(true);
    setTimeout(onEnter, 750);
  }, [exiting, onEnter]);

  return (
    <div className={`cosmos-intro${exiting ? " cosmos-intro--exiting" : ""}`}>
      <div className="cosmos-intro__stars" aria-hidden="true">
        {stars.map((s) => (
          <span
            key={s.id}
            className="cosmos-intro__star"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              ["--twinkle-dur" as string]: s.twinkleDur,
              ["--twinkle-delay" as string]: s.twinkleDelay,
            }}
          />
        ))}
      </div>

      <div className="cosmos-intro__content">
        <h1 className="cosmos-intro__name">Harma Davtian</h1>
        <div className="cosmos-intro__divider" />
        <p className="cosmos-intro__intro-text">
          Welcome to an interactive 3D exploration of my professional universe
          — built with React, Three.js, and a passion for immersive interfaces.
        </p>
        <ul className="cosmos-intro__features">
          <li className="cosmos-intro__feature">
            Navigate a full solar system of career milestones
          </li>
          <li className="cosmos-intro__feature">
            Explore projects, skills, and expertise in orbit
          </li>
          <li className="cosmos-intro__feature">
            Cinematic experience best viewed on desktop
          </li>
        </ul>
        <button
          type="button"
          className="cosmos-intro__enter-btn"
          onClick={handleEnter}
        >
          Enter the Universe
        </button>
      </div>
    </div>
  );
}
