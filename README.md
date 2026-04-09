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

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

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
