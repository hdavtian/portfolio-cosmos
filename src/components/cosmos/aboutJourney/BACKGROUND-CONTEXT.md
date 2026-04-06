# About Particle Journey — background context for another AI

Give this file (plus the linked docs below) to a model or teammate so they understand **what you asked for**, **what was built**, **where the code lives**, and **how to verify** behavior without re-reading long chats.

---

## 1. How to use this bundle

| Document | Purpose |
|----------|---------|
| **This file (`BACKGROUND-CONTEXT.md`)** | Your product asks, evolution of direction, and pointers. |
| **`HANDOFF.md`** (same folder) | Technical architecture: phases, files, anchors, roadmap, implementation contracts. |
| **`BACKGROUND-DISCUSSION.md`** (same folder) | Thread notes: dispersal/hydrate, camera zoom limits, debug logging, “re-hydrate” intent. |
| **`docs/ResumeSpace3D.integration-checklist.md`** | Manual QA checklist including **About Journey Path Travel** (debug-gated). |

If this file disagrees with the repo, **trust the code** and update the docs.

---

## 2. Original feature ask (consolidated from your messages)

### 2.1 Scene / old About content

- **Hide** the elevator/shaft model (`space_corridor.glb`) and the satellite station (`lunar_gateway_space_station.glb`) from the universe for now.
- **Do not** rely on their data files or encounter mechanics; you may **reference how fonts were styled** for later.
- The new About experience **replaces** that destination as what navigation targets.

### 2.2 Particle swarm (“nest”)

- The new About is a **group of particles** moving among each other like a **swarm of bees**, **humming** around a collection in space.
- Visually aligned with particles used elsewhere: **skills lattice**, **portfolio** — the kind of particles cores shoot into slides.
- Particles should **vary in color** and feel alive as a **group**, not a static blob.

### 2.3 Targeting / TV

- The **targeting TV / brief live feed** should **target and show** this particle grouping.

### 2.4 Arrival and narrative beats

- On arrival: **close-up**; swarm keeps moving like bees around a nest.
- Then the “magic”: particles **shoot off into space** forming a **path**; the camera should **gently turn to face** the direction of flow **without following** the particles yet (you stay roughly put while seeing them stream away).
- Later refinement: the **Falcon flies through** the swarm, **disappears**, which **excites** the swarm (more particles, bigger, brighter), then particles form a **circle** at a **random tilt** around the fly-through point and **spin up** excitement further.
- Then they launch the **cosmic path** (closed loop through the universe); camera should **keep attention on the “spear head”** while forming, but **not lock** the user — **some** look-around freedom; full camera freedom once the path loop is **complete**.

### 2.5 Path shape and tour

- **Gentle** curves — “roller coaster through the theme park” **without** sickening loops; can be **fast but gentle**.
- Path is a **closed loop** that passes **through/around** other zones: skills lattice, portfolio, experience planet, **gaps between job moons**, unfinished slides still in the universe, etc.
- **Important:** **Moons/planets are not orbiting dynamically** for this — their **world positions are static** (paused orbits); only reasonable local spin if already in the scene.

### 2.6 Messaging and pacing

- Along the path: **messages** readable as you pass.
- Some **stops** at destinations for **longer copy**, with a **Continue** (or similar) control.
- Experience is **free-flying** (no ship during the ride feel); not a literal stomach-turning coaster.

### 2.7 Phasing and determinism

- Distinct **phases** (e.g. humming / transit / fly-through / excitement / path forming / path ready / follow path / destinations / …) so messaging and effects can be **deterministic** and **debuggable**.
- Implementation should be **solid**: prefer **established libraries** (e.g. **CameraControls**, **gsap**, **yuka** for steering) over one-off physics.
- **Process:** build in **visually reviewable slices**; **commit each phase** to the branch before the next. **Epic** polish is welcome if done cleanly.

### 2.8 Follow-up directions (from later messages)

- **Lighting:** After hiding the shaft, the scene got darker — restore ambient feel (e.g. **hemisphere / fill light** in shared lighting).
- **Navigation:** Swarm should live at the **same world region** as the old About showcase so travel targets still make sense (`ABOUT_PARTICLE_SWARM_WORLD_ANCHOR` aligned with `PROJECT_SHOWCASE_ABOUT_WORLD_ANCHOR`).
- **Landmarks:** Use **portfolio**, not a separate “projects” waypoint in the cosmic loop; include **experience moons** in the path where it reads well.
- **Path visuals:** **Dense** trail, **continuous injection** from the origin so the stream doesn’t “run out,” **varied size and color**, **electricity / energy** feel along the curve; path formation can take time so it’s satisfying to watch.
- **Debugging:** When ship/camera misbehaved, you asked for **console logs** to share; later remove or gate noisy logs (see `BACKGROUND-DISCUSSION.md` / `src/lib/debugLog.ts` if present in your tree).

---

## 3. Issues raised in thread (for continuity)

- **Glide / ship visibility:** Early bugs: ship not hiding, not getting close enough, glide stutter — addressed by arrival distance, render-loop arrival checks, and not letting `CameraControls` fight scripted `setLookAt` during fly-through (details in git history / `HANDOFF.md`).
- **Build:** TypeScript `erasableSyntaxOnly` required replacing `enum` with `const` object + type alias for journey phases.
- **Swarm disappeared (visual regression):** Suspected **custom `ShaderMaterial`** / `color` attribute / `vertexColors` interaction with Three.js **r182**; debugging path included reverting to **`PointsMaterial`** temporarily and adding logs — **verify current `AboutParticleSwarm.ts`** before assuming shader vs. material.

---

## 4. Plan / roadmap (from `HANDOFF.md`, condensed)

Already implemented direction (see `HANDOFF.md` for exact phase enum and hooks):

- Phase state machine in **`AboutJourneyController`**, swarm visuals + pooling in **`AboutParticleSwarm`**, integration in **`ResumeSpace3D.tsx`** + **`useRenderLoop.ts`**.
- Landmarks registered after scene build (skills, portfolio, memory square, sampled experience moons).

Suggested **future** work (from handoff):

1. Narrative glue: copy, audio, UI per phase.  
2. Data-driven paths / landmark sets.  
3. Tune second-run behavior after any **hydrate / handoff** to memory-square anchor (if that branch is merged).  
4. Optional UX: skip/replay path.  
5. Performance vs. particle counts.  
6. Visual polish: point shaders, bloom, readability at distance.

---

## 5. Integration checklist excerpt (`docs/ResumeSpace3D.integration-checklist.md`)

**About Journey Path Travel (often debug-gated):**

- Run with `?debug=true` if the project uses debug-gated panels/logs.
- Open **ABOUT PARTICLE DEBUG** panel (if present).
- Trigger About journey; confirm phase progression (see checklist for exact names — may include `PATH_TRAVEL`, `PATH_DISPERSING`, etc., depending on branch).
- Confirm path streaming during formation, hold/ready behavior, dispersal/exit if implemented.
- Regression: intro, navigation, journey exit restore camera/controls.

---

## 6. Key source files (quick map)

| Area | Files |
|------|--------|
| Journey logic | `AboutJourneyController.ts` |
| Swarm + path particles | `AboutParticleSwarm.ts` |
| Scene wiring | `ResumeSpace3D.tsx` (swarm create, landmarks, callbacks) |
| Frame loop | `useRenderLoop.ts` |
| Types | `src/types/yuka.d.ts` (if using yuka) |
| Debug UI | `AboutJourneyDebugPanel.tsx` (if present) |

---

## 7. Branch / git

Work has been associated with **`feature/about-particle-journey`**. Confirm with `git log` / `git status` on your machine.

---

*Compiled for handoff: merges the long-thread product ask (from conversation summary), this thread’s “background-context” request, and the existing in-repo plan docs (`HANDOFF.md`, `BACKGROUND-DISCUSSION.md`, integration checklist).*
