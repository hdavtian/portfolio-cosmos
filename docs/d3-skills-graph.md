# D3 Skills Graph ("Technical Expertise")

A force-directed graph of the **tech stack**, a tree of any depth, drawn with D3. It lives
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
| Tech stack model | `packages/content-schema/src/techStack.ts` (schema), `techStackTree.ts` (tree building and validation, zod-free) |
| Admin | **Portfolio → Tech stack** (`admin/src/pages/TechStackPage.tsx`, a Syncfusion TreeGrid) |
| Where it is rendered | The "Skills Section" in `App`'s JSX: `<SkillsDiagram tree={techStack} />` |
| Styles (container, zoom controls) | `.skills__*` classes in `src/styles/main.scss` |
| Related D3 hero diagrams | `src/components/ResumeStructureDiagram.tsx` (circles, constellation, circuit, rings, tree, neural styles) |
| Library | `d3` ^7.9 and `@types/d3` (already dependencies) |

## Data

`SkillsDiagram` takes one prop: `tree: TechStackTreeNode[]`, where each node is
`{ slug, name, children }`.

### The tech stack is separate from the resume skills

The resume's **Skills** and **Skill categories** stay one level deep on purpose:
the resume should stay simple. The graph and the portfolio site redesign use
their own model, **tech stack nodes** (collection `techStackNodes`), which can
nest to any depth, e.g. Frontend › Frameworks › React.

- **Each node:** `slug`, `name`, `sortOrder`, and `parentSlug` (`""` for a
  top-level node).
- **Siblings:** ordered by `sortOrder`. The saved order is the tree flattened
  depth-first.
- **Starting data:** the tech stack started as a copy of the resume skills (5
  categories → 18 skills), and the content import (`fromLegacy`) does the same.
  The two then diverge.
- **Validity:** publishing is refused while a node has a missing parent, is its
  own parent, or is part of a parent loop (`techStackIssues`). The API refuses
  to delete a node that still has children.

### Editing (Admin → Portfolio → Tech stack)

- **The tree:** a TreeGrid with expand and collapse, and search.
- **Drag and drop:** drop onto a row to nest the node inside it, or above or
  below a row to place it at that level. Each drop saves immediately.
- **Buttons:** Add top-level node, Add child (prefills the parent), Edit,
  Delete. Double-click a row to edit.
- **The editor:** the shared full-page editor. Its Parent dropdown offers
  "— Top level —" and never the node itself or its descendants.

### Where the graph gets it

- `useTechStackQuery()` (`src/lib/query/contentQueries.ts`) reads the tree from
  the published release (`buildTechStackTree`).
- If nothing has been published for the tech stack yet, or the API is
  unreachable, the tree is built from the resume skills
  (`techStackTreeFromSkills`), so the graph always renders.

### Also drives the 3D Skills Lattice

The same tech stack builds the Skills Lattice in the cinematic experience
(`ResumeSpace3D.tsx`, the lattice build in the scene setup):

- **Cores:** top-level nodes, as icosahedrons on the lattice ring.
- **Depth 2:** orbits its core, as the skills always did.
- **Depth 3 and deeper:** smaller nodes on rings tilted away from the
  grandparent, so a branch fans outward.
- **Particles:** every parent → child link gets pulsing particles.
- **Selecting a node** lights its whole top-level branch. The info panel shows
  its path ("In Frontend › Frameworks") and its children.

The rest of that old resume page (name, summary, jobs, education,
certifications) still reads `resume.json` directly.

## How it works

### Nodes and links

- **Centre node:** "TECH STACK", radius 50, pinned to the middle of the canvas.
- **Depth 1 (top-level nodes):** radius 45, category styling, each linked to
  the centre.
- **Depth 2 and deeper:** linked to their parent, and sized to the label with
  `max(base, label.length × 0.6 × fontSize / 2 + 8)`. The base is 25 with 8px
  text at depth 2, and 20 with 7px text at depth 3 and below.

### Forces (`d3.forceSimulation`)

| Force | Setting |
| --- | --- |
| `forceLink` | Distance by the parent's depth: 180 (centre), 100 (depth 1), 70 (deeper); strength 0.8 |
| `forceManyBody` | Charge −1000 (centre), −400 (depth 1), −150 (depth 2), −100 (deeper) |
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

It is a React component driving D3 imperatively. A `useEffect` keyed on `tree`
clears the SVG, builds nodes and links, starts the simulation and attaches
zoom. The cleanup stops the simulation. A new `skills` object redraws the graph
from scratch, which resets dragged positions. Deep or wide trees need a bigger
canvas or tuned forces; the fixed 1200 × 600 `viewBox` was sized for about 25
nodes.

## Reusing it on the mainstream portfolio

This is the recommended starting point, not a spec:

- **Extract, don't rewrite:** move `SkillsDiagram` out of `src/App.tsx` into its
  own component. Accept `tree` (and optionally colours and fonts) as props, so
  the cinematic page and the portfolio site share one implementation.
- **Keep it data-driven:** feed it the published tech stack
  (`useTechStackQuery`), not the resume skills.
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
