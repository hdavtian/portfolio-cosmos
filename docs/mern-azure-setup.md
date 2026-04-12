# MERN on Azure Setup Guide

## Status

- Phase: **Production — fully deployed and operational** (merged to `main`)
- Deployment strategy: Direct replacement of existing Azure API app (`harma-api`)
- Runtime: `NODE|20-lts` on Azure App Service Linux (B1, West US 2)
- Database: MongoDB Atlas M0 (free tier, Azure cloud provider), DB name `resume_cosmos`
- Frontend integration with API: Deferred to a later phase — frontend still reads local JSON files

## Goals

- Run a TypeScript Express API on Azure App Service.
- Persist cosmos/resume content in MongoDB Atlas (Azure cloud provider, free tier preferred).
- Keep costs low by reusing existing Azure App Service infrastructure.
- Keep backend in this repository (monorepo layout).
- Provide OpenAPI/Swagger support for API discovery.
- Enable repeatable deployment through GitHub Actions.

## Repository Layout

- Frontend app (existing): project root and `src/`
- Backend app (new): `api/`
- API deployment workflow: `.github/workflows/deploy-api-azure.yml`

## Implemented Backend Architecture

- Runtime: Node.js + TypeScript + Express
- DB client: Mongoose
- API documentation: Swagger UI served at `/swagger`
- Contract JSON: `/swagger/v1/swagger.json`
- Layering:
  - Controller: HTTP request/response behavior
  - Service: use-case and output shaping logic
  - Repository: MongoDB read/write operations

### Important Backend Files

- `api/src/server.ts`
- `api/src/app.ts`
- `api/src/routes/index.ts`
- `api/src/modules/content/content.controller.ts`
- `api/src/modules/content/content.service.ts`
- `api/src/modules/content/content.repository.ts`
- `api/src/modules/content/content.model.ts`
- `api/src/scripts/seedContent.ts`
- `api/src/swagger/openapi.ts`

## API Endpoints (v1)

- `GET /healthz`
- `GET /api/v1/content`
- `GET /api/v1/content/:key`
- `GET /api/v1/content/resume`
- `GET /api/v1/content/portfolio-cores`
- `GET /api/v1/content/about-deck`
- `GET /api/v1/content/about-hall-levels`
- `GET /api/v1/content/about-hall-slides`
- `GET /api/v1/content/about-path-travel-messages`
- `GET /api/v1/content/cosmic-narrative`
- `GET /api/v1/content/about-content`
- `GET /api/v1/content/legacy-websites`
- `GET /api/v1/content/moon-portfolio-mapping`

## Seeded Content Scope

JSON files:

- `src/data/resume.json`
- `src/data/portfolioCores.json`
- `src/data/aboutDeck.json`
- `src/data/aboutHallLevels.json`
- `src/data/aboutHallSlides.json`
- `src/data/aboutHallSlides.level-01-signal-origins.json`
- `src/data/aboutHallSlides.level-02-human-systems.json`
- `src/data/aboutPathTravelMessages.json`
- `src/data/cosmic-narrative.json`
- `src/data/aboutContent.json`
- `src/data/legacyWebsites.json`

TypeScript source converted to content payload:

- `src/data/moonPortfolioMapping.ts`

## Azure Context (Discovered)

- Subscription: `Azure subscription 1 - Support Basic`
- Resource group: `rg-portfolio-prod`
- Existing API app: `harma-api`
- Existing plan: `asp-portfolio-prod` (`B1`, Linux, West US 2)
- Existing domain binding: `api.harmadavtian.com` -> `harma-api`
- Existing runtime before replacement: `.NET 8` (`DOTNETCORE|8.0`)

## Deployment Workflow (GitHub Actions)

File: `.github/workflows/deploy-api-azure.yml`

What it does:

1. Installs and builds `api/`.
2. Authenticates to Azure with OIDC (`azure/login@v2`).
3. Switches the Web App runtime to `NODE|20-lts`.
4. Sets startup command and health check path.
5. Deploys package from `api/` to `harma-api`.

Required repository secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

## Environment Variables

Defined in `api/.env.example`:

- `PORT`
- `NODE_ENV`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `FRONTEND_ORIGIN`

## Required Azure App Settings

Set on Web App `harma-api` (Azure Portal or CLI):

- `MONGODB_URI` (secret)
- `MONGODB_DB_NAME` (non-secret, recommended: `resume_cosmos`)
- `NODE_ENV` (non-secret, recommended: `production`)
- `FRONTEND_ORIGIN` (non-secret, e.g. `https://harmadavtian.com`)

Optional operational settings:

- `WEBSITES_PORT=8080`

Do not store secret app settings in repository files.

## Secrets and Credential Safety Provision

- Never commit secrets, tokens, passwords, connection strings, private keys, or publish profiles to git.
- Keep only placeholders in tracked files such as `api/.env.example`; real values live in local `.env` files (gitignored), Azure App Settings, Atlas project settings, and GitHub Secrets.
- Use GitHub OIDC + short-lived federation for Azure auth in CI/CD; do not use long-lived credentials unless there is a documented exception.
- Do not print secret values in logs, scripts, workflow output, or error messages.
- Require code review checks for secret-safe changes when editing workflows, deployment scripts, and environment configuration.
- If a secret is exposed, rotate it immediately and treat it as compromised.

## Local Commands

From repo root:

- `npm run api:dev`
- `npm run api:build`
- `npm run api:start`
- `npm run api:seed`

Direct inside API folder:

- `npm ci`
- `npm run build`
- `npm run dev`
- `npm run seed`

## Manual Deploy (PowerShell — faster iteration than CI/CD)

Run from repo root. Builds, packages with prod deps, deploys, cleans up:

```powershell
$ErrorActionPreference='Stop'
npm --prefix api run build | Out-Null
$staging = Join-Path $PWD '.deploy-api-runtime'
$zipPath = Join-Path $PWD 'api-runtime.zip'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
Copy-Item -Path 'api/package.json' -Destination $staging
Copy-Item -Path 'api/package-lock.json' -Destination $staging
Copy-Item -Path 'api/dist' -Destination (Join-Path $staging 'dist') -Recurse
npm --prefix $staging ci --omit=dev | Out-Null
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -Force
az webapp deploy --resource-group rg-portfolio-prod --name harma-api --src-path $zipPath --type zip --restart true --clean true --track-status true --output none
Remove-Item $zipPath -Force
Remove-Item $staging -Recurse -Force
Write-Output 'DEPLOY_COMPLETE'
```

To seed the database using production connection string:

```powershell
$env:MONGODB_URI = (az webapp config appsettings list --resource-group rg-portfolio-prod --name harma-api --query "[?name=='MONGODB_URI'].value | [0]" -o tsv)
$env:MONGODB_DB_NAME = (az webapp config appsettings list --resource-group rg-portfolio-prod --name harma-api --query "[?name=='MONGODB_DB_NAME'].value | [0]" -o tsv)
npm --prefix api run seed
```

## Cost Guardrails

- Reuse existing App Service plan and app (direct replacement path).
- Do not create API Management, ACR, Redis, or other paid adjunct services for this phase.
- Prefer MongoDB Atlas M0 (free) on Azure provider.
- Use Atlas Flex only if M0 constraints block implementation.

## Branch and Merge Workflow

- ✅ Implemented on feature branch `feature/azure-mern-api-foundation`.
- ✅ Validated in Azure before merge.
- ✅ Merged to `main`.

## Validation Checklist

- [x] API builds: `npm run api:build`
- [x] API starts with valid MongoDB env vars
- [x] Swagger UI responds at `/swagger` — CSP violations fixed (custom `swagger-initializer.js` override, `validatorUrl: null`)
- [x] Seed script upserts all expected documents — 12 content documents in Atlas (`resume_cosmos`)
- [x] GitHub Actions deployment workflow exists (`.github/workflows/deploy-api-azure.yml`); manual zip deploy used for iteration
- [x] `https://api.harmadavtian.com/healthz` returns `{status:"ok", mongoReadyState:1}`
- [x] `https://api.harmadavtian.com/swagger/index.html` loads API docs with full Try It Out
- [x] `https://api.harmadavtian.com/openapi.json` returns full OpenAPI 3.0.3 document
- [x] All named content routes have `200`/`404` response blocks in OpenAPI spec
- [x] `GET /api/v1/content/{key}` parameter has `enum` dropdown of all 10 valid keys in Swagger UI
- [x] MongoDB Atlas Network Access allowlist includes all Azure App Service outbound IPs
- [x] No secrets committed in tracked files or workflow logs
- [x] All secrets stored in Azure App Settings and Atlas only

## Known Issues Resolved

| Issue | Root Cause | Fix |
|---|---|---|
| Swagger CSP violations (petstore, validator) | Bundled `swagger-initializer.js` hardcoded external URLs | Custom Express route overrides the file before `swaggerUi.serve` |
| 500 errors on all content endpoints | Azure App Service outbound IPs not in Atlas Network Access allowlist | Added all 6 active outbound IPs to Atlas |
| Empty responses after connectivity fix | Database was unseeded | Ran `npm run api:seed` with Azure App Settings pulled via `az` CLI |

## Deferred Work

- Frontend migration from static imports to API fetches.
- Auth/authz for write endpoints if admin update workflows are added.
- Optional staging slot and safer blue/green deployment flow.
