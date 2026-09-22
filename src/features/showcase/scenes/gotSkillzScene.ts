import type { SceneData, ScenePointer, ShowcaseScene, ThreeModule } from "./types";

/**
 * "GOT inspired Skillz": the opening of the skills film (/lab/got) as a
 * background. The sun lights, three rings are forged round it and etched with
 * the name and code, then InvestCloud's difference engine builds itself from
 * the ground beside it, one skill per column. It fades and starts again.
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
  scene.fog = new THREE.FogExp2(0x07060a, 0.0016);
  const camera = new THREE.PerspectiveCamera(46, 1, 1, 6000);

  // Ground: a dark, faintly lit plain for the constructs to stand on.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2400, 64),
    new THREE.MeshStandardMaterial({ color: 0x14110f, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(new THREE.AmbientLight(0x6d5a48, 0.6));
  const rake = new THREE.DirectionalLight(0xffc98a, 1.2);
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
  const SUN = new THREE.Vector3(-150, 150, -220);
  astrolabe.group.position.copy(SUN);
  scene.add(astrolabe.group);

  // The engine: InvestCloud's construct, with its skills as columns.
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
  const home = places.find((place) => place.slug === "investcloud");
  const accent = data.portfolio.cores.find((core) => core.slug === "investcloud")?.color ?? "#FFD65C";
  const engine = byKind[KIND_BY_PLACE.investcloud](towersOf("investcloud"), tallest, undefined, {
    title: home?.name.split(" (")[0] ?? "InvestCloud",
    accent,
    house: "investcloud",
  });
  engine.group.position.set(120, 1.5, 40);
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

  const startedAt = performance.now();
  let elapsed = 0;
  const aim = new THREE.Vector3();
  const drift = new THREE.Vector3();

  return {
    scene,
    camera,
    progress: () => 1,
    update(dt: number, pointer: ScenePointer, visible: boolean) {
      if (!visible) return;
      elapsed += dt;
      const t = elapsed % LOOP;
      const clock = (performance.now() - startedAt) / 1000;

      // The opening: sun, then rings forged one after another and etched as each closes.
      const sun = smooth(0, SUN_LIT, t);
      const bands = [0, 1, 2].map((i) => smooth(RINGS_START + i * RING_GAP, RINGS_START + i * RING_GAP + RING_EACH, t));
      const etch = [0, 1, 2].map((i) => {
        const closed = RINGS_START + i * RING_GAP + RING_EACH;
        return smooth(closed, closed + ETCH_LEN, t);
      });
      astrolabe.update(clock, camera, { sun, bands, etch });

      // Then the engine builds, and keeps turning once built.
      const built = smooth(TREE_START, TREE_START + TREE_LEN, t);
      engine.grow(built, clock * 0.6, 1);

      // The whole thing fades to black at the end of the loop, so the restart isn't a jump.
      const fade = 1 - smooth(HOLD_UNTIL, HOLD_UNTIL + FADE_LEN, t);
      veil.material.opacity = 1 - fade;

      // Camera: starts close on the sun, eases back to take in both, drifting with the pointer.
      const back = smooth(RINGS_START + 4, TREE_START + 6, t);
      drift.set(pointer.x * 60, -pointer.y * 30, 0);
      camera.position.set(
        SUN.x + 60 + back * 250 + drift.x,
        SUN.y - 40 + back * 20 + drift.y,
        SUN.z + 420 + back * 300,
      );
      aim.copy(SUN).lerp(new THREE.Vector3(0, 90, -80), back);
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
