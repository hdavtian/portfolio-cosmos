import { Link } from "react-router-dom";
import type { SceneLoadState } from "./GalleryBackdrop";

interface SceneLoaderProps {
  state: SceneLoadState;
}

const prefetchCinematic = () => {
  void import("../../../App");
};

/**
 * A racy, jittery loading bar while the cinematic fragment loads, then a small
 * hologram label inviting visitors into the full Three.js experience.
 */
export function SceneLoader({ state }: SceneLoaderProps) {
  if (state.phase === "idle" || state.phase === "failed") return null;

  if (state.phase === "loading") {
    const percent = Math.round(state.progress * 100);
    return (
      <div className="showcase-scene-loader" role="status" aria-live="polite">
        <div className="showcase-scene-loader__label">
          <span>Loading career gallery</span>
          <span className="showcase-scene-loader__percent">{String(percent).padStart(2, "0")}%</span>
        </div>
        <div
          className="showcase-scene-loader__track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span className="showcase-scene-loader__fill" style={{ transform: `scaleX(${Math.max(0.04, state.progress)})` }} />
          <span className="showcase-scene-loader__ghost" />
        </div>
      </div>
    );
  }

  return (
    <aside className="showcase-gateway" aria-label="Cinematic experience">
      <p className="showcase-gateway__eyebrow">A fragment of the cinematic universe</p>
      <Link
        to="/cinematic"
        className="showcase-gateway__link"
        onMouseEnter={prefetchCinematic}
        onFocus={prefetchCinematic}
      >
        Enter the full experience
        <span className="showcase-gateway__arrow" aria-hidden="true" />
      </Link>
      <p className="showcase-gateway__note">3D, sound and a few seconds to load</p>
    </aside>
  );
}
