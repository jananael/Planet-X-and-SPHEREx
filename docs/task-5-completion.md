# Task 5: scientific transparency follow-up

## Already implemented

The previous integration provided the existing Explorer with `/api/candidates`
through its shared API client, visible Observation IDs and independent reference
provenance, explicit UTC, all ten actual quality flag explanations, conservative
evidence states, source labels, distinct request/processing/no-coverage/error
states and cancellation/selection keys to hide stale results. No homepage or
Explorer redesign was needed. See `scientific-transparency.md` for the full
original file inventory and request evidence.

## Gaps fixed in this follow-up

- Every candidate card now says **Unconfirmed candidate** explicitly, including
  known-object matches, artifacts and rejected candidates. These labels describe
  the supplied status, not discovery confirmation.
- Flux renders as `value ± flux_error unit` only when both numbers are supplied
  and the error is nonnegative. Missing uncertainty explicitly says
  **Uncertainty not available**. Negative/nonfinite errors are unavailable and
  visibly identified as invalid, never zero. Explicit zero uncertainty stays zero.
- Missing flux is **Not available**, even if an orphan error is supplied.
- Motion/brightness metrics explicitly disclose missing associated uncertainty.
  `motion.uncertainty_arcsec` remains a separate positional error in arcsec:
  the contract does not say which component it describes. It is never attached
  to speed (arcsec/day), displacement or position angle by assumption.
- Summary now includes selected Observation IDs, classification and uncertainty
  availability. Synthetic measurements are excluded from the real-error summary.
- Method/engine provenance and missing statistical/systematic type and confidence
  levels are explained. No confidence interval or extra significant digits are
  manufactured. JSON numeric precision is retained without rounding; trailing
  significant zeros cannot be recovered from the numeric contract.
- Blank/whitespace and hexadecimal display-stretch headers no longer convert to
  numeric zero. They fail image validation. Scientific image metadata already
  used strict numeric parsing; actual zero TRANSIENT counts remain distinct from
  missing/unreadable counts (unavailable, explicitly explained as unknown).

## Files changed in this follow-up

- `frontend/components/scientific-evidence.tsx`
- `frontend/lib/scientific-format.ts`
- `frontend/lib/scientific-evidence.ts`
- `frontend/lib/api.ts`
- `frontend/tests/scientific-evidence.test.ts`
- `frontend/tests/scientific-render.test.ts`
- `frontend/tests/api.test.ts`
- `docs/task-5-completion.md`

## Actual contracts and limitations

Endpoints retained: `GET /api/candidates?ra&dec&radius=0.5` (regional scope),
existing observation search/metadata and image endpoints. No new endpoint or
duplicate client was added. Candidate detail endpoint exists but is not needed
because the regional response already contains the full records.

Statuses: `pending_validation`, `known_object`, `artifact`, `rejected`. Unsupported
statuses remain unavailable, never validated. Evidence: uncertain, insufficient,
not evaluated/unavailable. Verified Measurement remains reserved and unreachable
until an explicit backend validity assertion exists. Catalog matching, quality
`valid`, successful HTTP and a ranking score cannot authorize confirmation.

Actual flags: `low_snr`, `saturated`, `poor_wcs`, `photometry_failed`,
`near_transient_pixels`, `edge_of_image`, `mixed_pipeline`, `extended_source`,
`high_background`, `insufficient_epochs`. Existing explanations describe impact.
Spectral incompatibility and pipeline differences use actual metadata; absent
bandwidth is visibly estimated/undetermined. Missing calibration is not an actual
backend flag and is not invented. Missing flags never mean checks passed.

Only `Detection.flux_error` (same unit as flux; real contract requires uJy) and
`Motion.uncertainty_arcsec` are explicit uncertainty fields. No per-coordinate,
SNR, wavelength, flux-change, magnitude-change, speed or angle uncertainties,
statistical/systematic classification, interval confidence levels, certified
measurement validity or validated detection status are supplied. The real-source
candidate engine is still unimplemented; Node preview returns 501. No real
candidate confirmation or end-to-end real-engine success is claimed.

## Verification — 2026-11-14

- `npm run typecheck`: passed.
- `npm run test`: 45 passed, 0 failed (unit, API and actual-component SSR tests).
- `npm run build`: passed after the final edits; all seven pages generated.
- `git diff --check`: passed. Mock API JavaScript syntax check also passed.
- No lint script is configured. Python/pytest/Docker are unavailable, so backend
  tests were not run. Browser host reports unavailable, so visual/interactive QA
  was not performed; SSR is not a substitute for browser interaction.

Open `/explore`, search coordinates and select observations. Inspect Observation
Details and the Scientific Evidence Summary below Available observations, then
request candidate analysis. Unsupported analysis remains unavailable. For actual
candidate cards, use the existing FastAPI mock source where Python dependencies
are installed (visibly synthetic), or connect the real scientific engine.
