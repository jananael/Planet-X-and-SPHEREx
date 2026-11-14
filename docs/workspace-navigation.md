# Four-page SKYTRACE workspace

## Structure and reuse

- `/`: supplied static homepage, unchanged except the four header links and
  styles scoped to those links.
- `/explore`: existing introduction, RA/Dec validation, sky map, targets and stories.
- `/observations`: location/target summary and Change Location, then (01) available
  observations, (02) existing image/video viewer, (03) Scientific Evidence & Data
  Reliability. Existing selection, dates, bands, errors, downloads, slider,
  difference view, stretch, field of view and playback handlers are reused.
- `/machine-learning`: dedicated future-model introduction, current location and
  source, disabled date/prediction controls and unavailable model/uncertainty/
  validation details. No prediction API or model dependency was introduced.

The workspace route group uses one persistent layout containing the original
exploration controller. Links change real routes; there are no internal tab buttons.
Inactive route content stays mounted but hidden/inaccessible, preserving loaded
image URLs, selection, playback mode, comparison settings, guided stories and
candidate-analysis state without copying the viewer or issuing duplicate searches.
Playback and keyboard frame shortcuts are scoped to the observations route.

## State and navigation

Starting a valid search from Explorer immediately pushes `/observations` with RA,
Dec, search dates, requested band and target ID. The same request owns the results
before and after the transition. Other main links preserve the committed location
and search options. Draft coordinate edits stay in the input until submitted.

Search identity excludes the route: changing pages alone does not restart search.
Changing coordinates or filters aborts/invalidate prior requests and clears old
observations/frames; the existing scientific selection key clears stale analysis.
Malformed coordinate links also clear prior results and show validation feedback.
Observation selection stays in place. The explicit **View selected images** button
focuses/scrolls to the viewer, respecting reduced motion, once the user is ready.
It is disabled with no selected images. Change Location returns to Explorer without dropping the session.

URL parameters restore coordinates and search filters on reload or a new direct
link, e.g. `/observations?ra=180&dec=0`. A new browser session refetches observations
and uses the existing suggested selection; blob images and manual comparison
settings are not persisted to disk. A direct page with no coordinates presents a
Choose Sky Coordinates action, with no arbitrary default sky location.

## API and scientific behavior

Existing `/api/health`, `/api/targets`, `/api/search`, observation metadata/images
and `/api/candidates` clients remain intact. The UI retains source labels, visible
Observation IDs, separate reference provenance, UTC, real quality explanations,
uncertainty formatting, explicit missing values, distinct unknown/zero TRANSIENT
counts, and conservative candidate/evidence states. No backend science changed.
Real candidate-engine and prediction-model integration remain backend dependencies.

## Files

- `frontend/app/(workspace)/layout.tsx` (new shared layout)
- `frontend/app/(workspace)/explore/page.tsx` (moved from `app/explore/page.tsx`)
- `frontend/app/(workspace)/observations/page.tsx` (new)
- `frontend/app/(workspace)/machine-learning/page.tsx` (new)
- `frontend/components/explorer.tsx` (existing session and workflow)
- `frontend/components/workspace-navigation.tsx` (new route navigation)
- `frontend/components/machine-learning.tsx` (new modular future-model interface)
- `frontend/lib/workspace-navigation.ts` (new URL/identity utilities)
- `frontend/app/explore/explorer.css` (shared workspace styles)
- `frontend/public/skytrace-homepage/index.html` and `styles.css` (header links only)
- `frontend/tests/workspace-navigation.test.ts` and `scientific-render.test.ts`
- This report.

## Verification — 2026-11-14

Frontend unit/API/SSR tests: 49 passed, zero failed. Coverage includes shareable
zero coordinates, search filters, location identity, no invented default location,
ML with/without coordinates, disabled prediction controls and source labeling,
alongside existing image/API/candidate scientific regression tests.

TypeScript and production build were run. Build generates `/explore`,
`/observations`, `/machine-learning` and existing routes. HTTP checks returned 200
for the four pages and `/observations?ra=180&dec=0`, and verified current navigation
and content. The stale local preview was restarted before successful HTTP checks.
No lint script is configured.

Browser host is unavailable. Desktop/mobile visual QA, client navigation, search
restoration after refresh, focus/scroll, and complete interactive playback/map/
comparison journeys have not been browser-verified. HTTP/SSR tests do not establish
those interactions. The local API preview uses visibly synthetic data; no real
SPHEREx candidate-analysis or prediction success is claimed.
