import type * as ThreeTypes from "three";

/**
 * What rises at each place on the map. Three directions are on trial here,
 * side by side, so they can be judged against each other:
 *
 *   A. Instruments  — brass machines in the family of the astrolabe, the
 *                     skills engraved on their turning bands. (Earthlink)
 *   B. Sigils       — a heraldic emblem that unfolds, the skills flown as
 *                     banners round it. (HostPro)
 *   C. Monuments    — a column of light ringed by glyphs of light, the skills
 *                     written in the rings. (StormScape)
 *
 * Every place after those three is a combination: a machine for the body, a
 * sigil for its floor, light for its crown.
 *
 * One rule runs through all of them: lettering that burns gold-white is a
 * skill learned at that place; lettering in the place's own colour is a skill
 * carried further. Numbers are not written on the map at all — they belong to
 * the chapter card, where they can be read.
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
   * How far built (0 to 1), a phase that turns the mechanism, and how much the
   * camera is attending to this place.
   */
  grow: (eased: number, phase: number, focus: number) => void;
  /** A second visit: the same place takes on what is new since. */
  growLater?: (eased: number, phase: number, focus: number) => void;
  /** How tall and how wide it stands once built, floating title included, so a camera can frame all of it. */
  top: number;
  reach: number;
  /** Where the camera should come to rest, if the place reads best from a particular height (radians above level). */
  view?: { pitch: number };
}

/** What a builder is told about the place it is building. */
export interface Place {
  /** The company name, flown in a ring of light over the structure. */
  title: string;
  /** The place's accent colour, from the portfolio's cores where there is one. */
  accent: string;
  /** Which house's sigil to use. */
  house: string;
}

type Three = typeof ThreeTypes;
type Label = (text: string, bright: boolean) => ThreeTypes.Sprite;
type SkinName = "bronze" | "stone" | "timber" | "iron";

const NEW_GLOW = "#ffe2a0";

/** Parts come in one after another, so a place assembles rather than inflates. */
const stage = (eased: number, index: number, count: number) => {
  const x = Math.max(0, Math.min(1, (eased - (index / Math.max(1, count)) * 0.6) / 0.4));
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export function makeBuilders(THREE: Three, label: Label) {
  /* ------------------------------------------------------------------ */
  /* Surfaces                                                            */

  const painted = (draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 256) => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    draw(ctx, size);
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
    stone: painted((ctx, size) => {
      ctx.fillStyle = "#73695a";
      ctx.fillRect(0, 0, size, size);
      speckle(ctx, size, 620, "rgba(220, 210, 184, 0.13)", "rgba(20, 16, 10, 0.2)");
    }),
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

  /* ------------------------------------------------------------------ */
  /* Lettering                                                           */

  /**
   * A line of lettering as two textures: the metal with the words cut dark
   * into it, and the words alone in white, which is where the band glows.
   * Sized so that, wrapped round a band, the letters are not stretched.
   */
  const lettering = (text: string, circumference: number, height: number, font: "serif" | "mono" = "serif") => {
    const H = 128;
    const face = font === "serif" ? '700 78px "Cinzel", Georgia, serif' : '600 62px "JetBrains Mono", Menlo, monospace';
    const probe = document.createElement("canvas").getContext("2d")!;
    probe.font = face;
    probe.letterSpacing = "8px";
    const run = `${text}    ✦    `;
    const runWidth = probe.measureText(run).width;
    // How many times the words go round, so they keep their proportions.
    const pixelsRound = (circumference / height) * H;
    const repeats = Math.max(1, Math.round(pixelsRound / runWidth));
    const W = Math.min(4096, Math.ceil(runWidth));

    const make = (paint: (ctx: CanvasRenderingContext2D) => void, srgb: boolean) => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      paint(ctx);
      const texture = new THREE.CanvasTexture(canvas);
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.repeat.set(repeats, 1);
      texture.anisotropy = 8;
      return texture;
    };
    const write = (ctx: CanvasRenderingContext2D) => {
      ctx.font = face;
      ctx.letterSpacing = "8px";
      ctx.textBaseline = "middle";
      ctx.save();
      ctx.scale(W / runWidth, 1);
      ctx.fillText(run, 0, H / 2 + 4);
      ctx.restore();
    };
    return {
      metal: make((ctx) => {
        ctx.fillStyle = "#8b6628";
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 90; i += 1) {
          ctx.fillStyle = i % 2 === 0 ? "rgba(255, 220, 150, 0.07)" : "rgba(30, 16, 4, 0.12)";
          ctx.fillRect((i * 53) % W, 0, 2 + (i % 3), H);
        }
        ctx.fillStyle = "rgba(34, 18, 4, 0.55)";
        ctx.fillRect(0, 0, W, 8);
        ctx.fillRect(0, H - 8, W, 8);
        ctx.fillStyle = "#2b1806";
        write(ctx);
      }, true),
      glow: make((ctx) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 5;
        write(ctx);
      }, false),
    };
  };

  /** A bronze band with a skill engraved round it, the letters lit from within. */
  const engravedBand = (radius: number, height: number, text: string, glow: string) => {
    const faces = lettering(text.toUpperCase(), Math.PI * 2 * radius, height);
    const material = new THREE.MeshStandardMaterial({
      map: faces.metal,
      metalness: 0.85,
      roughness: 0.4,
      emissive: new THREE.Color(glow),
      emissiveMap: faces.glow,
      emissiveIntensity: 1.5,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 96, 1, true), material);
    [1, -1].forEach((edge) => {
      const rail = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.7, 6, 96), skin("bronze", 0.6));
      rail.rotation.x = Math.PI / 2;
      rail.position.y = (edge * height) / 2;
      mesh.add(rail);
    });
    return mesh;
  };

  /** The same words with no metal at all: a ring of light. */
  const glyphRing = (radius: number, height: number, text: string, colour: string) => {
    const faces = lettering(text.toUpperCase(), Math.PI * 2 * radius, height);
    return new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 96, 1, true),
      new THREE.MeshBasicMaterial({
        map: faces.glow,
        color: new THREE.Color(colour),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
  };

  /** A shaft of light standing on a place. */
  const lightColumn = (radius: number, height: number, colour: string) => {
    const fade = painted((ctx, size) => {
      const up = ctx.createLinearGradient(0, size, 0, 0);
      up.addColorStop(0, "rgba(255,255,255,0.95)");
      up.addColorStop(0.5, "rgba(255,255,255,0.35)");
      up.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = up;
      ctx.fillRect(0, 0, size, size);
    }, 64);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.55, radius, height, 28, 1, true),
      new THREE.MeshBasicMaterial({
        map: fade,
        color: new THREE.Color(colour),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.y = height / 2;
    return mesh;
  };

  /**
   * Every place is crowned the same way: a shaft of light in its own colour,
   * and its name going round above it in letters of light.
   */
  const crowned = (group: ThreeTypes.Group, place: Place, at: number, radius = 30) => {
    const shaft = lightColumn(3, at + 64, place.accent);
    group.add(shaft);
    const crown = glyphRing(radius, 8.5, place.title, place.accent);
    group.add(crown);
    return (lit: number, phase: number) => {
      (shaft.material as ThreeTypes.MeshBasicMaterial).opacity = lit * 0.36;
      crown.position.y = at * (0.4 + 0.6 * lit);
      crown.rotation.y = -phase * 0.3;
      (crown.material as ThreeTypes.MeshBasicMaterial).opacity = lit * 0.92;
    };
  };

  /** A heraldic emblem, painted: enamel field, gold rims, a charge, and the house's letters. */
  const emblem = (letters: string, field: string, second: string) =>
    painted((ctx, size) => {
      const c = size / 2;
      ctx.fillStyle = "#1a1208";
      ctx.fillRect(0, 0, size, size);
      const disc = (r: number, fill: string) => {
        ctx.beginPath();
        ctx.arc(c, c, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
      };
      disc(c * 0.98, "#c9973f");
      disc(c * 0.92, "#5d4218");
      disc(c * 0.88, field);
      // Quartered field.
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, c * 0.88, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = second;
      ctx.fillRect(c, 0, c, c);
      ctx.fillRect(0, c, c, c);
      // A chevron across it.
      ctx.strokeStyle = "#d9b25a";
      ctx.lineWidth = size * 0.045;
      ctx.beginPath();
      ctx.moveTo(c * 0.18, c * 1.5);
      ctx.lineTo(c, c * 0.72);
      ctx.lineTo(c * 1.82, c * 1.5);
      ctx.stroke();
      ctx.restore();
      // Studs round the rim.
      for (let i = 0; i < 24; i += 1) {
        const a = (i / 24) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * c * 0.95, c + Math.sin(a) * c * 0.95, size * 0.011, 0, Math.PI * 2);
        ctx.fillStyle = "#f4dc9a";
        ctx.fill();
      }
      disc(c * 0.4, "#1a1208");
      disc(c * 0.36, "#c9973f");
      disc(c * 0.32, field);
      ctx.fillStyle = "#f6e2ae";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${size * (letters.length > 1 ? 0.2 : 0.3)}px "Cinzel", Georgia, serif`;
      ctx.fillText(letters, c, c + size * 0.015);
    }, 1024);

  const HOUSES: Record<string, [string, string, string]> = {
    // letters, field, second colour
    earthlink: ["E", "#1f4a63", "#15354a"],
    hostpro: ["HP", "#6e1f24", "#4a1418"],
    stormscape: ["S", "#252c52", "#171c38"],
    unitedlayer: ["UL", "#2c4f52", "#1c3638"],
    murad: ["M", "#5a3a66", "#3c2646"],
    "capital-group": ["CG", "#1f3f6e", "#142b4d"],
    boingo: ["B", "#7a4a1c", "#573312"],
    rpa: ["RPA", "#5e2438", "#411827"],
    investcloud: ["IC", "#1e5a4a", "#123d32"],
  };

  /** Fresh skills burn gold-white; carried ones take the place's own colour. */
  const glowFor = (tower: Tower, own: string) => (tower.fresh ? NEW_GLOW : own);

  /* ------------------------------------------------------------------ */
  /* A. The instrument: Earthlink's beacon                                */

  const beacon = (towers: Tower[], tallest: number, _later: Tower[] | undefined, place: Place): Build => {
    const group = new THREE.Group();
    const OWN = place.accent;

    const drum = new THREE.Mesh(new THREE.CylinderGeometry(30, 33, 6, 40), skin("bronze", 0.3));
    drum.position.y = 3;
    group.add(drum);

    const GAP = 13;
    const top = 12 + towers.length * GAP;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, top + 8, 10), skin("bronze", 0.7));
    column.position.y = (top + 8) / 2;
    const columnHolder = new THREE.Group();
    columnHolder.add(column);
    group.add(columnHolder);

    // One engraved band to a skill, widest for the longest served, climbing the column.
    const sorted = [...towers].sort((a, b) => b.years - a.years);
    const bands = sorted.map((tower, index) => {
      const radius = 13 + shadeFor(tower, tallest) * 15;
      const mesh = engravedBand(radius, 10.5, tower.name, glowFor(tower, OWN));
      const spokes = new THREE.Group();
      for (let k = 0; k < 3; k += 1) {
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, radius, 6), skin("bronze", 0.5));
        spoke.rotation.z = Math.PI / 2;
        spoke.rotation.y = (k / 3) * Math.PI * 2;
        spoke.position.set(Math.cos((k / 3) * Math.PI * 2) * radius * 0.5, 0, -Math.sin((k / 3) * Math.PI * 2) * radius * 0.5);
        spokes.add(spoke);
      }
      mesh.add(spokes);
      group.add(mesh);
      return { mesh, at: 14 + index * GAP, speed: (index % 2 === 0 ? 1 : -1) * (0.5 - index * 0.06) };
    });

    // The lamp: a light in a cage of gimbals.
    const lamp = new THREE.Group();
    lamp.add(new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffe6b8 })));
    const gimbals = [0, 1, 2].map((k) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7 + k * 1.8, 0.45, 8, 48), skin("bronze", 0.8));
      ring.rotation.set(k * 0.9, k * 0.5, 0);
      lamp.add(ring);
      return ring;
    });
    group.add(lamp);

    // What a beacon is for: rings of signal running out across the country.
    const pulses = [0, 1, 2].map(() => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.93, 1, 96),
        new THREE.MeshBasicMaterial({
          color: 0xffc070,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 7;
      group.add(ring);
      return ring;
    });

    const crownAt = top + 40;
    const crown = crowned(group, place, crownAt, 26);

    return {
      group,
      top: crownAt + 8,
      reach: 46,
      grow(eased, phase) {
        const base = Math.max(0.001, stage(eased, 0, 6));
        drum.scale.set(base, 1, base);
        columnHolder.scale.y = Math.max(0.001, stage(eased, 0, 4));
        crown(stage(eased, bands.length + 1, bands.length + 2), phase);

        bands.forEach((band, index) => {
          const grown = stage(eased, index + 1, bands.length + 2);
          band.mesh.scale.setScalar(Math.max(0.001, grown));
          band.mesh.position.y = band.at * grown;
          band.mesh.rotation.y = phase * band.speed + (1 - grown) * 3;
        });

        const lit = stage(eased, bands.length + 1, bands.length + 2);
        lamp.scale.setScalar(Math.max(0.001, lit));
        lamp.position.y = (top + 14) * Math.max(0.2, lit);
        gimbals.forEach((ring, k) => {
          ring.rotation.x = k * 0.9 + phase * (0.5 + k * 0.2);
          ring.rotation.y = k * 0.5 + phase * (0.3 + k * 0.15);
        });

        pulses.forEach((ring, k) => {
          const life = (phase * 0.16 + k / pulses.length) % 1;
          ring.scale.setScalar(34 + life * 190);
          (ring.material as ThreeTypes.MeshBasicMaterial).opacity = lit * (1 - life) ** 1.6 * 0.75;
        });
      },
    };
  };

  /* ------------------------------------------------------------------ */
  /* B. The sigil: HostPro's standard                                     */

  const standard = (towers: Tower[], tallest: number, _later: Tower[] | undefined, place: Place): Build => {
    const group = new THREE.Group();
    const turntable = new THREE.Group();
    group.add(turntable);
    const [letters, field, second] = HOUSES[place.house] ?? HOUSES.hostpro;

    // The shield, in eight leaves that fan open.
    const SHIELD = 24;
    const face = emblem(letters, field, second);
    const shield = new THREE.Group();
    shield.position.y = SHIELD + 10;
    // Leant back a little, so it is never seen dead edge-on as it turns.
    shield.rotation.x = -0.35;
    const leaves = Array.from({ length: 8 }, (_, k) => {
      const leafMaterial = new THREE.MeshStandardMaterial({
        map: face,
        emissive: new THREE.Color("#ffffff"),
        emissiveMap: face,
        emissiveIntensity: 0.24,
        metalness: 0.55,
        roughness: 0.45,
        side: THREE.DoubleSide,
      });
      const leaf = new THREE.Mesh(
        new THREE.CircleGeometry(SHIELD, 12, (k / 8) * Math.PI * 2, Math.PI / 4 + 0.002),
        leafMaterial,
      );
      shield.add(leaf);
      return leaf;
    });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(SHIELD, 1.3, 8, 72), skin("bronze", 0.8));
    shield.add(rim);
    turntable.add(shield);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, SHIELD + 10, 8), skin("bronze", 0.4));
    post.position.y = (SHIELD + 10) / 2;
    const postHolder = new THREE.Group();
    postHolder.add(post);
    turntable.add(postHolder);

    // A tabard's cloth: the skill written down it in letters that glow — gold
    // for one learned here, the house's colour for one carried further —
    // the same rule the engraved bands follow everywhere else.
    const tabard = (tower: Tower, width: number, drop: number, index: number) => {
      const W = 384;
      const H = Math.round((W * drop) / width);
      const draw = (paint: (ctx: CanvasRenderingContext2D) => void, srgb: boolean) => {
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d")!;
        paint(ctx);
        const texture = new THREE.CanvasTexture(canvas);
        if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        return texture;
      };
      // The name reads across the cloth, a word or two to a line, as large as
      // the longest line allows.
      const words = tower.name.toUpperCase().split(/\s+|(?<=\/)/).filter((word) => word && word !== "/");
      const rows: string[] = [];
      for (const word of words) {
        const last = rows[rows.length - 1];
        if (last !== undefined && (last + " " + word).length <= 11) rows[rows.length - 1] = `${last} ${word}`;
        else rows.push(word);
      }
      const write = (ctx: CanvasRenderingContext2D) => {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let size = 74;
        const fits = () => {
          ctx.font = `700 ${size}px "Cinzel", Georgia, serif`;
          return rows.every((row) => ctx.measureText(row).width <= W - 56);
        };
        while (!fits() && size > 26) size -= 2;
        const lead = size * 1.18;
        const start = Math.min(H * 0.42, 70 + (rows.length * lead) / 2) - ((rows.length - 1) * lead) / 2;
        rows.forEach((row, k) => ctx.fillText(row, W / 2, start + k * lead));
      };
      const cloth = draw((ctx) => {
        ctx.fillStyle = index % 2 === 0 ? field : second;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = "#d9b25a";
        ctx.lineWidth = 12;
        ctx.strokeRect(12, 12, W - 24, H - 24);
        // A swallow-tail cut into the hem.
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.moveTo(0, H);
        ctx.lineTo(W / 2, H - 46);
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(20, 10, 2, 0.55)";
        write(ctx);
      }, true);
      const glow = draw((ctx) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        ctx.shadowColor = "#fff";
        ctx.shadowBlur = 6;
        write(ctx);
      }, false);
      return new THREE.MeshStandardMaterial({
        map: cloth,
        emissive: new THREE.Color(glowFor(tower, place.accent)),
        emissiveMap: glow,
        emissiveIntensity: 1.6,
        roughness: 0.92,
      });
    };

    // The skills, flown in a ring round the shield and facing out, so they can
    // be read from wherever the camera is. Longest served hangs longest.
    const RING = 52;
    const banners = towers.map((tower, index) => {
      const drop = 30 + shadeFor(tower, tallest) * 26;
      const width = 24;
      const holder = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, drop + 14, 8), skin("timber", 0.7));
      pole.position.y = (drop + 14) / 2;
      holder.add(pole);
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, width + 3, 6), skin("bronze", 0.7));
      bar.rotation.z = Math.PI / 2;
      bar.position.y = drop + 12;
      holder.add(bar);

      // Two cloths back to back, so the lettering reads from either side.
      const material = tabard(tower, width, drop, index);
      const hang = new THREE.Group();
      hang.position.y = drop + 11.4;
      [0, Math.PI].forEach((turn) => {
        const cloth = new THREE.Mesh(new THREE.PlaneGeometry(width, drop), material);
        cloth.geometry.translate(0, -drop / 2, 0);
        cloth.rotation.y = turn;
        cloth.position.z = turn === 0 ? 0.12 : -0.12;
        hang.add(cloth);
      });
      holder.add(hang);

      if (tower.fresh) {
        const finial = new THREE.Mesh(
          new THREE.OctahedronGeometry(2, 0),
          new THREE.MeshStandardMaterial({ color: "#ffd27a", emissive: "#ffb433", emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.25 }),
        );
        finial.position.y = drop + 16.5;
        holder.add(finial);
      }

      const angle = (index / towers.length) * Math.PI * 2;
      holder.position.set(Math.sin(angle) * RING, 0, Math.cos(angle) * RING);
      holder.rotation.y = angle;
      turntable.add(holder);
      return { holder, hang };
    });

    const crownAt = 104;
    const crown = crowned(group, place, crownAt, 32);

    return {
      group,
      top: crownAt + 8,
      reach: RING + 14,
      // Tabards are read from the side: the camera comes to rest low and level.
      view: { pitch: 0.16 },
      grow(eased, phase) {
        turntable.rotation.y = phase * 0.12;
        postHolder.scale.y = Math.max(0.001, stage(eased, 0, 5));
        const open = stage(eased, 1, 5);
        rim.scale.setScalar(Math.max(0.001, open));
        shield.rotation.y = phase * 0.2;
        leaves.forEach((leaf, k) => {
          const mine = Math.max(0.001, Math.min(1, open * 1.6 - (k / 8) * 0.6));
          leaf.scale.setScalar(mine);
          leaf.rotation.z = (1 - mine) * 1.4;
        });
        banners.forEach((banner, index) => {
          const grown = stage(eased, index + 2, banners.length + 3);
          // Nothing of a tabard shows before its turn, finial included.
          banner.holder.visible = grown > 0.004;
          banner.holder.scale.y = Math.max(0.001, Math.min(1, grown * 2));
          banner.hang.scale.y = Math.max(0.001, Math.max(0, grown * 2 - 1));
          banner.hang.rotation.x = Math.sin(phase * 1.8 + index) * 0.04 * grown;
        });
        crown(stage(eased, banners.length + 2, banners.length + 3), phase);
      },
    };
  };

  /* ------------------------------------------------------------------ */
  /* C. The monument: StormScape's column of light                        */

  const monument = (towers: Tower[], tallest: number, later: Tower[] = [], place: Place): Build => {
    const group = new THREE.Group();
    const OWN = place.accent;
    // What the studio picked up the second time round grows in its own colour.
    const LATER = "#ff9d5c";

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(21, 26, 6, 6),
      new THREE.MeshStandardMaterial({ color: "#0f1220", metalness: 0.7, roughness: 0.22, flatShading: true }),
    );
    plinth.position.y = 3;
    group.add(plinth);
    const seams = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.CylinderGeometry(21.2, 26.2, 6.1, 6)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(OWN) }),
    );
    seams.position.y = 3;
    group.add(seams);

    const GAP = 12.5;
    const crownAt = 20 + Math.max(towers.length, later.length) * GAP + 24;

    // The trunk: the shaft of light the place already had.
    const beam = lightColumn(6, crownAt + 50, OWN);
    beam.position.y += 6;
    group.add(beam);
    const core = lightColumn(1.8, crownAt + 60, "#ffffff");
    core.position.y += 6;
    group.add(core);

    /**
     * A branch of the tree: a trace of light run out from the trunk the way a
     * circuit is — level, then a clean turn upward — ending in a node, with a
     * couple of twigs off it, and the skill's name standing at its tip. How
     * far it reaches is how long the skill was used.
     */
    const lit = (colour: string) =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(colour),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    const trace = (points: ThreeTypes.Vector3[], radius: number, colour: string) => {
      const path = new THREE.CurvePath<ThreeTypes.Vector3>();
      for (let k = 0; k < points.length - 1; k += 1) path.add(new THREE.LineCurve3(points[k], points[k + 1]));
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 48, radius, 6, false), lit(colour));
      const total = mesh.geometry.index?.count ?? 0;
      group.add(mesh);
      return (grown: number) => {
        mesh.geometry.setDrawRange(0, Math.floor((total * Math.max(0, Math.min(1, grown))) / 3) * 3);
      };
    };

    const branch = (tower: Tower, order: number, height: number, turn: number, colour: string, bright: boolean) => {
      const reach = 24 + shadeFor(tower, tallest) * 30;
      const out = new THREE.Vector3(Math.sin(turn), 0, Math.cos(turn));
      const across = new THREE.Vector3(out.z, 0, -out.x);
      const root = new THREE.Vector3(0, height, 0);
      const elbow = root.clone().addScaledVector(out, reach * 0.6);
      const tip = elbow.clone().addScaledVector(out, reach * 0.4).setY(height + reach * 0.3);
      const main = trace([root, elbow, tip], 0.5, colour);

      const twigs = [0.34, 0.62].map((along, k) => {
        const from = root.clone().lerp(elbow, along);
        const side = k === 0 ? 1 : -1;
        const mid = from.clone().addScaledVector(across, side * reach * 0.16);
        const end = mid.clone().addScaledVector(out, reach * 0.14).setY(height + reach * 0.12);
        const bud = new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), lit(colour));
        bud.position.copy(end);
        group.add(bud);
        return { grow: trace([from, mid, end], 0.28, colour), bud };
      });

      const node = new THREE.Mesh(new THREE.OctahedronGeometry(1.9, 0), lit(bright ? NEW_GLOW : colour));
      node.position.copy(tip);
      group.add(node);

      const tag = label(tower.name, bright);
      // A tree is read by its leaves: these stand larger than labels elsewhere.
      tag.scale.multiplyScalar(1.5);
      tag.position.copy(tip).addScaledVector(out, 7).setY(tip.y + 8);
      group.add(tag);

      return (eased: number, count: number, phase: number) => {
        const grown = stage(eased, order + 1, count + 2);
        main(grown * 1.25);
        twigs.forEach((twig, k) => {
          const mine = Math.max(0, Math.min(1, (grown - 0.35 - k * 0.2) / 0.4));
          twig.grow(mine);
          twig.bud.scale.setScalar(Math.max(0.001, mine));
        });
        const arrived = Math.max(0, Math.min(1, (grown - 0.75) / 0.25));
        node.scale.setScalar(Math.max(0.001, arrived) * (1 + 0.12 * Math.sin(phase * 4 + order)));
        node.rotation.y = phase * 0.8 + order;
        (tag.material as ThreeTypes.SpriteMaterial).opacity = arrived;
      };
    };

    const first = [...towers].sort((a, b) => b.years - a.years);
    const branches = first.map((tower, index) =>
      branch(tower, index, 20 + index * GAP, index * 2.399, tower.fresh ? NEW_GLOW : OWN, Boolean(tower.fresh)),
    );
    // The second growth comes in between the first, half a step up and round the other way.
    const laterBranches = later.map((tower, index) =>
      branch(tower, index, 20 + GAP / 2 + index * GAP, index * 2.399 + Math.PI * 0.62, LATER, true),
    );

    const shards = Array.from({ length: 10 }, (_, k) => {
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.9 + (k % 3) * 0.4, 0), lit(OWN));
      group.add(shard);
      return { shard, radius: 9 + (k % 4) * 5, height: 14 + k * 10, speed: 0.5 + (k % 3) * 0.2 };
    });

    const crown = crowned(group, place, crownAt, 34);

    return {
      group,
      top: crownAt + 8,
      reach: 64,
      grow(eased, phase) {
        const base = Math.max(0.001, stage(eased, 0, 6));
        plinth.scale.set(base, 1, base);
        seams.scale.set(base, 1, base);
        const on = stage(eased, 0, 3);
        // A storm's light: never quite steady.
        const flicker = 0.85 + 0.15 * Math.sin(phase * 9) * Math.sin(phase * 2.3);
        (beam.material as ThreeTypes.MeshBasicMaterial).opacity = on * 0.3 * flicker;
        (core.material as ThreeTypes.MeshBasicMaterial).opacity = on * 0.7 * flicker;
        branches.forEach((grow) => grow(eased, branches.length, phase));
        laterBranches.forEach((grow) => grow(0, laterBranches.length, phase));
        shards.forEach((entry, k) => {
          const angle = phase * entry.speed + k;
          entry.shard.position.set(Math.cos(angle) * entry.radius, entry.height * on, Math.sin(angle) * entry.radius);
          entry.shard.rotation.set(angle, angle * 1.3, 0);
          (entry.shard.material as ThreeTypes.MeshBasicMaterial).opacity = on * 0.8;
        });
        crown(stage(eased, 1, 3), phase);
      },
      growLater(eased, phase) {
        laterBranches.forEach((grow) => grow(eased, laterBranches.length, phase));
        (beam.material as ThreeTypes.MeshBasicMaterial).opacity = 0.3 + eased * 0.2;
        (core.material as ThreeTypes.MeshBasicMaterial).opacity = 0.7 + eased * 0.25;
      },
    };
  };

  /* ------------------------------------------------------------------ */
  /* All three together: a machine, on its sigil, under its light         */

  type Works = "rotors" | "orrery" | "engine";

  const combined =
    (works: Works) =>
    (towers: Tower[], tallest: number, _later: Tower[] | undefined, place: Place): Build => {
      const group = new THREE.Group();
      const own = place.accent;
      const [letters, field, second] = HOUSES[place.house] ?? HOUSES.hostpro;
      const sorted = [...towers].sort((a, b) => b.years - a.years);

      // B: the house's sigil, laid into the floor the machine stands on.
      const face = emblem(letters, field, second);
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(44, 64),
        new THREE.MeshStandardMaterial({
          map: face,
          emissive: new THREE.Color("#ffffff"),
          emissiveMap: face,
          emissiveIntensity: 0.18,
          metalness: 0.5,
          roughness: 0.5,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.4;
      group.add(floor);

      // A: the machine itself. Its fixed parts go in one frame that rises with
      // the build, so nothing stands on the map before its turn.
      const fixed = new THREE.Group();
      group.add(fixed);
      const moving: Array<(grown: number, phase: number) => void> = [];
      let axleVisible: (shown: boolean) => void = () => {};
      let crownAt = 90;
      let spread = 50;

      if (works === "rotors") {
        // A shaft of rotor drums, the skills engraved round them.
        const axle = new THREE.Group();
        axle.position.y = 30;
        group.add(axle);
        const total = sorted.length * 12;
        sorted.forEach((tower, index) => {
          const radius = 12 + shadeFor(tower, tallest) * 12;
          const drum = engravedBand(radius, 10.5, tower.name, glowFor(tower, own));
          drum.rotation.z = Math.PI / 2;
          const holder = new THREE.Group();
          holder.add(drum);
          holder.position.x = -total / 2 + index * 12 + 6;
          axle.add(holder);
          const cheek = new THREE.Mesh(new THREE.CylinderGeometry(radius + 1.2, radius + 1.2, 1, 40), skin("bronze", 0.35));
          cheek.rotation.z = Math.PI / 2;
          cheek.position.x = 5.75;
          holder.add(cheek);
          moving.push((grown, phase) => {
            holder.scale.setScalar(Math.max(0.001, grown));
            drum.rotation.x = phase * (index % 2 === 0 ? 0.5 : -0.4) + (1 - grown) * 3;
          });
        });
        [-1, 1].forEach((sideOf) => {
          const frame = new THREE.Mesh(new THREE.ConeGeometry(9, 32, 4), skin("iron", 0.8));
          frame.position.set(sideOf * (total / 2 + 5), 16, 0);
          fixed.add(frame);
        });
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, total + 16, 10), skin("iron", 0.9));
        rod.rotation.z = Math.PI / 2;
        axle.add(rod);
        axleVisible = (shown) => {
          rod.visible = shown;
        };
        crownAt = 74;
      } else if (works === "orrery") {
        // Rings within rings, each carrying its own world. A place with many
        // skills gets two hearts side by side and the rings dealt between
        // them, so no one cluster is ever too dense to read — however the
        // data grows.
        const CROWDED = 5;
        const clusters =
          sorted.length > CROWDED
            ? [sorted.filter((_, k) => k % 2 === 0), sorted.filter((_, k) => k % 2 === 1)]
            : [sorted];
        const step = clusters.length > 1 ? 6 : 7;
        const widest = 13 + (clusters[0].length - 1) * step;
        clusters.forEach((cluster, which) => {
          const centre = clusters.length > 1 ? (which === 0 ? -1 : 1) * (widest + 5) : 0;
          const heart = new THREE.Mesh(new THREE.SphereGeometry(5.4, 24, 24), skin("bronze", 0.9));
          heart.position.set(centre, 40, 0);
          fixed.add(heart);
          const post = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.4, 40, 8), skin("bronze", 0.5));
          post.position.set(centre, 20, 0);
          fixed.add(post);
          cluster.forEach((tower, index) => {
            const radius = 13 + index * step;
            const pivot = new THREE.Group();
            pivot.position.set(centre, 40, 0);
            // An ordered fan: every ring leans a fixed step further than the one
            // inside it, about one shared axis — and the second heart mirrors the first.
            const lean = cluster.length > 1 ? (index / (cluster.length - 1) - 0.5) * 1.7 : 0;
            pivot.rotation.set(0, 0, which === 0 ? lean : -lean);
            const ring = engravedBand(radius, 7.5, tower.name, glowFor(tower, own));
            pivot.add(ring);
            const world = new THREE.Mesh(
              new THREE.SphereGeometry(1.5 + shadeFor(tower, tallest) * 2.6, 16, 16),
              skin("bronze", 1),
            );
            world.position.x = radius;
            ring.add(world);
            group.add(pivot);
            moving.push((grown, phase) => {
              pivot.scale.setScalar(Math.max(0.001, grown));
              // One speed, alternating direction, all starting from the same mark.
              ring.rotation.y = phase * 0.42 * (index % 2 === 0 ? 1 : -1);
            });
          });
        });
        spread = clusters.length > 1 ? widest * 2 + 12 : 50;
        crownAt = 96;
      } else {
        // A difference engine: a column of number wheels to every skill.
        sorted.forEach((tower, index) => {
          const wheels = 3 + Math.round(shadeFor(tower, tallest) * 8);
          const holder = new THREE.Group();
          const angle = (index / sorted.length) * Math.PI * 2;
          const ringR = sorted.length > 5 ? 26 : 20;
          holder.position.set(Math.cos(angle) * ringR, 1, Math.sin(angle) * ringR);
          const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, wheels * 5.2 + 4, 8), skin("iron", 0.9));
          spindle.position.y = (wheels * 5.2 + 4) / 2;
          holder.add(spindle);
          const stack = Array.from({ length: wheels }, (_, k) => {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 3.6, 12), skin("bronze", 0.35 + (k % 3) * 0.25));
            wheel.position.y = 3 + k * 5.2;
            holder.add(wheel);
            return wheel;
          });
          // The top wheel of each column is the engraved one.
          const collar = engravedBand(7.4, 7, tower.name, glowFor(tower, own));
          collar.position.y = 3 + wheels * 5.2 + 3;
          holder.add(collar);
          const tag = label(tower.name, Boolean(tower.fresh));
          tag.position.set(holder.position.x * 1.25, 3 + wheels * 5.2 + 14, holder.position.z * 1.25);
          group.add(tag);
          group.add(holder);
          moving.push((grown, phase) => {
            holder.scale.y = Math.max(0.001, grown);
            stack.forEach((wheel, k) => {
              wheel.rotation.y = phase * (k % 2 === 0 ? 0.9 : -0.7) * (1 + k * 0.1);
            });
            collar.rotation.y = phase * 0.4;
            (tag.material as ThreeTypes.SpriteMaterial).opacity = Math.max(0, grown * 1.4 - 0.4);
          });
        });
        crownAt = 84;
      }

      // C: light for a crown.
      const crown = crowned(group, place, crownAt, 30);

      return {
        group,
        top: crownAt + 8,
        reach: works === "rotors" ? Math.max(48, sorted.length * 7 + 14) : spread,
        grow(eased, phase) {
          const laid = Math.max(0.001, stage(eased, 0, 6));
          fixed.scale.setScalar(laid);
          fixed.visible = eased > 0.001;
          axleVisible(eased > 0.001);
          floor.scale.setScalar(laid);
          floor.rotation.z = (1 - laid) * 2;
          moving.forEach((move, index) => move(stage(eased, index + 1, moving.length + 3), phase));
          crown(stage(eased, moving.length + 1, moving.length + 3), phase);
        },
      };
    };

  const byKind: Record<string, (towers: Tower[], tallest: number, later: Tower[] | undefined, place: Place) => Build> = {
    beacon,
    standard,
    monument,
    rotors: combined("rotors"),
    orrery: combined("orrery"),
    engine: combined("engine"),
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

/** Which direction each place is built in. */
export const KIND_BY_PLACE: Record<string, string> = {
  earthlink: "beacon",
  hostpro: "standard",
  stormscape: "monument",
  unitedlayer: "rotors",
  murad: "orrery",
  "capital-group": "engine",
  boingo: "orrery",
  rpa: "rotors",
  investcloud: "engine",
  "stormscape-now": "monument",
};

export const KIND_ORDER = Object.values(KIND_BY_PLACE);

/** What each direction is called, for the chapter card. */
export const DIRECTION_BY_PLACE: Record<string, string> = {
  earthlink: "A · instrument",
  hostpro: "B · sigil",
  stormscape: "C · light",
  "stormscape-now": "C · light",
};
