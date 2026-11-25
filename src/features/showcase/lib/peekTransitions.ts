/**
 * HD-12: the jagged, disruptive transitions between scenes in the quick peek.
 * Each one darkens or covers the screen, calls `onCut` at its darkest moment
 * (the host swaps scenes there, as only one scene renders at a time), then
 * reveals the new scene. They work on two things: the scene layer's element
 * (opacity, transform, clip-path through the Web Animations API) and a 2D
 * canvas laid over it for lines, particles, noise and bars.
 *
 * Flashing stays within the usual limit of three per second: the blackouts
 * are dips toward black, and the bright parts are thin lines or small dots.
 */

export type PeekTransitionKind = "flicker" | "particles" | "scanlines" | "crt" | "tear" | "static" | "blinds";

export const PEEK_TRANSITIONS: PeekTransitionKind[] = ["flicker", "particles", "scanlines", "crt", "tear", "static", "blinds"];

interface TransitionTargets {
  /** The scene layer (the WebGL canvas's wrapper). */
  host: HTMLElement;
  /** The overlay canvas for drawn effects. */
  fx: HTMLCanvasElement;
  /** Called once, when the screen is at its most covered. */
  onCut: () => void;
  /** Called once, when the transition has finished. */
  onDone: () => void;
}

/** Stops a transition early and clears whatever it was showing. */
export type CancelTransition = () => void;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
/** Fisher-Yates: a fresh order of effects each session. */
export const shuffled = <T>(items: readonly T[]) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
};

/** A bell from 0 to 1 and back, peaking at `peak` (0..1). */
const bell = (t: number, peak: number) => (t < peak ? t / peak : Math.max(0, 1 - (t - peak) / (1 - peak)));
/** Quantize, for jagged, stepped motion. */
const snap = (value: number, step: number) => Math.round(value / step) * step;

const INK = ["#ffffff", "#d8f3ff", "#9fe7ff", "#baffd3", "#ffd9a0"];

interface Effect {
  duration: number;
  /** Fraction of the duration at which the scene swaps. */
  cutAt: number;
  /** Animations on the scene layer, started with the effect. */
  host?: (host: HTMLElement, duration: number) => Animation[];
  /** Draws one frame of the overlay; t is 0..1. */
  draw?: (context: CanvasRenderingContext2D, t: number, width: number, height: number) => void;
}

function flicker(): Effect {
  // Three dips toward black, uneven, the scene swapping in the darkest.
  const cutAt = 0.55;
  return {
    duration: rand(480, 620),
    cutAt,
    host: (host, duration) => [
      host.animate(
        [
          { opacity: 1, offset: 0 },
          { opacity: rand(0.05, 0.25), offset: 0.12 },
          { opacity: 0.9, offset: 0.2 },
          { opacity: 0, offset: 0.36 },
          { opacity: 0, offset: cutAt + 0.04 },
          { opacity: rand(0.5, 0.8), offset: 0.7 },
          { opacity: rand(0.05, 0.2), offset: 0.8 },
          { opacity: 1, offset: 1 },
        ],
        { duration, easing: "steps(1, end)" },
      ),
    ],
    draw: (context, t, width, height) => {
      // A torn white line or two during the dark moments.
      if ((t > 0.36 && t < 0.6) || (t > 0.78 && t < 0.86)) {
        context.fillStyle = "rgb(255 255 255 / 0.55)";
        for (let line = 0; line < 2; line += 1) {
          const y = snap(Math.random() * height, 3);
          const x = Math.random() * width * 0.4;
          context.fillRect(x, y, width * rand(0.3, 0.9), rand(1, 3));
        }
      }
    },
  };
}

function particles(): Effect {
  // A burst of pixel sparks from a random point; the scene goes dark under
  // them, swaps, and the sparks streak off as the new scene comes up.
  const count = 320;
  const originX = rand(0.25, 0.75);
  const originY = rand(0.3, 0.7);
  const sparks = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(0.15, 1.1);
    return {
      x: originX + rand(-0.05, 0.05),
      y: originY + rand(-0.05, 0.05),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.7,
      size: pick([2, 2, 3, 4, 6]),
      color: pick(INK),
    };
  });
  return {
    duration: rand(650, 800),
    cutAt: 0.45,
    host: (host, duration) => [
      host.animate(
        [
          { opacity: 1, offset: 0 },
          { opacity: 0, offset: 0.4 },
          { opacity: 0, offset: 0.5 },
          { opacity: 1, offset: 1 },
        ],
        { duration, easing: "ease-in-out" },
      ),
    ],
    draw: (context, t, width, height) => {
      const reach = t * t * 1.6;
      context.globalAlpha = Math.min(1, bell(t, 0.45) * 1.4);
      for (const spark of sparks) {
        const x = snap((spark.x + spark.vx * reach) * width, 4);
        const y = snap((spark.y + spark.vy * reach) * height, 4);
        context.fillStyle = spark.color;
        context.fillRect(x, y, spark.size, spark.size);
      }
      context.globalAlpha = 1;
    },
  };
}

function scanlines(): Effect {
  // Lines race left to right, wiping the old scene to black behind the lead;
  // a second wave reveals the new one.
  const lines = Array.from({ length: Math.round(rand(6, 11)) }, () => ({
    y: Math.random(),
    thickness: pick([1, 1, 2, 3, 5]),
    lag: rand(0, 0.25),
    trail: rand(0.15, 0.5),
    color: pick(INK),
  }));
  const cutAt = 0.5;
  return {
    duration: rand(620, 760),
    cutAt,
    host: (host, duration) => [
      host.animate(
        [
          { clipPath: "inset(0 0 0 0)", offset: 0 },
          { clipPath: "inset(0 0 0 100%)", offset: cutAt - 0.02 },
          { clipPath: "inset(0 100% 0 0)", offset: cutAt + 0.02 },
          { clipPath: "inset(0 0 0 0)", offset: 1 },
        ],
        { duration, easing: "linear" },
      ),
    ],
    draw: (context, t, width, height) => {
      // Two waves: 0..cut wipes, cut..1 reveals; both run left to right.
      const wave = t < cutAt ? t / cutAt : (t - cutAt) / (1 - cutAt);
      for (const line of lines) {
        const head = Math.min(1.2, Math.max(0, (wave - line.lag) / (1 - line.lag)) * 1.2) * width;
        const tail = head - line.trail * width;
        const gradient = context.createLinearGradient(tail, 0, head, 0);
        gradient.addColorStop(0, "transparent");
        gradient.addColorStop(1, line.color);
        context.fillStyle = gradient;
        context.fillRect(tail, snap(line.y * height, 2), head - tail, line.thickness);
      }
    },
  };
}

function crt(): Effect {
  // An old TV switching off: the picture collapses to a bright line, then a
  // dot, then the new channel opens back out.
  const cutAt = 0.5;
  return {
    duration: rand(560, 680),
    cutAt,
    host: (host, duration) => [
      host.animate(
        [
          { transform: "scale(1, 1)", filter: "brightness(1)", offset: 0 },
          { transform: "scale(1, 0.006)", filter: "brightness(2.6)", offset: 0.28 },
          { transform: "scale(0, 0.006)", filter: "brightness(3)", offset: 0.44 },
          { transform: "scale(0, 0.006)", filter: "brightness(3)", offset: 0.56 },
          { transform: "scale(1, 0.006)", filter: "brightness(2.2)", offset: 0.72 },
          { transform: "scale(1, 1)", filter: "brightness(1)", offset: 1 },
        ],
        { duration, easing: "cubic-bezier(0.7, 0, 0.3, 1)" },
      ),
    ],
    draw: (context, t, width, height) => {
      // The dot that hangs in the middle for a moment.
      const glow = bell(t, cutAt) ** 6;
      if (glow < 0.02) return;
      const radius = 10 + glow * 18;
      const gradient = context.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, radius);
      gradient.addColorStop(0, `rgb(255 255 255 / ${glow})`);
      gradient.addColorStop(1, "transparent");
      context.fillStyle = gradient;
      context.fillRect(width / 2 - radius, height / 2 - radius, radius * 2, radius * 2);
    },
  };
}

function tear(): Effect {
  // The picture judders sideways in bands while slices of color tear across.
  const cutAt = 0.5;
  const frames = Array.from({ length: 9 }, (_, index) => {
    const offset = index / 8;
    const dark = Math.abs(offset - cutAt) < 0.12;
    const top = Math.round(rand(0, 45));
    const bottom = Math.round(rand(0, 45));
    return {
      offset,
      opacity: dark ? 0 : rand(0.55, 1),
      transform: `translateX(${Math.round(rand(-60, 60))}px) skewX(${rand(-6, 6).toFixed(1)}deg)`,
      clipPath: `inset(${top}% 0 ${bottom}% 0)`,
    };
  });
  frames[0] = { offset: 0, opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)" };
  frames[frames.length - 1] = { offset: 1, opacity: 1, transform: "none", clipPath: "inset(0 0 0 0)" };
  return {
    duration: rand(460, 580),
    cutAt,
    host: (host, duration) => [host.animate(frames, { duration, easing: "steps(1, end)" })],
    draw: (context, t, width, height) => {
      const strength = bell(t, cutAt);
      const bands = Math.round(4 + strength * 10);
      for (let band = 0; band < bands; band += 1) {
        const y = snap(Math.random() * height, 4);
        const h = pick([2, 4, 8, 16, 28]);
        context.fillStyle = pick(["rgb(255 40 120 / 0.35)", "rgb(40 220 255 / 0.35)", "rgb(255 255 255 / 0.25)", "rgb(4 6 10 / 0.9)"]);
        context.fillRect(snap(rand(-0.2, 0.6) * width, 8), y, width * rand(0.2, 0.8), h);
      }
    },
  };
}

function staticBurst(): Effect {
  // A burst of TV snow that swells over the picture and clears.
  const cutAt = 0.5;
  let noise: ImageData | null = null;
  const cells = { width: 192, height: 108 };
  const scratch = document.createElement("canvas");
  scratch.width = cells.width;
  scratch.height = cells.height;
  const scratchContext = scratch.getContext("2d");
  return {
    duration: rand(500, 640),
    cutAt,
    host: (host, duration) => [
      host.animate(
        [
          { opacity: 1, offset: 0 },
          { opacity: 0.15, offset: cutAt - 0.08 },
          { opacity: 0.15, offset: cutAt + 0.08 },
          { opacity: 1, offset: 1 },
        ],
        { duration, easing: "linear" },
      ),
    ],
    draw: (context, t, width, height) => {
      if (!scratchContext) return;
      noise ??= scratchContext.createImageData(cells.width, cells.height);
      const data = noise.data;
      for (let index = 0; index < data.length; index += 4) {
        const value = Math.random() * 255;
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value * rand(0.9, 1.1);
        data[index + 3] = 255;
      }
      scratchContext.putImageData(noise, 0, 0);
      context.imageSmoothingEnabled = false;
      context.globalAlpha = Math.min(0.85, bell(t, cutAt) * 1.1);
      context.drawImage(scratch, 0, 0, width, height);
      context.globalAlpha = 1;
    },
  };
}

function blinds(): Effect {
  // Black bars of uneven widths slam shut from top or bottom in stepped jerks,
  // then open again in a different order.
  const cutAt = 0.5;
  const bars: Array<{ x: number; width: number; fromTop: boolean; closeAt: number; openAt: number }> = [];
  let x = 0;
  while (x < 1) {
    const width = rand(0.04, 0.16);
    bars.push({ x, width, fromTop: Math.random() < 0.5, closeAt: rand(0.55, 1), openAt: rand(0, 0.45) });
    x += width;
  }
  return {
    duration: rand(560, 700),
    cutAt,
    draw: (context, t, width, height) => {
      context.fillStyle = "#03050a";
      for (const bar of bars) {
        // 0..1 of the bar's height that is covered.
        const closing = Math.min(1, (t / cutAt) / bar.closeAt);
        const opening = t <= cutAt ? 0 : Math.max(0, ((t - cutAt) / (1 - cutAt) - bar.openAt) / (1 - bar.openAt));
        const covered = t <= cutAt ? closing : 1 - opening;
        const h = snap(covered * height, height / 6);
        const left = Math.floor(bar.x * width);
        const w = Math.ceil(bar.width * width) + 1;
        context.fillRect(left, bar.fromTop ? 0 : height - h, w, h);
      }
    },
  };
}

const FACTORIES: Record<PeekTransitionKind, () => Effect> = {
  flicker,
  particles,
  scanlines,
  crt,
  tear,
  static: staticBurst,
  blinds,
};

/** Plays one transition. The cut and the end are reported through the callbacks. */
export function runPeekTransition(kind: PeekTransitionKind, { host, fx, onCut, onDone }: TransitionTargets): CancelTransition {
  const effect = FACTORIES[kind]();
  const context = fx.getContext("2d");
  // Drawn at CSS pixel size: crisp enough for jagged effects, and cheap.
  fx.width = Math.max(1, Math.round(fx.clientWidth));
  fx.height = Math.max(1, Math.round(fx.clientHeight));
  const animations = effect.host?.(host, effect.duration) ?? [];
  const start = performance.now();
  let frame = 0;
  let cut = false;
  let finished = false;

  const clear = () => context?.clearRect(0, 0, fx.width, fx.height);
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    clear();
    onDone();
  };
  // Its own clock, so it keeps time even while the scene's frames are slow.
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / effect.duration);
    if (!cut && t >= effect.cutAt) {
      cut = true;
      onCut();
    }
    clear();
    if (context && effect.draw) effect.draw(context, t, fx.width, fx.height);
    if (t >= 1) finish();
    else frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);

  return () => {
    for (const animation of animations) animation.cancel();
    finish();
  };
}
