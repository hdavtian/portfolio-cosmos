import { useEffect, useMemo, useRef, useState } from "react";
import type * as ThreeTypes from "three";
import { useReleaseQuery } from "../../lib/query/contentQueries";
import { isFilmSuspended } from "../../lib/filmSuspend";
import { useShowcaseProjects } from "../showcase/lib/useShowcaseProjects";
import { makeAstrolabe } from "./gotAstrolabe";
import { Link } from "react-router-dom";
import {
  DIRECTION_BY_PLACE,
  KIND_BY_PLACE,
  KIND_ORDER,
  makeBuilders,
  type Build,
} from "./gotBuilders";
import {
  LAST_YEAR,
  NOW_YEAR,
  categories,
  places,
  say,
  spans,
} from "./skillsData";
import "./skillsTitles.css";

/**
 * The Working Years: a career told the way the Game of Thrones titles tell a
 * kingdom. A relief map lit by an astrolabe sun; the camera sweeps from place
 * to place, and at each one a clockwork structure winds up out of the map —
 * one piece per skill, its height the years spent on it there, a gold cap on
 * any skill appearing for the first time.
 *
 * The delivery is the title sequence. The message is the panel on the left:
 * years of real experience per discipline, counted honestly off the calendar,
 * growing as the film goes — so by the end nobody has to ask how many years
 * of frontend or backend there are.
 *
 * Everything on screen is a function of the scrubber. Sketch, mock data, not
 * linked from the site.
 */

interface Entry {
  skill: string;
  name: string;
  years: number;
  from: number;
  to: number;
  categories: string[];
  /** First appearance of this skill anywhere in the career. */
  fresh: boolean;
}

interface City {
  slug: string;
  name: string;
  title: string;
  from: number;
  to: number;
  kind: string;
  note: string;
  entries: Entry[];
  /** Places share a spot on the map when they are the same company. */
  spot: number;
}

const PIECE_LIMIT = 9;

/**
 * A place's colour comes from its core in the portfolio (Admin → Cores), so
 * the two sites agree. These stand in for any job that has no core yet.
 */
const ACCENT_FALLBACK: Record<string, string> = {
  earthlink: "#ff9a3c",
  hostpro: "#ff6a6a",
  stormscape: "#5ED9FF",
  unitedlayer: "#8fe0d8",
  murad: "#ff9cfc",
  "capital-group": "#8fb8ff",
  boingo: "#FF6B35",
  rpa: "#1EFAA2",
  investcloud: "#FFD65C",
};
const plain = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

// Hidden for now rather than deleted: Harma is still deciding on these. Ask
// before removing them; put them back when the title or the card comes up again.
const SHOW_TITLE = false;
const SHOW_PANEL_HEADINGS = false;
const SHOW_CHAPTER_CARD = false;

const NOTES: Record<string, string> = {
  stormscape:
    "Own studio: freelance and side work, running alongside everything that follows",
  "stormscape-now": "The same studio, picked back up",
};

/** Where each place sits on the map. The studio is home, under the sun. */
const LAYOUT: Record<string, [number, number]> = {
  earthlink: [-1180, 520],
  hostpro: [-790, 220],
  stormscape: [-150, 60],
  unitedlayer: [-570, -460],
  murad: [30, -650],
  "capital-group": [560, -390],
  boingo: [940, 100],
  rpa: [530, 560],
  investcloud: [1200, 660],
};

function buildCities(): City[] {
  const ordered = [...places].sort((a, b) => a.from - b.from);
  const seen = new Set<string>();
  return ordered.map((place, index) => {
    const entries = spans
      .filter((span) => span.place === place.slug)
      .map((span) => ({
        skill: span.skill,
        name: span.skillName,
        years: span.to - span.from,
        from: span.from,
        to: span.to,
        categories: span.categories,
        fresh: false,
      }))
      .sort((a, b) => b.years - a.years);
    for (const entry of entries) {
      entry.fresh = !seen.has(entry.skill);
      seen.add(entry.skill);
    }
    const home = ordered.findIndex((other) => other.slug === "stormscape");
    return {
      slug: place.slug,
      name: place.name.split(" (")[0],
      title: place.title,
      from: place.from,
      to: place.to,
      kind: KIND_BY_PLACE[place.slug] ?? KIND_ORDER[index % KIND_ORDER.length],
      note: NOTES[place.slug] ?? "",
      entries,
      spot: place.slug === "stormscape-now" && home >= 0 ? home : index,
    };
  });
}

type SegmentKind = "intro" | "travel" | "dwell" | "outro";

interface Segment {
  kind: SegmentKind;
  /** The place being built, or travelled to. */
  city: number;
  from: number;
  to: number;
}

// One unit of a segment's weight is this long on screen, so the film's running
// time is the sum of its parts rather than a fixed length they have to share.
const SECONDS_PER_WEIGHT = 3;
let filmSeconds = 118;

function buildTimeline(cities: City[]): Segment[] {
  const parts: Array<{ kind: SegmentKind; city: number; weight: number }> = [
    { kind: "intro", city: 0, weight: 7.2 },
  ];
  cities.forEach((city, index) => {
    if (index > 0) {
      const a = LAYOUT[cities[index - 1].slug] ??
        LAYOUT[cities[cities[index - 1].spot].slug] ?? [0, 0];
      const b = LAYOUT[city.slug] ?? LAYOUT[cities[city.spot].slug] ?? [0, 0];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      parts.push({
        kind: "travel",
        city: index,
        // A hop between places is short: long enough to see the country go by, no longer.
        weight: 0.4 + distance / 4200,
      });
    }
    parts.push({
      kind: "dwell",
      city: index,
      // Half as fast again as it was.
      weight: (city.slug === "stormscape" ? 2.5 : 2.1) / 1.5,
    });
  });
  parts.push({ kind: "outro", city: cities.length - 1, weight: 1.9 });

  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  filmSeconds = total * SECONDS_PER_WEIGHT;
  let cursor = 0;
  return parts.map((part) => {
    const from = cursor;
    cursor += part.weight / total;
    return { kind: part.kind, city: part.city, from, to: cursor };
  });
}

const segmentAt = (timeline: Segment[], progress: number) =>
  timeline.find(
    (segment) => progress >= segment.from && progress < segment.to,
  ) ?? timeline[timeline.length - 1];

const within = (segment: Segment, progress: number) =>
  Math.max(
    0,
    Math.min(
      1,
      (progress - segment.from) / Math.max(0.0001, segment.to - segment.from),
    ),
  );

/** Softer than smoothstep at both ends: no corner going in or coming out. */
const softly = (edge: number, to: number, value: number) => {
  const x = Math.max(0, Math.min(1, (value - edge) / (to - edge)));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/**
 * How far a place is built, t of the way through its turn. A second visit waits
 * for the camera to settle before anything grows, so the growth is watched.
 */
const builtWithin = (t: number, later: boolean) => (later ? softly(0.5, 0.97, t) : softly(0.04, 0.82, t));

/** How far each place has been built: nothing before its turn, the scrubber during it. */
function buildFractions(timeline: Segment[], cities: City[], progress: number) {
  const current = segmentAt(timeline, progress);
  const t = within(current, progress);
  return cities.map((_, index) => {
    const dwell = timeline.find(
      (segment) => segment.kind === "dwell" && segment.city === index,
    )!;
    if (progress >= dwell.to) return 1;
    if (current === dwell) return builtWithin(t, cities[index].spot !== index);
    return 0;
  });
}

const unionYears = (ranges: Array<[number, number]>) => {
  const sorted = ranges
    .filter(([from, to]) => to > from)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let open: [number, number] | null = null;
  for (const range of sorted) {
    if (open && range[0] <= open[1]) open[1] = Math.max(open[1], range[1]);
    else {
      if (open) total += open[1] - open[0];
      open = [range[0], range[1]];
    }
  }
  if (open) total += open[1] - open[0];
  return total;
};

interface ExperienceRow {
  slug: string;
  name: string;
  years: number;
  hot: boolean;
  skills: Array<{ name: string; years: number }>;
}

/**
 * The message. Years of experience per discipline so far, counted off the
 * calendar: overlapping jobs never count twice, so these are the numbers that
 * can be said out loud in an interview.
 */
function experienceAt(cities: City[], fractions: number[]) {
  const byCategory = new Map<
    string,
    {
      ranges: Array<[number, number]>;
      hot: boolean;
      skills: Map<string, Array<[number, number]>>;
    }
  >();
  const everything: Array<[number, number]> = [];

  cities.forEach((city, index) => {
    const built = fractions[index];
    if (built <= 0.001) return;
    const rising = built < 0.999;
    for (const entry of city.entries) {
      const range: [number, number] = [
        entry.from,
        entry.from + (entry.to - entry.from) * built,
      ];
      everything.push(range);
      for (const slug of entry.categories) {
        const era = categories.find((category) => category.slug === slug)?.era;
        const clipped: [number, number] = era
          ? [Math.max(range[0], era), range[1]]
          : range;
        if (clipped[1] <= clipped[0]) continue;
        const row = byCategory.get(slug) ?? {
          ranges: [] as Array<[number, number]>,
          hot: false,
          skills: new Map<string, Array<[number, number]>>(),
        };
        row.ranges.push(clipped);
        row.hot = row.hot || rising;
        row.skills.set(entry.name, [
          ...(row.skills.get(entry.name) ?? []),
          clipped,
        ]);
        byCategory.set(slug, row);
      }
    }
  });

  // Every discipline is always listed, at nought until the film reaches it, so
  // the panel has something to say from the first frame.
  const rows: ExperienceRow[] = categories.map((category) => {
    const row = byCategory.get(category.slug);
    return {
      slug: category.slug,
      name: category.name,
      years: row ? unionYears(row.ranges) : 0,
      hot: row?.hot ?? false,
      skills: row
        ? [...row.skills.entries()]
            .map(([name, ranges]) => ({ name, years: unionYears(ranges) }))
            .sort((a, b) => b.years - a.years)
        : [],
    };
  });

  return { rows, career: unionYears(everything) };
}

const yearsLabel = (city: City) =>
  `${Math.round(city.from)} – ${city.to >= LAST_YEAR - 1 ? "today" : Math.round(city.to)}`;

export function SkillsTitlesPage() {
  const cities = useMemo(buildCities, []);
  const timeline = useMemo(() => buildTimeline(cities), [cities]);
  // "Since": the earliest year on any published project, so it follows the
  // portfolio rather than being typed in here.
  const { projects } = useShowcaseProjects();
  const coresQuery = useReleaseQuery((release) => release.collections.portfolioCores);
  const profile = useReleaseQuery((release) => release.profile).data;
  // One colour per place, keyed by place: a core whose name matches the company wins.
  const accents = useMemo(() => {
    const cores = coresQuery.data ?? [];
    const found: Record<string, string> = {};
    for (const city of cities) {
      const home = cities[city.spot];
      const key = plain(home.name);
      const core = cores.find((entry) => {
        const name = plain(entry.name);
        return name.length > 2 && (key.startsWith(name) || name.startsWith(key));
      });
      found[city.slug] = core?.color ?? ACCENT_FALLBACK[home.slug] ?? "#ffb266";
    }
    return found;
  }, [cities, coresQuery.data]);
  const accentsRef = useRef(accents);
  const accentsKey = Object.values(accents).join("|");
  // The name and title forged into the first ring, from the published profile.
  const banner = profile ? `${profile.name}   ✦   ${profile.title}`.toUpperCase() : "";
  const bannerRef = useRef(banner);
  const since = useMemo(() => {
    const years = projects
      .map((project) => project.year)
      .filter((year): year is number => typeof year === "number");
    return years.length > 0 ? Math.min(...years) : Math.floor(cities[0].from);
  }, [cities, projects]);
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [direction, setDirection] = useState(1);
  const [openRows, setOpenRows] = useState<string[]>([]);
  // The film stops at each place once it is built, until it is told to go on.
  const [holding, setHolding] = useState(false);
  const [autoContinue, setAutoContinue] = useState(false);
  const holdingRef = useRef(false);
  // Set when the film is thrown somewhere (the scrubber, a tick, replay): the camera cuts instead of flying.
  const snapRef = useRef(true);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    holdingRef.current = holding;
  }, [holding]);
  // Nothing on screen moves unless the scrubber does.
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    progressRef.current = progress;
    setMoving(true);
    const settle = window.setTimeout(() => setMoving(false), 220);
    return () => window.clearTimeout(settle);
  }, [progress]);

  // Declared before the scene's effect, so the colours are in place when it builds.
  useEffect(() => {
    accentsRef.current = accents;
    bannerRef.current = banner;
  }, [accents, banner]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // A freshly built scene starts with its camera at the origin: cut to where
    // the film is rather than flying there from nowhere.
    snapRef.current = true;
    let disposed = false;
    let cleanup = () => {};

    void Promise.all([
      import("three"),
      import("camera-controls"),
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("three/examples/jsm/postprocessing/RenderPass.js"),
      import("three/examples/jsm/postprocessing/UnrealBloomPass.js"),
      import("three/examples/jsm/postprocessing/OutputPass.js"),
      import("three/examples/jsm/postprocessing/BokehPass.js"),
      import("three/examples/jsm/postprocessing/ShaderPass.js"),
    ]).then(
      ([
        THREE,
        cameraControls,
        composerModule,
        renderModule,
        bloomModule,
        outputModule,
        bokehModule,
        shaderModule,
      ]) => {
        if (disposed) return;
        const CameraControls = cameraControls.default;
        CameraControls.install({ THREE });

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x120c07, 700, 3600);
        // Candle-dark above, a warm haze at the horizon.
        scene.background = (() => {
          const canvas = document.createElement("canvas");
          canvas.width = 4;
          canvas.height = 128;
          const ctx = canvas.getContext("2d")!;
          const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
          sky.addColorStop(0, "#080503");
          sky.addColorStop(0.6, "#140d07");
          sky.addColorStop(1, "#3a2813");
          ctx.fillStyle = sky;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          return texture;
        })();

        const camera = new THREE.PerspectiveCamera(42, 1, 1, 9000);
        // The scrubber decides where the camera should be; camera-controls moves
        // it there, damping the path. It takes no input: this is a film.
        const controls = new CameraControls(camera, renderer.domElement);
        controls.smoothTime = 0.3;
        controls.mouseButtons.left = CameraControls.ACTION.NONE;
        controls.mouseButtons.middle = CameraControls.ACTION.NONE;
        controls.mouseButtons.right = CameraControls.ACTION.NONE;
        controls.mouseButtons.wheel = CameraControls.ACTION.NONE;
        controls.touches.one = CameraControls.ACTION.NONE;
        controls.touches.two = CameraControls.ACTION.NONE;
        controls.touches.three = CameraControls.ACTION.NONE;
        controls.minDistance = 0.1;
        controls.maxDistance = Infinity;

        /* ---------------------------------------------------------------- */
        /* The map                                                          */

        const spots = cities.map((city, index) => {
          const at = LAYOUT[city.slug] ?? LAYOUT[cities[city.spot].slug];
          if (at) return new THREE.Vector2(at[0], at[1]);
          const angle = (index / cities.length) * Math.PI * 2;
          return new THREE.Vector2(
            Math.cos(angle) * 900,
            Math.sin(angle) * 600,
          );
        });

        const SEA = -6;
        const wild = (x: number, z: number) =>
          48 * Math.sin(x * 0.0019 + 0.6) * Math.cos(z * 0.0024 - 0.4) +
          26 * Math.sin(x * 0.0052 + z * 0.0037) +
          13 * Math.cos(z * 0.0098 - x * 0.0031) +
          5 * Math.sin(x * 0.021) * Math.sin(z * 0.019) +
          // Ranges of mountains, away from where anything is built.
          70 *
            Math.max(0, Math.sin(x * 0.0041 + 2) * Math.sin(z * 0.0052 + 1)) **
              2;

        const lifted = (x: number, z: number) => {
          let h = wild(x, z);
          let near = 0;
          for (const spot of spots) {
            const d2 = (x - spot.x) ** 2 + (z - spot.y) ** 2;
            near = Math.max(near, Math.exp(-d2 / (300 * 300)));
          }
          // Land rises gently toward every place, and mountains keep their distance.
          h = h * (1 - near * 0.75) + 26 * near;
          return h;
        };
        const spotHeights = spots.map((spot) => lifted(spot.x, spot.y));

        const heightAt = (x: number, z: number) => {
          let h = lifted(x, z);
          // Level ground under each place, so its clockwork sits flat.
          spots.forEach((spot, index) => {
            const d = Math.hypot(x - spot.x, z - spot.y);
            // Wide enough for the outlying wheels, which would otherwise sink into a slope.
            if (d < 200) h += (spotHeights[index] - h) * softly(0, 1, 1 - Math.max(0, d - 122) / 78);
          });
          return Math.max(h, SEA - 5);
        };

        const terrain = new THREE.PlaneGeometry(3800, 2600, 240, 164);
        const position = terrain.attributes.position;
        const colours = new Float32Array(position.count * 3);
        // Each place has its own country: ice in the north, desert, green
        // lowland, brown heath. The land between them shades from one to the next.
        type Biome = "ice" | "green" | "desert" | "heath";
        const BIOME_BY_PLACE: Record<string, Biome> = {
          earthlink: "desert",
          hostpro: "heath",
          stormscape: "green",
          unitedlayer: "ice",
          murad: "ice",
          "capital-group": "green",
          boingo: "desert",
          rpa: "green",
          investcloud: "heath",
        };
        const PALETTES: Record<Biome, [string, string, string]> = {
          // low ground, high ground, peaks
          ice: ["#a8c6da", "#e2eef6", "#ffffff"],
          green: ["#3f5a2c", "#6f8044", "#c9c29a"],
          desert: ["#b08a4e", "#d2ad6c", "#ecd9a6"],
          heath: ["#6a5434", "#94774a", "#d8c596"],
        };
        const palettes = cities.map((city) => {
          const biome =
            BIOME_BY_PLACE[city.slug] ??
            BIOME_BY_PLACE[cities[city.spot].slug] ??
            "heath";
          return PALETTES[biome].map((hex) => new THREE.Color(hex));
        });

        const colour = new THREE.Color();
        const low = new THREE.Color();
        const high = new THREE.Color();
        const top = new THREE.Color();
        const shore = new THREE.Color("#5b5138");
        const wood = new THREE.Color("#2f4423");
        for (let i = 0; i < position.count; i += 1) {
          const x = position.getX(i);
          const z = -position.getY(i);
          const y = heightAt(x, z);
          position.setZ(i, y);

          // Blend the palettes of the places by how near each one is.
          low.setRGB(0, 0, 0);
          high.setRGB(0, 0, 0);
          top.setRGB(0, 0, 0);
          let total = 0;
          spots.forEach((spot, index) => {
            if (cities[index].spot !== index) return;
            const d2 = (spot.x - x) ** 2 + (spot.y - z) ** 2;
            const weight = 1 / (d2 + 9000) ** 1.6;
            total += weight;
            low.add(colour.copy(palettes[index][0]).multiplyScalar(weight));
            high.add(colour.copy(palettes[index][1]).multiplyScalar(weight));
            top.add(colour.copy(palettes[index][2]).multiplyScalar(weight));
          });
          low.multiplyScalar(1 / total);
          high.multiplyScalar(1 / total);
          top.multiplyScalar(1 / total);

          if (y < SEA + 3) colour.copy(shore).lerp(low, 0.35);
          else if (y < 40) colour.copy(low).lerp(high, Math.max(0, y) / 40);
          else colour.copy(high).lerp(top, Math.min(1, (y - 40) / 60));

          // Woods in the green and heath lowlands; none on ice or sand.
          const greenness =
            Math.max(0, low.g - Math.max(low.r, low.b) + 0.06) * 6;
          const patch =
            Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.017 - 0.6) +
            Math.sin((x + z) * 0.031) * 0.5;
          if (y > SEA + 3 && y < 46 && patch > 0.3) {
            colour.lerp(
              wood,
              Math.min(0.6, (patch - 0.3) * 1.2) *
                Math.min(1, greenness + 0.25),
            );
          }
          colours.set([colour.r, colour.g, colour.b], i * 3);
        }
        terrain.setAttribute("color", new THREE.BufferAttribute(colours, 3));
        terrain.computeVertexNormals();
        const land = new THREE.Mesh(
          terrain,
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            flatShading: true,
            roughness: 0.96,
            metalness: 0.02,
          }),
        );
        land.rotation.x = -Math.PI / 2;
        scene.add(land);

        const water = new THREE.PlaneGeometry(9000, 9000, 180, 180);
        const waterAt = water.attributes.position;
        const waterColours = new Float32Array(waterAt.count * 3);
        const shallow = new THREE.Color("#2f7f9c");
        const mid = new THREE.Color("#124a78");
        const deep = new THREE.Color("#061a3a");
        for (let i = 0; i < waterAt.count; i += 1) {
          const x = waterAt.getX(i);
          const z = -waterAt.getY(i);
          // How far below the waterline the sea bed would be, plus slow currents.
          const bed = SEA - lifted(x, z);
          const drift =
            Math.sin(x * 0.0031 + 0.8) * Math.cos(z * 0.0027 - 1.1) * 14;
          const depth = Math.max(0, Math.min(1, (bed + drift) / 60));
          if (depth < 0.35) colour.copy(shallow).lerp(mid, depth / 0.35);
          else colour.copy(mid).lerp(deep, (depth - 0.35) / 0.65);
          // Open ocean beyond the map goes darkest of all.
          const edge = Math.max(0, (Math.hypot(x, z * 1.4) - 1900) / 1600);
          colour.lerp(deep, Math.min(1, edge));
          waterColours.set([colour.r, colour.g, colour.b], i * 3);
        }
        water.setAttribute("color", new THREE.BufferAttribute(waterColours, 3));
        const sea = new THREE.Mesh(
          water,
          new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.22,
            metalness: 0.35,
          }),
        );
        sea.rotation.x = -Math.PI / 2;
        sea.position.y = SEA;
        scene.add(sea);

        /* ---------------------------------------------------------------- */
        /* The astrolabe: the sun this world is lit by                       */

        const SUN = new THREE.Vector3(0, 520, -40);
        scene.add(new THREE.HemisphereLight(0xd8c49a, 0x1c1208, 0.34));
        const rake = new THREE.DirectionalLight(0xffc98a, 1.5);
        rake.position.set(-600, 500, 500);
        scene.add(rake);

        const astrolabe = makeAstrolabe(THREE, {
          // Name and title straight from the resume, so they follow it.
        name: bannerRef.current,
          markup: [
          '<!doctype html>  <main class="work">  <section id="skills">  </section>  </main>',
          ".grid { display: grid; gap: 1rem }  @media (min-width: 60rem) { .grid { grid-template-columns: repeat(3, 1fr) } }",
          "const build = (place) => place.skills.map(raise);  type Skill = { name: string; years: number };",
        ],
        languages: [
          "public class Portfolio : IBuilt { }  using System.Linq;  await db.SaveChangesAsync();",
          "@RestController public class Work { }  List<Skill> skills = new ArrayList<>();",
          "SELECT name, years FROM skills ORDER BY years DESC;  docker compose up -d",
        ],
      });
        astrolabe.group.position.copy(SUN);
        scene.add(astrolabe.group);

        const label = (text: string, bright: boolean) => {
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 72;
          const ctx = canvas.getContext("2d")!;
          ctx.font = '600 28px "JetBrains Mono", Menlo, Consolas, monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const width = Math.min(
            canvas.width - 8,
            ctx.measureText(text).width + 30,
          );
          ctx.fillStyle = "rgba(10, 7, 4, 0.78)";
          ctx.fillRect((canvas.width - width) / 2, 10, width, 52);
          ctx.strokeStyle = bright
            ? "rgba(255, 196, 96, 0.95)"
            : "rgba(214, 180, 120, 0.4)";
          ctx.lineWidth = 2;
          ctx.strokeRect((canvas.width - width) / 2 + 1, 11, width - 2, 50);
          ctx.fillStyle = bright ? "#ffd27a" : "#f1dfba";
          ctx.fillText(
            text,
            canvas.width / 2,
            canvas.height / 2,
            canvas.width - 30,
          );
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          const sprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: texture,
              transparent: true,
              opacity: 0,
              depthTest: false,
            }),
          );
          sprite.scale.set(48, 5.4, 1);
          // Labels live on their own layer: drawn after the lens, so they are never blurred.
          sprite.layers.set(1);
          return sprite;
        };

        const { byKind, gearPlatform } = makeBuilders(THREE, label);

        /* ---------------------------------------------------------------- */
        /* The places                                                        */

        interface Shot {
          r0: number;
          r1: number;
          h0: number;
          h1: number;
          sweep: number;
          aim: number;
        }
        // A handful of moves, dealt round the places: a low sweep in, a rise
        // over the top, a descent from height, a long slow orbit.
        const SHOTS: Shot[] = [
          { r0: 226, r1: 150, h0: 104, h1: 58, sweep: -1.9, aim: 36 },
          { r0: 176, r1: 196, h0: 56, h1: 150, sweep: 1.5, aim: 34 },
          { r0: 246, r1: 146, h0: 176, h1: 70, sweep: -1.6, aim: 38 },
          { r0: 200, r1: 162, h0: 72, h1: 90, sweep: 2.3, aim: 40 },
        ];
        const HOMECOMING: Shot = { r0: 300, r1: 210, h0: 190, h1: 120, sweep: 2.5, aim: 56 };
        const nameTexture = (name: string, years: string) => {
          const canvas = document.createElement("canvas");
          canvas.width = 1024;
          canvas.height = 256;
          const ctx = canvas.getContext("2d")!;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.shadowColor = "rgba(20, 12, 4, 0.9)";
          ctx.shadowBlur = 10;
          ctx.fillStyle = "#f3e2b8";
          ctx.letterSpacing = "10px";
          ctx.font = '700 92px "Cinzel", Georgia, serif';
          ctx.fillText(name, canvas.width / 2, 100, canvas.width - 40);
          ctx.fillStyle = "rgba(243, 226, 184, 0.78)";
          ctx.letterSpacing = "16px";
          ctx.font = '600 46px "Cinzel", Georgia, serif';
          ctx.fillText(years, canvas.width / 2, 196, canvas.width - 80);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          return texture;
        };

        interface Placed {
          build: Build;
          gears: ReturnType<typeof gearPlatform> | null;
          engraved: ThreeTypes.Mesh | null;
          at: ThreeTypes.Vector3;
          later: boolean;
        }

        const tallest = Math.max(
          1,
          ...cities.flatMap((city) => city.entries.map((entry) => entry.years)),
        );
        const placed: Placed[] = [];
        cities.forEach((city, index) => {
          if (city.spot !== index) {
            const first = placed[city.spot];
            placed.push({
              build: first.build,
              gears: null,
              engraved: null,
              at: first.at,
              later: true,
            });
            return;
          }
          const spot = spots[index];
          const at = new THREE.Vector3(spot.x, spotHeights[index], spot.y);
          const laterCity = cities.find(
            (other) => other.spot === index && other !== city,
          );
          const build = byKind[city.kind](
            city.entries.slice(0, PIECE_LIMIT),
            tallest,
            laterCity?.entries.slice(0, PIECE_LIMIT),
            { title: city.name, accent: accentsRef.current[city.slug] ?? "#ffb266", house: city.slug },
          );
          build.group.position.copy(at).add(new THREE.Vector3(0, 1.5, 0));
          scene.add(build.group);

          const gears = gearPlatform(city.slug);
          gears.holder.position.copy(at);
          const base = new THREE.Group();
          base.position.copy(at);
          base.add(gears.holder);
          gears.holder.position.set(0, 0, 0);
          scene.add(base);

          // The name, engraved into the map beside the place and draped over
          // the ground so no rise in the land can swallow a letter.
          // It lies on the side the camera spends its time, turned to be read from there.
          const before =
            index > 0 ? spots[index - 1] : new THREE.Vector2(0, 360);
          const facing =
            Math.atan2(before.x - spot.x, before.y - spot.y) +
            SHOTS[index % SHOTS.length].sweep * 0.55;
          const width = 170;
          const plate = new THREE.PlaneGeometry(width, width / 4, 48, 12);
          plate.rotateX(-Math.PI / 2);
          plate.rotateY(facing);
          const drape = plate.attributes.position;
          const px = at.x + Math.sin(facing) * 112;
          const pz = at.z + Math.cos(facing) * 112;
          for (let i = 0; i < drape.count; i += 1) {
            drape.setY(
              i,
              Math.max(SEA, heightAt(px + drape.getX(i), pz + drape.getZ(i))) +
                1.6,
            );
          }
          const engraved = new THREE.Mesh(
            plate,
            new THREE.MeshBasicMaterial({
              map: nameTexture(
                city.name.toUpperCase(),
                yearsLabel(city).toUpperCase(),
              ),
              transparent: true,
              opacity: 0.16,
              depthWrite: false,
            }),
          );
          engraved.position.set(px, 0, pz);
          scene.add(engraved);

          placed.push({ build, gears, engraved, at, later: false });
        });

        /* ---------------------------------------------------------------- */
        /* The camera                                                        */

        const shotFor = (index: number) =>
          placed[index].later ? HOMECOMING : SHOTS[index % SHOTS.length];

        // A place is entered from the side the camera has come from.
        const arrival = (index: number) => {
          const here = placed[index].at;
          const before =
            index > 0
              ? placed[index - 1].at
              : new THREE.Vector3(SUN.x, 0, SUN.z + 400);
          return Math.atan2(before.x - here.x, before.z - here.z);
        };

        // How far back the camera must stand to hold the whole structure —
        // floating title included — with air above it, whatever the window's shape.
        const fitDistance = (index: number) => {
          const { top, reach } = placed[index].build;
          const half = THREE.MathUtils.degToRad(camera.fov / 2);
          const tall = (top * 1.34) / 2 / Math.tan(half);
          const wide = (reach * 2.5) / 2 / (Math.tan(half) * Math.max(1, camera.aspect * 0.78));
          return Math.max(tall, wide) * 1.08;
        };

        const dwellPose = (
          index: number,
          t: number,
          eye: ThreeTypes.Vector3,
          aim: ThreeTypes.Vector3,
        ) => {
          const shot = shotFor(index);
          const here = placed[index].at;
          const e = softly(0, 1, t);
          const build = placed[index].build;
          // A second visit may ask for its own resting view, to take in what was added.
          const again = placed[index].later ? build.laterView : undefined;
          // Some places are only read from certain sides (drums lettered round
          // their rims, two trees side by side): the sweep ends on whichever of
          // those sides it was already heading for.
          const sides = again ? [0, Math.PI] : build.view?.sides;
          let sweep = shot.sweep;
          if (sides) {
            const swept = arrival(index) + shot.sweep;
            sweep = sides
              .map((side) => shot.sweep + Math.atan2(Math.sin(side - swept), Math.cos(side - swept)))
              .reduce((best, turn) => (Math.abs(turn - shot.sweep) < Math.abs(best - shot.sweep) ? turn : best));
          }
          const angle = arrival(index) + sweep * e;
          // Every shot ends at the distance that frames the place whole; where
          // it starts from, and how it rises or falls, is the shot's own.
          const fit = fitDistance(index);
          const distance = fit * (shot.r0 / shot.r1) + (fit - fit * (shot.r0 / shot.r1)) * e;
          // The shot says how high it comes in; the place may say how high it
          // should come to rest (a ring of tabards is read from low and level).
          const pitchIn = Math.atan2(shot.h0, shot.r0);
          // Everywhere, it comes to rest nearly level: lettering on a band or a
          // cloth is read from the side, not from above.
          const pitchRest = again?.pitch ?? build.view?.pitch ?? 0.2;
          const pitch = pitchIn + (pitchRest - pitchIn) * e;
          const top = placed[index].build.top;
          eye.set(
            here.x + Math.sin(angle) * Math.cos(pitch) * distance,
            here.y + top * 0.5 + Math.sin(pitch) * distance,
            here.z + Math.cos(angle) * Math.cos(pitch) * distance,
          );
          // Aim a little above the middle, so the air is at the top, clear of the text below.
          aim.set(here.x + (again?.shift ?? 0) * e, here.y + top * 0.56, here.z);
        };

        const fromEye = new THREE.Vector3();
        const fromAim = new THREE.Vector3();
        const toEye = new THREE.Vector3();
        const toAim = new THREE.Vector3();
        const over = new THREE.Vector3();
        const WIDE_EYE = new THREE.Vector3(0, 1500, 2050);
        const WIDE_AIM = new THREE.Vector3(0, 0, -60);
        // The opening, as fractions of the intro: the sun lights, each band is
        // forged in turn (the second and third overlapping), a breath, and only
        // then does the camera begin to move away.
        const INTRO = {
          sun: [0, 0.09],
          bands: [
            [0.1, 0.2],
            // Each starts 30% of the way into the one before: all three overlap.
            [0.13, 0.23],
            [0.16, 0.26],
          ],
          // Each band is etched the moment it closes, not once all three stand.
          etch: [
            [0.2, 0.3],
            [0.23, 0.33],
            [0.26, 0.36],
          ],
          // Two seconds to read it, and the camera begins to leave.
          formed: 0.36 + 2 / (timeline[0].to * filmSeconds),
          easeBack: 0.36 + 2 / (timeline[0].to * filmSeconds) + 0.14,
          pullOut: 0.36 + 2 / (timeline[0].to * filmSeconds) + 0.25,
        };
        const FORGE_EYE = new THREE.Vector3(SUN.x + 46, SUN.y + 34, SUN.z + 372);
        const MID_EYE = new THREE.Vector3(SUN.x + 60, SUN.y + 44, SUN.z + 400);
        const NEAR_EYE = new THREE.Vector3(SUN.x + 38, SUN.y + 22, SUN.z + 236);
        const OPEN_EYE = new THREE.Vector3(SUN.x + 80, SUN.y + 70, SUN.z + 430);

        /** A flight: up and over between two poses, the look running a little ahead of the body. */
        const flight = (
          t: number,
          lift: number,
          eye: ThreeTypes.Vector3,
          aim: ThreeTypes.Vector3,
        ) => {
          // Ease-out (quart): most of the ground is covered in the first third, and
          // the rest of the hop is a long gentle settle into the next place.
          const e = 1 - (1 - t) ** 4;
          over.addVectors(fromEye, toEye).multiplyScalar(0.5);
          over.y = Math.max(fromEye.y, toEye.y) + lift;
          const a = (1 - e) * (1 - e);
          const b = 2 * (1 - e) * e;
          const c = e * e;
          eye.set(
            fromEye.x * a + over.x * b + toEye.x * c,
            fromEye.y * a + over.y * b + toEye.y * c,
            fromEye.z * a + over.z * b + toEye.z * c,
          );
          aim.lerpVectors(fromAim, toAim, 1 - (1 - Math.min(1, t / 0.85)) ** 3);
        };

        const rawPose = (
          p: number,
          eye: ThreeTypes.Vector3,
          aim: ThreeTypes.Vector3,
        ) => {
          const segment = segmentAt(timeline, p);
          const t = within(segment, p);
          if (segment.kind === "dwell") {
            dwellPose(segment.city, t, eye, aim);
          } else if (segment.kind === "intro") {
            if (t < INTRO.formed) {
              // Stand off while the sun lights and the three bands are forged,
              // creeping in a little so the frame is never dead.
              eye.lerpVectors(FORGE_EYE, NEAR_EYE, softly(0, 1, t / INTRO.formed) * 0.5);
              aim.copy(SUN);
            } else if (t < INTRO.easeBack) {
              // A slow ease back, reading the name.
              const back = softly(0, 1, (t - INTRO.formed) / (INTRO.easeBack - INTRO.formed));
              fromEye.lerpVectors(FORGE_EYE, NEAR_EYE, 0.5);
              eye.lerpVectors(fromEye, MID_EYE, back);
              aim.copy(SUN);
            } else if (t < INTRO.pullOut) {
              // Then a quick pull out and round.
              const out = softly(0, 1, (t - INTRO.easeBack) / (INTRO.pullOut - INTRO.easeBack));
              eye.lerpVectors(MID_EYE, OPEN_EYE, out);
              const swing = out * 0.8;
              const dx = eye.x - SUN.x;
              const dz = eye.z - SUN.z;
              eye.x = SUN.x + dx * Math.cos(swing) - dz * Math.sin(swing);
              eye.z = SUN.z + dx * Math.sin(swing) + dz * Math.cos(swing);
              eye.y += out * 50;
              aim.copy(SUN);
            } else {
              // And straight off, fast, to where the career begins.
              rawPose(segment.from + (segment.to - segment.from) * (INTRO.pullOut - 0.0001), fromEye, fromAim);
              dwellPose(0, 0, toEye, toAim);
              flight((t - INTRO.pullOut) / (1 - INTRO.pullOut), 60, eye, aim);
            }
          } else if (segment.kind === "travel") {
            dwellPose(segment.city - 1, 1, fromEye, fromAim);
            dwellPose(segment.city, 0, toEye, toAim);
            flight(t, 110 + fromEye.distanceTo(toEye) * 0.16, eye, aim);
          } else {
            // Finish high over the whole map, every place standing.
            dwellPose(segment.city, 1, fromEye, fromAim);
            toEye.copy(WIDE_EYE);
            toAim.copy(WIDE_AIM);
            flight(t, 120, eye, aim);
          }
        };

        // The whole film's camera, sampled and then smoothed as one path, so the
        // seams between moves have no corners and the camera never quite stops.
        const STEPS = 3200;
        let track = new Float64Array((STEPS + 1) * 6);
        {
          const eye = new THREE.Vector3();
          const aim = new THREE.Vector3();
          for (let i = 0; i <= STEPS; i += 1) {
            rawPose(i / STEPS, eye, aim);
            track.set([eye.x, eye.y, eye.z, aim.x, aim.y, aim.z], i * 6);
          }
          const radius = Math.round(STEPS * 0.0028);
          // The film stops dead at the end of every place, so the path is
          // smoothed in stretches between those stops and never across one:
          // where the camera waits is exactly where the shot was composed.
          const breaks = [
            0,
            ...timeline
              .filter((entry) => entry.kind === "dwell")
              .map((entry) => Math.round((entry.to - 0.0004) * STEPS)),
            STEPS,
          ];
          const stretchOf = new Int32Array(STEPS + 1);
          for (let k = 0, i = 0; i <= STEPS; i += 1) {
            while (k < breaks.length - 2 && i > breaks[k + 1]) k += 1;
            stretchOf[i] = k;
          }
          for (let pass = 0; pass < 3; pass += 1) {
            const next = new Float64Array(track.length);
            for (let i = 0; i <= STEPS; i += 1) {
              const low = breaks[stretchOf[i]];
              const high = breaks[stretchOf[i] + 1];
              for (let k = 0; k < 6; k += 1) {
                let sum = 0;
                for (let j = -radius; j <= radius; j += 1) {
                  sum += track[Math.max(low, Math.min(high, i + j)) * 6 + k];
                }
                next[i * 6 + k] = sum / (radius * 2 + 1);
              }
            }
            track = next;
          }
        }
        const sunOnScreen = new THREE.Vector3();
        const eyeNow = new THREE.Vector3();
        const aimNow = new THREE.Vector3();
        const poseAt = (p: number) => {
          const x = Math.max(0, Math.min(1, p)) * STEPS;
          const i = Math.min(STEPS - 1, Math.floor(x));
          const rest = x - i;
          const at = (k: number) =>
            track[i * 6 + k] * (1 - rest) + track[(i + 1) * 6 + k] * rest;
          eyeNow.set(at(0), at(1), at(2));
          aimNow.set(at(3), at(4), at(5));
        };

        // A little bloom, so the fire, the gold caps and the lit metal glow
        // rather than merely being bright.
        const composer = new composerModule.EffectComposer(renderer);
        composer.addPass(new renderModule.RenderPass(scene, camera));
        // The lens holds whatever the camera is looking at and lets the distance
        // and the near foreground go soft, the way a model shot does.
        const lens = new bokehModule.BokehPass(scene, camera, {
          focus: 300,
          aperture: 0.00003,
          maxblur: 0.006,
        });
        composer.addPass(lens);
        // Heat haze: the shimmer behind a jet engine. The picture itself is bent
        // around the sun, in ripples that rise, strongest close to the fire.
        const haze = new shaderModule.ShaderPass({
          uniforms: {
            tDiffuse: { value: null },
            uCentre: { value: new THREE.Vector2(0.5, 0.5) },
            uRadius: { value: 0.3 },
            uStrength: { value: 0 },
            uAspect: { value: 1 },
            uTime: { value: 0 },
          },
          vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
          fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform vec2 uCentre;
          uniform float uRadius;
          uniform float uStrength;
          uniform float uAspect;
          uniform float uTime;
          varying vec2 vUv;
          void main() {
            vec2 d = (vUv - uCentre) * vec2(uAspect, 1.0);
            float r = length(d) / uRadius;
            // Strongest near the fire, reaching further above it: heat rises.
            float fall = smoothstep(1.0, 0.08, r) * (0.55 + 0.45 * smoothstep(-0.4, 0.7, d.y / uRadius));
            float a = sin(vUv.y * 70.0 - uTime * 5.5 + sin(vUv.x * 46.0 + uTime * 2.3) * 2.2);
            float b = sin(vUv.y * 131.0 - uTime * 8.7 + vUv.x * 83.0);
            float c = sin(vUv.x * 57.0 + uTime * 3.1 + vUv.y * 29.0);
            vec2 bend = vec2(a * 0.55 + b * 0.3 + c * 0.35, b * 0.4 + a * 0.2) * 0.0042 * fall * uStrength;
            gl_FragColor = texture2D(tDiffuse, vUv + bend);
          }
        `,
        });
        composer.addPass(haze);

        const labelCamera = new THREE.PerspectiveCamera();
        labelCamera.layers.set(1);
        const labelPass = new renderModule.RenderPass(scene, labelCamera);
        labelPass.clear = false;
        labelPass.clearDepth = true;
        // The sky belongs to the first pass; drawn again here it would paint
        // over the picture the labels are being laid onto.
        const drawLabels = labelPass.render.bind(labelPass);
        labelPass.render = (...args: Parameters<typeof drawLabels>) => {
          const sky = scene.background;
          scene.background = null;
          drawLabels(...args);
          scene.background = sky;
        };
        composer.addPass(labelPass);
        const bloom = new bloomModule.UnrealBloomPass(
          new THREE.Vector2(1, 1),
          0.42,
          0.65,
          0.88,
        );
        composer.addPass(bloom);
        composer.addPass(new outputModule.OutputPass());

        const resize = () => {
          renderer.setSize(host.clientWidth, host.clientHeight, false);
          composer.setSize(host.clientWidth, host.clientHeight);
          camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
          camera.updateProjectionMatrix();
        };
        resize();
        window.addEventListener("resize", resize);

        let frame = 0;
        const clock = new THREE.Clock();
        let idle = 0;
        let wasHolding = false;
        let heldAt = -1;
        let touched = false;
        let handedOver = false;
        controls.addEventListener("controlstart", () => {
          touched = true;
        });

        // Stopped at a place: drag circles it, the wheel zooms, and neither
        // can take the camera away from it or under the ground.
        const takeTheCamera = () => {
          poseAt(progressRef.current);
          // Arriving by the film, ease in; thrown here by a tick, cut.
          const cut = snapRef.current;
          snapRef.current = false;
          controls.setLookAt(eyeNow.x, eyeNow.y, eyeNow.z, aimNow.x, aimNow.y, aimNow.z, !cut);
          handedOver = false;
          touched = false;
        };
        // The camera is only handed over once it has arrived: limits applied
        // while it is still flying in would yank it about.
        const handOver = () => {
          const reach = eyeNow.distanceTo(aimNow);
          controls.minDistance = reach * 0.55;
          controls.maxDistance = reach * 1.45;
          controls.minPolarAngle = 0.35;
          controls.maxPolarAngle = 1.42;
          controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
          controls.mouseButtons.wheel = CameraControls.ACTION.DOLLY;
          controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
          controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY;
          handedOver = true;
        };
        const giveItBack = () => {
          controls.mouseButtons.left = CameraControls.ACTION.NONE;
          controls.mouseButtons.wheel = CameraControls.ACTION.NONE;
          controls.touches.one = CameraControls.ACTION.NONE;
          controls.touches.two = CameraControls.ACTION.NONE;
          controls.minDistance = 0.1;
          controls.maxDistance = Infinity;
          controls.minPolarAngle = 0;
          controls.maxPolarAngle = Math.PI;
        };
        const render = () => {
          if (isFilmSuspended()) {
            // Put away behind the portfolio: draw nothing, and don't let the
            // clock run on, so it resumes exactly where it was.
            clock.getDelta();
            frame = requestAnimationFrame(render);
            return;
          }
          const p = progressRef.current;
          // Everything is a function of the scrubber: park it and the frame is still.
          // …except while it is holding at a place for the card to be read:
          // then the machine keeps turning on the clock, and the camera drifts.
          const dt = Math.min(0.05, clock.getDelta());
          const holdingNow = holdingRef.current;
          if (holdingNow) idle += dt;
          if (holdingNow !== wasHolding || (holdingNow && Math.abs(p - heldAt) > 1e-6)) {
            // Also when thrown from one stop straight to another: let go of the
            // first before taking hold at the second.
            wasHolding = holdingNow;
            heldAt = p;
            giveItBack();
            if (holdingNow) takeTheCamera();
          }
          const phase = p * 34 + idle * 0.55;
          const segment = segmentAt(timeline, p);
          const t = within(segment, p);

          poseAt(p);
          // Damping is a slow start by another name, so on a hop it is nearly off.
          controls.smoothTime = segment.kind === "travel" ? 0.07 : 0.3;
          if (!holdingNow) {
            // On the move the scrubber places the camera and camera-controls
            // eases it there — from wherever it is, including wherever the
            // viewer left it. It only cuts when the film is thrown somewhere.
            const cut = snapRef.current;
            snapRef.current = false;
            controls.setLookAt(eyeNow.x, eyeNow.y, eyeNow.z, aimNow.x, aimNow.y, aimNow.z, !cut);
          } else if (!handedOver) {
            if (camera.position.distanceTo(eyeNow) < 24) handOver();
          } else if (!touched) {
            // Until somebody takes hold of it, it keeps circling slowly.
            controls.rotate(dt * 0.05, 0, true);
          }
          controls.update(dt);
          // Close in, the lens is shallow and the background melts; pulled back
          // over the whole map it stops down so the country stays sharp.
          const reach = camera.position.distanceTo(aimNow);
          const lensUniforms = lens.uniforms as Record<
            string,
            { value: number }
          >;
          lensUniforms.focus.value = reach;
          lensUniforms.aperture.value =
            0.00003 * Math.max(0.02, Math.min(1, (240 / reach) ** 1.6));

          // The sun burns on the clock, not the scrubber: it is the one living thing here.
          const forging = segment.kind === "intro";
          astrolabe.update(clock.elapsedTime, camera, {
            sun: forging ? softly(INTRO.sun[0], INTRO.sun[1], t) : 1,
            bands: INTRO.bands.map(([from, to]) => (forging ? softly(from, to, t) : 1)),
            etch: INTRO.etch.map(([from, to]) => (forging ? softly(from, to, t) : 1)),
          });

          placed.forEach((stop, index) => {
            const dwell = timeline.find(
              (entry) => entry.kind === "dwell" && entry.city === index,
            )!;
            const built =
              p >= dwell.to ? 1 : segment === dwell ? builtWithin(t, stop.later) : 0;
            const leaving = timeline[timeline.indexOf(dwell) + 1];
            const focus =
              segment === dwell
                ? Math.min(1, t * 5)
                : segment === leaving
                  ? Math.max(0, 1 - within(leaving, p) / 0.3)
                  : 0;
            if (stop.later) stop.build.growLater?.(built, phase, focus);
            else stop.build.grow(built, phase, focus);
            // The gears turn only while the place is going up, and they are what raises it.
            stop.gears?.turn(built * 2.6, softly(0, 0.18, built));
            if (stop.engraved)
              (stop.engraved.material as ThreeTypes.MeshBasicMaterial).opacity =
                0.16 + built * 0.74;
          });

          // Where the sun is on screen, and how large: that is where the air bends.
          sunOnScreen.copy(SUN).project(camera);
          const sunDistance = camera.position.distanceTo(SUN);
          const facing = sunOnScreen.z < 1 ? 1 : 0;
          haze.uniforms.uCentre.value.set(
            sunOnScreen.x * 0.5 + 0.5,
            sunOnScreen.y * 0.5 + 0.5,
          );
          haze.uniforms.uRadius.value = Math.min(
            1.4,
            300 / Math.max(60, sunDistance),
          );
          haze.uniforms.uStrength.value =
            facing * Math.min(1, 900 / Math.max(200, sunDistance));
          haze.uniforms.uAspect.value = camera.aspect;
          haze.uniforms.uTime.value = clock.elapsedTime;

          labelCamera.position.copy(camera.position);
          labelCamera.quaternion.copy(camera.quaternion);
          labelCamera.fov = camera.fov;
          labelCamera.aspect = camera.aspect;
          labelCamera.near = camera.near;
          labelCamera.far = camera.far;
          labelCamera.updateProjectionMatrix();
          composer.render();
          frame = requestAnimationFrame(render);
        };
        frame = requestAnimationFrame(render);

        cleanup = () => {
          cancelAnimationFrame(frame);
          window.removeEventListener("resize", resize);
          scene.traverse((object) => {
            const mesh = object as ThreeTypes.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            const material = mesh.material as
              ThreeTypes.Material | ThreeTypes.Material[] | undefined;
            if (Array.isArray(material))
              material.forEach((entry) => entry.dispose());
            else material?.dispose();
          });
          controls.dispose();
          composer.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      },
    );

    return () => {
      disposed = true;
      cleanup();
    };
  }, [accentsKey, banner, cities, timeline]);

  // Where the film waits: the end of each place's turn, built and framed.
  const holds = useMemo(
    () => timeline.filter((entry) => entry.kind === "dwell").map((entry) => entry.to - 0.0004),
    [timeline],
  );

  // Play, in either direction, until the next place — or an end — is reached.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (isFilmSuspended()) {
        last = now;
        frame = requestAnimationFrame(tick);
        return;
      }
      // Going back is a rewind, so it runs three times as fast. A frame that
      // arrives after a long gap (the tab or the film hidden) counts as one
      // frame, not the whole gap, so coming back never jumps to the end.
      const step = (Math.min(now - last, 100) / (filmSeconds * 1000)) * (direction < 0 ? 3 : 1);
      last = now;
      setProgress((current) => {
        const next = current + step * direction;
        const hold =
          direction > 0
            ? holds.find((at) => current < at && next >= at)
            : [...holds].reverse().find((at) => current > at && next <= at);
        if (hold !== undefined) {
          setPlaying(false);
          setHolding(true);
          return hold;
        }
        if (next >= 1) {
          setPlaying(false);
          return 1;
        }
        if (next <= 0) {
          setPlaying(false);
          return 0;
        }
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [direction, holds, playing]);

  /** On to the next place (or, from the last one, out to the ending). */
  const goNext = () => {
    setHolding(false);
    setDirection(1);
    setProgress((current) => Math.min(1, current + 0.0006));
    setPlaying(true);
  };

  /** Back to the place before this one. */
  const goPrevious = () => {
    setHolding(false);
    setDirection(-1);
    setProgress((current) => Math.max(0, current - 0.0006));
    setPlaying(true);
  };

  /** From the top. */
  const replay = () => {
    snapRef.current = true;
    setHolding(false);
    setDirection(1);
    setProgress(0);
    setPlaying(true);
  };

  // Left to itself, it moves on after a read.
  useEffect(() => {
    if (!holding || !autoContinue) return;
    const timer = window.setTimeout(goNext, 9000);
    return () => window.clearTimeout(timer);
  }, [autoContinue, holding]);

  const segment = segmentAt(timeline, progress);
  const active = cities[segment.city];
  const atPlace = segment.kind === "dwell";
  const cityIndex = segment.city;
  const isFirstPlace = cityIndex === 0;

  // Right arrow, space or Enter: next. Left arrow: previous.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isFilmSuspended()) return;
      if ((event.target as HTMLElement).closest("input, textarea")) return;
      if (!holdingRef.current) return;
      if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fractions = buildFractions(timeline, cities, progress);
  const experience = experienceAt(cities, fractions);
  const ending = segment.kind === "outro" ? softly(0.35, 0.8, within(segment, progress)) : 0;
  const era =
    segment.kind === "intro"
      ? `${Math.round(cities[0].from)}`
      : segment.kind === "outro"
        ? `${Math.round(cities[0].from)} – today`
        : yearsLabel(active);
  const stops = timeline.filter((entry) => entry.kind === "dwell");

  // The opening is long, and on an honest bar it would push every place to
  // the right. So the bar is drawn to its own scale — the opening gets a short
  // stretch marked Start — while the film itself plays at exactly the speed it
  // always did.
  const introEnd = timeline[0].to;
  const START_STRETCH = 0.055;
  const toBar = (at: number) =>
    at <= introEnd
      ? (at / introEnd) * START_STRETCH
      : START_STRETCH + ((at - introEnd) / (1 - introEnd)) * (1 - START_STRETCH);
  const fromBar = (bar: number) =>
    bar <= START_STRETCH
      ? (bar / START_STRETCH) * introEnd
      : introEnd + ((bar - START_STRETCH) / (1 - START_STRETCH)) * (1 - introEnd);
  const fresh = active.entries.filter((entry) => entry.fresh).slice(0, PIECE_LIMIT);
  const carried = active.entries.filter((entry) => !entry.fresh).slice(0, PIECE_LIMIT);

  // What this place added: each discipline it touched, before it and after it.
  const before = experienceAt(
    cities,
    fractions.map((_, index) => (index < cityIndex ? 1 : 0)),
  );
  const after = experienceAt(
    cities,
    fractions.map((_, index) => (index <= cityIndex ? 1 : 0)),
  );
  const growth = after.rows
    .map((row) => {
      const was = before.rows.find((other) => other.slug === row.slug)?.years ?? 0;
      return { slug: row.slug, name: row.name, was, now: row.years, gained: row.years - was };
    })
    .filter((row) => row.gained > 0.05)
    .sort((a, b) => b.gained - a.gained)
    .slice(0, 6);
  const longest = Math.max(1, ...after.rows.map((row) => row.years));
  const built = fractions[cityIndex] ?? 0;
  const showCard = SHOW_CHAPTER_CARD && atPlace && built > 0.86;

  return (
    <div className={`titles${holding ? " is-holding" : ""}`} ref={rootRef}>
      <div className="titles__stage" ref={hostRef} />
      <div className="titles__vignette" aria-hidden="true" />

      {SHOW_TITLE ? (
        <header className="titles__head">
          <p className="titles__eyebrow">Harma Davtian · sketch, mock data</p>
          <h1 className="titles__name">The Working Years</h1>
          <p className="titles__era">{era}</p>
        </header>
      ) : null}

      <button
        type="button"
        className={`titles__toggle${panelOpen ? " is-on" : ""}`}
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen((current) => !current)}
      >
        Skill progress
      </button>
      <Tally
        rows={experience.rows}
        since={since}
        open={openRows}
        setOpen={setOpenRows}
        moving={moving}
        shown={panelOpen}
      />

      {/* Stopped at a place: where we are, and the way on or back. */}
      <section className={`titles__now${holding ? " is-on" : ""}`} aria-hidden={!holding}>
        <h2 className="titles__now-name">{active.name}</h2>
        <p className="titles__now-years">{yearsLabel(active)}</p>
        {active.title ? <p className="titles__now-role">{active.title}</p> : null}
        <div className="titles__nav">
          <button type="button" className="titles__nav-button" onClick={goPrevious} disabled={!holding || isFirstPlace}>
            <span aria-hidden="true">←</span> Previous
          </button>
          <button type="button" className="titles__nav-button" onClick={goNext} disabled={!holding}>
            Next <span aria-hidden="true">→</span>
          </button>
        </div>
        <label className="titles__auto">
          <input
            type="checkbox"
            checked={autoContinue}
            disabled={!holding}
            onChange={(event) => setAutoContinue(event.target.checked)}
          />
          auto-continue
        </label>
      </section>

      {SHOW_CHAPTER_CARD ? (
        <aside className={`titles__card${showCard ? " is-on" : ""}`}>
          <p className="titles__card-kicker">
            Chapter {cityIndex + 1} of {cities.length}
            {DIRECTION_BY_PLACE[active.slug] ? ` · look ${DIRECTION_BY_PLACE[active.slug]}` : " · look A+B+C"}
          </p>
          <h2 className="titles__card-name">{active.name}</h2>
          <p className="titles__card-years">{yearsLabel(active)}</p>
          {fresh.length > 0 ? (
            <>
              <h3 className="titles__card-head is-new">Learned here</h3>
              <ul className="titles__chips">
                {fresh.map((entry) => (
                  <li key={entry.name} className="is-new">
                    {entry.name}
                    <span>{say(entry.years)} yrs</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {carried.length > 0 ? (
            <>
              <h3 className="titles__card-head">Carried further</h3>
              <ul className="titles__chips">
                {carried.map((entry) => (
                  <li key={entry.name}>
                    {entry.name}
                    <span>+{say(entry.years)} yrs</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {growth.length > 0 ? (
            <>
              <h3 className="titles__card-head">Experience, before and after</h3>
              <ul className="titles__growth">
                {growth.map((row) => (
                  <li key={row.slug}>
                    <span className="titles__growth-name">{row.name}</span>
                    <span className="titles__growth-bar">
                      <span className="titles__growth-was" style={{ width: `${(row.was / longest) * 100}%` }} />
                      <span className="titles__growth-gain" style={{ width: `${(row.gained / longest) * 100}%` }} />
                    </span>
                    <span className="titles__growth-figures">
                      {row.was > 0.05 ? `${say(row.was)} → ` : ""}
                      <strong>{say(row.now)} yrs</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </aside>
      ) : null}

      <section
        className="titles__finale"
        style={{ opacity: ending, pointerEvents: ending > 0.6 ? "auto" : "none" }}
        aria-hidden={ending < 0.5}
      >
        <p className="titles__finale-since">Since {since}</p>
        <p className="titles__finale-craft">One craft</p>
        <ul className="titles__finale-list">
          {experience.rows
            .filter((row) => ["frontend", "backend", "data", "cloud", "leadership"].includes(row.slug))
            .map((row) => (
              <li key={row.slug}>
                <strong>{Math.floor(row.years)}</strong>
                <span>yrs · {row.name}</span>
              </li>
            ))}
        </ul>
        <p className="titles__finale-links">
          <button type="button" onClick={replay}>
            Replay
          </button>
          <Link to="/resume">Read resume</Link>
          <Link to="/cinematic">Enter space theme portfolio</Link>
        </p>
      </section>

      <div className="titles__scrub">
        <button
          type="button"
          className={`titles__play${playing ? " is-on" : ""}`}
          onClick={() => {
            // One button that does the sensible thing: replay at the end, pause
            // on the move, on to the next place from a stop, otherwise play.
            if (progress >= 1) replay();
            else if (playing) setPlaying(false);
            else if (holding) goNext();
            else {
              setDirection(1);
              setPlaying(true);
            }
          }}
        >
          {progress >= 1 ? "Replay" : playing ? "Pause" : "Play ▶"}
        </button>
        <div className="titles__track">
          <input
            id="titles-scrubber"
            type="range"
            min={0}
            max={1}
            step={0.00002}
            value={toBar(progress)}
            aria-label="Scrub the sequence"
            onChange={(event) => {
              setPlaying(false);
              setHolding(false);
              snapRef.current = true;
              setProgress(fromBar(Number(event.target.value)));
            }}
          />
          <div className="titles__stops">
            <button
              type="button"
              className={`titles__stop${segment.kind === "intro" ? " is-on" : ""}`}
              style={{ left: "0%" }}
              title="The opening"
              onClick={() => {
                snapRef.current = true;
                setPlaying(false);
                setHolding(false);
                setProgress(0);
              }}
            >
              <span>Start</span>
            </button>
            {stops.map((stop, index) => (
              <button
                key={`${cities[stop.city].slug}-${stop.from}`}
                type="button"
                className={`titles__stop${stop === segment ? " is-on" : ""}`}
                // The mark stands where the place is finished, not where it starts going up.
                style={{ left: `${toBar(holds[index]) * 100}%` }}
                title={`${cities[stop.city].name} · ${yearsLabel(cities[stop.city])}`}
                onClick={() => {
                  snapRef.current = true;
                  setPlaying(false);
                  setProgress(holds[index]);
                  setHolding(true);
                }}
              >
                <span>{cities[stop.city].name.split(" ")[0]}</span>
                <span className="titles__stop-years">
                  {Math.round(cities[stop.city].from)}–
                  {cities[stop.city].to >= LAST_YEAR - 1
                    ? "now"
                    : String(Math.round(cities[stop.city].to)).slice(2)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The message: years of experience so far, by discipline, opening into the skills behind each. */
function Tally({
  rows,
  since,
  open,
  setOpen,
  moving,
  shown,
}: {
  rows: ExperienceRow[];
  since: number;
  open: string[];
  setOpen: (next: string[]) => void;
  moving: boolean;
  shown: boolean;
}) {
  const most = Math.max(1, NOW_YEAR - 1994, ...rows.map((row) => row.years));
  return (
    <aside className={`tally${shown ? " is-open" : ""}`} aria-hidden={!shown}>
      <Embers moving={moving} />
      <div className="tally__inner">
        {SHOW_PANEL_HEADINGS ? (
          <>
            <h2 className="tally__title">Experience so far</h2>
            <p className="tally__total">by discipline · building since {since}</p>
          </>
        ) : null}
        <ul className="tally__list">
          {rows.map((row) => {
            const isOpen = open.includes(row.slug);
            return (
              <li
                key={row.slug}
                className={`tally__row${row.hot && moving ? " is-hot" : ""}`}
              >
                <button
                  type="button"
                  className="tally__name"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen(
                      isOpen
                        ? open.filter((slug) => slug !== row.slug)
                        : [...open, row.slug],
                    )
                  }
                >
                  <span className="tally__chevron" aria-hidden="true">
                    {isOpen ? "–" : "+"}
                  </span>
                  {row.name}
                  <span className="tally__years">{say(row.years)} yrs</span>
                </button>
                <span className="tally__bar">
                  <span
                    className="tally__fill"
                    style={{
                      width: `${Math.min(100, (row.years / most) * 100)}%`,
                    }}
                  />
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

/** Embers drifting up behind the tally. They hold still with everything else when the scrubber is parked. */
function Embers({ moving }: { moving: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const movingRef = useRef(moving);
  useEffect(() => {
    movingRef.current = moving;
  }, [moving]);
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

    const sparks = Array.from({ length: 40 }, () => ({
      x: Math.random(),
      y: Math.random(),
      speed: 0.0009 + Math.random() * 0.0022,
      sway: Math.random() * Math.PI * 2,
      size: 0.6 + Math.random() * 1.9,
      life: Math.random(),
    }));

    let frame = 0;
    const draw = () => {
      if (!movingRef.current) {
        frame = requestAnimationFrame(draw);
        return;
      }
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
        gradient.addColorStop(0, `rgba(255, 196, 96, ${0.7 * glow})`);
        gradient.addColorStop(0.4, `rgba(226, 118, 32, ${0.28 * glow})`);
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
