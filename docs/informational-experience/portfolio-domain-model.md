# Portfolio Domain Model (Fast Experience)

## Source Data
- API key: `portfolio-cores`
- Source payload: nested cores -> plains -> rings -> items

## Flattened View Model
Each card in the fast experience uses:
- `id`
- `title`
- `description`
- `image`
- `technologies[]`
- `year`
- `category` (core name)
- `subcategory` (`Plane N / Ring N`)
- `detailMedia[]`

## Filtering and Sorting
- Category filter by `category`.
- Search filter across title, description, technologies.
- Sort modes: newest, oldest, title.

## UI Modes
- Grid mode (responsive multi-column).
- Card mode (single-column readable cards).
- Quick View modal.
- Detail View route (`/fast/portfolio/:portfolioId`).

## Persistence
- Favorites persisted in localStorage key:
  - `fast-experience:favorites`
