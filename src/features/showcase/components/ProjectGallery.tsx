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
export function ProjectGallery({ shots, projectTitle }: { shots: GalleryShot[]; projectTitle: string }) {
  const [viewing, setViewing] = useState<number | null>(null);

  return (
    <>
      <ol className="showcase-gallery">
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

  return (
    <li
      ref={ref}
      className={`showcase-shot${revealed && loaded ? " is-revealed" : ""}`}
      style={{ "--shot-delay": `${Math.min(index, 3) * 90}ms` } as React.CSSProperties}
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
  const shot = shots[index];
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
        <div className="showcase-viewer__controls">
          {shots.length > 1 ? (
            <>
              <button type="button" className="showcase-back" onClick={() => step(-1)} aria-label="Previous screenshot">
                <span className="showcase-back__arrow" aria-hidden="true" />
                Prev
              </button>
              <button type="button" className="showcase-back showcase-back--next" onClick={() => step(1)} aria-label="Next screenshot">
                Next
                <span className="showcase-back__arrow" aria-hidden="true" />
              </button>
            </>
          ) : null}
          <button ref={closeRef} type="button" className="showcase-back" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div className="showcase-viewer__stage" key={shot.key}>
        <img src={shot.src} alt={shot.title} />
      </div>
    </div>,
    document.body,
  );
}
