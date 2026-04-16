# Theme Authoring Guide

## Goal
Provide a consistent process for adding or updating themes used by the fast informational experience.

## Theme Files
- Base tokens: `src/styles/tokens.base.css`
- Theme overrides: `src/styles/themes/theme-<id>.css`
- Runtime registry: `src/theme/themeRegistry.ts`

## Required Tokens
Every theme file must define:
- Typography:
  - `--font-body`
  - `--font-nav`
  - `--font-title`
- Color system:
  - `--color-bg`
  - `--color-surface`
  - `--color-surface-elevated`
  - `--color-text`
  - `--color-text-muted`
  - `--color-border`
  - `--color-accent`
  - `--color-accent-strong`
  - `--color-accent-contrast`
  - `--color-focus`

## Add a New Theme
1. Create `src/styles/themes/theme-<id>.css` with selector:
   - `:root[data-theme="<id>"] { ...tokens... }`
2. Register the theme in `src/theme/themeRegistry.ts`:
   - `{ id: "<id>", label: "<Human Name>" }`
3. Import the CSS file in `src/main.tsx`.
4. Verify select control displays the new theme and persists on refresh.

## Rules
- Do not hardcode theme colors in components.
- Components should consume semantic CSS variables only.
- Keep contrast readable for body text and action controls.

## QA Checklist
- [ ] Theme appears in selector.
- [ ] Theme persists across reload.
- [ ] Navigation active/down states remain readable.
- [ ] Form controls and buttons are legible.
- [ ] Mobile and desktop layouts remain usable.
