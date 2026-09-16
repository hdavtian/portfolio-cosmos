# Content Reseeding Runbook

This project stores portfolio/resume/about content in source files under `src/data` and seeds Mongo content documents from those files.

Use this runbook whenever JSON/TS source content is updated and the database must be refreshed.

## What gets seeded

- Seed script: `api/src/scripts/seedContent.ts`
- Seed command from repo root: `npm run api:seed`
- Target collection: `content_documents`
- Primary sources (since 2026-09-15, only the keys the API still serves):
  - `src/data/resume.json` → key `resume`
  - `src/data/portfolioCores.json` → key `portfolio-cores`

The seed process upserts by document key. The previously seeded keys
(`about-*`, `cosmic-narrative`, `legacy-websites`, `moon-portfolio-mapping`)
are retired: the API returns 404 for them and the seed no longer refreshes them.
Their old documents remain in the database, untouched and unread.

This runbook covers the legacy v1 flow. New content work goes through
`npm run db:import` and the v2 API — see `docs/content-platform-plan.md`.

## Local reseed workflow

1. Update source data in `src/data`.
2. Validate JSON syntax in edited files.
3. Run:

   ```bash
   npm run api:seed
   ```

4. Confirm expected output includes:
   - `Seed completed. Upserted ... content documents.`
5. Verify locally:
   - API response contains updated payload values:
     - `http://localhost:8080/api/v1/content/portfolio-cores`
   - Frontend pages display updated data.

## Production reseed workflow

> `api/.env` targets local Docker MongoDB, so `npm run api:seed` seeds the local
> database. A production reseed must pass the production connection explicitly,
> for example by setting `MONGODB_URI` and `MONGODB_DB_NAME` in the shell for
> that one command (values live in the `harma-api` Azure app settings, or in the
> git-ignored `api/.env.production.local`).

1. Ensure source data changes are committed and deployed.
2. Run the seed script against the production API environment (same `api/src/scripts/seedContent.ts` process, with production Mongo connection settings passed in the environment).
3. Verify production API returns updated values:
   - `https://api.harmadavtian.com/api/v1/content/portfolio-cores`
4. If frontend depends on API base URL, ensure deploy variable is correct:
   - `VITE_API_BASE_URL=https://api.harmadavtian.com`
5. Redeploy frontend if needed and re-check network responses are JSON, not HTML.

## Quick troubleshooting

- If frontend request to `/api/v1/content/...` returns HTML:
  - Request is hitting SPA host fallback, not API.
  - Fix `VITE_API_BASE_URL` in deployment variables and redeploy frontend.
- If API returns old data:
  - Seed may not have been run in the target environment.
  - Rerun seed in that environment and verify endpoint payload.
- If updated source is overwritten later:
  - Confirm source-of-truth files in `src/data` were updated and committed before reseeding.

