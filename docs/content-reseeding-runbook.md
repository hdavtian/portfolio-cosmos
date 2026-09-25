# Content runbook: where content lives and how to move it

Since 2026-09-21 the database is the only source of content. There are no
content files to edit: the portfolio site, the space site and the GoT film all
read the published release from the API (`GET /api/v2/content/release`), and
content is edited in admin (local: http://localhost:5174, production:
https://portfolio-admin.harmadavtian.com). Publishing in admin is what makes an
edit visible.

The only content file left in the repo is `src/data/release.fallback.json`, a
generated copy of a published release for the sites to show if the API can't be
reached. It is never edited by hand (see "The fallback" below).

## Everyday: edit, publish, see it

1. Edit in local admin and publish.
2. Reload the site; the console says `[content] Published content from the API (release …)`.
3. Private tell: when content came from the API, the H and D of the name are
   red and blue (portfolio masthead, space-site badge). On fallback content the
   name is all gold.

## The publish screen

- **Dry run** runs every check publishing runs - each schema, the tech stack
  tree, the technology tree and its name and alias collisions - and publishes
  nothing. A green result means Publish will succeed.
- **Publish** makes the drafts live. The notes start as a summary of what
  changed and can be edited; typing in them stops the summary overwriting them.
- **Discard changes** throws away everything unpublished and restores the
  drafts from the live release. It publishes nothing, so history stays a record
  of what went out. The drafts it replaces are copied into `draftBackups`
  first, so a mistaken discard can be recovered by hand.

## Starting fresh: a new machine, or a broken local database

There is no import from files. A fresh local database is a **restored copy of
production**:

```bash
npm run db:pull            # dumps production Atlas to db-backups/ (read-only on Atlas)
npm run db:restore-local   # restores the newest dump beside the working database
```

`db:restore-local` restores into `resume_cosmos_prodcopy`, leaving the working
database alone. To make the copy the working database, restore with the working
name, or point `LOCAL_MONGODB_DB_NAME` at the copy. Media files for local
Azurite come from `npm run media:pull` (production media, read-only) if they
are needed locally.

One one-off script remains; it adds a specific record to the **local** database
only and refuses to run anywhere else:

- `npm run db:add-stormscape-return` — StormScape (Freelance), 2025 → present (already run)

(Earthlink and HostPro were added the same way on 2026-09-21; that script read
the since-deleted `resume.json` and is gone with it. The records are in the
database and in every backup since.)

## Shipping content to production

Production is written only when a stage ships, and only after confirming with
Harma. Every production write is preceded by a backup.

```bash
npm run db:pull                     # 1. fresh production backup; check production hasn't changed
npm run db:push-prod -- --yes       # 2. replaces production's content collections with local's
npm run media:push-prod -- --yes    # 3. copies any new media files (missing or changed only)
```

Then publish in production admin and check the live sites. Backups in
`db-backups/` and `media-backups/` are kept; nothing deletes them automatically.

## The fallback

`src/data/release.fallback.json` is written by:

```bash
npm run content:fallback                              # from the local API
npm run content:fallback -- https://api.harmadavtian.com   # from production
```

It is used only when the build sets `VITE_CONTENT_FALLBACK=on` and the API
can't be reached; otherwise a failed load is a visible error ("The resume could
not be loaded. Refresh to try again."). Media addresses inside it are whatever
API it was generated from, so a production build should carry a copy generated
from the production API. Regenerate it as part of a release when content has
changed a lot; it does not need to be current to the day.

## Retired

- The v1 content route (`/api/v1/content/:key`), its `content_documents`
  collection and the seed from `src/data` files. The old `content_documents`
  documents remain in the databases, unread.
- The import from legacy files (`db:import`) and the legacy translation
  (`toLegacy`/`fromLegacy`). Their code is in git history before 2026-09-21.
- The bundled content files (`resume.json`, `portfolioCores.json`,
  `aboutDeck.json`, `moonPortfolioMapping.ts`, `aboutPathTravelMessages.json`,
  `cosmic-narrative.json`, the `about*` and `legacyWebsites` files).

See `docs/legacy-translation-retirement.md` for how this happened and
`docs/content-platform-plan.md` for the platform as a whole.
