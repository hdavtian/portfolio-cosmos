import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import type CameraControls from "camera-controls";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  captureFlyoverAnchor,
  flyoverDirection,
  flyoverDistanceAt,
  flyoverDuration,
  flyoverStartPoint,
  type FlyoverAnchor,
  type FlyoverSpec,
  type StarDestroyerMoments,
} from "../starDestroyerMoments";

/**
 * On-screen configurator for the Star Destroyer fly-over.
 *
 * Shows the real Destroyer (true size) on its path line, a small axis at the
 * start point, a marker at the hull's center and a draggable 3D handle (move
 * = start position, rotate = direction), with +/−/typed controls for every
 * setting, a play/rewind scrubber, named presets saved to localStorage
 * ("default" is the built-in one and read-only) and JSON export.
 *
 * The intro records its real camera view when its fly-over starts; "Go to
 * intro view" snaps there so tuning matches what visitors see.
 *
 * Self-contained: to remove it, delete this folder and the lines marked
 * "SD configurator" in ResumeSpace3D.tsx.
 */

const STORAGE_KEY = "sdFlyoverConfigurator.v1";
const INTRO_VIEW_KEY = "sdFlyoverConfigurator.introView.v1";
const DEFAULT_NAME = "default";

type Stored = {
  presets: Record<string, FlyoverSpec>;
  selected: string;
  open: boolean;
};

type IntroView = { position: [number, number, number]; target: [number, number, number] };

const readStored = (): Stored => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>;
      return {
        presets: parsed.presets && typeof parsed.presets === "object" ? parsed.presets : {},
        selected: typeof parsed.selected === "string" ? parsed.selected : DEFAULT_NAME,
        open: !!parsed.open,
      };
    }
  } catch {
    // Unavailable or corrupt storage: start fresh.
  }
  return { presets: {}, selected: DEFAULT_NAME, open: false };
};

const writeStored = (stored: Stored) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked: settings just won't persist.
  }
};

/** Whether the configurator was left open (so it reopens after a refresh). */
export const readSdConfiguratorOpen = (): boolean => readStored().open;
export const writeSdConfiguratorOpen = (open: boolean): void => {
  writeStored({ ...readStored(), open });
};

/** Called by the intro when its fly-over starts: the real, settled camera view. */
export const recordSdIntroView = (position: THREE.Vector3, target: THREE.Vector3): void => {
  try {
    const view: IntroView = {
      position: [position.x, position.y, position.z],
      target: [target.x, target.y, target.z],
    };
    window.localStorage.setItem(INTRO_VIEW_KEY, JSON.stringify(view));
  } catch {
    // Storage blocked: "Go to intro view" just won't be available.
  }
};

const readIntroView = (): IntroView | null => {
  try {
    const raw = window.localStorage.getItem(INTRO_VIEW_KEY);
    if (!raw) return null;
    const view = JSON.parse(raw) as IntroView;
    return Array.isArray(view.position) && Array.isArray(view.target) ? view : null;
  } catch {
    return null;
  }
};

const FIELDS: Array<{ key: keyof FlyoverSpec; label: string; step: number; unit: string }> = [
  { key: "startRight", label: "Start right (−left)", step: 0.25, unit: "u" },
  { key: "startUp", label: "Start up (−down)", step: 0.25, unit: "u" },
  { key: "startForward", label: "Start forward", step: 0.5, unit: "u" },
  { key: "yawLeftDeg", label: "Angle left (−right)", step: 1, unit: "°" },
  { key: "pitchDownDeg", label: "Angle down (−up)", step: 0.5, unit: "°" },
  { key: "bankDeg", label: "Bank / roll", step: 0.5, unit: "°" },
  { key: "lineLength", label: "Line length", step: 5, unit: "u" },
  { key: "crawlDistance", label: "Crawl distance", step: 1, unit: "u" },
  { key: "crawlSeconds", label: "Crawl time", step: 0.5, unit: "s" },
  { key: "exitSeconds", label: "Exit time", step: 0.5, unit: "s" },
];

const RATES = [0.25, 0.5, 1, 2, 4];
const NEG_Z = new THREE.Vector3(0, 0, -1);

type GizmoMode = "translate" | "rotate" | "off";

const round = (value: number, digits = 3) => Number(value.toFixed(digits));

type Props = {
  scene: THREE.Scene;
  getCamera: () => THREE.Camera | undefined;
  getControls: () => CameraControls | undefined;
  getDomElement: () => HTMLElement | undefined;
  getMoments: () => StarDestroyerMoments | null;
  /** Called every frame while open: pause the follow camera / idle sway. */
  freezeCamera: () => void;
  /** Called on close: restore the follow camera. */
  releaseCamera: () => void;
  onClose: () => void;
};

export function SdFlyoverConfigurator({
  scene,
  getCamera,
  getControls,
  getDomElement,
  getMoments,
  freezeCamera,
  releaseCamera,
  onClose,
}: Props) {
  const [stored, setStored] = useState<Stored>(() => readStored());
  const [defaultSpec, setDefaultSpec] = useState<FlyoverSpec | null>(null);
  const [spec, setSpec] = useState<FlyoverSpec | null>(null);
  const [name, setName] = useState<string>(DEFAULT_NAME);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("translate");
  const [saveAsName, setSaveAsName] = useState("");
  const [status, setStatus] = useState("Waiting for the Star Destroyer…");
  const [exportText, setExportText] = useState<string | null>(null);

  const anchorRef = useRef<FlyoverAnchor | null>(null);
  const specRef = useRef<FlyoverSpec | null>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const rateRef = useRef(1);
  const gizmoModeRef = useRef<GizmoMode>("translate");
  const recaptureInFramesRef = useRef(0);
  specRef.current = spec;
  playingRef.current = playing;
  rateRef.current = rate;
  gizmoModeRef.current = gizmoMode;

  // Wait for the Destroyer, take it over for previewing, draw the helpers and
  // the drag handle, and run the preview loop.
  useEffect(() => {
    let raf = 0;
    let moments: StarDestroyerMoments | null = null;
    let lastUiSync = 0;
    let last = performance.now();
    let dragging = false;
    let suppressClicksUntil = 0;

    const helpers = new THREE.Group();
    helpers.name = "SdConfiguratorHelpers";
    const arrow = new THREE.ArrowHelper(NEG_Z.clone(), new THREE.Vector3(), 1, 0x33ff88);
    const axes = new THREE.AxesHelper(1);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffdd33, depthTest: false, transparent: true }),
    );
    for (const object of [arrow.line, arrow.cone, axes, marker]) {
      const material = (object as THREE.Mesh).material as THREE.Material;
      material.depthTest = false;
      material.transparent = true;
      object.renderOrder = 1000;
    }
    helpers.add(arrow, axes, marker);
    helpers.visible = false;
    scene.add(helpers);

    // Drag handle at the start point (move = start, rotate = direction).
    const handle = new THREE.Object3D();
    handle.name = "SdConfiguratorHandle";
    scene.add(handle);
    let gizmo: TransformControls | null = null;
    let gizmoHelper: THREE.Object3D | null = null;

    // A click right after a drag must not reach the scene (navigation).
    const swallowClick = (event: MouseEvent) => {
      if (performance.now() < suppressClicksUntil) {
        event.stopPropagation();
        event.preventDefault();
      }
    };
    window.addEventListener("click", swallowClick, true);

    const applySpecFromHandle = () => {
      const anchor = anchorRef.current;
      const current = specRef.current;
      if (!anchor || !current) return;
      let next: FlyoverSpec;
      if (gizmoModeRef.current === "rotate") {
        const direction = NEG_Z.clone().applyQuaternion(handle.quaternion).normalize();
        const horizontal = new THREE.Vector3(direction.x, 0, direction.z);
        if (horizontal.lengthSq() < 1e-8) return;
        horizontal.normalize();
        const yaw = Math.atan2(-horizontal.dot(anchor.right), horizontal.dot(anchor.forward));
        const pitch = Math.asin(THREE.MathUtils.clamp(-direction.y, -1, 1));
        next = {
          ...current,
          yawLeftDeg: round(THREE.MathUtils.radToDeg(yaw), 2),
          pitchDownDeg: round(THREE.MathUtils.radToDeg(pitch), 2),
        };
      } else {
        const relative = handle.position.clone().sub(anchor.origin);
        next = {
          ...current,
          startRight: round(relative.dot(anchor.right)),
          startUp: round(relative.dot(anchor.up)),
          startForward: round(relative.dot(anchor.forward)),
        };
      }
      specRef.current = next;
      setSpec(next);
    };

    const start = new THREE.Vector3();
    const direction = new THREE.Vector3();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.max(0, (now - last) / 1000);
      last = now;
      freezeCamera();

      const camera = getCamera();
      if (!moments) {
        const found = getMoments();
        if (!found || !camera) return;
        if (found.isActive()) found.park();
        moments = found;
        moments.beginPreview();
        anchorRef.current = captureFlyoverAnchor(camera);
        const builtIn = moments.getDefaultFlyoverSpec(camera);
        setDefaultSpec(builtIn);
        const current = readStored();
        const preset = current.selected !== DEFAULT_NAME ? current.presets[current.selected] : undefined;
        setName(preset ? current.selected : DEFAULT_NAME);
        const initial = { ...(preset ?? builtIn) };
        specRef.current = initial;
        setSpec(initial);
        setStatus(preset ? `Loaded "${current.selected}"` : "Loaded default");

        const dom = getDomElement();
        if (dom) {
          gizmo = new TransformControls(camera, dom);
          gizmo.setSpace("world");
          gizmo.setSize(0.9);
          gizmo.attach(handle);
          gizmo.addEventListener("dragging-changed", (event) => {
            dragging = !!(event as unknown as { value: boolean }).value;
            const controls = getControls();
            if (controls) controls.enabled = !dragging;
            if (!dragging) suppressClicksUntil = performance.now() + 250;
          });
          gizmo.addEventListener("objectChange", applySpecFromHandle);
          gizmoHelper = gizmo.getHelper();
          scene.add(gizmoHelper);
        }
        return;
      }

      // "Go to intro view" / "Recapture": re-anchor once the camera has moved.
      if (recaptureInFramesRef.current > 0 && camera) {
        recaptureInFramesRef.current -= 1;
        if (recaptureInFramesRef.current === 0) anchorRef.current = captureFlyoverAnchor(camera);
      }

      const anchor = anchorRef.current;
      const currentSpec = specRef.current;
      if (!anchor || !currentSpec) return;

      const duration = flyoverDuration(currentSpec);
      if (playingRef.current) {
        timeRef.current += dt * rateRef.current;
        if (timeRef.current >= duration) {
          timeRef.current = duration;
          setPlaying(false);
        }
      }
      moments.posePreview(anchor, currentSpec, timeRef.current);

      // Line from start to end, axis at the start, marker at the hull center.
      const hull = moments.getHullLength();
      flyoverStartPoint(anchor, currentSpec, start);
      flyoverDirection(anchor, currentSpec, direction);
      arrow.position.copy(start);
      arrow.setDirection(direction);
      const lineLength = Math.max(0.01, currentSpec.lineLength);
      arrow.setLength(lineLength, Math.min(lineLength * 0.3, hull * 0.35), hull * 0.12);
      axes.position.copy(start);
      axes.scale.setScalar(hull * 0.3);
      marker.position.copy(start).addScaledVector(direction, flyoverDistanceAt(currentSpec, timeRef.current));
      marker.scale.setScalar(hull * 0.025);
      helpers.visible = true;

      if (gizmo) {
        const mode = gizmoModeRef.current;
        const enabled = mode !== "off";
        gizmo.enabled = enabled;
        if (gizmoHelper) gizmoHelper.visible = enabled;
        if (enabled && gizmo.mode !== mode) gizmo.setMode(mode);
        if (!dragging) {
          handle.position.copy(start);
          handle.quaternion.setFromUnitVectors(NEG_Z, direction);
          handle.updateMatrixWorld(true);
        }
      }

      if (now - lastUiSync > 80) {
        lastUiSync = now;
        setTime(timeRef.current);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("click", swallowClick, true);
      const controls = getControls();
      if (controls) controls.enabled = true;
      if (gizmo) {
        gizmo.detach();
        gizmoHelper?.removeFromParent();
        gizmo.dispose();
      }
      handle.removeFromParent();
      moments?.endPreview();
      helpers.removeFromParent();
      arrow.dispose();
      axes.dispose();
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
      releaseCamera();
    };
  }, [scene, getCamera, getControls, getDomElement, getMoments, freezeCamera, releaseCamera]);

  const persist = (next: Stored) => {
    setStored(next);
    writeStored(next);
  };

  const updateField = (key: keyof FlyoverSpec, value: number) => {
    if (!spec || !Number.isFinite(value)) return;
    const next = { ...spec, [key]: round(value) };
    specRef.current = next;
    setSpec(next);
  };

  const loadSpec = (next: FlyoverSpec) => {
    const copy = { ...next };
    specRef.current = copy;
    setSpec(copy);
  };

  const selectPreset = (nextName: string) => {
    const nextSpec = nextName === DEFAULT_NAME ? defaultSpec : stored.presets[nextName];
    if (!nextSpec) return;
    setName(nextName);
    loadSpec(nextSpec);
    persist({ ...stored, selected: nextName });
    setStatus(`Loaded "${nextName}"`);
  };

  const save = () => {
    if (!spec) return;
    if (name === DEFAULT_NAME) {
      setStatus('"default" is built in. Use Save as… to keep your changes.');
      return;
    }
    persist({ ...stored, presets: { ...stored.presets, [name]: spec }, selected: name });
    setStatus(`Saved "${name}"`);
  };

  const saveAs = () => {
    const newName = saveAsName.trim();
    if (!spec || !newName) {
      setStatus("Type a name first.");
      return;
    }
    if (newName === DEFAULT_NAME) {
      setStatus('"default" is reserved.');
      return;
    }
    persist({ ...stored, presets: { ...stored.presets, [newName]: spec }, selected: newName });
    setName(newName);
    setSaveAsName("");
    setStatus(`Saved as "${newName}"`);
  };

  const remove = () => {
    if (name === DEFAULT_NAME) return;
    const presets = { ...stored.presets };
    delete presets[name];
    persist({ ...stored, presets, selected: DEFAULT_NAME });
    setName(DEFAULT_NAME);
    if (defaultSpec) loadSpec(defaultSpec);
    setStatus(`Deleted "${name}"`);
  };

  const revert = () => {
    const saved = name === DEFAULT_NAME ? defaultSpec : stored.presets[name];
    if (saved) loadSpec(saved);
    setStatus(`Reverted to saved "${name}"`);
  };

  const exportJson = () => {
    if (!spec) return;
    const text = JSON.stringify({ name, ...spec }, null, 2);
    setExportText(text);
    navigator.clipboard?.writeText(text).then(
      () => setStatus("Copied JSON to the clipboard"),
      () => setStatus("Copy failed — select the text below"),
    );
  };

  const recapture = () => {
    recaptureInFramesRef.current = 1;
    setStatus("Line re-anchored to the current view");
  };

  const goToIntroView = () => {
    const view = readIntroView();
    const controls = getControls();
    if (!view) {
      setStatus("No intro view recorded yet: reload and let the intro play until the SD appears once.");
      return;
    }
    if (!controls) return;
    controls.setLookAt(...view.position, ...view.target, false);
    // Re-anchor after the camera has taken the new pose.
    recaptureInFramesRef.current = 3;
    setStatus("At the intro view; line anchored to it");
  };

  const setScrub = (value: number) => {
    timeRef.current = value;
    setTime(value);
    setPlaying(false);
  };

  const duration = spec ? flyoverDuration(spec) : 0;
  const presetNames = [DEFAULT_NAME, ...Object.keys(stored.presets).filter((n) => n !== DEFAULT_NAME)];

  return (
    <div
      style={panelStyle}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <strong style={{ flex: 1, letterSpacing: 1 }}>SD FLY-OVER CONFIGURATOR</strong>
        <button style={buttonStyle} onClick={onClose}>
          Close
        </button>
      </div>

      <div style={rowStyle}>
        <button style={{ ...buttonStyle, flex: 1 }} onClick={goToIntroView}>
          Go to intro view
        </button>
        <button style={buttonStyle} onClick={recapture}>
          Recapture view
        </button>
      </div>

      <div style={rowStyle}>
        <select style={{ ...inputStyle, flex: 1 }} value={name} onChange={(e) => selectPreset(e.target.value)}>
          {presetNames.map((presetName) => (
            <option key={presetName} value={presetName}>
              {presetName}
            </option>
          ))}
        </select>
        <button style={buttonStyle} onClick={save}>
          Save
        </button>
        <button style={buttonStyle} onClick={revert}>
          Revert
        </button>
        <button style={buttonStyle} onClick={remove} disabled={name === DEFAULT_NAME}>
          Delete
        </button>
      </div>
      <div style={rowStyle}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="New preset name"
          value={saveAsName}
          onChange={(e) => setSaveAsName(e.target.value)}
        />
        <button style={buttonStyle} onClick={saveAs}>
          Save as…
        </button>
        <button style={buttonStyle} onClick={exportJson}>
          Export
        </button>
      </div>

      <div style={rowStyle}>
        <span style={{ flex: 1, opacity: 0.85 }}>3D handle</span>
        {(["translate", "rotate", "off"] as GizmoMode[]).map((mode) => (
          <button
            key={mode}
            style={{
              ...buttonStyle,
              background: gizmoMode === mode ? "rgba(60, 130, 90, 0.95)" : buttonStyle.background,
            }}
            onClick={() => setGizmoMode(mode)}
          >
            {mode === "translate" ? "Move start" : mode === "rotate" ? "Rotate angle" : "Off"}
          </button>
        ))}
      </div>

      {spec &&
        FIELDS.map((field) => (
          <div key={field.key} style={rowStyle}>
            <span style={{ flex: 1, opacity: 0.85 }}>{field.label}</span>
            <button style={smallButtonStyle} onClick={() => updateField(field.key, spec[field.key] - field.step)}>
              −
            </button>
            <input
              style={{ ...inputStyle, width: 74, textAlign: "right" }}
              type="number"
              step={field.step}
              value={spec[field.key]}
              onChange={(e) => updateField(field.key, parseFloat(e.target.value))}
            />
            <button style={smallButtonStyle} onClick={() => updateField(field.key, spec[field.key] + field.step)}>
              +
            </button>
            <span style={{ width: 12, opacity: 0.6 }}>{field.unit}</span>
          </div>
        ))}

      <div style={{ ...rowStyle, marginTop: 8 }}>
        <button style={buttonStyle} onClick={() => setScrub(0)}>
          ⏮
        </button>
        <button
          style={buttonStyle}
          onClick={() => {
            if (!playing && timeRef.current >= duration) timeRef.current = 0;
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <select style={inputStyle} value={rate} onChange={(e) => setRate(parseFloat(e.target.value))}>
          {RATES.map((value) => (
            <option key={value} value={value}>
              {value}×
            </option>
          ))}
        </select>
        <span style={{ flex: 1, textAlign: "right", opacity: 0.8 }}>
          {time.toFixed(1)} / {duration.toFixed(1)} s
        </span>
      </div>
      <input
        style={{ width: "100%" }}
        type="range"
        min={0}
        max={Math.max(0.01, duration)}
        step={0.01}
        value={Math.min(time, duration)}
        onChange={(e) => setScrub(parseFloat(e.target.value))}
      />

      <div style={{ fontSize: 12, opacity: 0.8, margin: "6px 0" }}>{status}</div>
      <div style={{ fontSize: 11, opacity: 0.6, lineHeight: 1.35 }}>
        The follow camera is paused while this is open. Drag the handle's arrows to move the start (or rotate
        it in Rotate mode). Axis: red = world X, green = up, blue = world Z. Green arrow = path, yellow dot = hull
        center.
      </div>

      {exportText && (
        <textarea
          readOnly
          style={{ ...inputStyle, width: "100%", height: 150, marginTop: 6, fontFamily: "monospace", fontSize: 11 }}
          value={exportText}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}

const panelStyle: CSSProperties = {
  position: "fixed",
  left: 16,
  bottom: 16,
  width: 380,
  maxWidth: "calc(100vw - 32px)",
  maxHeight: "74vh",
  overflowY: "auto",
  zIndex: 1300,
  padding: 12,
  borderRadius: 10,
  border: "1px solid rgba(120, 220, 255, 0.5)",
  background: "rgba(6, 14, 28, 0.92)",
  color: "#dff3ff",
  fontFamily: "'Rajdhani', sans-serif",
  fontSize: 14,
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginBottom: 5,
};

const buttonStyle: CSSProperties = {
  padding: "3px 8px",
  borderRadius: 6,
  border: "1px solid rgba(145, 232, 255, 0.55)",
  background: "rgba(20, 40, 70, 0.9)",
  color: "#dff3ff",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 13,
};

const smallButtonStyle: CSSProperties = { ...buttonStyle, width: 26, padding: "2px 0" };

const inputStyle: CSSProperties = {
  padding: "3px 6px",
  borderRadius: 6,
  border: "1px solid rgba(145, 232, 255, 0.4)",
  background: "rgba(2, 8, 18, 0.9)",
  color: "#dff3ff",
  fontFamily: "inherit",
  fontSize: 13,
};
