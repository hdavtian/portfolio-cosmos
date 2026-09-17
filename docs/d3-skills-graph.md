# D3 Skills Graph ("Technical Expertise")

A force-directed graph of skills grouped by category, drawn with D3. It lives
in the old scrolling resume inside the cinematic experience, and is a
**candidate approach for the mainstream portfolio redesign** (the non-Three.js
site: `/resume`, `/portfolio`).

## Where to see it

1. Open `/cinematic`.
2. From the 3D hero, press **Down arrow**. This easter egg scrolls into the old
   resume sections (`src/App.tsx`, the `keydown` handler in `App`).
3. The first section, **Technical Expertise**, is the graph.

## Where the code is

| What | Where |
| --- | --- |
| The graph component | `SkillsDiagram` in `src/App.tsx` (top of the file) |
| Where it is rendered | The "Skills Section" in `App`'s JSX: `<SkillsDiagram skills={skills} />` |
| Styles (container, zoom controls) | `.skills__*` classes in `src/styles/main.scss` |
| Related D3 hero diagrams | `src/components/ResumeStructureDiagram.tsx` (circles, constellation, circuit, rings, tree, neural styles) |
| Library | `d3` ^7.9 and `@types/d3` (already dependencies) |

## Data

`SkillsDiagram` takes one prop: `skills: Record<string, string[]>`, which maps
each category name to its skill names.

Since 2026-09-16, `App` passes the **published** skills from the content
platform:

- `useResumeQuery()` (`src/lib/query/contentQueries.ts`) fetches the current
  release from API v2. `toLegacy` groups skills under their category, both in
  admin order.
- If the API is unreachable, it falls back to the bundled `src/data/resume.json`.
- Editing skills or skill categories in the admin, then publishing, updates the
  graph.

The rest of that old resume page (name, summary, jobs, education,
certifications) still reads `resume.json` directly.

## How it works

### Nodes and links

- **Centre node:** "TECH STACK", radius 50, pinned to the middle of the canvas.
- **Category nodes:** one per category, radius 45, each linked to the centre.
- **Skill nodes:** one per skill, linked to its category. The radius is sized to
  the label: `max(25, label.length × 0.6 × 8px / 2 + 8)`.

### Forces (`d3.forceSimulation`)

| Force | Setting |
| --- | --- |
| `forceLink` | Distance 180 (centre → category), 100 (category → skill); strength 0.8 |
| `forceManyBody` | Charge −1000 (centre), −400 (category), −150 (skill) |
| `forceCenter` | Middle of the 1200 × 600 canvas |
| `forceCollide` | Node radius + 10, so circles never overlap |

### Look

- **Canvas:** SVG with a 1200 × 600 `viewBox`, scaled to fit (`xMidYMid meet`).
- **Circles and links:** dark fills with gold strokes, and gold links with
  thicker lines from the centre.
- **Type:** Cinzel for the centre and categories, Montserrat for skills.
- **Label wrapping:** multi-word categories wrap onto two or three lines;
  for "&" names, "&" gets its own line. Skill labels longer than 12 characters
  wrap after the first word.

### Interaction

- **Drag:** a dragged node follows the pointer. When dropped, a short
  `forceRadial` "settle" simulation (radius = 10% of the node's radius) eases it
  in, and it stays pinned where it was dropped.
- **Zoom:** `d3.zoom` between 0.5× and 3×, by mouse wheel or pinch. There are also
  on-page controls: +, −, a vertical slider and reset.

### Lifecycle

It is a React component driving D3 imperatively. A `useEffect` keyed on `skills`
clears the SVG, builds nodes and links, starts the simulation and attaches
zoom. The cleanup stops the simulation. A new `skills` object redraws the graph
from scratch, which resets dragged positions.

## Reusing it on the mainstream portfolio

This is the recommended starting point, not a spec:

- **Extract, don't rewrite:** move `SkillsDiagram` out of `src/App.tsx` into its
  own component. Accept `skills` (and optionally colours and fonts) as props, so
  the cinematic page and the portfolio site share one implementation.
- **Keep it data-driven:** feed it from the same published release
  (`useResumeQuery`, or the v2 model directly once the redesign drops
  `toLegacy`).
- **Theme:** the colours and fonts are hard-coded for the cinematic gold-on-black
  look. Pull them into props or CSS variables so the portfolio can use its own
  palette, including dark mode.
- **Responsiveness:** the fixed 1200 × 600 `viewBox` is fine on desktop but
  cramped on phones. Consider fewer forces or larger link distances on narrow
  screens, or a simple list fallback.
- **Accessibility:** the graph is visual only. Provide the same skills as an
  accessible list (visually hidden, or a toggle) for screen readers and
  keyboard users.
- **Other linked data:** the same pattern could show jobs → projects, or cores
  → projects, from the published content.

Also referenced from `docs/content-platform-plan.md` §7 ("Redesign reference: D3
skills graph").
