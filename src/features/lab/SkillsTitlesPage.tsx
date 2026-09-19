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
      weight: index === 0 ? 1.1 : isReturn ? 2.6 : 1.45,
    });
    weights.push({
      kind: "dwell",
      city: index,
      previous: index - 1,
      weight: index === 0 ? 2.4 : isReturn ? 1.9 : 1.7,
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
  const rootRef = useRef<HTMLDivElement>(null);
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

  // The wheel runs the film: forward winds on, back rewinds.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      // Over the tally, the wheel belongs to the list.
      if ((event.target as HTMLElement).closest(".tally__inner")) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      const travelled = event.deltaY * unit;
      setPlaying(false);
      setProgress((current) => {
        // Standing at a place, a notch is barely more than a frame of the
        // film, so winding through a build is as smooth as watching it. On the
        // open road it can cover ground.
        const pace = segmentAt(timeline, current).kind === "dwell" ? 200000 : 21000;
        return Math.max(0, Math.min(1, current + travelled / pace));
      });
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, [timeline]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    void Promise.all([import("three"), import("camera-controls")]).then(([THREE, cameraControls]) => {
      if (disposed) return;
      const CameraControls = cameraControls.default;
      // Required once before use, the same way the cinematic app does it.
      CameraControls.install({ THREE });

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setClearColor(0x05070b, 1);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x05070b, 260, 1250);
      // A little light left in the sky, so the long empty legs aren't a void.
      scene.background = (() => {
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 128;
        const ctx = canvas.getContext("2d")!;
        const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
        sky.addColorStop(0, "#04060a");
        sky.addColorStop(0.62, "#070d15");
        sky.addColorStop(0.88, "#122031");
        sky.addColorStop(1, "#243a4a");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
      })();
      const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 2800);

      // The scrubber decides where the camera should be; camera-controls is
      // what actually moves it there, damping the last of the roughness out of
      // the path. It takes no input here — this is a film, not a viewer.
      const controls = new CameraControls(camera, renderer.domElement);
      controls.smoothTime = 0.42;
      controls.mouseButtons.left = CameraControls.ACTION.NONE;
      controls.mouseButtons.middle = CameraControls.ACTION.NONE;
      controls.mouseButtons.right = CameraControls.ACTION.NONE;
      controls.mouseButtons.wheel = CameraControls.ACTION.NONE;
      controls.touches.one = CameraControls.ACTION.NONE;
      controls.touches.two = CameraControls.ACTION.NONE;
      controls.touches.three = CameraControls.ACTION.NONE;
      controls.minDistance = 0.1;
      controls.maxDistance = Infinity;

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
      const legs = cities.length;
      const SPACING = 430;
      const spots = cities.map((_, index) => {
        const x = (index - (cities.length - 2) / 2) * SPACING;
        const z = Math.sin(index * 1.15) * 150;
        return new THREE.Vector3(x, heightAt(x, z), z);
      });
      const points = cities.map((city) => spots[city.spot]);

      // The road runs past each place, not through it: every stop stands off
      // to one side, alternating, so the camera can fly by and look across.
      const STAND_OFF = 74;
      const standOff = spots.map((_spot, index) => {
        const before = spots[Math.max(0, index - 1)];
        const after = spots[Math.min(spots.length - 1, index + 1)];
        const dir = new THREE.Vector3().subVectors(after, before).setY(0).normalize();
        return new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(index % 2 === 0 ? STAND_OFF : -STAND_OFF);
      });

      const terrain = new THREE.PlaneGeometry(3900, 1700, 210, 92);
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

      // One road for the whole film: the run in, the places in order, the long
      // way round behind the hills, and back to the camp it started at.
      const onGround = (point: ThreeTypes.Vector3) => point.setY(heightAt(point.x, point.z));
      const journeyPoints = [
        onGround(new THREE.Vector3(spots[0].x - 520, 0, spots[0].z + 300)),
        ...spots.slice(0, -1),
        onGround(new THREE.Vector3(spots[spots.length - 2].x * 0.6, 0, -470)),
        onGround(new THREE.Vector3(spots[0].x * 0.6, 0, -430)),
        spots[0],
        onGround(new THREE.Vector3(spots[0].x - 300, 0, spots[0].z + 230)),
      ];
      const journey = new THREE.CatmullRomCurve3(journeyPoints, false, "catmullrom", 0.4);
      const roadLength = journey.getLength();

      // Where each place sits along that road, measured in distance travelled.
      const samples = journey.getPoints(1400);
      const walked = [0];
      for (let i = 1; i < samples.length; i += 1) {
        walked.push(walked[i - 1] + samples[i].distanceTo(samples[i - 1]));
      }
      const arcOfControl = (index: number) =>
        walked[Math.round((index / (journeyPoints.length - 1)) * (samples.length - 1))] /
        walked[walked.length - 1];
      const cityArc = cities.map((_, index) =>
        arcOfControl(index === legs - 1 ? journeyPoints.length - 2 : index + 1),
      );

      // The road itself, laid on the land: dark tarmac with a dashed line down
      // the middle and bright edges, so the shape of the journey is always
      // readable and the camera never feels lost on an empty map.
      const tarmac = (() => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 256;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#0b1017";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(199, 154, 70, 0.85)";
        ctx.fillRect(2, 0, 3, canvas.height);
        ctx.fillRect(canvas.width - 5, 0, 3, canvas.height);
        ctx.fillStyle = "rgba(240, 216, 168, 0.75)";
        for (let y = 24; y < canvas.height; y += 84) ctx.fillRect(canvas.width / 2 - 2, y, 4, 40);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
      })();

      const ROAD_WIDTH = 9;
      const lanePoint = new THREE.Vector3();
      const laneHeading = new THREE.Vector3();
      const laneSide = new THREE.Vector3();

      /** A stretch of road, laid on the land between two points of the journey. */
      const layRoad = (fromArc: number, toArc: number, opacity: number) => {
        const steps = Math.max(200, Math.round((toArc - fromArc) * 2600));
        const positions = new Float32Array((steps + 1) * 6);
        const uvs = new Float32Array((steps + 1) * 4);
        const index: number[] = [];
        let run = 0;
        for (let i = 0; i <= steps; i += 1) {
          const at = fromArc + (toArc - fromArc) * (i / steps);
          journey.getPointAt(Math.max(0, Math.min(1, at)), lanePoint);
          journey.getTangentAt(Math.max(0, Math.min(1, at)), laneHeading);
          laneHeading.y = 0;
          laneHeading.normalize();
          laneSide.set(laneHeading.z, 0, -laneHeading.x).multiplyScalar(ROAD_WIDTH);
          if (i > 0) run += ((toArc - fromArc) * roadLength) / steps / 26;
          const left = [lanePoint.x + laneSide.x, 0, lanePoint.z + laneSide.z];
          const right = [lanePoint.x - laneSide.x, 0, lanePoint.z - laneSide.z];
          left[1] = heightAt(left[0], left[2]) + 0.9;
          right[1] = heightAt(right[0], right[2]) + 0.9;
          positions.set(left, i * 6);
          positions.set(right, i * 6 + 3);
          uvs.set([0, run, 1, run], i * 4);
          if (i < steps) {
            const a = i * 2;
            index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
          }
        }
        const lane = new THREE.BufferGeometry();
        lane.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        lane.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        lane.setIndex(index);
        const mesh = new THREE.Mesh(
          lane,
          new THREE.MeshBasicMaterial({
            map: tarmac,
            transparent: true,
            opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
          }),
        );
        scene.add(mesh);
        return mesh;
      };

      // The road out is there from the start. The way home is not: it only
      // appears once the film turns for home, so the opening shot has one road
      // in it and not two.
      const splitAt = Math.min(1, cityArc[legs - 2] + 0.01);
      layRoad(0, splitAt, 0.95);
      const wayHome = layRoad(splitAt, 1, 0);

      // A marker post either side of the road at every place, like an exit sign.
      cities.forEach((city, index) => {
        if (city.spot !== index) return;
        journey.getPointAt(cityArc[index], lanePoint);
        journey.getTangentAt(cityArc[index], laneHeading);
        laneHeading.y = 0;
        laneHeading.normalize();
        laneSide.set(laneHeading.z, 0, -laneHeading.x).multiplyScalar(ROAD_WIDTH + 3);
        [1, -1].forEach((which) => {
          const post = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 9, 0.8),
            new THREE.MeshBasicMaterial({ color: 0xe6be72 }),
          );
          const x = lanePoint.x + laneSide.x * which;
          const z = lanePoint.z + laneSide.z * which;
          post.position.set(x, heightAt(x, z) + 4.5, z);
          scene.add(post);
        });
      });

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
        /** How this stop is filmed. */
        move: string;
        /** A second visit: the place that is already here grows instead. */
        later: boolean;
        /** Which side of the road this place stands on, so the camera leans off the other way. */
        away: number;
      }

      const tallest = Math.max(1, ...cities.flatMap((city) => city.entries.map((entry) => entry.years)));
      const placed: Placed[] = [];
      cities.forEach((city, index) => {
        // Coming back to a place doesn't put up a second one: the camp that is
        // already standing grows, and new work raises new pillars.
        if (city.spot !== index) {
          const first = placed[city.spot];
          placed.push({
            build: first.build,
            sprite: first.sprite,
            ground: first.ground,
            move: "homecoming",
            later: true,
            away: first.away,
          });
          return;
        }

        const laterCity = cities.find((entry) => entry.spot === index && entry !== city);
        const build = builders[city.kind](
          city.entries.slice(0, TOWER_LIMIT),
          tallest,
          laterCity?.entries.slice(0, TOWER_LIMIT),
        );
        build.group.position.copy(points[index]).add(standOff[city.spot]);
        build.group.position.y = heightAt(build.group.position.x, build.group.position.z);
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

        placed.push({ build, sprite, ground, move: city.kind, later: false, away: index % 2 === 0 ? 1 : -1 });
      });

      const resize = () => {
        renderer.setSize(host.clientWidth, host.clientHeight, false);
        camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      const eye = new THREE.Vector3();
      const target = new THREE.Vector3();
      const spare = new THREE.Vector3();
      const ahead = new THREE.Vector3();
      const heading = new THREE.Vector3();
      const side = new THREE.Vector3();

      const RIDE_HEIGHT = 34;
      const RIDE_LOOK = 18;
      // A stop starts a little before the place and ends a little after it, so
      // the camera is always passing through, never parked and never backing up.
      const BEFORE = 96 / roadLength;
      const AFTER = 124 / roadLength;

      /** The stretch of road a segment covers. */
      const stretchOf = (segment: Segment) => {
        const here = cityArc[segment.city];
        if (segment.kind === "dwell") return [here - BEFORE, Math.min(1, here + AFTER)];
        const from = segment.previous < 0 ? 0 : Math.min(1, cityArc[segment.previous] + AFTER);
        return [from, here - BEFORE];
      };

      /**
       * How far along the road each moment of the film is. Rather than easing
       * each stretch on its own — which brings the camera to a halt at every
       * seam and makes the whole thing lurch — the raw distances are laid out
       * and then smoothed as one curve, so the camera only ever speeds up and
       * slows down gradually and never quite stops.
       */
      const roadTable = (() => {
        const steps = 2400;
        let table = new Float64Array(steps + 1);
        for (let i = 0; i <= steps; i += 1) {
          const at = i / steps;
          const segment = segmentAt(timeline, at);
          const [from, to] = stretchOf(segment);
          table[i] = from + (to - from) * within(segment, at);
        }
        const radius = Math.round(steps * 0.016);
        for (let pass = 0; pass < 3; pass += 1) {
          const next = new Float64Array(steps + 1);
          for (let i = 0; i <= steps; i += 1) {
            let sum = 0;
            for (let k = -radius; k <= radius; k += 1) {
              sum += table[Math.max(0, Math.min(steps, i + k))];
            }
            next[i] = sum / (radius * 2 + 1);
          }
          table = next;
        }
        return { steps, table };
      })();

      const roadAt = (at: number) => {
        const x = Math.max(0, Math.min(1, at)) * roadTable.steps;
        const index = Math.min(roadTable.steps - 1, Math.floor(x));
        const rest = x - index;
        return roadTable.table[index] * (1 - rest) + roadTable.table[index + 1] * rest;
      };

      /** The lie of the land under the camera, averaged so bumps don't shake it. */
      const settled = (x: number, z: number) =>
        (heightAt(x, z) + heightAt(x + 16, z) + heightAt(x - 16, z) + heightAt(x, z + 16) + heightAt(x, z - 16)) / 5;

      // Rises and falls away to nothing at both ends of a stop, gently.
      const swell = (t: number) => Math.sin(Math.PI * t) ** 2;
      // Softer than smoothstep at both ends, so a turn of the head has no corner in it.
      const softly = (edge: number, to: number, value: number) => {
        const x = Math.max(0, Math.min(1, (value - edge) / (to - edge)));
        return x * x * x * (x * (x * 6 - 15) + 10);
      };

      // On the way home the camera looks back over everywhere it has been.
      const recap = new THREE.CatmullRomCurve3([...points.slice(0, -1)].reverse(), false, "catmullrom", 0.4);

      /**
       * The camera rides the road facing the way it is going. At a place it
       * slows, passes close by, and keeps looking at it over its shoulder —
       * the view from the back of a truck pulling out — then turns forward
       * again before the next leg.
       */
      const pose = (at: number, segment: Segment, t: number, into: ThreeTypes.Vector3, look: ThreeTypes.Vector3) => {
        const s = Math.max(0, Math.min(1, roadAt(at)));
        journey.getPointAt(s, spare);
        journey.getTangentAt(s, heading);
        heading.y = 0;
        heading.normalize();
        side.set(heading.z, 0, -heading.x);

        const move = MOVES[placed[segment.city].move] ?? MOVES.spires;
        const rise = segment.kind === "dwell" ? swell(t) : 0;
        const ground = settled(spare.x, spare.z);

        // Lean away from whichever side the place stands on, so it stays in
        // shot without filling the lens.
        const lean = -placed[segment.city].away * move.wide * rise;
        into.set(
          spare.x + side.x * lean,
          ground + RIDE_HEIGHT + move.lift * rise,
          spare.z + side.z * lean,
        );

        journey.getPointAt(Math.min(1, s + 0.02), ahead);
        ahead.y = settled(ahead.x, ahead.z) + RIDE_LOOK;

        if (segment.kind === "dwell") {
          // Hold the place in frame while going past it, then let it go.
          const watch = softly(0, 0.26, t) * (1 - softly(move.hold, 1, t));
          const spot = placed[segment.city].build.group.position;
          look.set(spot.x, spot.y + move.aim, spot.z);
          look.lerpVectors(ahead, look, watch);
        } else if (segment.city === legs - 1) {
          // The way home: look back over the places already built, then turn
          // to face the camp coming up.
          recap.getPoint(Math.min(1, t / 0.6), look);
          look.y = settled(look.x, look.z) + RIDE_LOOK + 4;
          look.lerp(ahead, softly(0.45, 0.95, t));
        } else {
          look.copy(ahead);
        }
      };

      let frame = 0;
      const clock = new THREE.Clock();
      const render = () => {
        const p = progressRef.current;
        // Everything is a function of the scrubber: park it and the frame is
        // still, so labels and numbers can be read.
        const phase = p * 30;
        const segment = segmentAt(timeline, p);
        const t = within(segment, p);

        pose(p, segment, t, eye, target);

        // The way home appears as the last outward place finishes going up.
        const turnForHome = timeline.find((entry) => entry.kind === "dwell" && entry.city === legs - 2)!;
        const reveal = turnForHome.from + (turnForHome.to - turnForHome.from) * 0.55;
        (wayHome.material as ThreeTypes.MeshBasicMaterial).opacity =
          0.95 * softly(reveal, reveal + (turnForHome.to - turnForHome.from) * 0.5, p);

        controls.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, true);
        controls.update(Math.min(0.05, clock.getDelta()));
        glint.position.copy(camera.position).add(new THREE.Vector3(0, 10, 0));

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
          if (stop.later) stop.build.growLater?.(built, phase, focus);
          else stop.build.grow(built, phase, focus);
          if (segment === dwell) {
            const move = MOVES[stop.move] ?? MOVES.spires;
            stop.build.group.rotation.y = move.spin * softly(0, 1, t);
          }
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
        controls.dispose();
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
      const step = (now - last) / 104000; // a full run in a little under two minutes
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
    <div className="titles" ref={rootRef}>
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
        <span className="titles__hint">scroll to wind</span>
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
