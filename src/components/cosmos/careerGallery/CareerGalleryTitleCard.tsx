import { useEffect, useState } from "react";
import "./CareerGalleryTitleCard.css";

type Selection = { title: string; subtitle: string } | null;

type Props = {
  selection: Selection;
  onClose: () => void;
};

const GLYPHS = "▓▒░<>/\\_#%&01ΣΔ";
const SCRAMBLE_FRAMES = 18;
const FRAME_MS = 34;

/** Resolves text from random glyphs, left to right, like a hologram fizzle. */
const useScrambledText = (text: string) => {
  const [display, setDisplay] = useState(text);
  useEffect(() => {
    if (!text) {
      setDisplay("");
      return;
    }
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      const settled = Math.floor((frame / SCRAMBLE_FRAMES) * text.length);
      const next = Array.from(text, (char, i) => {
        if (char === " " || i < settled) return char;
        return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }).join("");
      setDisplay(next);
      if (frame >= SCRAMBLE_FRAMES) {
        window.clearInterval(id);
        setDisplay(text);
      }
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [text]);
  return display;
};

export const CareerGalleryTitleCard = ({ selection, onClose }: Props) => {
  const title = useScrambledText(selection?.title ?? "");
  const subtitle = useScrambledText(selection?.subtitle ?? "");
  if (!selection) return null;
  return (
    // Keyed so each new selection replays the fizzle-in animation.
    <div className="career-gallery-title" key={selection.title + selection.subtitle}>
      <div className="career-gallery-title__eyebrow">Career Gallery</div>
      <div className="career-gallery-title__title">{title}</div>
      {selection.subtitle && (
        <div className="career-gallery-title__subtitle">{subtitle}</div>
      )}
      <button
        type="button"
        className="career-gallery-title__close"
        onClick={onClose}
        aria-label="Close image"
        title="Close (Esc)"
      >
        ×
      </button>
    </div>
  );
};

export default CareerGalleryTitleCard;
