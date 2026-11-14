# SKYTRACE Critical Execution Report — 2026-11-13

## Final status

**RUNNING WITH LIMITATIONS.** The backend and frontend run locally outside Docker. A live RA/Dec archive search returned real SPHEREx observations and the UI rendered one real FITS image. IRSA then returned repeated HTTP 503 responses for other cutouts; those requests surfaced as HTTP 502 from the API. The candidate analysis request did not return a result during the check. Docker could not build or start because the Docker Engine was stopping and Compose returned `EOF`. The complete real-data detection-to-candidate-to-frontend flow is therefore **not verified**.

## 1. GitHub refresh

- `origin/main`: `a18b0ea` (`a18b0eae29b9639d39a4a1fad6e1a75f08ad27e2`), the Measurement Contract–updated main used by this branch.
- Y2 branch `codex/y2-source-detection`: remote was `7060bac` (`7060bacba496e0ba291f05c6226d35b4e1ec9e50`) at refresh. The integration commit was already present remotely; after this execution's small UI fix and report, the branch is advanced by the two commits listed below.
- PR #2 is open, not merged, and GitHub reported it mergeable at refresh. Its head was `7060bac` and its base was `main` at `a18b0ea`.
- PR #3 is also open, not merged: `jana/y2-api-fixes` at `8ec21cff4923917f5417bdbb324cb7eb2f104937`, based on the older `codex/y2-source-detection` head `51be56a`. It contains separate provenance/persistence/known-object/radius changes. I did not merge it or copy its implementation wholesale because the branch is based on an older Y2 head and a merge-tree preview had conflicts in backend detection files.
- At refresh, local HEAD equaled `origin/codex/y2-source-detection`; it contained four commits ahead of `origin/main` and no remote-only commits relative to the feature branch. Fetch completed successfully. No change was made to `main` and no PR was merged.
- Existing uncommitted scientific work was preserved. The existing modified science docs and untracked science scripts, validation reports, catalog files, templates, and audit notes remain outside the execution commits.

## 2. Existing system inventory

| Component | Existing implementation | GitHub status | Missing work |
|---|---|---|---|
| Backend | FastAPI health, target, search, observation, image, and candidate APIs. Real mode selects the archive-backed source. | Present on the refreshed Y2 branch. | Docker runtime and a successful live candidate response remain unverified. |
| Source Detection | Existing FITS/WCS detection and candidate construction through the Y2 engine; does not require the frontend to provide catalog coordinates. | Present on the refreshed Y2 branch; the PR description documents its conservative scientific limits. | This browser run did not confirm a completed live detection result because the candidate request did not finish. |
| FITS processing | FITS retrieval, cutout/image processing, WCS/provenance metadata, and PNG rendering are implemented. | Present. A live UI image request returned 200 for one observation; two others failed upstream. | Reliable archive availability for a multi-epoch demonstration. |
| IRSA integration | SIA observation search plus FITS/cutout requests. | Present. Live search succeeded; live cutout requests later received 503 from IRSA and the app returned 502 after retries. | Repeat the live workflow when IRSA is responsive; confirm Docker networking. |
| Measurement Contract | Typed scientific response schemas, provenance fields, and conservative treatment of unavailable measurements are implemented. | Contract-updated branch is based on `origin/main` at `a18b0ea`; no contract changes made here. | Verify an actual successful live `/api/candidates` response end to end. |
| Candidate API | `/api/candidates` is wired to the data source and used by the existing candidate panel. | Present on Y2. PR #3 proposes additional changes on its separate branch. | Current browser request stayed in “Requesting analysis”; response and live contract validation were not observed. The UI also clarifies that this is a regional search, not limited to selected dates/images. |
| Frontend | Next.js app routes `/`, `/explore`, `/explorer`; coordinate search, observation/date selection, image viewer, metadata, timeline, playback/compare/difference controls, and scientific-evidence panel exist. | Present and connected to `/api/health`, `/api/targets`, `/api/search`, image and candidate routes. | Live archive failures can leave selected images unavailable; complete candidate-to-render flow is unverified. |
| Docker | Existing root Compose defines `api` and `web`, API dependency, and a cache volume; `.env.example` files provide configuration. | Present; no Docker configuration was changed. | Docker Engine must reach a healthy running state before Compose can be tested. |
| Database/storage | No database is required by the current app; archive/cache storage is used. | Compose includes a named cache volume. | None identified for the requested workflow. |
| Tests | Backend pytest suite, opt-in live IRSA tests, frontend tests, typecheck, and Next production build. | Existing tests plus the focused frontend request contract. | Live candidate success and Docker smoke test remain to be run. |
| Documentation | API/science docs and existing validation reports are present. | Prior documentation and local scientific artifacts preserved. | This execution report is added in the report commit below. |

### Frontend feature classification

- Coordinate input and observation search — **IMPLEMENTED AND CONNECTED**; the real query below succeeded.
- Sky Explorer, date/visit selection, observation timeline and provenance display — **IMPLEMENTED AND CONNECTED**.
- Image visualization and states for loading/errors/no coverage — **IMPLEMENTED AND CONNECTED**; live retrieval was partial due to IRSA.
- Candidate panel — **IMPLEMENTED AND CONNECTED**; this live request remained pending, so a successful response is unverified.
- Authentication — no login flow is present or required for the current read-only demo workflow.

## 3. Changes made

The refreshed frontend sent a candidate radius of `0.5°`, but PR #3's server implementation caps that parameter at `0.25°`. I changed the client to request `0.25°` and changed the visible explanation to the same value. This prevents an HTTP validation failure when that backend fix is integrated and keeps the UI description consistent with its request. A regression assertion checks the outgoing radius.

Files in the focused frontend fix commit:

- `frontend/lib/api.ts`
- `frontend/tests/api.test.ts`
- `frontend/components/scientific-evidence.tsx`

Execution report commit:

- `docs/project/critical-execution-report-2026-11-13.md`

Commits:

- `e04be4a` — `fix: align candidate radius with backend limit`
- Report commit is recorded in the branch history after this file is committed.

No production detection thresholds, masking, matching policy, Measurement Contract version, Docker files, or PR #3 files were changed. No secrets were staged. Only the three frontend files and this requested report were selected for these commits.

## 4. Docker status

Existing Compose services are `api` and `web`; no database service is configured or required.

- `docker compose build` — **failed**, BuildKit returned `EOF` while the Docker Engine was unavailable.
- `docker compose ps` — **failed**, returned `EOF`.
- Docker Desktop showed **Engine stopping**. The containers were not built or started, so there is no Docker health check or container log to report.
- The intended Compose URLs are the configured frontend and API services; they could not be verified through Docker.

Local fallback processes were started outside Docker:

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:8000`
- `GET /api/health` returned `{"status":"ok","data_source":"real","version":"0.1.0"}`.

## 5. End-to-end results

| Stage | Result | Evidence |
|---|---|---|
| Open frontend and enter coordinates | **PASS** | Explorer opened at `http://localhost:3000/explore`; RA `34.83663`, Dec `-2.97764` submitted. |
| Frontend-to-backend search | **PASS** | Backend logged `GET /api/search?ra=34.83663&dec=-2.97764&radius=0` with HTTP 200. |
| Real observation metadata | **PASS** | UI showed 391 images, 43 reported dates, UTC coverage 2025-07-15 through 2026-08-07, real visit IDs, and D1 selection. |
| IRSA observation search | **PASS** | Live SIA search supplied DR1/QR3 observation records for the coordinates. |
| FITS retrieval and processing in UI | **BLOCKED BY EXTERNAL SERVICE (partial)** | One observation image endpoint returned HTTP 200 and the UI showed `1 of 3 images ready`; other cutout calls received IRSA HTTP 503 through all retries and the backend returned HTTP 502. |
| Source Detection on selected live observations | **NOT VERIFIED** | The candidate action was requested, but no completed result was returned in the observed UI. Existing automated/fixture validation is not a live multi-epoch detection result. |
| Candidate API / Measurement Contract response | **NOT VERIFIED** | UI stayed at “Requesting analysis”; no successful response was observed. Do not treat this as zero candidates or a failed scientific result. |
| Frontend renders actual data | **PASS (partial)** | Real observation list and one processed image rendered. A full observation sequence did not load. |
| Invalid coordinates, no observations, empty candidates, missing values | **PASS (fixture/unit coverage)** | Existing backend/frontend automated tests cover these states. They were not all repeated through a browser with live IRSA. |
| External IRSA unavailable path | **PASS (live error path)** | Live HTTP 503 responses were retried; API surfaced HTTP 502 rather than a successful image. |
| FITS processing failure path | **PASS (automated coverage only)** | Covered by existing tests; no separate corrupted live FITS was introduced. |
| Docker services and health | **BLOCKED** | Docker Engine stopping; Compose returned `EOF`. |

The browser's initial candidate-scope copy said `0.5°` even after the client radius was reduced. That visible mismatch was corrected to `0.25°` and the frontend build/typecheck/tests passed. The application also correctly labels detections as not evaluated until a completed scientific result exists.

## 6. Tests and commands

Backend suite:

```bash
cd backend
PYTHONPATH=app /private/tmp/skytrace-y2-venv/bin/python -m pytest -q -rs
```

Result: **100 passed, 3 skipped**. The three skips are opt-in live IRSA tests. A Starlette/httpx deprecation warning was reported.

Opt-in live archive tests:

```bash
cd backend
RUN_NETWORK_TESTS=1 PYTHONPATH=app /private/tmp/skytrace-y2-venv/bin/python -m pytest -q -rs tests/test_real_source.py -k network
```

Result: **3 passed, 23 deselected**. These covered live DR1 search, QR3 search, and a FITS cutout. Later UI requests encountered intermittent IRSA 503s, so this earlier pass does not establish continuous archive availability.

Frontend:

```bash
cd frontend
npm test
npm run typecheck
npm run build
```

Results: **45 tests passed**, typecheck passed, production build passed (routes `/`, `/explore`, `/explorer`). `git diff --check` passed before commits.

Docker commands attempted:

```bash
docker compose build
docker compose ps
```

Both were blocked by Docker Engine `EOF`. `docker compose up --build` and `docker compose logs` were not run because the engine was not available.

Local real-mode launch commands used:

```bash
cd backend
DATA_SOURCE=real CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000 PYTHONPATH=app /private/tmp/skytrace-y2-venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
cd frontend
npm run start
```

## 7. Remaining blockers

1. **P0 — Docker Engine unavailable.** Restart Docker Desktop and wait until the Engine reports running, then build/start Compose and inspect health/logs.
2. **P0 — intermittent IRSA cutout availability.** Retry the same real workflow when IRSA is responsive; do not demonstrate failed cutouts as missing observations or zero detections.
3. **P1 — live candidate result unconfirmed.** After IRSA is healthy, obtain a successful `/api/candidates` response and confirm the frontend displays its actual response and provenance. If it remains pending, inspect the backend request and response path.
4. **P1 — PR #3 remains separate.** Review/reconcile its provenance, persistence, known-object and radius changes onto the current Y2 branch only after its conflicts and base are understood. Do not merge blindly.

## 8. Recommended next actions and ownership

The repository/session does not provide a verified six-person roster, so these are role suggestions rather than invented member assignments:

1. **Demo/integration owner:** restore Docker Engine; run `docker compose build`, `docker compose up`, health checks, and capture logs.
2. **Archive/data owner:** retry the RA/Dec search and three cutouts after IRSA recovers; record which observation IDs return 200/503.
3. **Backend/source-detection owner:** verify one successful live `/api/candidates` call through detection and Measurement Contract validation; retain per-observation provenance.
4. **Frontend owner:** confirm that real candidate results, errors, empty states, selected dates, and the `0.25°` scope are displayed correctly.
5. **Scientific-validation owner:** check observation epochs/quality and review candidate interpretation; do not claim precision/recall or a discovery from this partial run.
6. **Release/demo owner:** record a short demo only after the Docker workflow and at least one complete live result are reproducible; keep the current local real-mode fallback for exploration.
