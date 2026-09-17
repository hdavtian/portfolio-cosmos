import { useEffect, useRef } from "react";

interface AtmosphereBackdropProps {
  /** Hex colour the terrain and fog drift towards (the active project's core). */
  tint: string;
}

// Rolling terrain in fog, drawn with one shader on one plane. It stays cheap on
// purpose: a backdrop behind type, not a scene to explore.
const VERTEX = /* glsl */ `
  uniform float uTime;
  varying float vHeight;
  varying float vDepth;

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash(i), f), dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
               mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p *= 2.02;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 pos = position;
    // The land drifts slowly towards the camera.
    vec2 terrainUv = pos.xy * 0.085 + vec2(0.0, uTime * 0.018);
    float h = fbm(terrainUv);
    // Ridges rise with distance so the horizon reads as mountains.
    float ridge = smoothstep(-4.0, 26.0, -pos.y);
    pos.z += h * (2.4 + ridge * 9.0) + ridge * 2.5;
    vHeight = h;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uTint;
  uniform vec3 uFog;
  varying float vHeight;
  varying float vDepth;

  void main() {
    vec3 low = uTint * 0.18;
    vec3 high = mix(uTint, vec3(0.92), 0.35) * 0.95;
    vec3 color = mix(low, high, smoothstep(-0.45, 0.6, vHeight));
    float fog = smoothstep(6.0, 58.0, vDepth);
    gl_FragColor = vec4(mix(color, uFog, fog), 1.0);
  }
`;

const toLinearRgb = (hex: string): [number, number, number] => {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [0.5, 0.52, 0.56];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * Full-screen WebGL atmosphere behind the showcase site. Three.js is loaded on
 * demand, animation pauses while the tab is hidden, and reduced-motion users get
 * a single still frame.
 */
export function AtmosphereBackdrop({ tint }: AtmosphereBackdropProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const targetTintRef = useRef(toLinearRgb(tint));

  useEffect(() => {
    targetTintRef.current = toLinearRgb(tint);
  }, [tint]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    void import("three").then((THREE) => {
      if (disposed) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
      camera.position.set(0, 5.5, 14);
      camera.lookAt(0, 3.2, -20);

      const start = toLinearRgb(tint);
      const uniforms = {
        uTime: { value: 0 },
        uTint: { value: new THREE.Vector3(...start) },
        uFog: { value: new THREE.Vector3(...start.map((c) => c * 0.55 + 0.08)) },
      };
      const geometry = new THREE.PlaneGeometry(90, 90, 180, 180);
      const material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms });
      const terrain = new THREE.Mesh(geometry, material);
      terrain.rotation.x = -Math.PI / 2;
      terrain.position.z = -18;
      scene.add(terrain);

      const resize = () => {
        const { clientWidth, clientHeight } = host;
        renderer.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / Math.max(1, clientHeight);
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();

      let frame = 0;
      let last = performance.now();
      const render = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        uniforms.uTime.value += dt;
        // Ease towards the requested tint so hovering feels like light shifting.
        const target = targetTintRef.current;
        const ease = 1 - Math.pow(0.02, dt);
        uniforms.uTint.value.lerp(new THREE.Vector3(...target), ease);
        uniforms.uFog.value.lerp(new THREE.Vector3(...target.map((c) => c * 0.55 + 0.08)), ease);
        renderer.setClearColor(new THREE.Color(uniforms.uFog.value.x, uniforms.uFog.value.y, uniforms.uFog.value.z));
        renderer.render(scene, camera);
        if (!reduceMotion) frame = requestAnimationFrame(render);
      };

      const onVisibility = () => {
        cancelAnimationFrame(frame);
        if (!document.hidden) {
          last = performance.now();
          frame = requestAnimationFrame(render);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      // Reduced motion: still re-render when the tint changes, without drifting.
      const tintPoll = reduceMotion
        ? window.setInterval(() => {
            uniforms.uTint.value.set(...targetTintRef.current);
            uniforms.uFog.value.set(...targetTintRef.current.map((c) => c * 0.55 + 0.08) as [number, number, number]);
            renderer.setClearColor(new THREE.Color(uniforms.uFog.value.x, uniforms.uFog.value.y, uniforms.uFog.value.z));
            renderer.render(scene, camera);
          }, 400)
        : 0;
      frame = requestAnimationFrame(render);

      cleanup = () => {
        cancelAnimationFrame(frame);
        window.clearInterval(tintPoll);
        document.removeEventListener("visibilitychange", onVisibility);
        observer.disconnect();
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
    // The scene is built once; tint changes flow through targetTintRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="showcase-backdrop" aria-hidden="true">
      <div ref={hostRef} className="showcase-backdrop__canvas" />
      <div className="showcase-backdrop__grain" />
      <div className="showcase-backdrop__shade" />
    </div>
  );
}
