# SKYTRACE Candidate Analysis Integration — 2026-11-13

## Status

**CANDIDATE ANALYSIS WORKING.** The original HTTP 400 is fixed in the frontend integration. After extending the client timeout, the exact Mira workflow completed through the real API and rendered 277 real regional candidate records. The API response and the UI label the results as real, pending validation, and not limited to the three selected Explorer images. This verifies a functional pipeline through SourceDetectionEngine and the response contract; it does **not** scientifically validate the candidates.

## Starting repository and runtime state

- Repository: `jananael/Planet-X-and-SPHEREx`
- Branch: `codex/y2-source-detection`
- HEAD at start: `b5092da` (`docs: record critical execution audit`)
- Working tree already contained scientific documentation and experiment files from earlier tasks. They were preserved and are not part of this focused integration change.
- Backend: local FastAPI process on port 8000, configured for real archive data.
- Frontend: Next.js production server on `127.0.0.1:3000`; rebuilt and restarted after the timeout adjustment.
- Docker status could not be inspected reliably in this turn; an earlier attempt reported permission denied on the Docker socket. Docker is not required for this local verification.

## Mira reproduction and root cause

Coordinates: RA `34.8366`, Dec `-2.9776`.

The browser showed **391 real SPHEREx observations**, with **3 selected and 3 images loaded**. The selected records are D1 with processing pipeline v27; they include DR1 and QR3 releases. The backend's compatibility rule groups observations by detector band and processing pipeline, so those releases can coexist under D1/v27.

The original browser request was:

```text
GET http://localhost:8000/api/candidates?ra=34.8366&dec=-2.9776&radius=0.25
```

Captured response body:

```json
{"error":{"code":"BAD_REQUEST","message":"Multiple compatible SPHEREx data groups are available (D1/v27, D2/v27, D3/v27, D4/v27, D5/v27, D6/v27); specify band and pipeline"}}
```

The backend access log recorded this endpoint as `400 Bad Request`. This is query selection validation, not a FITS parsing or SourceDetectionEngine error: `RealSource.candidates()` deliberately rejects an unfiltered regional search when it finds multiple `(band, pipeline)` groups.

## Analysis scope

The current endpoint is a **regional archive search**, not analysis of the exact selected observation IDs. The backend runs `search(ra, dec, radius)`, restricts observations to the requested band and processing pipeline, samples up to three compatible epochs, fetches those FITS products, then calls `SourceDetectionEngine`. Selected IDs and dates are not query parameters and do not constrain those input frames. The frontend now states this directly. It also blocks submission when the current selection mixes bands, contains missing/unsupported pipeline metadata, or spans multiple pipelines; it does not silently choose one.

## Changes made

1. `frontend/lib/observations.ts` adds `candidateSearchGroup()` to derive one supported band/pipeline from the selected observations. It accepts DR1 and QR3 together when the pipeline matches.
2. `frontend/lib/api.ts` now sends `ra`, `dec`, `radius=0.25`, `band`, and `pipeline` to `/api/candidates`.
3. `frontend/components/scientific-evidence.tsx` passes that group, prevents incompatible requests, and makes the regional-search semantics explicit.
4. `frontend/lib/scientific-evidence.ts` displays the backend's actionable `BAD_REQUEST` message.
5. Frontend tests cover request parameters, group compatibility, and backend error propagation.
6. The generic JSON request timeout was 60 seconds, although `backend/app/services/irsa.py` documents up to about 170 seconds for one FITS retrieval including retries. Candidate analysis processes up to three FITS frames sequentially. `getCandidateAnalysis()` now uses a 540-second request timeout to cover that worst case without changing the backend algorithm or retrieval policy.

No backend detection behavior, thresholds, matching radii, masks, Measurement Contract, or PR #2 was changed.

## Post-fix verification

### First browser attempt after the band/pipeline fix

- Mira Explorer remained functional, with 391 results and 3 loaded selected images.
- Clicking **Load candidate analysis** left the UI in `Requesting analysis` for about the generic 60-second timeout, then displayed `Results unavailable — connection or archive error`.
- The frontend console showed no browser errors.
- Backend logs later recorded the candidate request as HTTP 200; the browser had stopped waiting before that result arrived. The old 60-second client timeout was shorter than the backend's documented maximum retrieval window; it has been corrected.

### Second browser attempt after rebuild/restart

- Reloaded the production-built Explorer at the same Mira coordinates; 391 observations and the three loaded images were present.
- Clicked **Load candidate analysis** after rebuilding with the longer timeout.
- Browser UI finished with `Analysis completed` and `Candidate records returned: 277`.
- Backend access log recorded: `GET /api/candidates?ra=34.8366&dec=-2.9776&radius=0.25&band=D1&pipeline=v27 HTTP/1.1` → **200 OK**.
- Opened that exact API URL in a browser tab and inspected the JSON response. Its top-level fields included `query` with `band: "D1"`, `pipeline: "v27"`, `count: 277`, and `analysis: {"state":"completed","data_source":"real","scope":"sky_region"}`.
- Example returned record had `is_mock: false`, `engine_version: "spherex-peak-detect-0.1"`, real observation IDs, release/processing/source/archive provenance, and `status: "pending_validation"`. The output also included `quality.insufficient_evidence: true` and `quality_flags: ["insufficient_epochs"]` for many candidates. Photometric fluxes and errors were null in the inspected response records.
- Frontend page showed the completed results and explicitly stated they were regional records unrelated to the selected image IDs. The user-facing state did not call them discoveries or scientifically validated detections.

### SourceDetectionEngine evidence

`RealSource.candidates()` reaches `SourceDetectionEngine().detect(request)` after it has retrieved and opened compatible FITS files and formed an `EngineRequest`. The completed response contains 277 non-mock detections/candidates with real observation provenance and the engine's version/method metadata, demonstrating execution on the real-data path. The backend marks these as `pending_validation`; many carry insufficient-epoch/quality warnings, and flux/flux-error fields are unavailable. Do not treat the count as 277 validated astronomical changes. No precision, recall, or completeness was measured.

## Tests and build

- Frontend `npm test`: **46 passed, 0 failed**.
- Frontend `npm run typecheck`: **passed**.
- Frontend `npm run build`: **passed** (Next.js 16.4.5).
- Backend focused candidate tests: **7 passed, 19 deselected** (`tests/test_real_source.py -k candidates`). One pre-existing Starlette/httpx deprecation warning was emitted.
- No full backend suite was run.

## Remaining limitations

- The API returns candidate records with pending scientific validation. Gaia held-out references and a validated truth set are not supplied to this run; precision, recall, completeness, and false-positive rates remain unavailable.
- The API analyzes compatible archive observations found in the region, samples up to three epochs, and is **not** constrained to the three selected images. The UI discloses this.
- Some IRSA retrievals logged transient `ChunkedEncodingError`/HTTP 503 attempts before the real analysis request returned 200. Retry behavior recovered for the successful run. Continue to treat archive availability as variable.
- No further P0 integration issue was demonstrated in the requested candidate path. Docker was not used for this verified local flow.

## Git safety

- No commit or push was made.
- No changes were made to `main`, and PR #2 was not modified or merged.
- Only the seven candidate-integration frontend files and this report are intended for this task; all earlier scientific working-tree files remain untouched and unstaged.
