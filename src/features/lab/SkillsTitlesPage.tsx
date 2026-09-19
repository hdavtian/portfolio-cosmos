import { useEffect, useMemo, useRef, useState } from "react";
import type * as ThreeTypes from "three";
import { LAST_YEAR, places, say, spans } from "./skillsData";
import "./skillsTitles.css";

/**
 * A title sequence for the skill timeline: the camera runs a route across a
 * dark map, and each job builds itself out of the ground as it arrives — one
 * tower per skill, its height the years spent on it. Scrub or let it play.
 *
 * Sketch only, mock data, not linked from the site.
 */

export interface City {
  slug: string;
  name: string;
  from: number;
  to: number;
  towers: Array<{ name: string; years: number }>;
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
    towers: spans
      .filter((span) => span.place === place.slug)
      .map((span) => ({ name: span.skillName, years: span.to - span.from }))
      .sort((a, b) => b.years - a.years)
      .slice(0, TOWER_LIMIT),
    at: ordered.length > 1 ? index / (ordered.length - 1) : 0,
  }));
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

export function SkillsTitlesPage() {
  const cities = useMemo(buildCities, []);
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);

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

      const GOLD = "#d9a441";
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setClearColor(0x05070b, 1);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x05070b, 90, 340);
      const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 600);

      // The map: a dark plate with a faint grid, like an old chart.
      const grid = new THREE.GridHelper(900, 90, 0x1d2a38, 0x121a24);
      grid.position.y = -0.02;
      scene.add(grid);
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(900, 900),
        new THREE.MeshBasicMaterial({ color: 0x080c12 }),
      );
      plate.rotation.x = -Math.PI / 2;
      plate.position.y = -0.2;
      scene.add(plate);

      // Each stop sits along a slow S across the plate.
      const spacing = 78;
      const points = cities.map(
        (_, index) =>
          new THREE.Vector3(
            (index - (cities.length - 1) / 2) * spacing,
            0,
            Math.sin(index * 1.15) * 34,
          ),
      );
      const route = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.4);

      const routeLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(route.getPoints(400).map((point) => point.clone().setY(0.6))),
        new THREE.LineDashedMaterial({ color: 0x8a6a2c, dashSize: 3, gapSize: 4 }),
      );
      routeLine.computeLineDistances();
      scene.add(routeLine);

      const label = (text: string, colour: string, weight: number, pixels: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 80;
        const ctx = canvas.getContext("2d")!;
        ctx.font = `${weight} ${pixels}px "Cinzel", "Barlow Condensed", Georgia, serif`;
        ctx.fillStyle = colour;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 10);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
        );
        sprite.scale.set(38, 6, 1);
        return sprite;
      };

      interface Built {
        group: ThreeTypes.Group;
        towers: ThreeTypes.Mesh[];
        heights: number[];
        gears: ThreeTypes.Mesh[];
        sprite: ThreeTypes.Sprite;
        at: number;
      }

      const tallest = Math.max(1, ...cities.flatMap((city) => city.towers.map((tower) => tower.years)));
      const built: Built[] = cities.map((city, index) => {
        const group = new THREE.Group();
        group.position.copy(points[index]);
        scene.add(group);

        // A ring of towers, one per skill, tallest at the back.
        const towers: ThreeTypes.Mesh[] = [];
        const heights: number[] = [];
        city.towers.forEach((tower, towerIndex) => {
          const height = 6 + (tower.years / tallest) * 36;
          const radius = 1.6 + (tower.years / tallest) * 1.9;
          const geometry = new THREE.CylinderGeometry(radius * 0.72, radius, height, 6, 1, true);
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(GOLD).multiplyScalar(0.5 + (tower.years / tallest) * 0.7),
              wireframe: true,
              transparent: true,
              opacity: 0.85,
            }),
          );
          const angle = (towerIndex / city.towers.length) * Math.PI * 2;
          const spread = 9 + city.towers.length * 0.9;
          mesh.position.set(Math.cos(angle) * spread, height / 2, Math.sin(angle) * spread);
          mesh.scale.y = 0.001;
          group.add(mesh);
          towers.push(mesh);
          heights.push(height);
        });

        // Clockwork under the city, the way the titles open a location.
        const gears = [0, 1].map((ring) => {
          const gear = new THREE.Mesh(
            new THREE.TorusGeometry(15 + ring * 7, 0.35, 6, ring === 0 ? 36 : 54),
            new THREE.MeshBasicMaterial({ color: 0x6d5222, transparent: true, opacity: 0.85 }),
          );
          gear.rotation.x = Math.PI / 2;
          gear.position.y = 0.4 + ring * 0.2;
          group.add(gear);
          return gear;
        });

        const sprite = label(city.name.split(" (")[0].toUpperCase(), "#f0d8a8", 700, 44);
        sprite.position.set(0, 52, 0);
        group.add(sprite);

        return { group, towers, heights, gears, sprite, at: city.at };
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
        // exactly the moment the scrubber says it is.
        route.getPoint(Math.min(1, p), eye);
        route.getPoint(Math.min(1, p + 0.03), aim);
        const drift = Math.sin(time * 0.25) * 5;
        camera.position.set(eye.x - 8 + drift * 0.4, 42 + Math.sin(time * 0.4) * 2.5, eye.z + 86);
        camera.lookAt(eye.x + (aim.x - eye.x) * 0.35, 15, eye.z + (aim.z - eye.z) * 0.35);

        for (const city of built) {
          // A stop builds as the camera closes on it, and holds once passed.
          const rise = Math.max(0, Math.min(1, (0.13 - Math.abs(p - city.at)) / 0.1));
          const held = p > city.at ? 1 : rise;
          const eased = 1 - Math.pow(1 - held, 3);
          city.towers.forEach((tower, index) => {
            const scale = Math.max(0.001, eased);
            tower.scale.y = scale;
            tower.position.y = (city.heights[index] * scale) / 2;
          });
          city.gears.forEach((gear, index) => {
            gear.rotation.z += (index === 0 ? 0.004 : -0.0026) * (0.3 + eased);
            gear.scale.setScalar(0.2 + eased * 0.8);
          });
          (city.sprite.material as ThreeTypes.SpriteMaterial).opacity = Math.max(
            0,
            Math.min(1, (0.1 - Math.abs(p - city.at)) / 0.05),
          );
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
      const step = (now - last) / 46000; // a full run in about three quarters of a minute
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

  return (
    <div className="titles">
      <div className="titles__stage" ref={hostRef} />

      <header className="titles__head">
        <p className="titles__eyebrow">Sketch · mock data</p>
        <h1 className="titles__name">The Working Years</h1>
      </header>

      <aside className={`titles__card${near ? " is-on" : ""}`}>
        <h2 className="titles__card-name">{active.name}</h2>
        <p className="titles__card-years">
          {Math.round(active.from)} – {active.to >= LAST_YEAR - 1 ? "present" : Math.round(active.to)}
        </p>
        <ul className="titles__card-list">
          {active.towers.map((tower) => (
            <li key={tower.name}>
              <span className="titles__card-skill">{tower.name}</span>
              <span className="titles__card-bar">
                <span style={{ width: `${Math.min(100, (tower.years / 10) * 100)}%` }} />
              </span>
              <span className="titles__card-count">{say(tower.years)}</span>
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
            onDoubleClick={() => setProgress(0)}
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
