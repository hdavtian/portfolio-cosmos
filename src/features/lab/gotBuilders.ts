import type * as ThreeTypes from "three";

/**
 * A different thing gets built at every stop on the map: a camp of spires, a
 * row of racks, a ziggurat, a keep, a radio mast, a cog of billboards, a
 * skyline, an orrery. Each one is driven by the same two numbers — how many
 * skills the job used and how long each was used for — so the shape is the
 * data, not decoration.
 */

export interface Tower {
  name: string;
  years: number;
}

export interface Build {
  group: ThreeTypes.Group;
  /** Called every frame with how far built (0 to 1) and the clock. */
  grow: (eased: number, time: number) => void;
}

type Three = typeof ThreeTypes;

export const GOLD = "#d9a441";

/** Parts come in one at a time, so a place assembles rather than inflates. */
const stage = (eased: number, index: number, count: number) =>
  Math.max(0, Math.min(1, (eased - (index / Math.max(1, count)) * 0.55) / 0.45));

export function makeBuilders(THREE: Three) {
  const gold = (shade: number, wireframe = true, opacity = 0.85) =>
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(GOLD).multiplyScalar(shade),
      wireframe,
      transparent: true,
      opacity,
    });

  const shadeFor = (tower: Tower, tallest: number) => 0.5 + (tower.years / tallest) * 0.7;

  /** A camp of spires: the early, scrappy years. */
  const spires = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const parts = towers.map((tower, index) => {
      const height = 10 + (tower.years / tallest) * 34;
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(2.4 + (tower.years / tallest) * 2, height, 5, 1, true),
        gold(shadeFor(tower, tallest)),
      );
      const angle = index * 2.399;
      const radius = 6 + index * 2.4;
      mesh.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      group.add(mesh);
      return { mesh, height };
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(26, 0.3, 6, 48), gold(0.45, false));
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    return {
      group,
      grow(eased) {
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.y = grown;
          part.mesh.position.y = (part.height * grown) / 2;
        });
        ring.scale.setScalar(0.2 + eased * 0.8);
      },
    };
  };

  /** Rows of racks, humming in a data centre. */
  const racks = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const parts = towers.map((tower, index) => {
      const height = 7 + (tower.years / tallest) * 26;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(6, height, 4), gold(shadeFor(tower, tallest)));
      const column = index % 2;
      mesh.position.set(-16 + Math.floor(index / 2) * 11, height / 2, column === 0 ? -8 : 8);
      group.add(mesh);
      return { mesh, height };
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(56, 0.4, 30), gold(0.3, true));
    group.add(floor);
    return {
      group,
      grow(eased, time) {
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.y = grown;
          part.mesh.position.y = (part.height * grown) / 2;
          // A faint flicker, like rack lights.
          (part.mesh.material as ThreeTypes.MeshBasicMaterial).opacity =
            0.6 + Math.abs(Math.sin(time * 2 + index)) * 0.35;
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
      const height = 4 + (tower.years / tallest) * 9;
      const width = 34 - index * (26 / Math.max(1, sorted.length));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), gold(shadeFor(tower, tallest)));
      const y = base + height / 2;
      base += height;
      mesh.position.y = y;
      group.add(mesh);
      return { mesh, y };
    });
    return {
      group,
      grow(eased, time) {
        parts.forEach((part, index) => {
          const grown = stage(eased, index, parts.length);
          part.mesh.scale.setScalar(Math.max(0.001, grown));
          part.mesh.position.y = part.y * grown;
          part.mesh.rotation.y = (1 - grown) * 0.8 + Math.sin(time * 0.1 + index) * 0.02;
        });
      },
    };
  };

  /** A keep: four walls, corner towers, money kept safe. */
  const keep = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const wallHeight = 12 + (towers[0]?.years ?? 1) * 2;
    const walls = [0, 1, 2, 3].map((side) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(34, wallHeight, 1.6), gold(0.55));
      const angle = (side / 4) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 17, wallHeight / 2, Math.sin(angle) * 17);
      mesh.rotation.y = -angle;
      group.add(mesh);
      return mesh;
    });
    const corners = towers.slice(0, 4).map((tower, index) => {
      const height = 16 + (tower.years / tallest) * 24;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.4, height, 8, 1, true), gold(shadeFor(tower, tallest)));
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
      mesh.position.set(Math.cos(angle) * 24, height / 2, Math.sin(angle) * 24);
      group.add(mesh);
      return { mesh, height };
    });
    return {
      group,
      grow(eased) {
        walls.forEach((wall, index) => {
          const grown = Math.max(0.001, stage(eased, index, 8));
          wall.scale.y = grown;
          wall.position.y = (wallHeight * grown) / 2;
        });
        corners.forEach((corner, index) => {
          const grown = Math.max(0.001, stage(eased, index + 4, 8));
          corner.mesh.scale.y = grown;
          corner.mesh.position.y = (corner.height * grown) / 2;
        });
      },
    };
  };

  /** A mast throwing rings of signal outwards. */
  const mast = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const height = 30 + (towers[0]?.years ?? 2) * 3.4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.4, height, 6, 1, true), gold(1));
    pole.position.y = height / 2;
    group.add(pole);
    const rings = towers.map((tower, index) => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(9 + index * 5, 0.3, 6, 44), gold(shadeFor(tower, tallest), false));
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 2 + index * 1.4;
      group.add(mesh);
      return mesh;
    });
    const beacons = towers.slice(0, 5).map((_, index) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), gold(1.2, false));
      group.add(mesh);
      return { mesh, radius: 11 + index * 5, speed: 0.4 + index * 0.12 };
    });
    return {
      group,
      grow(eased, time) {
        pole.scale.y = Math.max(0.001, stage(eased, 0, 3));
        pole.position.y = (height * pole.scale.y) / 2;
        rings.forEach((ring, index) => {
          const grown = stage(eased, index, rings.length);
          ring.scale.setScalar(Math.max(0.001, grown));
          // The rings pulse outward, the way a signal does.
          (ring.material as ThreeTypes.MeshBasicMaterial).opacity =
            0.25 + Math.abs(Math.sin(time * 1.1 - index * 0.7)) * 0.6 * grown;
        });
        beacons.forEach((beacon, index) => {
          const angle = time * beacon.speed + index;
          beacon.mesh.position.set(Math.cos(angle) * beacon.radius * eased, 4 + index * 2, Math.sin(angle) * beacon.radius * eased);
          beacon.mesh.scale.setScalar(Math.max(0.001, eased));
        });
      },
    };
  };

  /** A cog of billboards, turning: the agency years. */
  const carousel = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const cog = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 2.4, towers.length * 2, 1, true), gold(0.55));
    cog.position.y = 1.4;
    group.add(cog);
    const panels = towers.map((tower, index) => {
      const size = 7 + (tower.years / tallest) * 12;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.62), gold(shadeFor(tower, tallest), true, 0.9));
      const angle = (index / towers.length) * Math.PI * 2;
      mesh.position.set(Math.cos(angle) * 20, 6 + size / 2, Math.sin(angle) * 20);
      mesh.rotation.y = -angle + Math.PI / 2;
      group.add(mesh);
      return mesh;
    });
    return {
      group,
      grow(eased, time) {
        group.rotation.y = time * 0.12;
        cog.scale.setScalar(Math.max(0.001, stage(eased, 0, 3)));
        panels.forEach((panel, index) => {
          const grown = Math.max(0.001, stage(eased, index, panels.length));
          panel.scale.setScalar(grown);
        });
      },
    };
  };

  /** A skyline: the long stretch, dense and tall. */
  const skyline = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const parts = towers.map((tower, index) => {
      const height = 12 + (tower.years / tallest) * 46;
      const width = 4 + (tower.years / tallest) * 3;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), gold(shadeFor(tower, tallest)));
      const ring = index < 4 ? 0 : 1;
      const within = ring === 0 ? index : index - 4;
      const count = ring === 0 ? 4 : Math.max(1, towers.length - 4);
      const angle = (within / count) * Math.PI * 2 + ring * 0.6;
      const radius = ring === 0 ? 9 : 21;
      mesh.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      group.add(mesh);
      return { mesh, height };
    });
    const plaza = new THREE.Mesh(new THREE.TorusGeometry(29, 0.4, 6, 60), gold(0.4, false));
    plaza.rotation.x = Math.PI / 2;
    group.add(plaza);
    return {
      group,
      grow(eased, time) {
        parts.forEach((part, index) => {
          const grown = Math.max(0.001, stage(eased, index, parts.length));
          part.mesh.scale.y = grown;
          part.mesh.position.y = (part.height * grown) / 2;
          part.mesh.rotation.y = Math.sin(time * 0.15 + index) * 0.03;
        });
        plaza.scale.setScalar(0.2 + eased * 0.8);
      },
    };
  };

  /** An orrery for the work that is still turning. */
  const orrery = (towers: Tower[], tallest: number): Build => {
    const group = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(16, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), gold(0.45));
    group.add(dome);
    const arcs = [0, 1, 2].map((index) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(19 + index * 4, 0.28, 6, 64), gold(0.7, false));
      arc.rotation.x = Math.PI / 2 + index * 0.4;
      arc.rotation.z = index * 0.6;
      group.add(arc);
      return arc;
    });
    const planets = towers.map((tower, index) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.8 + (tower.years / tallest) * 2.2, 10, 10), gold(shadeFor(tower, tallest), true));
      group.add(mesh);
      return { mesh, radius: 20 + index * 3.4, speed: 0.5 - index * 0.04, tilt: index * 0.22 };
    });
    return {
      group,
      grow(eased, time) {
        dome.scale.setScalar(Math.max(0.001, stage(eased, 0, 3)));
        arcs.forEach((arc, index) => {
          arc.scale.setScalar(Math.max(0.001, stage(eased, index, 4)));
          arc.rotation.z += 0.0012 * (index + 1);
        });
        planets.forEach((planet, index) => {
          const grown = Math.max(0.001, stage(eased, index, planets.length));
          const angle = time * planet.speed + index;
          planet.mesh.position.set(
            Math.cos(angle) * planet.radius * grown,
            6 + Math.sin(angle + planet.tilt) * 5,
            Math.sin(angle) * planet.radius * grown,
          );
          planet.mesh.scale.setScalar(grown);
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
