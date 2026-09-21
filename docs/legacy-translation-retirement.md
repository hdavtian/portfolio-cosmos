# Retiring the legacy translation: every site reads one data shape

**Status: DISCUSSION DRAFT 1 (2026-09-21). Nothing here is built. Step 0 of
`docs/tech-consolidation-plan.md` (decision D9). The cinematic site is not
touched until Harma gives an explicit go-ahead for that stage.**

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

### 4.4 Cinematic site (`src/components/`) — needs explicit go-ahead

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
| `legacy/fromLegacy.ts`, `types.ts`, `diff.ts`, `test/legacy-roundtrip.test.ts` | kept only while `api/src/scripts/importContent.ts` (the one-off import from the old files) is still wanted; see Q3 |
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
6. **Remove** the old hooks, `toLegacy`, the old types and the old fallback files.

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
| Q2 | Should the cinematic site really start reading Experiences, Skills and the About deck from the API? It is the point of "one data", but it is a behaviour change. | Yes, after the stage 1 diff shows what would change. |
| Q3 | Keep the one-off import script and its round-trip test, or retire them too once the database is the only source? | Retire after a final verified backup; the files stay in git history. |
| Q5 | Also back up production media files (Azure blob storage, 206 files) before starting? It is a read-only download but needs an Azure sign-in check. Nothing planned deletes or replaces media. | Yes, once, for completeness. |
| Q6 | Keep the bundled fallback at the end, or drop it? Production's database is rarely down. Decide after testing it once, before merging to `main`. | Open. |
| Q4 | Do this on `skills-timeline-lab` or a new branch off `main`? | New branch off `main`: it is independent of the film and should ship first. |

## 10. Change log

- 2026-09-21: Earthlink and HostPro added to the **local** database as draft Experiences by `npm run db:add-early-jobs` (positions 7 and 8; not published). Fallback put behind an off-by-default flag.
- 2026-09-21: Q1 settled: nine jobs everywhere; no per-site flags for now. Every bundled-JSON read becomes an API read, with one generated fallback for when the API is down.
- 2026-09-21: backups taken and verified; data workflow added (section 8).
- 2026-09-21: draft 1.
