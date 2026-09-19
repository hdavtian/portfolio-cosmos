import { useEffect, useMemo, useRef, useState } from "react";
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
  spans,
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
        <h1 className="lab__title">Twenty-five years, six ways</h1>
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
          Every skill as a bar across the calendar. Exact ranges are solid, estimates are hatched. The line follows
          your scroll.
        </p>
        <Ribbon year={year} />
      </section>

      <section className="lab__panel">
        <h2 className="lab__panel-title">03 · What the stack looked like</h2>
        <p className="lab__panel-note">
          A stream of categories: thickness is how many skills were live that year. You can see the shift from
          hand-built sites to frameworks and cloud.
        </p>
        <Stream year={year} />
      </section>

      <section className="lab__panel">
        <h2 className="lab__panel-title">04 · Pulse</h2>
        <p className="lab__panel-note">
          A heartbeat where each beat is a year: the taller the spike, the more skills in play. It runs on its own,
          left to right, and starts again at the beginning.
        </p>
        <Pulse />
      </section>

      <section className="lab__panel">
        <h2 className="lab__panel-title">05 · Terrain</h2>
        <p className="lab__panel-note">
          The same numbers as a landscape: years run one way, categories the other, height is depth of work. It
          breathes, and turns slowly.
        </p>
        <Terrain />
      </section>

      <section className="lab__panel">
        <h2 className="lab__panel-title">06 · The grid</h2>
        <p className="lab__panel-note">Your table, with the years in the cells: where each skill was used, and for how long.</p>
        <Matrix />
      </section>

      <section className="lab__panel">
        <h2 className="lab__panel-title">07 · Rings</h2>
        <p className="lab__panel-note">Categories as arcs; length is years, so the shape of the career reads at a glance.</p>
        <Rings />
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

function Ribbon({ year }: { year: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const rows = useMemo(() => skillTotals.filter((skill) => !skill.parent), []);

  useEffect(() => {
    const svg = d3.select(ref.current);
    const width = 980;
    const rowHeight = 22;
    const height = rows.length * rowHeight + 34;
    svg.attr("viewBox", `0 0 ${width} ${height}`).selectAll("*").remove();

    const x = d3.scaleLinear().domain([FIRST_YEAR, LAST_YEAR]).range([190, width - 20]);

    svg
      .append("g")
      .attr("class", "lab-ribbon__axis")
      .attr("transform", `translate(0,${height - 22})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(8));

    const row = svg
      .selectAll(".lab-ribbon__row")
      .data(rows)
      .join("g")
      .attr("class", "lab-ribbon__row")
      .attr("transform", (_, i) => `translate(0,${i * rowHeight + 8})`);

    row
      .append("text")
      .attr("class", "lab-ribbon__label")
      .attr("x", 182)
      .attr("y", 12)
      .attr("text-anchor", "end")
      .text((skill) => skill.name);

    row
      .selectAll(".lab-ribbon__bar")
      .data((skill) => skill.spans)
      .join("rect")
      .attr("class", (span) => `lab-ribbon__bar${span.exact ? " is-exact" : ""}`)
      .attr("x", (span) => x(span.from))
      .attr("y", 3)
      .attr("height", rowHeight - 9)
      .attr("width", (span) => Math.max(2, x(span.to) - x(span.from)))
      .attr("fill", (span) => CATEGORY_COLOURS(span.categories[0] ?? "backend"))
      .append("title")
      .text((span) => `${span.skillName} · ${span.placeName} · ${Math.round(span.from)}–${Math.round(span.to)}`);
  }, [rows]);

  const ratio = (year - FIRST_YEAR) / (LAST_YEAR - FIRST_YEAR);
  return (
    <div className="lab-ribbon">
      <svg ref={ref} className="lab-ribbon__svg" role="img" aria-label="Every skill as a bar across the calendar" />
      <span className="lab-ribbon__now" style={{ left: `calc(19.4% + ${ratio * 78}%)` }} />
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

/** A heartbeat trace: one beat per year, amplitude from how much was in play. */
function Pulse() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const beats = YEARS.map((yearValue) => ({ year: yearValue, live: skillsLiveIn(yearValue) }));
    const peak = Math.max(...beats.map((beat) => beat.live));
    let frame = 0;
    let head = 0;
    const speed = 0.22; // years per frame-ish

    const draw = () => {
      const { width, height } = canvas;
      ctx.fillStyle = "rgba(6, 10, 14, 0.18)";
      ctx.fillRect(0, 0, width, height);

      const mid = height * 0.62;
      const step = width / (beats.length - 1);
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = "#7ae29c";
      ctx.shadowColor = "rgba(122, 226, 156, 0.8)";
      ctx.shadowBlur = 12 * dpr;
      ctx.beginPath();
      ctx.moveTo(0, mid);

      for (let i = 0; i < beats.length; i += 1) {
        const x = i * step;
        if (x > head * step) break;
        const amplitude = (beats[i].live / peak) * height * 0.42;
        // A beat: small dip, tall spike, overshoot, settle.
        ctx.lineTo(x - step * 0.34, mid);
        ctx.lineTo(x - step * 0.22, mid + amplitude * 0.16);
        ctx.lineTo(x - step * 0.1, mid - amplitude);
        ctx.lineTo(x, mid + amplitude * 0.34);
        ctx.lineTo(x + step * 0.12, mid);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      const headIndex = Math.min(beats.length - 1, Math.floor(head));
      ctx.fillStyle = "#eafff4";
      ctx.beginPath();
      ctx.arc(headIndex * step, mid, 3 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `${12 * dpr}px "JetBrains Mono", monospace`;
      ctx.fillStyle = "rgba(234, 255, 244, 0.75)";
      ctx.fillText(`${beats[headIndex].year}  ${beats[headIndex].live} skills`, 10 * dpr, 20 * dpr);

      head += speed;
      if (head > beats.length + 6) {
        head = 0;
        ctx.fillStyle = "#060a0e";
        ctx.fillRect(0, 0, width, height);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="lab-pulse" aria-label="A heartbeat of skills in play per year" />;
}

/** Years across, categories deep, height is how much was in play: a landscape that breathes. */
function Terrain() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    void import("three").then((THREE) => {
      if (disposed) return;
      const rows = categoryTotals.filter((category) => !category.era);
      const cols = YEARS.length;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      const size = () => renderer.setSize(host.clientWidth, host.clientHeight, false);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      const geometry = new THREE.PlaneGeometry(26, 10, cols - 1, rows.length - 1);
      const colours = new Float32Array(geometry.attributes.position.count * 3);
      const heights: number[] = [];
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i += 1) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const category = rows[Math.min(rows.length - 1, row)];
        const value = category.perYear[col] ?? 0;
        heights.push(value);
        const colour = new THREE.Color(CATEGORY_COLOURS(category.slug));
        colour.multiplyScalar(0.35 + Math.min(1, value / 4) * 0.8);
        colours.set([colour.r, colour.g, colour.b], i * 3);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
      const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2.6;
      scene.add(mesh);
      camera.position.set(0, 9, 17);
      camera.lookAt(0, 0, 0);

      const resize = () => {
        size();
        camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      let frame = 0;
      const start = performance.now();
      const render = () => {
        const time = (performance.now() - start) / 1000;
        for (let i = 0; i < position.count; i += 1) {
          const wave = Math.sin(time * 1.2 + i * 0.09) * 0.22;
          position.setZ(i, heights[i] * 0.5 + wave);
        }
        position.needsUpdate = true;
        mesh.rotation.z = Math.sin(time * 0.15) * 0.12;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);

      cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", resize);
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

  return <div ref={ref} className="lab-terrain" aria-label="Skills as a landscape" />;
}

function Matrix() {
  const rows = skillTotals.filter((skill) => !skill.parent).slice(0, 18);
  const maxYears = Math.max(...spans.map((span) => span.to - span.from));
  return (
    <div className="lab-matrix">
      <table>
        <thead>
          <tr>
            <th />
            {places.map((place) => (
              <th key={place.slug}>{place.name.split(" ")[0]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((skill) => (
            <tr key={skill.slug}>
              <th scope="row">{skill.name}</th>
              {places.map((place) => {
                const span = skill.spans.find((entry) => entry.place === place.slug);
                const years = span ? span.to - span.from : 0;
                return (
                  <td key={place.slug}>
                    {years > 0 ? (
                      <span
                        className="lab-matrix__cell"
                        style={{ opacity: 0.25 + (years / maxYears) * 0.75, background: CATEGORY_COLOURS(skill.categories?.[0] ?? "backend") }}
                      >
                        {Math.round(years)}
                      </span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rings() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = d3.select(ref.current);
    const size = 420;
    svg.attr("viewBox", `0 0 ${size} ${size}`).selectAll("*").remove();
    const rows = categoryTotals.filter((category) => category.years > 0).sort((a, b) => b.years - a.years);
    const max = Math.max(...rows.map((row) => row.years));
    const centre = svg.append("g").attr("transform", `translate(${size / 2},${size / 2})`);

    rows.forEach((row, index) => {
      const radius = 40 + index * 17;
      const angle = (row.years / max) * Math.PI * 1.85;
      const arc = d3.arc().innerRadius(radius).outerRadius(radius + 12).startAngle(0);
      centre
        .append("path")
        .attr("d", arc({ endAngle: Math.PI * 1.85 } as d3.DefaultArcObject) as string)
        .attr("fill", "rgba(255,255,255,0.06)");
      const path = centre
        .append("path")
        .attr("fill", CATEGORY_COLOURS(row.slug))
        .attr("opacity", 0.9)
        .attr("d", arc({ endAngle: 0 } as d3.DefaultArcObject) as string);
      path
        .transition()
        .delay(index * 90)
        .duration(1100)
        .attrTween("d", () => {
          const interpolate = d3.interpolate(0, angle);
          return (t) => arc({ endAngle: interpolate(t) } as d3.DefaultArcObject) as string;
        });
      centre
        .append("text")
        .attr("class", "lab-rings__label")
        .attr("x", 6)
        .attr("y", -radius - 2)
        .text(`${row.name}  ${say(row.years)}`);
    });
  }, []);

  return <svg ref={ref} className="lab-rings" role="img" aria-label="Categories as arcs" />;
}
