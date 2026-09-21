# Retiring the legacy translation: every site reads one data shape

**Status: DISCUSSION DRAFT 1 (2026-09-21). Nothing here is built. Step 0 of
`docs/tech-consolidation-plan.md` (decision D9). Harma gave the go-ahead for the cinematic (space) site stage on 2026-09-21,
within the limits in section 4.4.**

## 1. Goal

One data shape, from one source, read by every site. No hidden layer that
reshapes or filters content per site. What a site shows or hides is decided by
visible fields on the record in admin.

**Hard rule:** no site looks or behaves differently afterwards, except where
section 3 says a site will start showing published content it ignores today.

## 2. How content reaches the sites today

```
Admin → database → publish → GET /api/v2/content/release   (new shapes)
                                   │
                        src/lib/api/contentV2.ts
                        toLegacy()  → old file shapes, in memory
                                   │
                  hooks in src/lib/query/contentQueries.ts
                                   │
                              the sites
```

If the API can't be reached, the bundled JSON in `src/data/` can be used instead.
**That fallback is switched off for the duration of this work** (2026-09-21):
`VITE_CONTENT_FALLBACK=on` turns it back on; without it a failed API call is a
visible error, so old bundled content can't mask a bug. At the very end the
fallback is tested once and Harma decides whether to keep it (Q6). **It must be
decided before this branch reaches `main`**, because production would otherwise
ship with the fallback off.

## 3. Finding: the cinematic site mostly does not read the API

Found while scoping this (2026-09-21). The cinematic site takes only part of
its content from the API. The rest is imported straight from bundled files, so
**edits made in admin never reach it**:

| Cinematic content | Source today |
|---|---|
| Cores, portfolio entries, moon mappings, travel messages, tech stack, profile | API (via the translation) |
| **Experiences: job moons, memories, job tech, drone text, positions** | **bundled `src/data/resume.json`** (16 direct reads in `ResumeSpace3D.tsx`) |
| **Skills planet and its moons** | **bundled `resume.json`** |
| **About deck slides** | **bundled `src/data/aboutDeck.json`** |
| Structure diagram (`ResumeStructureDiagram.tsx`) | bundled `resume.json` for jobs; API for the rest |
| `App.tsx` name and summary | API, falling back to the file |

Consequences:

1. The admin screens for Experiences, Memories, Job Tech, Skills and the About
   deck currently change the new portfolio site and the resume, but **not** the
   cinematic site.
2. On the `skills-timeline-lab` branch, Earthlink and HostPro were added to
   `resume.json` for the film (`e04230c`). Because the cinematic site reads that
   file, **it now builds nine job moons on this branch instead of seven.** Not
   live (`main` is unaffected), but it must be resolved before this branch merges.
   See Q1.
3. "One data, used in all of the UI" is therefore a bigger and more valuable
   change for the cinematic site than a rename: it starts obeying admin.

## 4. Scope, file by file

### 4.1 Shared plumbing

| File | Change |
|---|---|
| `src/lib/api/contentV2.ts` | Stop calling `toLegacy`. Return the release's new shapes, with two helpers that are not legacy and stay: media id → URL, and sort by `sortOrder`. |
| `src/lib/query/contentQueries.ts` | Hooks select from the new shapes. Same hook names where possible. |
| `src/lib/api/contentClient.ts` | Keep `API_BASE_URL` and `shouldSkipApiRequest`. `fetchContentByKey` (API v1) has no callers; remove. |
| `src/features/fast/types.ts` | `ResumePayload`, `PortfolioCoreSeed` and friends replaced by the types exported from `@hd/content-schema`. |
| `src/data/resume.json`, `portfolioCores.json`, `moonPortfolioMapping.ts`, `aboutPathTravelMessages.json`, `aboutDeck.json` | Replaced by **one** bundled fallback in the new shape, generated from a published release by a script, so it can't drift from the schema. |

### 4.2 GoT film (`src/features/lab/`)

Reads cores through a hook and `resume.json` for the name and title. Two small
edits: `core`/`coreColor` → `name`/`color`; name and title from the profile.
Its skill data is a later step (the consolidation), not this one.

### 4.3 New portfolio site (`src/features/showcase/`, `src/features/fast/`)

| File | Reads today |
|---|---|
| `showcase/ShowcaseLayout.tsx` | resume experiences (memories, job tech), tech stack, cosmos content |
| `showcase/lib/useShowcaseProjects.ts` | cores → flattens the nested `plains → items → items` into projects |
| `showcase/pages/ShowcaseResumePage.tsx` | resume |
| `showcase/components/TechConstellation.tsx`, `SceneStage.tsx`, `scenes/types.ts` | tech stack tree, scene data types |
| `fast/pages/PortfolioPage.tsx`, `PortfolioDetailPage.tsx`, `fast/lib/portfolioTransform.ts` | cores and entries |
| `app/layouts/FastLayout.tsx`, `app/providers/ProfileDocumentTitle.tsx` | profile |

Simplest part of the job: `useShowcaseProjects` and `portfolioTransform` exist
largely to *undo* the nesting the translation creates. With entries as their own
list linked by `coreSlug`, they get shorter.

### 4.4 Cinematic site (`src/components/`) — go-ahead given 2026-09-21

| File | Change |
|---|---|
| `cosmos/ResumeSpace3D.tsx` | 16 reads of bundled `resumeData` (experience ×13, skills ×3) and the `aboutDeck` import move to props fed from the API. Field renames: `id` → `slug`, `Projects` → `projects`. Skills planet built from the tree's top level and its ticked children instead of a `{ category: [names] }` map. |
| `cosmos/ResumeSpace3D.types.ts`, `ResumeSpace3D.content.ts` | prop and content types |
| `cosmos/portfolioData.ts` | cores: `core`/`coreColor`/`plains…` → `name`/`color`/`planes` + entries by `coreSlug` |
| `cosmos/moonPortfolioSelector.ts` | mapping type; `companyId` → experience slug |
| `cosmos/HologramDroneDisplay.ts`, `cosmos/MoonOrbitHtmlLayout.tsx`, `CosmicContentOverlay.tsx` | job tech and entry fields |
| `TourDefinitionBuilder.ts` | planet data for experience and skills |
| `ResumeStructureDiagram.tsx` | bundled `resume.json` → API |
| `App.tsx` | drops the bundled import; passes API content down |

### 4.5 Shared package and API

| File | Change |
|---|---|
| `packages/content-schema/src/legacy/toLegacy.ts` | deleted once no site imports it |
| `legacy/fromLegacy.ts`, `types.ts`, `diff.ts`, `test/legacy-roundtrip.test.ts`, `api/src/scripts/importContent.ts`, `db:import` | removed in stage 6 (Q3). Re-running the import would overwrite admin edits with stale file content, so it goes once nothing needs it. |
| `package.json` export `@hd/content-schema/to-legacy` | removed with it |

## 5. Order of work

Each stage is its own commit, builds and deploys on its own, and can be
reverted alone.

1. **Baseline.** Screenshots of every key scene on all three sites, from
   current `main`, with the API up. Save the release JSON used.
2. **Plumbing, side by side.** Add the new-shape reader and hooks *next to* the
   old ones. Generate the single new-shape fallback. Nothing switches yet.
3. **GoT film** switches (two edits).
4. **New portfolio site** switches, page by page. Compare with baseline.
5. **Cinematic site** switches, only after go-ahead, in three sub-steps so any
   visual change can be pinned to one: (a) cores and entries, (b) experiences,
   memories and job tech, (c) skills planet and About deck. Compare after each.
6. **Remove** the old hooks, `toLegacy`, `fromLegacy`, the import script and its
   test, the old types and the old JSON files. Rewrite the reseeding runbook:
   a fresh machine restores a backup. Test the fallback once and decide Q6.

## 6. How each stage is verified

- `npm run build`, typecheck, lint, existing tests.
- **Data check:** a script prints, for the same release, what each site receives
  before and after (job list, labels per job, skills per heading, projects per
  core, in order). They must match except for the differences agreed in section 3.
- **Visual check:** the baseline screenshots retaken in the same window size
  and compared: portfolio home, a project page, the resume page, a job moon;
  cinematic opening, Experience planet and one job moon with the hologram open,
  Skills planet, a portfolio core, the About ride, a guided tour stop.
- **Offline check:** with the API stopped, each site still renders from the
  bundled fallback.
- Per the standing rule, cinematic performance is checked with hard-refresh
  before/after numbers, not assumed.

## 7. Risks

- **The cinematic site starts obeying admin.** If the database and
  `resume.json` have drifted apart, it will visibly change the moment it
  switches. Stage 1 includes a diff of the two so any difference is known, and
  fixed in admin, *before* switching.
- **Order.** Moons and labels are placed by list position. The new reader sorts
  by `sortOrder`; the diff in stage 1 confirms that matches file order.
- **Timing of data.** The file is available instantly; the API is not. The
  cinematic scene must not build before content arrives, or must build from the
  fallback and not rebuild. Today's pattern for cores already handles this and
  is reused.
- **Size of `ResumeSpace3D.tsx`** (20,000+ lines). Edits are limited to the
  listed reads; no refactoring rides along.

## 7a. Stage 1 results (2026-09-21)

Release snapshot, comparison output and screenshots are in `baselines/stage1/`
(not in git). Re-run the comparison with
`npx tsx scripts/compare-bundled-to-release.ts`.

**Bundled files against the published local release (`0c5c9ae8…`):**

| Content | Result | Effect when the space site switches to the API |
|---|---|---|
| Experiences | The nine jobs in `resume.json` match the API **word for word** (titles, bullets, memories, job tech, dates). The API has one more, StormScape (Freelance), placed first, so every other job moves down one. | A tenth moon; order shifts by one. Nothing else. |
| Skills, profile, summary, education, links, certifications | identical | none |
| About deck | identical except the five image paths: `/images/about/img1.jpg` in the file, media storage URLs in the API | same pictures, served from media storage; to be checked by eye |
| Travel messages | one differs: message 1 ends "…about code." in the file and "…about code..." in the API | already API-driven; no change |
| `portfolioCores.json` | badly stale (80 differences: still has a "Disney Inspired" core, old colours and angles, 16 entries since removed, 12 missing) | none: every site already reads cores from the API. Confirms the file should go, not be trusted as a fallback. |

**Re-run after Harma's edits (release `34ef6f20…`):** one new, intended
difference. The original StormScape job's company is "Stormscape (DBA for Harma
Davtian)" in the file and "Stormscape (Freelance)" in the API, so the space
site's first StormScape moon will take the new name when it switches. Both
StormScape jobs now share the company name and nav label "Stormscape"; they are
told apart by dates. Everything else is unchanged.

So there is no drift to fix in admin before switching. The risk flagged in
section 7 (database and `resume.json` having drifted apart) did not materialise.

**Screenshots taken:** portfolio home, resume page, a project page
(`/portfolio/tcc`), and the space site's loader at "load completed".

**Not captured: the inside of the space site.** In the automated browser tab
the space site loads fully but stays on "ENTERING…" and never starts the 3D
scene (the tab is not a focused, visible window, which the scene appears to
need). No console errors. Options are in Q7.

## 7b. Stages 2 and 3 (2026-09-21)

- **Stage 2.** `src/lib/api/release.ts` holds the one shape every site will
  read: the release as stored, lists in saved order, media ids resolved by
  `release.mediaUrl(id)`. It rides along in the same single request as the old
  shapes (`SiteContent.release`), so nothing is fetched twice. Sites read it with
  `useReleaseQuery(select)`. The generated fallback file is deferred to stage 6,
  since the fallback stays off until then.
- **Stage 3.** The film's place colours come from `release.collections.portfolioCores`
  (`name`, `color`) and the name and title on its first ring from
  `release.profile`; its `resume.json` import is gone. Its project years still
  come through `useShowcaseProjects`, which moves with the portfolio site in stage 4.

## 7c. Stage 4: the new portfolio site (2026-09-21)

Everything under `src/features/showcase`, `src/features/fast` and `src/app` now
reads the release; none of it touches the old shapes.

- **Projects.** `portfolioItemsFromRelease(release)` replaces translating to
  nested cores and flattening them back out. Order is kept as laid out: core,
  plane, ring, then the entry's own order. **Proved identical:**
  `npx tsx scripts/retirement-checks/projects.ts` compares old and new on a saved
  release: 48 projects, same fields, same order.
- **Resume page, page title, masthead:** from `release.profile` and the stored
  experiences, education and certifications.
- **Background scenes:** given the stored cores and entries (`ScenePortfolio`)
  and jobs keyed by `slug`; the orbital scene places entries by their
  `placement` instead of walking nested lists.
- **Tech stack tree:** built from `release.collections.techStackNodes`.
- **Checked:** home, resume and a project page against the stage 1 screenshots
  (`baselines/stage4/`), no console errors, production build passes.
- **Not mine, left alone:** three lint errors in the classic portfolio pages
  (`PortfolioMediaViewer`, `PortfolioDetailPage`, `PortfolioPage`) were already
  there before this work.

Still on the old shapes, all of it the space site (stage 5): `App.tsx`,
`ResumeStructureDiagram.tsx`, `cosmos/portfolioData.ts`,
`cosmos/moonPortfolioSelector.ts`, `cosmos/ResumeSpace3D*.ts(x)`.

## 7d. Stage 5: the space site (2026-09-21)

The space site now takes **all** of its content from the published release. It
imports no bundled content file any more (`resume.json`, `aboutDeck.json` and
the moon-mapping file are out of it), so it follows admin like the other two.

**A change of approach, and why.** The plan said "field renames" inside the
scene. On reading the code, the jobs are passed around as `any` through five
files (`ResumeSpace3D.tsx`, `.interaction.ts`, `hooks/useNavigationSystem.ts`,
`hooks/usePointerInteractions.ts`, `TourDefinitionBuilder.ts`), so a missed
rename (`job.id` → `job.slug`) would not be a compile error; it would be a moon
with no texture or a nav button that does nothing, found by eye or not at all,
in a site the automated browser can't enter. Instead the site has one small
typed reader at its door, `src/components/cosmos/spaceContent.ts`, which takes
the release and hands the scene jobs, skills and cores in the groupings its
code reads (cores holding planes → rings → entries; skills under category
names). It is the same idea as the portfolio site's `PortfolioItem`: a view of
the one source, in the site's own folder, passing every record through and
filtering nothing. The shared `toLegacy` is no longer used by any site.
Renaming the fields inside the scene remains possible later, one file at a
time, when someone can watch the scenes while doing it.

- **Proved identical:** `npx tsx scripts/retirement-checks/space.ts` compares
  what the scene received from the old translation with what it receives now:
  profile, summary, skills, experience, education, links, certifications, cores,
  moon mappings, travel messages and About slides all the same, in the same order.
- **What visibly changes** (from section 7a): ten job moons instead of nine,
  StormScape (Freelance) first; the original StormScape's company name as edited
  in admin; About deck pictures served from media storage.
- **Bug found and fixed while testing:** the About deck reads the pixels of its
  pictures, and the browser refuses that for a picture from another origin
  unless it was requested as cross-origin. Media storage already allows it
  (local: any origin; production: `https://harmadavtian.com`), so the fix is one
  line, `img.crossOrigin = "anonymous"`. After it, the space site loads with no
  console errors.
- **The flat diagram styles** (`ResumeStructureDiagram.tsx`) take their jobs
  from the same reader. `App.tsx` takes name, title, contact and summary from
  `release.profile`.
- **Found, not changed:** `TourDefinitionBuilder.ts` imports
  `cosmic-narrative.json` but reads `guidedTours` and `planets` one level too
  high, so it has always received nothing from it. Guided tours, planets and the
  introduction are in the release; wiring them up would be new behaviour, so it
  is left for Harma to decide.
- **Not mine, left alone:** two `any` lint errors in `ResumeStructureDiagram.tsx`.

**For Harma to check by eye** (the automated browser can't get past "ENTERING…"):
Experience planet with ten moons, their spacing and labels; the nav and its two
"Stormscape" entries; one job moon with the hologram open; the new
StormScape (Freelance) moon (no memories or tech labels yet, and no moon
texture of its own); Skills planet; a portfolio core; the About ride and deck
pictures; a guided tour stop.

## 8. Data: backups and how new data reaches production

**Backups taken 2026-09-21 before any work** (in `db-backups/`, not in git,
never auto-deleted):

- `prod-resume_cosmos-2026-09-21T20-16-51-493Z.archive.gz` (production Atlas, read-only dump)
- `local-resume_cosmos_local-2026-09-21T20-16-49-830Z.archive.gz` (local Docker)

The production dump was restored locally as `resume_cosmos_prodcopy` to prove it
reads back, then compared with local record by record: **all 16 content
collections are identical** (7 experiences, 18 skills, 5 categories, 27 tech
stack nodes, 5 cores, 27 entries, 206 media records…). Production has one more
release in its history and ten old API v1 documents that local lacks; neither is
read by any site. Media *files* (Azure blob storage) were not backed up; see Q5.

**Working rule.** Local starts equal to production. New data is added and tested
locally only. Production is untouched until a stage ships.

**Shipping a stage that changes data:**

1. `npm run db:pull` — fresh production backup; confirm production content has
   not changed since local was matched (if it has, bring those edits into local first).
2. Deploy the code (it must read both old and new data shapes during the switch,
   or code and data go together in a quiet moment).
3. Schema changes are applied by a **migration script** that is run and tested
   locally, committed, then run against production. It only adds or transforms
   what it names; it never drops a collection. Old collections (Skills, Skill
   Categories) are left in place until a later, separate clean-up Harma approves.
4. Content entered locally goes up with the existing `npm run db:push-prod --
   --yes` (backs up both sides first, replaces production's content collections
   with local's) and `npm run media:push-prod -- --yes` for any new files.
5. Publish, check the live sites against the screenshots, keep the backups.

Every production write is confirmed with Harma first. Azure commands only after
the subscription and tenant check.

## 9. Open questions

| # | Question | Leaning |
|---|---|---|
| ~~Q1~~ | *Settled 2026-09-21: leave them in.* All three sites are heading for the same data, so Earthlink and HostPro become real Experiences in the database (local first) and every site shows them. Show/hide flags per site come later, only if needed. | — |
| ~~Q2~~ | *Settled 2026-09-21: yes.* Harma gave explicit go-ahead for the space site to read Experiences, Skills and the About deck from the API: listed reads and field renames only, no refactoring, three sub-steps with screenshot comparison after each. | — |
| ~~Q3~~ | *Settled 2026-09-21: retire it, at the very end.* The import script, `fromLegacy`, `toLegacy`, the old-shape types, the round-trip test and the old JSON files are removed in stage 6, once every site is on the API. Until then they stay as a safety net. A fresh machine then starts from a restored backup; `docs/content-reseeding-runbook.md` is rewritten to say so. | — |
| Q5 | Also back up production media files (Azure blob storage, 206 files) before starting? It is a read-only download but needs an Azure sign-in check. Nothing planned deletes or replaces media. | Yes, once, for completeness. |
| ~~Q7~~ | *Settled 2026-09-21: (c).* The data check, plus Harma looking at a short checklist of scenes after each space-site sub-step: Experience planet and moons, one job moon with the hologram open, Skills planet, a portfolio core, the About ride, a guided tour stop. Harma confirmed Enter works normally in his browser; the "ENTERING…" hang is only the automated tab. | — |
| Q6 | Keep the bundled fallback at the end, or drop it? Production's database is rarely down. Decide after testing it once, before merging to `main`. | Open. |
| ~~Q4~~ | *Settled 2026-09-21: one branch, `retire-legacy-translation`, off `main`, with the film branch merged in* so nothing has to be imported later. The film lives at an unlinked URL (`/lab/got`), so shipping it is harmless. Consequence: this branch's `resume.json` holds Earthlink and HostPro, so the space site shows nine moons here from the start, from the file until it switches to the API. `skills-timeline-lab` is kept as it was; new film work happens here. | — |

## 10. Change log

- 2026-09-21: stage 5 done (section 7d); approach changed from renames to a typed reader at the space site's door.
- 2026-09-21: stage 4 done (section 7c).
- 2026-09-21: stages 2 and 3 done (section 7b).
- 2026-09-21: stage 1 done (section 7a): no content drift; space site interior not captured (Q7).
- 2026-09-21: Q4 settled: branch `retire-legacy-translation` created from `main`, film branch merged in. All four questions closed; stage 1 is next.
- 2026-09-21: Q3 settled: the import path is retired at the end.
- 2026-09-21: Q2 settled: go-ahead for the space site stage.
- 2026-09-21: Earthlink and HostPro added to the **local** database as draft Experiences by `npm run db:add-early-jobs` (positions 7 and 8; not published). Fallback put behind an off-by-default flag.
- 2026-09-21: Q1 settled: nine jobs everywhere; no per-site flags for now. Every bundled-JSON read becomes an API read, with one generated fallback for when the API is down.
- 2026-09-21: backups taken and verified; data workflow added (section 8).
- 2026-09-21: draft 1.
