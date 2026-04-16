# QA Matrix

## Core Routes
- [ ] `/` landing renders split layout and both entry buttons.
- [ ] `/cinematic` loads the existing cinematic flow.
- [ ] `/fast` loads fast shell with top nav and footer resume link.
- [ ] Route-level loading fallback appears briefly on lazy route transitions.

## Fast Navigation
- [ ] Top nav active states reflect route.
- [ ] Top nav links show pressed/down behavior.
- [ ] Context nav appears for portfolio and resume sections.
- [ ] Mobile layout stacks cleanly.
- [ ] Mobile top-nav menu toggle opens/closes nav and tools correctly.
- [ ] Lazy-loaded fast routes (`/fast`, `/fast/portfolio`, `/fast/resume`) resolve without visual break.

## Theming
- [ ] Theme switch updates colors/fonts immediately.
- [ ] Theme preference persists after reload.
- [ ] Focus visibility remains clear for keyboard navigation.

## Portfolio
- [ ] Grid and card views both render correctly.
- [ ] Filtering and sorting update results.
- [ ] Subcategory filtering behaves correctly and resets when category scope changes.
- [ ] Favorites-only filter shows only saved projects.
- [ ] Card size slider changes card density.
- [ ] Favorite/unfavorite persists after reload.
- [ ] Quick view opens and closes cleanly.
- [ ] Quick view closes with `Escape` key and receives focus on open.
- [ ] Detail view route loads expected project.
- [ ] View/sort/category/search/card size persist after reload.
- [ ] Subcategory and favorites-only state persist after reload.
- [ ] Empty state appears when filters return no matches.
- [ ] Result count text updates as filters change.
- [ ] Compare button allows max 3 selected projects.
- [ ] Compare tray shows selected projects with remove/clear actions.
- [ ] Compare selection persists after reload.
- [ ] Compare-cap notice appears when adding beyond max and auto-clears.

## Resume
- [ ] Resume route renders summary and experience from API.
- [ ] Footer resume link opens resume page from any fast route.
- [ ] Resume still renders if API is unavailable (fallback content path).

## Portfolio Detail
- [ ] Detail page shows category/subcategory/year/media metadata.
- [ ] Technology chips render for projects with technologies.
- [ ] Adjacent previous/next project links navigate correctly.

## Quick View Accessibility
- [ ] Tab/Shift+Tab stay within quick-view modal while open.
- [ ] Focus returns to prior trigger after quick-view closes.
