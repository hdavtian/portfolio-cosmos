import type { SceneData, ScenePointer, ShowcaseScene, ThreeModule } from "./types";

/**
 * "GOT inspired Skillz": the opening of the skills film (/lab/got) as a
 * background. The sun lights, three rings are forged round it and etched with
 * the name and code, then Boingo's orrery builds itself on the desert beside
 * it, one skill per sphere. It fades and starts again.
 *
 * The parts are the film's own (gotAstrolabe, gotBuilders), unmodified; this
 * scene supplies the camera, ground and timing. Its skill data is the film's,
 * which still comes from the mock until the skills consolidation.
 */

// The loop, in seconds.
const SUN_LIT = 2.5;
const RINGS_START = 3;
const RING_EACH = 5;
const RING_GAP = 1.6;
const ETCH_LEN = 5;
const TREE_START = 14;
const TREE_LEN = 11;
const HOLD_UNTIL = 34;
const FADE_LEN = 3;
const LOOP = HOLD_UNTIL + FADE_LEN;

const smooth = (from: number, to: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - from) / Math.max(1e-6, to - from)));
  return x * x * (3 - 2 * x);
};

export async function createGotSkillzScene(THREE: ThreeModule, data: SceneData): Promise<ShowcaseScene> {
  const [{ makeAstrolabe }, { makeBuilders, KIND_BY_PLACE }, { places, spans }] = await Promise.all([
    import("../../lab/gotAstrolabe"),
    import("../../lab/gotBuilders"),
    import("../../lab/skillsData"),
  ]);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07060a, 0.00045);
  const camera = new THREE.PerspectiveCamera(46, 1, 1, 6000);

  // The map's skin, as in the film: flat-shaded land coloured by height (this
  // is Boingo's country, desert), sea around it, levelled where the place stands.
  const SEA = -6;
  const PLACE = new THREE.Vector2(120, 40);
  const wild = (x: number, z: number) =>
    48 * Math.sin(x * 0.0019 + 0.6) * Math.cos(z * 0.0024 - 0.4) +
    26 * Math.sin(x * 0.0052 + z * 0.0037) +
    13 * Math.cos(z * 0.0098 - x * 0.0031) +
    5 * Math.sin(x * 0.021) * Math.sin(z * 0.019) +
    70 * Math.max(0, Math.sin(x * 0.0041 + 2) * Math.sin(z * 0.0052 + 1)) ** 2;
  const heightAt = (x: number, z: number) => {
    const d = Math.hypot(x - PLACE.x, z - PLACE.y);
    const near = Math.exp(-(d * d) / (300 * 300));
    let h = wild(x, z) * (1 - near * 0.75) + 26 * near;
    if (d < 200) h += (26 - h) * smooth(0, 1, 1 - Math.max(0, d - 122) / 78);
    return Math.max(h, SEA - 5);
  };
  const terrain = new THREE.PlaneGeometry(3000, 2200, 150, 110);
  const position = terrain.attributes.position;
  const colours = new Float32Array(position.count * 3);
  const low = new THREE.Color("#b08a4e");
  const high = new THREE.Color("#d2ad6c");
  const top = new THREE.Color("#ecd9a6");
  const shore = new THREE.Color("#5b5138");
  const colour = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = -position.getY(i);
    const y = heightAt(x, z);
    position.setZ(i, y);
    if (y < SEA + 3) colour.copy(shore).lerp(low, 0.35);
    else if (y < 40) colour.copy(low).lerp(high, Math.max(0, y) / 40);
    else colour.copy(high).lerp(top, Math.min(1, (y - 40) / 60));
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
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(9000, 9000),
    new THREE.MeshStandardMaterial({ color: "#124a78", roughness: 0.22, metalness: 0.35 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA;
  scene.add(sea);
  // The film glows through a bloom pass the preview stage doesn't have, so the
  // light is turned up here instead: the metal and the sand read on their own.
  scene.add(new THREE.HemisphereLight(0xd8c49a, 0x1c1208, 0.9));
  const rake = new THREE.DirectionalLight(0xffc98a, 2.4);
  rake.position.set(-600, 500, 500);
  scene.add(rake);

  // The sun and its rings, as forged in the film's opening.
  const { name, title } = data.profile;
  const astrolabe = makeAstrolabe(THREE, {
    name: `${name}   ✦   ${title}`.toUpperCase(),
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
  const SUN = new THREE.Vector3(-200, 200, -300);
  astrolabe.group.position.copy(SUN);
  scene.add(astrolabe.group);
  // Without bloom the fire is a disc: its own light does the glowing.
  astrolabe.group.traverse((object) => {
    const light = object as { isPointLight?: boolean; intensity?: number };
    if (light.isPointLight) light.intensity = (light.intensity ?? 1) * 3;
  });
  // A soft glow, drawn as a radial gradient: a sprite with no texture would be a square.
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = glowCanvas.height = 256;
  const glowCtx = glowCanvas.getContext("2d")!;
  const gradient = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 200, 120, 1)");
  gradient.addColorStop(0.35, "rgba(255, 150, 70, 0.45)");
  gradient.addColorStop(1, "rgba(255, 120, 40, 0)");
  glowCtx.fillStyle = gradient;
  glowCtx.fillRect(0, 0, 256, 256);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  halo.scale.setScalar(260);
  halo.position.copy(SUN);
  scene.add(halo);

  // The orrery: Boingo's construct, with its skills as spheres.
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
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0, depthTest: false }));
    sprite.scale.set(48, 5.4, 1);
    return sprite;
  };
  const { byKind } = makeBuilders(THREE, label);
  const tallest = Math.max(1, ...spans.map((span) => span.to - span.from));
  const towersOf = (slug: string) =>
    spans
      .filter((span) => span.place === slug)
      .map((span) => ({ name: span.skillName, years: span.to - span.from, fresh: true }))
      .sort((a, b) => b.years - a.years)
      .slice(0, 9);
  const home = places.find((place) => place.slug === "boingo");
  const accent = data.portfolio.cores.find((core) => core.slug === "boingo")?.color ?? "#FF6B35";
  const engine = byKind[KIND_BY_PLACE.boingo](towersOf("boingo"), tallest, undefined, {
    title: home?.name.split(" (")[0] ?? "Boingo",
    accent,
    house: "boingo",
  });
  engine.group.position.set(PLACE.x, 26 + 1.5, PLACE.y);
  scene.add(engine.group);
  engine.grow(0, 0, 0);

  // A black sheet in front of the camera, for the fade between loops.
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false }),
  );
  veil.renderOrder = 999;
  veil.position.z = -1.2;
  camera.add(veil);
  scene.add(camera);

  // The loop runs on the wall clock, like the film's sun: a throttled tab
  // (background, or a screenshot) still shows the right moment when it wakes.
  let startedAt = performance.now();
  let shownAt: number | null = null;
  const aim = new THREE.Vector3();
  const drift = new THREE.Vector3();

  return {
    scene,
    camera,
    progress: () => 1,
    update(_dt: number, pointer: ScenePointer, visible: boolean) {
      if (!visible) {
        shownAt = null;
        return;
      }
      // Each showing starts the loop from the beginning.
      if (shownAt === null) {
        shownAt = performance.now();
        startedAt = shownAt;
      }
      const clock = (performance.now() - startedAt) / 1000;
      const t = clock % LOOP;

      // The opening: sun, then rings forged one after another and etched as each closes.
      const sun = smooth(0, SUN_LIT, t);
      const bands = [0, 1, 2].map((i) => smooth(RINGS_START + i * RING_GAP, RINGS_START + i * RING_GAP + RING_EACH, t));
      const etch = [0, 1, 2].map((i) => {
        const closed = RINGS_START + i * RING_GAP + RING_EACH;
        return smooth(closed, closed + ETCH_LEN, t);
      });
      astrolabe.update(clock, camera, { sun, bands, etch });
      halo.material.opacity = 0.35 * sun;

      // Then the orrery builds, and keeps turning once built.
      const built = smooth(TREE_START, TREE_START + TREE_LEN, t);
      engine.grow(built, clock * 0.6, 1);

      // The whole thing fades to black at the end of the loop, so the restart isn't a jump.
      const fade = 1 - smooth(HOLD_UNTIL, HOLD_UNTIL + FADE_LEN, t);
      veil.material.opacity = 1 - fade;

      // Camera: close on the sun for the forging, then a swing down and in to
      // the place, where it settles low and near, drifting with the pointer.
      const back = smooth(TREE_START - 2, TREE_START + 5, t);
      drift.set(pointer.x * 30, -pointer.y * 16, 0);
      const orbit = -0.9 + back * 1.3 + clock * 0.02 * back;
      const reach = engine.reach * 2.4;
      const rise = engine.top * 0.5;
      const place = new THREE.Vector3(PLACE.x, 26 + 1.5, PLACE.y);
      const atSun = new THREE.Vector3(SUN.x + 40, SUN.y - 20, SUN.z + 330);
      const atPlace = new THREE.Vector3(
        place.x + Math.sin(orbit) * reach,
        place.y + rise + 10,
        place.z + Math.cos(orbit) * reach,
      );
      camera.position.lerpVectors(atSun, atPlace, back).add(drift);
      aim.lerpVectors(SUN, new THREE.Vector3(place.x, place.y + engine.top * 0.45, place.z), back);
      camera.lookAt(aim);
    },
    resize(width: number, height: number) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    dispose() {
      scene.traverse((object) => {
        const mesh = object as { geometry?: { dispose(): void }; material?: { dispose(): void } | Array<{ dispose(): void }> };
        mesh.geometry?.dispose?.();
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else mesh.material?.dispose?.();
      });
    },
  };
}
