# Moon Visit Content Display — Design Plan

## Source of Truth
`src/data/resume.json` → `experience[]`

Each company has: `company`, `location`, `startDate`, `endDate`, `positions[]` (each with `title`, `responsibilities[]`), and optional `notes[]`.

---

## Variants

### 1. Cockpit Holographic Panels (User's Idea — Refined)

**View:** Cockpit only

Transparent, slightly frosted glass panels float inside the cockpit cylinder at varying depths. Each panel = one logical block (company header, position 1, position 2, etc.). Panels are angled to follow the cockpit curvature, arranged in a shallow arc around the pilot seat.

- **Entry animation:** Panels materialize one-by-one from the center outward, each with a quick opacity fade + slight Z-axis slide (0 → final depth). Text within each panel types in line-by-line with a subtle glow cursor.
- **Styling:** Dark semi-transparent bg (`rgba(5,15,40,0.7)`), thin cyan/white border, monospace or Rajdhani font, soft bloom glow on edges.
- **Navigation:** Small dot indicators or left/right arrow buttons in the control bar to cycle between panels if content overflows.
- **Exit:** Panels dissolve outward when leaving the moon.

**When switching to 3rd person:** Panels fade out (they're cockpit-only geometry). 3rd-person uses its own display (see below).

---

### 2. Orbital Dossier Ring (3rd Person)

**View:** 3rd person

When visiting a moon in 3rd person, flat transparent cards orbit slowly around the moon in a ring (like Saturn's ring but made of info cards). Each card is a CSS2D or HTML overlay, gently tilted, hovering at the moon's equator.

- **Entry:** Cards fly in from off-screen and settle into the ring formation.
- **Interaction:** Clicking a card expands it to center-screen with full details. Click again or click elsewhere to collapse.
- **Feel:** Clean, minimal — looks like a data readout from a sci-fi scanner.

---

### 3. Hologram Projector Drone

**View:** 3rd person (works in cockpit too as a miniature)

A small drone/satellite model flies into frame, parks near the moon, and projects a holographic display — a single large transparent panel that "beams" into existence with a scan-line effect (top to bottom reveal). Text appears as if laser-written, line by line.

- **Entry:** Drone glides in with engine glow, stops, emits a vertical beam, panel materializes inside the beam.
- **Content:** Single scrollable panel with all company info. Neon-on-dark aesthetic.
- **Exit:** Panel collapses back into the beam, drone flies away.
- **Bonus:** Drone could be reused across all moons — a consistent "narrator" device.

---

### 4. Planetary Surface Projection

**View:** 3rd person

Content appears directly ON the moon's surface as projected text — like a map overlay. The moon itself becomes the display. Company name rendered large across the equator, positions and responsibilities wrap around the surface in concentric latitude bands.

- **Entry:** Text burns onto the surface with a ripple/glow effect expanding from the landing point.
- **Interaction:** User orbits the moon to read different sections. Subtle highlight on the section facing the camera.
- **Feel:** Like reading ancient inscriptions on a celestial body. Mysterious, unique.

---

### 5. Mission Briefing Terminal

**View:** Both cockpit and 3rd person (adapts)

A full-screen or half-screen overlay styled as a retro-futuristic terminal/mission briefing. Think green-on-black CRT with scan lines, or a sleek LCARS-style readout.

- **Cockpit:** Fills a portion of the windshield like a HUD overlay. Semi-transparent so you still see the moon beyond it.
- **3rd person:** Slides in from the right side as a panel (like the current overlay pane, but restyled).
- **Entry:** Screen "boots up" with a brief initialization sequence (`SCANNING MOON... DOSSIER LOADED`), then content types in rapidly.
- **Content:** Structured as: `OPERATIVE: [name] | STATION: [company] | SECTOR: [location] | TENURE: [dates]` followed by mission objectives (responsibilities).
- **Feel:** Immersive, narrative, ties into the space theme. Low implementation risk since it's mostly HTML/CSS overlay.

---

### 6. Data Constellation

**View:** 3rd person

Each responsibility becomes a glowing node floating around the moon, connected by thin lines to form a constellation/network graph. The company name is the central bright node; positions branch out; responsibilities are leaf nodes.

- **Entry:** Nodes spark into existence one by one, lines draw between them.
- **Interaction:** Hover a node to expand the full text. Click to pin it open.
- **Feel:** Abstract, data-viz inspired. Visually striking but may sacrifice readability for dense content.

---

### 7. Ship's Log / Captain's Journal

**View:** Both (HTML overlay)

Content is presented as a narrative "ship's log" entry — the resume data rewritten in first-person, past-tense, as if the captain is recounting a mission. A parchment/datapad styled overlay with handwriting-like animation.

- **Entry:** The panel slides in, text writes itself with a pen/cursor animation.
- **Feel:** Personal, story-driven. Requires pre-written narrative text per company (could be auto-generated from responsibilities with light editing).
- **Low-tech version:** Just restyle the existing right-pane overlay with this theme. Minimal Three.js work.

---

## Implementation Priority (Suggested)

| Priority | Variant | Effort | Impact |
|----------|---------|--------|--------|
| 1 | **#5 Mission Briefing Terminal** | Low | High — works in both views, mostly CSS |
| 2 | **#1 Cockpit Holographic Panels** | Medium | High — the signature cockpit experience |
| 3 | **#3 Hologram Projector Drone** | Medium | High — memorable, reusable across moons |
| 4 | **#2 Orbital Dossier Ring** | Medium | Medium — clean 3rd person display |
| 5 | **#4 Surface Projection** | High | Medium — unique but hard to read |
| 6 | **#6 Data Constellation** | High | Low — style over substance |
| 7 | **#7 Ship's Log** | Low | Medium — narrative but less visual |

---

## Next Steps

1. User picks 1-2 variants to prototype
2. For cockpit panels (#1): build a debug mode to position/angle panels inside the cockpit geometry
3. For any variant: ensure content reads from `resume.json` as single source of truth
4. Handle view-mode transitions (cockpit <-> 3rd person) gracefully — fade out one, fade in the other
5. Capture the exact data fields to display per panel/card/node
