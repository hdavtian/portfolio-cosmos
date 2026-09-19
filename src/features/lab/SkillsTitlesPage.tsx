import { useEffect, useMemo, useRef, useState } from "react";
import type * as ThreeTypes from "three";
import { KIND_BY_PLACE, KIND_ORDER, MOVES, makeBuilders, type Build } from "./gotBuilders";
import { LAST_YEAR, NOW_YEAR, categories, places, say, spans } from "./skillsData";
import "./skillsTitles.css";

/**
 * A title sequence for the skill timeline. The camera rides a route over a
 * map of coloured country, and the run alternates between travelling and
 * standing still: at a stop the map stops moving and the scrubber itself
 * builds the place, piece by piece, each piece labelled with the skill and
 * the years behind it. A running tally burns away on the left, starting at
 * nothing and adding up as the sequence passes.
 *
 * The route begins and ends at StormScape — the freelance work that ran
 * quietly under everything else and is running again now.
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
  note: string;
  entries: Entry[];
  /** Stops share a place on the map when they are the same company. */
  spot: number;
}

const TOWER_LIMIT = 9;

const NOTES: Record<string, string> = {
  stormscape: "Freelance and side work, dormant some years, busy in others",
  "stormscape-now": "The same studio, picked back up",
};

function buildCities(): City[] {
  const ordered = [...places].sort((a, b) => a.from - b.from);
  // The last stop is the studio again, so it stands where the first one did.
  const spotOf = (slug: string, index: number) => (slug === "stormscape-now" ? 0 : index);
  return ordered.map((place, index) => ({
    slug: place.slug,
    name: place.name,
    from: place.from,
    to: place.to,
    kind: KIND_BY_PLACE[place.slug] ?? KIND_ORDER[index % KIND_ORDER.length],
    note: NOTES[place.slug] ?? "",
    entries: spans
      .filter((span) => span.place === place.slug)
      .map((span) => ({
        skill: span.skill,
        name: span.skillName,
        years: span.to - span.from,
        categories: span.categories,
      }))
      .sort((a, b) => b.years - a.years),
    spot: spotOf(place.slug, index),
  }));
}

type SegmentKind = "travel" | "dwell";

interface Segment {
  kind: SegmentKind;
  city: number;
  /** For a travel leg, the stop it is leaving (-1 for the opening run in). */
  previous: number;
  from: number;
  to: number;
}

/**
 * The run: a leg of travel, then a stop that the scrubber builds, all the way
 * along and back again. The first stop gets a longer turn because a decade of
 * freelance passes while it goes up.
 */
function buildTimeline(cities: City[]): Segment[] {
  const weights: Array<{ kind: SegmentKind; city: number; previous: number; weight: number }> = [];
  cities.forEach((_, index) => {
    const isReturn = index === cities.length - 1;
    weights.push({
      kind: "travel",
      city: index,
      previous: index - 1,
      weight: index === 0 ? 0.55 : isReturn ? 1.2 : 0.75,
    });
    weights.push({
      kind: "dwell",
      city: index,
      previous: index - 1,
      weight: index === 0 ? 2 : isReturn ? 1.5 : 1.05,
    });
  });
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = 0;
  return weights.map((entry) => {
    const from = cursor;
    cursor += entry.weight / total;
    return { kind: entry.kind, city: entry.city, previous: entry.previous, from, to: cursor };
  });
}

const segmentAt = (timeline: Segment[], progress: number) => {
  const found = timeline.find((segment) => progress >= segment.from && progress < segment.to);
  return found ?? timeline[timeline.length - 1];
};

const within = (segment: Segment, progress: number) =>
  Math.max(0, Math.min(1, (progress - segment.from) / Math.max(0.0001, segment.to - segment.from)));

/** How far each stop has been built: nothing before its turn, the scrubber during it. */
function buildFractions(timeline: Segment[], cities: City[], progress: number) {
  const current = segmentAt(timeline, progress);
  const t = within(current, progress);
  return cities.map((_, index) => {
    const dwell = timeline.find((segment) => segment.kind === "dwell" && segment.city === index)!;
    if (progress >= dwell.to) return 1;
    if (current === dwell) return 1 - Math.pow(1 - t, 2);
    return 0;
  });
}

/** The year on the clock: it runs through a stop's own years while standing there. */
function yearAt(timeline: Segment[], cities: City[], progress: number) {
  const segment = segmentAt(timeline, progress);
  const t = within(segment, progress);
  const city = cities[segment.city];
  if (segment.kind === "dwell") {
    const end = city.to >= LAST_YEAR - 1 ? LAST_YEAR : city.to;
    return city.from + (end - city.from) * t;
  }
  const previous = segment.previous >= 0 ? cities[segment.previous] : null;
  const start = previous ? Math.min(previous.to, city.from) : city.from;
  return start + (city.from - start) * t;
}

interface TallyRow {
  slug: string;
  name: string;
  years: number;
  hot: boolean;
  skills: Array<{ name: string; years: number }>;
}

/** Everything built so far, added up: years per category, and per skill inside it. */
function tallyAt(cities: City[], fractions: number[]): TallyRow[] {
  const byCategory = new Map<string, { years: number; hot: boolean; skills: Map<string, number> }>();
  cities.forEach((city, index) => {
    const built = fractions[index];
    if (built <= 0.001) return;
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
  });
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

/** One colour of country per stop, so the map reads like a map. */
const REGION_COLOURS = [
  0x2c5a56, 0x36476e, 0x57405c, 0x3f5738, 0x5c5133, 0x35586a, 0x5b3838, 0x2c5a56,
];

export function SkillsTitlesPage() {
  const cities = useMemo(buildCities, []);
  const timeline = useMemo(() => buildTimeline(cities), [cities]);
  const hostRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [openRows, setOpenRows] = useState<string[]>([]);
  // Nothing on screen moves unless the scrubber does.
  const [moving, setMoving] = useState(false);

  // The scene reads progress from the ref every frame, so scrubbing never
  // re-runs the setup.
  useEffect(() => {
    progressRef.current = progress;
    setMoving(true);
    const settle = window.setTimeout(() => setMoving(false), 220);
    return () => window.clearTimeout(settle);
  }, [progress]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    void import("three").then((THREE) => {
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setClearColor(0x05070b, 1);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x05070b, 150, 560);
      const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 1200);

      scene.add(new THREE.HemisphereLight(0x8fb7ff, 0x1a1206, 0.85));
      const key = new THREE.DirectionalLight(0xffd9a0, 1.15);
      key.position.set(-120, 180, 140);
      scene.add(key);
      const glint = new THREE.PointLight(0xffb45a, 1.5, 320, 2);
      scene.add(glint);

      const label = (text: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 64;
        const ctx = canvas.getContext("2d")!;
        ctx.font = '600 26px "JetBrains Mono", Menlo, Consolas, monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const width = ctx.measureText(text).width + 24;
        ctx.fillStyle = "rgba(5, 8, 12, 0.72)";
        ctx.fillRect((canvas.width - width) / 2, 10, width, 44);
        ctx.fillStyle = "#ffd9a0";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthTest: false }),
        );
        sprite.scale.set(21, 2.6, 1);
        return sprite;
      };

      const builders = makeBuilders(THREE, label);

      // The land: real hills, high enough to see the route climb them.
      const heightAt = (x: number, z: number) =>
        Math.sin(x * 0.0072) * 24 + Math.cos(z * 0.019) * 13 + Math.sin(x * 0.023 + z * 0.012) * 8;

      // Stops are spread wide; the last one stands where the first one did.
      const SPACING = 150;
      const spots = cities.map((_, index) => {
        const x = (index - (cities.length - 2) / 2) * SPACING;
        const z = Math.sin(index * 1.15) * 58;
        return new THREE.Vector3(x, heightAt(x, z), z);
      });
      const points = cities.map((city) => spots[city.spot]);

      const terrain = new THREE.PlaneGeometry(2600, 900, 170, 70);
      const position = terrain.attributes.position;
      const colours = new Float32Array(position.count * 3);
      const colour = new THREE.Color();
      for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i);
        const z = -position.getY(i);
        const y = heightAt(x, z);
        position.setZ(i, y);
        // Each stop rules the country nearest to it.
        let nearest = 0;
        let best = Infinity;
        points.forEach((point, index) => {
          const distance = (point.x - x) ** 2 + (point.z - z) ** 2;
          if (distance < best) {
            best = distance;
            nearest = index;
          }
        });
        colour.setHex(REGION_COLOURS[nearest % REGION_COLOURS.length]);
        // Higher ground catches more light.
        colour.multiplyScalar(0.62 + Math.max(0, y) / 42);
        colours.set([colour.r, colour.g, colour.b], i * 3);
      }
      terrain.setAttribute("color", new THREE.BufferAttribute(colours, 3));
      terrain.computeVertexNormals();

      const land = new THREE.Mesh(
        terrain,
        new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
      );
      land.rotation.x = -Math.PI / 2;
      scene.add(land);
      const contours = new THREE.Mesh(
        terrain,
        new THREE.MeshBasicMaterial({ color: 0x8aa6c0, wireframe: true, transparent: true, opacity: 0.12 }),
      );
      contours.rotation.x = -Math.PI / 2;
      contours.position.y = 0.4;
      scene.add(contours);

      // The route out, and the long way home at the end.
      const outward = new THREE.CatmullRomCurve3(points.slice(0, -1), false, "catmullrom", 0.4);
      const homeward = new THREE.CatmullRomCurve3(
        [
          points[points.length - 2],
          new THREE.Vector3(points[points.length - 2].x * 0.55, 0, -186),
          new THREE.Vector3(points[0].x * 0.55, 0, -172),
          points[points.length - 1],
        ],
        false,
        "catmullrom",
        0.4,
      );
      const opening = new THREE.CatmullRomCurve3(
        [new THREE.Vector3(points[0].x - 230, heightAt(points[0].x - 230, 130), 130), points[0]],
        false,
        "catmullrom",
        0.4,
      );

      const drawRoute = (curve: ThreeTypes.CatmullRomCurve3, opacity: number) => {
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(
            curve.getPoints(500).map((point) => point.clone().setY(heightAt(point.x, point.z) + 1.6)),
          ),
          new THREE.LineDashedMaterial({ color: 0xc79a46, dashSize: 5, gapSize: 6, transparent: true, opacity }),
        );
        line.computeLineDistances();
        scene.add(line);
      };
      drawRoute(outward, 0.85);
      drawRoute(homeward, 0.4);

      const nameTexture = (text: string, pixels: number, ink: string, spacing: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 160;
        const ctx = canvas.getContext("2d")!;
        ctx.font = `700 ${pixels}px "Cinzel", "Barlow Condensed", Georgia, serif`;
        ctx.fillStyle = ink;
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
      }

      const tallest = Math.max(1, ...cities.flatMap((city) => city.entries.map((entry) => entry.years)));
      const placed: Placed[] = cities.map((city, index) => {
        const build = builders[city.kind](city.entries.slice(0, TOWER_LIMIT), tallest);
        build.group.position.copy(points[index]);
        // The studio's second turn stands beside its first, not on top of it.
        if (city.spot !== index) build.group.position.add(new THREE.Vector3(38, 0, -52));
        scene.add(build.group);

        const shown = city.name.split(" (")[0].toUpperCase();
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: nameTexture(shown, 74, "#f0d8a8", 6), transparent: true, depthTest: false }),
        );
        sprite.scale.set(58, 9, 1);
        sprite.position.copy(build.group.position).add(new THREE.Vector3(0, 66, 0));
        scene.add(sprite);

        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(62, 10),
          new THREE.MeshBasicMaterial({
            map: nameTexture(shown, 66, "#e6be72", 10),
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        ground.rotation.x = -Math.PI / 2;
        const groundZ = build.group.position.z + 48;
        const groundX = build.group.position.x + 6;
        ground.position.set(groundX, heightAt(groundX, groundZ) + 1.6, groundZ);
        scene.add(ground);

        return { build, sprite, ground };
      });

      const resize = () => {
        renderer.setSize(host.clientWidth, host.clientHeight, false);
        camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      const legs = cities.length;
      const travelLegs = timeline.filter((entry) => entry.kind === "travel");
      const eye = new THREE.Vector3();
      const target = new THREE.Vector3();
      const spare = new THREE.Vector3();
      const spareTwo = new THREE.Vector3();
      const heading = new THREE.Vector3();
      const eyeIn = new THREE.Vector3();
      const lookIn = new THREE.Vector3();
      const eyeOut = new THREE.Vector3();
      const lookOut = new THREE.Vector3();
      const ease = (t: number) => t * t * (3 - 2 * t);

      const TRAIL = 104;
      const RIDE_HEIGHT = 48;
      const RIDE_LOOK = 22;

      // On the way home the camera looks back over everywhere it has been,
      // in reverse, before turning to the studio coming up.
      const recap = new THREE.CatmullRomCurve3([...points.slice(0, -1)].reverse(), false, "catmullrom", 0.4);

      /** Where a leg is at this point, and which way it is heading. */
      const legPoint = (segment: Segment, t: number, into: ThreeTypes.Vector3) => {
        if (segment.previous < 0) {
          opening.getPoint(t, into);
          opening.getTangent(t, heading);
        } else if (segment.city === legs - 1) {
          homeward.getPoint(t, into);
          homeward.getTangent(t, heading);
        } else {
          const span = 1 / (legs - 2);
          const u = Math.min(1, (segment.previous + t) * span);
          outward.getPoint(u, into);
          outward.getTangent(u, heading);
        }
        heading.y = 0;
        heading.normalize();
      };

      /** Travelling: the camera trails the road and looks the way it is going. */
      const travelPose = (segment: Segment, t: number, into: ThreeTypes.Vector3, look: ThreeTypes.Vector3) => {
        legPoint(segment, t, spare);
        const ground = heightAt(spare.x, spare.z);
        // The way home flies lower, so the places it passes fill the frame.
        const lift = segment.city === legs - 1 ? 30 : RIDE_HEIGHT;
        into.set(spare.x - heading.x * TRAIL, ground + lift, spare.z - heading.z * TRAIL);
        if (segment.city === legs - 1) {
          recap.getPoint(Math.min(1, t / 0.6), look);
          look.y = heightAt(look.x, look.z) + RIDE_LOOK + 4;
          // Half way home, turn from the past towards the studio ahead.
          const home = placed[legs - 1].build.group.position;
          const turn = ease(Math.max(0, Math.min(1, (t - 0.5) / 0.4)));
          look.lerp(spareTwo.set(home.x, home.y + RIDE_LOOK, home.z), turn);
        } else {
          look.set(spare.x + heading.x * 44, ground + RIDE_LOOK, spare.z + heading.z * 44);
        }
      };

      /**
       * Standing at a stop: the camera arrives on the heading it was
       * travelling and leaves on the heading of the next leg, so the whole run
       * is one move. In between it swings past the straight line, breathes in
       * or out, and rises a little — differently at each place.
       */
      const dwellPose = (index: number, t: number, into: ThreeTypes.Vector3, look: ThreeTypes.Vector3) => {
        const move = MOVES[cities[index].kind] ?? MOVES.spires;
        const spot = placed[index].build.group.position;
        travelPose(travelLegs[index], 1, eyeIn, lookIn);
        const leave = travelLegs[index + 1];
        if (leave) travelPose(leave, 0, eyeOut, lookOut);
        else {
          eyeOut.copy(eyeIn);
          lookOut.copy(lookIn);
        }

        const angleIn = Math.atan2(eyeIn.x - spot.x, eyeIn.z - spot.z);
        let turn = Math.atan2(eyeOut.x - spot.x, eyeOut.z - spot.z) - angleIn;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;

        const radiusIn = Math.hypot(eyeIn.x - spot.x, eyeIn.z - spot.z);
        const radiusOut = Math.hypot(eyeOut.x - spot.x, eyeOut.z - spot.z);
        const heightIn = eyeIn.y - spot.y;
        const heightOut = eyeOut.y - spot.y;

        const eased = ease(t);
        const bulge = Math.sin(Math.PI * t);
        const angle = angleIn + turn * eased + move.swing * bulge;
        const radius = radiusIn + (radiusOut - radiusIn) * eased + move.zoom * bulge;
        const height = heightIn + (heightOut - heightIn) * eased + move.lift * bulge;

        into.set(spot.x + Math.sin(angle) * radius, spot.y + height, spot.z + Math.cos(angle) * radius);
        look.lerpVectors(lookIn, lookOut, eased);
        look.y += move.look * bulge;
      };

      let frame = 0;
      const render = () => {
        const p = progressRef.current;
        // Everything is a function of the scrubber: park it and the frame is
        // still, so labels and numbers can be read.
        const phase = p * 30;
        const segment = segmentAt(timeline, p);
        const t = within(segment, p);

        if (segment.kind === "dwell") dwellPose(segment.city, t, eye, target);
        else travelPose(segment, t, eye, target);

        camera.position.copy(eye);
        camera.lookAt(target);
        glint.position.copy(eye).add(new THREE.Vector3(0, 10, 0));

        placed.forEach((stop, index) => {
          const dwell = timeline.find((entry) => entry.kind === "dwell" && entry.city === index)!;
          const built = p >= dwell.to ? 1 : segment === dwell ? 1 - Math.pow(1 - t, 2) : 0;
          // Labels belong to the stop the camera is at, and fade as it leaves.
          const focus =
            segment === dwell
              ? Math.min(1, t * 4)
              : segment.kind === "travel" && segment.previous === index
                ? Math.max(0, 1 - t / 0.3)
                : 0;
          stop.build.grow(built, phase, focus);
          stop.sprite.visible = built > 0.02;
          // The name announces the place on arrival, then gets out of the way
          // while the scrubber builds it.
          (stop.sprite.material as ThreeTypes.SpriteMaterial).opacity = Math.min(1, built * 2) * (1 - focus * 0.82);
          (stop.ground.material as ThreeTypes.MeshBasicMaterial).opacity = 0.15 + built * 0.6;
        });

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
  }, [cities, timeline]);

  // Autoplay, paused the moment the scrubber is touched.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const step = (now - last) / 88000; // a full run in about a minute and a half
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

  const segment = segmentAt(timeline, progress);
  const atStop = segment.kind === "dwell";
  const active = cities[segment.city];
  const fractions = buildFractions(timeline, cities, progress);
  const tally = tallyAt(cities, fractions);
  const total = tally.reduce((sum, row) => sum + row.years, 0);
  const year = Math.min(Math.floor(NOW_YEAR), Math.round(yearAt(timeline, cities, progress)));
  const dwellStarts = timeline.filter((entry) => entry.kind === "dwell");

  return (
    <div className="titles">
      <div className="titles__stage" ref={hostRef} />

      <header className="titles__head">
        <p className="titles__eyebrow">Sketch · mock data</p>
        <h1 className="titles__name">The Working Years</h1>
      </header>

      <Tally rows={tally} open={openRows} setOpen={setOpenRows} total={total} moving={moving} />

      <aside className={`titles__card${atStop ? " is-on" : ""}`}>
        <h2 className="titles__card-name">{active.name}</h2>
        <p className="titles__card-years">
          {Math.round(active.from)} – {active.to >= LAST_YEAR - 1 ? "present" : Math.round(active.to)}
        </p>
        {active.note ? <p className="titles__card-note">{active.note}</p> : null}
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
            step={0.0002}
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
                title={cities[stop.city].name}
                onClick={() => {
                  setPlaying(false);
                  setProgress(stop.from + 0.001);
                }}
              >
                <span>{cities[stop.city].name.split(" ")[0]}</span>
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
  moving,
}: {
  rows: TallyRow[];
  open: string[];
  setOpen: (next: string[]) => void;
  total: number;
  moving: boolean;
}) {
  const most = Math.max(1, ...rows.map((row) => row.years));
  return (
    <aside className="tally">
      <Embers moving={moving} />
      <div className="tally__inner">
        <h2 className="tally__title">Running tally</h2>
        <p className="tally__total">
          <span>{Math.round(total)}</span> skill-years so far
        </p>
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

/** Embers drifting up behind the tally, for the heat of the thing. They hold
 * still with everything else when the scrubber is parked. */
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
