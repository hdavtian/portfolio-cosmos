import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import {
  FIRST_YEAR,
  LAST_YEAR,
  YEARS,
  categoryTotals,
  headlineCategories,
  places,
  say,
  skillTotals,
  skillsLiveIn,
} from "./skillsData";
import "./skillsLab.css";

/**
 * Sketches for showing how long each skill has been in play. Not wired into
 * the site: it reads the mock data (src/data/mock/skillTimeline.json) so the
 * shapes can be judged before anything is built for real.
 */
export function SkillsLabPage() {
  const year = useScrollYear();

  return (
    <div className="lab">
      <header className="lab__head">
        <p className="lab__eyebrow">Sketches · mock data</p>
        <h1 className="lab__title">Twenty-five years, four ways</h1>
        <p className="lab__lede">
          Every panel below reads the same mock timeline. Scroll: the year marker moves with you, from the first
          line of HTML to today.
        </p>
      </header>

      <YearRail year={year} />

      <section className="lab__panel">
        <h2 className="lab__panel-title">01 · Counters</h2>
        <p className="lab__panel-note">The answer to "how many years of…", counted up as the page arrives.</p>
        <Counters />
      </section>

      <section className="lab__panel">
        <h2 className="lab__panel-title">02 · Career ribbon</h2>
        <p className="lab__panel-note">
          Every skill as a bar across the calendar. The panel holds still while you scroll through it, drawing
          2000 to today left to right; when it reaches the end the page carries on.
        </p>
      </section>
      <RibbonLock />

      <section className="lab__panel">
        <h2 className="lab__panel-title">03 · What the stack looked like</h2>
        <p className="lab__panel-note">
          A stream of categories: thickness is how many skills were live that year. You can see the shift from
          hand-built sites to frameworks and cloud.
        </p>
        <Stream year={year} />
      </section>

      <section className="lab__panel">
        <h2 className="lab__panel-title">04 · Terrain</h2>
        <p className="lab__panel-note">
          The same numbers as a landscape: years run left to right, categories run back, and height is how many
          skills in that category were live that year. Drag to turn it.
        </p>
        <Terrain />
      </section>

      <section className="lab__panel">
        <h2 className="lab__panel-title">05 · The grid</h2>
        <p className="lab__panel-note">
          Categories by job, with the years in the cells. Click a row to open it up and see which skills those
          years came from.
        </p>
        <Matrix />
      </section>

      <footer className="lab__foot">
        <p>Mock data. Numbers are estimates until the real ones are entered.</p>
      </footer>
    </div>
  );
}

/** The year the page is "at", driven by scroll position. */
function useScrollYear() {
  const [year, setYear] = useState(FIRST_YEAR);
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      setYear(FIRST_YEAR + ratio * (LAST_YEAR - FIRST_YEAR));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return year;
}

function YearRail({ year }: { year: number }) {
  const live = skillsLiveIn(year);
  return (
    <div className="lab__rail">
      <span className="lab__rail-year">{Math.round(year)}</span>
      <span className="lab__rail-live">{live} skills in play</span>
      <span className="lab__rail-track">
        <span className="lab__rail-fill" style={{ width: `${((year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR)) * 100}%` }} />
      </span>
    </div>
  );
}

function Counters() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShown(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="lab-counters" ref={ref}>
      {headlineCategories.map((category) => (
        <div key={category.slug} className="lab-counter">
          <CountUp to={category.years} run={shown} />
          <span className="lab-counter__label">{category.name}</span>
          <span className="lab-counter__range">
            {Math.round(category.first)}–{category.last >= LAST_YEAR - 1 ? "now" : Math.round(category.last)}
          </span>
        </div>
      ))}
    </div>
  );
}

function CountUp({ to, run }: { to: number; run: boolean }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1100);
      setValue(to * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, to]);
  return (
    <span className="lab-counter__value">
      {value >= 10 ? Math.floor(value) : value.toFixed(1)}
      <span className="lab-counter__unit">yrs</span>
    </span>
  );
}

const CATEGORY_COLOURS = d3.scaleOrdinal<string, string>(
  categoryTotals.map((category) => category.slug),
  ["#6ad7ff", "#7ae29c", "#ffd084", "#ff9ecb", "#a7b6ff", "#b8ffd9", "#ffb8ef", "#ffe2b3", "#9beaff", "#d6f4ff"],
);

/** How far a tall wrapper has been scrolled through, 0 to 1, while its stage is pinned. */
function useLockProgress(ref: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const element = ref.current;
      if (!element) return;
      const box = element.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      setProgress(travel > 0 ? Math.min(1, Math.max(0, -box.top / travel)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref]);
  return progress;
}

/** The size of an element, so an SVG can be drawn in real pixels. */
function useBox(ref: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return box;
}

/**
 * The ribbon, squeezed to one screen and played left to right: the section is
 * tall, the panel sticks to the viewport while it passes, and page scrolling
 * resumes once the last year is drawn.
 */
function RibbonLock() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const progress = useLockProgress(wrapRef);
  const box = useBox(plotRef);
  const rows = useMemo(() => skillTotals.filter((skill) => !skill.parent), []);

  const LEFT = 215;
  const RIGHT = 18;
  const AXIS = 22;

  useEffect(() => {
    const { width, height } = box;
    if (!width || !height) return;
    const svg = d3.select(svgRef.current);
    svg.attr("viewBox", `0 0 ${width} ${height}`).selectAll("*").remove();

    const rowHeight = (height - AXIS - 6) / rows.length;
    const x = d3.scaleLinear().domain([FIRST_YEAR, LAST_YEAR]).range([LEFT, width - RIGHT]);

    svg
      .append("clipPath")
      .attr("id", "lab-ribbon-clip")
      .append("rect")
      .attr("class", "lab-ribbon__clip-rect")
      .attr("x", LEFT)
      .attr("y", 0)
      .attr("height", height);

    svg
      .append("g")
      .attr("class", "lab-ribbon__axis")
      .attr("transform", `translate(0,${height - AXIS})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(width < 700 ? 5 : 9));

    const row = svg
      .selectAll(".lab-ribbon__row")
      .data(rows)
      .join("g")
      .attr("class", "lab-ribbon__row")
      .attr("transform", (_, i) => `translate(0,${i * rowHeight + 3})`);

    row
      .append("text")
      .attr("class", "lab-ribbon__label")
      .attr("x", LEFT - 10)
      .attr("y", rowHeight * 0.72)
      .attr("text-anchor", "end")
      .style("font-size", `${Math.min(11, rowHeight * 0.62)}px`)
      .text((skill) => (skill.name.length > 26 ? `${skill.name.slice(0, 25)}…` : skill.name));

    row
      .append("line")
      .attr("class", "lab-ribbon__guide")
      .attr("x1", LEFT)
      .attr("x2", width - RIGHT)
      .attr("y1", rowHeight * 0.5)
      .attr("y2", rowHeight * 0.5);

    row
      .selectAll(".lab-ribbon__bar")
      .data((skill) => skill.spans)
      .join("rect")
      .attr("class", (span) => `lab-ribbon__bar${span.exact ? " is-exact" : ""}`)
      .attr("clip-path", "url(#lab-ribbon-clip)")
      .attr("x", (span) => x(span.from))
      .attr("y", rowHeight * 0.16)
      .attr("height", Math.max(3, rowHeight * 0.66))
      .attr("width", (span) => Math.max(2, x(span.to) - x(span.from)))
      .attr("fill", (span) => CATEGORY_COLOURS(span.categories[0] ?? "backend"))
      .append("title")
      .text((span) => `${span.skillName} · ${span.placeName} · ${Math.round(span.from)}–${Math.round(span.to)}`);
  }, [box, rows]);

  // Only the reveal moves as you scroll, so the chart itself is never redrawn.
  useEffect(() => {
    const { width } = box;
    if (!width) return;
    const plotWidth = width - RIGHT - LEFT;
    d3.select(svgRef.current).select(".lab-ribbon__clip-rect").attr("width", plotWidth * progress);
  }, [box, progress]);

  const year = FIRST_YEAR + progress * (LAST_YEAR - FIRST_YEAR);
  const live = skillsLiveIn(year);
  const markerLeft = box.width ? LEFT + (box.width - LEFT - RIGHT) * progress : 0;

  return (
    <div className="lab-lock" ref={wrapRef}>
      <div className="lab-lock__stage">
        <div className="lab-lock__head">
          <span className="lab-lock__year">{Math.round(year)}</span>
          <span className="lab-lock__live">{live} skills in play</span>
          <span className="lab-lock__hint">{progress >= 0.999 ? "done — keep scrolling" : "scroll to play"}</span>
        </div>
        <div className="lab-ribbon" ref={plotRef}>
          <svg ref={svgRef} className="lab-ribbon__svg" role="img" aria-label="Every skill as a bar across the calendar" />
          <span className="lab-ribbon__now" style={{ left: `${markerLeft}px`, opacity: progress > 0.004 ? 1 : 0 }} />
        </div>
      </div>
    </div>
  );
}

function Stream({ year }: { year: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = d3.select(ref.current);
    const width = 980;
    const height = 320;
    svg.attr("viewBox", `0 0 ${width} ${height}`).selectAll("*").remove();

    const keys = categoryTotals.filter((category) => !category.era).map((category) => category.slug);
    const rows = YEARS.map((yearValue, index) => {
      const row: Record<string, number> = { year: yearValue };
      for (const category of categoryTotals) if (keys.includes(category.slug)) row[category.slug] = category.perYear[index];
      return row;
    });

    const stack = d3.stack<Record<string, number>>().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut);
    const series = stack(rows);
    const x = d3.scaleLinear().domain([FIRST_YEAR, LAST_YEAR]).range([0, width]);
    const y = d3
      .scaleLinear()
      .domain([d3.min(series, (layer) => d3.min(layer, (point) => point[0]))!, d3.max(series, (layer) => d3.max(layer, (point) => point[1]))!])
      .range([height - 24, 10]);

    const area = d3
      .area<d3.SeriesPoint<Record<string, number>>>()
      .x((point) => x(point.data.year))
      .y0((point) => y(point[0]))
      .y1((point) => y(point[1]))
      .curve(d3.curveBasis);

    svg
      .selectAll("path")
      .data(series)
      .join("path")
      .attr("d", area)
      .attr("fill", (layer) => CATEGORY_COLOURS(layer.key))
      .attr("opacity", 0.85)
      .append("title")
      .text((layer) => categoryTotals.find((category) => category.slug === layer.key)?.name ?? layer.key);

    svg
      .append("g")
      .attr("class", "lab-stream__axis")
      .attr("transform", `translate(0,${height - 20})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(8));
  }, []);

  const ratio = (year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR);
  return (
    <div className="lab-stream">
      <svg ref={ref} className="lab-stream__svg" role="img" aria-label="Categories over time" />
      <span className="lab-stream__now" style={{ left: `${ratio * 100}%` }} />
      <ul className="lab-legend">
        {categoryTotals
          .filter((category) => !category.era)
          .map((category) => (
            <li key={category.slug}>
              <span className="lab-legend__dot" style={{ background: CATEGORY_COLOURS(category.slug) }} />
              {category.name}
            </li>
          ))}
      </ul>
    </div>
  );
}

/**
 * Years across, categories back, height is how many skills of that category
 * were live that year. Labelled on both axes so the shape can be read.
 */
function Terrain() {
  const ref = useRef<HTMLDivElement>(null);
  const [reading, setReading] = useState<string | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    void import("three").then((THREE) => {
      if (disposed) return;
      const rows = categoryTotals.filter((category) => !category.era);
      const cols = YEARS.length;
      const WIDTH = 26;
      const DEPTH = 15;
      const HEIGHT_UNIT = 0.62;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 120);
      const world = new THREE.Group();
      scene.add(world);

      const geometry = new THREE.PlaneGeometry(WIDTH, DEPTH, cols - 1, rows.length - 1);
      const position = geometry.attributes.position;
      const colours = new Float32Array(position.count * 3);
      const heights: number[] = [];
      const peak = Math.max(1, ...rows.flatMap((row) => row.perYear));
      for (let i = 0; i < position.count; i += 1) {
        const col = i % cols;
        const row = Math.min(rows.length - 1, Math.floor(i / cols));
        const value = rows[row].perYear[col] ?? 0;
        heights.push(value);
        const colour = new THREE.Color(CATEGORY_COLOURS(rows[row].slug));
        colour.multiplyScalar(0.3 + (value / peak) * 0.9);
        colours.set([colour.r, colour.g, colour.b], i * 3);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
      const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true, transparent: true, opacity: 0.92 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      world.add(mesh);

      // A label drawn to a canvas, hung in the scene so the axes can be read.
      const label = (text: string, colour: string, scale: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = 448;
        canvas.height = 64;
        const ctx = canvas.getContext("2d")!;
        ctx.font = '600 32px "JetBrains Mono", Menlo, monospace';
        ctx.fillStyle = colour;
        ctx.textBaseline = "middle";
        // Right-aligned, so the axis names stack against the edge of the surface.
        ctx.textAlign = "right";
        ctx.fillText(text, canvas.width - 6, 34);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
        sprite.scale.set(scale * 7, scale, 1);
        return sprite;
      };

      const stepX = WIDTH / (cols - 1);
      YEARS.forEach((yearValue, index) => {
        if (yearValue % 5 !== 0) return;
        const tick = label(String(yearValue), "rgba(232,244,240,0.75)", 0.9);
        tick.position.set(-WIDTH / 2 + index * stepX + 1.4, 0.2, DEPTH / 2 + 1.4);
        world.add(tick);
      });

      const stepZ = DEPTH / (rows.length - 1);
      rows.forEach((row, index) => {
        const tag = label(row.name, CATEGORY_COLOURS(row.slug), 0.78);
        tag.position.set(-WIDTH / 2 - 3.0, 0.5, -DEPTH / 2 + index * stepZ);
        world.add(tag);
      });

      camera.position.set(0, 10, 21);
      camera.lookAt(0, 0, 0);

      const resize = () => {
        renderer.setSize(host.clientWidth, host.clientHeight, false);
        camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      // Drag to turn; otherwise it drifts on its own.
      let spin = 0;
      let drift = true;
      let dragging = false;
      let lastX = 0;
      const down = (event: PointerEvent) => {
        dragging = true;
        drift = false;
        lastX = event.clientX;
        host.setPointerCapture(event.pointerId);
      };
      const move = (event: PointerEvent) => {
        if (!dragging) return;
        spin += (event.clientX - lastX) * 0.006;
        lastX = event.clientX;
      };
      const up = () => {
        dragging = false;
      };
      host.addEventListener("pointerdown", down);
      host.addEventListener("pointermove", move);
      host.addEventListener("pointerup", up);
      host.addEventListener("pointerleave", up);

      let frame = 0;
      const start = performance.now();
      const render = () => {
        const time = (performance.now() - start) / 1000;
        // The surface settles into its real heights, then breathes gently.
        const rise = Math.min(1, time / 1.6);
        for (let i = 0; i < position.count; i += 1) {
          position.setZ(i, heights[i] * HEIGHT_UNIT * rise + Math.sin(time * 0.9 + i * 0.07) * 0.07);
        }
        position.needsUpdate = true;
        if (drift) spin = Math.sin(time * 0.12) * 0.28;
        world.rotation.y = spin;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);

      const busiest = YEARS.map((yearValue, index) => ({
        year: yearValue,
        total: rows.reduce((sum, row) => sum + row.perYear[index], 0),
      })).sort((a, b) => b.total - a.total)[0];
      setReading(`Tallest ridge: ${busiest.year}, ${busiest.total} skills live across ${rows.length} categories.`);

      cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", resize);
        host.removeEventListener("pointerdown", down);
        host.removeEventListener("pointermove", move);
        host.removeEventListener("pointerup", up);
        host.removeEventListener("pointerleave", up);
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
  }, []);

  return (
    <>
      <div ref={ref} className="lab-terrain" aria-label="Skills as a landscape" />
      <p className="lab-terrain__reading">{reading ?? "Height is skills live that year."}</p>
    </>
  );
}

/** Categories by job, opening up into the skills underneath them. */
function Matrix() {
  const [open, setOpen] = useState<string[]>([]);
  const rows = useMemo(() => categoryTotals.filter((category) => category.years > 0), []);
  const skillsBySlug = useMemo(() => new Map(skillTotals.map((skill) => [skill.slug, skill])), []);
  const maxYears = Math.max(...rows.flatMap((row) => [...row.byPlace.values()]));

  const toggle = (slug: string) =>
    setOpen((current) => (current.includes(slug) ? current.filter((entry) => entry !== slug) : [...current, slug]));

  const cell = (years: number, colour: string) =>
    years > 0.05 ? (
      <span className="lab-matrix__cell" style={{ opacity: 0.3 + (years / maxYears) * 0.7, background: colour }}>
        {years >= 1 ? Math.round(years) : "<1"}
      </span>
    ) : null;

  return (
    <div className="lab-matrix">
      <table>
        <thead>
          <tr>
            <th>Category</th>
            {places.map((place) => (
              <th key={place.slug} title={`${place.name} · ${Math.round(place.from)}–${Math.round(place.to)}`}>
                {place.short}
              </th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((category) => {
            const isOpen = open.includes(category.slug);
            return (
              <Fragments key={category.slug}>
                <tr className={`lab-matrix__group${isOpen ? " is-open" : ""}`}>
                  <th scope="row">
                    <button type="button" className="lab-matrix__toggle" onClick={() => toggle(category.slug)} aria-expanded={isOpen}>
                      <span className="lab-matrix__chevron" aria-hidden="true">
                        {isOpen ? "–" : "+"}
                      </span>
                      {category.name}
                      <span className="lab-matrix__count">{category.skills.length}</span>
                    </button>
                  </th>
                  {places.map((place) => (
                    <td key={place.slug}>{cell(category.byPlace.get(place.slug) ?? 0, CATEGORY_COLOURS(category.slug))}</td>
                  ))}
                  <td className="lab-matrix__total">{say(category.years)}</td>
                </tr>
                {isOpen
                  ? category.skills.map((slug) => {
                      const skill = skillsBySlug.get(slug);
                      if (!skill) return null;
                      return (
                        <tr key={`${category.slug}-${slug}`} className="lab-matrix__detail">
                          <th scope="row">{skill.name}</th>
                          {places.map((place) => {
                            const span = skill.spans.find((entry) => entry.place === place.slug);
                            return <td key={place.slug}>{cell(span ? span.to - span.from : 0, "rgba(232,244,240,0.75)")}</td>;
                          })}
                          <td className="lab-matrix__total">{say(skill.years)}</td>
                        </tr>
                      );
                    })
                  : null}
              </Fragments>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A table body can't take a wrapper element, so group rows with a fragment. */
function Fragments({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
