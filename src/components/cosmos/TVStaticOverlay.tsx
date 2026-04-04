import React, { useEffect, useRef } from "react";

interface TVStaticOverlayProps {
  active: boolean;
  mode?: "static" | "bars";
  intensity?: number;
  tint?: string;
  className?: string;
}

const SCANLINE_STEP = 3;
const SCANLINE_ALPHA = 0.15;
const BARS = [
  "#cfcfcf",
  "#d9d92f",
  "#27cfd6",
  "#2fcc33",
  "#cf2fc3",
  "#d9312d",
  "#2944cf",
] as const;

const TVStaticOverlay: React.FC<TVStaticOverlayProps> = ({
  active,
  mode = "static",
  intensity = 1,
  tint = "rgba(42, 153, 104, 0.08)",
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seedRef = useRef((Date.now() ^ ((Math.random() * 1e6) | 0)) | 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = width;
      canvas.height = height;
    };

    const drawScanlines = () => {
      ctx.fillStyle = `rgba(0,0,0,${SCANLINE_ALPHA})`;
      for (let y = 0; y < height; y += SCANLINE_STEP) {
        ctx.fillRect(0, y, width, 1);
      }
    };

    const drawStaticFrame = () => {
      if (width <= 0 || height <= 0) return;
      const img = ctx.createImageData(width, height);
      const d = img.data;
      let s = (seedRef.current + (performance.now() | 0)) | 0;

      for (let i = 0; i < d.length; i += 4) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const value = Math.min(255, ((s >> 16) & 0xff) * intensity);
        d[i] = value;
        d[i + 1] = value;
        d[i + 2] = value;
        d[i + 3] = 255;
      }

      seedRef.current = s;
      ctx.putImageData(img, 0, 0);
      drawScanlines();

      if (tint) {
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, width, height);
      }
    };

    const drawBarsFrame = () => {
      if (width <= 0 || height <= 0) return;
      const barWidth = Math.max(1, Math.ceil(width / BARS.length));
      const drift = Math.floor(Math.sin(performance.now() * 0.012) * 2.5);
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < BARS.length; i += 1) {
        ctx.fillStyle = BARS[i];
        ctx.fillRect(i * barWidth + drift, 0, barWidth + 1, height);
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const loop = () => {
      if (active) {
        if (mode === "bars") drawBarsFrame();
        else drawStaticFrame();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    if (!active) ctx.clearRect(0, 0, width, height);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, mode, intensity, tint]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{ opacity: active ? 1 : 0 }}
    />
  );
};

export default TVStaticOverlay;
