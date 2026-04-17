import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

interface PortfolioMediaViewerProps {
  image: string;
  alt: string;
  title?: string;
  description?: string;
  onZoomButtonClick?: (direction: "in" | "out", zoomPercent: number) => void;
}

const ZOOM_MIN = 50;
const ZOOM_MAX = 500;
const ZOOM_STEP = 25;

export function PortfolioMediaViewer({
  image,
  alt,
  title,
  description,
  onZoomButtonClick,
}: PortfolioMediaViewerProps) {
  const [zoomPercent, setZoomPercent] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const panStartRef = useRef({ x: 0, y: 0, pan: { x: 0, y: 0 } });
  const isPanningRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const clampZoom = useCallback(
    (value: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value)),
    [],
  );

  const applyZoom = useCallback(
    (next: number) => {
      const clamped = clampZoom(next);
      setZoomPercent(clamped);
      if (clamped <= 100) {
        setPan({ x: 0, y: 0 });
      }
    },
    [clampZoom],
  );

  const reset = useCallback(() => {
    setZoomPercent(100);
    setPan({ x: 0, y: 0 });
  }, []);

  // React attaches wheel handlers as passive, which blocks preventDefault().
  // Bind a non-passive listener so shift+wheel can suppress page scroll.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      if (!event.shiftKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoomPercent((current) => {
        const next = clampZoom(current + delta);
        if (next <= 100) {
          setPan({ x: 0, y: 0 });
        }
        return next;
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [clampZoom]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (zoomPercent <= 100) return;
      if (event.button !== 0) return;
      event.preventDefault();

      const target = event.currentTarget;
      activePointerIdRef.current = event.pointerId;
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        /* noop */
      }

      isPanningRef.current = true;
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pan: { ...pan },
      };
    },
    [pan, zoomPercent],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!isPanningRef.current) return;
      if (activePointerIdRef.current !== event.pointerId) return;
      const start = panStartRef.current;
      setPan({
        x: start.pan.x + (event.clientX - start.x),
        y: start.pan.y + (event.clientY - start.y),
      });
    },
    [],
  );

  const endPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null) {
      try {
        event.currentTarget.releasePointerCapture(activePointerIdRef.current);
      } catch {
        /* noop */
      }
    }
    activePointerIdRef.current = null;
    isPanningRef.current = false;
  }, []);

  useEffect(() => {
    // Reset on image change
    setZoomPercent(100);
    setPan({ x: 0, y: 0 });
  }, [image]);

  const zoomedIn = zoomPercent > 100;
  const hasMeta = Boolean(title) || Boolean(description);

  return (
    <figure className="portfolio-media">
      <div className="portfolio-media__header">
        {hasMeta ? (
          <figcaption className="portfolio-media__caption">
            {title ? <h2 className="portfolio-media__title">{title}</h2> : null}
            {description ? (
              <p className="portfolio-media__description">{description}</p>
            ) : null}
          </figcaption>
        ) : (
          <span className="portfolio-media__title portfolio-media__title--fallback">
            {title || alt}
          </span>
        )}
      </div>

      <div className="portfolio-media__frame">
        <div
          ref={viewportRef}
          className={`portfolio-media__viewport ${
            zoomedIn ? "is-zoomed" : ""
          } ${isPanningRef.current ? "is-panning" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onDoubleClick={reset}
          role="img"
          aria-label={alt}
        >
          <img
            src={image}
            alt={alt}
            className="portfolio-media__image"
            draggable={false}
            loading="lazy"
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${
                zoomPercent / 100
              })`,
            }}
          />
        </div>

        <div className="portfolio-media__controls" role="group" aria-label="Image zoom controls">
          <button
            type="button"
            onClick={() => {
              const nextZoom = Math.max(ZOOM_MIN, zoomPercent - ZOOM_STEP);
              applyZoom(nextZoom);
              onZoomButtonClick?.("out", nextZoom);
            }}
            disabled={zoomPercent <= ZOOM_MIN}
            aria-label="Zoom out"
          >
            <i className="fas fa-minus" aria-hidden="true" />
          </button>
          <span className="portfolio-media__zoom-level" aria-live="polite">
            {zoomPercent}%
          </span>
          <button
            type="button"
            onClick={() => {
              const nextZoom = Math.min(ZOOM_MAX, zoomPercent + ZOOM_STEP);
              applyZoom(nextZoom);
              onZoomButtonClick?.("in", nextZoom);
            }}
            disabled={zoomPercent >= ZOOM_MAX}
            aria-label="Zoom in"
          >
            <i className="fas fa-plus" aria-hidden="true" />
          </button>
          <span className="portfolio-media__hint" aria-hidden="true">
            <kbd>Shift</kbd> + scroll to zoom · drag to pan · double-click to reset
          </span>
          <button
            type="button"
            onClick={reset}
            disabled={zoomPercent === 100 && pan.x === 0 && pan.y === 0}
            className="portfolio-media__reset"
            aria-label="Reset view"
          >
            Reset
          </button>
        </div>
      </div>
    </figure>
  );
}
