import { useEffect, useState, type CSSProperties } from "react";

/**
 * HD-12: the big centered title over each scene in the quick peek. Every scene
 * forms its name a different way; the effect is chosen by scene id.
 */
type PeekEffect = "snap" | "forge" | "flap" | "orbit" | "streak" | "stardust" | "decode";

const EFFECT_BY_SCENE: Record<string, PeekEffect> = {
  "skills-lattice": "snap",
  "got-skillz": "forge",
  "career-gallery": "flap",
  "orbital-portfolio": "orbit",
  "about-ride": "streak",
  "universe-tour": "stardust",
  "job-moon": "decode",
};

const EFFECTS: PeekEffect[] = ["snap", "forge", "flap", "orbit", "streak", "stardust", "decode"];

/** Effects whose letters shuffle through characters before landing (JS-driven). */
const SCRAMBLE: Partial<Record<PeekEffect, { glyphs: string; ms: number; stagger: number }>> = {
  flap: { glyphs: "ABCDEFGHIJKLMNOPQRSTUVWXYZ", ms: 420, stagger: 70 },
  decode: { glyphs: "#$%&*+<>/\\[]{}=?!01", ms: 700, stagger: 55 },
};

/** Stable "random" in -1..1 per letter, so a title forms the same way every time. */
const jitter = (index: number, salt: number) => {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
};

function useScramble(text: string, effect: PeekEffect) {
  const config = SCRAMBLE[effect];
  const [shown, setShown] = useState(() => (config ? text.replace(/\S/g, " ") : text));
  useEffect(() => {
    if (!config) return;
    const start = performance.now();
    let seed = 1;
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - start;
      let settled = true;
      const next = [...text]
        .map((char, index) => {
          if (char === " ") return " ";
          const at = elapsed - index * config.stagger;
          if (at < 0) {
            settled = false;
            return " ";
          }
          if (at >= config.ms) return char;
          settled = false;
          seed = (seed * 16807) % 2147483647;
          return config.glyphs[seed % config.glyphs.length];
        })
        .join("");
      setShown(next);
      if (settled) window.clearInterval(timer);
    }, 45);
    return () => window.clearInterval(timer);
  }, [text, config]);
  return config ? shown : text;
}

function peekEffectFor(sceneId: string, index: number): PeekEffect {
  return EFFECT_BY_SCENE[sceneId] ?? EFFECTS[index % EFFECTS.length];
}

interface PeekTitleProps {
  sceneId: string;
  label: string;
  /** 1-based position in the peek, and how many there are. */
  position: number;
  total: number;
}

export function PeekTitle({ sceneId, label, position, total }: PeekTitleProps) {
  const effect = peekEffectFor(sceneId, position - 1);
  const shown = useScramble(label, effect);
  const letters = [...shown];
  return (
    <div className={`showcase-peek-title showcase-peek-title--${effect}`} aria-hidden="true">
      <span className="showcase-peek-title__count">
        {String(position).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
      <span className="showcase-peek-title__word" style={{ "--n": letters.length } as CSSProperties}>
        {letters.map((char, index) => (
          <span
            key={index}
            className={`showcase-peek-title__char${label[index] === " " ? " is-space" : ""}`}
            style={
              {
                "--i": index,
                "--jx": jitter(index, 1).toFixed(3),
                "--jy": jitter(index, 2).toFixed(3),
                "--ja": jitter(index, 3).toFixed(3),
              } as CSSProperties
            }
          >
            {char === " " ? " " : char}
          </span>
        ))}
      </span>
    </div>
  );
}
