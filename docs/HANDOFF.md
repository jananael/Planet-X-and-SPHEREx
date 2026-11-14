# SKYTRACE: ملف تسليم لجلسة Claude جديدة

> **للمستخدم:** أعطي هالملف لـ Claude بالجلسة الجديدة، وقوليله: "اقرأ docs/HANDOFF.md وكمّل من هون".
> **To Claude:** this is the full context of the project so far. Read it before touching anything.
> The user (Jana, backend developer on the team) writes in **Palestinian Arabic**. Reply in Arabic,
> keep code/identifiers in English. She prefers short, direct answers. She often pastes teammates'
> messages or task cards: answer what they ask of HER, and give her ready-to-send messages when useful.

Last updated: **2026-11-14 (afternoon)** · `feat/explain-mode` (two display modes, orbit journey, sky story) merged into
`main` together with Sadeel's workspace restructure and Haneen's uploads. Open PRs: **#2** (Yazan's engine, not mergeable
yet) and **#3** (Jana's fixes into #2). **Commit/push only when Jana says. Update this file after every step** (Jana's rule).

---

## 1. What the project is

**NASA Space Apps Challenge 2026**, challenge **"Planet X and SPHEREx"** (team in Ramallah;
hackathon 14 Nov 2026, **submission 15 Nov 23:59**).

**SKYTRACE** is a public web **blink comparator** for NASA's SPHEREx infrared all-sky survey: pick a
point in the sky, list every SPHEREx image covering it (IRSA DR1 + QR3), flip between epochs to see
what moved (asteroids, comets, high proper-motion stars) or changed brightness (variables). Every
frame shows its time, band, wavelength, release and source file. **Never claim a discovery**
("investigate changes, not confirm discoveries").

### Team
| Who | Role |
|---|---|
| **Jana** (the user) | Backend (FastAPI) + finishing frontend work with Claude; owns API/integration tasks |
| **Sadeel** | Frontend, Explorer (`/explore`), new standalone homepage + Sky Navigator |
| **Batool** (GitHub `BatoolQubaa`) | Design, SKYTRACE visual identity |
| **Yazan** (GitHub `ManB441`) | Science lead: detection engine (PR #2), measurement contract, reviews |
| **Taqwa** | FITS & data quality, archive verification |
| **Haneen** | Image processing (peak accuracy) |

Repo: <https://github.com/jananael/Planet-X-and-SPHEREx>

---

## 2. Run it locally (Windows)

Project folder: `C:\Users\moham\OneDrive\Desktop\NASA` (inside OneDrive, see gotchas).

```bash
# Backend, REAL NASA data (what we demo). SHORT-PATH venv: astropy cannot load DLLs from long paths.
cd C:/Users/moham/OneDrive/Desktop/NASA
DATA_SOURCE=real C:/Users/moham/.venvs/planetx/Scripts/python -m uvicorn --app-dir backend app.main:app --port 8000
# Backend, mock data: same without DATA_SOURCE

# Frontend (Next.js 16, Node 24)
cd frontend && npm install && npm run dev        # http://localhost:3000 (Home) and /explore
```
In the Claude app the preview config lives in the session's scratch folder `.claude/launch.json`
(names `backend-real`, `backend-mock`, `frontend`, with absolute paths); `.claude/launch.json` in the repo
also exists. After `next.config.mjs` changes, restart the frontend.

Tests (all green on `main` 2026-11-14):
```bash
cd backend && C:/Users/moham/.venvs/planetx/Scripts/python -m pytest -q          # 71 passed, 3 skipped
RUN_NETWORK_TESTS=1 ... pytest -v -k network tests/test_real_source.py            # 3 live IRSA tests (passed 2026-11-13)
cd frontend && npm test && npx tsc --noEmit                                       # 20 pass
```
If `npm run build` fails with `EPERM ... unlink .next\...` → `rm -rf frontend/.next/server frontend/.next/static` and retry (OneDrive lock).
`git pull` / `git push` sometimes hang on this network: wrap them in `timeout 60`.

Env vars: backend `DATA_SOURCE=mock|real`, `MOCK_DIR`, `CACHE_DIR` (default `backend/.cache`),
`CORS_ORIGINS` (default `http://localhost:3000,http://127.0.0.1:3000`).
Frontend `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`), `NEXT_PUBLIC_SITE_URL`.

---

## 3. Layout

```
backend/
  app/main.py                app + CORS (exposes X-* provenance headers) + routers under /api
  app/schemas/candidate.py   MEASUREMENT CONTRACT (0.2-draft): Candidate/Detection, QualityFlag, validators
  app/routers/               health, targets, search, observations (+ /image PNG), candidates, hips relay
  app/services/data_source.py  DataSource + MockSource (+ mock candidates); get_data_source() mock/real
  app/services/real_source.py  RealSource: IRSA search + cutouts, disk cache, proper motion
  app/services/irsa.py       SIA2 (DR1+QR3), cutouts w/ retries, spectral WCS, FLAGS, north-up reprojection
  app/services/engine.py     engine interface: EngineFrame, EngineRequest, KnownObject, limits
  app/mock_data/*.v0.json    6 demo targets, 16 mock observations (release label "MOCK")
  scripts/generate_mock.py   regenerates mock JSON (targets' validation status, real_view, pm)
  scripts/check_moving_targets.py   Horizons + footprints for Vesta/12P/3I → scripts/out/*.json (gitignored)
  scripts/check_3i_atlas_images.py  3I/ATLAS seen in all 23 DR1 images (evidence for "verified")
  scripts/observation_inventory.py  S2-T2 inventory → docs/observation-inventory.md + docs/inventory/*.csv
frontend/
  next.config.mjs            rewrites "/" → public/skytrace-homepage/index.html (Sadeel's standalone homepage)
  public/skytrace-homepage/  the homepage actually served (HTML/CSS/JS + assets)
  app/page.tsx, components/home-page.tsx   OLD React homepage, bypassed by the rewrite
  components/explorer.tsx    the Explorer (search, visits, blink, stories, compare, difference, GIF…)
  components/sky-map.tsx     Sadeel's Sky Navigator (Aladin Lite + d3-celestial catalogs, bookmarks)
  lib/api.ts, lib/observations.ts, lib/stories.ts, lib/gif.ts, lib/sky-navigation.ts
  public/skytrace/CREDITS.md image list; source/licence column to be filled by Batool/Sadeel
docs/
  api-contract.md            THE API contract
  measurement-contract.md    engine ↔ backend ↔ frontend contract (S2-T3), rules + open items
  candidate.schema.json      JSON Schema of Candidate (test fails if out of date)
  examples/candidate.example.json   real-data example (Vesta QR3, real provenance)
  data-releases.md           S2-T1: DR1+QR3 compatibility, live search evidence, limitations
  observation-inventory.md   S2-T2 inventory + review status (Taqwa/Yazan)
  evidence/explorer-real-data.md   Explorer on real data: journey, requests/responses, error states
  science-findings.md        verified science facts + Yazan's decisions
  science/                   Yazan's docs (Vesta epoch inventory, source-detection validation)
```

## 4. API (details in docs/api-contract.md)
`GET /api/health` · `GET /api/targets` · `GET /api/search?ra=&dec=&radius=&start=&end=` ·
`GET /api/observations/{id}` · `GET /api/observations/{id}/image?ra=&dec=&size=&stretch=&vmin=&vmax=` (PNG +
`X-Source-File, X-Obs-Time, X-Wavelength-Um, X-Bandwidth-Um, X-Wavelength-Source, X-Band, X-Release,
X-Processing-Version, X-Cutout-Ra/Dec, X-Stretch-Vmin/Vmax, X-Repaired-Pixels/Flags, X-Transient-Pixels`) ·
`GET /api/candidates?ra=&dec=&radius=` (mock: synthetic; real on `main`: 501 until the engine is merged) ·
`GET /api/hips/allwise/{file}`.
Errors: BAD_REQUEST 400, NOT_FOUND 404, NO_COVERAGE 404, UPSTREAM_ERROR 502, NOT_IMPLEMENTED 501, INTERNAL_ERROR 500.

**Blink rule:** first image's X-Stretch-Vmin/Vmax are passed to the others, or brightness changes vanish.

---

## 5. Real SPHEREx data: verified facts (don't re-learn these)
- **DR1** (`spherex_dr1`, 2025-05 → 2026-05) + **QR3** (`spherex_qr3`, 2026-07 → 2026-09); QR2 is gone. Both
  `l2b-v27`, FITS `VERSION 7.0.5`, `MJy / sr` → compatible (Yazan). 7 DR1 files are `l2b_retry-v27` = same pipeline.
- Cutouts: `access_url?center=ra,dec deg&size=N arcsec`, 6.15″/px, **5–33 s**, frequent 503 / ChunkedEncodingError
  → retries + disk cache (`backend/.cache/cutouts`, keyed by processing version). Detector frame, rotates
  between visits → reprojected north-up. Wavelength varies across the detector (CWAVE/CBAND calibration).
- FLAGS names from `MSKN*`/`MSKM*`. Display repairs only detector defects; **TRANSIENT is never repaired**,
  counted in `X-Transient-Pixels` (UI wording: "pixels flagged TRANSIENT", not "cosmic rays").
- Targets: **Vesta** verified (2026-07-13 D2, QR3, 124″ in 3.2 h) · **3I/ATLAS verified** as Known Moving
  Object Demo (all 23 DR1 images of 2025-12-08 within 1 px of Horizons; ~5″ east offset in D1 = geocentric vs
  LEO) · **Barnard's Star** from Gaia DR3 · **Mira** brightness change · **WISE 0855** pm −8.119/+0.680″/yr, D6 ·
  12P too faint (mock only).
- Cached real data (fast demo): Mira, Barnard, WISE 0855, Vesta (story frames), 3I/ATLAS (5 × D1).
- CDS servers were unreachable here; IRSA HiPS has no CORS → backend relay. jsdelivr (Aladin Lite) can be very
  slow → the sky map may not load; coordinates/targets/stories always work.

## 6. Decisions already taken (don't undo without asking Jana)
- Name **SKYTRACE**. Homepage = Sadeel's standalone page; credit footer "Data: NASA SPHEREx via NASA/IPAC IRSA ·
  NASA Space Apps Challenge 2026 project, not an official NASA product." on every page; heading says
  "Exploration", never "Discovery".
- Mock data is labelled everywhere (badge MOCK DATA, "SYNTHETIC DEMO DATA", release **MOCK**, `MOCK_` file names,
  "Synthetic demo images").
- Every search (typed coordinates, target card, map, shared link, story) auto-selects one frame per visit and loads it.
- Measurement contract **0.2-draft** (`candidate.py`), all enforced by tests: SNR per detection + median/min summary;
  `low_snr` auto-flag below 5 (provisional); fixed 10 quality flags; one band per brightness series; score null
  (0–1 ranking, never a probability); UTC-aware times only; flux in µJy, `flux_error` never without flux;
  `observation_ids` = detections' ids (explicit `[]` rejected); **provenance per detection** (`release`,
  `processing_version`, `source_file`, `archive_id`; required for engine results); `data_release` derived ("DR1+QR3");
  engine never calls external services (backend sends `known_objects`); one known pipeline per request.
- Aladin Lite (GPL-3) loaded at runtime only, never bundled. GIF via gifenc (MIT).
- Commits end with `Co-Authored-By: Claude …`; commits touching a teammate's work also credit them
  (Sadeel: `sadeel anbar <sadelanbar1000@gmail.com>`, Batool: `BatoolQubaa <182422769+BatoolQubaa@users.noreply.github.com>`).
  Never invent a teammate's email.

## 7. Gotchas
- **Windows long paths** → venv at `C:\Users\moham\.venvs\planetx`; `git config core.longpaths true` is set.
- **OneDrive** locks `.next` and syncs node_modules (moving the repo out is recommended, not done).
- **`img.decode()` hangs in hidden tabs** → load events only.
- Browser testing: Jana clicks in the pane's tabs; open your own background tab for tests.
- Editing `explorer.tsx` while a page is loading frames triggers Fast Refresh and drops the selection.
- Teammates upload files through the GitHub web UI (e.g. a `.gitignore` overwrite on 2026-11-13, restored):
  check `git log origin/main` after every fetch.

---

## 8. Status (2026-11-14)
### Done ✅ (on `main`)
- Explorer on real data end to end (evidence doc), DR1+QR3 search with live tests, all 4 demo targets + 3I/ATLAS,
  3 guided stories (texts checked against real data), mobile layout, error/no-coverage/loading states.
- S2-T1 (data releases), S2-T2 (inventory; WISE 0855 + Mira verified by Taqwa against IRSA), S2-T3 contract 0.2.
- Homepage fixes on Sadeel's page (credit, "Exploration", dead dialog removed), `CREDITS.md` draft.
- **Two display modes** in the viewer (`/observations`, Sadeel's new workspace routes `/explore` · `/observations` ·
  `/machine-learning`):
  - 🔬 **Scientific view**: images (blink/compare/difference, Sadeel's toolbar) + ONE button **"Explain the data"**:
    for objects with a journey (Vesta, 3I/ATLAS) it plays the **orbit journey** (`components/journey-player.tsx`:
    Solar System from above with JPL Horizons orbits, SPHEREx visits, sky track, then the real images with
    predicted-position circles); otherwise the step-by-step walkthrough (`explain-player.tsx`, `/api/explain`).
  - ✨ **Simple explanation** (demo: Vesta): **sky story** (`components/sky-story-player.tsx`): the object travels
    through the REAL night sky 2020–2030 on an oval all-sky map (Hammer-Aitoff), real Hipparcos stars + IAU
    constellations (d3-celestial catalogs), Milky Way on the real galactic plane, constellation behind the object
    computed live (`skyRegion`), SPHEREx mentioned only at real exposure dates, **past solid / future dotted
    "predicted"** with a "TODAY" marker, full screen.
  - Backend: `/api/explain` (facts + predicted positions) and `/api/journey/{target}` (Horizons vectors, sky track,
    10-year `sky_years`, SPHEREx visits from `docs/inventory`; cached in `.cache/journey`; 502 if Horizons is down).
  - All of it is our own code and real data. No external video tool (a Kling AI clip was generated once, 30 credits,
    and dropped; nothing downloaded).
- Fixed a dev-mode bug in Sadeel's restructure: the search was cancelled by React StrictMode's double mount and never
  restarted (`lastSearch` now cleared on unmount). If the dev server shows hydration mismatches after a merge,
  stop it and delete `frontend/.next`.

### In review
- **PR #2** `codex/y2-source-detection` (Yazan's peak detector): **not mergeable** (team decision). Scientific
  validation pending (SNR 5 and 12.3″ provisional, association/motion not validated, no completeness/FP rate).
- **PR #3** `jana/y2-api-fixes` → PR #2: per-detection provenance, results on disk (`.cache/candidates`),
  `known_objects` from backend (`app/services/known_objects.py`: Gaia/literature pm + Horizons inside `real_view`
  windows), radius ≤ 0.25° (1800″ cutout). 105 passed. Not run on live IRSA yet; no `start`/`end` for candidates.

### Waiting on others
- **Yazan:** approve contract → set `CONTRACT_VERSION = "1.0"`; review/merge PR #3; validation protocol.
- **Taqwa:** FLAGS policy (TRANSIENT/OVERFLOW/BLOOM/SUR_ERROR), QR3 checks, review 12P/3I/Barnard inventory, S2-T4.
- **Haneen:** peak accuracy vs reference catalogs (we offered a 2MASS/Gaia TAP comparison script).
- **Batool/Sadeel:** fill `CREDITS.md` sources; Batool approves logo; T7 candidate UI (unconfirmed label,
  observation id, flags, "Not available" for nulls) once real measurements exist.

### Next for Jana (priority order)
1. **Deploy** (`docs/deploy.md`; Dockerfiles untested; Jana's accounts; decide host). Submission is 15 Nov.
2. **Warm the cache before the demo** (`backend/scripts/prefetch_demo.py`, include 3I/ATLAS).
3. **Demo video** (1–2 min).
4. Explain modes, next: voice/narration, Arabic captions (constellations.json has Arabic names), a "Download video"
   button, the sky story for 3I/ATLAS (backend ready, not tried in the browser), Yazan to review all caption texts
   (`lib/explain.ts`, `lib/journey.ts`, `lib/sky-story.ts`).
5. Small: `processing_version` missing for moving targets in the inventory (from `check_moving_targets.py`).
6. Advice given to the team: Yazan should not use ML to predict orbits (physics/Horizons is exact); ML fits
   real-vs-artifact classification or linking. IRSA already has a Source Discovery Tool (single-frame detection):
   focus the engine on cross-epoch linking/motion and on excluding known objects.
