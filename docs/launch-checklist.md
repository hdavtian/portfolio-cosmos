# Launch Checklist (GoDaddy + GitHub Actions)

This document covers launching the portfolio from GitHub to GoDaddy cPanel, with Cloudflare intentionally deferred.

## 1) Repository Setup

- [x] New GitHub repo created: `hdavtian/portfolio-cosmos`
- [x] Repo visibility: Private
- [x] Local branches pushed to new origin
- [x] `main` contains latest merged site work

## 2) GoDaddy Prerequisites

- [ ] Confirm the target domain points to your GoDaddy hosting plan (`HarmaDavtian.com`)
- [ ] In cPanel, confirm upload target path is `public_html/`
- [ ] Confirm FTP/FTPS credentials work from a desktop FTP client
- [ ] Keep a backup copy of the current `public_html/` before first automated deploy

## 3) GitHub Secrets (Required)

In GitHub repo settings:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Add:

- `FTP_SERVER` (example: `ftp.harmadavtian.com`)
- `FTP_USERNAME`
- `FTP_PASSWORD`

Notes:
- Workflow uses `ftps` protocol.
- If GoDaddy credentials rotate, update secrets immediately.

## 4) Workflow and Routing Files

Already added to this repo:

- [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
- [`public/.htaccess`](../public/.htaccess)

Behavior:
- On every push to `main`, GitHub Actions builds (`npm ci`, `npm run build`) and deploys `dist/` to `public_html/`.
- `.htaccess` ensures SPA deep links resolve to `index.html`.

## 5) First Deploy

- [ ] Push any new commit to `main` (or run workflow manually via `workflow_dispatch`)
- [ ] Open GitHub `Actions` tab and monitor `Build and Deploy to GoDaddy`
- [ ] Verify job passes all steps:
  - Checkout
  - Setup Node
  - Install dependencies
  - Build production site
  - Deploy dist to GoDaddy

## 6) Post-Deploy Validation

- [ ] Open `https://harmadavtian.com`
- [ ] Hard refresh (`Ctrl+F5`) and verify latest content appears
- [ ] Test deep links/direct route loads (refresh while on non-root route)
- [ ] Test critical assets:
  - 3D models
  - large textures/images
  - audio files
- [ ] Test mobile layout and performance

## 7) Rollback Plan

If a deployment is bad:

1. Re-run a previous known-good commit by pushing/reverting to that commit on `main`, or
2. Restore `public_html/` from your manual backup.

## 8) Future Step (Deferred): Cloudflare

Do later, after stable launch:

- Put domain behind Cloudflare DNS proxy
- Enable caching and Brotli
- Add page rules/cache rules for static assets
- Optionally add cache purge step in GitHub Actions

