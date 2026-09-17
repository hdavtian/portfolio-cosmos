import { useEffect, useRef, useState } from "react";

interface HoloImageProps {
  src: string;
  className?: string;
}

// Port of the Career Gallery tile shader (cosmos/careerGallery/CareerGallery.ts):
// cyan hologram tint, RGB split, horizontal slice jitter, scanlines, flicker,
// static and a glowing edge. Tuned jitterier: a constant low glitch with random
// bursts and the occasional torn band, plus a noisy reveal from the left.
const VERTEX = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

const FRAGMENT = `
  precision mediump float;
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uGlitch;
  uniform float uReveal;
  uniform float uImgAspect;
  uniform float uBoxAspect;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Cover-fit, anchored to the top so page screenshots keep their header.
  vec2 coverUv(vec2 uv) {
    vec2 s = vec2(1.0);
    if (uImgAspect > uBoxAspect) s.x = uBoxAspect / uImgAspect;
    else s.y = uImgAspect / uBoxAspect;
    return vec2((uv.x - 0.5) * s.x + 0.5, (1.0 - uv.y) * s.y);
  }

  vec3 sampleSplit(vec2 uv, float shift) {
    vec2 c = coverUv(uv);
    return vec3(
      texture2D(uTex, c + vec2(shift, 0.0)).r,
      texture2D(uTex, c).g,
      texture2D(uTex, c - vec2(shift, 0.0)).b
    );
  }

  void main() {
    float t = uTime;
    float g = uGlitch;
    vec3 tint = vec3(0.55, 0.9, 1.0);

    float slice = floor(vUv.y * 38.0);
    float jitter = (hash(vec2(slice, floor(t * 24.0))) - 0.5) * 0.08 * g;
    // Now and then a wider band tears sideways.
    float bandRow = floor(vUv.y * 9.0);
    float tear = step(0.9, hash(vec2(bandRow, floor(t * 11.0)))) *
      (hash(vec2(floor(t * 11.0), bandRow + 3.0)) - 0.5) * 0.14 * g;
    vec2 uv = vec2(vUv.x + jitter + tear, vUv.y);

    vec3 col = sampleSplit(uv, 0.0018 + 0.016 * g);

    float scanDepth = 0.08 + 0.22 * g;
    float scan = (1.0 - scanDepth) + scanDepth * sin(vUv.y * 260.0 + t * 4.0);
    col = mix(col, col * tint + tint * 0.04, 0.22 + 0.3 * g) * scan;
    col *= 1.0 - 0.07 * hash(vec2(floor(t * 12.0), 1.0));
    col += tint * hash(vUv * vec2(420.0, 260.0) + floor(t * 30.0)) * (0.05 + 0.16 * g);

    float edge = min(min(vUv.x, 1.0 - vUv.x) * uBoxAspect, min(vUv.y, 1.0 - vUv.y));
    col += tint * (1.0 - smoothstep(0.0, 0.012, edge)) * (0.45 + 0.3 * g);

    // Reveal from the left with a noisy, glowing hologram front.
    float front = uReveal * 1.12 - vUv.x - (hash(vec2(floor(vUv.y * 60.0), floor(t * 20.0))) - 0.5) * 0.08;
    float alpha = smoothstep(0.0, 0.025, front);
    col += tint * (1.0 - smoothstep(0.0, 0.05, abs(front))) * 0.9 * (1.0 - step(0.999, uReveal));

    gl_FragColor = vec4(min(col, vec3(1.0)) * alpha, alpha);
  }
`;

const REVEAL_MS = 520;

const compile = (gl: WebGLRenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

/**
 * An image rendered as a jittery hologram. Falls back to a plain image with a
 * CSS sheen when WebGL or the image (CORS) is unavailable.
 */
export function HoloImage({ src, className = "" }: HoloImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true });
    if (!gl) {
      setFallback(true);
      return;
    }

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) {
      setFallback(true);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFallback(true);
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const uTime = uniform("uTime");
    const uGlitch = uniform("uGlitch");
    const uReveal = uniform("uReveal");
    const uImgAspect = uniform("uImgAspect");
    const uBoxAspect = uniform("uBoxAspect");

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let disposed = false;
    let loaded = false;
    let started = 0;
    let glitch = 0.35;
    let nextBurstAt = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth, clientHeight } = canvas;
      canvas.width = Math.max(1, Math.round(clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uBoxAspect, clientWidth / Math.max(1, clientHeight));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const render = (now: number) => {
      if (disposed || !loaded) return;
      if (!started) started = now;
      const elapsed = now - started;
      // A constant low glitch, with bursts every 0.4-1.4 s that decay quickly.
      if (!reduceMotion && now >= nextBurstAt) {
        glitch = 0.75 + Math.random() * 0.25;
        nextBurstAt = now + 400 + Math.random() * 1000;
      }
      glitch += ((reduceMotion ? 0.12 : 0.32) - glitch) * 0.16;
      gl.uniform1f(uTime, reduceMotion ? 0 : now / 1000);
      gl.uniform1f(uGlitch, glitch);
      gl.uniform1f(uReveal, reduceMotion ? 1 : Math.min(1, elapsed / REVEAL_MS));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!reduceMotion || elapsed < REVEAL_MS) frame = requestAnimationFrame(render);
    };

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      if (disposed) return;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      } catch {
        setFallback(true);
        return;
      }
      gl.uniform1f(uImgAspect, image.naturalWidth / Math.max(1, image.naturalHeight));
      loaded = true;
      frame = requestAnimationFrame(render);
    };
    image.onerror = () => {
      if (!disposed) setFallback(true);
    };
    image.src = src;

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [src]);

  return (
    <span className={`showcase-holo-image${fallback ? " showcase-holo-image--fallback" : ""} ${className}`}>
      {fallback ? (
        <img src={src} alt="" loading="lazy" decoding="async" />
      ) : (
        <canvas ref={canvasRef} className="showcase-holo-image__canvas" />
      )}
    </span>
  );
}
