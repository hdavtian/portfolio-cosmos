# QA Matrix

## Core Routes
- [ ] `/` landing renders split layout and both entry buttons.
- [ ] `/cinematic` loads the existing cinematic flow.
- [ ] `/fast` loads fast shell with top nav and footer resume link.

## Fast Navigation
- [ ] Top nav active states reflect route.
- [ ] Top nav links show pressed/down behavior.
- [ ] Context nav appears for portfolio and resume sections.
- [ ] Mobile layout stacks cleanly.

## Theming
- [ ] Theme switch updates colors/fonts immediately.
- [ ] Theme preference persists after reload.
- [ ] Focus visibility remains clear for keyboard navigation.

## Portfolio
- [ ] Grid and card views both render correctly.
- [ ] Filtering and sorting update results.
- [ ] Card size slider changes card density.
- [ ] Favorite/unfavorite persists after reload.
- [ ] Quick view opens and closes cleanly.
- [ ] Quick view closes with `Escape` key and receives focus on open.
- [ ] Detail view route loads expected project.
- [ ] View/sort/category/search/card size persist after reload.
- [ ] Empty state appears when filters return no matches.

## Resume
- [ ] Resume route renders summary and experience from API.
- [ ] Footer resume link opens resume page from any fast route.
- [ ] Resume still renders if API is unavailable (fallback content path).
