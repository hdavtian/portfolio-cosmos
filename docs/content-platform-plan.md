# Content Platform Plan

Admin-managed content for both experiences (portfolio site and Three.js cosmos),
so content changes never require a code deploy. Code deploys are reserved for
new features, experiences, and templates.

Status (2026-09-17): **phases 0–1 live**. Phases 2 (API v2) and 4 (admin), plus
the portfolio redesign, are complete on `feature/content-platform-phase-4`
(pushed, not merged). **Phase 3 (infrastructure) in progress.** See
"Current rollout" below.

## Current rollout (2026-09-17)

Production today runs phases 0–1: the old site build on GoDaddy and the v1 API on
`harma-api`. Everything after that lives on `feature/content-platform-phase-4`,
and merging it to `main` deploys **both** the public site (GoDaddy FTP) and the
API, so the order below matters.

Also on that branch, beyond the original phases:

- **Portfolio redesign** (`src/features/showcase`) at `/`, projects at
  `/portfolio/:id`, resume at `/resume`; the previous pages stay at
  `/portfolio-classic` until retired. Background scenes are fragments of the
  cinematic universe.
- **Three.js changes, approved by Harma ahead of the phase 7 gate:** the cinematic
  pause flag and keep-alive host (`src/lib/cinematicSuspend.ts`,
  `src/app/cinematic/`), a "Back to main site" link, and removal of the hidden
  arrow-key resume sections. The cinematic app already reads v2 content.

Next steps, in order:

1. **Phase 3 — infrastructure** (no merge needed; existing resources only):
   1. ✅ **Done 2026-09-17.** Storage account `sthdsharedprod` (`rg-portfolio-prod`,
      West US 2, Standard_LRS, Hot, TLS 1.2, HTTPS only), blob soft delete 7 days,
      container `media` with anonymous blob read, CORS GET/HEAD/OPTIONS for
      `https://harmadavtian.com`, `https://www.harmadavtian.com` and
      `https://portfolio-admin.harmadavtian.com` (the WebGL background scenes
      read screenshots cross-origin). Created through the management plane; no
      storage keys used or stored.
   2. ✅ **Done 2026-09-17.** System-assigned managed identity on `harma-api`
      (principal `7cde9497-7517-4b08-b3a1-c21f8005ce43`), *Storage Blob Data
      Contributor* scoped to `sthdsharedprod` only. The API picks it up through
      `AZURE_STORAGE_ACCOUNT=sthdsharedprod` (`DefaultAzureCredential`), set with
      the other app settings in step 3 so `harma-api` restarts once.
   3. ✅ **Done 2026-09-17.** `harma-api` app settings: the **current** shared
      `AUTH_PASSWORD_HASH` / `AUTH_COOKIE_SECRET` (copied from the group apps by
      script, never printed; no rotation), `AUTH_COOKIE_DOMAIN=.harmadavtian.com`,
      `AZURE_STORAGE_ACCOUNT=sthdsharedprod`, `AZURE_STORAGE_CONTAINER=media`,
      `MEDIA_PUBLIC_BASE_URL=https://sthdsharedprod.blob.core.windows.net/media`,
      `CORS_ORIGINS` (site apex, www, admin). `scrolling-resume` added to the
      shared-login `apps.json` (env path `api/.env.production.local`), so a
      future `creds:set` updates it; Azure must then be updated as for the other
      apps. v1 still serving after the restart (`/healthz`, `/api/v1/content/resume` 200).
   4. ✅ **Built 2026-09-17, ships with the merge.** `api/src/adminSite.ts` serves
      the admin SPA when the request host is `ADMIN_HOST`
      (default `portfolio-admin.harmadavtian.com`): hashed assets immutable,
      `index.html` no-cache, SPA fallback, CSP allowing images from the media
      origin; API paths (`/api/*`, `/healthz`, `/swagger`, `/openapi.json`) on
      that host fall through to the API, other hosts never see the admin. The
      deploy workflow builds the admin (`npm run build:admin` with secret
      `SYNCFUSION_LICENSE_KEY`, set 2026-09-17 from the root `.env`) and
      `make-api-deploy` ships it as `admin/` next to `dist/`.
      **Fixed a deploy blocker found here:** `tsc` output imported
      `@hd/content-schema` as TypeScript source, which the deploy package omits,
      so the v2 API would have crashed on start in Azure. The API now builds
      with esbuild into one `dist/server.js` (`scripts/build-api.mjs`, workspace
      packages inlined, npm dependencies external) after a `tsc --noEmit`
      typecheck. Verified: assembled the real deploy package, installed
      production dependencies, ran it with `NODE_ENV=production` — admin pages
      and assets 200 on the admin host, API routes 200 on it, admin 404 on other
      hosts, login page renders with no CSP errors.
   5. Phase 2 leftovers: rate limiting on admin writes, request logging,
      production CORS allowlist. Watch B1 plan memory.
2. **Merge `feature/content-platform-phase-4` to `main`.** Deploys API v2, admin
   and the redesigned site together. Until release 1 exists the site renders
   its bundled content snapshot, so nothing breaks in between.
3. **Phase 5 — production data.** `db:pull` backup of Atlas, import, upload the
   202 images, publish release 1, confirm the live site reads the API (not the
   fallback). *Approval.*
4. **Phase 6b — stabilize.** Real admin use; decide when to retire
   `/portfolio-classic`, the v1 routes and bundled JSON.
5. **Phase 7/8 — Three.js admin + retrofit**, partly done (the cinematic app
   already reads v2 content).

### Phase 0 notes

- npm workspaces: root (site), `api`, `packages/*`. `api/package-lock.json` is
  gone; the root lockfile is the only one.
- `tsx` is pinned to the same `esbuild` as Vite through `overrides`. Without it,
  npm skips the ARM64 binary for a second nested esbuild copy on this machine
  (Windows ARM64) and the install fails.
- API deploy: dependencies are hoisted to the root, so CI assembles a standalone
  `api-deploy/` folder (`scripts/make-api-deploy.mjs`: built `dist`, production-only
  `package.json`, root lockfile) and installs production dependencies there.
  Verified locally: locked versions match, no dev packages, server boots and
  answers `/healthz`.
- Local stack: `npm run dev:full` (add `-- --seed` to seed from `src/data`) starts
  Docker MongoDB (`resume_cosmos_local`) + Azurite, the API and Vite. Local env is
  injected from `scripts/local-env.mjs` and overrides `api/.env`, so local runs
  cannot reach production Atlas.
- `npm run az:guard` implements the section 8 identity guard.
- `packages/content-schema` holds shared primitives (slug, object id, media ref,
  sort order, CSS color, document meta) and API contracts (error envelope, list
  query, paged result), with tests validated against current content.
- Tests: `npm test` (Vitest in `api` and `packages/content-schema`).
- Syncfusion rules: `.claude/skills/syncfusion-list-pages` and
  `.claude/skills/syncfusion-edit-dialogs`, adapted from Hydrodent. A central
  reference copy for future apps is still to be decided (no central folder exists yet).
- The API deploy workflow's "Configure startup and health check" step had failed
  on every run since April (`az webapp config set` has no `--health-check-path`).
  Fixed; the first successful workflow deploy ran on 2026-09-15.

### Phase 1 notes

- **Scope decision (Harma, 2026-09-15):** content no longer read by either
  experience is not modeled: `aboutHallLevels.json`, `aboutHallSlides*.json`,
  `aboutContent.json` (removed from code in `bd47ff5`) and `legacyWebsites.json`.
  The legacy sites are modeled from their copy inside `portfolioCores.json`,
  which is what both experiences render.
- **Not modeled from `cosmic-narrative.json`** (never read): planet
  `cameraPositions`, `visualEffects`, `moons`, and `navigationModes`,
  `ambientElements`. Listed in `LEGACY_EXCLUDED_PATHS`.
- **Model:** singletons `profile`, `cosmosIntroduction`; collections
  `education` (1), `certifications` (1), `links` (5), `skillCategories` (5),
  `skills` (18), `experiences` (7), `portfolioCores` (6), `portfolioEntries` (47),
  `moonPortfolioMappings` (6), `aboutDeckSlides` (3), `pathTravelMessages` (17),
  `guidedTours` (3), `cosmosPlanets` (3); `media` (202 images).
- **Deviations from section 3:**
  - Owned children are embedded (positions, projects, job memories, gallery
    items, client variants, deck blocks), not separate collections.
  - `jobTech` stays a list of labels with `highlightMatches`, not references to
    `skills`: labels such as "React + Redux" are not skill names.
  - Entities reference each other by slug; media by id (stored as ObjectId).
  - Portfolio orbit layout: planes and rings live on the core; each entry has a
    `placement { plane, ring }`.
- **Proof of completeness:** `fromLegacy` → `toLegacy` round-trip test, and
  `npm run db:import` reads everything back from MongoDB and diffs it against
  `src/data`: 0 differences. Re-running the import changes nothing.
- **Import safety:** the importer refuses any MongoDB or storage target that is
  not local Docker.
- **`api/.env` targets local Docker** (MongoDB `resume_cosmos_local` + Azurite),
  so running any API script directly cannot touch production. Production values
  live in Azure app settings; a local copy may sit in the git-ignored
  `api/.env.production.local`, which only `db:pull` reads. `db:pull` resolves the
  production URI from `MONGODB_URI`, then that file, then Azure app settings
  (behind the az guard).
- **Media:** blob names are URL-safe (spaces → hyphens, five legacy-web files);
  records keep the original `sourcePath`.
- **Backups:** `npm run db:pull` dumps Atlas via the `mongo:8.0` Docker image
  (verified: 12 documents); `npm run db:restore-local` restores into
  `resume_cosmos_prodcopy`. Local MongoDB is pinned to 8.0 to match Atlas.
- **Found, not fixed (Three.js, gated):** `TourDefinitionBuilder` looks up
  `guidedTours` by key and a `narrative` field that does not exist, so tour
  narratives are always empty.

### v1 API pruned (2026-09-15)

Harma: the unused endpoints were "just confusing". v1 is now reduced to what the
site actually calls:

- Kept: `GET /api/v1/content/{key}` for `resume` and `portfolio-cores` only —
  these are what `src/lib/api/contentClient.ts` requests.
- Removed: `GET /api/v1/content` (listing) and all ten per-key routes, which no
  experience ever called; plus `getAllContent`/`getByKnownKey`/`findAllActive`.
- Retired keys return **404 without a database round trip**. Their documents are
  left in Atlas untouched (no automatic deletion).
- `seedContent.ts` now seeds only those two keys.

**Direction for v2 (Harma, 2026-09-15):** both experiences will read **one
shared data source** — v2 replaces this surface for the Three.js site and the
mainstream portfolio alike. Harma also intends to **redo the fast/mainstream
portfolio**, so phase 6 is likely a rebuild on v2 rather than a retrofit of the
current pages; scope that when phase 6 starts. Data changes he wants are folded
into the phase 2/4 work rather than patched into v1.

### Phase 2 notes (API v2)

Branch `feature/content-platform-phase-2`. Landed so far, each with tests:

- **Shared sign-on** ported from `shared-login-for-personal-apps`
  (`api/src/auth/`): scrypt hashes and HMAC tokens kept byte-compatible, so one
  login still covers learn/jobs/portfolio-admin. `requireAuth` denies by
  default; `/healthz` and the auth endpoints are public.
- **Admin CRUD** (`/api/v2/admin/...`) generated from `collectionSchemas`, so
  every entity gets list/create/read/update/delete/reorder from one
  implementation: server-side paging, sorting, escaped search, optimistic
  concurrency (409), unique-slug violations as field-level 400s, singleton
  get/put with the same version check.
- **Media library** (`/api/v2/admin/media`): type checked by magic bytes, not
  the client's content type; re-encoded through sharp, which strips EXIF;
  deletes refused while any record still references the image (checked across
  nested gallery items, client variants and deck blocks).
- **Releases**: publish freezes a validated snapshot; the public API serves only
  the release marked `current`; rollback republishes old content as a new
  release so history stays append-only (partial unique index guarantees one
  current release). Publishing is refused on unsaved singletons, invalid drafts
  (with field paths) or dangling media references.
- **Public content API** (`/api/v2/content/...`): whole bundle or one area, with
  ETag/304 revalidation and short caching; `?preview=draft` serves drafts to a
  signed-in admin only, never cached.
- **OpenAPI generated from the Zod schemas** (`api/src/swagger/buildOpenApi.ts`),
  replacing the hand-written document; served at `/openapi.json` and `/swagger`.

**Deviations worth remembering:**

- **Integration tests run against Docker MongoDB**, not `mongodb-memory-server`:
  MongoDB publishes no Windows ARM64 build, so its downloader cannot work on
  this machine. Tests use a throwaway database and skip (not fail) when Docker
  is down — so check for "skipped" before trusting a green run.
- **Media is keyed by `blobPath`**, not `slug`; `EntityRepository` takes the
  natural key field for that reason.
- **Entity schemas are inlined in the OpenAPI document, not named components.**
  `extendZodWithOpenApi` patches zod's factory functions, so only schemas
  created after that call gain `.openapi()`. Schemas imported from
  `@hd/content-schema` are created when that module loads, which ESM always
  evaluates first, so they can never be registered by name. Do not "fix" this
  with import-order tricks; it breaks as soon as another module imports the
  package first.
- **`@hd/content-schema` uses explicit `.js` extensions** on relative imports:
  the API compiles with NodeNext, which requires them. Without them the package
  fails to load and surfaces as phantom "no exported member" errors.

**Still to do in phase 2:** rate limiting on write routes, structured logging
(pino, replacing morgan), and wiring `AUTH_COOKIE_DOMAIN` plus the production
CORS allowlist — the last two belong with the phase 3 infrastructure step.

---

## 1. Decisions

| Area | Decision | Why |
|---|---|---|
| Database | MongoDB Atlas M0 (`cluster0.lvqlc1u`, db `resume_cosmos`) — real MongoDB | $0, already wired, goal is hands-on MongoDB; limits (0.5 GB, 100 ops/s) are far above a content workload |
| Local database | MongoDB 8 in Docker (`docker-compose.yml`) | Offline, disposable, never touches production |
| Backups | `npm run db:pull` via `mongodump` (manual, run locally) | M0 has no backups. No automatic deletion of dumps |
| Media | New shared storage account in `rg-portfolio-prod`, container `media`, prefix per app (`scrolling-resume/…`) | S3-equivalent, cents/month; shared by future personal apps. Disney storage left untouched |
| Media auth | `harma-api` system-assigned managed identity, role *Storage Blob Data Contributor* on that account only | No storage keys anywhere |
| API | Existing `api/` (Express 5 + TypeScript + Mongoose + Zod), extended | Keep the stack, add write paths properly |
| Auth | Shared `hd_session` single sign-on (`C:\sites\shared-login-for-personal-apps`) | One login across `*.harmadavtian.com` |
| Admin location | **`https://portfolio-admin.harmadavtian.com`** — a second hostname on the existing `harma-api` app (decided 2026-09-16, replaces the earlier `/admin`-on-the-public-site plan) | Reuses the app, B1 plan, pipeline and managed-cert pattern: no new Azure resources. Admin and API share one origin, so no CORS and a first-party session cookie. Admin code stays off the public site |
| Admin UI | Syncfusion (own Community License key), following Hydrodent's `list-pages-syncfusion` and `add-edit-overlays-syncfusion` rules | Licensed, full control suite (grid, uploader, RTE, color picker, dialogs) |
| Content model | Fully structured entities (no raw JSON editing) | Admin must cover nearly all content |
| Publishing | Draft → Preview → Publish, immutable release snapshots, one-click rollback | Protects production; previewing 3D layout values is essential |
| Site data loading | Runtime API via TanStack Query, bundled fallback snapshot | Publishing shows up without a redeploy |
| Rollout order | Admin + **mainstream portfolio** first; Three.js untouched until that is stable | Prove data entry, grids and dynamic rendering on the simpler site before touching the 3D code |
| Old Cosmos DB | `harma-portfolio-cosmos` deleted 2026-09-15 (verified empty) | — |

## 2. Architecture

```
harmadavtian.com (GoDaddy, static SPA)
 ├─ /            portfolio experience ─┐
 ├─ /cosmos      Three.js experience  ─┼─ GET published content (public, cached)
 └─ /admin       Syncfusion admin     ─┴─ CRUD / upload / publish (hd_session cookie)
                                          │
api.harmadavtian.com (harma-api, App Service B1, managed identity)
 ├─ MongoDB Atlas M0  (drafts, releases, media metadata, audit)
 └─ Azure Blob Storage (media binaries)  ── public read URLs served to sites
```

Cookie note: `harmadavtian.com` and `api.harmadavtian.com` are same-site, so the
`SameSite=Lax` shared cookie is sent on `fetch(..., { credentials: "include" })`.
CORS must switch to `credentials: true` with an explicit origin allowlist.

## 3. Content model

Three data kinds were found mixed in `src/data`, and each is handled differently:

- **Content** (text, dates, images, relationships) → normal form fields.
- **Presentation** (per-item layout/timing/styling: `width`, `holdMs`, `border`,
  `fontShadow`, `revealPattern`, `nextSlideTriggerMode`, `colorFamily`, orbit
  colors/angles) → typed fields on an **Appearance** tab (numeric ranges,
  color picker, enum dropdowns). Never free-form JSON.
- **Engine settings** (`ambientElements.*` flags, soundtrack filenames,
  navigation-mode `controls`) → stay in code. They are features.

### Entities

Singletons are one document; collections have `sortOrder` and stable `slug` ids
(existing ids such as `investcloud`, `hs-slide-1` are preserved).

**Resume**
- `profile` *(singleton)* — name, title, email, phone, location, summary
- `education`
- `certifications`
- `links`
- `skillCategories` → `skills`
- `experiences` — company, navLabel, location, dates, droneIntroText
  - `positions` — title, dates, responsibilities[]
  - `projects` — title, summary, …
  - `jobMemories` — type, text
  - `jobTech` — references to `skills` (+ `highlightMatches`)

**Portfolio**
- `portfolioCores` — core name, color, moon mapping (replaces
  `moonPortfolioMapping.ts`: companyId → experience ref, tabs, include/exclude)
- `portfolioEntries` — tree via `parentId` (replaces `plains[].items[].items[]`),
  presentation: orbit plane angle, orbit color
- `legacySites` → `clientVariants` → gallery media

**About**
- `aboutPage` *(singleton)* — headline, subline, bioShort, locationLine,
  principles[], proofPoints[], callToAction
- `aboutCards` — title, body, media ref; appearance: revealPattern, durationMs
- `aboutDeckSlides` — template + content; appearance: holdMs, explodeAfter
- `hallLevels` — label, shortLabel, order, default; appearance: autoSpeed,
  start/first positions, levelTransition.*
- `hallSlides` — belongs to a level; template + content; appearance: size,
  alignment, border, trigger mode/thresholds
- `pathTravelMessages` — text; appearance: font family/size/color/shadow

**Cosmos**
- `narrative` *(singleton)* — introduction title/subtitle/description
- `guidedTours`
- `planets` — cosmicName, description, atmosphere

**Shared**
- `media` — blob path, public URL, mime, width/height, bytes, alt text, focal
  point, tags, usage count. Entities reference media by id, never by path.

### Schema-first

A workspace package `packages/content-schema` defines every entity with Zod once:

- API validates requests with it.
- Admin forms derive validation rules and field metadata from it.
- Both sites get their TypeScript types from it.
- **Templates** (slide/card layouts) are a code registry: `template` key →
  content schema + appearance schema + renderer. The admin generates the
  Appearance form from the template's schema. New template = code deploy; new
  slide using an existing template = admin only.

## 4. Publishing model

- All admin edits write to **draft** documents (`status`, `updatedAt`,
  `updatedBy`, `version` for optimistic concurrency).
- **Publish** builds an immutable `releases` document: a full, validated
  snapshot of all published content, plus notes and timestamp.
- Public reads serve only the **current release** (`GET /api/v2/content/…`),
  with `ETag` + `Cache-Control`, so they are cheap on M0.
- **Rollback** marks an older release as current.
- **Preview**: signed-in admin opens `/?preview=draft` or `/cosmos?preview=draft`;
  the sites then request draft content with credentials.
- Publish is blocked if any draft fails schema validation or references a
  missing media/entity.
- `auditLog` collection records create/update/delete/publish/rollback.

## 5. API design (`api/`)

Keep the existing layering (controller → service → repository) and add:

- **Versioning**: new `/api/v2`. `/api/v1` stays until the retrofit finishes,
  then is removed.
- **Routes**
  - Public: `GET /api/v2/content/release` (full bundle),
    `GET /api/v2/content/:area` (`resume`, `portfolio`, `about`, `cosmos`)
  - Admin (auth): `GET|POST /api/v2/admin/:entity`,
    `GET|PATCH|DELETE /api/v2/admin/:entity/:id`,
    `PUT /api/v2/admin/:entity/order`, singletons `GET|PUT /api/v2/admin/singletons/:name`
  - Media (auth): `POST /api/v2/admin/media` (multipart), `PATCH`, `DELETE`
    (blocked while referenced)
  - Releases (auth): `GET /api/v2/admin/releases`, `POST …/publish`,
    `POST …/:id/rollback`, `GET …/diff`
  - Auth: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`,
    `GET /api/v1/auth/session` (shared contract, unchanged paths)
- **Server-side list queries** for Syncfusion grids: paging, sort, filter,
  search with an allowlist of fields; `pageSize` max 100.
- **Practices**
  - Zod validation on params/query/body; uniform error envelope
    `{ error: { code, message, details[], requestId } }` (same as the shared-login apps)
  - Request ids, `pino` structured logging (replace `morgan`)
  - `helmet`, strict CORS allowlist with credentials, `express-rate-limit` on
    login and write routes
  - Optimistic concurrency (`If-Match` / `version`) → `409` on conflict
  - Uploads: `multer` memory storage, mime + magic-byte check, size cap,
    `sharp` to strip EXIF and produce web-optimized variants (WebP + original)
  - Fail-fast env config (existing Zod env), new vars:
    `AUTH_PASSWORD_HASH`, `AUTH_COOKIE_SECRET`, `AUTH_COOKIE_DOMAIN`,
    `AUTH_SESSION_TTL_SECONDS`, `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`,
    `MEDIA_PUBLIC_BASE_URL`, `CORS_ORIGINS`
  - `@azure/identity` `DefaultAzureCredential` + `@azure/storage-blob`
    (managed identity in Azure; Azurite in Docker locally)
  - OpenAPI generated from the Zod schemas (`@asteasolutions/zod-to-openapi`),
    served at `/swagger`
- **Tests**: Vitest + Supertest against `mongodb-memory-server`; auth gate,
  validation, concurrency, publish/rollback, media reference protection.

## 6. Admin (`/admin`)

- `syncfusion-license.ts` registers `VITE_SYNCFUSION_LICENSE_KEY` (Harma's own
  key, never Hydrodent's). The variable belongs in the **repo-root `.env`** —
  Vite does not read `api/.env` — and in the GitHub Actions secret
  `SYNCFUSION_LICENSE_KEY` for production builds. See the root `.env.example`.
  **Open item:** the current key is a 7-day trial expiring ~2026-09-23; swap in
  the permanent Community Licence key when it arrives.
- Copy Hydrodent's two Syncfusion skills into this repo (`.claude/skills/`), and
  a reference copy to a central folder for future apps.
- **Login** page using the shared auth endpoints; route guard via
  `GET /auth/session`.
- **Dashboard**: draft vs published status, unpublished change count, last
  release, recent audit entries, media storage used, API/DB health.
- **Entity pages**: Syncfusion Grid (paging 25, sort, filter, search, column
  chooser, grouping, reorder, resize, row drag to reorder) + `DialogComponent`
  add/edit with `FormValidator`; tabs *Content* / *Appearance*; nested children
  (positions, variants, hall slides) as child grids.
- **Controls**: TextBox, NumericTextBox (ranges from schema), DropDownList /
  MultiSelect for references, ColorPicker, DatePicker, RichTextEditor (only
  where content is rich), Uploader.
- **Media library**: grid/tiles, upload with progress, alt text + focal point,
  "used by" list, replace-in-place.
- **Releases**: publish with notes, release history, diff vs current, rollback,
  "Preview draft" buttons for both experiences.
- **Data**: TanStack Query for all admin reads/mutations (query keys per entity,
  invalidation on mutation); `DialogUtility` for confirms/errors.

## 7. Site retrofit

### Rollout gate

The two experiences are retrofitted in sequence, not together:

1. **Mainstream portfolio** (the plain, data-driven site; to be renamed later)
   is the proving ground. Admin data entry, Syncfusion grids, validation,
   publishing and dynamic rendering are debugged against it first.
2. **Three.js experience is not touched** during that period. It keeps importing
   `src/data/*.json` exactly as today, and `/api/v1` plus those files stay in
   place.
3. The Three.js retrofit starts **only after Harma confirms** the admin and the
   mainstream portfolio are stable.

Consequences while the gate is closed:

- Admin edits appear on the mainstream portfolio only. The Three.js site keeps
  showing the bundled JSON, so the two can differ; that is expected.
- Admin pages for Three.js-only entities (`hallLevels`, `hallSlides`,
  `aboutDeckSlides`, `pathTravelMessages`, `narrative`, `guidedTours`,
  `planets`, portfolio orbit appearance) are built in the Three.js phase, when
  there is a real consumer to verify them against. Their schemas and imported
  data still exist from phase 1.
- No file in `src/data` or `public/images` is deleted before the Three.js
  retrofit is complete.

- One content client (`src/lib/api/contentClient.ts` → v2) and TanStack Query
  hooks per area (`useResumeContent`, `usePortfolioContent`, `useAboutContent`,
  `useCosmosContent`), with the existing persisted query cache.
- **Fallback**: build step writes the current release to a bundled
  `src/data/release.fallback.json`; used when the API is unreachable. This is
  the only remaining JSON in `src/data`; all other data files are deleted at the end.
- **Portfolio experience**: replace direct `resume.json` imports (`Hero`,
  `Summary`, `Skills`, `Experience`, `Footer`, `ScrollController`,
  `ResumeStructureDiagram`) and `features/fast` pages.
- **Three.js experience**: load content before scene build
  (`ResumeSpace3D.tsx`, `ResumeSpace3D.content.ts`, `TourDefinitionBuilder.ts`,
  `moonPortfolioSelector.ts`, About hall/deck/path systems, Career Gallery), via
  a content provider so imperative Three.js code receives plain typed data.
  The existing `CosmosLoader` covers the load.
- **Media**: image URLs come from `media` records (blob URLs); `public/images`
  entries referenced by content are removed after migration. Scene assets that
  are part of the experience itself (models, textures, audio) stay in the repo.
- **Preview mode** wired through the content client.
- **Verification**: hard-refresh before/after load timing on both experiences
  (performance must not regress).

### Redesign reference: D3 skills graph

For the mainstream portfolio redesign, Harma wants to consider the "Technical
Expertise" diagram from the old scrolling resume (press Down arrow from the
cinematic 3D hero to reach it). It is `SkillsDiagram` in `src/App.tsx`: a D3
force-directed graph (centre → category circles → skill circles sized to their
label; forceLink, forceManyBody, forceCollide, forceCenter; drag that settles
in place; zoom controls). Since 2026-09-16 it reads the separate, nestable tech
stack (`techStackNodes`, Admin → Portfolio → Tech stack) via `useTechStackQuery`;
the resume's skills stay one level deep. Reuse or extract it rather than rewriting. More
D3 styles (circles, constellation, circuit, rings, tree, neural) are in
`src/components/ResumeStructureDiagram.tsx`. Full write-up: `docs/d3-skills-graph.md`.

## 8. Infrastructure

### Azure identity guard (mandatory)

The same Azure login (`harmadavtian@gmail.com`) can reach two subscriptions, and
AI sessions working on the client site switch the active one:

| Subscription | ID | Tenant | Use |
|---|---|---|---|
| **Azure subscription 1 - Support Basic** (Harma, personal) | `0aebe465-2471-45ac-a357-6f84975876ed` | `d8d8bac7-defe-43b2-bdff-2574356ff7cf` | **This project** |
| Hydrodent Production (client) | — | `6baf5ac4-4ead-430a-9f71-44a6e665f1f7` | **Never** from this repo |

Because the username is identical in both, the check is by **subscription id
and tenant id**, never by username. Rules:

1. **Before any `az` work** (every session, and again before any command that
   creates, changes or deletes something), run the guard and stop on failure:
   `npm run az:guard` → `scripts/az-guard.ps1`.
2. The guard runs `az account show` and fails unless the subscription id is
   `0aebe465-…` **and** the tenant is `d8d8bac7-…`. On failure it prints the
   active subscription name and the fix
   (`az account set --subscription 0aebe465-2471-45ac-a357-6f84975876ed`), and
   does **not** switch automatically.
3. **Every `az` command still passes `--subscription 0aebe465-2471-45ac-a357-6f84975876ed`**
   explicitly, even after the guard passes, so a mid-session switch by another
   terminal cannot redirect a command.
4. Scripts that call `az` (`db:pull`, media upload, infra setup) call the guard
   first and pass `--subscription` on every call.
5. Resource names are checked too: commands target only `rg-portfolio-prod`
   (and this project's resources). A Hydrodent resource name in a command is a
   stop condition.
6. GitHub Actions is unaffected: it uses OIDC with a service principal scoped to
   this repo's resources in the personal subscription.
7. The guard's output (subscription name + id) is shown before any approval
   checkpoint in section 11.

1. Storage account (e.g. `sthdsharedprod`) in `rg-portfolio-prod`, West US 2,
   Standard_LRS, Hot, TLS 1.2, blob soft delete on, container `media` with
   anonymous blob read, CORS for `https://harmadavtian.com`. **Needs approval
   (billable, pennies/month).**
2. Enable system-assigned managed identity on `harma-api`; grant *Storage Blob
   Data Contributor* scoped to the storage account.
3. Add `scrolling-resume` API to `shared-login-for-personal-apps/apps.json`, run
   `creds:set` centrally; set auth app settings on `harma-api`.
4. App settings for storage/CORS on `harma-api`; GitHub secret
   `SYNCFUSION_LICENSE_KEY`; frontend workflow passes it to the build.
5. Update `shared-login-for-personal-apps/AZURE-SETUP.md`: add storage account;
   remove the `harma-portfolio-cosmos` row (it was mislabeled as Application
   Insights and is now deleted).
6. Watch B1 plan memory (avg 76%, peak 90% over 7 days before this work). If the
   API's added load pushes it higher, the upgrade path is B2 (~+$13/mo) — decide
   with measurements, not in advance.

## 9. Local development

- `docker-compose.yml`: `mongo:8` (named volume) + `azurite` (blob emulator).
- `npm run dev:full`: Docker services check, API, and Vite together.
- `npm run db:import` — one-time transform of `src/data/*.json` +
  `moonPortfolioMapping.ts` + `public/images` into the new entities and media
  (idempotent, dry-run flag, report of anything unmapped).
- `npm run db:pull` — `mongodump` of production Atlas into `db-backups/`
  (gitignored), and `db:restore-local` into Docker.
- `.env.example` files updated; MongoDB Database Tools and Compass installed locally.

## 10. Phases

Each phase lands on a feature branch, merges to `main`, and deploys through the
pipeline.

| # | Phase | Deliverables | Done when |
|---|---|---|---|
| 0 | Foundations | `scripts/az-guard.ps1` + `npm run az:guard`, npm workspaces, `packages/content-schema`, Docker compose, env + lint/test setup, Syncfusion skills copied | `dev:full` runs against Docker Mongo + Azurite |
| 1 | Schema + import | All entity schemas, template registry, `db:import`, `db:pull` | Local import reproduces every current value; unmapped report empty |
| 2 | API v2 | Auth, admin CRUD, list queries, media upload, releases/publish/rollback, preview, OpenAPI, tests | Tests green; Swagger covers every route |
| 3 | Infrastructure | Storage account, managed identity, app settings, shared-login registration, workflow secrets | API in Azure uploads to blob and authenticates via SSO |
| 4 | Admin (portfolio entities) | Login, dashboard, entity pages used by the mainstream portfolio (profile, education, certifications, links, skills, experiences + children, portfolio cores/entries content, legacy sites, about page/cards), media library, releases, preview | Every field the mainstream portfolio shows is editable in the admin |
| 5 | Production migration | Backup Atlas, run import against production, upload media, first release | Production API serves release 1 matching current content |
| 6 | Retrofit: mainstream portfolio | Mainstream portfolio on v2 + fallback + preview | No direct `src/data` imports remain in mainstream portfolio code |
| 6b | Stabilize | Fix data-entry, grid, validation and rendering bugs found in real use | **Gate: Harma confirms admin + mainstream portfolio are stable** |
| 7 | Admin (Three.js entities) | Entity pages for hall levels/slides, deck slides, path messages, narrative, tours, planets, orbit appearance; template registry forms | Every Three.js content field is editable in the admin |
| 8 | Retrofit: Three.js | Cosmos experience on v2 + fallback + preview; perf measured | Scenes identical to before; load time not regressed |
| 9 | Cleanup + docs | Remove v1 routes, old seed script, retired JSON and images; update runbooks | This doc, reseeding runbook and `mern-azure-setup.md` reflect the new system |

## 11. Approval checkpoints

Everything else proceeds without review; these steps are confirmed first:

- Creating the storage account and role assignment (phase 3).
- Registering the API in the shared sign-on group and rotating shared creds (phase 3).
- Writing to production Atlas and uploading production media (phase 5).
- Starting any Three.js work (phase 7), after the stabilization gate.
- Deleting retired data files and images from the repo (phase 9).

## 12. Out of scope

- Moving engine settings (particles, soundtrack, navigation controls) into the admin.
- Multi-user roles; the admin is single-owner behind the shared login.
- Retiring the Disney app and its storage.
- CDN / custom media domain (can be added later without content changes).
