import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import resumeData from "../data/resume.json";
import { type DiagramStyle, type DiagramStyleOptions } from "./DiagramSettings";
import ResumeSpace3D from "./cosmos/ResumeSpace3D";
import { immersiveColumnRigRef, type ImmersiveColumnRig, type ImmersiveColumnRigValues } from "./cosmos/ResumeSpace3D";

interface ResumeStructureDiagramProps {
  onNavigate: (section: number) => void;
  style: DiagramStyle;
  options: DiagramStyleOptions;
  onOptionsChange?: (options: DiagramStyleOptions) => void;
}

// Store node positions at module level to persist across component remounts
const savedNodePositions: {
  [key: string]: { x: number; y: number; fx: number | null; fy: number | null };
} = {};

type ColumnId = "left" | "center" | "right";

const IS_DEBUG_QUERY = (() => {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debug") === "true";
  } catch {
    return false;
  }
})();

function ImmersiveColumnRigPanel() {
  const [collapsed, setCollapsed] = useState(true);
  const [selected, setSelected] = useState<ColumnId>("center");
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const rig = immersiveColumnRigRef.current;
  if (rig) rig.activeColumn = selected;
  const vals: ImmersiveColumnRigValues = rig
    ? rig[selected]
    : { width: 3, height: 3, posX: 0, posY: 0, angleDeg: 0 };

  const update = (field: keyof ImmersiveColumnRigValues, value: number) => {
    if (!rig) return;
    rig[selected][field] = value;
    bump();
  };

  const exportToConsole = () => {
    if (!rig) {
      console.log("[Rig] No immersive column rig data available yet.");
      return;
    }
    const fmt = (v: ImmersiveColumnRigValues) => ({
      width: +v.width.toFixed(3),
      height: +v.height.toFixed(3),
      posX: +v.posX.toFixed(3),
      posY: +v.posY.toFixed(3),
      depth: +v.depth.toFixed(3),
      angleDeg: +v.angleDeg.toFixed(1),
      angleMultiplier: +v.angleMultiplier.toFixed(2),
    });
    const output = {
      left: fmt(rig.left),
      center: fmt(rig.center),
      right: fmt(rig.right),
    };
    console.log("=== IMMERSIVE COLUMN RIG EXPORT ===");
    console.log(JSON.stringify(output, null, 2));
    console.log("===================================");
  };

  const sliderRow = (
    label: string,
    field: keyof ImmersiveColumnRigValues,
    min: number,
    max: number,
    step: number,
  ) => (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11, color: "#b8e8ff", display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: "#7ad4ff" }}>{vals[field].toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={vals[field]}
        onChange={(e) => update(field, Number.parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );

  void tick;

  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 56,
        zIndex: 1300,
        padding: collapsed ? "6px 10px" : "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(145, 232, 255, 0.45)",
        background: "rgba(8, 18, 34, 0.92)",
        color: "#def5ff",
        fontFamily: "'Rajdhani', sans-serif",
        minWidth: collapsed ? 120 : 240,
        maxHeight: "70vh",
        overflowY: "auto",
      }}
    >
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          fontSize: 11,
          letterSpacing: 0.8,
          color: "#9fe3ff",
          cursor: "pointer",
          userSelect: "none",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>COLUMN RIG</span>
        <span style={{ fontSize: 10, color: "#6dc8e8" }}>
          {collapsed ? "\u25b6" : "\u25bc"}
        </span>
      </div>
      {!collapsed && (
        <>
          <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
            {(["left", "center", "right"] as ColumnId[]).map((col) => (
              <button
                key={col}
                onClick={() => setSelected(col)}
                style={{
                  flex: 1,
                  padding: "4px 0",
                  borderRadius: 6,
                  border: selected === col
                    ? "1px solid rgba(145, 232, 255, 0.9)"
                    : "1px solid rgba(145, 232, 255, 0.3)",
                  background: selected === col
                    ? "rgba(20, 58, 92, 0.84)"
                    : "rgba(8, 18, 34, 0.68)",
                  color: "#e8f7ff",
                  fontFamily: "'Rajdhani', sans-serif",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  textTransform: "capitalize",
                }}
              >
                {col}
              </button>
            ))}
          </div>

          {sliderRow("Width", "width", 0.5, 16, 0.1)}
          {sliderRow("Height", "height", 0.5, 12, 0.1)}
          {sliderRow("Pos X (lateral)", "posX", -12, 12, 0.05)}
          {sliderRow("Pos Y (vertical)", "posY", -8, 8, 0.05)}
          {sliderRow("Depth (toward cam)", "depth", -6, 6, 0.05)}
          {sliderRow("Angle (deg)", "angleDeg", -60, 60, 0.5)}
          {sliderRow("Angle Multiplier", "angleMultiplier", 0, 20, 0.1)}

          <button
            onClick={exportToConsole}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "6px 0",
              borderRadius: 7,
              border: "1px solid rgba(255, 210, 120, 0.6)",
              background: "rgba(40, 28, 10, 0.84)",
              color: "#ffe8c4",
              fontFamily: "'Rajdhani', sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Export to Console
          </button>
        </>
      )}
    </div>
  );
}

function ResumeStructureDiagram({
  onNavigate,
  style,
  options,
  onOptionsChange,
}: ResumeStructureDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [spaceReloadKey, setSpaceReloadKey] = useState(0);
  const [hallwayContentMode, setHallwayContentMode] = useState<
    "projects" | "about" | null
  >(null);
  const [projectShowcaseActive, setProjectShowcaseActive] = useState(false);

  useEffect(() => {
    // If style is "space", skip D3 rendering (handled by conditional return below)
    if (style === "space") return;

    const svg = svgRef.current;
    if (!svg) return;

    // Re-render when style or options change
    switch (style) {
      case "circles":
        renderCirclesStyle(svg, onNavigate, options);
        break;
      case "constellation":
        renderConstellationStyle(svg, onNavigate, options);
        break;
      case "circuit":
        renderCircuitStyle(svg, onNavigate, options);
        break;
      case "rings":
        renderRingsStyle(svg, onNavigate, options);
        break;
      case "tree":
        renderTreeStyle(svg, onNavigate, options);
        break;
      case "neural":
        renderNeuralStyle(svg, onNavigate, options);
        break;
      default:
        renderCirclesStyle(svg, onNavigate, options);
    }
  }, [onNavigate, style, options]);

  // If style is "space", return 3D component
  if (style === "space") {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {IS_DEBUG_QUERY && hallwayContentMode === "about" && projectShowcaseActive && (
          <ImmersiveColumnRigPanel />
        )}
        <button
          onClick={() => setSpaceReloadKey((prev) => prev + 1)}
          style={{
            position: "absolute",
            right: 16,
            bottom: 16,
            zIndex: 1300,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(145, 232, 255, 0.5)",
            background: "rgba(8, 18, 34, 0.86)",
            color: "#def5ff",
            fontFamily: "'Rajdhani', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Reload Universe
        </button>
        <ResumeSpace3D
          key={`space-reload-${spaceReloadKey}`}
          onNavigate={onNavigate}
          options={options}
          onOptionsChange={onOptionsChange}
          aboutHallDatasetOverride="experimental"
          aboutHallColumnAngleMultiplier={1}
          onHallwayContentModeChange={setHallwayContentMode}
          onProjectShowcaseActiveChange={setProjectShowcaseActive}
        />
      </div>
    );
  }

  return (
    <div className="hero__diagram-container">
      <svg ref={svgRef} className="hero__diagram-svg"></svg>
    </div>
  );
}

// ===== CIRCLES STYLE (Original) =====
function renderCirclesStyle(
  svg: SVGSVGElement,
  onNavigate: (section: number) => void,
  options: DiagramStyleOptions,
) {
  const width = 1000;
  const height = 500;

  // Clear previous content
  d3.select(svg).selectAll("*").remove();

  const svgSelection = d3
    .select(svg)
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = svgSelection
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .append("g");

  // Build node data structure
  interface Node extends d3.SimulationNodeDatum {
    id: string;
    type: "center" | "main" | "job";
    label: string;
    radius: number;
    sectionIndex?: number;
    jobIndex?: number;
  }

  interface Link extends d3.SimulationLinkDatum<Node> {
    source: string | Node;
    target: string | Node;
  }

  // Helper function to calculate text dimensions and required radius
  const calculateRadius = (
    label: string,
    type: "center" | "main" | "job",
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  ): number => {
    const baseFontSize = type === "center" ? 14 : type === "main" ? 11 : 9;
    const fontFamily =
      type === "center" || type === "main"
        ? "Cinzel, serif"
        : "Montserrat, sans-serif";
    const fontWeight =
      type === "center" ? "700" : type === "main" ? "600" : "400";
    const letterSpacing = type === "center" || type === "main" ? "0.1em" : "0";
    const padding = 12; // Padding inside circle

    // Create temporary text element for measurement
    const tempText = svg
      .append("text")
      .attr("font-size", `${baseFontSize}px`)
      .attr("font-family", fontFamily)
      .attr("font-weight", fontWeight)
      .attr("letter-spacing", letterSpacing)
      .style("visibility", "hidden");

    const words = label.split(/\s+/);
    const maxLineWidth = 120; // Maximum width before wrapping
    const lines: string[] = [];
    let currentLine = "";

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      tempText.text(testLine);
      const testWidth = (
        tempText.node() as SVGTextElement
      ).getComputedTextLength();

      if (testWidth > maxLineWidth && currentLine !== "") {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);

    // Measure actual line widths
    let maxWidth = 0;
    lines.forEach((line) => {
      tempText.text(line);
      const lineWidth = (
        tempText.node() as SVGTextElement
      ).getComputedTextLength();
      maxWidth = Math.max(maxWidth, lineWidth);
    });

    tempText.remove();

    // Calculate required radius based on text dimensions
    const lineHeight = baseFontSize * 1.2;
    const totalHeight = lines.length * lineHeight;

    // Radius needs to accommodate both width and height
    const requiredRadiusForWidth = maxWidth / 2 + padding;
    const requiredRadiusForHeight = totalHeight / 2 + padding;
    const calculatedRadius = Math.max(
      requiredRadiusForWidth,
      requiredRadiusForHeight,
    );

    // Set minimum radius based on node type
    const minRadius = type === "center" ? 45 : type === "main" ? 35 : 25;

    return Math.max(minRadius, calculatedRadius);
  };

  const nodes: Node[] = [
    {
      id: "center",
      type: "center",
      label: "HD",
      radius: 45,
      x: width / 2,
      y: height / 2,
      fx: width / 2,
      fy: height / 2,
      sectionIndex: 0,
    },
  ];

  const links: Link[] = [];

  // Add main section nodes
  const mainSections = [
    { id: "skills", label: "Skills", sectionIndex: 1 },
    { id: "experience", label: "Experience", sectionIndex: 2 },
    {
      id: "education",
      label: "Education",
      sectionIndex: 2 + resumeData.experience.length,
    },
  ];

  // Calculate max radius for main sections to ensure uniformity
  const mainRadii = mainSections.map((section) =>
    calculateRadius(section.label, "main", svgSelection),
  );
  const maxMainRadius = Math.max(...mainRadii);

  mainSections.forEach((section) => {
    nodes.push({
      id: section.id,
      type: "main",
      label: section.label,
      radius: maxMainRadius,
      sectionIndex: section.sectionIndex,
    });

    links.push({
      source: "center",
      target: section.id,
    });
  });

  // Calculate max radius for job nodes to ensure uniformity
  const jobRadii = resumeData.experience.map((job) => {
    const label = job.navLabel || job.company;
    return calculateRadius(label, "job", svgSelection);
  });
  const maxJobRadius = Math.max(...jobRadii);

  // Add job nodes connected to Experience
  resumeData.experience.forEach((job, index) => {
    const jobId = `job-${index}`;
    const label = job.navLabel || job.company;
    nodes.push({
      id: jobId,
      type: "job",
      label: label,
      radius: maxJobRadius,
      sectionIndex: 2 + index,
      jobIndex: index,
    });

    links.push({
      source: "experience",
      target: jobId,
    });
  });

  // Restore saved positions or set initial positions
  // Position main sections in a circle around center
  const mainSectionAngles = [
    { id: "skills", angle: -Math.PI / 2 }, // Top
    { id: "experience", angle: (5 * Math.PI) / 6 }, // Bottom left
    { id: "education", angle: Math.PI / 6 }, // Bottom right
  ];

  mainSectionAngles.forEach(({ id, angle }) => {
    const node = nodes.find((n) => n.id === id);
    if (node) {
      // Always use parentSpacing option to position main nodes
      const distance = options.parentSpacing || 180;
      node.x = width / 2 + Math.cos(angle) * distance;
      node.y = height / 2 + Math.sin(angle) * distance;
      node.fx = node.x;
      node.fy = node.y;

      // Update saved positions with new spacing
      savedNodePositions[id] = {
        x: node.x,
        y: node.y,
        fx: node.fx,
        fy: node.fy,
      };
    }
  });

  // Position job nodes in an organized arc around Experience
  const experienceNode = nodes.find((n) => n.id === "experience");
  if (experienceNode) {
    const jobNodes = nodes.filter((n) => n.type === "job");
    const jobCount = jobNodes.length;

    // Arrange jobs in an arc below Experience
    const arcStart = Math.PI / 4; // 45 degrees
    const arcEnd = (3 * Math.PI) / 4; // 135 degrees
    const arcSpan = arcEnd - arcStart;

    jobNodes.forEach((job, index) => {
      if (
        savedNodePositions[job.id] &&
        savedNodePositions[job.id].fx !== null
      ) {
        // Only restore if node was manually dragged (has fixed position)
        job.x = savedNodePositions[job.id].x;
        job.y = savedNodePositions[job.id].y;
        job.fx = savedNodePositions[job.id].fx;
        job.fy = savedNodePositions[job.id].fy;
      } else {
        // Set initial position, let simulation arrange them
        const angle = arcStart + (arcSpan / (jobCount - 1 || 1)) * index;
        const distance = options.nodeSpacing || 100;
        job.x = experienceNode.x! + Math.cos(angle) * distance;
        job.y = experienceNode.y! + Math.sin(angle) * distance;
        // Don't fix position - let simulation handle it
      }
    });
  }

  // Create force simulation with organized structure
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink<Node, Link>(links)
        .id((d) => d.id)
        .distance((d) => {
          const source = d.source as Node;
          if (source.type === "center") return options.parentSpacing || 180;
          if (source.type === "main") return options.nodeSpacing || 100;
          return 50;
        })
        .strength((d) => {
          const source = d.source as Node;
          if (source.type === "center") return 0.3; // Weaker for main sections
          return 0.8; // Strong for jobs to Experience
        }),
    )
    .force(
      "charge",
      d3.forceManyBody().strength((d) => {
        const node = d as Node;
        if (node.type === "center") return 0; // Center doesn't repel
        if (node.type === "main") return 0; // Main sections don't repel (they're fixed)
        return -150; // Jobs repel each other to avoid overlap
      }),
    )
    .force(
      "collision",
      d3
        .forceCollide<Node>()
        .radius((d) => d.radius + 10)
        .strength(0.9),
    )
    .force(
      "x",
      d3
        .forceX<Node>((d) => {
          if (d.type === "job" && experienceNode) {
            return experienceNode.x!;
          }
          return width / 2;
        })
        .strength(0.05),
    )
    .force(
      "y",
      d3
        .forceY<Node>((d) => {
          if (d.type === "job" && experienceNode) {
            return experienceNode.y! + 80; // Pull jobs slightly below Experience
          }
          return height / 2;
        })
        .strength(0.05),
    );

  // Draw links
  const link = g
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", "rgba(212, 175, 55, 0.3)")
    .attr("stroke-width", (d) => {
      const source = d.source as Node;
      return source.type === "center" ? 2.5 : 1.5;
    })
    .style("pointer-events", "none");

  // Track drag state to prevent click on drag
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let clickedNode: Node | null = null;

  // Draw nodes
  const node = g
    .append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .style("cursor", (d) =>
      d.type === "center" || d.type === "main" || d.type === "job"
        ? "pointer"
        : "default",
    )
    .call(
      d3
        .drag<SVGGElement, Node>()
        .on("start", (event, d) => {
          isDragging = false;
          dragStartX = event.x;
          dragStartY = event.y;
          clickedNode = d;
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          const dx = Math.abs(event.x - dragStartX);
          const dy = Math.abs(event.y - dragStartY);
          // Only consider it a drag if mouse moved more than 5 pixels
          if (dx > 5 || dy > 5) {
            isDragging = true;
          }
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event) => {
          if (!event.active) simulation.alphaTarget(0);

          // If it was a drag, keep the node fixed at the new position
          if (isDragging && clickedNode) {
            clickedNode.fx = clickedNode.x;
            clickedNode.fy = clickedNode.y;

            // Save position to persist across remounts
            savedNodePositions[clickedNode.id] = {
              x: clickedNode.x!,
              y: clickedNode.y!,
              fx: clickedNode.fx ?? null,
              fy: clickedNode.fy ?? null,
            };
          }
          // If it was just a click (not a drag), unfix and navigate
          else if (!isDragging && clickedNode) {
            clickedNode.fx = null;
            clickedNode.fy = null;

            if (clickedNode.sectionIndex !== undefined) {
              onNavigate(clickedNode.sectionIndex);
            }
          }

          isDragging = false;
          clickedNode = null;
        }) as any,
    );

  // Add circles with glow effect
  const glowIntensity = options.glowIntensity || 5;
  node
    .append("circle")
    .attr("r", (d) => d.radius)
    .attr("fill", (d) => {
      if (d.type === "center") return "rgba(30, 30, 30, 1)";
      if (d.type === "main") return "rgba(30, 30, 30, 1)";
      return "rgba(0, 0, 0, 0.95)";
    })
    .attr("stroke", (d) => {
      if (d.type === "center") return "rgba(212, 175, 55, 1)";
      if (d.type === "main") return "rgba(212, 175, 55, 0.9)";
      return "rgba(212, 175, 55, 0.6)";
    })
    .attr("stroke-width", (d) => (d.type === "center" ? 3 : 2))
    .style(
      "filter",
      glowIntensity > 0
        ? `drop-shadow(0 0 ${glowIntensity}px rgba(212, 175, 55, 0.6))`
        : "none",
    )
    .on("mouseenter", function () {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("stroke-width", 4)
        .style(
          "filter",
          `drop-shadow(0 0 ${glowIntensity + 10}px rgba(212, 175, 55, 0.9))`,
        );
    })
    .on("mouseleave", function (_, d) {
      d3.select(this)
        .transition()
        .duration(200)
        .attr("stroke-width", d.type === "center" ? 3 : 2)
        .style(
          "filter",
          glowIntensity > 0
            ? `drop-shadow(0 0 ${glowIntensity}px rgba(212, 175, 55, 0.6))`
            : "none",
        );
    });

  // Add labels with text wrapping
  node.each(function (d) {
    const nodeGroup = d3.select(this);
    const maxWidth = d.radius * 1.6; // 80% of diameter for padding
    const words = d.label.split(/\s+/);

    // Determine font size based on node type and text length
    let fontSize = 9;
    if (d.type === "center") fontSize = 14;
    else if (d.type === "main") fontSize = 11;
    else if (d.label.length < 15) fontSize = 10;

    const fontFamily =
      d.type === "center" || d.type === "main"
        ? "Cinzel, serif"
        : "Montserrat, sans-serif";
    const fontWeight =
      d.type === "center" ? "700" : d.type === "main" ? "600" : "400";
    const fill = d.type === "job" ? "#ffffff" : "#d4af37";
    const letterSpacing =
      d.type === "center" || d.type === "main" ? "0.1em" : "0";

    // Create a temporary text element to measure
    const tempText = nodeGroup
      .append("text")
      .attr("font-size", `${fontSize}px`)
      .attr("font-family", fontFamily)
      .attr("font-weight", fontWeight)
      .attr("letter-spacing", letterSpacing)
      .style("visibility", "hidden");

    const lines: string[] = [];
    let currentLine = "";

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      tempText.text(testLine);
      const testWidth = (
        tempText.node() as SVGTextElement
      ).getComputedTextLength();

      if (testWidth > maxWidth && currentLine !== "") {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) lines.push(currentLine);

    tempText.remove();

    // Adjust font size if too many lines
    if (lines.length > 3) {
      fontSize = Math.max(7, fontSize - 1);
    }

    // Calculate vertical offset for centering
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = -totalHeight / 2 + lineHeight / 2;

    // Add text lines
    lines.forEach((line, i) => {
      nodeGroup
        .append("text")
        .text(line)
        .attr("text-anchor", "middle")
        .attr("dy", `${startY + i * lineHeight}px`)
        .attr("font-size", `${fontSize}px`)
        .attr("fill", fill)
        .attr("font-weight", fontWeight)
        .attr("font-family", fontFamily)
        .attr("letter-spacing", letterSpacing)
        .style("pointer-events", "none")
        .style("user-select", "none");
    });
  });

  // Update positions on simulation tick
  simulation.on("tick", () => {
    link
      .attr("x1", (d) => (d.source as Node).x!)
      .attr("y1", (d) => (d.source as Node).y!)
      .attr("x2", (d) => (d.target as Node).x!)
      .attr("y2", (d) => (d.target as Node).y!);

    node.attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Ensure nodes are always on top
    node.raise();
  });

  // Save all node positions when simulation ends to prevent shuffling
  simulation.on("end", () => {
    nodes.forEach((node) => {
      savedNodePositions[node.id] = {
        x: node.x!,
        y: node.y!,
        fx: node.fx ?? null,
        fy: node.fy ?? null,
      };
    });
  });
}

// ===== CONSTELLATION STYLE =====
// Saved positions removed in favor of seeded random generation

function renderConstellationStyle(
  svg: SVGSVGElement,
  onNavigate: (section: number) => void,
  options: DiagramStyleOptions,
) {
  // Use parent container dimensions
  const parent = svg.parentElement;
  const width = parent ? parent.clientWidth : window.innerWidth;
  const height = parent ? parent.clientHeight : window.innerHeight;

  d3.select(svg).selectAll("*").remove();

  const svgSelection = d3
    .select(svg)
    .attr("width", width)
    .attr("height", height)
    // Remove viewBox to allow true panning/zooming without distortion
    //.attr("viewBox", `0 0 ${width} ${height}`)
    .style("cursor", "grab"); // Indicate draggability

  // Apply zoom
  const zoomLevel = (options.constellationZoom || 100) / 100;
  const starSizeScale = (options.starSize || 100) / 100;
  const nebulaIntensity = (options.nebula || 50) / 100;
  const starDensity = 0.5;

  // Create group for content
  const g = svgSelection.append("g");

  // Setup Zoom Behavior
  const zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.5, 4]) // Allow zooming out to 0.5x and in to 4x
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    })
    .on("start", () => {
      svgSelection.style("cursor", "grabbing");
    })
    .on("end", () => {
      svgSelection.style("cursor", "grab");
    });

  // Apply zoom behavior to SVG
  svgSelection.call(zoomBehavior);

  // Initialize zoom to center and scale based on options
  // We want to center (width/2, height/2) and apply the zoom level
  const initialTransform = d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(zoomLevel)
    .translate(-width / 2, -height / 2); // Center logic: translate to center, scale, translate back

  // We actually just want to center view on the middle of our coordinate system (which is traditionally width/2, height/2)
  // But D3 zoom transform is applied to the group.
  // If we draw everything relative to 0,0 being top-left, we need to shift.
  // Our drawing logic mostly assumes 0,0 is top left but calculates center as width/2, height/2.

  // Let's set the initial transform manually and update the zoom internal state
  svgSelection.call(zoomBehavior.transform, initialTransform);

  // Fixed seed logic for stability independent of slider values
  const createRandom = (seed: number) => {
    let state = seed;
    return () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  };

  // Separate random generators for each layer to prevent changes in one from affecting others
  const nebulaRandom = createRandom(1);
  const bgStarRandom = createRandom(2);
  const galaxyRandom = createRandom(3);
  const nodeRandom = createRandom(4);
  const starPropRandom = createRandom(5);
  // Keep a generic one for shooting stars etc if needed, though they usually use Math.random()

  // Add nebula effects with gradients (larger and thicker)
  const defs = svgSelection.append("defs");

  // Add nebula clouds based on intensity (larger and thicker)
  const nebulaLayer = g
    .append("g")
    .attr("opacity", 0.5 + nebulaIntensity * 0.4);
  const numNebulas = Math.floor(nebulaIntensity * 8); // Max 8 nebulas at 100%

  const nebulaColors = [
    "#ff4d4d", // Red
    "#ffaa00", // Orange
    "#ffff00", // Yellow
    "#00ff00", // Green
    "#00ffff", // Cyan
    "#0000ff", // Blue
    "#ff00ff", // Magenta
    "#9900ff", // Purple
  ];

  for (let i = 0; i < numNebulas; i++) {
    const cx = nebulaRandom() * width;
    const cy = nebulaRandom() * height;
    const r = 150 + nebulaRandom() * 200; // Much larger
    const color =
      nebulaColors[Math.floor(nebulaRandom() * nebulaColors.length)];
    const gradId = `nebulaGradient-${i}`;

    const nebulaGradient = defs
      .append("radialGradient")
      .attr("id", gradId)
      .attr("cx", "50%")
      .attr("cy", "50%")
      .attr("r", "50%");

    nebulaGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", color)
      .attr("stop-opacity", 0.25);

    nebulaGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", color)
      .attr("stop-opacity", 0);

    nebulaLayer
      .append("ellipse")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("rx", r)
      .attr("ry", r * (0.6 + nebulaRandom() * 0.4))
      .attr("fill", `url(#${gradId})`)
      .attr("transform", `rotate(${nebulaRandom() * 360} ${cx} ${cy})`)
      .each(function () {
        // Slow organic expanding/contracting breathing effect
        const cloud = d3.select(this);
        // Use seeded random for duration so it's consistent
        const randomDuration = 10000 + nebulaRandom() * 20000;
        const baseRx = r;
        const baseRy = r * 0.6;

        function breathe() {
          cloud
            .transition()
            .duration(randomDuration)
            .ease(d3.easeSinInOut)
            .attr("rx", baseRx * (1.1 + Math.random() * 0.2)) // Use Math.random here for variation over time
            .attr("ry", baseRy * (1.1 + Math.random() * 0.2))
            .attr("opacity", 0.3 + Math.random() * 0.2)
            .transition() // Contract back
            .duration(randomDuration)
            .ease(d3.easeSinInOut)
            .attr("rx", baseRx * (0.9 + Math.random() * 0.1))
            .attr("ry", baseRy * (0.9 + Math.random() * 0.1))
            .attr("opacity", 0.6 + Math.random() * 0.2)
            .on("end", breathe);
        }
        breathe();
      });
  }

  // Add realistic twinkling background stars
  const bgStarLayer = g.append("g");
  // Significantly increased density for richer background (scales with zoom squared to maintain/increase density)
  const numBgStars = Math.floor(
    starDensity * 250 * (zoomLevel * zoomLevel * 1.5),
  );
  for (let i = 0; i < numBgStars; i++) {
    const x = bgStarRandom() * width;
    const y = bgStarRandom() * height;
    // Scale down size slightly as we zoom in to keep them looking like stars, not balls
    const size = (0.5 + bgStarRandom() * 1.5) / Math.sqrt(zoomLevel);
    const baseOpacity = 0.3 + bgStarRandom() * 0.6;
    const twinkleDelay = bgStarRandom() * 4000;
    const twinkleDuration = 1000 + bgStarRandom() * 2000;

    const bgStar = bgStarLayer
      .append("circle")
      .attr("cx", x)
      .attr("cy", y)
      .attr("r", size)
      .attr("fill", "#ffffff")
      .attr("opacity", baseOpacity);

    // Realistic twinkling - random variations
    function twinkleStar() {
      bgStar
        .transition()
        .delay(twinkleDelay)
        .duration(twinkleDuration)
        .attr("opacity", 0.1 + Math.random() * 0.3)
        .transition()
        .duration(twinkleDuration)
        .attr("opacity", baseOpacity + Math.random() * 0.4)
        .on("end", twinkleStar);
    }
    twinkleStar();
  }

  // Add distinct distant galaxies (spirals)
  const galaxyLayer = g.append("g").attr("opacity", 0.7);
  const numGalaxies = 5 + Math.floor(galaxyRandom() * 4);

  for (let i = 0; i < numGalaxies; i++) {
    const gx = galaxyRandom() * width;
    const gy = galaxyRandom() * height;
    const scale = 0.2 + galaxyRandom() * 0.4;
    const rotation = galaxyRandom() * 360;
    const galaxyColor =
      nebulaColors[Math.floor(galaxyRandom() * nebulaColors.length)];

    const galaxyGroup = galaxyLayer
      .append("g")
      .attr(
        "transform",
        `translate(${gx},${gy}) scale(${scale}) rotate(${rotation})`,
      );

    // Draw spiral arms
    for (let arm = 0; arm < 2; arm++) {
      galaxyGroup
        .append("path")
        .attr("d", "M0,0 Q20,0 40,20 T70,50")
        .attr("stroke", galaxyColor)
        .attr("stroke-width", 2)
        .attr("fill", "none")
        .attr("opacity", 0.6)
        .attr("transform", `rotate(${arm * 180})`);

      // Galaxy core glow
      galaxyGroup
        .append("circle")
        .attr("r", 10)
        .attr("fill", galaxyColor)
        .attr("opacity", 0.3)
        .attr("filter", "blur(2px)");
    }
  }

  // Build nodes (same structure as circles)
  interface Node extends d3.SimulationNodeDatum {
    id: string;
    type: "center" | "main" | "job";
    label: string;
    radius: number;
    sectionIndex?: number;
  }

  const nodes: Node[] = [];

  // Center node - fixed at center
  nodes.push({
    id: "center",
    type: "center",
    label: "HD",
    radius: 8,
    x: width / 2,
    y: height / 2,
    fx: width / 2,
    fy: height / 2,
    sectionIndex: 0,
  });

  // Position main sections - randomize layout
  const mainSections = [
    { id: "skills", label: "Skills", sectionIndex: 1 },
    { id: "experience", label: "Experience", sectionIndex: 2 },
    {
      id: "education",
      label: "Education",
      sectionIndex: 2 + resumeData.experience.length,
    },
  ];

  // Randomize initial rotation and spread for the main trio
  const layoutRotation = nodeRandom() * Math.PI * 2;

  mainSections.forEach((section, index) => {
    // 3 sectors (0, 120, 240) + random wiggle (+/- 30deg) + global rotation
    const baseAngle = (index * 2 * Math.PI) / 3;
    const wiggle = (nodeRandom() - 0.5) * (Math.PI / 3);
    const angle = baseAngle + wiggle + layoutRotation;

    // Random distance 200-300px
    const dist = 200 + nodeRandom() * 100;

    const x = width / 2 + Math.cos(angle) * dist;
    const y = height / 2 + Math.sin(angle) * dist;

    nodes.push({
      id: section.id,
      type: "main",
      label: section.label,
      radius: 6,
      x: x,
      y: y,
      fx: x,
      fy: y,
      sectionIndex: section.sectionIndex,
    });
  });

  // Position job nodes - scatter in a spiral arm pattern around Experience node
  const experienceNode = nodes.find((n) => n.id === "experience")!;

  // Create a visually cohesive "arm" for jobs
  // This helps identify them as a group associated with Experience
  const baseSpiralAngle = nodeRandom() * Math.PI * 2;

  resumeData.experience.forEach((job, index) => {
    const jobId = `job-${index}`;

    // Spiral formula: increasing distance and angle
    const angleOffset = (index * Math.PI) / 8; // Gentle curve
    const combinedAngle = baseSpiralAngle + angleOffset;

    // Increasing distance creates outward flow
    const dist = 60 + index * 40 + nodeRandom() * 20;

    const x = experienceNode.x! + Math.cos(combinedAngle) * dist;
    const y = experienceNode.y! + Math.sin(combinedAngle) * dist;

    nodes.push({
      id: jobId,
      type: "job",
      label: job.navLabel || job.company,
      radius: 4,
      x: x,
      y: y,
      sectionIndex: 2 + index,
    });
  });

  // Realistic stellar classification colors (O, B, A, F, G, K, M types)
  const stellarColors = [
    { temp: "O", color: "#9bb0ff", glow: "#aabfff" }, // Very hot blue-white
    { temp: "B", color: "#aabfff", glow: "#bbcfff" }, // Blue-white
    { temp: "A", color: "#cad7ff", glow: "#dae3ff" }, // White
    { temp: "F", color: "#f8f7ff", glow: "#fffef8" }, // Yellow-white
    { temp: "G", color: "#fff4ea", glow: "#fff9f0" }, // Yellow (Sun-like)
    { temp: "K", color: "#ffd2a1", glow: "#ffe0b8" }, // Orange
    { temp: "M", color: "#ffcc6f", glow: "#ffd890" }, // Red-orange
  ];

  // Assign realistic stellar properties to each star
  interface StarNode extends Node {
    stellarType?: (typeof stellarColors)[number];
    starMagnitude?: number;
    glowRadius?: number;
  }

  const starNodes = nodes.map((node) => {
    const stellar =
      stellarColors[Math.floor(starPropRandom() * stellarColors.length)];
    const magnitude = 0.7 + starPropRandom() * 0.6; // 0.7-1.3 brightness range
    const glowRadius = 2 + starPropRandom() * 3; // 2-5px realistic glow
    return {
      ...node,
      stellarType: stellar,
      starMagnitude: magnitude,
      glowRadius,
    } as StarNode;
  });

  // Draw stars with realistic colors, sizes, and glows
  const stars = g
    .append("g")
    .selectAll("g")
    .data(starNodes)
    .join("g")
    .attr("transform", (d) => `translate(${d.x},${d.y})`)
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      if (!event.defaultPrevented && d.sectionIndex !== undefined) {
        onNavigate(d.sectionIndex);
      }
    });

  const brightness = 1; // Fixed brightness

  // Star core - NO GLOW, just solid stars
  stars
    .append("circle")
    .attr("r", (d) => d.radius * starSizeScale * d.starMagnitude!)
    .attr("fill", (d) => d.stellarType!.color);

  // Add star points with realistic stellar colors
  stars.each(function (d) {
    const star = d3.select(this);
    const numPoints = d.type === "center" ? 8 : d.type === "main" ? 6 : 4;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i * (2 * Math.PI)) / numPoints;
      star
        .append("line")
        .attr("x1", 0)
        .attr("y1", 0)
        .attr(
          "x2",
          Math.cos(angle) * d.radius * 2 * starSizeScale * d.starMagnitude!,
        )
        .attr(
          "y2",
          Math.sin(angle) * d.radius * 2 * starSizeScale * d.starMagnitude!,
        )
        .attr("stroke", d.stellarType!.color)
        .attr("stroke-width", 0.5 + nebulaIntensity * 0.5)
        .attr("opacity", (0.4 + brightness * 0.3) * d.starMagnitude!);
    }
  });

  // Add labels
  stars
    .append("text")
    .text((d) => d.label)
    .attr("y", (d) => d.radius * starSizeScale + 15)
    .attr("text-anchor", "middle")
    .attr("fill", (d) => d.stellarType!.color)
    .attr("font-size", (d) =>
      d.type === "center"
        ? `${12 * starSizeScale}px`
        : d.type === "main"
          ? `${10 * starSizeScale}px`
          : `${8 * starSizeScale}px`,
    )
    .style("pointer-events", "none");

  // Realistic meteor showers (shooting stars)
  const shootingStarFreq = options.shootingStarFrequency || 3;
  if (shootingStarFreq > 0) {
    const shootingStarLayer = g.append("g");
    // Define a gradient for meteor tails (White -> Transparent)
    const meteorTailGradient = defs
      .append("linearGradient")
      .attr("id", "meteorTailGradient")
      .attr("x1", "100%")
      .attr("y1", "0%") // Head
      .attr("x2", "0%")
      .attr("y2", "0%"); // Tail

    meteorTailGradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "white")
      .attr("stop-opacity", 0);
    meteorTailGradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "white")
      .attr("stop-opacity", 1);

    const numShootingStars = Math.floor(shootingStarFreq / 2);

    for (let i = 0; i < numShootingStars; i++) {
      // Use Path instead of Line for curves
      const shootingStar = shootingStarLayer
        .append("path")
        .attr("stroke", "url(#meteorTailGradient)") // Use gradient for fading tail effect
        .attr("stroke-width", 2)
        .attr("stroke-linecap", "round")
        .attr("fill", "none")
        .attr("opacity", 0);

      // Realistic meteor animation with arcs
      function animateMeteor() {
        // Random start point (bias towards top/right)
        const startX = Math.random() < 0.5 ? Math.random() * width : width + 50;
        const startY = Math.random() < 0.5 ? -50 : Math.random() * height * 0.5;

        // Random end point (across the screen)
        const endX = startX - (300 + Math.random() * 400);
        const endY = startY + (200 + Math.random() * 300);

        // Control point for quadratic bezier (creates the curve/arc)
        // Offset perpendicular to movement direction
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        const curveOffset = (Math.random() - 0.5) * 200; // Curvature amount
        const controlX = midX + curveOffset;
        const controlY = midY - curveOffset; // Opposite direction

        const pathFunc = d3.path();
        pathFunc.moveTo(startX, startY);
        pathFunc.quadraticCurveTo(controlX, controlY, endX, endY);
        const pathData = pathFunc.toString();

        shootingStar.attr("d", pathData);

        // Animate stroke-dashoffset to make it travel
        const totalLength = (
          shootingStar.node() as SVGPathElement
        ).getTotalLength();
        const tailLength = 150 + Math.random() * 100;

        shootingStar
          .attr("stroke-dasharray", `${tailLength} ${totalLength}`)
          .attr("stroke-dashoffset", tailLength) // Start hidden (offset = tail length, so dash is before start)
          .attr("opacity", 1)
          .transition()
          .delay(1000 + Math.random() * 5000)
          .duration(800 + Math.random() * 500)
          .ease(d3.easeQuadIn)
          .attr("stroke-dashoffset", -totalLength) // Animate until tail is gone
          .on("end", animateMeteor);
      }

      // Initial kickoff with random delay to avoid sync
      setTimeout(animateMeteor, Math.random() * 5000);
    }
  }
}

// ===== CIRCUIT BOARD STYLE =====
function renderCircuitStyle(
  svg: SVGSVGElement,
  onNavigate: (section: number) => void,
  options: DiagramStyleOptions,
) {
  const width = 1000;
  const height = 500;
  d3.select(svg).selectAll("*").remove();

  const svgSelection = d3
    .select(svg)
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = svgSelection.append("g");

  const traceWidth = options.traceWidth || 3;
  const baseColor = options.circuitColor || "#d4af37";

  // Draw PCB background grid
  const gridLayer = g.append("g").attr("opacity", 0.15);
  for (let x = 0; x < width; x += 50) {
    gridLayer
      .append("line")
      .attr("x1", x)
      .attr("y1", 0)
      .attr("x2", x)
      .attr("y2", height)
      .attr("stroke", baseColor)
      .attr("stroke-width", 0.5);
  }
  for (let y = 0; y < height; y += 50) {
    gridLayer
      .append("line")
      .attr("x1", 0)
      .attr("y1", y)
      .attr("x2", width)
      .attr("y2", y)
      .attr("stroke", baseColor)
      .attr("stroke-width", 0.5);
  }

  // Node structure with proper relationships
  interface Node {
    id: string;
    type: "cpu" | "main" | "job";
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    sectionIndex?: number;
  }

  const centerX = width / 2;
  const centerY = height / 2;

  // Get size options (100 = default scale)
  const cpuScale = (options.cpuSize || 80) / 80;
  const chipScale = (options.chipSize || 100) / 100;

  // CPU at center
  const cpuSize = 80 * cpuScale;
  const cpuNode: Node = {
    id: "center",
    type: "cpu",
    label: "HD",
    x: centerX - cpuSize / 2,
    y: centerY - cpuSize / 2,
    width: cpuSize,
    height: cpuSize,
    sectionIndex: 0,
  };

  // Main nodes positioned around CPU
  const mainWidth = 70 * chipScale;
  const mainHeight = 40 * chipScale;
  const mainNodes: Node[] = [
    {
      id: "skills",
      type: "main",
      label: "SKILLS",
      x: centerX - mainWidth / 2,
      y: 80,
      width: mainWidth,
      height: mainHeight,
      sectionIndex: 1,
    },
    {
      id: "experience",
      type: "main",
      label: "EXP",
      x: 150,
      y: centerY - mainHeight / 2,
      width: mainWidth,
      height: mainHeight,
      sectionIndex: 2,
    },
    {
      id: "education",
      type: "main",
      label: "EDU",
      x: width - 220,
      y: centerY - mainHeight / 2,
      width: mainWidth,
      height: mainHeight,
      sectionIndex: 2 + resumeData.experience.length,
    },
  ];

  // Apply saved positions if they exist
  const allCircuitNodes = [cpuNode, ...mainNodes];
  allCircuitNodes.forEach((node) => {
    const saved = savedNodePositions[node.id];
    if (saved && saved.fx !== null) {
      node.x = saved.x;
      node.y = saved.y;
    }
  });

  // Job nodes positioned around Experience
  const jobWidth = 50 * chipScale * 0.7;
  const jobHeight = 30 * chipScale * 0.7;
  const jobNodes: Node[] = [];
  const experienceNode = mainNodes[1];
  resumeData.experience.forEach((job, index) => {
    const jobId = `job-${index}`;
    const saved = savedNodePositions[jobId];

    let jobX, jobY;
    if (saved && saved.fx !== null) {
      // Use saved absolute position
      jobX = saved.x;
      jobY = saved.y;
    } else {
      // Calculate initial position relative to Experience
      const angle =
        (index / resumeData.experience.length) * Math.PI * 1.2 + Math.PI * 0.9;
      const distance = 120;
      jobX =
        experienceNode.x +
        experienceNode.width / 2 +
        Math.cos(angle) * distance -
        jobWidth / 2;
      jobY =
        experienceNode.y +
        experienceNode.height / 2 +
        Math.sin(angle) * distance -
        jobHeight / 2;
    }

    const jobNode = {
      id: jobId,
      type: "job" as const,
      label: (job.navLabel || job.company).substring(0, 4).toUpperCase(),
      x: jobX,
      y: jobY,
      width: jobWidth,
      height: jobHeight,
      sectionIndex: 2 + index,
    };
    jobNodes.push(jobNode);
  });

  // Draw decorative circuit elements
  const complexity = (options.circuitComplexity || 50) / 100; // 0.1 to 1.0
  const decorLayer = g.append("g").attr("opacity", 0.2 + complexity * 0.5);

  // Seeded random function to keep decorative elements consistent across re-renders
  const seed = Math.floor(complexity * 1000);
  let randomState = seed;
  const seededRandom = () => {
    randomState = (randomState * 9301 + 49297) % 233280;
    return randomState / 233280;
  };

  // Add background traces based on complexity (dramatically increased)
  const numBackgroundTraces = Math.floor(complexity * 60);
  for (let i = 0; i < numBackgroundTraces; i++) {
    const isHorizontal = seededRandom() > 0.5;
    const pos = seededRandom() * (isHorizontal ? height : width);
    const length = 50 + seededRandom() * 150;
    const offset = seededRandom() * (isHorizontal ? width : height);

    if (isHorizontal) {
      decorLayer
        .append("line")
        .attr("x1", offset)
        .attr("y1", pos)
        .attr("x2", offset + length)
        .attr("y2", pos)
        .attr("stroke", baseColor)
        .attr("stroke-width", 0.5 + complexity * 2)
        .attr("opacity", 0.4 + complexity * 0.5);
    } else {
      decorLayer
        .append("line")
        .attr("x1", pos)
        .attr("y1", offset)
        .attr("x2", pos)
        .attr("y2", offset + length)
        .attr("stroke", baseColor)
        .attr("stroke-width", 0.5 + complexity * 2)
        .attr("opacity", 0.4 + complexity * 0.5);
    }
  }

  // Add via holes based on complexity (dramatically increased)
  const numVias = Math.floor(complexity * 80);
  for (let i = 0; i < numVias; i++) {
    decorLayer
      .append("circle")
      .attr("cx", 50 + seededRandom() * (width - 100))
      .attr("cy", 50 + seededRandom() * (height - 100))
      .attr("r", 1.5 + complexity * 1.5)
      .attr("fill", "none")
      .attr("stroke", baseColor)
      .attr("stroke-width", 0.8 + complexity * 0.7);
  }

  // Calculate number of components based on complexity (dramatically increased)
  const numCapacitors = Math.max(2, Math.floor(complexity * 10));
  const capacitorPositions = [];
  for (let i = 0; i < numCapacitors; i++) {
    capacitorPositions.push({
      x: 80 + (i % 3) * 400 + seededRandom() * 50,
      y: 100 + Math.floor(i / 3) * 150 + seededRandom() * 50,
    });
  }

  // Add capacitors
  capacitorPositions.forEach((pos) => {
    decorLayer
      .append("rect")
      .attr("x", pos.x - 5)
      .attr("y", pos.y - 10)
      .attr("width", 10)
      .attr("height", 20)
      .attr("fill", "none")
      .attr("stroke", baseColor)
      .attr("stroke-width", 1);
    decorLayer
      .append("line")
      .attr("x1", pos.x - 8)
      .attr("y1", pos.y)
      .attr("x2", pos.x - 5)
      .attr("y2", pos.y)
      .attr("stroke", baseColor)
      .attr("stroke-width", 1);
    decorLayer
      .append("line")
      .attr("x1", pos.x + 5)
      .attr("y1", pos.y)
      .attr("x2", pos.x + 8)
      .attr("y2", pos.y)
      .attr("stroke", baseColor)
      .attr("stroke-width", 1);
  });

  // Calculate number of resistors based on complexity (dramatically increased)
  const numResistors = Math.max(2, Math.floor(complexity * 12));
  const resistorPositions = [];
  for (let i = 0; i < numResistors; i++) {
    resistorPositions.push({
      x: 100 + (i % 3) * 400 + seededRandom() * 50,
      y: 120 + Math.floor(i / 3) * 120 + seededRandom() * 50,
      angle: seededRandom() * 180 - 90,
    });
  }

  // Add resistors
  resistorPositions.forEach((pos) => {
    const group = decorLayer
      .append("g")
      .attr("transform", `translate(${pos.x},${pos.y}) rotate(${pos.angle})`);
    group
      .append("rect")
      .attr("x", -10)
      .attr("y", -3)
      .attr("width", 20)
      .attr("height", 6)
      .attr("fill", "none")
      .attr("stroke", baseColor)
      .attr("stroke-width", 1);
    group
      .append("line")
      .attr("x1", -15)
      .attr("y1", 0)
      .attr("x2", -10)
      .attr("y2", 0)
      .attr("stroke", baseColor)
      .attr("stroke-width", 1);
    group
      .append("line")
      .attr("x1", 10)
      .attr("y1", 0)
      .attr("x2", 15)
      .attr("y2", 0)
      .attr("stroke", baseColor)
      .attr("stroke-width", 1);
  });

  // Helper function to draw/update traces
  const drawTraces = () => {
    traceLayer.selectAll("*").remove();

    // Draw traces from CPU to main nodes
    mainNodes.forEach((node, index) => {
      const cpuCenterX = cpuNode.x + cpuNode.width / 2;
      const cpuCenterY = cpuNode.y + cpuNode.height / 2;
      const nodeCenterX = node.x + node.width / 2;
      const nodeCenterY = node.y + node.height / 2;

      const midPoint = cpuCenterX + (nodeCenterX - cpuCenterX) / 2;
      const pathData = `M ${cpuCenterX} ${cpuCenterY} L ${midPoint} ${cpuCenterY} L ${midPoint} ${nodeCenterY} L ${nodeCenterX} ${nodeCenterY}`;
      const traceColor = colors[index % colors.length];

      traceLayer
        .append("path")
        .attr("d", pathData)
        .attr("stroke", traceColor)
        .attr("stroke-width", traceWidth)
        .attr("fill", "none")
        .attr("stroke-linecap", "square")
        .attr("opacity", 0.6);

      // Add animated pulse
      const pulse = traceLayer
        .append("circle")
        .attr("r", traceWidth * 1.2)
        .attr("fill", traceColor)
        .attr("opacity", 0);

      pulse
        .append("animateMotion")
        .attr("dur", `${4 / pulseSpeed}s`)
        .attr("repeatCount", "indefinite")
        .attr("path", pathData);

      pulse
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;1;1;0")
        .attr("keyTimes", "0;0.1;0.9;1")
        .attr("dur", `${4 / pulseSpeed}s`)
        .attr("repeatCount", "indefinite");

      pulse
        .append("animate")
        .attr("attributeName", "r")
        .attr(
          "values",
          `${traceWidth * 1.2};${traceWidth * 2};${traceWidth * 1.2}`,
        )
        .attr("dur", `${4 / pulseSpeed}s`)
        .attr("repeatCount", "indefinite");

      // Solder pads
      [
        { x: cpuCenterX, y: cpuCenterY },
        { x: nodeCenterX, y: nodeCenterY },
      ].forEach((pad) => {
        traceLayer
          .append("circle")
          .attr("cx", pad.x)
          .attr("cy", pad.y)
          .attr("r", traceWidth * 1.5)
          .attr("fill", traceColor)
          .attr("opacity", 0.8);
      });
    });

    // Draw traces from Experience to job nodes
    jobNodes.forEach((job, jobIndex) => {
      const expCenterX = experienceNode.x + experienceNode.width / 2;
      const expCenterY = experienceNode.y + experienceNode.height / 2;
      const jobCenterX = job.x + job.width / 2;
      const jobCenterY = job.y + job.height / 2;

      const midX = expCenterX + (jobCenterX - expCenterX) * 0.6;
      const pathData = `M ${expCenterX} ${expCenterY} L ${midX} ${expCenterY} L ${midX} ${jobCenterY} L ${jobCenterX} ${jobCenterY}`;
      const jobColor = "#8b7355";

      traceLayer
        .append("path")
        .attr("d", pathData)
        .attr("stroke", jobColor)
        .attr("stroke-width", traceWidth * 0.8)
        .attr("fill", "none")
        .attr("stroke-linecap", "square")
        .attr("opacity", 0.5);

      const jobPulse = traceLayer
        .append("circle")
        .attr("r", traceWidth * 0.8)
        .attr("fill", jobColor)
        .attr("opacity", 0);

      jobPulse
        .append("animateMotion")
        .attr("dur", `${5 / pulseSpeed}s`)
        .attr("repeatCount", "indefinite")
        .attr("begin", `${jobIndex * 0.3}s`)
        .attr("path", pathData);

      jobPulse
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;0.8;0.8;0")
        .attr("keyTimes", "0;0.1;0.9;1")
        .attr("dur", `${5 / pulseSpeed}s`)
        .attr("repeatCount", "indefinite")
        .attr("begin", `${jobIndex * 0.3}s`);

      traceLayer
        .append("circle")
        .attr("cx", jobCenterX)
        .attr("cy", jobCenterY)
        .attr("r", traceWidth)
        .attr("fill", jobColor)
        .attr("opacity", 0.6);
    });
  };

  // Draw circuit traces - CPU to main nodes
  const traceLayer = g.append("g");
  const pulseSpeed = options.pulseSpeed || 3;
  const colors = ["#d4af37", "#4a9eff", "#ff6b6b"];

  drawTraces();

  // Drag behavior for nodes
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let clickedNode: Node | null = null;
  let currentElement: SVGGElement | null = null;

  const dragBehavior = d3
    .drag<SVGGElement, Node>()
    .on("start", (event, d) => {
      event.sourceEvent.stopPropagation();
      event.sourceEvent.preventDefault();
      isDragging = false;
      dragStartX = d.x;
      dragStartY = d.y;
      clickedNode = d;
      currentElement = d3.select(event.sourceEvent.target).node()
        ?.parentElement as SVGGElement;
    })
    .on("drag", (event, d) => {
      event.sourceEvent.stopPropagation();
      event.sourceEvent.preventDefault();

      const dx = Math.abs(d.x - dragStartX);
      const dy = Math.abs(d.y - dragStartY);
      if (dx > 5 || dy > 5) {
        isDragging = true;
      }

      // Update position using dx/dy deltas
      d.x += event.dx;
      d.y += event.dy;

      // Update the transform using stored element reference
      if (currentElement) {
        d3.select(currentElement).attr("transform", `translate(${d.x},${d.y})`);
      }

      // Redraw traces only (not background)
      traceLayer.selectAll("*").remove();

      // Draw traces from CPU to main nodes
      mainNodes.forEach((node, index) => {
        const cpuCenterX = cpuNode.x + cpuNode.width / 2;
        const cpuCenterY = cpuNode.y + cpuNode.height / 2;
        const nodeCenterX = node.x + node.width / 2;
        const nodeCenterY = node.y + node.height / 2;

        const midPoint = cpuCenterX + (nodeCenterX - cpuCenterX) / 2;
        const pathData = `M ${cpuCenterX} ${cpuCenterY} L ${midPoint} ${cpuCenterY} L ${midPoint} ${nodeCenterY} L ${nodeCenterX} ${nodeCenterY}`;
        const traceColor = colors[index % colors.length];

        traceLayer
          .append("path")
          .attr("d", pathData)
          .attr("stroke", traceColor)
          .attr("stroke-width", traceWidth)
          .attr("fill", "none")
          .attr("stroke-linecap", "square")
          .attr("opacity", 0.6);

        // Add solder pads at connection points
        [
          { x: cpuCenterX, y: cpuCenterY },
          { x: nodeCenterX, y: nodeCenterY },
        ].forEach((pad) => {
          traceLayer
            .append("circle")
            .attr("cx", pad.x)
            .attr("cy", pad.y)
            .attr("r", traceWidth * 1.5)
            .attr("fill", traceColor)
            .attr("opacity", 0.8);
        });
      });

      // Draw traces from Experience to jobs
      if (experienceNode) {
        jobNodes.forEach((jobNode) => {
          const expCenterX = experienceNode.x + experienceNode.width / 2;
          const expCenterY = experienceNode.y + experienceNode.height / 2;
          const jobCenterX = jobNode.x + jobNode.width / 2;
          const jobCenterY = jobNode.y + jobNode.height / 2;

          const midX = expCenterX + (jobCenterX - expCenterX) / 2;
          const pathData = `M ${expCenterX} ${expCenterY} L ${midX} ${expCenterY} L ${midX} ${jobCenterY} L ${jobCenterX} ${jobCenterY}`;

          traceLayer
            .append("path")
            .attr("d", pathData)
            .attr("stroke", "#4a9eff")
            .attr("stroke-width", traceWidth * 0.8)
            .attr("fill", "none")
            .attr("stroke-linecap", "square")
            .attr("opacity", 0.4);

          // Add solder pads
          [
            { x: expCenterX, y: expCenterY },
            { x: jobCenterX, y: jobCenterY },
          ].forEach((pad) => {
            traceLayer
              .append("circle")
              .attr("cx", pad.x)
              .attr("cy", pad.y)
              .attr("r", traceWidth * 1.2)
              .attr("fill", "#4a9eff")
              .attr("opacity", 0.6);
          });
        });
      }
    })
    .on("end", () => {
      if (isDragging && clickedNode) {
        // Save the final position
        savedNodePositions[clickedNode.id] = {
          x: clickedNode.x,
          y: clickedNode.y,
          fx: clickedNode.x,
          fy: clickedNode.y,
        };
        // Restore full traces with animations after drag ends
        drawTraces();
      } else if (
        !isDragging &&
        clickedNode &&
        clickedNode.sectionIndex !== undefined
      ) {
        onNavigate(clickedNode.sectionIndex);
      }
      // Reset state
      clickedNode = null;
      currentElement = null;
      isDragging = false;
    });

  // Skip the old trace rendering code - we'll handle it after nodes are drawn
  const skipOldTraces = true;
  if (!skipOldTraces) {
    mainNodes.forEach((node, index) => {
      const cpuCenterX = cpuNode.x + cpuNode.width / 2;
      const cpuCenterY = cpuNode.y + cpuNode.height / 2;
      const nodeCenterX = node.x + node.width / 2;
      const nodeCenterY = node.y + node.height / 2;

      // Right-angle routing
      const midPoint = cpuCenterX + (nodeCenterX - cpuCenterX) / 2;
      const pathData = `M ${cpuCenterX} ${cpuCenterY} L ${midPoint} ${cpuCenterY} L ${midPoint} ${nodeCenterY} L ${nodeCenterX} ${nodeCenterY}`;
      const traceColor = colors[index % colors.length];

      traceLayer
        .append("path")
        .attr("d", pathData)
        .attr("stroke", traceColor)
        .attr("stroke-width", traceWidth)
        .attr("fill", "none")
        .attr("stroke-linecap", "square")
        .attr("opacity", 0.6);

      // Add animated pulse
      const pulse = traceLayer
        .append("circle")
        .attr("r", traceWidth * 1.2)
        .attr("fill", traceColor)
        .attr("opacity", 0);

      pulse
        .append("animateMotion")
        .attr("dur", `${4 / pulseSpeed}s`)
        .attr("repeatCount", "indefinite")
        .attr("path", pathData);

      pulse
        .append("animate")
        .attr("attributeName", "opacity")
        .attr("values", "0;1;1;0")
        .attr("keyTimes", "0;0.1;0.9;1")
        .attr("dur", `${4 / pulseSpeed}s`)
        .attr("repeatCount", "indefinite");

      // Add glow effect to pulse
      pulse
        .append("animate")
        .attr("attributeName", "r")
        .attr(
          "values",
          `${traceWidth * 1.2};${traceWidth * 2};${traceWidth * 1.2}`,
        )
        .attr("dur", `${4 / pulseSpeed}s`)
        .attr("repeatCount", "indefinite");

      // Add solder pads at connection points
      [
        { x: cpuCenterX, y: cpuCenterY },
        { x: nodeCenterX, y: nodeCenterY },
      ].forEach((pad) => {
        traceLayer
          .append("circle")
          .attr("cx", pad.x)
          .attr("cy", pad.y)
          .attr("r", traceWidth * 1.5)
          .attr("fill", traceColor)
          .attr("opacity", 0.8);
      });
    }); // End of mainNodes.forEach

    // Skip old trace code - already handled in drawTraces function
  } // End of if (!skipOldTraces)

  // Define CPU gradient
  const defs = svgSelection.append("defs");
  const cpuGradient = defs
    .append("linearGradient")
    .attr("id", "cpuGradient")
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "100%")
    .attr("y2", "100%");
  cpuGradient.append("stop").attr("offset", "0%").attr("stop-color", "#2a2a2a");
  cpuGradient
    .append("stop")
    .attr("offset", "50%")
    .attr("stop-color", "#1a1a1a");
  cpuGradient
    .append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "#2a2a2a");

  // Draw CPU (center node)
  const cpuGroup = g
    .append("g")
    .datum(cpuNode)
    .attr("transform", `translate(${cpuNode.x},${cpuNode.y})`)
    .style("cursor", "move")
    .call(dragBehavior);

  // CPU body with metallic look
  cpuGroup
    .append("rect")
    .attr("width", cpuNode.width)
    .attr("height", cpuNode.height)
    .attr("fill", "url(#cpuGradient)")
    .attr("stroke", "#d4af37")
    .attr("stroke-width", 3)
    .attr("rx", 3);

  // CPU pins on all sides
  const pinCount = 10;
  for (let i = 0; i < pinCount; i++) {
    const offset = (cpuNode.width / (pinCount + 1)) * (i + 1);
    // Top pins
    cpuGroup
      .append("rect")
      .attr("x", offset - 2)
      .attr("y", -4)
      .attr("width", 4)
      .attr("height", 4)
      .attr("fill", "#d4af37");
    // Bottom pins
    cpuGroup
      .append("rect")
      .attr("x", offset - 2)
      .attr("y", cpuNode.height)
      .attr("width", 4)
      .attr("height", 4)
      .attr("fill", "#d4af37");
  }
  for (let i = 0; i < pinCount; i++) {
    const offset = (cpuNode.height / (pinCount + 1)) * (i + 1);
    // Left pins
    cpuGroup
      .append("rect")
      .attr("x", -4)
      .attr("y", offset - 2)
      .attr("width", 4)
      .attr("height", 4)
      .attr("fill", "#d4af37");
    // Right pins
    cpuGroup
      .append("rect")
      .attr("x", cpuNode.width)
      .attr("y", offset - 2)
      .attr("width", 4)
      .attr("height", 4)
      .attr("fill", "#d4af37");
  }

  // CPU inner grid pattern
  for (let i = 1; i < 4; i++) {
    cpuGroup
      .append("line")
      .attr("x1", (cpuNode.width / 4) * i)
      .attr("y1", 10)
      .attr("x2", (cpuNode.width / 4) * i)
      .attr("y2", cpuNode.height - 10)
      .attr("stroke", "#d4af37")
      .attr("stroke-width", 0.5)
      .attr("opacity", 0.3);
    cpuGroup
      .append("line")
      .attr("x1", 10)
      .attr("y1", (cpuNode.height / 4) * i)
      .attr("x2", cpuNode.width - 10)
      .attr("y2", (cpuNode.height / 4) * i)
      .attr("stroke", "#d4af37")
      .attr("stroke-width", 0.5)
      .attr("opacity", 0.3);
  }

  // CPU label with scaled font size
  cpuGroup
    .append("text")
    .text("CPU")
    .attr("x", cpuNode.width / 2)
    .attr("y", cpuNode.height / 2 - 8 * cpuScale)
    .attr("text-anchor", "middle")
    .attr("fill", "#d4af37")
    .attr("font-size", `${12 * cpuScale}px`)
    .attr("font-weight", "bold")
    .attr("font-family", "monospace");
  cpuGroup
    .append("text")
    .text(cpuNode.label)
    .attr("x", cpuNode.width / 2)
    .attr("y", cpuNode.height / 2 + 8 * cpuScale)
    .attr("text-anchor", "middle")
    .attr("fill", "#d4af37")
    .attr("font-size", `${16 * cpuScale}px`)
    .attr("font-weight", "bold")
    .attr("font-family", "Courier New, monospace");

  // Draw main chips
  mainNodes.forEach((node) => {
    const chipGroup = g
      .append("g")
      .datum(node)
      .attr("transform", `translate(${node.x},${node.y})`)
      .style("cursor", "move")
      .call(dragBehavior)
      .on("mouseenter", function () {
        d3.select(this).select("rect").attr("fill", "rgba(212, 175, 55, 0.2)");
      })
      .on("mouseleave", function () {
        d3.select(this).select("rect").attr("fill", "#1a1a1a");
      });

    // Chip body
    chipGroup
      .append("rect")
      .attr("width", node.width)
      .attr("height", node.height)
      .attr("fill", "#1a1a1a")
      .attr("stroke", "#d4af37")
      .attr("stroke-width", 2.5)
      .attr("rx", 2);

    // Chip pins
    const chipPinCount = 6;
    for (let i = 0; i < chipPinCount; i++) {
      const offset = (node.height / (chipPinCount + 1)) * (i + 1);
      chipGroup
        .append("rect")
        .attr("x", -3)
        .attr("y", offset - 1.5)
        .attr("width", 3)
        .attr("height", 3)
        .attr("fill", "#d4af37");
      chipGroup
        .append("rect")
        .attr("x", node.width)
        .attr("y", offset - 1.5)
        .attr("width", 3)
        .attr("height", 3)
        .attr("fill", "#d4af37");
    }

    // Chip label with scaled font size
    chipGroup
      .append("text")
      .text(node.label)
      .attr("x", node.width / 2)
      .attr("y", node.height / 2 + 5 * chipScale)
      .attr("text-anchor", "middle")
      .attr("fill", "#d4af37")
      .attr("font-size", `${11 * chipScale}px`)
      .attr("font-weight", "600")
      .attr("font-family", "monospace");
  });

  // Draw job chips (smaller)
  jobNodes.forEach((node) => {
    const chipGroup = g
      .append("g")
      .datum(node)
      .attr("transform", `translate(${node.x},${node.y})`)
      .style("cursor", "move")
      .call(dragBehavior)
      .on("mouseenter", function () {
        d3.select(this).select("rect").attr("fill", "rgba(212, 175, 55, 0.15)");
      })
      .on("mouseleave", function () {
        d3.select(this).select("rect").attr("fill", "#0a0a0a");
      });

    chipGroup
      .append("rect")
      .attr("width", node.width)
      .attr("height", node.height)
      .attr("fill", "#0a0a0a")
      .attr("stroke", "#d4af37")
      .attr("stroke-width", 1.5)
      .attr("rx", 1);

    // Small pins
    const jobPinCount = 4;
    for (let i = 0; i < jobPinCount; i++) {
      const offset = (node.height / (jobPinCount + 1)) * (i + 1);
      chipGroup
        .append("rect")
        .attr("x", -2)
        .attr("y", offset - 1)
        .attr("width", 2)
        .attr("height", 2)
        .attr("fill", "#d4af37");
      chipGroup
        .append("rect")
        .attr("x", node.width)
        .attr("y", offset - 1)
        .attr("width", 2)
        .attr("height", 2)
        .attr("fill", "#d4af37");
    }

    chipGroup
      .append("text")
      .text(node.label)
      .attr("x", node.width / 2)
      .attr("y", node.height / 2 + 4 * chipScale)
      .attr("text-anchor", "middle")
      .attr("fill", "#d4af37")
      .attr("font-size", `${8 * chipScale * 0.7}px`)
      .attr("font-family", "monospace");
  });
}

// ===== RINGS STYLE =====
function renderRingsStyle(
  svg: SVGSVGElement,
  onNavigate: (section: number) => void,
  options: DiagramStyleOptions,
) {
  const width = 1000;
  const height = 500;
  d3.select(svg).selectAll("*").remove();

  const svgSelection = d3
    .select(svg)
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = svgSelection.append("g");
  const centerX = width / 2;
  const centerY = height / 2;

  const ringCount = options.ringCount || 3;
  const ringSpacing = options.ringSpacing || 80;

  // Draw concentric rings
  for (let i = 1; i <= ringCount; i++) {
    g.append("circle")
      .attr("cx", centerX)
      .attr("cy", centerY)
      .attr("r", i * ringSpacing)
      .attr("fill", "none")
      .attr("stroke", "rgba(212, 175, 55, 0.2)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "5,5");
  }

  // Nodes in rings
  const nodes = [
    { id: "center", label: "HD", ring: 0, angle: 0, size: 50, sectionIndex: 0 },
    {
      id: "skills",
      label: "Skills",
      ring: 1,
      angle: -Math.PI / 2,
      size: 40,
      sectionIndex: 1,
    },
    {
      id: "experience",
      label: "Experience",
      ring: 1,
      angle: (5 * Math.PI) / 6,
      size: 40,
      sectionIndex: 2,
    },
    {
      id: "education",
      label: "Education",
      ring: 1,
      angle: Math.PI / 6,
      size: 40,
      sectionIndex: 2 + resumeData.experience.length,
    },
  ];

  // Add jobs in outer ring
  resumeData.experience.forEach((job, i) => {
    const angleSpan = (Math.PI * 2) / resumeData.experience.length;
    nodes.push({
      id: `job-${i}`,
      label: (job.navLabel || job.company).substring(0, 10),
      ring: 2,
      angle: i * angleSpan,
      size: 30,
      sectionIndex: 2 + i,
    });
  });

  const nodeGroups = g
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("transform", (d) => {
      if (d.ring === 0) return `translate(${centerX},${centerY})`;
      const x = centerX + Math.cos(d.angle) * d.ring * ringSpacing;
      const y = centerY + Math.sin(d.angle) * d.ring * ringSpacing;
      return `translate(${x},${y})`;
    })
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      if (d.sectionIndex !== undefined) {
        onNavigate(d.sectionIndex);
      }
    });

  // Orbiting circles
  nodeGroups
    .append("circle")
    .attr("r", (d) => d.size)
    .attr("fill", "rgba(30, 30, 30, 0.9)")
    .attr("stroke", "#d4af37")
    .attr("stroke-width", 2)
    .style("filter", "drop-shadow(0 0 5px rgba(212, 175, 55, 0.5))");

  nodeGroups
    .append("text")
    .text((d) => d.label)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("fill", "#d4af37")
    .attr("font-size", (d) => (d.ring === 0 ? "14px" : "10px"))
    .style("pointer-events", "none");
}

// ===== TREE STYLE =====
function renderTreeStyle(
  svg: SVGSVGElement,
  onNavigate: (section: number) => void,
  options: DiagramStyleOptions,
) {
  const width = 1000;
  const height = 500;
  d3.select(svg).selectAll("*").remove();

  const svgSelection = d3
    .select(svg)
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = svgSelection.append("g");

  const branchAngle = (options.branchAngle || 45) * (Math.PI / 180);

  // Tree structure
  const rootX = width / 2;
  const rootY = height - 50;

  const nodes = [
    {
      id: "center",
      label: "HD",
      x: rootX,
      y: rootY,
      r: 25,
      sectionIndex: 0,
      type: "trunk",
    },
    {
      id: "skills",
      label: "Skills",
      x: rootX - 150,
      y: rootY - 150,
      r: 20,
      sectionIndex: 1,
      type: "branch",
    },
    {
      id: "experience",
      label: "Experience",
      x: rootX,
      y: rootY - 200,
      r: 20,
      sectionIndex: 2,
      type: "branch",
    },
    {
      id: "education",
      label: "Education",
      x: rootX + 150,
      y: rootY - 150,
      r: 20,
      sectionIndex: 2 + resumeData.experience.length,
      type: "branch",
    },
  ];

  // Add jobs as leaves
  const expNode = nodes[2];
  resumeData.experience.forEach((job, i) => {
    const spreadAngle = branchAngle * 2;
    const angle =
      -Math.PI / 2 +
      (spreadAngle * (i / (resumeData.experience.length - 1 || 1)) -
        spreadAngle / 2);
    const dist = 80;
    nodes.push({
      id: `job-${i}`,
      label: (job.navLabel || job.company).substring(0, 8),
      x: expNode.x + Math.cos(angle) * dist,
      y: expNode.y + Math.sin(angle) * dist,
      r: 15,
      sectionIndex: 2 + i,
      type: "leaf",
    });
  });

  // Draw branches
  const branches = g.append("g");

  // Trunk to main branches
  [nodes[1], nodes[2], nodes[3]].forEach((node) => {
    branches
      .append("path")
      .attr(
        "d",
        `M ${rootX} ${rootY} Q ${rootX} ${(rootY + node.y) / 2} ${node.x} ${
          node.y
        }`,
      )
      .attr("stroke", "rgba(139, 69, 19, 0.6)")
      .attr("stroke-width", 8)
      .attr("fill", "none")
      .attr("stroke-linecap", "round");
  });

  // Experience to jobs
  nodes.slice(4).forEach((leaf) => {
    branches
      .append("path")
      .attr("d", `M ${expNode.x} ${expNode.y} L ${leaf.x} ${leaf.y}`)
      .attr("stroke", "rgba(139, 69, 19, 0.4)")
      .attr("stroke-width", 3)
      .attr("fill", "none");
  });

  // Draw nodes
  const nodeGroups = g
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("transform", (d) => `translate(${d.x},${d.y})`)
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      if (d.sectionIndex !== undefined) {
        onNavigate(d.sectionIndex);
      }
    });

  // Node circles
  nodeGroups
    .append("circle")
    .attr("r", (d) => d.r)
    .attr("fill", (d) =>
      d.type === "leaf" ? "rgba(34, 139, 34, 0.8)" : "rgba(139, 69, 19, 0.9)",
    )
    .attr("stroke", "#d4af37")
    .attr("stroke-width", 2);

  nodeGroups
    .append("text")
    .text((d) => d.label)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("fill", "#fff")
    .attr("font-size", (d) =>
      d.type === "trunk" ? "12px" : d.type === "leaf" ? "8px" : "10px",
    )
    .style("pointer-events", "none");
}

// ===== GALAXY STYLE =====
// ===== NEURAL NETWORK STYLE =====
function renderNeuralStyle(
  svg: SVGSVGElement,
  onNavigate: (section: number) => void,
  options: DiagramStyleOptions,
) {
  const width = 1000;
  const height = 500;
  d3.select(svg).selectAll("*").remove();

  const svgSelection = d3
    .select(svg)
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const g = svgSelection.append("g");

  // Layer-based layout
  const layers = [
    [{ id: "center", label: "HD", sectionIndex: 0 }],
    [
      { id: "skills", label: "Skills", sectionIndex: 1 },
      { id: "experience", label: "Experience", sectionIndex: 2 },
      {
        id: "education",
        label: "Education",
        sectionIndex: 2 + resumeData.experience.length,
      },
    ],
    resumeData.experience.map((job, i) => ({
      id: `job-${i}`,
      label: (job.navLabel || job.company).substring(0, 8),
      sectionIndex: 2 + i,
    })),
  ];

  const nodes: any[] = [];
  const layerSpacing = width / (layers.length + 1);

  layers.forEach((layer, layerIdx) => {
    const layerHeight = height / (layer.length + 1);
    layer.forEach((node, nodeIdx) => {
      nodes.push({
        ...node,
        x: layerSpacing * (layerIdx + 1),
        y: layerHeight * (nodeIdx + 1),
        r: layerIdx === 0 ? 30 : layerIdx === 1 ? 25 : 18,
      });
    });
  });

  // Draw connections (synapses)
  const connections = g.append("g");
  nodes.forEach((source, i) => {
    nodes.slice(i + 1).forEach((target) => {
      if (Math.abs(source.x - target.x) < layerSpacing * 1.5) {
        connections
          .append("line")
          .attr("x1", source.x)
          .attr("y1", source.y)
          .attr("x2", target.x)
          .attr("y2", target.y)
          .attr("stroke", "rgba(0, 255, 255, 0.15)")
          .attr("stroke-width", 1.5)
          .attr("class", "synapse");
      }
    });
  });

  // Pulsing animation on synapses
  const pulseSpeed = options.pulseSpeed || 2;
  connections
    .selectAll(".synapse")
    .transition()
    .duration(1000 / pulseSpeed)
    .attr("stroke", "rgba(0, 255, 255, 0.4)")
    .transition()
    .duration(1000 / pulseSpeed)
    .attr("stroke", "rgba(0, 255, 255, 0.15)")
    .on("end", function repeat() {
      d3.select(this)
        .transition()
        .duration(1000 / pulseSpeed)
        .attr("stroke", "rgba(0, 255, 255, 0.4)")
        .transition()
        .duration(1000 / pulseSpeed)
        .attr("stroke", "rgba(0, 255, 255, 0.15)")
        .on("end", repeat);
    });

  // Draw neurons
  const neurons = g
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("transform", (d) => `translate(${d.x},${d.y})`)
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      if (d.sectionIndex !== undefined) {
        onNavigate(d.sectionIndex);
      }
    });

  // Neuron glow
  neurons
    .append("circle")
    .attr("r", (d) => d.r * 1.5)
    .attr("fill", "rgba(0, 255, 255, 0.1)");

  // Neuron body
  neurons
    .append("circle")
    .attr("r", (d) => d.r)
    .attr("fill", "rgba(0, 128, 128, 0.8)")
    .attr("stroke", "#00ffff")
    .attr("stroke-width", 2)
    .style("filter", "drop-shadow(0 0 8px rgba(0, 255, 255, 0.6))");

  neurons
    .append("text")
    .text((d) => d.label)
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("fill", "#fff")
    .attr("font-size", (d) => (d.r > 25 ? "11px" : "8px"))
    .style("pointer-events", "none");
}

export default ResumeStructureDiagram;
