import React, { useState, useRef, useEffect, useCallback } from "react";
import gsap from "gsap";
import type { MoonPortfolioPayload, MoonPortfolioTab, MoonPortfolioSubcategory } from "./moonPortfolioSelector";

interface Props {
  portfolio: MoonPortfolioPayload | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const TABS_VISIBLE = 3;
const SUBCATS_VISIBLE = 4;
const THUMB_MIN_WIDTH_PX = 92;
const THUMB_GAP_PX = 4;
const ZOOM_MIN = 50;
const ZOOM_MAX = 500;
const ZOOM_STEP = 25;
const PAN_STEP = 28;

const MoonOrbitHtmlPortfolio: React.FC<Props> = ({
  portfolio,
  isExpanded,
  onToggleExpand,
}) => {
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [thumbPage, setThumbPage] = useState(0);
  const [tabPage, setTabPage] = useState(0);
  const [thumbsPerPage, setThumbsPerPage] = useState(2);
  const [activeSubcatIndex, setActiveSubcatIndex] = useState(0);
  const [subcatPage, setSubcatPage] = useState(0);
  const [imageDescCollapsed, setImageDescCollapsed] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [imgError, setImgError] = useState<Set<string>>(() => new Set());
  const imageViewportRef = useRef<HTMLDivElement>(null);
  const tabTrackRef = useRef<HTMLDivElement>(null);
  const thumbRowRef = useRef<HTMLDivElement>(null);
  const tabSlideDirectionRef = useRef<1 | -1>(1);
  const thumbSlideDirectionRef = useRef<1 | -1>(1);
  const subcatSlideDirectionRef = useRef<1 | -1>(1);
  const prevTabPageRef = useRef(0);
  const prevThumbPageRef = useRef(0);
  const prevSubcatPageRef = useRef(0);
  const subcatTrackRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const panDragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const activePointerIdRef = useRef<number | null>(null);
  const stopPanListenersRef = useRef<(() => void) | null>(null);

  const tabs = portfolio?.tabs ?? [];
  const activeTab: MoonPortfolioTab | undefined = tabs[activeTabIndex];
  const cards = activeTab?.cards ?? [];
  const activeCard = cards[activeCardIndex];
  const subcategories: MoonPortfolioSubcategory[] = activeCard?.subcategories ?? [];
  const hasSubcats = subcategories.length > 0;
  const activeSubcat: MoonPortfolioSubcategory | undefined = hasSubcats
    ? subcategories[activeSubcatIndex]
    : undefined;
  const mediaItems = activeSubcat?.mediaItems ?? activeCard?.mediaItems ?? [];
  const activeMedia = mediaItems[activeMediaIndex];
  const totalPages = Math.ceil(mediaItems.length / thumbsPerPage);

  const subcatTotalPages = Math.ceil(subcategories.length / SUBCATS_VISIBLE);
  const subcatStart = subcatPage * SUBCATS_VISIBLE;
  const visibleSubcats = subcategories.slice(subcatStart, subcatStart + SUBCATS_VISIBLE);

  const tabTotalPages = Math.ceil(tabs.length / TABS_VISIBLE);
  const tabStart = tabPage * TABS_VISIBLE;
  const visibleTabs = tabs.slice(tabStart, tabStart + TABS_VISIBLE);

  useEffect(() => {
    setActiveCardIndex(0);
    setActiveSubcatIndex(0);
    setSubcatPage(0);
    setActiveMediaIndex(0);
    setThumbPage(0);
    setImageDescCollapsed(false);
    setZoomPercent(100);
    setPanOffset({ x: 0, y: 0 });
  }, [activeTabIndex]);

  useEffect(() => {
    setActiveSubcatIndex(0);
    setSubcatPage(0);
    setActiveMediaIndex(0);
    setThumbPage(0);
    setImageDescCollapsed(false);
    setZoomPercent(100);
    setPanOffset({ x: 0, y: 0 });
  }, [activeCardIndex]);

  useEffect(() => {
    setActiveMediaIndex(0);
    setThumbPage(0);
    setZoomPercent(100);
    setPanOffset({ x: 0, y: 0 });
  }, [activeSubcatIndex]);

  useEffect(() => {
    setZoomPercent(100);
    setPanOffset({ x: 0, y: 0 });
  }, [activeMedia?.id]);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    return () => {
      if (stopPanListenersRef.current) {
        stopPanListenersRef.current();
        stopPanListenersRef.current = null;
      }
      isPanningRef.current = false;
      activePointerIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = thumbRowRef.current;
    if (!el) return;
    const updateThumbCapacity = () => {
      const width = el.clientWidth;
      if (!Number.isFinite(width) || width <= 0) return;
      const fit = Math.max(
        1,
        Math.floor((width + THUMB_GAP_PX) / (THUMB_MIN_WIDTH_PX + THUMB_GAP_PX)),
      );
      setThumbsPerPage((prev) => (prev === fit ? prev : fit));
    };
    updateThumbCapacity();
    const observer = new ResizeObserver(updateThumbCapacity);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (thumbPage >= totalPages) {
      setThumbPage(Math.max(0, totalPages - 1));
    }
  }, [thumbPage, totalPages]);

  useEffect(() => {
    if (tabPage === prevTabPageRef.current) return;
    prevTabPageRef.current = tabPage;
    const el = tabTrackRef.current;
    if (!el) return;
    const dir = tabSlideDirectionRef.current;
    gsap.fromTo(
      el,
      { x: 20 * dir, opacity: 0.3 },
      { x: 0, opacity: 1, duration: 0.25, ease: "power2.out" },
    );
  }, [tabPage]);

  useEffect(() => {
    if (subcatPage === prevSubcatPageRef.current) return;
    prevSubcatPageRef.current = subcatPage;
    const el = subcatTrackRef.current;
    if (!el) return;
    const dir = subcatSlideDirectionRef.current;
    gsap.fromTo(
      el,
      { x: 20 * dir, opacity: 0.3 },
      { x: 0, opacity: 1, duration: 0.25, ease: "power2.out" },
    );
  }, [subcatPage]);

  useEffect(() => {
    if (thumbPage === prevThumbPageRef.current) return;
    prevThumbPageRef.current = thumbPage;
    const el = thumbRowRef.current;
    if (!el) return;
    const dir = thumbSlideDirectionRef.current;
    gsap.fromTo(
      el,
      { x: 24 * dir, opacity: 0.3 },
      { x: 0, opacity: 1, duration: 0.28, ease: "power2.out" },
    );
  }, [thumbPage]);

  const handleThumbClick = useCallback((mediaIdx: number) => {
    setActiveMediaIndex(mediaIdx);
  }, []);

  const handleImgError = useCallback((url: string) => {
    setImgError((prev) => new Set(prev).add(url));
  }, []);

  const handleTabSelect = useCallback((globalIndex: number) => {
    setActiveTabIndex(globalIndex);
  }, []);

  const clampZoom = useCallback((value: number) => {
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  }, []);

  const applyZoom = useCallback(
    (nextZoom: number) => {
      setZoomPercent(clampZoom(nextZoom));
    },
    [clampZoom],
  );

  const nudgePan = useCallback((dx: number, dy: number) => {
    setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleImageWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.shiftKey) {
        setPanOffset((prev) => ({
          x: prev.x,
          y: prev.y - e.deltaY,
        }));
        return;
      }
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      applyZoom(zoomPercent + delta);
    },
    [applyZoom, zoomPercent],
  );

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (stopPanListenersRef.current) {
      stopPanListenersRef.current();
      stopPanListenersRef.current = null;
    }
    isPanningRef.current = true;
    activePointerIdRef.current = e.pointerId;
    panDragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panOffsetRef.current.x,
      panY: panOffsetRef.current.y,
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!isPanningRef.current) return;
      if (activePointerIdRef.current !== null && ev.pointerId !== activePointerIdRef.current) {
        return;
      }
      ev.preventDefault();
      const start = panDragStartRef.current;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      setPanOffset({ x: start.panX + dx, y: start.panY + dy });
    };

    const onPointerEnd = (ev: PointerEvent) => {
      if (activePointerIdRef.current !== null && ev.pointerId !== activePointerIdRef.current) {
        return;
      }
      isPanningRef.current = false;
      activePointerIdRef.current = null;
      if (stopPanListenersRef.current) {
        stopPanListenersRef.current();
        stopPanListenersRef.current = null;
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    stopPanListenersRef.current = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, []);

  const thumbStart = thumbPage * thumbsPerPage;
  const visibleThumbs = mediaItems.slice(thumbStart, thumbStart + thumbsPerPage);

  if (!portfolio || tabs.length === 0) {
    return (
      <div className="moon-portfolio moon-portfolio--empty">
        <div className="moon-portfolio__empty-msg">No portfolio data</div>
      </div>
    );
  }

  return (
    <div className="moon-portfolio">
      <div className="moon-portfolio__main">
        <div className="moon-portfolio__large-image">
          <button
            className="moon-portfolio__expand-btn"
            onClick={onToggleExpand}
            aria-label={isExpanded ? "Restore layout" : "Expand portfolio layout"}
            title={isExpanded ? "Restore layout" : "Expand portfolio layout"}
          >
            <i
              className={`fa-solid ${isExpanded ? "fa-minimize" : "fa-maximize"}`}
              aria-hidden="true"
            />
          </button>
          <div className="moon-portfolio__image-controls">
            <div className="moon-portfolio__zoom-row">
              <button className="moon-portfolio__ctrl-btn" onClick={() => applyZoom(zoomPercent - ZOOM_STEP)}>
                -
              </button>
              <input
                className="moon-portfolio__zoom-range"
                type="range"
                min={ZOOM_MIN}
                max={ZOOM_MAX}
                step={ZOOM_STEP}
                value={zoomPercent}
                onChange={(e) => applyZoom(Number(e.target.value))}
              />
              <button className="moon-portfolio__ctrl-btn" onClick={() => applyZoom(zoomPercent + ZOOM_STEP)}>
                +
              </button>
              <span className="moon-portfolio__zoom-value">{zoomPercent}%</span>
            </div>
            <div className="moon-portfolio__zoom-presets">
              {[50, 100, 150, 200, 250, 300].map((value) => (
                <button
                  key={value}
                  className={`moon-portfolio__ctrl-btn ${zoomPercent === value ? "moon-portfolio__ctrl-btn--active" : ""}`}
                  onClick={() => applyZoom(value)}
                >
                  {value}%
                </button>
              ))}
            </div>
            <div className="moon-portfolio__pan-row">
              <button className="moon-portfolio__ctrl-btn" onClick={() => nudgePan(0, -PAN_STEP)}>
                ↑
              </button>
              <button className="moon-portfolio__ctrl-btn" onClick={() => nudgePan(-PAN_STEP, 0)}>
                ←
              </button>
              <button className="moon-portfolio__ctrl-btn" onClick={() => setPanOffset({ x: 0, y: 0 })}>
                C
              </button>
              <button className="moon-portfolio__ctrl-btn" onClick={() => nudgePan(PAN_STEP, 0)}>
                →
              </button>
              <button className="moon-portfolio__ctrl-btn" onClick={() => nudgePan(0, PAN_STEP)}>
                ↓
              </button>
            </div>
          </div>
          {activeMedia ? (
            imgError.has(activeMedia.textureUrl) ? (
              <div className="moon-portfolio__fallback">Image unavailable</div>
            ) : (
              <div
                ref={imageViewportRef}
                className="moon-portfolio__img-viewport moon-portfolio__img-viewport--grab"
                onWheel={handleImageWheel}
                onPointerDown={handlePointerDown}
              >
                <img
                  src={activeMedia.textureUrl}
                  alt={activeMedia.title}
                  className="moon-portfolio__img"
                  style={{
                    objectFit: "contain",
                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomPercent / 100})`,
                  }}
                  onError={() => handleImgError(activeMedia.textureUrl)}
                />
              </div>
            )
          ) : (
            <div className="moon-portfolio__fallback">No media</div>
          )}
          {activeCard && (
            <div
              className={[
                "moon-portfolio__image-desc",
                imageDescCollapsed ? "moon-portfolio__image-desc--collapsed" : "",
              ].join(" ")}
            >
              <button
                className="moon-portfolio__image-desc-toggle"
                onClick={() => setImageDescCollapsed((prev) => !prev)}
                aria-label={imageDescCollapsed ? "Expand details" : "Collapse details"}
                title={imageDescCollapsed ? "Expand details" : "Collapse details"}
              >
                {imageDescCollapsed ? "\u25BC" : "\u25B2"}
              </button>
              {!imageDescCollapsed && (
                <div className="moon-portfolio__image-desc-body">
                  <h4 className="moon-portfolio__desc-title">
                    {activeSubcat?.title ?? activeCard.title}
                  </h4>
                  {(activeSubcat?.description ?? activeCard.description) && (
                    <p className="moon-portfolio__desc-text">
                      {activeSubcat?.description ?? activeCard.description}
                    </p>
                  )}
                  {activeMedia?.description &&
                    activeMedia.description !== (activeSubcat?.description ?? activeCard.description) && (
                      <p className="moon-portfolio__desc-media-text">{activeMedia.description}</p>
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="moon-portfolio__bottom">
          <div className="moon-portfolio__thumbs-col">
            {tabs.length > 1 && (
              <div className="moon-portfolio__tabs">
                {tabTotalPages > 1 && tabPage > 0 && (
                  <button
                    className="moon-portfolio__tab-arrow"
                    onClick={() => {
                      tabSlideDirectionRef.current = -1;
                      setTabPage((p) => Math.max(0, p - 1));
                    }}
                  >
                    &#9664;
                  </button>
                )}
                <div className="moon-portfolio__tab-track" ref={tabTrackRef}>
                  {visibleTabs.map((tab, vi) => {
                    const globalIdx = tabStart + vi;
                    return (
                      <button
                        key={tab.id}
                        className={`moon-portfolio__tab ${globalIdx === activeTabIndex ? "moon-portfolio__tab--active" : ""}`}
                        onClick={() => handleTabSelect(globalIdx)}
                      >
                        {tab.title}
                      </button>
                    );
                  })}
                </div>
                {tabTotalPages > 1 && tabPage < tabTotalPages - 1 && (
                  <button
                    className="moon-portfolio__tab-arrow"
                    onClick={() => {
                      tabSlideDirectionRef.current = 1;
                      setTabPage((p) => Math.min(tabTotalPages - 1, p + 1));
                    }}
                  >
                    &#9654;
                  </button>
                )}
              </div>
            )}

            {cards.length > 1 && (
              <div className="moon-portfolio__cards">
                <div className="moon-portfolio__card-track">
                  {cards.map((card, idx) => (
                    <button
                      key={card.id}
                      className={`moon-portfolio__card-btn ${idx === activeCardIndex ? "moon-portfolio__card-btn--active" : ""}`}
                      onClick={() => setActiveCardIndex(idx)}
                    >
                      {card.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasSubcats && (
              <div className="moon-portfolio__subcats">
                {subcatTotalPages > 1 && subcatPage > 0 && (
                  <button
                    className="moon-portfolio__tab-arrow moon-portfolio__subcat-arrow"
                    onClick={() => {
                      subcatSlideDirectionRef.current = -1;
                      setSubcatPage((p) => Math.max(0, p - 1));
                    }}
                  >
                    &#9664;
                  </button>
                )}
                <div className="moon-portfolio__subcat-track" ref={subcatTrackRef}>
                  {visibleSubcats.map((sc, vi) => {
                    const globalIdx = subcatStart + vi;
                    return (
                      <button
                        key={sc.id}
                        className={`moon-portfolio__subcat-btn ${globalIdx === activeSubcatIndex ? "moon-portfolio__subcat-btn--active" : ""}`}
                        onClick={() => setActiveSubcatIndex(globalIdx)}
                      >
                        {sc.title}
                      </button>
                    );
                  })}
                </div>
                {subcatTotalPages > 1 && subcatPage < subcatTotalPages - 1 && (
                  <button
                    className="moon-portfolio__tab-arrow moon-portfolio__subcat-arrow"
                    onClick={() => {
                      subcatSlideDirectionRef.current = 1;
                      setSubcatPage((p) => Math.min(subcatTotalPages - 1, p + 1));
                    }}
                  >
                    &#9654;
                  </button>
                )}
              </div>
            )}

            <div className="moon-portfolio__thumbs-area">
              {totalPages > 1 && thumbPage > 0 && (
                <button
                  className="moon-portfolio__thumb-arrow moon-portfolio__thumb-arrow--prev"
                  onClick={() => {
                    thumbSlideDirectionRef.current = -1;
                    setThumbPage((p) => Math.max(0, p - 1));
                  }}
                >
                  &#9664;
                </button>
              )}
              <div className="moon-portfolio__thumb-row" ref={thumbRowRef}>
                {visibleThumbs.map((media, vi) => {
                  const globalIdx = thumbStart + vi;
                  const isActive = globalIdx === activeMediaIndex;
                  const errored = imgError.has(media.textureUrl);
                  return (
                    <button
                      key={media.id}
                      className={`moon-portfolio__thumb ${isActive ? "moon-portfolio__thumb--active" : ""}`}
                      onClick={() => handleThumbClick(globalIdx)}
                    >
                      {errored ? (
                        <span className="moon-portfolio__thumb-fallback">?</span>
                      ) : (
                        <img
                          src={media.textureUrl}
                          alt={media.title}
                          onError={() => handleImgError(media.textureUrl)}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              {totalPages > 1 && thumbPage < totalPages - 1 && (
                <button
                  className="moon-portfolio__thumb-arrow moon-portfolio__thumb-arrow--next"
                  onClick={() => {
                    thumbSlideDirectionRef.current = 1;
                    setThumbPage((p) => Math.min(totalPages - 1, p + 1));
                  }}
                >
                  &#9654;
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MoonOrbitHtmlPortfolio;
