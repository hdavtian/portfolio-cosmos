import { useEffect, useMemo, useRef, useState } from "react";
import type * as ThreeTypes from "three";
import { KIND_BY_PLACE, KIND_ORDER, makeBuilders, type Build } from "./gotBuilders";
import { LAST_YEAR, categories, places, say, spans } from "./skillsData";
import "./skillsTitles.css";

/**
 * A title sequence for the skill timeline: the camera runs a route over a map
 * with hills in it, and every stop builds a different thing out of the ground
 * — a camp of spires, a row of racks, a keep, a skyline — sized by the years
 * spent on each skill there. A running tally burns away on the left, adding
 * everything up as the sequence passes. Scrub it or let it play.
 *
 * Sketch only, mock data, not linked from the site.
 */

interface Entry {
  skill: string;
  name: string;
  years: number;
  categories: string[];
}

export interface City {
  slug: string;
  name: string;
  from: number;
  to: number;
  kind: string;
  entries: Entry[];
  /** Where this stop sits along the route, 0 to 1. */
  at: number;
}

const TOWER_LIMIT = 9;

function buildCities(): City[] {
  const ordered = [...places].sort((a, b) => a.from - b.from);
  return ordered.map((place, index) => ({
    slug: place.slug,
    name: place.name,
    from: place.from,
    to: place.to,
    kind: KIND_BY_PLACE[place.slug] ?? KIND_ORDER[index % KIND_ORDER.length],
    entries: spans
      .filter((span) => span.place === place.slug)
      .map((span) => ({
        skill: span.skill,
        name: span.skillName,
        years: span.to - span.from,
        categories: span.categories,
      }))
      .sort((a, b) => b.years - a.years),
    at: ordered.length > 1 ? index / (ordered.length - 1) : 0,
  }));
}

/** How far a stop has been built at this point in the run: the scene uses the same curve. */
function builtAt(city: City, progress: number) {
  if (progress > city.at) return 1;
  const rise = Math.max(0, Math.min(1, (0.13 - Math.abs(progress - city.at)) / 0.1));
  return 1 - Math.pow(1 - rise, 3);
}

/**
 * The year under the scrubber. Stops sit evenly along the route, so the clock
 * runs between the years of the stops either side rather than straight down
 * the calendar — that way the readout matches the place on screen.
 */
function yearAt(cities: City[], progress: number) {
  const step = 1 / (cities.length - 1);
  const index = Math.min(cities.length - 2, Math.floor(progress / step));
  const within = (progress - index * step) / step;
  const from = cities[index].from;
  const to = index + 2 < cities.length ? cities[index + 1].from : LAST_YEAR;
  return from + (to - from) * within;
}

interface TallyRow {
  slug: string;
  name: string;
  years: number;
  hot: boolean;
  skills: Array<{ name: string; years: number }>;
}

/** Everything built so far, added up: years per category, and per skill inside it. */
function tallyAt(cities: City[], progress: number): TallyRow[] {
  const byCategory = new Map<string, { years: number; hot: boolean; skills: Map<string, number> }>();
  for (const city of cities) {
    const built = builtAt(city, progress);
    if (built <= 0.001) continue;
    const rising = built < 0.999;
    for (const entry of city.entries) {
      for (const slug of entry.categories) {
        const row = byCategory.get(slug) ?? { years: 0, hot: false, skills: new Map<string, number>() };
        row.years += entry.years * built;
        row.hot = row.hot || rising;
        row.skills.set(entry.name, (row.skills.get(entry.name) ?? 0) + entry.years * built);
        byCategory.set(slug, row);
      }
    }
  }
  return categories
    .filter((category) => byCategory.has(category.slug))
    .map((category) => {
      const row = byCategory.get(category.slug)!;
      return {
        slug: category.slug,
        name: category.name,
        years: row.years,
        hot: row.hot,
        skills: [...row.skills.entries()]
          .map(([name, years]) => ({ name, years }))
          .sort((a, b) => b.years - a.years),
      };
    })
    .sort((a, b) => b.years - a.years);
}

export function SkillsTitlesPage() {
  const cities = useMemo(buildCities, []);
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [openRows, setOpenRows] = useState<string[]>([]);

  // The scene reads progress from the ref every frame, so scrubbing never
  // re-runs the setup.
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    void import("three").then((THREE) => {
      if (disposed) return;
      const builders = makeBuilders(THREE);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setClearColor(0x05070b, 1);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x05070b, 120, 470);
      const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 900);

      // The land itself: low hills, so the route rises and falls.
      const heightAt = (x: number, z: number) =>
        Math.sin(x * 0.0075) * 8 + Math.cos(z * 0.021) * 4.5 + Math.sin(x * 0.026 + z * 0.014) * 2.6;

      const terrain = new THREE.PlaneGeometry(2200, 760, 150, 60);
      const position = terrain.attributes.position;
      for (let i = 0; i < position.count; i += 1) {
        // The plane is still flat here, so its y is the world z once laid down.
        position.setZ(i, heightAt(position.getX(i), -position.getY(i)));
      }
      terrain.computeVertexNormals();
      const land = new THREE.Mesh(
        terrain,
        new THREE.MeshBasicMaterial({ color: 0x1c2b3a, wireframe: true, transparent: true, opacity: 0.55 }),
      );
      land.rotation.x = -Math.PI / 2;
      scene.add(land);
      const under = new THREE.Mesh(terrain.clone(), new THREE.MeshBasicMaterial({ color: 0x070b11 }));
      under.rotation.x = -Math.PI / 2;
      under.position.y = -0.6;
      scene.add(under);

      // Stops are spread wide, and each sits on the ground where it lands.
      const SPACING = 138;
      const points = cities.map((_, index) => {
        const x = (index - (cities.length - 1) / 2) * SPACING;
        const z = Math.sin(index * 1.15) * 52;
        return new THREE.Vector3(x, heightAt(x, z), z);
      });
      const route = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);

      const routeLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(
          route.getPoints(600).map((point) => point.clone().setY(point.y + 1.2)),
        ),
        new THREE.LineDashedMaterial({ color: 0x8a6a2c, dashSize: 4, gapSize: 5 }),
      );
      routeLine.computeLineDistances();
      scene.add(routeLine);

      const textTexture = (text: string, pixels: number, colour: string, spacing: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 160;
        const ctx = canvas.getContext("2d")!;
        ctx.font = `700 ${pixels}px "Cinzel", "Barlow Condensed", Georgia, serif`;
        ctx.fillStyle = colour;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.letterSpacing = `${spacing}px`;
        ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 20);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      };

      interface Placed {
        build: Build;
        sprite: ThreeTypes.Sprite;
        ground: ThreeTypes.Mesh;
        at: number;
      }

      const tallest = Math.max(1, ...cities.flatMap((city) => city.entries.map((entry) => entry.years)));
      const placed: Placed[] = cities.map((city, index) => {
        const towers = city.entries.slice(0, TOWER_LIMIT);
        const build = builders[city.kind](towers, tallest);
        build.group.position.copy(points[index]);
        scene.add(build.group);

        const shown = city.name.split(" (")[0].toUpperCase();

        // The name floating over the place…
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: textTexture(shown, 74, "#f0d8a8", 6), transparent: true, depthTest: false }),
        );
        sprite.scale.set(56, 8.5, 1);
        sprite.position.copy(points[index]).add(new THREE.Vector3(0, 44, 0));
        scene.add(sprite);

        // …and the same name burned into the map in front of it.
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(58, 9),
          new THREE.MeshBasicMaterial({
            map: textTexture(shown, 66, "#c79a46", 10),
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        ground.rotation.x = -Math.PI / 2;
        // Just in front of the build, small enough that the camera never drives over it.
        const groundZ = points[index].z + 46;
        const groundX = points[index].x + 6;
        ground.position.set(groundX, heightAt(groundX, groundZ) + 0.6, groundZ);
        scene.add(ground);

        return { build, sprite, ground, at: city.at };
      });

      const resize = () => {
        renderer.setSize(host.clientWidth, host.clientHeight, false);
        camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      let frame = 0;
      const eye = new THREE.Vector3();
      const aim = new THREE.Vector3();
      const render = () => {
        const p = progressRef.current;
        const time = performance.now() / 1000;

        // The camera rides the route in curve time, so a stop is reached at
        // exactly the moment the scrubber says it is, and rises with the land.
        route.getPoint(Math.min(1, p), eye);
        route.getPoint(Math.min(1, p + 0.03), aim);
        const drift = Math.sin(time * 0.25) * 5;
        camera.position.set(eye.x - 10 + drift * 0.4, eye.y + 44 + Math.sin(time * 0.4) * 2.5, eye.z + 96);
        camera.lookAt(eye.x + (aim.x - eye.x) * 0.35, eye.y + 14, eye.z + (aim.z - eye.z) * 0.35);

        for (const stop of placed) {
          const rise = Math.max(0, Math.min(1, (0.13 - Math.abs(p - stop.at)) / 0.1));
          const held = p > stop.at ? 1 : rise;
          const eased = 1 - Math.pow(1 - held, 3);
          stop.build.grow(eased, time);
          const near = Math.max(0, Math.min(1, (0.1 - Math.abs(p - stop.at)) / 0.05));
          (stop.sprite.material as ThreeTypes.SpriteMaterial).opacity = near;
          (stop.ground.material as ThreeTypes.MeshBasicMaterial).opacity = 0.2 + eased * 0.55;
        }

        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);

      cleanup = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("resize", resize);
        scene.traverse((object) => {
          const mesh = object as ThreeTypes.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const material = mesh.material as ThreeTypes.Material | ThreeTypes.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material?.dispose();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [cities]);

  // Autoplay, paused the moment the scrubber is touched.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = (now - last) / 62000; // a full run in about a minute
      last = now;
      setProgress((current) => {
        const next = current + step;
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const active = cities.reduce((closest, city) =>
    Math.abs(city.at - progress) < Math.abs(closest.at - progress) ? city : closest,
  );
  const near = Math.abs(active.at - progress) < 0.11;
  const year = Math.round(yearAt(cities, progress));
  const tally = tallyAt(cities, progress);
  const total = tally.reduce((sum, row) => sum + row.years, 0);

  return (
    <div className="titles">
      <div className="titles__stage" ref={hostRef} />

      <header className="titles__head">
        <p className="titles__eyebrow">Sketch · mock data</p>
        <h1 className="titles__name">The Working Years</h1>
      </header>

      <Tally rows={tally} open={openRows} setOpen={setOpenRows} total={total} />

      <aside className={`titles__card${near ? " is-on" : ""}`}>
        <h2 className="titles__card-name">{active.name}</h2>
        <p className="titles__card-years">
          {Math.round(active.from)} – {active.to >= LAST_YEAR - 1 ? "present" : Math.round(active.to)}
        </p>
        <ul className="titles__card-list">
          {active.entries.slice(0, TOWER_LIMIT).map((entry) => (
            <li key={entry.name}>
              <span className="titles__card-skill">{entry.name}</span>
              <span className="titles__card-bar">
                <span style={{ width: `${Math.min(100, (entry.years / 10) * 100)}%` }} />
              </span>
              <span className="titles__card-count">{say(entry.years)}</span>
            </li>
          ))}
        </ul>
      </aside>

      <div className="titles__scrub">
        <button type="button" className="titles__play" onClick={() => setPlaying((current) => !current)}>
          {playing ? "Pause" : progress >= 1 ? "Replay" : "Play"}
        </button>
        <span className="titles__year">{year}</span>
        <div className="titles__track">
          <input
            id="titles-scrubber"
            type="range"
            min={0}
            max={1}
            step={0.0005}
            value={progress}
            aria-label="Scrub the sequence"
            onChange={(event) => {
              setPlaying(false);
              setProgress(Number(event.target.value));
            }}
          />
          <div className="titles__stops">
            {cities.map((city) => (
              <button
                key={city.slug}
                type="button"
                className={`titles__stop${city.slug === active.slug && near ? " is-on" : ""}`}
                style={{ left: `${city.at * 100}%` }}
                title={city.name}
                onClick={() => {
                  setPlaying(false);
                  setProgress(city.at);
                }}
              >
                <span>{city.name.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The running total, lit from underneath: categories first, opening into their skills. */
function Tally({
  rows,
  open,
  setOpen,
  total,
}: {
  rows: TallyRow[];
  open: string[];
  setOpen: (next: string[]) => void;
  total: number;
}) {
  const most = Math.max(1, ...rows.map((row) => row.years));
  return (
    <aside className="tally">
      <Embers />
      <div className="tally__inner">
        <h2 className="tally__title">Running tally</h2>
        <p className="tally__total">
          <span>{Math.round(total)}</span> skill-years so far
        </p>
        <ul className="tally__list">
          {rows.map((row) => {
            const isOpen = open.includes(row.slug);
            return (
              <li key={row.slug} className={`tally__row${row.hot ? " is-hot" : ""}`}>
                <button
                  type="button"
                  className="tally__name"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? open.filter((slug) => slug !== row.slug) : [...open, row.slug])}
                >
                  <span className="tally__chevron" aria-hidden="true">
                    {isOpen ? "–" : "+"}
                  </span>
                  {row.name}
                  <span className="tally__years">{say(row.years)}</span>
                </button>
                <span className="tally__bar">
                  <span className="tally__fill" style={{ width: `${(row.years / most) * 100}%` }} />
                </span>
                {isOpen ? (
                  <ul className="tally__skills">
                    {row.skills.map((skill) => (
                      <li key={skill.name}>
                        <span>{skill.name}</span>
                        <span>{say(skill.years)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

/** Embers drifting up behind the tally, for the heat of the thing. */
function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const sparks = Array.from({ length: 44 }, () => ({
      x: Math.random(),
      y: Math.random(),
      speed: 0.0009 + Math.random() * 0.0022,
      sway: Math.random() * Math.PI * 2,
      size: 0.6 + Math.random() * 1.9,
      life: Math.random(),
    }));

    let frame = 0;
    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      for (const spark of sparks) {
        spark.y -= spark.speed;
        spark.sway += 0.02;
        spark.life += 0.004;
        if (spark.y < -0.05) {
          spark.y = 1.05;
          spark.x = Math.random();
          spark.life = 0;
        }
        const x = (spark.x + Math.sin(spark.sway) * 0.02) * width;
        const y = spark.y * height;
        const glow = 0.35 + Math.abs(Math.sin(spark.life * 3)) * 0.65;
        const radius = spark.size * dpr * (0.6 + glow * 0.8);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 4);
        gradient.addColorStop(0, `rgba(255, 196, 96, ${0.75 * glow})`);
        gradient.addColorStop(0.4, `rgba(226, 118, 32, ${0.3 * glow})`);
        gradient.addColorStop(1, "rgba(180, 60, 10, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="tally__embers" aria-hidden="true" />;
}
