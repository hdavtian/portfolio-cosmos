import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TechStackTreeNode } from "../../../lib/api/contentV2";
import { useTechStackQuery } from "../../../lib/query/contentQueries";

interface TechConstellationProps {
  /** Technologies of the open project; matching nodes light up with labels. */
  highlights: string[];
  visible: boolean;
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  depth: number;
}

type Link = d3.SimulationLinkDatum<Node>;

// "Node.js" and "nodejs", "React" and "react" should match.
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9#+]/g, "");

/**
 * The published tech stack as a faint, slowly turning constellation behind the
 * work list (the D3 skills graph idea, restyled). Uses the same tree as the
 * Skills Lattice and the cinematic graph.
 */
export function TechConstellation({ highlights, visible }: TechConstellationProps) {
  const tree = useTechStackQuery().data?.payload;
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const graph = useMemo(() => {
    const nodes: Node[] = [];
    const links: Link[] = [];
    const walk = (items: TechStackTreeNode[], parentId: string | null, depth: number) => {
      items.forEach((item) => {
        const id = `${parentId ?? "root"}/${item.slug}`;
        nodes.push({ id, name: item.name, depth });
        if (parentId) links.push({ source: parentId, target: id });
        walk(item.children, id, depth + 1);
      });
    };
    walk(tree ?? [], null, 1);
    return { nodes, links };
  }, [tree]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  // Layout: computed once per tree and size, then left to drift via CSS.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || size.width === 0 || graph.nodes.length === 0) return;

    const nodes = graph.nodes.map((node) => ({ ...node }));
    const links = graph.links.map((link) => ({ ...link }));
    const simulation = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id((d) => d.id).distance((l) => ((l.source as Node).depth === 1 ? 90 : 55)).strength(0.7))
      .force("charge", d3.forceManyBody().strength((d) => ((d as Node).depth === 1 ? -420 : -90)))
      .force("x", d3.forceX(size.width * 0.62).strength(0.04))
      .force("y", d3.forceY(size.height * 0.5).strength(0.06))
      .force("collide", d3.forceCollide(16))
      .stop();
    for (let i = 0; i < 320; i += 1) simulation.tick();

    const root = d3.select(svg).select<SVGGElement>("g.showcase-constellation__graph");
    root.selectAll("*").remove();
    root
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("class", "showcase-constellation__link")
      .attr("x1", (d) => (d.source as Node).x ?? 0)
      .attr("y1", (d) => (d.source as Node).y ?? 0)
      .attr("x2", (d) => (d.target as Node).x ?? 0)
      .attr("y2", (d) => (d.target as Node).y ?? 0);

    const node = root
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("class", "showcase-constellation__node")
      .attr("data-key", (d) => normalize(d.name))
      .attr("data-depth", (d) => d.depth)
      .attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    node.append("circle").attr("r", (d) => (d.depth === 1 ? 4 : 2.4));
    node
      .append("text")
      .attr("x", 10)
      .attr("dy", "0.35em")
      .text((d) => d.name);

    return () => {
      simulation.stop();
    };
  }, [graph, size]);

  // Highlights change without re-running the layout.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const wanted = new Set(highlights.map(normalize));
    d3.select(svg)
      .selectAll<SVGGElement, Node>(".showcase-constellation__node")
      .classed("is-lit", function () {
        return wanted.has(this.getAttribute("data-key") ?? "");
      });
  }, [highlights, graph, size]);

  return (
    <div ref={hostRef} className={`showcase-constellation${visible ? " is-visible" : ""}`} aria-hidden="true">
      <svg ref={svgRef} width={size.width} height={size.height}>
        <g className="showcase-constellation__drift">
          <g className="showcase-constellation__graph" />
        </g>
      </svg>
    </div>
  );
}
