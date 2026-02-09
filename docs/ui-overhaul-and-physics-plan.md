# UI Overhaul & Physics Completion Plan

**Author:** AI Assistant (taking over from previous AI)  
**Date:** February 7, 2026  
**Status:** Active  

---

## Executive Summary

This plan covers three tracks:

1. **UI Overhaul** — Replace the current panel-heavy HUD (`SpaceshipHUDClean.tsx`, ~2,100 lines) with a minimalistic, contextual, game-inspired interface.
2. **In-Universe Dialogue System** — An AI ship companion (ARIA) that talks to the visitor via chat bubbles, offers choices, and drives narrative exploration of resume content.
3. **Physics Completion** — Finish the GSAP→Physics migration (Steps 5–7 from `physics-steering-refactor-plan.md`).

### Guiding Principles

- **Minimalism**: No persistent left/right/top/bottom panels. The universe IS the UI.
- **Contextual**: Show choices only when relevant, near the thing they affect.
- **Narrative**: Resume content is delivered through dialogue, not data dumps. The visitor *converses* with the universe.
- **Game-like**: View toggles (3rd person / 1st person), contextual prompts, dialogue choices, unobtrusive overlays.
- **Incremental**: Each phase is self-contained. We test after every phase before moving on.
- **Non-destructive**: Current code is backed up before any removal.

---

## Current State Assessment

### What works well (keep)
- 3D universe with sun, planets, moons, starfield ✓
- Millennium Falcon model with interior/cockpit ✓
- Orbital mechanics and moon data from resume ✓
- Physics engine (RAPIER) wired and stepping ✓
- Steering controller (YUKA ArriveBehavior) ✓
- Camera follow rig for exterior/interior ✓
- Manual flight mode ✓
- Autopilot navigation to moons ✓

### What needs replacing (UI)
- `SpaceshipHUDClean.tsx` — 2,100 lines, 7+ panels, resize handles, portals everywhere
- `SpaceshipHUDClean.scss` — Complex layout styles for all those panels
- Top bar (name/title/time) — persistent, clutters the view
- Right panel (content/tour) — persistent, blocks the universe
- Footer (3 log panels) — persistent, takes up space
- Ship Controls panel — too many exposed options at once
- Cosmos Options / Debug panels — developer-facing, not visitor-facing

### Physics refactor status
| Step | Description | Status |
|------|-------------|--------|
| 1 | Install RAPIER | ✅ Done |
| 2 | YUKA steering | ✅ Done |
| 3 | Physics travel anchor | ✅ Done |
| 4 | Camera follow rig | ✅ Done |
| 5 | Replace travel entry points | ❌ Not started |
| 6 | Cleanup & tuning | ❌ Not started |
| 7 | Physics orbital motion | ❌ Not started |

### My assessment of the original physics plan

The plan is solid. Steps 1–4 are well-implemented. My suggestions:

- **Step 5** is critical — replace `CosmicNavigation.flyTo()` calls with steering-based travel.
- **Step 6** should focus on removing dead GSAP travel code and tuning arrival feel.
- **Step 7** (physics-based orbits) is **high risk, low reward**. Parametric orbits are stable, cheap, and art-directable. I recommend we **skip Step 7** unless there's a specific gameplay reason for physics orbits. We can revisit later.

---

## Architecture: New Minimal Game UI

### Design Inspirations

| Source | What we borrow |
|--------|---------------|
| **World of Warcraft** | Dialogue frame styling (ornate borders, warm tones). Accept/Decline button patterns. **Layer 3 only:** quest markers (`!`/`?`) above moons, objective tracker, achievement unlocks — these are easter eggs for explorers, not the main experience. |
| **Elite Dangerous** | Translucent orange/blue HUD. Minimal flight instruments. Clean speed/target readouts. |
| **No Man's Sky** | Discovery prompts. Contextual interaction labels. Minimalist scanning UI. |
| **Destiny (Ghost)** | AI companion that speaks contextually. Small icon that expands into dialogue. Personality without being annoying. |
| **Star Citizen** | Glass-morphism panels. Inner thought / dialogue system. mobiGlas as a togglable interface. |

### Design Philosophy: The Onion

The experience has layers. Each layer is self-contained — a visitor can stop at any layer and still have a complete, satisfying experience. Deeper layers reward curiosity, never punish indifference.

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  Layer 0 — THE UNIVERSE                                       │
│  Just beautiful. Stars, planets, moons, a ship.               │
│  Zero UI. A visitor can simply look around and leave          │
│  impressed by the craft.                                      │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │  Layer 1 — CONTEXTUAL INTERACTION                         │ │
│  │  ARIA greets you. Hover a moon → name appears.            │ │
│  │  Click it → resume content. V key → view toggle.          │ │
│  │  30-second visit? You still learned something.            │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │                                                       │ │ │
│  │  │  Layer 2 — GUIDED EXPLORATION                         │ │ │
│  │  │  Ask ARIA for a tour. She flies you around.            │ │ │
│  │  │  Board the ship. Try the cockpit.                      │ │ │
│  │  │  Use the radial nav to jump between planets.           │ │ │
│  │  │  Engage at your own pace. No pressure.                 │ │ │
│  │  │                                                       │ │ │
│  │  │  ┌─────────────────────────────────────────────────┐ │ │ │
│  │  │  │                                                   │ │ │ │
│  │  │  │  Layer 3 — DISCOVERY (Easter Eggs)                │ │ │ │
│  │  │  │  Hidden achievements. Secret locations.            │ │ │ │
│  │  │  │  "Explorer mode" with optional objectives.         │ │ │ │
│  │  │  │  WoW-style quest markers & tracker — but          │ │ │ │
│  │  │  │  ONLY if you opt in or stumble upon them.          │ │ │ │
│  │  │  │  Rewards curiosity. Never required.                │ │ │ │
│  │  │  │                                                   │ │ │ │
│  │  │  └─────────────────────────────────────────────────┘ │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**The main flow is Layers 0–1.** A visitor who spends 30 seconds should still find it beautiful and informative. Layer 2 is for engaged visitors. Layer 3 is for explorers who want to find everything — it's opt-in, hidden by default, and feels like a secret you discovered, not a task you were assigned.

### UI Components (replacing SpaceshipHUDClean)

| Component | Trigger | Position | Purpose |
|-----------|---------|----------|---------|
| **ViewToggle** | `V` key or small button | Bottom-left | Switch 3rd person ↔ 1st person |
| **ContextPrompt** | Proximity / hover | Near object | "Click to explore", "Press E to board" |
| **FlightHUD** | When following ship | Bottom-right | Speed, target name, distance — minimal |
| **AriaDialogue** | Contextual triggers | Bottom-left bubble | Ship AI companion — narrates, offers choices, delivers resume content |
| **QuickNav** | `N` key or compass icon | Center radial | Radial menu for jump-to destinations (also reachable via ARIA) |
| **HelpOverlay** | `?` or `H` key | Center | Keyboard shortcuts, brief instructions |
| **IdentityBadge** | Always (tiny) | Top-left | Name only, expands on hover to show title/contact |
| **DevConsole** | `~` key (tilde) | Bottom | For developers: logs, options — hidden by default |

### What's NOT in the new UI
- No persistent side panels
- No resize handles
- No always-visible logs
- No always-visible ship controls (contextual only)
- No tour controls (replaced by ARIA dialogue-driven touring)

---

## In-Universe Dialogue System: ARIA

### Concept

**ARIA** (Adaptive Resume Intelligence Assistant) is the ship's AI companion. She lives as a small avatar/icon near the bottom of the screen and communicates via chat bubbles — like an NPC in a game. She is the primary way visitors discover resume content.

### How it feels

```
┌─────────────────────────────────────────────────────┐
│                                                       │
│            [3D Universe — ship approaching moon]       │
│                                                       │
│                                                       │
│                    ┌──────────────────────────────┐   │
│                    │ "That moon ahead is where     │   │
│                    │  Harma built microservices    │   │
│                    │  at scale. Want to take       │   │
│                    │  a closer look?"              │   │
│                    └──────────────┬───────────────┘   │
│                                   │                    │
│     ┌──────────────┐  ┌──────────┴─────┐             │
│     │ Sure, let's  │  │ What else is   │             │
│     │ check it out │  │ nearby?        │             │
│     └──────────────┘  └────────────────┘             │
│                                                       │
│   [ARIA ◉]                          Speed: 340       │
└─────────────────────────────────────────────────────┘
```

### Dialogue Triggers

| Trigger | ARIA says | Choices offered |
|---------|-----------|-----------------|
| **First visit** | "Welcome, Captain! I'm ARIA, your ship's navigator. Ready to explore Harma's universe?" | `[Give me a tour]` `[I'll explore freely]` `[Who is Harma?]` |
| **Approaching a moon** | "That's [Moon Name] — [one-line teaser from resume data]." | `[Tell me more]` `[Fly closer]` `[Skip it]` |
| **Arriving at a moon** | "[Detailed resume content, delivered conversationally]" | `[What's next?]` `[Take me to related experience]` `[Back to exploring]` |
| **Idle for 10+ seconds** | "Need a hand, Captain? I can suggest some highlights." | `[Show highlights]` `[I'm good]` |
| **Entering the ship** | "Welcome aboard! Try the cockpit — the view is incredible." | `[Go to cockpit]` `[Stay in cabin]` |
| **Fast travel (autopilot)** | "Setting course for [destination]. ETA [time]." | (no choices — informational) |
| **Manual flight** | "Nice flying, Captain. Watch out for that asteroid field." | (flavor text — no choices needed) |

### Dialogue Data Structure

Dialogues are data-driven, defined in a JSON/TS file. Each node has:

```typescript
interface DialogueNode {
  id: string;
  speaker: "aria" | "system";       // who's talking
  text: string;                       // what they say (supports template vars)
  choices?: DialogueChoice[];         // clickable response options
  autoAdvance?: number;               // auto-dismiss after N seconds
  trigger?: DialogueTrigger;          // what causes this to appear
  condition?: string;                 // e.g. "!hasVisitedMoon('aws')"
}

interface DialogueChoice {
  label: string;                      // button text
  action: DialogueAction;            // what happens on click
  next?: string;                      // next dialogue node ID
}

type DialogueAction =
  | { type: "navigate"; target: string }        // fly to destination
  | { type: "showContent"; contentId: string }  // expand resume details
  | { type: "dialogue"; nodeId: string }        // go to another dialogue
  | { type: "dismiss" }                          // close the bubble
  | { type: "tour"; tourId: string }            // start a guided tour
  | { type: "viewChange"; view: "cockpit" | "cabin" | "exterior" };
```

### Why this is powerful

- **Replaces the old tour system** — ARIA's dialogue IS the tour, but feels conversational, not scripted.
- **Replaces content cards** — Resume data is delivered through ARIA's speech, not static panels.
- **Replaces the nav drawer** — "Where should we go?" with choices IS navigation.
- **Makes the site memorable** — A talking ship AI is a story, not just a portfolio.
- **Extensible** — Add new dialogue nodes without changing code. Could even plug in an LLM later for free-form conversation.

### Visual Design

- **ARIA icon**: Small glowing circle/avatar, bottom-left, always subtle
- **Chat bubble**: Distinct bordered panel with subtle inner glow — inspired by WoW dialogue frames but sci-fi. Not a plain rounded rectangle.
- **Choice buttons**: Tactile, with hover glow. Arranged horizontally for quick choices, vertically when there are 3+ options.
- **Typing indicator**: Three-dot animation before text appears (feels alive)
- **Auto-dismiss**: Informational messages fade after a few seconds
- **History**: Optional — press `↑` to scroll through recent messages (hidden by default)

**Layer 3 only (Discovery easter eggs — not shown by default):**
- **3D quest markers**: `!` above undiscovered moons, `?` above explored ones. Only appear after the visitor activates "Explorer Mode" (a hidden ARIA dialogue option or a secret key combo).
- **Objective tracker**: Top-right, minimal. "Explored 3/7 sectors." Only visible in Explorer Mode.
- **Achievements**: Subtle unlock toast when discovering hidden things. "First Flight", "Cockpit Commander", "Deep Space Explorer". Stored in localStorage.

---

## Universe Inhabitants: 3D Models, Collectibles & The TARDIS Museum

### Philosophy

The universe shouldn't feel empty. It should feel *lived in*. Scattered throughout are objects that tell a story — some obvious, some hidden. They reflect Harma's personality, interests, and work. Some orbit moons (visible only when close). Some float in deep space (rewards for the curious). The crown jewel: a TARDIS that's bigger on the inside, containing a portfolio museum.

### Technical Approach: Model Loading

All models are loaded on-demand using `GLTFLoader`, with **distance-based LOD** (Level of Detail):

```typescript
// Models only load/render when the camera is within range
interface UniverseObject {
  id: string;
  modelPath: string;               // path to .glb file
  position: THREE.Vector3;         // world position OR relative to a moon
  parentMoon?: string;             // if set, orbits this moon
  orbitRadius?: number;            // orbit distance from parent
  orbitSpeed?: number;             // radians per second
  loadDistance: number;             // camera distance to trigger load
  renderDistance: number;           // camera distance to show/hide
  scale: number;
  interactable?: boolean;          // can the user click/enter this?
  interactionType?: "enter" | "info" | "link";
  onInteract?: string;             // dialogue node ID or action
}
```

Models are lazy-loaded: when the camera comes within `loadDistance`, the `.glb` is fetched and cached. When within `renderDistance`, it's added to the scene. When far away, it's removed (but stays cached). This keeps performance tight.

### The Models

| Model | Where | Layer | Purpose | Source suggestion |
|-------|-------|-------|---------|-------------------|
| **TARDIS** (Doctor Who phone booth) | Deep space, between two planets | Layer 2 | Portfolio museum entrance. ARIA hints at it: "There's something strange floating out there..." | Sketchfab — many free TARDIS .glb models available |
| **Tintin Rocket** (Destination Moon) | Orbiting the "skills" planet | Layer 2–3 | Childhood inspiration. Click for ARIA dialogue about growing up reading Tintin | Sketchfab — "Tintin rocket" or "Destination Moon rocket" |
| **1996 Ford Bronco Eddie Bauer** | Hidden on the dark side of a moon | Layer 3 | Personal easter egg. ARIA: "Is that... a truck? In space?" | Sketchfab — search "Ford Bronco" / "SUV" |
| **1979 Ford Bronco** | Near the Bronco '96, like a father-son pair | Layer 3 | Deeper easter egg. Both Broncos floating together. | Sketchfab — vintage SUV/truck models |
| **Fist of the North Star figure** | Orbiting the education moon | Layer 3 | Personal touch. Maybe Kenshiro in a fighting pose. | Sketchfab — anime figure models |
| **Small satellite dishes / probes** | Orbiting various moons | Layer 1 | Visual richness. These are generic "tech" objects that make moons feel alive | Can be procedurally generated (simple geometry) or small .glb |
| **Floating code fragments** | Near tech-related moons | Layer 1 | `<div>`, `{ }`, `=>` — small glowing text sprites that orbit moons. Subtle, decorative. | Generated with `TextGeometry` or sprite textures |
| **Asteroids / space debris** | Scattered in belts between planets | Layer 0 | Visual richness for the universe. Not interactive. | Procedural (displaced icosahedrons) or simple .glb |

### Moon Orbiters (Visible When Close)

Each resume moon can have small objects orbiting it — they only load/render when the camera is nearby. This makes moons feel like rich destinations, not just spheres.

```
Moon: "InvestCloud"
├── Orbiter: small Angular logo sprite
├── Orbiter: small React logo sprite
├── Orbiter: floating code fragment "{ }"
└── Orbiter: miniature satellite dish

Moon: "Education"
├── Orbiter: tiny graduation cap model
├── Orbiter: Fist of the North Star figure (Layer 3 easter egg)
└── Orbiter: floating book model
```

These are defined in data, not hardcoded:

```typescript
interface MoonOrbiter {
  moonId: string;            // which moon this orbits
  type: "model" | "sprite" | "text";
  asset: string;             // model path, sprite texture, or text content
  orbitRadius: number;
  orbitSpeed: number;
  scale: number;
  layer: 1 | 2 | 3;         // visibility layer (Layer 3 = easter egg only)
}
```

### The TARDIS Portfolio Museum

This is the crown jewel — a Doctor Who TARDIS floating in space. When the visitor approaches it, ARIA says something like:

> "Captain, my sensors are picking up a... police box? In deep space? That can't be right."
> `[Investigate]` `[Ignore it]`

When they enter, the interior is **bigger on the inside** — a museum-like room (or hallway of rooms) with:

#### Museum Layout

```
┌─────────────────────────────────────────────────┐
│                                                   │
│   TARDIS INTERIOR — "Portfolio Gallery"            │
│                                                   │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐         │
│   │ Painting │  │ Painting │  │ Painting │         │
│   │ (proj 1) │  │ (proj 2) │  │ (proj 3) │         │
│   │ screenshot│  │ screenshot│  │ screenshot│        │
│   └─────────┘  └─────────┘  └─────────┘         │
│       ↑              ↑             ↑              │
│    Click for      Click for    Click for          │
│    details        video        details             │
│                                                   │
│   ┌──────────────────────────────────┐            │
│   │         VIDEO SCREEN             │            │
│   │    (YouTube embed in 3D)         │            │
│   │    Rotatable — view from         │            │
│   │    any angle                     │            │
│   └──────────────────────────────────┘            │
│                                                   │
│   [Exit TARDIS]                                   │
└─────────────────────────────────────────────────┘
```

#### Technical Implementation

**The room**: A simple box geometry (or a small interior .glb model) placed far from the main solar system (e.g., at position `(10000, 0, 0)`). When the user "enters" the TARDIS, the camera teleports here with a transition effect (blue flash + whooshing sound).

**Paintings (project screenshots)**: `PlaneGeometry` with `TextureLoader` loading screenshot images. Each painting has:
```typescript
interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  screenshot: string;           // path to image
  videoUrl?: string;            // optional YouTube URL
  liveUrl?: string;             // optional link to live project
  tags: string[];
}
```

**YouTube videos in 3D** — **Yes, this is fully possible!** Two approaches:

1. **CSS3DRenderer** (recommended for YouTube): Embeds an actual `<iframe>` into 3D space using Three.js's `CSS3DRenderer`. The iframe is a real DOM element positioned in 3D — it's interactive, plays video, has controls. The visitor can walk around it and see it from different angles (it's a flat plane in 3D space, like a TV screen mounted on a wall). This is the approach used by the official Three.js CSS3D YouTube example.

2. **VideoTexture** (for self-hosted video): Maps an HTML5 `<video>` element onto a `MeshBasicMaterial` texture. The video plays on any 3D surface — a screen, a curved wall, even a sphere. This requires hosting the video file directly (not YouTube), but gives full 3D integration.

**Recommendation**: Use CSS3DRenderer for YouTube embeds (real iframe, full YouTube player controls, no hosting needed). Place them as "screens" on the museum walls. The visitor walks up, sees the video playing, and can interact with it. Use a `CSS2DRenderer` label below each screen showing the project name.

**Entering/Exiting**: Same pattern as the ship interior:
- Approaching the TARDIS triggers ARIA dialogue
- Clicking "Enter" teleports camera to the museum interior (position 10000, 0, 0)
- Camera is free-look (same first-person system as ship interior)
- "Exit TARDIS" prompt returns to the exterior universe
- A blue flash transition effect sells the teleportation

### Portfolio Data Structure

All portfolio items are data-driven:

```typescript
// src/data/portfolio.ts
export const portfolioItems: PortfolioItem[] = [
  {
    id: "automation-platform",
    title: "Test Automation Platform",
    description: "Full-stack Angular + C# Playwright platform...",
    screenshot: "/images/portfolio/automation-platform.png",
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID",
    tags: ["Angular", "C#", "Playwright", "Azure"],
  },
  {
    id: "dashboard",
    title: "React/Redux Monitoring Dashboard",
    description: "Real-time execution monitoring...",
    screenshot: "/images/portfolio/dashboard.png",
    tags: ["React", "Redux", "WebSocket"],
  },
  // ...
];
```

### Model Sourcing Notes

All models should be:
- **GLB format** (binary GLTF, smallest file size)
- **Under 5MB each** (ideally under 2MB) for fast loading
- **CC-licensed or purchased** from Sketchfab, Turbosquid, or similar
- **Optimized** with `gltf-transform` or Blender to reduce polygon count

Recommended sources:
- [Sketchfab](https://sketchfab.com) — largest free .glb library
- [Poly Pizza](https://poly.pizza) — low-poly free models
- [Turbosquid](https://turbosquid.com) — premium models if needed

---

## Styling Architecture

### Principles

The styling must be **impeccable, distinct, crisp, maintainable, and customizable**. We achieve this with:

1. **Design tokens** — All colors, sizes, spacing, and effects defined as CSS custom properties on `:root`. Change the theme by changing tokens.
2. **Component-scoped styles** — Each UI component gets its own `.scss` file. No style leakage. BEM-lite naming.
3. **Shared mixins** — Glass-morphism, glow effects, panel borders, button styles — defined once as SCSS mixins, used everywhere.
4. **No magic numbers** — Every spacing, size, and timing value references a token or variable.
5. **Responsive without breakpoints** — Use `clamp()`, `min()`, `max()` for fluid sizing. The 3D canvas is always fullscreen; UI elements are absolutely positioned with logical anchoring.

### Design Tokens (`src/styles/_tokens.scss`)

```scss
:root {
  // ── Color Palette ──────────────────────────────────
  // Primary: warm gold (WoW quest text / Elite HUD)
  --hud-primary:          #d4a845;
  --hud-primary-dim:      #a07830;
  --hud-primary-glow:     rgba(212, 168, 69, 0.4);

  // Secondary: cool blue (Elite instruments / sci-fi)
  --hud-secondary:        #5ba4cf;
  --hud-secondary-dim:    #3a7aaa;
  --hud-secondary-glow:   rgba(91, 164, 207, 0.3);

  // Accent: soft green (quest complete / positive)
  --hud-accent:           #5cb85c;
  --hud-accent-glow:      rgba(92, 184, 92, 0.3);

  // Danger / alert
  --hud-danger:           #cf5b5b;

  // Neutrals
  --hud-text:             #e8e0d0;       // warm off-white (parchment feel)
  --hud-text-dim:         #9a9080;
  --hud-text-bright:      #fff8ee;
  --hud-bg:               rgba(10, 8, 16, 0.75);
  --hud-bg-solid:         #0a0810;

  // ── Panel & Glass ─────────────────────────────────
  --panel-border:         rgba(212, 168, 69, 0.3);
  --panel-border-hover:   rgba(212, 168, 69, 0.6);
  --panel-blur:           12px;
  --panel-radius:         6px;
  --panel-shadow:         0 0 20px rgba(0, 0, 0, 0.6),
                          inset 0 0 30px rgba(212, 168, 69, 0.05);

  // ── Typography ────────────────────────────────────
  --font-hud:             'Rajdhani', 'Segoe UI', sans-serif;
  --font-narrative:       'Crimson Text', 'Georgia', serif;   // for ARIA dialogue
  --font-mono:            'JetBrains Mono', 'Consolas', monospace;

  --text-xs:              clamp(0.65rem, 1.2vw, 0.75rem);
  --text-sm:              clamp(0.75rem, 1.4vw, 0.875rem);
  --text-base:            clamp(0.875rem, 1.6vw, 1rem);
  --text-lg:              clamp(1rem, 2vw, 1.25rem);
  --text-xl:              clamp(1.25rem, 2.5vw, 1.5rem);

  // ── Spacing ───────────────────────────────────────
  --space-xs:             4px;
  --space-sm:             8px;
  --space-md:             16px;
  --space-lg:             24px;
  --space-xl:             32px;

  // ── Animation ─────────────────────────────────────
  --ease-appear:          cubic-bezier(0.16, 1, 0.3, 1);  // smooth overshoot
  --ease-dismiss:         cubic-bezier(0.4, 0, 1, 1);     // quick exit
  --duration-fast:        150ms;
  --duration-normal:      300ms;
  --duration-slow:        600ms;

  // ── Z-Index Layers ────────────────────────────────
  --z-hud:                100;
  --z-dialogue:           200;
  --z-overlay:            300;
  --z-modal:              400;
}
```

### Shared Mixins (`src/styles/_hud-mixins.scss`)

```scss
/// Glass-morphism panel (the core look)
@mixin glass-panel($blur: var(--panel-blur)) {
  background: var(--hud-bg);
  backdrop-filter: blur($blur);
  -webkit-backdrop-filter: blur($blur);
  border: 1px solid var(--panel-border);
  border-radius: var(--panel-radius);
  box-shadow: var(--panel-shadow);
}

/// WoW-inspired dialogue frame — ornate border with corner accents
@mixin dialogue-frame() {
  @include glass-panel(16px);
  border: 2px solid var(--hud-primary-dim);
  border-image: linear-gradient(
    135deg,
    var(--hud-primary) 0%,
    var(--hud-primary-dim) 40%,
    transparent 60%,
    var(--hud-primary-dim) 80%,
    var(--hud-primary) 100%
  ) 1;
  box-shadow: var(--panel-shadow),
              0 0 15px var(--hud-primary-glow);
  position: relative;

  // Corner ornaments (pseudo-elements)
  &::before, &::after {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
    border: 2px solid var(--hud-primary);
  }
  &::before { top: -2px; left: -2px; border-right: none; border-bottom: none; }
  &::after  { bottom: -2px; right: -2px; border-left: none; border-top: none; }
}

/// HUD button — tactile, glowing on hover
@mixin hud-button($variant: 'primary') {
  @if $variant == 'primary' {
    background: linear-gradient(180deg, rgba(212, 168, 69, 0.2), rgba(212, 168, 69, 0.05));
    border: 1px solid var(--hud-primary-dim);
    color: var(--hud-primary);
  } @else if $variant == 'accept' {
    background: linear-gradient(180deg, rgba(92, 184, 92, 0.2), rgba(92, 184, 92, 0.05));
    border: 1px solid var(--hud-accent);
    color: var(--hud-accent);
  } @else if $variant == 'decline' {
    background: linear-gradient(180deg, rgba(207, 91, 91, 0.15), transparent);
    border: 1px solid rgba(207, 91, 91, 0.4);
    color: var(--hud-danger);
  }

  font-family: var(--font-hud);
  font-size: var(--text-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: var(--space-sm) var(--space-lg);
  border-radius: 3px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-appear);
  user-select: none;

  &:hover {
    filter: brightness(1.3);
    box-shadow: 0 0 12px var(--hud-primary-glow);
  }

  &:active {
    transform: scale(0.97);
    filter: brightness(0.9);
  }
}

/// Glow pulse animation (for markers, icons)
@mixin glow-pulse($color: var(--hud-primary-glow), $duration: 2s) {
  animation: glow-pulse-anim $duration ease-in-out infinite;
  @keyframes glow-pulse-anim {
    0%, 100% { box-shadow: 0 0 6px $color; }
    50%      { box-shadow: 0 0 18px $color, 0 0 30px $color; }
  }
}

/// Fade-in entrance
@mixin fade-in($duration: var(--duration-normal), $delay: 0ms) {
  animation: fade-in-anim $duration var(--ease-appear) $delay both;
  @keyframes fade-in-anim {
    from { opacity: 0; transform: translateY(8px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
}

/// Typing dots animation (for ARIA thinking state)
@mixin typing-dots() {
  display: inline-flex;
  gap: 4px;
  span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--hud-primary);
    animation: typing-bounce 1.2s ease-in-out infinite;
    &:nth-child(2) { animation-delay: 0.15s; }
    &:nth-child(3) { animation-delay: 0.3s; }
  }
  @keyframes typing-bounce {
    0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
    30%           { opacity: 1; transform: translateY(-4px); }
  }
}
```

### Component Style Pattern

Every UI component follows this pattern:

```scss
// src/components/ui/AriaDialogue.scss
@use '../../styles/tokens';       // design tokens
@use '../../styles/hud-mixins';   // shared mixins

.aria {
  position: fixed;
  bottom: var(--space-lg);
  left: var(--space-lg);
  z-index: var(--z-dialogue);

  &__icon { /* ... */ }

  &__bubble {
    @include hud-mixins.dialogue-frame();
    font-family: var(--font-narrative);
    /* ... */
  }

  &__choices {
    display: flex;
    gap: var(--space-sm);
  }

  &__choice {
    @include hud-mixins.hud-button('primary');

    &--accept { @include hud-mixins.hud-button('accept'); }
    &--decline { @include hud-mixins.hud-button('decline'); }
  }
}
```

### Font Loading

We load two Google Fonts (added in `index.html`):
- **Rajdhani** — angular, techy, perfect for HUD labels and buttons
- **Crimson Text** — elegant serif, gives ARIA's dialogue a narrative quality (like WoW quest text)
- **JetBrains Mono** — for dev console and technical readouts

### Theming

Because everything uses CSS custom properties, a "theme" is just a class that overrides tokens:

```scss
// Future: alternative themes
.theme-imperial { --hud-primary: #ff4444; --hud-text: #ffcccc; }
.theme-rebel    { --hud-primary: #44aaff; --hud-text: #cceeff; }
.theme-bounty   { --hud-primary: #44ff88; --hud-text: #ccffee; }
```

---

## Implementation Phases

### Phase 0: Backup, Scaffolding & Styling Foundation
**Goal:** Back up current UI, establish the design system, create new minimal UI shell, keep app running.

- [ ] **0.1** Create `src/components/_backup/` directory
- [ ] **0.2** Copy `SpaceshipHUDClean.tsx` → `_backup/SpaceshipHUDClean.backup.tsx`
- [ ] **0.3** Copy `SpaceshipHUDClean.scss` → `_backup/SpaceshipHUDClean.backup.scss`
- [ ] **0.4** Copy `SpaceshipHUD.tsx` (re-export) → `_backup/SpaceshipHUD.backup.tsx`
- [ ] **0.5** Create `src/styles/_tokens.scss` — design tokens (colors, typography, spacing, z-index, animation)
- [ ] **0.6** Create `src/styles/_hud-mixins.scss` — shared mixins (glass-panel, dialogue-frame, hud-button, glow-pulse, fade-in, typing-dots)
- [ ] **0.7** Add Google Fonts (`Rajdhani`, `Crimson Text`) to `index.html`
- [ ] **0.8** Create `src/components/ui/` directory
- [ ] **0.9** Create new `src/components/ui/SpaceshipHUD.tsx` — stub that accepts same props but renders just a transparent overlay container
- [ ] **0.10** Create `src/components/ui/SpaceshipHUD.scss` — minimal base styles using new tokens
- [ ] **0.11** Update import in `ResumeSpace3D.tsx` to point to new `ui/SpaceshipHUD.tsx`
- [ ] **0.12** Verify build passes and 3D scene loads

**Test checkpoint:** App loads, universe renders, no UI panels visible. Ship follow and navigation still work via keyboard/mouse. New fonts load. Styling foundation is in place for all subsequent phases.

---

### Phase 1: Identity Badge + View Toggle
**Goal:** First two minimal UI elements.

- [ ] **1.1** Add `IdentityBadge` — tiny top-left name, expands on hover to show title + links
- [ ] **1.2** Add `ViewToggle` — bottom-left button + `V` hotkey to cycle: 3rd person → 1st person (cabin) → cockpit → 3rd person
- [ ] **1.3** Wire view toggle to existing `onGoToCockpit`, `onGoToInterior`, `onExitShip` handlers
- [ ] **1.4** Style with translucent glass-morphism (blur backdrop, subtle border)

**Test checkpoint:** Name badge visible. V key cycles through views correctly. Camera stays inside ship in 1st person.

---

### Phase 2: Contextual Prompts + Ship Boarding
**Goal:** Replace the "ENTER SHIP" / "EXIT SHIP" buttons with game-style contextual prompts.

- [ ] **2.1** Add proximity detection: when camera is near the ship and NOT following, show "Press F to board ship" prompt
- [ ] **2.2** When inside the ship, show "Press F to exit" prompt (small, bottom-center)
- [ ] **2.3** When hovering over a moon, show "Click to explore [Moon Name]"
- [ ] **2.4** Implement the `F` key handler for board/exit
- [ ] **2.5** Fade prompts in/out with CSS transitions (no GSAP needed)

**Test checkpoint:** Can board/exit ship with F key. Moon hover shows name. No buttons needed.

---

### Phase 3: Flight HUD
**Goal:** Minimal speed/target indicator when piloting the ship.

- [ ] **3.1** Create `FlightHUD` component — only visible when following the ship
- [ ] **3.2** Show: current speed (bar + number), target name, distance to target, ETA
- [ ] **3.3** Show flight mode indicator: "AUTOPILOT" or "MANUAL"
- [ ] **3.4** Position bottom-right, translucent, compact
- [ ] **3.5** In manual mode, show minimal control hint: "WASD to fly, Shift for boost"

**Test checkpoint:** Follow ship → see speed/target. Stop following → HUD disappears. Manual flight shows controls hint.

---

### Phase 4: Quick Navigation (Radial Menu)
**Goal:** Replace the nav drawer with a radial/wheel menu.

- [ ] **4.1** Create `QuickNav` radial menu — triggered by `N` key or compass button
- [ ] **4.2** Show destinations as icons around a circle: Sun (Home), planets, key moons
- [ ] **4.3** Click a destination → autopilot navigates there (ship travels, camera follows)
- [ ] **4.4** If not following ship, clicking a destination does a camera fly-to
- [ ] **4.5** Close menu on selection or `Esc`
- [ ] **4.6** Animate open/close with CSS scale+opacity

**Test checkpoint:** N key opens radial menu. Selecting a moon triggers ship navigation. Menu closes after selection.

---

### Phase 5: ARIA Dialogue System — Foundation
**Goal:** Build the dialogue engine and ARIA's visual presence.

- [ ] **5.1** Create `src/data/aria-dialogues.ts` — dialogue tree data (welcome, idle, approach triggers)
- [ ] **5.2** Create `src/components/ui/AriaDialogue.tsx` — renders chat bubble + choice buttons
- [ ] **5.3** Create `src/components/ui/useDialogueEngine.ts` — hook that manages dialogue state, history, triggers, conditions
- [ ] **5.4** Add ARIA icon (glowing circle, bottom-left) with typing indicator animation
- [ ] **5.5** Implement **welcome dialogue** on first visit: greeting + 3 choices
- [ ] **5.6** Implement **idle trigger**: if no interaction for 10s, ARIA offers help
- [ ] **5.7** Wire choice actions: `navigate`, `dismiss`, `viewChange` action types
- [ ] **5.8** Glass-morphism chat bubble styling, pill-shaped choice buttons

**Test checkpoint:** Page loads → ARIA greets visitor. Choices are clickable. "Give me a tour" triggers navigation. Idle timeout works. Bubble auto-dismisses informational messages.

---

### Phase 6: ARIA Dialogue — Resume Content Integration
**Goal:** Replace static content cards with ARIA delivering resume data conversationally.

- [ ] **6.1** Add **proximity trigger** dialogues: ARIA comments when ship approaches a moon
- [ ] **6.2** Add **arrival dialogues**: detailed resume content delivered as ARIA's speech when arriving at a moon
- [ ] **6.3** Wire `showContent` action type — expands a detail panel below the chat bubble for longer content (job descriptions, skill lists)
- [ ] **6.4** Add **follow-up choices** after content: "What's next?", "Related experience?", "Back to exploring"
- [ ] **6.5** Create dialogue nodes for each resume section (experience, skills, education, certifications)
- [ ] **6.6** Template variable support: `"Harma spent {{duration}} building {{tech}} here."` populated from resume.json
- [ ] **6.7** Track visited moons in state (localStorage) — this data feeds the discovery layer later, but has no visible UI yet

**Test checkpoint:** Fly to each moon → ARIA narrates the content. Choices lead to related destinations. Resume data is accurate and conversational.

---

### Phase 7: Physics Refactor — Step 5 (Replace Travel Entry Points)
**Goal:** All navigation uses physics+steering instead of GSAP flyTo.

- [ ] **7.1** Audit all `cameraDirectorRef.current.flyTo()` and `cameraDirectorRef.current.systemOverview()` calls
- [ ] **7.2** Replace moon focus travel with steering-based approach
- [ ] **7.3** Replace planet navigation with steering-based approach
- [ ] **7.4** Replace intro sequence camera travel
- [ ] **7.5** Ensure `CosmicNavigation.flyTo()` is no longer called for ship/camera travel

**Test checkpoint:** Navigate to every moon and planet. Camera/ship travels smoothly via physics. No GSAP tween artifacts.

---

### Phase 8: Physics Refactor — Step 6 (Cleanup & Tuning)
**Goal:** Remove dead GSAP travel code, tune physics feel.

- [ ] **8.1** Remove unused GSAP travel methods from `CosmicNavigation.ts` (keep scroll/UI animations)
- [ ] **8.2** Tune arrival behavior: deceleration curve, final settling, overshoot prevention
- [ ] **8.3** Tune camera follow: damping, offset, rotation smoothness
- [ ] **8.4** Add subtle screen-shake or velocity blur on fast travel (optional polish)
- [ ] **8.5** Performance pass: verify 60fps on target hardware

**Test checkpoint:** No GSAP imports in navigation code. Ship arrives smoothly at all destinations. Stable 60fps.

---

### Phase 9: Help Overlay + Dev Console
**Goal:** Final utility UI for Layers 1–2.

- [ ] **9.1** Create `HelpOverlay` — shown on `?` or `H` key — lists keyboard shortcuts and brief instructions
- [ ] **9.2** Create `DevConsole` — shown on `~` key — contains universe logs, debug toggles, cosmos options
- [ ] **9.3** Move all developer/debug options into DevConsole (out of sight for visitors)
- [ ] **9.4** Add first-visit welcome tooltip: "Press ? for help" — auto-dismiss after 5 seconds

**Test checkpoint:** ? shows help. ~ shows dev console. First-time visitor sees welcome hint.

---

### Phase 10: Discovery Layer (Easter Eggs — Layer 3)
**Goal:** Reward curious explorers with hidden depth. None of this is required or shown by default.

- [ ] **10.1** Add **Explorer Mode** activation — hidden ARIA dialogue choice ("I want to find everything") or secret key combo (e.g., Konami code) that unlocks Layer 3
- [ ] **10.2** Add **ObjectiveTracker** component — top-right, minimal — "Explored 3/7 sectors". Only visible when Explorer Mode is active
- [ ] **10.3** Add **3D quest markers** — subtle `!` above undiscovered moons, `?` above explored ones. Only visible in Explorer Mode. Gentle pulse, not garish
- [ ] **10.4** Add **Achievement toasts** — small, beautiful notifications that slide in when discovering something: "First Flight", "Cockpit Commander", "Cartographer" (visited all moons), "Speed Demon" (used turbo boost). Stored in localStorage
- [ ] **10.5** Add **hidden locations** — a secret moon or asteroid with a personal message, a wormhole that takes you somewhere unexpected, a hidden message in the ship's cabin
- [ ] **10.6** Add **Captain's Log** — accessible from ship interior, shows all achievements and discovered content. Feels like a journal, not a checklist
- [ ] **10.7** ARIA acknowledges discoveries: "You found the hidden nebula! Not many visitors make it this far."

**Test checkpoint:** Explorer Mode activates from hidden trigger. Quest markers appear on moons. Achievements fire on milestones. Captain's Log shows progress. None of this interferes with the Layer 0–2 experience.

**Note:** This phase is medium-low priority. It's delight and discovery. The experience is complete without it, but it adds a memorable layer.

---

### Phase 11: Universe Inhabitants (3D Models & Moon Orbiters)
**Goal:** Populate the universe with objects that make it feel alive and personal.

- [ ] **11.1** Create `src/components/cosmos/UniverseObjects.ts` — data-driven system for placing and managing 3D objects with distance-based loading/unloading
- [ ] **11.2** Add **moon orbiters** — small objects (sprites, simple geometry) that orbit individual moons. Only visible when camera is nearby. Tech logos near tech moons, decorative objects near others.
- [ ] **11.3** Add **asteroid belt** — procedural asteroids (displaced icosahedrons) between planet orbits for visual richness
- [ ] **11.4** Add **floating code fragments** — `TextGeometry` or sprite-based `{ }`, `=>`, `<div>` glowing text orbiting tech moons
- [ ] **11.5** Source and add **TARDIS model** (.glb) — placed in deep space between two planets. ARIA hints at its existence when nearby.
- [ ] **11.6** Source and add **Tintin rocket** (.glb) — orbiting a planet, visible from a distance. ARIA: "Is that a moon rocket from the 1950s?"
- [ ] **11.7** Source and add **personal easter egg models** (Broncos, anime figures) — hidden in remote locations. Layer 3 only.
- [ ] **11.8** Implement `loadDistance` / `renderDistance` LOD system — models load when camera approaches, unload when far

**Test checkpoint:** Moons have orbiting objects visible when close. Asteroid belt adds depth. TARDIS is findable in space. Tintin rocket orbits. Performance stays smooth (models load/unload based on distance).

---

### Phase 12: TARDIS Portfolio Museum
**Goal:** A "bigger on the inside" Doctor Who TARDIS that serves as an interactive portfolio gallery.

- [ ] **12.1** Create TARDIS exterior interaction — approach triggers ARIA dialogue, "Enter" teleports camera to museum interior
- [ ] **12.2** Build museum interior — simple room geometry (or .glb) placed at far coordinates (10000, 0, 0), with gallery walls
- [ ] **12.3** Create `src/data/portfolio.ts` — data file for portfolio items (title, description, screenshot path, optional YouTube URL, tags)
- [ ] **12.4** Add **paintings** — `PlaneGeometry` with `TextureLoader` screenshots mounted on gallery walls. Click to see details (ARIA narrates).
- [ ] **12.5** Add **YouTube video screens** — `CSS3DRenderer` embeds real YouTube iframes as 3D-positioned screens in the museum. Visitors can walk around and view from different angles. Full playback controls.
- [ ] **12.6** Add **project labels** — CSS2D labels below each painting/screen showing project name and tech tags
- [ ] **12.7** Implement **enter/exit transitions** — blue flash effect + whoosh sound when entering/exiting TARDIS. Camera teleports with first-person look-around inside.
- [ ] **12.8** ARIA museum dialogue — narrates projects as visitor looks at them: "This dashboard monitors real-time test execution across global teams."
- [ ] **12.9** Add **exit prompt** — "Press F to exit" returns to universe, camera back at TARDIS exterior

**Test checkpoint:** Can find and enter the TARDIS. Museum interior has paintings with project screenshots. YouTube videos play in 3D. Can walk around and view from angles. Exit returns to universe. Performance acceptable.

**Note:** This is a showpiece feature. It will impress visitors who find it, but the main resume content is still delivered through the primary moon/ARIA flow.

---

## File Structure (New)

```
src/
├── components/
│   ├── _backup/                          # Backed-up old UI
│   │   ├── SpaceshipHUDClean.backup.tsx
│   │   ├── SpaceshipHUDClean.backup.scss
│   │   └── SpaceshipHUD.backup.tsx
│   ├── ui/                               # New minimal game UI
│   │   ├── SpaceshipHUD.tsx              # New shell (composes sub-components)
│   │   ├── SpaceshipHUD.scss             # Minimal styles
│   │   ├── IdentityBadge.tsx
│   │   ├── ViewToggle.tsx
│   │   ├── ContextPrompt.tsx
│   │   ├── FlightHUD.tsx
│   │   ├── QuickNav.tsx
│   │   ├── AriaDialogue.tsx              # Chat bubble + choices UI
│   │   ├── useDialogueEngine.ts          # Dialogue state machine + trigger logic
│   │   ├── HelpOverlay.tsx
│   │   ├── DevConsole.tsx
│   │   ├── discovery/                    # Layer 3 — Easter eggs (opt-in)
│   │   │   ├── ObjectiveTracker.tsx
│   │   │   ├── QuestMarkers.tsx
│   │   │   ├── AchievementToast.tsx
│   │   │   └── CaptainsLog.tsx
│   │   └── useExplorerMode.ts
├── cosmos/                           # (unchanged — 3D engine)
│   ├── ResumeSpace3D.tsx
│   ├── cosmos/                           # 3D engine (existing, extended)
│   │   ├── ResumeSpace3D.tsx
│   │   ├── hooks/
│   │   ├── UniverseObjects.ts            # NEW — distance-based model manager
│   │   ├── TardisMuseum.ts               # NEW — museum interior + portfolio gallery
│   │   └── ...
├── data/
│   ├── resume.json                       # existing
│   ├── aria-dialogues.ts                 # NEW — dialogue tree
│   ├── portfolio.ts                      # NEW — project screenshots + video URLs
│   └── universe-objects.ts               # NEW — model placement data
├── styles/
│   ├── _tokens.scss                      # NEW — design tokens
│   ├── _hud-mixins.scss                  # NEW — shared UI mixins
│   └── ...
└── ...

public/
├── models/
│   ├── spaceship/                        # existing (Millennium Falcon)
│   ├── tardis/                           # NEW — TARDIS exterior .glb
│   ├── tintin-rocket/                    # NEW — Tintin rocket .glb
│   └── collectibles/                     # NEW — Broncos, figures, etc.
└── images/
    └── portfolio/                        # NEW — project screenshots
```

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Removing HUD breaks ship controls | High | Phase 0 stub keeps same prop interface |
| Physics travel feels worse than GSAP | Medium | Keep GSAP as fallback until physics is tuned |
| ARIA dialogue feels annoying/clippy | Medium | Make all dialogue dismissible, respect "I'll explore freely" choice, don't nag. Layer 1 ARIA is minimal. |
| ARIA blocks important visuals | Low | Bubble is bottom-left, small, auto-dismisses |
| Dialogue data gets out of sync with resume.json | Medium | Template variables pull live from resume data, not hardcoded strings |
| Discovery layer feels like homework | Low | It's fully opt-in and hidden. Visitor must actively unlock it. No guilt for skipping. |
| Too many layers overwhelm development | Medium | Layers 0–1 are the MVP. Phases 0–3 deliver a complete experience. Everything else is additive. |
| Radial menu is awkward on mobile | Medium | Also support click-based list fallback |
| Step 7 (physics orbits) destabilizes | High | **Skip Step 7** — keep parametric orbits |
| Too many 3D models kills performance | High | Distance-based LOD: load on approach, unload when far. Keep models under 2MB each. Budget: max ~15 models in scene at once. |
| TARDIS museum is a large feature | Medium | It's Phase 12, fully optional. The experience is complete without it. But it's a showstopper for those who find it. |
| YouTube iframes in 3D have quirks | Medium | CSS3DRenderer is well-tested for this. Fallback: thumbnail texture that opens video in overlay on click. |
| Model licensing issues | Low | Only use CC-licensed or purchased models. Keep license.txt alongside each model. |

---

## Progress Log

| Date | Phase | Status | Notes |
|------|-------|--------|-------|
| 2026-02-07 | Planning | ✅ | Plan created and refined |
| 2026-02-07 | Phase 0 | ✅ | Backup done, tokens + mixins + fonts + stub HUD. Build passes. |
| | | | |
| | **Layers 0–1 (Core)** | | |
| | Phase 0 — Backup, Scaffolding & Styles | ✅ | |
| | Phase 1 — Identity Badge + View Toggle | ✅ | |
| | Phase 2 — Contextual Prompts + Boarding | ⬜ | |
| | Phase 3 — Flight HUD | ⬜ | |
| | | | |
| | **Layer 2 (Engaged visitors)** | | |
| | Phase 4 — Quick Navigation (Radial) | ⬜ | |
| | Phase 5 — ARIA Dialogue Foundation | ⬜ | |
| | Phase 6 — ARIA Resume Content | ⬜ | |
| | | | |
| | **Infrastructure** | | |
| | Phase 7 — Physics: Replace Travel | ⬜ | |
| | Phase 8 — Physics: Cleanup & Tuning | ⬜ | |
| | Phase 9 — Help + Dev Console | ⬜ | |
| | | | |
| | **Layer 3 (Easter eggs — optional)** | | |
| | Phase 10 — Discovery Layer | ⬜ | Easter egg system |
| | | | |
| | **Showpiece Features** | | |
| | Phase 11 — Universe Inhabitants | ⬜ | 3D models, moon orbiters |
| | Phase 12 — TARDIS Portfolio Museum | ⬜ | The crown jewel |

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Skip physics-based orbits (Step 7) | Parametric orbits are stable, performant, and art-directable. Physics orbits add complexity and instability risk with no clear UX benefit. |
| Keep GSAP for UI animations | GSAP is still used for scroll sections and micro-animations in App.tsx. Only travel/camera GSAP is being replaced. |
| Back up rather than delete old HUD | Allows referencing old implementations during rebuild. Can cherry-pick logic. |
| Glass-morphism UI style | Translucent blurred panels feel sci-fi and don't fully block the universe behind them. |
| Radial nav instead of sidebar | More game-like, doesn't persist, quick to use. |
| ARIA replaces content cards + tours | Dialogue-driven content is more engaging than static panels and more memorable than a scripted tour. One system handles narration, navigation suggestions, and content delivery. |
| ARIA is data-driven (not hardcoded) | Dialogue nodes defined in a separate file, pulling from resume.json via templates. Easy to add/modify without touching component code. |
| Name "ARIA" | Adaptive Resume Intelligence Assistant — fits the sci-fi theme, memorable, gender-neutral. Can be renamed. |
| Onion architecture (layers 0–3) | Each layer is self-contained. A 30-second visitor gets Layer 0–1. An engaged visitor finds Layer 2. Only the most curious find Layer 3. No layer depends on a deeper one. |
| WoW elements are Layer 3 only | Quest markers, objective tracker, and achievements are easter eggs — never the main experience. They reward exploration without creating obligation. |
| Phases 0–3 are the MVP | The experience is shippable after Phase 3. Everything else adds depth but isn't required. |
| Distance-based model loading | Models load when camera approaches and unload when far away. Prevents performance death from having 20+ models in scene simultaneously. |
| TARDIS as portfolio container | The TARDIS "bigger on the inside" concept perfectly frames a portfolio gallery. It's a natural fit for showing screenshots and videos. Memorable, thematic, functional. |
| CSS3DRenderer for YouTube | Real iframe embeds in 3D space. Battle-tested Three.js approach. Full YouTube player controls. No video hosting needed. |
| Personal models are Layer 3 | The Broncos, anime figures, etc. are hidden easter eggs that reflect personality without cluttering the main experience. |
| Portfolio data is separate from resume data | `portfolio.ts` is a distinct data file from `resume.json`. Projects ≠ job responsibilities. |
