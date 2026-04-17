# Content Reseeding Runbook

This project stores portfolio/resume/about content in source files under `src/data` and seeds Mongo content documents from those files.

Use this runbook whenever JSON/TS source content is updated and the database must be refreshed.

## What gets seeded

- Seed script: `api/src/scripts/seedContent.ts`
- Seed command from repo root: `npm run api:seed`
- Target collection: `content_documents`
- Primary sources:
  - `src/data/*.json` (resume, portfolio, about, etc.)
  - `src/data/moonPortfolioMapping.ts` (TypeScript payload)

The seed process upserts by document key (for example: `resume`, `portfolio-cores`, `legacy-websites`).

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

1. Ensure source data changes are committed and deployed.
2. Run the seed script against the production API environment (same `api/src/scripts/seedContent.ts` process, pointed at production Mongo connection settings).
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

