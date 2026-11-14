# Scientific transparency integration

Implemented in the existing Explorer on 14 November 2026. Scientific sections follow
observation selection, preserving location → viewer → dates. The homepage, map,
image/video modes, time-lapse, slider, difference canvas, GIF/share and bookmarks remain.

## Data contracts and endpoints

- Existing `/api/search` records supply observation IDs, UTC timestamps, files, archive
  product IDs, releases, detector bands and processing metadata.
- Existing `/api/observations/{id}/image` headers supply wavelength/bandwidth,
  provenance, display repairs and transient counts. Metadata is reused, not redundantly fetched.
- `/api/candidates?ra=…&dec=…&radius=0.5` is connected through the actual API client.
  This is regional, not restricted to selected dates, image IDs or display settings.
  Cards identify whether their observations overlap the selection. The list already
  contains full candidate records, so the detail endpoint is not redundantly called.
- FastAPI now reports additive `analysis: {state: "completed", data_source: "mock" | "real", scope: "sky_region"}`
  **only after** `ds.candidates` succeeds. It certifies execution, not scientific validity.
  Older responses without this metadata stay usable but cannot certify completion.

## Scientific rules and missing capabilities

The four supported status labels are Possible Candidate — Awaiting Validation,
Matched to Known Object, Likely Imaging or Processing Artifact, and Rejected Candidate.
No confirmed-detection status is invented. A known-object match, high SNR, valid data
quality or successful HTTP response never becomes a validated detection.

The current contract has no explicit measurement-validity assertion: **Verified
Measurement** is reserved but deliberately unreachable. Uncertain Result, Insufficient
Evidence and Not Evaluated / Data Unavailable are conservatively supported. Classification,
backend data quality and evidence state are separate. Mock measurements cannot become real ones,
including contract examples referencing real images or ephemeris positions.

Request states distinguish not analyzed, requesting, completed, completed-empty,
unavailable, connection/upstream failure, backend/response failure and no coverage.
Queued/processing are shown only if explicitly returned; no artificial stages or
polling jobs are created. There is currently no asynchronous job endpoint.
Empty lists without completion metadata are not proof of no candidates or changes.

All actual quality flags have explanations: `low_snr`, `saturated`, `poor_wcs`,
`photometry_failed`, `near_transient_pixels`, `edge_of_image`, `mixed_pipeline`,
`extended_source`, `high_background`, `insufficient_epochs`. Unknown flags are shown
without guessing their meaning. Photometry failure is prominent and prevents a
brightness conclusion. Missing flags do not certify passed checks.

Missing/invalid counts stay unknown; explicit zero is retained. Real cutouts without
transient flag masks now report an unknown count. Synthetic FastAPI images explicitly
report zero because their renderer creates no flagged transient pixels. Node preview
omissions remain unknown. Flux, SNR, ranking, uncertainty and metadata do not default
to zero. Unqualified timestamps are not assumed UTC. Reference/all-selected provenance
is independently accessible. GIF credits preserve real/mock/unknown distinctions.

Reported spectral overlap is not a scientific-validity check. The legacy 0.05 µm
fallback is visibly an estimate when bandwidth is incomplete. Missing wavelengths
leave compatibility undetermined. Release names are not substituted for missing
processing versions. Mock no-coverage results do not describe real SPHEREx coverage.

Specific calibration/alignment/job-failure codes do not exist in the error enum.
The interface uses actual flags and existing errors, not invented codes. The real-data
source on `main` still returns `NOT_IMPLEMENTED` for candidates. This integration does
not fabricate or replace its missing scientific engine.

## Verification

Run frontend checks with `npm run typecheck`, `npm run test`, `npm run build`,
`node --check scripts/mock-api.mjs`, and `git diff --check`. Tests cover statuses,
known matches vs validation, empty responses, API failures/cancellation, observation
ID rendering, UTC, unknown/zero values, spectral estimates, all actual flags,
photometry failures, evidence states, source labeling and stale-response exclusion.
SSR tests render the actual components, including independent reference provenance.
There is no configured lint script; no lint run is claimed.

Actual final results (2026-11-14): TypeScript check passed, all 41 frontend tests
passed, production Next.js build passed, mock API JavaScript syntax check passed,
and `git diff --check` passed.

Backend regression tests were added for execution metadata and transient counts.
Python/pytest and Docker are unavailable here, so those backend tests were **not run**.
Browser visual/interactive QA remains unverified while its connection is unavailable.
HTTP, SSR and unit checks are not substitutes for interactive browser verification.

Actual local request evidence: `docs/evidence/scientific-transparency-requests.json`.
The Node synthetic preview returned 200 for health/search/metadata/image and 501 for
candidate analysis. This is not proof of real SPHEREx analysis.

## Try it

Open `/explore`, search RA `210.4`, Dec `-11.85`, then select images/dates. Inspect
the Observation ID, full/reference provenance, and scientific panels after the dates.
Click **Load candidate analysis**. Node preview reports unavailable rather than
creating a parallel scientific mock dataset. To see existing synthetic backend
candidates, stop Node on port 8000 and run normal FastAPI with `DATA_SOURCE=mock`
where Python dependencies are installed. Such measurements remain explicitly mock.
Changing location, selection or source clears/cancels prior analysis.

## Files modified or created

Backend: `app/schemas/candidate.py`, `app/routers/candidates.py`,
`app/routers/observations.py`, `app/services/data_source.py`,
`app/services/real_source.py`, `tests/test_api.py`.

Frontend: `components/explorer.tsx`, `components/observation-details.tsx`,
`components/scientific-evidence.tsx`, `components/scientific-evidence.css`,
`lib/scientific-types.ts`, `lib/scientific-format.ts`, `lib/scientific-evidence.ts`,
`lib/types.ts`, `lib/api.ts`, `lib/observations.ts`, `lib/gif.ts`,
`scripts/mock-api.mjs`, `tests/api.test.ts`, `tests/observations.test.ts`,
`tests/scientific-evidence.test.ts`, `tests/scientific-render.test.ts`.

Docs: this report, `docs/api-contract.md`, and the request evidence JSON.
