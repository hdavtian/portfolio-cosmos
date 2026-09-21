# One technology list: consolidation plan

**Status: DISCUSSION DRAFT 3 (2026-09-21). Nothing here is built. Do not implement until Harma marks it settled.**

Related: `docs/content-platform-plan.md`, `docs/d3-skills-graph.md`, the mock at
`src/data/mock/skillTimeline.json` and its rules in `scripts/skills-report.mjs`.

## 1. Why

Technology names are typed by hand in five unconnected places. Renaming one, or
adding a new one, means up to five edits. The Game of Thrones film
(`/lab/got`) needs a sixth thing the API doesn't have at all: how long each
skill was used at each job. The goal is one master list that everything points
at, fewer admin screens, and no visible change to any site beyond the clean-ups
agreed below.

**Hard rule:** the sites keep looking and behaving the same. Small site changes
are allowed only where they let a site read the consolidated data.

## 2. What exists today

### 2.1 Where technology names live

| # | Admin screen | Shape | Count (live release) |
|---|---|---|---|
| 1 | Skills | name, one category | 18 |
| 2 | Skill Categories | name | 5 |
| 3 | Tech Stack | name, parent (nests) | 27, of which 23 repeat 1 and 2 |
| 4 | Experience → Job Tech | free-text label + highlight words | 47 labels, many combined ("React + Redux") |
| 5 | Experience → Memories (type `tech`) | free text | about half of all memories |
| 6 | Portfolio entry → technologies | free text | 32 distinct, inconsistent ("html" ×12, "HTML" ×8) |

Cores are separate and not duplicated. Memories of type `memory` and `code` are
unique content and stay as they are.

### 2.2 Who reads what

| Data | New portfolio site (`/`) | Cinematic 3D site | Old scrolling resume | GoT film |
|---|---|---|---|---|
| Skills + Categories | — | Skills planet and its category moons | skills block | — |
| Tech Stack | tech constellation, skills lattice, About ride | skills lattice, structure diagram | — | — |
| Cores | project grouping and colours | portfolio cores | — | place colours |
| Job Tech | labels on each job moon | moon labels, drone hologram, overlay; hover highlights resume text | — | — |
| Memories | floating memories on the job moon | memory sequence per job | — | — |
| Entry technologies | project tags | holograms, moon filters | — | — |

### 2.3 What the film needs that the API lacks

1. Per-job skill history (75 records in the mock).
2. 16 more technologies than the 18 in Skills (older stack, and non-code skills
   such as leading engineers, sales, tech support).
3. A technology in several categories (Angular → Frontend, SPA frameworks, Current stack).
4. 6 more categories, a "headline" flag, a blurb, and an optional "era" year
   (count only from that year on; "Current stack" counts from 2014).
5. Three jobs: Earthlink, HostPro, and StormScape's second period (2025 → now).
   Experiences can't have an open end date.
6. Cores for Earthlink, HostPro, UnitedLayer (content entry only).

## 3. Decisions so far

| # | Decision | Decided |
|---|---|---|
| D1 | Tech Stack becomes the single master list and absorbs Skills and Skill Categories. | 2026-09-21 |
| D2 | Combined labels ("React + Redux") can go. The sites show a comma-separated list of the linked technologies instead. | 2026-09-21 |
| D4 | One tree. Categories are its top-level entries, not a second tagging system. Sites choose to show it nested or flattened. | 2026-09-21 |
| D5 | "Current stack" stays as an idea, as a simple tick on a technology; no start-year tooling. | 2026-09-21 |
| D6 | No stored derived data. One set of source records, one published release; any reshaping (`toLegacy`, the tree, year totals) is computed when read and never saved or edited. If a calculation ever gets too heavy it moves into the publish step, still regenerated every time. | 2026-09-21 |
| D7 | Hard rule: one home per skill (one parent in the tree). No site shows a skill under two headings today. If something seems to belong in two places it is two skills. Nesting is unlimited in depth (Frontend → React → Patterns → Provider, as the lattice shows today); the rule limits each entry to one parent, not the tree to one level. | 2026-09-21 |
| D8 | Non-code skills (sales, support, consulting, leading people) live in the same tree. Harma will organise them when entering the data; grouping is revisited once the real data is in, not designed up front. | 2026-09-21 |
| D3 | The API is the only source. Missing data is added to the API; the mock file ends up as seed and offline fallback only. | 2026-09-21 |

## 4. Proposed shape

### 4.1 Technology (the master list; today's Tech Stack node, extended)

**One tree, no separate categories (D4).** A category is simply a top-level
entry of the tree. The data is one thing; the sites choose how to show it:
the parent/child breakdown for a recruiter or HR reader, a flattened list of
technologies on projects for a technical reader.

| Field | Notes |
|---|---|
| `slug`, `sortOrder`, `name` | as today |
| `parentSlug` | as today. Years roll up the tree: a parent's time is the calendar time covered by itself and everything under it, never the sum. |
| `current` | tick: part of the stack that is relevant today (D5). Replaces the mock's "Current stack" category and its start year. |
| `showOnResume` | the resume and the Skills planet show only ticked ones, so they keep showing today's 18 under today's 5 headings. |
| `blurb` | optional one line, mainly for top-level entries |

What the mock did with several categories per skill becomes nesting:

| Mock | Tree |
|---|---|
| Angular in Frontend + SPA frameworks | Frontend → SPA frameworks → Angular |
| HTML / CSS in Frontend + Styling | Frontend → Styling → HTML / CSS |
| anything in Current stack | `current` tick |
| Sales in Support & sales + Leadership | dropped; Harma re-enters non-code skills per job (D8) |

### 4.2 Category

Removed as a separate thing; see 4.1. The Skill Categories collection and
screen go away, and its 5 entries are already the tree's top level.

### 4.3 Skill use (a technology at a job) — the "years per job" shape

Held on the Experience, as a list. This replaces Job Tech's free-text labels.

| Field | Notes |
|---|---|
| `technologySlug` | required; picked from the master list |
| `from`, `to` | optional exact years (or year-month). Most precise. |
| `years` | optional; how long, when exact dates aren't known |
| `when` | optional: `start`, `middle`, `end`. Where those years sat in the job. |
| `highlightMatches[]` | carried over from Job Tech, so cinematic hover-highlighting keeps working |
| `showAsChip` | *open question Q3*: whether it appears in the job's visible tech list |

A use is stated one of four ways, most precise first:

1. **`from` / `to`**: real dates, e.g. Angular 2018–2022. Years are derived.
2. **`years` + `when`**: "2 years, at the end of the job".
3. **`years` only**: how long, position unknown; assumed to overlap the job's other skills.
4. **Nothing**: used there, duration not stated; counts as the whole job. (This is
   what every existing Job Tech label becomes on migration, so nothing has to
   be filled in before go-live.)

Three rules keep totals honest (already proven in `scripts/skills-report.mjs`):

1. A skill's years at a job never exceed the job's length. The admin form
   rejects more; the calculation also caps it.
2. Inside one job, a category counts the calendar time it covered, not the sum
   of its skills. `when` places a skill in the job; skills with no `when` are
   assumed to overlap, so the category takes the longest, never the sum.
3. Across jobs, a total is capped by the real calendar span of the jobs it came
   from, so overlapping jobs (StormScape alongside others) never invent years.

The calculation lives once in `@hd/content-schema` so the API, admin and sites
agree. *Open question Q4*: whether the API publishes computed totals or each
site computes them.

### 4.4 Experience changes

- `endDate` may be empty, meaning "to present".
- StormScape's return: *open question Q5*. Either a second Experience
  ("stormscape-now") flagged so the resume doesn't list it twice, or one
  Experience with more than one period.
- Earthlink and HostPro are added as Experiences. *Open question Q6*: whether
  they should appear on the resume and the cinematic site, or only in the film
  (a "show on resume" tick on Experience).

### 4.5 Memories and project technologies

- Memories of type `tech` pick from the master list instead of free text.
  `memory` and `code` stay free text.
- Portfolio entry technologies pick from the master list. Tags render the
  technology's name, which fixes html/HTML. Some current tags have no master
  entry yet (WinForms, Framer Motion, Redux, Spring Boot) and would be added,
  mostly as children.

## 4.6 How the sites read content (the translation step)

All sites read the live API (`GET /api/v2/content/release`). In the browser,
`toLegacy` (shared schema package, ~190 lines, round-trip tested) converts the
response into the older file shapes the sites were written against. Nothing is
stored; bundled JSON is used only if the API is unreachable.

- **Cost:** one more place to update when the model changes; new fields reach a
  site only once added to the translation.
- **Use here:** it is the single point that controls what each site receives,
  so it can hide a film-only Experience and rebuild the old skills map from the
  tree, keeping the 3D sites unchanged.
- **Direction:** new work (the GoT film) reads the new shapes directly. The new
  portfolio site can migrate over time. The cinematic site keeps the translation
  indefinitely. Ties in with platform stage 6b (stabilise).

## 5. What each site sees afterwards

| Site | Change |
|---|---|
| Old resume skills block, Skills planet | none: `toLegacy` builds the same category → names map from ticked technologies |
| Tech constellation, lattice, About ride, diagram | none if the tree is unchanged; *Q1* decides whether new technologies appear there |
| Job moon labels (both sites), hologram, overlay | combined labels become single technology names, comma-separated where shown in a line (D2). More, shorter labels per job. |
| Project tags | consistent names and capitalisation |
| GoT film | reads the release instead of the mock |

## 6. Admin afterwards

- **Removed:** Skills, Skill Categories.
- **Technologies** (was Tech Stack): tree grid, plus categories, resume tick.
- **Categories:** new small screen (or a tab of Technologies).
- **Experience editor:** "Job Tech" becomes "Skills used", a nested grid with
  technology picker, years / when / from–to, and highlight words.
- **Portfolio entry and Memories:** technology pickers.

All per the `syncfusion-list-pages` and `syncfusion-edit-dialogs` skills.

## 7. Open questions

| # | Question | Leaning |
|---|---|---|
| ~~Q1~~ | *Settled by D4.* ~~Are top-level tree nodes (Frontend, Backend…) the same thing as categories, or does the tree keep its own top level while categories are a separate tagging? | Separate: tree = "part of", categories = "counts toward". A technology has one parent but many categories. |
| ~~Q2~~ | *Settled by D4: its top-level ancestor.* On the resume a skill shows under one category. If it has several, which? | A `resumeCategorySlug`, defaulting to the first. |
| Q3 | Should every skill use show as a label on the job moon, or only ticked ones? 21 uses at InvestCloud is a lot of labels. | Tick-box, defaulting on for migrated labels only. |
| ~~Q4~~ | *Settled by D6.* Totals computed by the API at publish time, or by each site from shared code? | Shared code, computed in the site: "now" moves, a published number would go stale. |
| Q5 | StormScape's return: second Experience or multiple periods on one? | Second Experience with a `continues` link to the first: smallest schema change, film already works this way. |
| Q6 | Earthlink / HostPro on the resume and cinematic site, or film only? | Harma's call. |
| ~~Q7~~ | *Settled by D8.* Non-code skills (sales, leading engineers) live in the same master list? | Yes, under their own categories, unticked for the resume unless wanted. |
| ~~Q9~~ | *Settled by D7/D8.* A few skills sat in two groups in the mock (Sales in Support & sales and Leadership). With one tree each gets one home. Acceptable? | Yes; pick the home that reads best to an employer. |
| Q10 | New technologies appear in the portfolio constellation and lattice (they draw the tree). Show everything, or only `showOnResume` ones? | Harma's call after seeing it; start with ticked only so nothing changes. |
| Q8 | Dates as years or year-months? | Year-month, matching Experience dates; the form accepts a bare year. |

## 8. Risks

- **Order is visible.** The Skills planet, lattice and resume draw in list
  order. Migration must preserve sort order exactly.
- **Highlight words** drive cinematic hover-highlighting; they move with each
  label to its skill use(s). A combined label split in two copies its words to both.
- **Label count changes** on job moons once combined labels split (D2 accepts
  this; layout needs a look at the busiest job).
- **Migration is one-way in practice.** Script it, run against a copy, and diff
  the `toLegacy` output before and after; only the agreed differences may appear.
  Backups are kept, never auto-deleted.
- **The cinematic site must not change without approval**; anything beyond
  label text goes back to Harma first.

## 9. Implementation path

To be written once sections 4 and 7 settle. Expected outline: schema → migration
script + before/after diff → API → `toLegacy` → admin screens → seed the mock's
years → film reads the release → remove the old screens and collections.

## 10. Change log

- 2026-09-21: draft 3: one home per skill is a hard rule (D7); non-code skills organised from real data later (D8).
- 2026-09-21: draft 2: one tree instead of tree + categories (D4), "current" as a tick (D5), no stored derived data (D6).
- 2026-09-21: draft 1 from the usage analysis and Harma's decisions D1–D3.
