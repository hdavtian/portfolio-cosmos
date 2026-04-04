import React, { useEffect, useRef } from "react";
import "./MatrixEffect.scss";

interface MatrixEffectProps {
  color?: string;
  visible?: boolean;
  fadeBg?: string;
  className?: string;
  autoStopMs?: number;
  fontSize?: string;
  randomColumnColors?: boolean;
}

const COL_WIDTH = 20;
const FRAME_MS = 50;
const AUTO_FADE_MS = 1000;

const MatrixEffect: React.FC<MatrixEffectProps> = ({
  color = "#2a9968",
  visible = true,
  fadeBg = "rgba(2, 8, 16, 0.06)",
  className,
  autoStopMs,
  fontSize = "0.72rem",
  randomColumnColors = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let yPositions: number[] = [];
    let columnColors: string[] = [];
    let drawTimer: ReturnType<typeof setInterval> | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;
    let fadeRaf: number | null = null;
    let fading = false;
    let fadeStartedAt = 0;

    const resize = () => {
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width;
      canvas.height = height;
      const cols = Math.floor(width / COL_WIDTH) + 1;
      const prev = yPositions;
      yPositions = new Array(cols).fill(0);
      columnColors = new Array(cols)
        .fill("")
        .map(
          () =>
            `hsl(${Math.floor(Math.random() * 360)} ${70 + Math.floor(Math.random() * 25)}% ${48 + Math.floor(Math.random() * 18)}%)`,
        );
      for (let i = 0; i < Math.min(prev.length, cols); i += 1) {
        yPositions[i] = prev[i];
      }
    };

    const draw = () => {
      ctx.fillStyle = fadeBg;
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${fontSize} monospace`;

      for (let i = 0; i < yPositions.length; i += 1) {
        const ch = String.fromCharCode(Math.random() * 128);
        const x = i * COL_WIDTH;
        const y = yPositions[i];
        ctx.fillStyle = randomColumnColors
          ? columnColors[i] ?? color
          : color;
        ctx.fillText(ch, x, y);
        if (y > 100 + Math.random() * 10000) {
          yPositions[i] = 0;
        } else {
          yPositions[i] = y + COL_WIDTH;
        }
      }
    };

    const fadeOutAndStop = () => {
      if (fading) return;
      fading = true;
      fadeStartedAt = performance.now();

      if (drawTimer !== null) {
        clearInterval(drawTimer);
        drawTimer = null;
      }

      const tick = () => {
        const progress = Math.min(
          (performance.now() - fadeStartedAt) / AUTO_FADE_MS,
          1,
        );
        canvas.style.opacity = String(1 - progress);
        if (progress < 1) {
          fadeRaf = requestAnimationFrame(tick);
        }
      };
      fadeRaf = requestAnimationFrame(tick);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    drawTimer = setInterval(draw, FRAME_MS);

    if (autoStopMs != null && autoStopMs > 0) {
      stopTimer = setTimeout(fadeOutAndStop, autoStopMs);
    }

    return () => {
      if (drawTimer !== null) clearInterval(drawTimer);
      if (stopTimer !== null) clearTimeout(stopTimer);
      if (fadeRaf !== null) cancelAnimationFrame(fadeRaf);
      observer.disconnect();
      canvas.style.opacity = "";
    };
  }, [visible, color, fadeBg, autoStopMs, fontSize, randomColumnColors]);

  return (
    <canvas
      ref={canvasRef}
      className={`matrix-effect${visible ? " matrix-effect--visible" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    />
  );
};

export default MatrixEffect;
