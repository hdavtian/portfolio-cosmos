# GitHub Actions Secrets and Variables

This document lists the required GitHub Actions key names used by this repository's deployment workflows.

Do not store secret values in this repo. Only key names and ownership metadata should be tracked here.

## Where to configure

- GitHub -> Repository Settings -> Secrets and variables -> Actions
- Configure keys at the repository level unless you intentionally manage them at an org/environment scope.

## Required repository variables

Used in frontend build/deploy workflow (`.github/workflows/deploy.yml`):

- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`
- `VITE_GA_MEASUREMENT_ID` — the GA4 measurement ID (`G-…`) for the "Harma
  Davtian" stream. Not a secret: it is visible in any page carrying the tag.
  Without it the site simply carries no Google tag, which is how every
  non-production build stays out of the reports.
- `VITE_API_BASE_URL`

Optional:

- `VITE_STATCOUNTER_PROJECT` / `VITE_STATCOUNTER_SECURITY` — the StatCounter
  project id and security code. Neither is a secret (both appear in the page
  source of any site carrying the counter), and `src/lib/analytics.ts` defaults
  to the "Harma Davtian" project, so the counter works with both unset. Set
  them only to point the site at a different StatCounter project.

## Required repository secrets

Used in frontend deploy workflow (`.github/workflows/deploy.yml`):

- `FTP_SERVER`
- `FTP_USERNAME`
- `FTP_PASSWORD`

Used in API deploy workflow (`.github/workflows/deploy-api-azure.yml`):

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

## Recommended operational metadata

For each key in GitHub, maintain:

- Purpose and owning workflow
- Owner (person/team)
- Last rotated date (secrets)
- Last verified date (secret/variable)

This helps recover quickly when migrating repositories or rebuilding deployment pipelines.

