# One technology list: consolidation plan

**Status: DRAFT 5 (2026-09-22). Step 0 is built and live. Sections 4.1–4.5 are
not built; do not implement until Harma marks them settled (Q3, Q6, Q8, Q10 are open).**

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

## 1b. Where we are (2026-09-22)

**Step 0 is done and deployed.** The `toLegacy` translation is retired; all
three sites read the published release from the API, and the bundled content
JSON files are gone (see `docs/legacy-translation-retirement.md`). Production
serves release `34ef6f20`.

Also settled since draft 4, by entering the data rather than by writing code:

- All three missing jobs exist (2.3 item 5). The live release has **10
  experiences**, including `earthlink` (1994–1997), `hostpro` (1997–2001) and
  `stormscape-freelance` (07/2025 → present, open end date, D10).
- An Experience may have no end date, and the sites show "Present".

**One JSON file is still read by the app.** `src/data/mock/skillTimeline.json`
is the film's own data: 11 categories, 34 skills and **75 skill-uses across 10
jobs**. `src/features/lab/skillsData.ts` turns it into spans, and the film
(`SkillsTitlesPage`) and the skills lab page read it. The film gets its profile
and cores from the API, but its *places and years* still come from this file.
Retiring it is the point of sections 4.1–4.5: the 75 uses have no home in the
API yet.

| 2.3 gap | State |
|---|---|
| 1. Per-job skill history (75 records) | **open** — the work below |
| 2. 16 technologies the master list lacks | **open** — live: 18 skills, 27 tree nodes; mock: 34 skills |
| 3. A technology in several categories | settled by D4/D7 (nesting, one home) |
| 4. More categories, headline, blurb, era | **open** — live: 5 categories; mock: 11 |
| 5. Three missing jobs | **done**, in production |
| 6. Cores for Earthlink, HostPro, UnitedLayer | **open** — live cores: investcloud, murad, rpa, boingo, stormscape |

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

| Data | New portfolio site (`/`) | Cinematic 3D site | GoT film |
|---|---|---|---|
| Skills + Categories | — | Skills planet and its category moons, tour builder | — |
| Tech Stack | tech constellation, skills lattice, About ride | skills lattice, structure diagram | — |
| Cores | project grouping and colours | portfolio cores | place colours |
| Job Tech | labels on each job moon | moon labels, drone hologram, overlay; hover highlights resume text | — |
| Memories | floating memories on the job moon | memory sequence per job | — |
| Entry technologies | project tags | holograms, moon filters | — |

The old scrolling resume (the arrow-key sections inside the cinematic site) was
removed in `c454e89`; its last unused files (`Hero`, `Summary`, `Skills`,
`Footer` and their styles) were deleted on 2026-09-21. There are three sites.

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
| D9 | One data shape for every site. The `toLegacy` translation is retired **before** the skills consolidation, so the consolidation is done once, against the new shapes, not twice. No per-site filtering in a hidden layer; what a site shows is decided by visible fields on the record (e.g. visibility ticks). | 2026-09-21 |
| D10 | StormScape's return is a second Experience (`stormscape-freelance`, Jul 2025 → present), not extra periods on the first (settles Q5). An Experience's end date may be left out, meaning current; the sites show "Present". Added to the local database 2026-09-21. | 2026-09-21 |
| D11 | Names are de-duplicated and normalised by rule, with a reviewed exception list (section 4.7). One record per technology, one spelling, compounds split into their parts, and every string that mapped to a record kept on it as an alias so the migration is auditable. | 2026-09-22 |
| D14 | `style` is a **named token** (`plain`, `code`, `handwritten`), never raw font/colour/border values, and it lives on the *use* - a skill use or a prose memory - not on the technology or the job. It is optional; empty means "the default for this kind" (skill use -> `plain`, prose -> `handwritten`). The token's appearance is defined once in code (today's `styleByType` table), so a restyle changes one table rather than every record, and a new style is one token plus one dropdown option with no migration. | 2026-09-22 |
| D13 | A memory's `type` is a style switch (font, glow, backdrop box), not a kind of content, which is why technology names were filed as `code` to get a monospace box. The two ideas separate: content is either a technology from the master list or a prose memory; how it flies is a `style` field (`plain`, `code`, `handwritten`) on the item. Today's look is preserved by defaults, and a technology drawn as a code box is still a link, so renaming it renames the box. | 2026-09-22 |
| D12 | The `tech` **and `code`** memory types retire. Both were free text holding technology names: of the 25 tech memories 13 duplicate a label on the same job, 7 name a technology found nowhere else (including Node.js at InvestCloud) and 5 describe work; of the 14 code memories 8 duplicate a label, 3 name something new and 3 are prose. Each is deleted, harvested into a skill use, or re-typed as prose. Afterwards a memory is prose, and technologies live only in the master list. | 2026-09-22 |
| D15 | Every visibility option migrates **on**: it is easier to see everything and take things off than to hunt for what is missing (settles Q3 and Q10). Because "all on" would put ISDN on the resume, the curation happens in the production copy *before* the first publish: the migration runs, Harma unticks what should not show, and only then is anything pushed to production. The hard rule (sites unchanged on the day it ships) is kept by that ordering, not by the default. | 2026-09-22 |
| D16 | Some surfaces show skills only, no headings (the flattened view of D4). "Has children" cannot decide this: React (Hooks, Patterns), AWS (EC2, RDS, S3) and Azure are real technologies that are also parents, and hiding every parent would drop them from exactly the views that flatten. An explicit `isHeading` tick decides it, defaulting on for top-level entries. Stating it rather than inferring it also allows a technology at the top level (Git, with no obvious parent) without it silently becoming a heading. | 2026-09-22 |
| D17 | Earthlink and HostPro appear **everywhere**, like any other job: on the resume and as moons in the universe (settles Q6). No "show on resume" tick on Experience is needed, which removes a field from the plan. The resume grows to 10 entries and the universe gains two moons, so both need a look before publishing, and the three missing cores (Earthlink, HostPro, UnitedLayer) become content Harma enters. | 2026-09-22 |
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
| `isHeading` | a grouping, not a skill (D16). On by default for top-level entries. Surfaces that show skills only skip these; the resume and Skills planet use them as headings. |

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
- Earthlink and HostPro are added as Experiences (done, in production) and
  appear everywhere, like any other job (D17). No visibility tick on
  Experience.

### 4.5 Memories and project technologies

- Memories of type `tech` are retired entirely (D12), not converted to pickers.
  A tech memory duplicated the job's own labels 13 times out of 25; the rest
  either named a technology recorded nowhere else (harvested into a skill use,
  so nothing is lost) or described a piece of work (re-typed as prose).
  `memory` and `code` stay free text.

  Style on the use, not the technology, is what makes this flexible: the same
  technology can be a plain label on one job and a code box on another, and a
  technology drawn as a code box is still a link, so renaming it renames the
  box. Putting style on the technology would fix its look everywhere forever;
  putting it on the job would stop a moon mixing styles. See D14.

  The same applies to `code` memories, which hold technology names too: 8 of
  14 duplicate a label on the same job. They were filed as "code" to get the
  monospace box, which is a styling choice, not a kind of content (D13).

  **What the universe shows on orbit.** Today the floating memories that start
  with the moon orbit draw from all of a job's memories at once, tech and prose
  mixed, with the type changing only the styling. Afterwards the pool is the
  prose and code memories plus the job's linked skill uses, so the two lists
  stop describing the same thing twice. The pool grows (InvestCloud: 9 tech
  memories today, about 17 skill uses after), which is what the visibility tick
  in Q3 has to govern.
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
- **Direction (D9):** retire it. Every site reads the new shapes.

### Size of retiring it (measured 2026-09-21)

About 100 references in about 20 files read the old shapes (`resumeData` 57 in
10 files, `portfolioCores` 26 in 10, moon mapping 10, travel messages 10). The
cinematic site's main file has only 11 direct `resumeData.` reads. The
differences are mostly mechanical:

| Old shape | New shape |
|---|---|
| `id` | `slug` |
| `skills` as `{ category: [names] }` | skill / technology records with a parent |
| core `core`, `coreColor`, `plains[].items[].items[]` | core `name`, `color`, `planes`, entries as their own list linked by `coreSlug` |
| entry `image` (a URL) | `mediaId`, resolved through the release's media table |
| `Projects` | `projects` |
| one nested resume object | separate lists, ordered by `sortOrder` |

What stays, because it is not legacy: resolving media ids to URLs, sorting by
`sortOrder`, and the bundled offline fallback (re-exported in the new shape).

### Order of work (D9)

0. **Step back: retire `toLegacy`.** Full scope in `docs/legacy-translation-retirement.md`. One typed content reader in the new
   shapes; migrate the GoT film (nothing to do), the new portfolio site, then
   the cinematic site, one at a time, each proven by
   before/after screenshots. Bundled fallback converted to the new shape.
   `fromLegacy` and the round-trip test stay only as long as the import script
   needs them.
1. Then the skills consolidation (sections 4.1–4.5), done once.
2. Then the film reads the release.

## 4.7 Naming and de-duplication rules (D11)

**These are migration rules, not a naming policy.** R3-R10 interpret the 124
strings of existing free text once, and then never run again. Afterwards Harma
may name a technology anything, ampersands included: a record called
"Sales & Management" linked to five jobs is five links to one row, which is
what consolidation means. Compounds were only ever a problem because they were
free text repeated per job, and the picker removes that.

Only three rules outlive the migration: case-insensitive uniqueness (R2), one
parent per entry (D7), and an alias pointing at only one record (R8). A name
containing ` + ` or ` & ` earns a dismissible hint in admin ("this looks like
two technologies - split it?"), never a block. Because aliases are kept,
splitting a record in two later is an ordinary admin operation, not a
migration.


Measured 2026-09-22 across the live release and the mock: **124 distinct
technology strings**, of which **47 are compounds** and **7 are pure spelling
collisions** (`HTML`/`html`, `CSS`/`css`, `JavaScript`/`javascript`,
`PHP`/`php`, `MySQL`/`mysql`, `Agile / Scrum`/`Agile Scrum`,
`AWS (EC2 + RDS + S3)`/`AWS EC2 + RDS + S3`). Splitting and case-folding
mechanically yields ~106 atoms, so the rules below are what turn that into a
list worth keeping.

**R1 — One record, one spelling.** A technology is one record in the master
list. Sites render the record's `name`; no site ever displays a typed string.
This is what fixes `html` ×12 / `HTML` ×8 on project tags without anyone
editing the tags.

**R2 — Canonical spelling is the vendor's own.** `JavaScript`, `TypeScript`,
`PHP`, `MySQL`, `PostgreSQL`, `Node.js`, `.NET`, `C#`, `CSS`, `HTML`, `SCSS`.
Uniqueness is enforced case-insensitively: two records whose names fold to the
same key are rejected by the schema, so the collision cannot come back.

**R3 — Compounds split into one record per part.** Separators that split:
` + `, ` / ` (spaced), ` & `, commas, and a trailing parenthetical list.
`React + Redux` → React, Redux. `AWS (EC2 + RDS + S3)` → AWS, EC2, RDS, S3.
`HTML + CSS + JS` → HTML, CSS, JavaScript (via R4).

**R4 — Abbreviations fold to the full name.** `JS` → JavaScript, `SCRUM` →
Scrum, `AGILE` → Agile, `Ecommerce`/`E-commerce` → E-commerce,
`Framer` → Framer Motion, `LAMP Stack` → LAMP.

**R5 — A slash with no spaces is part of the name, not a separator.**
`CI/CD` stays `CI/CD`. (`Agile / Scrum`, spaced, splits.)

**R6 — Proper names are never split**, whatever separator they contain:
`Adobe Test & Target`, `Tax & Financial Content`. The exception list below is
the authority; anything not on it splits by R3.

**R7 — Not every string is a technology.** Phrases that describe work rather
than a tool (`Marketing Microsites`, `Tax & Financial Content`,
`OpenTable Integration`, `Early Internet`) are job content, not master-list
entries. They stay as memories or responsibilities on their job.

**R8 — Every source string is kept as an alias.** Each record carries
`aliases[]`: the exact strings that mapped to it. This makes the migration
auditable (every one of the 124 strings is accounted for), lets the admin
pickers match what Harma types, and means a mistaken merge can be found and
undone later.

**R9 — Highlight words follow the split.** A combined label's
`highlightMatches` are distributed to the parts they belong to, so the
cinematic hover-highlighting keeps working (see Risks).

**R10 — Category headings are not technologies.** `Cloud & DevOps` and
`Data & Messaging` are top-level tree entries and keep their ampersands; R3
does not apply to them.

### Exception list (to review before the migration runs)

| String | Treatment | Why |
|---|---|---|
| `Adobe Test & Target` | one record | product name (R6) |
| `CI/CD` | one record | R5 |
| `Tax & Financial Content` | not a technology | R7 |
| `Marketing Microsites`, `OpenTable Integration`, `IBM iStore`, `Early Internet` | not technologies | R7 |
| `Windows + Mac Support` | one record: "Desktop support" | splitting gives "Windows" and "Mac Support", neither true |
| `Client delivery / consulting` | one record: "Client delivery" | one non-code skill, not two |
| `Dial-up / ISDN / networking` | Dial-up, ISDN, Networking | three real things |
| `Linux hosting / LAMP` | Linux, LAMP | "Linux hosting" is not a separate tool |
| `Shared + Dedicated Hosting` | one record: "Web hosting" | two sales terms for one skill |
| `Animation (GSAP, Framer, Three.js)` | GSAP, Framer Motion, Three.js | drop the wrapper word |
| `.NET/C#`, `Selenium/Java` | split | unspaced, but two products, not a name (R5 exception) |
| `SCSS / design systems` | SCSS, Design systems | both real |
| `CMS / e-commerce platforms` | CMS, E-commerce | both real |
| `Semantic HTML` | HTML | a way of writing it, not a tool |

## 5. What each site sees afterwards

| Site | Change |
|---|---|
| Skills planet | none: `toLegacy` builds the same category → names map from ticked technologies |
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
| ~~Q3~~ | *Settled by D15: on for all, curated before publish.* ~~Should every skill use show as a label on the job moon, or only ticked ones?~~ | |
| ~~Q4~~ | *Settled by D6.* Totals computed by the API at publish time, or by each site from shared code? | Shared code, computed in the site: "now" moves, a published number would go stale. |
| ~~Q5~~ | *Settled by D10.* StormScape's return: second Experience or multiple periods on one? | Second Experience with a `continues` link to the first: smallest schema change, film already works this way. |
| ~~Q6~~ | *Settled by D17: everywhere, like any other job.* ~~Earthlink / HostPro on the resume and cinematic site, or film only?~~ | |
| ~~Q7~~ | *Settled by D8.* Non-code skills (sales, leading engineers) live in the same master list? | Yes, under their own categories, unticked for the resume unless wanted. |
| ~~Q9~~ | *Settled by D7/D8.* A few skills sat in two groups in the mock (Sales in Support & sales and Leadership). With one tree each gets one home. Acceptable? | Yes; pick the home that reads best to an employer. |
| ~~Q10~~ | *Settled by D15.* ~~Show everything in the constellation and lattice, or only `showOnResume` ones?~~ | |
| Q8 | Dates as years or year-months? | **Proposed:** one field accepting either `2018` or `04/2018`, matching Experience dates. A bare year counts as the whole year; rule 1 caps any use at the job's length, so a vague year cannot inflate a total. |

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

- 2026-09-22: draft 5 (i): Q6 recorded as D17 (Earthlink and HostPro appear everywhere), which drops the proposed Experience visibility tick.
- 2026-09-22: draft 5 (h): headings are marked, not inferred from having children (D16), so React and AWS survive the flattened views.
- 2026-09-22: draft 5 (g): every option migrates on and is curated in the copy before the first publish (D15), settling Q3 and Q10.
- 2026-09-22: draft 5 (f): style is a named token on the use, with the appearance defined once in code (D14); including `code` memories then costs nothing, because the look no longer depends on the content type.
- 2026-09-22: draft 5 (e): `code` memories are technology names too; the memory type turns out to be a style switch, so style separates from content (D13).
- 2026-09-22: draft 5 (d): memories keep only prose and code (D12); the tech ones are deleted, harvested or re-typed, and the orbit fly-by reads skill uses instead.
- 2026-09-22: draft 5 (c): the naming rules are migration-only; afterwards any name is allowed and only uniqueness, one parent and alias rules persist.
- 2026-09-22: draft 5 (b): naming and de-duplication rules R1-R10 and the exception list (D11), measured from the 124 live strings.
- 2026-09-22: draft 5: step 0 shipped; section 1b records what is done and what is left. The mock file is the last JSON the app reads.
- 2026-09-21: step 0 has its own doc; it found that the cinematic site reads experiences, skills and the About deck from bundled files, not the API.
- 2026-09-21: removed the dead scrolling-resume files; three sites, not four.
- 2026-09-21: draft 4: retire the translation step first (D9), with its measured size and the new order of work.
- 2026-09-21: draft 3: one home per skill is a hard rule (D7); non-code skills organised from real data later (D8).
- 2026-09-21: draft 2: one tree instead of tree + categories (D4), "current" as a tick (D5), no stored derived data (D6).
- 2026-09-21: draft 1 from the usage analysis and Harma's decisions D1–D3.
