import { trackEvent } from "../lib/analytics";
import "./DiagramSettings.scss";

export type DiagramStyle =
  | "circles"
  | "constellation"
  | "circuit"
  | "rings"
  | "tree"
  | "neural"
  | "space"; // 3D Solar System

export interface DiagramStyleOptions {
  // Circle style options
  nodeSpacing?: number;
  glowIntensity?: number;
  parentSpacing?: number;

  // Constellation options (includes galaxy features)
  twinkleSpeed?: number;
  constellationZoom?: number;
  nebula?: number;
  constellationColor?: string;
  starSize?: number;
  shootingStarFrequency?: number;

  // Circuit board options
  circuitComplexity?: number;
  traceWidth?: number;
  circuitColor?: string;
  cpuSize?: number;
  chipSize?: number;

  // Ring options
  ringCount?: number;
  ringSpacing?: number;

  // Tree options
  branchAngle?: number;
  leafDensity?: number;

  // Neural options
  pulseSpeed?: number;
  connectionDensity?: number;

  // Space options
  spaceOrbitSpeed?: number;
  spaceMoonOrbitSpeed?: number;
  spaceMoonSpinSpeed?: number;
  spaceShowLabels?: boolean;
  spaceSunIntensity?: number;
  spaceShowOrbits?: boolean;
  spaceSunColor?: string;
  spaceTintSunMesh?: boolean;
  spaceFollowDistance?: number;
  spaceFollowHeight?: number;
  spaceCameraSmoothTime?: number;
  spaceNavCameraBehind?: number;
  spaceNavCameraHeight?: number;
  spaceMoonNavMaxSpeed?: number;
  spaceMoonNavTurboSpeed?: number;
  spaceMoonNavTurboThreshold?: number;
  spaceTravelSpeed?: number;
}

interface DiagramSettingsProps {
  currentStyle: DiagramStyle;
  options: DiagramStyleOptions;
  onStyleChange: (style: DiagramStyle) => void;
  onOptionsChange: (options: DiagramStyleOptions) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const styleDescriptions: Record<DiagramStyle, string> = {
  circles: "Classic circles with lines - clean and elegant",
  constellation: "Cosmic space theme with stars, nebulas, and spiral arms",
  circuit: "Tech-inspired circuit board design",
  rings: "Concentric rings orbiting the center",
  tree: "Organic tree structure with branches",
  neural: "Neural network with pulsing connections",
  space: "A fully 3D interactive solar system exploration",
};

export default function DiagramSettings({
  currentStyle,
  options,
  onStyleChange,
  onOptionsChange,
  isOpen,
  onToggle,
}: DiagramSettingsProps) {
  const handleSliderChange = (
    key: keyof DiagramStyleOptions,
    value: number | string,
  ) => {
    onOptionsChange({ ...options, [key]: value });
  };

  const getStyleOptions = (style: DiagramStyle) => {
    switch (style) {
      case "circles":
        return (
          <>
            <div className="setting-item">
              <label>Parent Spacing: {options.parentSpacing || 180}</label>
              <input
                type="range"
                min="100"
                max="300"
                value={options.parentSpacing || 180}
                onChange={(e) =>
                  handleSliderChange("parentSpacing", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>Child Spacing: {options.nodeSpacing || 100}</label>
              <input
                type="range"
                min="50"
                max="200"
                value={options.nodeSpacing || 100}
                onChange={(e) =>
                  handleSliderChange("nodeSpacing", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>Glow Intensity: {options.glowIntensity || 5}</label>
              <input
                type="range"
                min="0"
                max="20"
                value={options.glowIntensity || 5}
                onChange={(e) =>
                  handleSliderChange("glowIntensity", Number(e.target.value))
                }
              />
            </div>
          </>
        );

      case "constellation":
        return (
          <>
            <div className="setting-item">
              <label>Zoom Level: {options.constellationZoom || 100}%</label>
              <input
                type="range"
                min="50"
                max="200"
                value={options.constellationZoom || 100}
                onChange={(e) =>
                  handleSliderChange(
                    "constellationZoom",
                    Number(e.target.value),
                  )
                }
              />
            </div>
            <div className="setting-item">
              <label>Star Size: {options.starSize || 100}%</label>
              <input
                type="range"
                min="50"
                max="200"
                value={options.starSize || 100}
                onChange={(e) =>
                  handleSliderChange("starSize", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>Nebula: {options.nebula || 50}</label>
              <input
                type="range"
                min="10"
                max="100"
                value={options.nebula || 50}
                onChange={(e) =>
                  handleSliderChange("nebula", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>Twinkle Speed: {options.twinkleSpeed || 3}</label>
              <input
                type="range"
                min="1"
                max="10"
                value={options.twinkleSpeed || 3}
                onChange={(e) =>
                  handleSliderChange("twinkleSpeed", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>
                Shooting Stars: {options.shootingStarFrequency || 3}
              </label>
              <input
                type="range"
                min="0"
                max="10"
                value={options.shootingStarFrequency || 3}
                onChange={(e) =>
                  handleSliderChange(
                    "shootingStarFrequency",
                    Number(e.target.value),
                  )
                }
              />
            </div>
          </>
        );

      case "circuit":
        return (
          <>
            <div className="setting-item">
              <label>
                Circuit Complexity: {options.circuitComplexity || 50}
              </label>
              <input
                type="range"
                min="10"
                max="100"
                value={options.circuitComplexity || 50}
                onChange={(e) =>
                  handleSliderChange(
                    "circuitComplexity",
                    Number(e.target.value),
                  )
                }
              />
            </div>
            <div className="setting-item">
              <label>Trace Width: {options.traceWidth || 3}</label>
              <input
                type="range"
                min="1"
                max="8"
                value={options.traceWidth || 3}
                onChange={(e) =>
                  handleSliderChange("traceWidth", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>Pulse Rate: {options.pulseSpeed || 3}</label>
              <input
                type="range"
                min="1"
                max="10"
                value={options.pulseSpeed || 3}
                onChange={(e) =>
                  handleSliderChange("pulseSpeed", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>CPU Size: {options.cpuSize || 80}</label>
              <input
                type="range"
                min="40"
                max="180"
                value={options.cpuSize || 80}
                onChange={(e) =>
                  handleSliderChange("cpuSize", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>Chip Size: {options.chipSize || 100}</label>
              <input
                type="range"
                min="40"
                max="200"
                value={options.chipSize || 100}
                onChange={(e) =>
                  handleSliderChange("chipSize", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>Circuit Color</label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  "#d4af37",
                  "#4a9eff",
                  "#ff6b6b",
                  "#50fa7b",
                  "#bd93f9",
                  "#ffb86c",
                ].map((color) => (
                  <button
                    key={color}
                    onClick={() => handleSliderChange("circuitColor", color)}
                    style={{
                      width: "30px",
                      height: "30px",
                      backgroundColor: color,
                      border:
                        options.circuitColor === color
                          ? "3px solid white"
                          : "1px solid rgba(255,255,255,0.3)",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        );

      case "rings":
        return (
          <>
            <div className="setting-item">
              <label>Ring Count: {options.ringCount || 3}</label>
              <input
                type="range"
                min="2"
                max="5"
                value={options.ringCount || 3}
                onChange={(e) =>
                  handleSliderChange("ringCount", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>Ring Spacing: {options.ringSpacing || 80}</label>
              <input
                type="range"
                min="50"
                max="150"
                value={options.ringSpacing || 80}
                onChange={(e) =>
                  handleSliderChange("ringSpacing", Number(e.target.value))
                }
              />
            </div>
          </>
        );

      case "tree":
        return (
          <>
            <div className="setting-item">
              <label>Branch Angle: {options.branchAngle || 45}°</label>
              <input
                type="range"
                min="20"
                max="80"
                value={options.branchAngle || 45}
                onChange={(e) =>
                  handleSliderChange("branchAngle", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>Leaf Density: {options.leafDensity || 50}</label>
              <input
                type="range"
                min="20"
                max="100"
                value={options.leafDensity || 50}
                onChange={(e) =>
                  handleSliderChange("leafDensity", Number(e.target.value))
                }
              />
            </div>
          </>
        );

      case "neural":
        return (
          <>
            <div className="setting-item">
              <label>Pulse Speed: {options.pulseSpeed || 2}</label>
              <input
                type="range"
                min="1"
                max="5"
                value={options.pulseSpeed || 2}
                onChange={(e) =>
                  handleSliderChange("pulseSpeed", Number(e.target.value))
                }
              />
            </div>
            <div className="setting-item">
              <label>
                Connection Density: {options.connectionDensity || 50}
              </label>
              <input
                type="range"
                min="20"
                max="100"
                value={options.connectionDensity || 50}
                onChange={(e) =>
                  handleSliderChange(
                    "connectionDensity",
                    Number(e.target.value),
                  )
                }
              />
            </div>
          </>
        );

      case "space":
        return (
          <div
            style={{
              padding: "12px",
              color: "#8a9199",
              fontSize: "13px",
              fontStyle: "italic",
            }}
          >
            Cosmos controls are available in the HUD panel →
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <button
        className="settings-toggle"
        onClick={() => {
          trackEvent("settings_toggle", { action: isOpen ? "close" : "open" });
          onToggle();
        }}
        title="Diagram Settings"
        style={{
          display: currentStyle === "space" ? "none" : "flex",
        }}
      >
        ⚙️
      </button>

      {isOpen && currentStyle !== "space" && (
        <div className="diagram-settings">
          <div className="settings-header">
            <h3>Diagram Style</h3>
            <button className="close-btn" onClick={onToggle}>
              ×
            </button>
          </div>

          <div className="style-selector">
            {(Object.keys(styleDescriptions) as DiagramStyle[]).map((style) => (
              <div key={style} className="style-option-wrapper">
                <div
                  className={`style-option ${
                    currentStyle === style ? "active" : ""
                  }`}
                  onClick={() => onStyleChange(style)}
                >
                  <div className="style-name">{style.toUpperCase()}</div>
                  <div className="style-description">
                    {styleDescriptions[style]}
                  </div>
                </div>
                {currentStyle === style && (
                  <div className="style-options-inline">
                    {getStyleOptions(style)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
