import { useEffect, useMemo, useRef, useState } from "react";
import type * as ThreeTypes from "three";
import { useShowcaseProjects } from "../showcase/lib/useShowcaseProjects";
import { makeAstrolabe } from "./gotAstrolabe";
import { KIND_BY_PLACE, KIND_ORDER, makeBuilders, type Build } from "./gotBuilders";
import { LAST_YEAR, NOW_YEAR, categories, places, say, spans } from "./skillsData";
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

const NOTES: Record<string, string> = {
  stormscape: "Own studio: freelance and side work, running alongside everything that follows",
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

function buildTimeline(cities: City[]): Segment[] {
  const parts: Array<{ kind: SegmentKind; city: number; weight: number }> = [
    { kind: "intro", city: 0, weight: 2.7 },
  ];
  cities.forEach((city, index) => {
    if (index > 0) {
      const a = LAYOUT[cities[index - 1].slug] ?? LAYOUT[cities[cities[index - 1].spot].slug] ?? [0, 0];
      const b = LAYOUT[city.slug] ?? LAYOUT[cities[city.spot].slug] ?? [0, 0];
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
      parts.push({ kind: "travel", city: index, weight: 0.9 + distance / 1500 });
    }
    parts.push({ kind: "dwell", city: index, weight: city.slug === "stormscape" ? 2.5 : 2.1 });
  });
  parts.push({ kind: "outro", city: cities.length - 1, weight: 1.9 });

  const total = parts.reduce((sum, part) => sum + part.weight, 0);
  let cursor = 0;
  return parts.map((part) => {
    const from = cursor;
    cursor += part.weight / total;
    return { kind: part.kind, city: part.city, from, to: cursor };
  });
}

const segmentAt = (timeline: Segment[], progress: number) =>
  timeline.find((segment) => progress >= segment.from && progress < segment.to) ?? timeline[timeline.length - 1];

const within = (segment: Segment, progress: number) =>
  Math.max(0, Math.min(1, (progress - segment.from) / Math.max(0.0001, segment.to - segment.from)));

/** Softer than smoothstep at both ends: no corner going in or coming out. */
const softly = (edge: number, to: number, value: number) => {
  const x = Math.max(0, Math.min(1, (value - edge) / (to - edge)));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** How far each place has been built: nothing before its turn, the scrubber during it. */
function buildFractions(timeline: Segment[], cities: City[], progress: number) {
  const current = segmentAt(timeline, progress);
  const t = within(current, progress);
  return cities.map((_, index) => {
    const dwell = timeline.find((segment) => segment.kind === "dwell" && segment.city === index)!;
    if (progress >= dwell.to) return 1;
    if (current === dwell) return softly(0.04, 0.82, t);
    return 0;
  });
}

const unionYears = (ranges: Array<[number, number]>) => {
  const sorted = ranges.filter(([from, to]) => to > from).sort((a, b) => a[0] - b[0]);
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
  const byCategory = new Map<string, { ranges: Array<[number, number]>; hot: boolean; skills: Map<string, Array<[number, number]>> }>();
  const everything: Array<[number, number]> = [];

  cities.forEach((city, index) => {
    const built = fractions[index];
    if (built <= 0.001) return;
    const rising = built < 0.999;
    for (const entry of city.entries) {
      const range: [number, number] = [entry.from, entry.from + (entry.to - entry.from) * built];
      everything.push(range);
      for (const slug of entry.categories) {
        const era = categories.find((category) => category.slug === slug)?.era;
        const clipped: [number, number] = era ? [Math.max(range[0], era), range[1]] : range;
        if (clipped[1] <= clipped[0]) continue;
        const row = byCategory.get(slug) ?? {
          ranges: [] as Array<[number, number]>,
          hot: false,
          skills: new Map<string, Array<[number, number]>>(),
        };
        row.ranges.push(clipped);
        row.hot = row.hot || rising;
        row.skills.set(entry.name, [...(row.skills.get(entry.name) ?? []), clipped]);
        byCategory.set(slug, row);
      }
    }
  });

  const rows: ExperienceRow[] = categories
    .filter((category) => byCategory.has(category.slug))
    .map((category) => {
      const row = byCategory.get(category.slug)!;
      return {
        slug: category.slug,
        name: category.name,
        years: unionYears(row.ranges),
        hot: row.hot,
        skills: [...row.skills.entries()]
          .map(([name, ranges]) => ({ name, years: unionYears(ranges) }))
          .sort((a, b) => b.years - a.years),
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
  const since = useMemo(() => {
    const years = projects.map((project) => project.year).filter((year): year is number => typeof year === "number");
    return years.length > 0 ? Math.min(...years) : Math.floor(cities[0].from);
  }, [cities, projects]);
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [direction, setDirection] = useState(1);
  const [openRows, setOpenRows] = useState<string[]>([]);
  // Nothing on screen moves unless the scrubber does.
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    progressRef.current = progress;
    setMoving(true);
    const settle = window.setTimeout(() => setMoving(false), 220);
    return () => window.clearTimeout(settle);
  }, [progress]);

  // The wheel winds the film forward and back.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement).closest(".tally__inner")) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      setPlaying(false);
      setProgress((current) => Math.max(0, Math.min(1, current + (event.deltaY * unit) / 21000)));
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
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
    ]).then(([THREE, cameraControls, composerModule, renderModule, bloomModule, outputModule, bokehModule]) => {
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
        return new THREE.Vector2(Math.cos(angle) * 900, Math.sin(angle) * 600);
      });

      const SEA = -6;
      const wild = (x: number, z: number) =>
        48 * Math.sin(x * 0.0019 + 0.6) * Math.cos(z * 0.0024 - 0.4) +
        26 * Math.sin(x * 0.0052 + z * 0.0037) +
        13 * Math.cos(z * 0.0098 - x * 0.0031) +
        5 * Math.sin(x * 0.021) * Math.sin(z * 0.019) +
        // Ranges of mountains, away from where anything is built.
        70 * Math.max(0, Math.sin(x * 0.0041 + 2) * Math.sin(z * 0.0052 + 1)) ** 2;

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
          if (d < 130) h += (spotHeights[index] - h) * softly(0, 1, 1 - Math.max(0, d - 70) / 60);
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
        const biome = BIOME_BY_PLACE[city.slug] ?? BIOME_BY_PLACE[cities[city.spot].slug] ?? "heath";
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
        const greenness = Math.max(0, low.g - Math.max(low.r, low.b) + 0.06) * 6;
        const patch = Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.017 - 0.6) + Math.sin((x + z) * 0.031) * 0.5;
        if (y > SEA + 3 && y < 46 && patch > 0.3) {
          colour.lerp(wood, Math.min(0.6, (patch - 0.3) * 1.2) * Math.min(1, greenness + 0.25));
        }
        colours.set([colour.r, colour.g, colour.b], i * 3);
      }
      terrain.setAttribute("color", new THREE.BufferAttribute(colours, 3));
      terrain.computeVertexNormals();
      const land = new THREE.Mesh(
        terrain,
        new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96, metalness: 0.02 }),
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
        const drift = Math.sin(x * 0.0031 + 0.8) * Math.cos(z * 0.0027 - 1.1) * 14;
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
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.35 }),
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
        years: Array.from(
          { length: Math.floor(NOW_YEAR) - Math.floor(cities[0].from) + 1 },
          (_, i) => String(Math.floor(cities[0].from) + i),
        ).join("  ·  "),
        places: cities
          .filter((city, index) => city.spot === index)
          .map((city) => city.name.toUpperCase())
          .join("   ✦   "),
        disciplines: categories.map((category) => category.name.toUpperCase()).join("   ✦   "),
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
        const width = Math.min(canvas.width - 8, ctx.measureText(text).width + 30);
        ctx.fillStyle = "rgba(10, 7, 4, 0.78)";
        ctx.fillRect((canvas.width - width) / 2, 10, width, 52);
        ctx.strokeStyle = bright ? "rgba(255, 196, 96, 0.95)" : "rgba(214, 180, 120, 0.4)";
        ctx.lineWidth = 2;
        ctx.strokeRect((canvas.width - width) / 2 + 1, 11, width - 2, 50);
        ctx.fillStyle = bright ? "#ffd27a" : "#f1dfba";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 30);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthTest: false }),
        );
        sprite.scale.set(34, 3.8, 1);
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
        { r0: 250, r1: 176, h0: 112, h1: 62, sweep: -1.9, aim: 30 },
        { r0: 196, r1: 224, h0: 58, h1: 176, sweep: 1.5, aim: 28 },
        { r0: 272, r1: 168, h0: 196, h1: 74, sweep: -1.6, aim: 32 },
        { r0: 222, r1: 186, h0: 76, h1: 96, sweep: 2.3, aim: 34 },
      ];
      const HOMECOMING: Shot = { r0: 320, r1: 236, h0: 200, h1: 126, sweep: 2.5, aim: 36 };
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

      const tallest = Math.max(1, ...cities.flatMap((city) => city.entries.map((entry) => entry.years)));
      const placed: Placed[] = [];
      cities.forEach((city, index) => {
        if (city.spot !== index) {
          const first = placed[city.spot];
          placed.push({ build: first.build, gears: null, engraved: null, at: first.at, later: true });
          return;
        }
        const spot = spots[index];
        const at = new THREE.Vector3(spot.x, spotHeights[index], spot.y);
        const laterCity = cities.find((other) => other.spot === index && other !== city);
        const build = byKind[city.kind](
          city.entries.slice(0, PIECE_LIMIT),
          tallest,
          laterCity?.entries.slice(0, PIECE_LIMIT),
        );
        build.group.position.copy(at).add(new THREE.Vector3(0, 1.5, 0));
        scene.add(build.group);

        const gears = gearPlatform();
        gears.holder.position.copy(at);
        const base = new THREE.Group();
        base.position.copy(at);
        base.add(gears.holder);
        gears.holder.position.set(0, 0, 0);
        scene.add(base);

        // The name, engraved into the map beside the place and draped over
        // the ground so no rise in the land can swallow a letter.
        // It lies on the side the camera spends its time, turned to be read from there.
        const before = index > 0 ? spots[index - 1] : new THREE.Vector2(0, 360);
        const facing =
          Math.atan2(before.x - spot.x, before.y - spot.y) + SHOTS[index % SHOTS.length].sweep * 0.55;
        const width = 170;
        const plate = new THREE.PlaneGeometry(width, width / 4, 48, 12);
        plate.rotateX(-Math.PI / 2);
        plate.rotateY(facing);
        const drape = plate.attributes.position;
        const px = at.x + Math.sin(facing) * 112;
        const pz = at.z + Math.cos(facing) * 112;
        for (let i = 0; i < drape.count; i += 1) {
          drape.setY(i, Math.max(SEA, heightAt(px + drape.getX(i), pz + drape.getZ(i))) + 1.6);
        }
        const engraved = new THREE.Mesh(
          plate,
          new THREE.MeshBasicMaterial({
            map: nameTexture(city.name.toUpperCase(), yearsLabel(city).toUpperCase()),
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

      const shotFor = (index: number) => (placed[index].later ? HOMECOMING : SHOTS[index % SHOTS.length]);

      // A place is entered from the side the camera has come from.
      const arrival = (index: number) => {
        const here = placed[index].at;
        const before = index > 0 ? placed[index - 1].at : new THREE.Vector3(SUN.x, 0, SUN.z + 400);
        return Math.atan2(before.x - here.x, before.z - here.z);
      };

      const dwellPose = (index: number, t: number, eye: ThreeTypes.Vector3, aim: ThreeTypes.Vector3) => {
        const shot = shotFor(index);
        const here = placed[index].at;
        const e = softly(0, 1, t);
        const angle = arrival(index) + shot.sweep * e;
        const radius = shot.r0 + (shot.r1 - shot.r0) * e;
        const height = shot.h0 + (shot.h1 - shot.h0) * e;
        eye.set(here.x + Math.sin(angle) * radius, here.y + height, here.z + Math.cos(angle) * radius);
        aim.set(here.x, here.y + shot.aim, here.z);
      };

      const fromEye = new THREE.Vector3();
      const fromAim = new THREE.Vector3();
      const toEye = new THREE.Vector3();
      const toAim = new THREE.Vector3();
      const over = new THREE.Vector3();
      const WIDE_EYE = new THREE.Vector3(0, 1500, 2050);
      const WIDE_AIM = new THREE.Vector3(0, 0, -60);
      const CLOSE_EYE = new THREE.Vector3(SUN.x + 26, SUN.y + 8, SUN.z + 150);
      const OPEN_EYE = new THREE.Vector3(SUN.x + 90, SUN.y + 96, SUN.z + 520);

      /** A flight: up and over between two poses, the look running a little ahead of the body. */
      const flight = (t: number, lift: number, eye: ThreeTypes.Vector3, aim: ThreeTypes.Vector3) => {
        const e = softly(0, 1, t);
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
        aim.lerpVectors(fromAim, toAim, softly(0.05, 0.85, t));
      };

      const rawPose = (p: number, eye: ThreeTypes.Vector3, aim: ThreeTypes.Vector3) => {
        const segment = segmentAt(timeline, p);
        const t = within(segment, p);
        if (segment.kind === "dwell") {
          dwellPose(segment.city, t, eye, aim);
        } else if (segment.kind === "intro") {
          // Open in close on the fire, ease back until the bands are all in
          // frame, then tip down to where the career begins.
          if (t < 0.52) {
            eye.lerpVectors(CLOSE_EYE, OPEN_EYE, softly(0.12, 1, t / 0.52));
            aim.copy(SUN);
          } else {
            fromEye.copy(OPEN_EYE);
            fromAim.copy(SUN);
            dwellPose(0, 0, toEye, toAim);
            flight((t - 0.52) / 0.48, 60, eye, aim);
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
        const radius = Math.round(STEPS * 0.009);
        for (let pass = 0; pass < 3; pass += 1) {
          const next = new Float64Array(track.length);
          for (let i = 0; i <= STEPS; i += 1) {
            for (let k = 0; k < 6; k += 1) {
              let sum = 0;
              for (let j = -radius; j <= radius; j += 1) {
                sum += track[Math.max(0, Math.min(STEPS, i + j)) * 6 + k];
              }
              next[i * 6 + k] = sum / (radius * 2 + 1);
            }
          }
          track = next;
        }
      }
      const eyeNow = new THREE.Vector3();
      const aimNow = new THREE.Vector3();
      const poseAt = (p: number) => {
        const x = Math.max(0, Math.min(1, p)) * STEPS;
        const i = Math.min(STEPS - 1, Math.floor(x));
        const rest = x - i;
        const at = (k: number) => track[i * 6 + k] * (1 - rest) + track[(i + 1) * 6 + k] * rest;
        eyeNow.set(at(0), at(1), at(2));
        aimNow.set(at(3), at(4), at(5));
      };

      // A little bloom, so the fire, the gold caps and the lit metal glow
      // rather than merely being bright.
      const composer = new composerModule.EffectComposer(renderer);
      composer.addPass(new renderModule.RenderPass(scene, camera));
      // The lens holds whatever the camera is looking at and lets the distance
      // and the near foreground go soft, the way a model shot does.
      const lens = new bokehModule.BokehPass(scene, camera, { focus: 300, aperture: 0.00003, maxblur: 0.006 });
      composer.addPass(lens);
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
      const bloom = new bloomModule.UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.65, 0.88);
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
      const render = () => {
        const p = progressRef.current;
        // Everything is a function of the scrubber: park it and the frame is still.
        const phase = p * 34;
        const segment = segmentAt(timeline, p);
        const t = within(segment, p);

        poseAt(p);
        const leap = camera.position.distanceTo(eyeNow) > 420;
        controls.setLookAt(eyeNow.x, eyeNow.y, eyeNow.z, aimNow.x, aimNow.y, aimNow.z, !leap);
        controls.update(Math.min(0.05, clock.getDelta()));
        // Close in, the lens is shallow and the background melts; pulled back
        // over the whole map it stops down so the country stays sharp.
        const reach = camera.position.distanceTo(aimNow);
        const lensUniforms = lens.uniforms as Record<string, { value: number }>;
        lensUniforms.focus.value = reach;
        lensUniforms.aperture.value = 0.00003 * Math.max(0.02, Math.min(1, (240 / reach) ** 1.6));

        // The sun burns on the clock, not the scrubber: it is the one living thing here.
        astrolabe.update(clock.elapsedTime, camera);

        placed.forEach((stop, index) => {
          const dwell = timeline.find((entry) => entry.kind === "dwell" && entry.city === index)!;
          const built = p >= dwell.to ? 1 : segment === dwell ? softly(0.04, 0.82, t) : 0;
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
          if (stop.engraved) (stop.engraved.material as ThreeTypes.MeshBasicMaterial).opacity = 0.16 + built * 0.74;
        });

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
          const material = mesh.material as ThreeTypes.Material | ThreeTypes.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material?.dispose();
        });
        controls.dispose();
        composer.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    });

    return () => {
      disposed = true;
      cleanup();
    };
  }, [cities, timeline]);

  // Play, in either direction, until an end is reached.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = (now - last) / 118000; // the whole film in about two minutes
      last = now;
      setProgress((current) => {
        const next = current + step * direction;
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
  }, [direction, playing]);

  const segment = segmentAt(timeline, progress);
  const active = cities[segment.city];
  const atPlace = segment.kind === "dwell";
  const fractions = buildFractions(timeline, cities, progress);
  const experience = experienceAt(cities, fractions);
  const ending = segment.kind === "outro" ? softly(0.35, 0.8, within(segment, progress)) : 0;
  const era =
    segment.kind === "intro"
      ? `${Math.round(cities[0].from)}`
      : segment.kind === "outro"
        ? `${Math.round(cities[0].from)} – today`
        : yearsLabel(active);
  const dwellStarts = timeline.filter((entry) => entry.kind === "dwell");
  const fresh = active.entries.filter((entry) => entry.fresh).slice(0, PIECE_LIMIT);
  const carried = active.entries.filter((entry) => !entry.fresh).slice(0, PIECE_LIMIT - Math.min(fresh.length, 5));

  return (
    <div
      className="titles"
      ref={rootRef}
      onClick={(event) => {
        // Anywhere that isn't a control of its own stops and starts the film.
        if ((event.target as HTMLElement).closest("button, input, a, .tally")) return;
        if (playing) {
          setPlaying(false);
          return;
        }
        if (direction > 0 && progress >= 1) setProgress(0);
        if (direction < 0 && progress <= 0) setProgress(1);
        setPlaying(true);
      }}
    >
      <div className="titles__stage" ref={hostRef} />
      <div className="titles__vignette" aria-hidden="true" />

      <header className="titles__head">
        <p className="titles__eyebrow">Harma Davtian · sketch, mock data</p>
        <h1 className="titles__name">The Working Years</h1>
        <p className="titles__era">{era}</p>
      </header>

      <Tally
        rows={experience.rows}
        since={since}
        open={openRows}
        setOpen={setOpenRows}
        moving={moving}
      />

      <aside className={`titles__card${atPlace ? " is-on" : ""}`}>
        <h2 className="titles__card-name">{active.name}</h2>
        <p className="titles__card-role">{active.title}</p>
        <p className="titles__card-years">{yearsLabel(active)}</p>
        {active.note ? <p className="titles__card-note">{active.note}</p> : null}
        {fresh.length > 0 ? (
          <>
            <h3 className="titles__card-head is-new">Learned here</h3>
            <ul className="titles__card-list">
              {fresh.map((entry) => (
                <li key={entry.name} className="is-new">
                  <span className="titles__card-skill">{entry.name}</span>
                  <span className="titles__card-count">{say(entry.years)} yrs</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {carried.length > 0 ? (
          <>
            <h3 className="titles__card-head">Carried further</h3>
            <ul className="titles__card-list">
              {carried.map((entry) => (
                <li key={entry.name}>
                  <span className="titles__card-skill">{entry.name}</span>
                  <span className="titles__card-count">+{say(entry.years)} yrs</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </aside>

      <section className="titles__finale" style={{ opacity: ending, pointerEvents: "none" }} aria-hidden={ending < 0.5}>
        <p className="titles__finale-years">Since {since}</p>
        <p className="titles__finale-line">{cities.length - 1} places · one craft</p>
        <ul className="titles__finale-list">
          {experience.rows
            .filter((row) => ["frontend", "backend", "data", "cloud", "leadership"].includes(row.slug))
            .map((row) => (
              <li key={row.slug}>
                <strong>{Math.floor(row.years)}</strong>
                <span>{row.name}</span>
              </li>
            ))}
        </ul>
      </section>

      <div className="titles__scrub">
        <button
          type="button"
          className={`titles__play${playing && direction < 0 ? " is-on" : ""}`}
          title="Play backwards"
          onClick={() => {
            if (playing && direction < 0) {
              setPlaying(false);
              return;
            }
            if (progress <= 0) setProgress(1);
            setDirection(-1);
            setPlaying(true);
          }}
        >
          ◀ Back
        </button>
        <button
          type="button"
          className={`titles__play${playing && direction > 0 ? " is-on" : ""}`}
          onClick={() => {
            if (playing && direction > 0) {
              setPlaying(false);
              return;
            }
            if (progress >= 1) setProgress(0);
            setDirection(1);
            setPlaying(true);
          }}
        >
          {playing && direction > 0 ? "Pause" : progress >= 1 ? "Replay" : "Play ▶"}
        </button>
        <span className="titles__hint">click to stop · scroll to wind</span>
        <div className="titles__track">
          <input
            id="titles-scrubber"
            type="range"
            min={0}
            max={1}
            step={0.00002}
            value={progress}
            aria-label="Scrub the sequence"
            onChange={(event) => {
              setPlaying(false);
              setProgress(Number(event.target.value));
            }}
          />
          <div className="titles__stops">
            {dwellStarts.map((stop) => (
              <button
                key={`${cities[stop.city].slug}-${stop.from}`}
                type="button"
                className={`titles__stop${stop === segment ? " is-on" : ""}`}
                style={{ left: `${stop.from * 100}%` }}
                title={`${cities[stop.city].name} · ${yearsLabel(cities[stop.city])}`}
                onClick={() => {
                  setPlaying(false);
                  setProgress(stop.from + (stop.to - stop.from) * 0.04);
                }}
              >
                <span>{cities[stop.city].name.split(" ")[0]}</span>
                <span className="titles__stop-years">
                  {Math.round(cities[stop.city].from)}–
                  {cities[stop.city].to >= LAST_YEAR - 1 ? "now" : String(Math.round(cities[stop.city].to)).slice(2)}
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
}: {
  rows: ExperienceRow[];
  since: number;
  open: string[];
  setOpen: (next: string[]) => void;
  moving: boolean;
}) {
  const most = Math.max(1, NOW_YEAR - 1994, ...rows.map((row) => row.years));
  return (
    <aside className="tally">
      <Embers moving={moving} />
      <div className="tally__inner">
        <h2 className="tally__title">Experience so far</h2>
        <p className="tally__total">by discipline · building since {since}</p>
        <ul className="tally__list">
          {rows.map((row) => {
            const isOpen = open.includes(row.slug);
            return (
              <li key={row.slug} className={`tally__row${row.hot && moving ? " is-hot" : ""}`}>
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
                  <span className="tally__years">{say(row.years)} yrs</span>
                </button>
                <span className="tally__bar">
                  <span className="tally__fill" style={{ width: `${Math.min(100, (row.years / most) * 100)}%` }} />
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
        <p className="tally__foot">Counted off the calendar: overlapping jobs never count twice.</p>
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
