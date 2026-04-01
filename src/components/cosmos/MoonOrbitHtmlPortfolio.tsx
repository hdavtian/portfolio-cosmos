import React, { useState, useRef, useEffect, useCallback } from "react";
import gsap from "gsap";
import type { MoonPortfolioPayload, MoonPortfolioTab } from "./moonPortfolioSelector";

interface Props {
  portfolio: MoonPortfolioPayload | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const TABS_VISIBLE = 3;
const CARDS_VISIBLE = 3;
const THUMB_MIN_WIDTH_PX = 92;
const THUMB_GAP_PX = 4;

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
  const [cardPage, setCardPage] = useState(0);
  const [thumbsPerPage, setThumbsPerPage] = useState(2);
  const [imageDescCollapsed, setImageDescCollapsed] = useState(false);
  const [imgError, setImgError] = useState<Set<string>>(() => new Set());
  const tabTrackRef = useRef<HTMLDivElement>(null);
  const thumbRowRef = useRef<HTMLDivElement>(null);
  const tabSlideDirectionRef = useRef<1 | -1>(1);
  const thumbSlideDirectionRef = useRef<1 | -1>(1);
  const prevTabPageRef = useRef(0);
  const prevThumbPageRef = useRef(0);

  const tabs = portfolio?.tabs ?? [];
  const activeTab: MoonPortfolioTab | undefined = tabs[activeTabIndex];
  const cards = activeTab?.cards ?? [];
  const activeCard = cards[activeCardIndex];
  const mediaItems = activeCard?.mediaItems ?? [];
  const activeMedia = mediaItems[activeMediaIndex];
  const totalPages = Math.ceil(mediaItems.length / thumbsPerPage);

  const tabTotalPages = Math.ceil(tabs.length / TABS_VISIBLE);
  const tabStart = tabPage * TABS_VISIBLE;
  const visibleTabs = tabs.slice(tabStart, tabStart + TABS_VISIBLE);

  const cardTotalPages = Math.ceil(cards.length / CARDS_VISIBLE);
  const cardStart = cardPage * CARDS_VISIBLE;
  const visibleCards = cards.slice(cardStart, cardStart + CARDS_VISIBLE);

  useEffect(() => {
    setActiveCardIndex(0);
    setActiveMediaIndex(0);
    setThumbPage(0);
    setCardPage(0);
    setImageDescCollapsed(false);
  }, [activeTabIndex]);

  useEffect(() => {
    setActiveMediaIndex(0);
    setThumbPage(0);
    setImageDescCollapsed(false);
  }, [activeCardIndex]);

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
          {activeMedia ? (
            imgError.has(activeMedia.textureUrl) ? (
              <div className="moon-portfolio__fallback">Image unavailable</div>
            ) : (
              <img
                src={activeMedia.textureUrl}
                alt={activeMedia.title}
                className="moon-portfolio__img"
                style={{ objectFit: activeMedia.fit || "cover" }}
                onError={() => handleImgError(activeMedia.textureUrl)}
              />
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
              <div className="moon-portfolio__image-desc-head">
                <span>DETAILS</span>
                <button
                  className="moon-portfolio__image-desc-toggle"
                  onClick={() => setImageDescCollapsed((prev) => !prev)}
                  aria-label={imageDescCollapsed ? "Expand details" : "Collapse details"}
                  title={imageDescCollapsed ? "Expand details" : "Collapse details"}
                >
                  {imageDescCollapsed ? "\u25BC" : "\u25B2"}
                </button>
              </div>
              {!imageDescCollapsed && (
                <div className="moon-portfolio__image-desc-body">
                  <h4 className="moon-portfolio__desc-title">{activeCard.title}</h4>
                  {activeCard.description && (
                    <p className="moon-portfolio__desc-text">{activeCard.description}</p>
                  )}
                  {activeMedia?.description &&
                    activeMedia.description !== activeCard.description && (
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
                {cardTotalPages > 1 && cardPage > 0 && (
                  <button
                    className="moon-portfolio__tab-arrow"
                    onClick={() => setCardPage((p) => Math.max(0, p - 1))}
                  >
                    &#9664;
                  </button>
                )}
                <div className="moon-portfolio__card-track">
                  {visibleCards.map((card, vi) => {
                    const globalIdx = cardStart + vi;
                    return (
                      <button
                        key={card.id}
                        className={`moon-portfolio__card-btn ${globalIdx === activeCardIndex ? "moon-portfolio__card-btn--active" : ""}`}
                        onClick={() => setActiveCardIndex(globalIdx)}
                      >
                        {card.title}
                      </button>
                    );
                  })}
                </div>
                {cardTotalPages > 1 && cardPage < cardTotalPages - 1 && (
                  <button
                    className="moon-portfolio__tab-arrow"
                    onClick={() => setCardPage((p) => Math.min(cardTotalPages - 1, p + 1))}
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
