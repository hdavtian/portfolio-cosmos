# Scrolling Resume - Cinematic Experience

A stunning, movie-inspired scrolling resume built with React, TypeScript, GSAP, and SCSS. Features full-screen sections with dynamic background slides, smooth scroll animations, and a sophisticated cinematic aesthetic.

## ✨ Features

- **Cinematic Design**: Movie credits-inspired typography with elegant serif and sans-serif fonts (Cinzel, Playfair Display, Montserrat)
- **Full-Screen Sections**: Each section takes up the full viewport for maximum impact
- **Dynamic Backgrounds**: Animated gradient backgrounds that slide in/out as you scroll
- **GSAP ScrollTrigger**: Smooth, performance-optimized scroll animations
- **Responsive Design**: 4+ breakpoints (mobile, tablet, desktop, large desktop)
- **Edge-to-Edge Layouts**: Modern, immersive full-width design
- **Theme-Ready**: SCSS variables and mixins for easy customization
- **Zero Console Errors**: Production-ready, fully tested code

## 🎬 Animation Highlights

- Hero section with rotating gradient background and glowing text effects
- Text elements fade in/out as you scroll through sections
- Background panels slide from different directions (left, right, bottom)
- Company names and titles appear with cinematic timing
- Smooth parallax effects on background elements
- Movie credits-style experience list scrolling

## 🌐 Production

| What | URL | Notes |
| --- | --- | --- |
| Site (portfolio) | https://harmadavtian.com | Static SPA on GoDaddy, deployed by `.github/workflows/deploy.yml` on push to `main` |
| Cinematic experience | https://harmadavtian.com/cinematic | Three.js experience, same build |
| Resume | https://harmadavtian.com/resume | |
| API | https://api.harmadavtian.com | `harma-api` App Service; health at `/healthz`, docs at `/swagger` |
| Admin | https://portfolio-admin.harmadavtian.com | Second hostname on `harma-api`; serves the admin once phase 3 ships (until then it answers as the API) |

Status and rollout: `docs/content-platform-plan.md`.

## 🚀 Quick Start

```bash
npm install
npm run dev:full           # start everything
npm run dev:full-restart   # stop leftovers from a crashed run, then start everything
```

`dev:full` needs Docker Desktop running. It starts everything for local development in one terminal:

| Service | Address | Notes |
| --- | --- | --- |
| MongoDB 8.0 | `127.0.0.1:27017` | Docker; database `resume_cosmos_local` |
| Azurite (blob storage) | `127.0.0.1:10000` | Docker; media files |
| API | http://localhost:8080 | Swagger at http://localhost:8080/swagger |
| Site | http://localhost:5173 | `/` (portfolio), `/portfolio/:id`, `/resume`, `/cinematic`, `/portfolio-classic` |
| Admin | http://localhost:5174 | Password `local-dev` |

Stop with **Ctrl+C**; `npm run services:down` also stops the Docker containers (data is kept).

### When something is already running

If a previous run crashed or the machine ran low on memory, parts of it (often the API) can keep holding their ports, and a new run cannot start them.

| Command | What it does |
| --- | --- |
| `npm run dev:full` | Checks ports 8080, 5173 and 5174 first. If any is taken it starts nothing and prints which process holds it, and whether it belongs to this project. |
| `npm run dev:full-restart` | Stops this project's old API, site and admin (including the API's file watcher), then starts everything fresh. Only processes started from this repo are stopped; other projects are never touched. |

If `dev:full` reports a port held by **another program**, stop that program yourself; the restart will not.

Local commands always use the local Docker services, never production Atlas or Azure Storage.

## 🧰 Local Development Commands

### Start pieces individually

Useful when one process crashed or a port is stuck.

| Command | What it starts |
| --- | --- |
| `npm run dev:full-restart` | Everything, after stopping this project's leftover processes |
| `npm run services:up` | MongoDB and Azurite in Docker (waits until healthy) |
| `npm run api:local` | The API on :8080, against the Docker services (starts them if needed) |
| `npm run dev` | The site on :5173 |
| `npm run admin:dev` | The admin on :5174 |
| `npm run services:down` | Stops the Docker containers |

If the admin shows "Internal server error" at login and the terminal keeps logging `ECONNREFUSED`, the API is not running: start it with `npm run api:local`, or restart everything with `npm run dev:full-restart`. (One `ECONNREFUSED` in the first seconds is normal while the API boots.)

### Content and media

| Command | What it does |
| --- | --- |
| `npm run db:pull` | Dumps the production database to `db-backups/` (read-only on production) |
| `npm run db:restore-local` | Restores the newest dump into local Docker as a separate database |
| `npm run storage:cors` | Lets the 3D site load textures from Azurite; run once after resetting Azurite data |

Content changes made in the admin only show on the sites after **Publishing → Publish**.

### Checks and builds

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Type-checks the workspaces (API, schema package) |
| `npm run typecheck:admin` | Type-checks the admin |
| `npm test` | Runs workspace tests (API tests need Docker running) |
| `npm run lint` | Lints the repository |
| `npm run build` | Builds the site |
| `npm run build:admin` | Builds the admin into `dist-admin/` |
| `npm run preview` | Serves the built site |

## 📊 PostHog Owner Mode

Production analytics include an owner-mode toggle so your own visits can be filtered out from client traffic.

### Manual activation in browser console

Open your production site, then run:

```js
window.__so.enable();
```

Check status:

```js
window.__so.status();
```

Disable owner mode:

```js
window.__so.disable();
```

### URL activation

Open the site with `?__so=1`, for example:

```text
https://harmadavtian.com/?__so=1
```

This enables owner mode and then removes the `__so` param from the URL.

### Persistence behavior

- Owner mode is stored in site localStorage and PostHog persistence (`localStorage+cookie`).
- Clearing site data (cookies/localStorage) resets owner mode and future visits become anonymous until re-enabled.
- Owner mode is per browser profile/device.

### PostHog filtering

Filter dashboards with either:

- `person.properties.is_internal_owner != true`
- `event.properties.traffic_type != "owner"`

## 🎨 Customization

### Colors & Theme

Edit `src/styles/_variables.scss` to customize colors:

```scss
$primary-bg: #000000; // Main background
$accent-text: #d4af37; // Gold accent color
$primary-text: #ffffff; // Main text color
$secondary-text: #b8b8b8; // Secondary text
```

### Fonts

Google Fonts are included (Cinzel, Playfair Display, Montserrat). To change fonts, update `index.html` and `src/styles/_variables.scss`.

### Resume Data

Update your information in `src/data/resume.json` - all content is dynamically loaded from this JSON file.

## 📱 Responsive Breakpoints

- **XS**: 480px (Small phones)
- **SM**: 640px (Phones)
- **MD**: 768px (Tablets)
- **LG**: 1024px (Laptops)
- **XL**: 1280px (Desktops)
- **2XL**: 1536px (Large desktops)

## 🛠️ Tech Stack

- **React 19**: Latest React features
- **TypeScript**: Type-safe development
- **Vite 7**: Lightning-fast build tool
- **GSAP 3**: Professional animation library with ScrollTrigger
- **SCSS**: Advanced styling with variables and mixins
- **CSS Grid & Flexbox**: Modern responsive layouts

## 📦 Project Structure

```
src/
├── components/          # React components
│   ├── Hero.tsx        # Landing section with animated background
│   ├── Summary.tsx     # Professional summary with slide-in effects
│   ├── Skills.tsx      # Technical skills grid
│   ├── Experience.tsx  # Work history with cinematic animations
│   └── Footer.tsx      # Education, certifications, links
├── data/
│   └── resume.json     # All resume content
├── styles/
│   ├── main.scss       # Global styles and reset
│   ├── _variables.scss # Theme variables (colors, fonts, spacing)
│   └── _mixins.scss    # Reusable SCSS mixins
└── App.tsx             # Main app with GSAP setup
```

## 🎯 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## 📄 License

MIT

---

Built with ❤️ using modern web technologies and inspired by cinematic design principles.

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
