import type * as ThreeTypes from "three";
import { say } from "./skillsData";

/**
 * A different thing gets built at every stop on the map: a camp of spires, a
 * row of racks, a ziggurat, a keep, a radio mast, a cog of billboards, a
 * skyline, an orrery. Each one is driven by the same two numbers — how many
 * skills the job used and how long each was used for — so the shape is the
 * data, not decoration, and each piece carries its own label as it rises.
 */

export interface Tower {
  name: string;
  years: number;
}

export interface Build {
  group: ThreeTypes.Group;
  /**
   * Called every frame: how far built (0 to 1), the clock, and how much the
   * camera is paying attention to this stop (labels fade out once it leaves).
   */
  grow: (eased: number, time: number, focus: number) => void;
}

type Three = typeof ThreeTypes;
type Label = (text: string) => ThreeTypes.Sprite;

export const GOLD = "#d9a441";

/** Parts come in one at a time, so a place assembles rather than inflates. */
const stage = (eased: number, index: number, count: number) =>
  Math.max(0, Math.min(1, (eased - (index / Math.max(1, count)) * 0.62) / 0.38));

const LABEL_LIMIT = 6;

export function makeBuilders(THREE: Three, label: Label) {
  /** Solid gold, lit, with its edges picked out so the form still reads. */
  const solid = (shade: number) =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(GOLD).multiplyScalar(0.45 + shade * 0.5),
      emissive: new THREE.Color(GOLD).multiplyScalar(0.12 + shade * 0.1),
      metalness: 0.75,
      roughness: 0.38,
      flatShading: true,
    });

  const outline = (mesh: ThreeTypes.Mesh) => {
    const lines = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 24),
      new THREE.LineBasicMaterial({ color: 0xffd48a, transparent: true, opacity: 0.35 }),
    );
    mesh.add(lines);
    return mesh;
  };

  const shadeFor = (tower: Tower, tallest: number) => Math.min(1, tower.years / tallest);

  interface Part {
    mesh: ThreeTypes.Mesh;
    height: number;
    tag?: ThreeTypes.Sprite;
    /** Labels sit at three different heights so they don't stack on each other. */
    lift: number;
  }

  /** One piece of a place: its mesh, and the label that arrives with it. */
  const makePart = (
    group: ThreeTypes.Group,
    mesh: ThreeTypes.Mesh,
    height: number,
    tower: Tower,
    index: number,
  ): Part => {
    outline(mesh);
    group.add(mesh);
    let tag: ThreeTypes.Sprite | undefined;
    if (index < LABEL_LIMIT) {
      tag = label(`${tower.name}  ·  ${say(tower.years)} yrs`);
      group.add(tag);
    }
    return { mesh, height, tag, lift: 5 + (index % 3) * 8 };
  };

  const showTag = (part: Part, grown: number, focus: number, x: number, y: number, z: number) => {
    if (!part.tag) return;
    part.tag.position.set(x, y + part.lift, z);
    (part.tag.material as ThreeTypes.SpriteMaterial).opacity = Math.max(0, Math.min(1, grown * 1.4 - 0.2)) * focus;
  };

  /** A camp of spires: the freelance years, put up one at a time. */
  const spires = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const parts = towers.map((tower, index) => {
      const height = 12 + shadeFor(tower, tallest) * 38;
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(2.6 + shadeFor(tower, tallest) * 2.2, height, 6),
        solid(shadeFor(tower, tallest)),
      );
      const angle = index * 2.399;
      const radius = 8 + index * 2.6;
      mesh.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      return makePart(group, mesh, height, tower, index);
    });
    const ring = outline(
      new THREE.Mesh(new THREE.TorusGeometry(30, 0.5, 8, 60), solid(0.3)),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    return {
      group,
      grow(eased, time, focus) {
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.y = grown;
          part.mesh.position.y = (part.height * grown) / 2;
          // Freelance runs hot and cold; the spires breathe with it.
          const busy = 0.55 + Math.abs(Math.sin(time * 0.35 + index * 1.4)) * 0.45;
          (part.mesh.material as ThreeTypes.MeshStandardMaterial).emissiveIntensity = busy;
          showTag(part, grown, focus, part.mesh.position.x, part.height * grown, part.mesh.position.z);
        });
        ring.scale.setScalar(0.2 + eased * 0.8);
      },
    };
  };

  /** Rows of racks, humming in a data centre. */
  const racks = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const parts = towers.map((tower, index) => {
      const height = 9 + shadeFor(tower, tallest) * 26;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(7, height, 5), solid(shadeFor(tower, tallest)));
      const row = index % 2;
      mesh.position.set(-18 + Math.floor(index / 2) * 12, height / 2, row === 0 ? -9 : 9);
      return makePart(group, mesh, height, tower, index);
    });
    const floor = outline(new THREE.Mesh(new THREE.BoxGeometry(62, 0.6, 34), solid(0.15)));
    group.add(floor);
    return {
      group,
      grow(eased, time, focus) {
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.y = grown;
          part.mesh.position.y = (part.height * grown) / 2;
          (part.mesh.material as ThreeTypes.MeshStandardMaterial).emissiveIntensity =
            0.6 + Math.abs(Math.sin(time * 2.2 + index)) * 0.6;
          showTag(part, grown, focus, part.mesh.position.x, part.height * grown, part.mesh.position.z);
        });
        floor.scale.setScalar(0.3 + eased * 0.7);
      },
    };
  };

  /** A stepped ziggurat: one tier per skill, widest at the bottom. */
  const ziggurat = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const sorted = [...towers].sort((a, b) => b.years - a.years);
    let base = 0;
    const parts = sorted.map((tower, index) => {
      const height = 5 + shadeFor(tower, tallest) * 10;
      const width = 38 - index * (28 / Math.max(1, sorted.length));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), solid(shadeFor(tower, tallest)));
      const y = base + height / 2;
      base += height;
      mesh.position.y = y;
      const part = makePart(group, mesh, height, tower, index);
      return { ...part, y, width };
    });
    return {
      group,
      grow(eased, time, focus) {
        parts.forEach((part, index) => {
          const grown = stage(eased, index, parts.length);
          part.mesh.scale.setScalar(Math.max(0.001, grown));
          part.mesh.position.y = part.y * grown;
          part.mesh.rotation.y = (1 - grown) * 0.7 + Math.sin(time * 0.1 + index) * 0.02;
          showTag(part, grown, focus, part.width * 0.5 + 18, part.y * grown - 6, 0);
        });
      },
    };
  };

  /** A keep: four walls, corner towers, money kept safe. */
  const keep = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const wallHeight = 14;
    const walls = [0, 1, 2, 3].map((side) => {
      const mesh = outline(new THREE.Mesh(new THREE.BoxGeometry(38, wallHeight, 2.2), solid(0.25)));
      const angle = (side / 4) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 19, wallHeight / 2, Math.sin(angle) * 19);
      mesh.rotation.y = -angle;
      group.add(mesh);
      return mesh;
    });
    const parts = towers.slice(0, 6).map((tower, index) => {
      const height = 18 + shadeFor(tower, tallest) * 26;
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(4, 5, height, 8),
        solid(shadeFor(tower, tallest)),
      );
      const angle = (index / Math.min(6, towers.length)) * Math.PI * 2 + Math.PI / 4;
      const radius = index < 4 ? 26 : 10;
      mesh.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      return makePart(group, mesh, height, tower, index);
    });
    return {
      group,
      grow(eased, _time, focus) {
        walls.forEach((wall, index) => {
          const grown = Math.max(0.001, stage(eased, index, 9));
          wall.scale.y = grown;
          wall.position.y = (wallHeight * grown) / 2;
        });
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index + 3, 9));
          part.mesh.scale.y = grown;
          part.mesh.position.y = (part.height * grown) / 2;
          showTag(part, grown, focus, part.mesh.position.x, part.height * grown, part.mesh.position.z);
        });
      },
    };
  };

  /** A mast throwing rings of signal outwards. */
  const mast = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const height = 42;
    const pole = outline(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3, height, 8), solid(0.8)));
    pole.position.y = height / 2;
    group.add(pole);
    const parts = towers.map((tower, index) => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(11 + index * 5.5, 0.5, 8, 52),
        solid(shadeFor(tower, tallest)),
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 3 + index * 1.6;
      const part = makePart(group, mesh, 0, tower, index);
      return { ...part, radius: 11 + index * 5.5 };
    });
    return {
      group,
      grow(eased, time, focus) {
        pole.scale.y = Math.max(0.001, stage(eased, 0, 3));
        pole.position.y = (height * pole.scale.y) / 2;
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.setScalar(grown);
          (part.mesh.material as ThreeTypes.MeshStandardMaterial).emissiveIntensity =
            0.4 + Math.abs(Math.sin(time * 1.2 - index * 0.7)) * 1.1;
          showTag(part, grown, focus, part.radius * grown * 0.72, index * 4, part.radius * grown * 0.72);
        });
      },
    };
  };

  /** A cog of billboards, turning: the agency years. */
  const carousel = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const spinner = new THREE.Group();
    group.add(spinner);
    const cog = outline(
      new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 3, Math.max(8, towers.length * 2)), solid(0.25)),
    );
    cog.position.y = 1.6;
    spinner.add(cog);
    const parts = towers.map((tower, index) => {
      const size = 9 + shadeFor(tower, tallest) * 13;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.62, 0.6), solid(shadeFor(tower, tallest)));
      const angle = (index / towers.length) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 22, 7 + size / 2, Math.sin(angle) * 22);
      mesh.rotation.y = -angle + Math.PI / 2;
      outline(mesh);
      spinner.add(mesh);
      let tag: ThreeTypes.Sprite | undefined;
      if (index < LABEL_LIMIT) {
        tag = label(`${tower.name}  ·  ${say(tower.years)} yrs`);
        spinner.add(tag);
      }
      return { mesh, tag, size, angle };
    });
    return {
      group,
      grow(eased, time, focus) {
        spinner.rotation.y = time * 0.11;
        cog.scale.setScalar(Math.max(0.001, stage(eased, 0, 3)));
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.setScalar(grown);
          if (part.tag) {
            part.tag.position.set(
              Math.cos(part.angle) * 22,
              7 + part.size * grown + 7 + (index % 3) * 9,
              Math.sin(part.angle) * 22,
            );
            (part.tag.material as ThreeTypes.SpriteMaterial).opacity =
              Math.max(0, Math.min(1, grown * 1.4 - 0.2)) * focus;
          }
        });
      },
    };
  };

  /** A skyline: the long stretch, dense and tall. */
  const skyline = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const parts = towers.map((tower, index) => {
      const height = 16 + shadeFor(tower, tallest) * 52;
      const width = 5 + shadeFor(tower, tallest) * 3.5;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), solid(shadeFor(tower, tallest)));
      const ring = index < 4 ? 0 : 1;
      const within = ring === 0 ? index : index - 4;
      const count = ring === 0 ? 4 : Math.max(1, towers.length - 4);
      const angle = (within / count) * Math.PI * 2 + ring * 0.6;
      const radius = ring === 0 ? 11 : 24;
      mesh.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      return makePart(group, mesh, height, tower, index);
    });
    const plaza = outline(new THREE.Mesh(new THREE.TorusGeometry(33, 0.6, 8, 70), solid(0.2)));
    plaza.rotation.x = Math.PI / 2;
    group.add(plaza);
    return {
      group,
      grow(eased, time, focus) {
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.y = grown;
          part.mesh.position.y = (part.height * grown) / 2;
          part.mesh.rotation.y = Math.sin(time * 0.15 + index) * 0.02;
          showTag(part, grown, focus, part.mesh.position.x, part.height * grown, part.mesh.position.z);
        });
        plaza.scale.setScalar(0.2 + eased * 0.8);
      },
    };
  };

  /** An orrery for the work that is still turning. */
  const orrery = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const dome = outline(
      new THREE.Mesh(new THREE.SphereGeometry(15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), solid(0.2)),
    );
    group.add(dome);
    const arcs = [0, 1, 2].map((index) => {
      const arc = outline(new THREE.Mesh(new THREE.TorusGeometry(20 + index * 4.5, 0.4, 8, 72), solid(0.45)));
      arc.rotation.x = Math.PI / 2 + index * 0.42;
      arc.rotation.z = index * 0.6;
      group.add(arc);
      return arc;
    });
    const parts = towers.map((tower, index) => {
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.4 + shadeFor(tower, tallest) * 2.6, 1),
        solid(shadeFor(tower, tallest)),
      );
      const part = makePart(group, mesh, 0, tower, index);
      return { ...part, radius: 21 + index * 3.6, speed: 0.42 - index * 0.035, tilt: index * 0.3 };
    });
    return {
      group,
      grow(eased, time, focus) {
        dome.scale.setScalar(Math.max(0.001, stage(eased, 0, 3)));
        arcs.forEach((arc, index) => {
          arc.scale.setScalar(Math.max(0.001, stage(eased, index, 4)));
          arc.rotation.z += 0.0014 * (index + 1);
        });
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          const angle = time * part.speed + index;
          const x = Math.cos(angle) * part.radius * grown;
          const y = 9 + Math.sin(angle + part.tilt) * 6;
          const z = Math.sin(angle) * part.radius * grown;
          part.mesh.position.set(x, y, z);
          part.mesh.scale.setScalar(grown);
          showTag(part, grown, focus, x, y, z);
        });
      },
    };
  };

  const byKind: Record<string, (towers: Tower[], tallest: number) => Build> = {
    spires,
    racks,
    ziggurat,
    keep,
    mast,
    carousel,
    skyline,
    orrery,
  };

  return byKind;
}

/** Which structure each stop puts up. Falls back in route order. */
export const KIND_BY_PLACE: Record<string, string> = {
  stormscape: "spires",
  unitedlayer: "racks",
  murad: "ziggurat",
  "capital-group": "keep",
  boingo: "mast",
  rpa: "carousel",
  investcloud: "skyline",
  "stormscape-now": "orrery",
};

export const KIND_ORDER = ["spires", "racks", "ziggurat", "keep", "mast", "carousel", "skyline", "orrery"];

/** How the camera behaves while the scrubber builds a stop: a sweep, a crane, a push in. */
export interface Move {
  sweep: number;
  radius: [number, number];
  height: [number, number];
  look: number;
}

export const MOVES: Record<string, Move> = {
  spires: { sweep: -1.1, radius: [110, 90], height: [52, 42], look: 32 },
  racks: { sweep: 0.9, radius: [110, 74], height: [52, 30], look: 18 },
  ziggurat: { sweep: -1.4, radius: [110, 82], height: [52, 62], look: 22 },
  keep: { sweep: 1.5, radius: [110, 88], height: [52, 30], look: 20 },
  mast: { sweep: -1.8, radius: [110, 98], height: [52, 68], look: 32 },
  carousel: { sweep: 1.2, radius: [110, 78], height: [52, 42], look: 24 },
  skyline: { sweep: -1.5, radius: [110, 106], height: [52, 82], look: 38 },
  orrery: { sweep: 2.1, radius: [110, 84], height: [52, 52], look: 24 },
};
