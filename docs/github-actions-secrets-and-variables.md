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
- `VITE_API_BASE_URL`

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

