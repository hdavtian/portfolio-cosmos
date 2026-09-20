import type * as ThreeTypes from "three";
import { say } from "./skillsData";

/**
 * What gets built at each place on the map. In the spirit of the clockwork
 * cities of the title sequence it borrows from, every place is a different
 * machine-made thing — a switchboard, a colonnade, a camp of spires, a keep —
 * raised out of the map in weathered bronze, stone, timber and iron.
 *
 * The shapes are the data: one piece per skill, its height the years spent on
 * it at that job, and a gold cap on any skill appearing for the first time.
 * Each piece carries its own label as it rises.
 */

export interface Tower {
  name: string;
  years: number;
  /** First time this skill shows up anywhere in the career. */
  fresh?: boolean;
}

export interface Build {
  group: ThreeTypes.Group;
  /**
   * How far built (0 to 1), a phase taken from the scrubber (never the clock,
   * so a parked scrubber is a still frame), and how much the camera is
   * attending to this place (labels fade once it leaves).
   */
  grow: (eased: number, phase: number, focus: number) => void;
  /** A second visit: what stands grows taller, what is new raises its own. */
  growLater?: (eased: number, phase: number, focus: number) => void;
}

type Three = typeof ThreeTypes;
type Label = (text: string, bright: boolean) => ThreeTypes.Sprite;
type SkinName = "bronze" | "stone" | "timber" | "iron";

/** Parts come in one after another, so a place assembles rather than inflates. */
const stage = (eased: number, index: number, count: number) => {
  const x = Math.max(0, Math.min(1, (eased - (index / Math.max(1, count)) * 0.6) / 0.4));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

const LABEL_LIMIT = 7;

export function makeBuilders(THREE: Three, label: Label) {
  /** Surfaces painted once and shared: nothing here is flat colour. */
  const painted = (draw: (ctx: CanvasRenderingContext2D, size: number) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    draw(ctx, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  };

  const speckle = (ctx: CanvasRenderingContext2D, size: number, count: number, light: string, dark: string) => {
    for (let i = 0; i < count; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? light : dark;
      const w = 1 + ((i * 7) % 3);
      ctx.fillRect((i * 97) % size, (i * 57 + ((i * i) % 31)) % size, w, w);
    }
  };

  const textures: Record<SkinName, ThreeTypes.Texture> = {
    // Brushed, tarnished bronze: streaks down the grain, green in the low spots.
    bronze: painted((ctx, size) => {
      const wash = ctx.createLinearGradient(0, 0, size, size);
      wash.addColorStop(0, "#9c7430");
      wash.addColorStop(0.5, "#b88a3c");
      wash.addColorStop(1, "#7d5a22");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 90; i += 1) {
        ctx.fillStyle = i % 3 === 0 ? "rgba(255, 226, 150, 0.10)" : "rgba(40, 24, 6, 0.12)";
        ctx.fillRect((i * 37) % size, 0, 1 + (i % 2), size);
      }
      for (let i = 0; i < 14; i += 1) {
        ctx.fillStyle = "rgba(70, 120, 96, 0.13)";
        ctx.beginPath();
        ctx.arc((i * 71) % size, (i * 113) % size, 8 + ((i * 5) % 14), 0, Math.PI * 2);
        ctx.fill();
      }
      speckle(ctx, size, 420, "rgba(255, 230, 170, 0.16)", "rgba(30, 18, 4, 0.22)");
    }),
    // Dressed stone: coursed blocks with worn joints.
    stone: painted((ctx, size) => {
      ctx.fillStyle = "#73695a";
      ctx.fillRect(0, 0, size, size);
      for (let row = 0; row < 8; row += 1) {
        const y = row * 32;
        ctx.fillStyle = "rgba(24, 20, 14, 0.55)";
        ctx.fillRect(0, y, size, 2);
        for (let col = 0; col < 5; col += 1) {
          const x = col * 64 + (row % 2) * 32;
          ctx.fillRect(x % size, y, 2, 32);
          ctx.fillStyle = `rgba(${150 + ((row * col * 13) % 40)}, ${138 + ((row + col) % 5) * 6}, 112, 0.10)`;
          ctx.fillRect((x + 3) % size, y + 3, 58, 27);
          ctx.fillStyle = "rgba(24, 20, 14, 0.55)";
        }
      }
      speckle(ctx, size, 520, "rgba(220, 210, 184, 0.13)", "rgba(20, 16, 10, 0.2)");
    }),
    // Dark timber, grain running up the post.
    timber: painted((ctx, size) => {
      ctx.fillStyle = "#4b331f";
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 70; i += 1) {
        ctx.strokeStyle = i % 2 === 0 ? "rgba(22, 12, 4, 0.4)" : "rgba(150, 104, 58, 0.18)";
        ctx.beginPath();
        const x = (i * 29) % size;
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + 6, size * 0.3, x - 6, size * 0.6, x + 3, size);
        ctx.stroke();
      }
    }),
    // Black iron, hammered.
    iron: painted((ctx, size) => {
      ctx.fillStyle = "#2b2824";
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, 700, "rgba(160, 150, 130, 0.12)", "rgba(0, 0, 0, 0.3)");
    }),
  };

  const skin = (name: SkinName, shade = 0.5) => {
    const metal = name === "bronze" || name === "iron";
    const tint = 0.62 + shade * 0.5;
    return new THREE.MeshStandardMaterial({
      map: textures[name],
      color: new THREE.Color(tint, tint, tint),
      metalness: metal ? 0.82 : 0.05,
      roughness: metal ? 0.46 : 0.94,
      emissive: name === "bronze" ? new THREE.Color("#5a3c10") : new THREE.Color("#000000"),
      emissiveIntensity: name === "bronze" ? 0.22 + shade * 0.2 : 0,
      flatShading: true,
    });
  };

  const shadeFor = (tower: Tower, tallest: number) => Math.min(1, tower.years / tallest);
  const heightOf = (tower: Tower, tallest: number, low = 14, span = 46) => low + shadeFor(tower, tallest) * span;

  interface Part {
    mesh: ThreeTypes.Object3D;
    height: number;
    name: string;
    years: number;
    tag?: ThreeTypes.Sprite;
    lift: number;
    twist: number;
  }

  /** A gold cap for a skill's first appearance: the thing the eye should find. */
  const cap = (radius: number) =>
    new THREE.Mesh(
      new THREE.OctahedronGeometry(radius, 0),
      new THREE.MeshStandardMaterial({
        color: "#ffd27a",
        emissive: "#ffb433",
        emissiveIntensity: 0.9,
        metalness: 0.9,
        roughness: 0.25,
      }),
    );

  /** One piece of a place: its body, its label, and its cap if the skill is new. */
  const makePart = (
    group: ThreeTypes.Object3D,
    body: ThreeTypes.Object3D,
    height: number,
    tower: Tower,
    index: number,
    capAt?: ThreeTypes.Vector3,
  ): Part => {
    group.add(body);
    if (tower.fresh && capAt) {
      const finial = cap(2.6);
      finial.position.copy(capAt);
      body.add(finial);
    }
    let tag: ThreeTypes.Sprite | undefined;
    if (index < LABEL_LIMIT) {
      tag = label(`${tower.fresh ? "NEW · " : ""}${tower.name} · ${say(tower.years)} yrs`, Boolean(tower.fresh));
      group.add(tag);
    }
    return {
      mesh: body,
      height,
      name: tower.name,
      years: tower.years,
      tag,
      lift: 6 + (index % 3) * 8,
      twist: (index % 2 === 0 ? 1 : -1) * (0.7 + (index % 3) * 0.25),
    };
  };

  /** Clockwork rise: a piece winds up out of the ground, turning as it comes. */
  const wind = (part: Part, grown: number, baseY = 0) => {
    const g = Math.max(0.001, grown);
    part.mesh.scale.set(0.6 + 0.4 * g, g, 0.6 + 0.4 * g);
    part.mesh.position.y = baseY;
    part.mesh.rotation.y = (1 - g) * part.twist;
  };

  const showTag = (part: Part, grown: number, focus: number, x: number, y: number, z: number) => {
    if (!part.tag) return;
    part.tag.position.set(x, y + part.lift, z);
    (part.tag.material as ThreeTypes.SpriteMaterial).opacity =
      Math.max(0, Math.min(1, grown * 1.5 - 0.3)) * focus;
  };

  /** A body whose origin is at its foot, so scaling grows it upward. */
  const footed = (mesh: ThreeTypes.Mesh, height: number) => {
    mesh.position.y = height / 2;
    const holder = new THREE.Group();
    holder.add(mesh);
    return holder;
  };

  /* ------------------------------------------------------------------ */

  /** Earthlink: timber posts strung with lines, the way calls were put through. */
  const switchboard = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const spread = 14;
    const parts = towers.map((tower, index) => {
      const height = heightOf(tower, tallest, 16, 34);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.9, height, 7), skin("timber", 0.6));
      const holder = footed(post, height);
      const crossarm = new THREE.Mesh(new THREE.BoxGeometry(9, 1, 1.2), skin("bronze", shadeFor(tower, tallest)));
      crossarm.position.y = height - 3;
      holder.add(crossarm);
      const across = index - (towers.length - 1) / 2;
      holder.position.set(across * spread, 0, (index % 2 === 0 ? -1 : 1) * 8);
      return makePart(group, holder, height, tower, index, new THREE.Vector3(0, height + 3, 0));
    });
    const wires = parts.slice(0, -1).map((part, index) => {
      const next = parts[index + 1];
      const a = part.mesh.position;
      const b = next.mesh.position;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.x, part.height - 3, a.z),
        new THREE.Vector3((a.x + b.x) / 2, Math.min(part.height, next.height) - 9, (a.z + b.z) / 2),
        new THREE.Vector3(b.x, next.height - 3, b.z),
      ]);
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.2, 5, false), skin("iron", 0.8));
      group.add(wire);
      return wire;
    });
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(towers.length * spread + 16, 2.4, 30), skin("stone", 0.4));
    plinth.position.y = 1.2;
    group.add(plinth);
    return {
      group,
      grow(eased, _phase, focus) {
        parts.forEach((part, index) => {
          const grown = stage(eased, index, parts.length);
          wind(part, grown, 2.4);
          showTag(part, grown, focus, part.mesh.position.x, part.height * grown + 2.4, part.mesh.position.z);
        });
        wires.forEach((wire, index) => {
          wire.visible = stage(eased, index + 1, parts.length) > 0.92;
        });
        plinth.scale.set(Math.max(0.001, stage(eased, 0, 4)), 1, 1);
      },
    };
  };

  /** HostPro: a stone colonnade, one bay let at a time, under a bronze beam. */
  const terraces = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const bay = 16;
    const parts = towers.map((tower, index) => {
      const height = heightOf(tower, tallest, 16, 30);
      const holder = new THREE.Group();
      [-1, 1].forEach((sideOf) => {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(3, height * 0.72, 6), skin("stone", 0.55));
        pier.position.set(sideOf * bay * 0.4, height * 0.36, 0);
        holder.add(pier);
      });
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(bay * 0.4, 1.6, 6, 14, Math.PI),
        skin("bronze", shadeFor(tower, tallest)),
      );
      arch.position.y = height * 0.72;
      holder.add(arch);
      const across = index - (towers.length - 1) / 2;
      holder.position.set(across * bay, 0, 0);
      const part = makePart(group, holder, height, tower, index, new THREE.Vector3(0, height * 0.72 + bay * 0.4 + 3, 0));
      part.twist = 0;
      return part;
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(towers.length * bay + 8, 2.4, 9), skin("bronze", 0.35));
    group.add(beam);
    return {
      group,
      grow(eased, _phase, focus) {
        let top = 0;
        parts.forEach((part, index) => {
          const grown = stage(eased, index, parts.length);
          wind(part, grown);
          top = Math.max(top, (part.height * 0.72 + bay * 0.4) * grown);
          showTag(part, grown, focus, part.mesh.position.x, (part.height * 0.72 + bay * 0.4) * grown, 0);
        });
        beam.scale.set(Math.max(0.001, stage(eased, parts.length - 1, parts.length)), 1, 1);
        beam.position.y = top + 2;
      },
    };
  };

  /**
   * StormScape: a camp of bronze spires, put up one at a time. The one place
   * the film returns to, so it can be built twice: the second pass grows the
   * spires that carried on and raises new ones for what is new since.
   */
  const spires = (towers: Tower[], tallest: number, later: Tower[] = []): Build => {
    const group = new THREE.Group();
    const spire = (tower: Tower, index: number, height: number) => {
      const body = new THREE.Mesh(
        new THREE.ConeGeometry(2.8 + shadeFor(tower, tallest) * 2.4, height, 6),
        skin("bronze", shadeFor(tower, tallest)),
      );
      const holder = footed(body, height);
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.6, 3, 6), skin("stone", 0.5));
      skirt.position.y = 1.5;
      holder.add(skirt);
      const angle = index * 2.399;
      const radius = 8 + index * 2.7;
      holder.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      return holder;
    };

    const parts = towers.map((tower, index) => {
      const height = heightOf(tower, tallest, 14, 44);
      const part = makePart(group, spire(tower, index, height), height, tower, index, new THREE.Vector3(0, height + 2.4, 0));
      return { ...part, grown: 0, taller: 0, laterTag: undefined as ThreeTypes.Sprite | undefined };
    });

    const risen: Part[] = [];
    later.forEach((tower, order) => {
      const already = parts.find((part) => part.name === tower.name);
      if (already) {
        already.taller = heightOf(tower, tallest, 14, 44) * 0.7;
        already.laterTag = label(`${tower.name} · ${say(already.years + tower.years)} yrs`, false);
        group.add(already.laterTag);
        return;
      }
      const index = towers.length + order;
      const height = heightOf(tower, tallest, 14, 44);
      const part = makePart(group, spire(tower, index, height), height, tower, order, new THREE.Vector3(0, height + 2.4, 0));
      part.mesh.scale.y = 0.001;
      risen.push(part);
    });

    const ring = new THREE.Mesh(new THREE.TorusGeometry(32, 0.8, 8, 60), skin("bronze", 0.3));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1;
    group.add(ring);

    return {
      group,
      grow(eased, _phase, focus) {
        parts.forEach((part, index) => {
          part.grown = stage(eased, index, parts.length);
          wind(part, part.grown);
          showTag(part, part.grown, focus, part.mesh.position.x, part.height * part.grown, part.mesh.position.z);
          if (part.laterTag) (part.laterTag.material as ThreeTypes.SpriteMaterial).opacity = 0;
        });
        risen.forEach((part) => {
          part.mesh.scale.y = 0.001;
          if (part.tag) (part.tag.material as ThreeTypes.SpriteMaterial).opacity = 0;
        });
        ring.scale.setScalar(0.2 + eased * 0.8);
      },
      growLater(eased, _phase, focus) {
        parts.forEach((part) => {
          if (part.taller <= 0) return;
          const extra = (part.taller / part.height) * eased;
          part.mesh.scale.y = part.grown + extra;
          if (part.laterTag) {
            part.laterTag.position.set(
              part.mesh.position.x,
              part.height * (part.grown + extra) + part.lift,
              part.mesh.position.z,
            );
            (part.laterTag.material as ThreeTypes.SpriteMaterial).opacity =
              Math.max(0, Math.min(1, eased * 1.6 - 0.2)) * focus;
          }
        });
        risen.forEach((part, index) => {
          const grown = stage(eased, index, risen.length);
          wind(part, grown);
          showTag(part, grown, focus, part.mesh.position.x, part.height * grown, part.mesh.position.z);
        });
        ring.scale.setScalar(1 + eased * 0.24);
      },
    };
  };

  /** UnitedLayer: iron cabinets in rows on a stone floor — a data centre. */
  const racks = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const parts = towers.map((tower, index) => {
      const height = heightOf(tower, tallest, 12, 28);
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(7.5, height, 5.5), skin("iron", 0.7));
      const holder = footed(cabinet, height);
      const face = new THREE.Mesh(new THREE.BoxGeometry(7.7, height * 0.84, 0.5), skin("bronze", shadeFor(tower, tallest)));
      face.position.set(0, height / 2, 2.9);
      holder.add(face);
      holder.position.set(-18 + Math.floor(index / 2) * 13, 0, index % 2 === 0 ? -9 : 9);
      return makePart(group, holder, height, tower, index, new THREE.Vector3(0, height + 2.6, 0));
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(66, 2, 38), skin("stone", 0.4));
    floor.position.y = 1;
    group.add(floor);
    return {
      group,
      grow(eased, _phase, focus) {
        parts.forEach((part, index) => {
          const grown = stage(eased, index, parts.length);
          wind(part, grown, 2);
          showTag(part, grown, focus, part.mesh.position.x, part.height * grown + 2, part.mesh.position.z);
        });
        const open = Math.max(0.001, stage(eased, 0, 4));
        floor.scale.set(open, 1, open);
      },
    };
  };

  /** Murad: a stone ziggurat, a tier per skill, bronze at the crown. */
  const ziggurat = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const sorted = [...towers].sort((a, b) => b.years - a.years);
    let base = 0;
    const parts = sorted.map((tower, index) => {
      const height = 6 + shadeFor(tower, tallest) * 10;
      const width = 40 - index * (29 / Math.max(1, sorted.length));
      const tier = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, width),
        skin(index === sorted.length - 1 ? "bronze" : "stone", 0.45 + shadeFor(tower, tallest) * 0.4),
      );
      const holder = footed(tier, height);
      const part = makePart(group, holder, height, tower, index, new THREE.Vector3(width / 2 - 2, height + 2.6, width / 2 - 2));
      const at = base;
      base += height;
      return { ...part, at, width };
    });
    return {
      group,
      grow(eased, _phase, focus) {
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.setScalar(grown);
          part.mesh.position.y = part.at * grown;
          part.mesh.rotation.y = (1 - grown) * part.twist;
          showTag(part, grown, focus, part.width * 0.5 + 20, part.at * grown + part.height * 0.5 - 6, 0);
        });
      },
    };
  };

  /** Capital Group: a stone keep, bronze-roofed towers at its corners. */
  const keep = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const wallHeight = 15;
    const walls = [0, 1, 2, 3].map((side) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(40, wallHeight, 3), skin("stone", 0.5));
      const holder = footed(wall, wallHeight);
      const angle = (side / 4) * Math.PI * 2;
      holder.position.set(Math.cos(angle) * 20, 0, Math.sin(angle) * 20);
      holder.rotation.y = -angle + Math.PI / 2;
      group.add(holder);
      return holder;
    });
    const parts = towers.slice(0, 6).map((tower, index) => {
      const height = heightOf(tower, tallest, 20, 28);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, height, 8), skin("stone", 0.6));
      const holder = footed(drum, height);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 9, 8), skin("bronze", shadeFor(tower, tallest)));
      roof.position.y = height + 4.5;
      holder.add(roof);
      const angle = (index / Math.min(6, towers.length)) * Math.PI * 2 + Math.PI / 4;
      const radius = index < 4 ? 28 : 10;
      holder.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      return makePart(group, holder, height + 9, tower, index, new THREE.Vector3(0, height + 11.5, 0));
    });
    return {
      group,
      grow(eased, _phase, focus) {
        walls.forEach((wall, index) => {
          wall.scale.y = Math.max(0.001, stage(eased, index, 10));
        });
        parts.forEach((part, index) => {
          const grown = stage(eased, index + 3, 10);
          wind(part, grown);
          showTag(part, grown, focus, part.mesh.position.x, part.height * grown, part.mesh.position.z);
        });
      },
    };
  };

  /** Boingo: an iron mast throwing rings of signal, each ring a skill. */
  const mast = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const height = 58;
    const pole = footed(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3.2, height, 8), skin("iron", 0.8)), height);
    group.add(pole);
    const parts = towers.map((tower, index) => {
      const radius = 10 + index * 5.2;
      const ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.7 + shadeFor(tower, tallest) * 0.9, 8, 56),
        skin("bronze", shadeFor(tower, tallest)),
      );
      ringMesh.rotation.x = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(ringMesh);
      holder.position.y = 4 + index * 5.4;
      const part = makePart(group, holder, 0, tower, index, new THREE.Vector3(radius, 3, 0));
      return { ...part, radius, at: 4 + index * 5.4 };
    });
    return {
      group,
      grow(eased, phase, focus) {
        pole.scale.y = Math.max(0.001, stage(eased, 0, 3));
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.set(grown, 1, grown);
          part.mesh.rotation.y = (1 - grown) * part.twist + phase * 0.05 * (index % 2 === 0 ? 1 : -1);
          showTag(part, grown, focus, part.radius * grown * 0.72, part.at, part.radius * grown * 0.72);
        });
      },
    };
  };

  /** RPA: a great bronze cog set with billboards, turning — the agency years. */
  const carousel = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const spinner = new THREE.Group();
    group.add(spinner);
    const cog = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 3.4, Math.max(10, towers.length * 2)), skin("bronze", 0.3));
    cog.position.y = 1.7;
    spinner.add(cog);
    const parts = towers.map((tower, index) => {
      const size = 10 + shadeFor(tower, tallest) * 13;
      const holder = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 8, 6), skin("iron", 0.7));
      stem.position.y = 4;
      holder.add(stem);
      const board = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.62, 0.9), skin("timber", 0.7));
      board.position.y = 8 + size * 0.31;
      holder.add(board);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(size + 1.6, size * 0.62 + 1.6, 0.5), skin("bronze", shadeFor(tower, tallest)));
      frame.position.set(0, 8 + size * 0.31, -0.5);
      holder.add(frame);
      const angle = (index / towers.length) * Math.PI * 2;
      holder.position.set(Math.cos(angle) * 24, 3.4, Math.sin(angle) * 24);
      holder.rotation.y = -angle + Math.PI / 2;
      const part = makePart(spinner, holder, 8 + size * 0.62, tower, index, new THREE.Vector3(0, 10 + size * 0.62, 0));
      part.twist = 0;
      return part;
    });
    return {
      group,
      grow(eased, phase, focus) {
        spinner.rotation.y = phase * 0.35;
        const open = Math.max(0.001, stage(eased, 0, 3));
        cog.scale.set(open, 1, open);
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.setScalar(grown);
          showTag(part, grown, focus, part.mesh.position.x, 3.4 + part.height * grown, part.mesh.position.z);
        });
      },
    };
  };

  /** InvestCloud: a skyline of stone towers crowned in bronze — the long stretch. */
  const skyline = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const parts = towers.map((tower, index) => {
      const height = heightOf(tower, tallest, 20, 52);
      const width = 5.4 + shadeFor(tower, tallest) * 3.6;
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), skin("stone", 0.55));
      const holder = footed(shaft, height);
      const crown = new THREE.Mesh(new THREE.BoxGeometry(width + 1.6, 3.4, width + 1.6), skin("bronze", shadeFor(tower, tallest)));
      crown.position.y = height + 1.7;
      holder.add(crown);
      const lantern = new THREE.Mesh(new THREE.ConeGeometry(width * 0.62, 6, 4), skin("bronze", shadeFor(tower, tallest)));
      lantern.position.y = height + 6.4;
      lantern.rotation.y = Math.PI / 4;
      holder.add(lantern);
      const inner = index < 4;
      const within = inner ? index : index - 4;
      const count = inner ? 4 : Math.max(1, towers.length - 4);
      const angle = (within / count) * Math.PI * 2 + (inner ? 0 : 0.6);
      const radius = inner ? 12 : 26;
      holder.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      return makePart(group, holder, height + 9, tower, index, new THREE.Vector3(0, height + 11.6, 0));
    });
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(36, 38, 2.2, 28), skin("stone", 0.35));
    plaza.position.y = 1.1;
    group.add(plaza);
    return {
      group,
      grow(eased, _phase, focus) {
        parts.forEach((part, index) => {
          const grown = stage(eased, index, parts.length);
          wind(part, grown, 2.2);
          showTag(part, grown, focus, part.mesh.position.x, part.height * grown + 2.2, part.mesh.position.z);
        });
        const open = Math.max(0.001, stage(eased, 0, 5));
        plaza.scale.set(open, 1, open);
      },
    };
  };

  const byKind: Record<string, (towers: Tower[], tallest: number, later?: Tower[]) => Build> = {
    switchboard,
    terraces,
    spires,
    racks,
    ziggurat,
    keep,
    mast,
    carousel,
    skyline,
  };

  /** The clockwork each place stands on: a pair of meshed gears turned by the build. */
  const gearPlatform = () => {
    const holder = new THREE.Group();
    const makeGear = (radius: number, teeth: number, thickness: number) => {
      const gear = new THREE.Group();
      gear.add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, 40), skin("bronze", 0.25)));
      for (let i = 0; i < teeth; i += 1) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.16, thickness, radius * 0.13), skin("bronze", 0.35));
        const angle = (i / teeth) * Math.PI * 2;
        tooth.position.set(Math.cos(angle) * radius * 1.06, 0, Math.sin(angle) * radius * 1.06);
        tooth.rotation.y = -angle;
        gear.add(tooth);
      }
      gear.add(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, thickness + 1.4, 12), skin("iron", 0.8)));
      return gear;
    };
    const big = makeGear(52, 26, 3);
    const small = makeGear(19, 10, 3);
    small.position.set(52 + 19 + 3, 0, 0);
    holder.add(big, small);
    return {
      holder,
      turn(amount: number, rise: number) {
        big.rotation.y = amount;
        small.rotation.y = -amount * (52 / 19) + 0.16;
        holder.position.y = -7 + 7 * rise;
      },
    };
  };

  return { byKind, gearPlatform, skin };
}

/** Which structure each place puts up. */
export const KIND_BY_PLACE: Record<string, string> = {
  earthlink: "switchboard",
  hostpro: "terraces",
  stormscape: "spires",
  unitedlayer: "racks",
  murad: "ziggurat",
  "capital-group": "keep",
  boingo: "mast",
  rpa: "carousel",
  investcloud: "skyline",
  "stormscape-now": "spires",
};

export const KIND_ORDER = [
  "switchboard",
  "terraces",
  "spires",
  "racks",
  "ziggurat",
  "keep",
  "mast",
  "carousel",
  "skyline",
];
