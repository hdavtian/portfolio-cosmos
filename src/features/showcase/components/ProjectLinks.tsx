import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, MouseEvent } from "react";
import type { PortfolioLink } from "../../fast/types";

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * A project's links (HD-13). Clicking one first opens a small note beside it
 * saying the site opens in a new tab, with Continue and a close button. A
 * modified click (ctrl/cmd/shift/middle) still goes straight to the browser.
 */
export function ProjectLinks({
  links,
  accent,
}: {
  links: PortfolioLink[];
  accent: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  // The note is fixed to the viewport (portaled out of the story column, which
  // scrolls and would clip it), so it follows the link as the page moves.
  useLayoutEffect(() => {
    if (openIndex === null) return;
    const place = () => {
      const link = linkRefs.current[openIndex];
      const note = popupRef.current;
      if (!link) return;
      const rect = link.getBoundingClientRect();
      const width = note?.offsetWidth ?? 260;
      const height = note?.offsetHeight ?? 80;
      const margin = 12;
      const fitsBeside =
        rect.right + margin + width <= window.innerWidth - margin;
      if (!note) return;
      // Beside the link when there's room, otherwise below it (phones).
      const left = fitsBeside
        ? rect.right + margin
        : Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
      const top = fitsBeside
        ? Math.max(margin, rect.top + rect.height / 2 - height / 2)
        : rect.bottom + 8;
      note.style.left = `${left}px`;
      note.style.top = `${top}px`;
      note.style.visibility = "visible";
    };
    place();
    // Once more after the note has rendered and has a real size.
    const frame = requestAnimationFrame(place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [openIndex]);

  const close = (returnFocus = true) => {
    if (returnFocus && openIndex !== null) linkRefs.current[openIndex]?.focus();
    setOpenIndex(null);
  };

  useEffect(() => {
    if (openIndex === null) return;
    continueRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Escape closes the note instead of leaving the project.
      event.preventDefault();
      close();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popupRef.current?.contains(target)) return;
      if (linkRefs.current[openIndex]?.contains(target)) return;
      close(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLinkClick = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    setOpenIndex((current) => (current === index ? null : index));
  };

  const visit = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    setOpenIndex(null);
  };

  return (
    <ul
      className="showcase-project__links"
      style={{ "--link-accent": accent } as CSSProperties}
    >
      {links.map((link, index) => {
        const isOpen = openIndex === index;
        const popupId = `project-link-note-${index}`;
        return (
          <li key={`${link.url}-${index}`}>
            <div className="showcase-project__link-row">
              <span
                className="showcase-project__link-arrow"
                aria-hidden="true"
              />
              <a
                ref={(node) => {
                  linkRefs.current[index] = node;
                }}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.label} (opens in a new tab)`}
                aria-expanded={isOpen}
                aria-controls={isOpen ? popupId : undefined}
                onClick={(event) => onLinkClick(event, index)}
              >
                {link.label}
              </a>
              {isOpen
                ? createPortal(
                    <div
                      ref={popupRef}
                      id={popupId}
                      className="showcase-link-note"
                      role="dialog"
                      style={
                        {
                          visibility: "hidden",
                          "--link-accent": accent,
                        } as CSSProperties
                      }
                      aria-label="Leaving this site"
                    >
                      <button
                        type="button"
                        className="showcase-link-note__close"
                        aria-label="Close"
                        onClick={() => close()}
                      >
                        ×
                      </button>
                      <p>
                        Visiting <strong>{hostOf(link.url)}</strong> will open a
                        new tab.
                      </p>
                      <button
                        ref={continueRef}
                        type="button"
                        className="showcase-link-note__continue"
                        onClick={() => visit(link.url)}
                      >
                        Continue
                      </button>
                    </div>,
                    document.querySelector(".showcase") ?? document.body,
                  )
                : null}
            </div>
            {link.description ? <p>{link.description}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
