import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface GalleryShot {
  key: string;
  src: string;
  title: string;
}

/**
 * A project's screenshots as framed tiles: cropped to one shape, toned down
 * into the page's mood until hovered, revealed as they scroll in (a CSS take
 * on the Career Gallery's hologram reveal), each with a button to view it
 * full size.
 */
export function ProjectGallery({
  shots,
  projectTitle,
  tint,
}: {
  shots: GalleryShot[];
  projectTitle: string;
  /** The project's core colour, washed over the screenshots. */
  tint?: string;
}) {
  const [viewing, setViewing] = useState<number | null>(null);

  return (
    <>
      <ol className="showcase-gallery" style={tint ? ({ "--shot-tint": tint } as React.CSSProperties) : undefined}>
        {shots.map((shot, index) => (
          <ShotTile
            key={shot.key}
            shot={shot}
            index={index}
            total={shots.length}
            eager={index === 0}
            onMaximize={() => setViewing(index)}
          />
        ))}
      </ol>
      {viewing !== null ? (
        <ShotViewer
          shots={shots}
          index={viewing}
          projectTitle={projectTitle}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  );
}

const pad = (value: number) => String(value).padStart(2, "0");

/** A stable pseudo-random number in [0, 1) per screenshot, so each gets its own reveal. */
const seeded = (key: string, salt: number) => {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
};

const REVEALS = ["wipe", "blinds", "tear"] as const;

const revealFor = (key: string, index: number) => {
  // Never the same reveal twice in a row.
  const offset = Math.floor(seeded(key, 1) * 2) + 1;
  const kind = REVEALS[(index * 2 + offset) % REVEALS.length];
  return {
    className: `showcase-shot--${kind} showcase-shot--from-${seeded(key, 2) < 0.5 ? "left" : "right"}`,
    duration: Math.round(650 + seeded(key, 3) * 700),
    delay: Math.round(seeded(key, 4) * 260),
  };
};

function ShotTile({
  shot,
  index,
  total,
  eager,
  onMaximize,
}: {
  shot: GalleryShot;
  index: number;
  total: number;
  eager: boolean;
  onMaximize: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          // Already in the browser cache: load may have fired before React listened.
          if (imageRef.current?.complete) setLoaded(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const reveal = revealFor(shot.key, index);

  return (
    <li
      ref={ref}
      className={`showcase-shot ${reveal.className}${revealed && loaded ? " is-revealed" : ""}`}
      style={{ "--shot-delay": `${reveal.delay}ms`, "--shot-duration": `${reveal.duration}ms` } as React.CSSProperties}
    >
      <div className="showcase-shot__frame">
        <img
          ref={imageRef}
          src={shot.src}
          alt={shot.title}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
        <span className="showcase-shot__veil" aria-hidden="true" />
        <span className="showcase-shot__front" aria-hidden="true" />
        <button type="button" className="showcase-shot__maximize" onClick={onMaximize} aria-label={`View ${shot.title} full size`}>
          <span aria-hidden="true" />
        </button>
      </div>
      <p className="showcase-shot__caption">
        <span className="showcase-shot__index">
          {pad(index + 1)} / {pad(total)}
        </span>
        <span>{shot.title}</span>
      </p>
    </li>
  );
}

function ShotViewer({
  shots,
  index,
  projectTitle,
  onIndex,
  onClose,
}: {
  shots: GalleryShot[];
  index: number;
  projectTitle: string;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const currentThumbRef = useRef<HTMLButtonElement>(null);
  const shot = shots[index];

  // Keep the current thumbnail in view in the strip.
  useEffect(() => {
    currentThumbRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [index]);
  const step = useCallback(
    (delta: number) => onIndex((index + delta + shots.length) % shots.length),
    [index, onIndex, shots.length],
  );

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  return createPortal(
    <div className="showcase-viewer" role="dialog" aria-modal="true" aria-label={`${projectTitle} screenshots`}>
      <button type="button" className="showcase-viewer__backdrop" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="showcase-viewer__bar">
        <p className="showcase-shot__caption">
          <span className="showcase-shot__index">
            {pad(index + 1)} / {pad(shots.length)}
          </span>
          <span>{shot.title}</span>
        </p>
        <button ref={closeRef} type="button" className="showcase-back" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="showcase-viewer__stage">
        {/* The whole screenshot, scaled to fit the screen. */}
        <img key={shot.key} src={shot.src} alt={shot.title} />
        {shots.length > 1 ? (
          <>
            <button
              type="button"
              className="showcase-viewer__step showcase-viewer__step--prev"
              onClick={() => step(-1)}
              aria-label="Previous screenshot"
            >
              <span aria-hidden="true" />
            </button>
            <button
              type="button"
              className="showcase-viewer__step showcase-viewer__step--next"
              onClick={() => step(1)}
              aria-label="Next screenshot"
            >
              <span aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      {shots.length > 1 ? (
        <ol className="showcase-viewer__thumbs" aria-label="All screenshots">
          {shots.map((item, thumbIndex) => (
            <li key={item.key}>
              <button
                type="button"
                ref={thumbIndex === index ? currentThumbRef : undefined}
                className={`showcase-viewer__thumb${thumbIndex === index ? " is-current" : ""}`}
                onClick={() => onIndex(thumbIndex)}
                aria-label={`Screenshot ${thumbIndex + 1}: ${item.title}`}
                aria-current={thumbIndex === index ? "true" : undefined}
              >
                <img src={item.src} alt="" loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>,
    // Inside the portfolio shell, so the viewer inherits the site's type and colour tokens.
    document.querySelector(".showcase") ?? document.body,
  );
}
