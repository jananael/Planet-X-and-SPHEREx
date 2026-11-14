# Visualization-First Product Transformation

## Branch and base

This PR is based on the team's latest `main`, commit `7224518` (`Merge Taqwa's S2-T4 FITS processing and quality tests`). It keeps that current workspace and FITS processor, and adds the visualization route without bringing in commits or unrelated uncommitted files from the local Y2 branch.

## Product experience

The active product has a first-class `/visualization` route. Six modes are available: an interactive camera-projected 3D scene, a selectable RA/Dec sky map, a point/uncertainty spectrum chart, an image/pixel viewer with linear, square-root and logarithmic stretches, multi-band comparison, and an observation timeline. Object selection, camera rotation/perspectives, pan/zoom/reset, layer toggles, chart selection, image pixel inspection, stretch controls, band-divider movement, timeline selection, and guided exploration are wired to page state.

The data fixture is typed and separate from visualization components. It includes source metadata, coordinate values, demo measurements and units, illustrative uncertainties, image pixels, band/time examples, and explanations. Every mode is labeled **“Illustrative Demo Data — Not Live NASA Data.”** These values are educational examples, not survey measurements, discoveries or validation results.

An explanation panel describes what each view shows, units, why a measurement is useful, what can and cannot be concluded, and the data source. Learning mode adds short coordinate explanations; guided exploration walks through the modes.

## Product and science boundaries

- Existing home, Explorer, observations, candidate APIs, IRSA retrieval, and main-branch FITS processing are retained.
- Main already has no active ML API or dashboard; its old `/machine-learning` URL redirects to `/explore`. This PR keeps the redirect for older bookmarks, updates the current navigation/docs, and removes unused ML-only Explorer CSS. No ML score or model output is shown.
- Y2 source detection, thresholds, data, and historical scientific reports are not modified. Y2 remains scientifically incomplete.
- Live NASA data acquisition/processing/visualization integration is not implemented in this PR. The provider discovery matrix is documentation only; demo fixtures do not share the real observation contract.

## Official provider discovery

[`nasa-api-integration-matrix.md`](nasa-api-integration-matrix.md) records verified documentation, endpoints, formats, authentication notes, query examples, response shapes, tested/not-tested status, constraints, and integration priorities for IRSA SPHEREx, MAST, NASA Exoplanet Archive TAP, JPL Horizons/SBDB, NASA Image and Video Library, GIBS, NASA Eyes, WWT and OpenSpace.

Recommended first steps: keep the existing IRSA SIA2 client as the SPHEREx source; define a provider-independent visualization model and map existing observation/image responses into it; then add a separately tested MAST archive adapter. Keep catalogs and ephemerides as separate visualization data types and use GIBS/Eyes/WWT/OpenSpace only for supported educational or map use cases.

## Files in this PR

### Added

- `frontend/app/visualization/page.tsx`
- `frontend/components/visualization-workspace.tsx`
- `frontend/components/visualization-workspace.css`
- `frontend/lib/visualization-model.ts`
- `frontend/tests/visualization.test.ts`
- `backend/tests/test_product_routes.py`
- `docs/product/nasa-api-integration-matrix.md`
- `docs/product/visualization-product-transformation.md`

### Changed

- Root/home navigation, shared workspace navigation and the supplied static homepage now expose Visualization.
- Updated active README and workspace navigation documentation for the current route/data boundaries.
- Removed dead ML-specific CSS from the Explorer stylesheet.
- Added `/visualization` to workspace URL-preservation tests; added checks for fixture labels, all modes, explanations, navigation and absence of an ML screen link.

### Removed

- Unused `.ml-placeholder` and `.prediction-controls` CSS selectors from the Explorer stylesheet.

## Verification

Commands run against this PR branch and the current `main` base:

```bash
cd frontend && npm test
cd frontend && npm run typecheck
cd frontend && npm run build
cd backend && python -m pytest -q
git diff --check
```

Build and automated tests validate the route and server-rendered content. Responsive CSS is included, but no browser screenshot or hands-on desktop/mobile interaction QA is claimed. The current desktop session disables browser use and the local Next.js server cannot bind to `127.0.0.1:3000` in its sandbox. That visual QA remains a review follow-up.
