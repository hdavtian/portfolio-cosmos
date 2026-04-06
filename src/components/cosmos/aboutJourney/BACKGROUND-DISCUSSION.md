# Background discussion — about particle path / “beams” experience

This file captures **product intent, user notes, and back-and-forth** that shaped the about particle journey work, for handoff to another AI or teammate.

**Important limitation:** The Cursor session that produced this document **does not include a verbatim transcript** of an *earlier* conversation where you may have first pitched the particle path in depth. What appears below is:

1. **Exact or near-exact user messages** preserved from *this* thread and the session summary.
2. **Paraphrased assistant responses** as outcomes (what we built or agreed).
3. **Inferred intent** from the resulting code and `HANDOFF.md`, clearly labeled where we did not have your original words.

If you still have the original pitch in another chat, **paste it at the top of this file** (or append as “Original pitch — verbatim”) so nothing is lost.

---

## 1. Original pitch (not fully recoverable here)

**Gap:** The first creative pitch (why particle beams, emotional beat, full story arc) may have lived in a **prior thread** not loaded into this session.

**Inferred from implementation + later messages (for context only):**

- A **cinematic “about” journey** in the 3D cosmos: ship approaches a **particle swarm**, flies through it, the swarm **excites** and then **draws a glowing path** through the universe (landmarks: skills, portfolio, memory square, experience moons).
- The camera should **follow / attend** to the spectacle (fly-through choreography, then freedom with gentle guidance while the path forms).
- The path reads as **beams / electricity / trail** particles along a **closed cosmic loop**, not a static mesh.
- The experience should be **repeatable** and feel like a **system that resets** (“re-hydrate”) rather than a one-shot effect.

*Replace or extend this section with your verbatim pitch if you have it.*

---

## 2. User messages and thread (this session / summary)

### 2.1 Console noise

**You said (paraphrase from request):**  
Gate perf and other logs so the browser console only shows them when `debug=true` — the console was getting spammed.

**Direction / outcome:**  
Introduced `src/lib/debugLog.ts` with `IS_DEBUG` (`?debug=true`) and `dlog` / `dwarn` / `dinfo` / `dtable`. Replaced direct `console.*` usage across the cosmos/about code paths so normal browsing stays quiet.

---

### 2.2 Reaction after seeing it working

**You said (verbatim tone preserved):**  
Something like: *very cool — you can see the particles, the path, and the camera keeps an eye on it; wonderful; let’s commit, more development still coming.*

**Direction / outcome:**  
Committed on `feature/about-particle-journey` with a message covering the about journey particle swarm, integration, and debug-gated logging.

---

### 2.3 Path dispersal, hydrate swarm, camera zoom

**You said (substance preserved; typos lightly normalized):**

- The **path has formed**; you want a **path dispersal phase** where particles **fall apart from the path**, travel **in all directions**, and **disappear**, so you can **re-engage** and have them **form again**.
- **While dispersing**, a **separate swarm** with **new particles** should **form in the about area** so you can **repeat the swarm process** with them — that’s how the system **“re-hydrates” or resets**.
- When **camera freedom** is given, you **shouldn’t zoom in/out too much** — doing so made the **path disappear** (likely point-size vs depth / distance to target).

**Direction / outcome:**

- New phase **`PATH_DISPERSING`**: burst velocities, fade, timeout; completion signals handoff.
- **Hydrate swarm** at **`ABOUT_MEMORY_SQUARE_WORLD_ANCHOR`** during dispersal; on completion, **promote** it to the primary swarm ref and dispose the old one so the **next** `beginTransit()` uses the new anchor.
- **`PATH_READY`** no longer keeps **emitting** new path particles; only **`PATH_FORMING`** emits.
- **CameraControls** `minDistance` / `maxDistance` **saved and clamped** while journey phase ≠ `IDLE` (`ABOUT_JOURNEY_CAM_MIN_DIST` / `MAX`), restored on dispersal complete and on journey exit.

---

### 2.4 Technical handoff doc

**You asked:**  
Document what was built for the “about particle beams” and the **plan for the whole experience** for another AI.

**Outcome:**  
`HANDOFF.md` in this folder — architecture, phases, files, anchors, tuning knobs, suggested roadmap.

---

### 2.5 This document

**You asked:**  
Capture **your pitch, notes, and back-and-forth** (not only the technical handoff) so another AI has **full context**.

**Outcome:**  
This `BACKGROUND-DISCUSSION.md`.

---

## 3. Design themes that kept recurring

| Theme | Notes |
|--------|--------|
| **Readability** | Path must stay visible; extreme zoom broke it → explicit distance clamp during free camera. |
| **Phased story** | Not one animation — transit, fly-through, excitement, path, hold, dispersal, reset. |
| **Repeatability** | “Re-hydrate” = new swarm at about / memory-square anchor after dispersal, not the same exhausted state. |
| **Debug vs polish** | Heavy logging only with `?debug=true` so iteration doesn’t pollute normal use. |
| **Handoff** | Split **why / what we talked about** (this file) from **how it’s coded** (`HANDOFF.md`). |

---

## 4. Assistant-side decisions worth preserving (brief)

- **Single journey brain:** `AboutJourneyController` owns allowed transitions and timing; swarm is **visuals + physics**, not phase ownership.
- **One-shot signals:** Swarm `update()` returns **`pathLoopCompleteEdge` / `dispersalCompleteEdge`** so the render loop doesn’t double-fire `notifyPathComplete` / `notifyDispersalComplete`.
- **Callbacks into React land:** New behavior (hydrate spawn, swap, camera restore, exit cleanup) stays behind **`AboutJourneyCallbacks`** in `ResumeSpace3D.tsx` to avoid scattering `sceneRef` access.

---

## 5. What to tell the next AI

1. Read **`HANDOFF.md`** for code map and phase list.  
2. Read **this file** for **intent, your wording, and product language** (“re-hydrate,” dispersal, second swarm at about area, zoom issue).  
3. If something here conflicts with code, **trust the repo** and update both docs.  
4. **Paste your original pitch** into §1 if it’s not here yet.

---

*Compiled from the conversation thread that produced the dispersal/hydrate/zoom work and the handoff docs. Not a full archive of all historical chats.*
