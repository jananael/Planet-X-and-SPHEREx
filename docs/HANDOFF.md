# SKYTRACE: ملف تسليم لجلسة Claude جديدة

> **للمستخدم:** أعطي هالملف لـ Claude بالجلسة الجديدة، وقوليله: "اقرأ docs/HANDOFF.md وكمّل من هون".
> **To Claude:** this is the full context of the project so far. Read it before touching anything.
> The user (Jana, backend developer on the team) writes in **Palestinian Arabic**. Reply in Arabic,
> keep code/identifiers in English. She prefers short, direct answers.

Last updated: 2026-11-13 (evening) · local `main` = GitHub + uncommitted work for Yazan's items 3, 4, 6, 7. **Push only when Jana says.**

---

## 1. What the project is

**NASA Space Apps Challenge 2026**, challenge **"Planet X and SPHEREx"** (team in Ramallah;
hackathon starts **14 Nov 2026, 09:00 local**, submission 15 Nov 23:59).

**SKYTRACE** (the project name; a rename to "MARS" was tried and reverted, keep SKYTRACE) is a
public web **blink comparator** for NASA's SPHEREx infrared sky survey: pick a point in the sky,
list every SPHEREx image covering it, flip between epochs to see what moved (asteroids, stars) or
changed brightness (variables). Every frame shows its source file, time and wavelength. Never claim
a discovery ("investigate changes, not confirm discoveries").

### Team
| Who | Role |
|---|---|
| **Jana** (the user) | Backend (FastAPI) + now also finishing frontend work with Claude |
| **Sadeel** | Frontend, Explorer page (`/explore`) |
| **Batool** (GitHub `BatoolQubaa`) | Design + Home page (`/`), owner of the SKYTRACE visual identity |
| **Yazan**, Taqwa, Haneen | Science team (data, FITS, scientific review) |

Repo: <https://github.com/jananael/Planet-X-and-SPHEREx> (Batool was invited as collaborator).

---

## 2. Run it locally (Windows)

Project folder: `C:\Users\moham\OneDrive\Desktop\NASA` (inside OneDrive, see gotchas).

```bash
# Backend (mock data). Use the SHORT-PATH venv: astropy cannot load DLLs from long paths.
cd C:/Users/moham/OneDrive/Desktop/NASA
C:/Users/moham/.venvs/planetx/Scripts/python -m uvicorn --app-dir backend app.main:app --port 8000

# Backend with REAL NASA data
DATA_SOURCE=real C:/Users/moham/.venvs/planetx/Scripts/python -m uvicorn --app-dir backend app.main:app --port 8000

# Frontend (Next.js 16, Node 24)
cd frontend && npm install && npm run dev        # http://localhost:3000 (Home) and /explore
```

Tests:
```bash
cd backend && C:/Users/moham/.venvs/planetx/Scripts/python -m pytest -q          # 36 pass, 1 skipped
RUN_NETWORK_TESTS=1 ... pytest -k network                                         # hits real IRSA
cd frontend && npm run test && npm run typecheck && npm run build                 # 12 pass
```
If `npm run build` fails with `EPERM ... unlink .next\...` → `rm -rf frontend/.next/server frontend/.next/static` and retry (OneDrive lock).

Env vars: backend `DATA_SOURCE=mock|real`, `MOCK_DIR`, `CACHE_DIR` (default `backend/.cache`),
`CORS_ORIGINS` (default `http://localhost:3000,http://127.0.0.1:3000`).
Frontend `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8000`), `NEXT_PUBLIC_SITE_URL` (share image base).

---

## 3. Layout

```
backend/                     FastAPI, Python 3.11+ (dev machine: 3.14)
  app/main.py                app + CORS (exposes X-* provenance headers) + routers under /api
  app/config.py              settings (pydantic-settings)
  app/errors.py              uniform errors {"error":{"code","message"}}
  app/schemas/               Target (+ optional pm_ra, pm_dec, epoch), Observation, errors
  app/routers/               health, targets, search, observations (+ /image PNG), hips (sky-map relay)
  app/services/data_source.py  DataSource interface + MockSource; get_data_source() picks mock/real
  app/services/real_source.py  RealSource: IRSA search + cutouts, disk cache, proper motion
  app/services/irsa.py       SIA2 search (QR2+QR3), cutout fetch w/ retries, spectral WCS, reprojection
  app/services/image_service.py  stretch (asinh/zscale/linear) + PNG
  app/services/mock_sky.py   synthetic cutouts for mock mode
  app/mock_data/*.v0.json    5 demo targets, 13 mock observations (generated)
  scripts/generate_mock.py   regenerates mock JSON
  scripts/spike_irsa_sia.py  throwaway exploration script for real data
frontend/                    Next.js 16 App Router + TypeScript (no Tailwind)
  app/page.tsx + home.css    Home (Batool's design, ported from her Vite version)
  app/explore/page.tsx       Explorer route; app/explorer → redirects to /explore
  app/globals.css            Explorer styles (Sadeel's, aligned to Batool's tokens) + all new features
  app/icon.svg, opengraph-image.jpg(+.alt.txt)   favicon + social share image
  components/brand.tsx       SKYTRACE wordmark in HTML/SVG (font Michroma), shared by both pages
  components/home-page.tsx   Home: hero, still telescope by Earth, big telescope fades in (framer-motion)
  components/explorer.tsx    the Explorer (large file: search, visits, blink, stories, compare, GIF…)
  components/sky-map.tsx     Aladin Lite sky-map picker (lazy)
  lib/api.ts                 fetch, timeouts, blink loader (shared stretch, 3 workers, UPSTREAM retry)
  lib/observations.ts        visit grouping, default selection
  lib/stories.ts             the 3 guided stories (text lives here)
  lib/gif.ts                 GIF export (gifenc)
  public/skytrace/           Batool's images as WebP (earth, milky-way, telescope)
docs/
  api-contract.md            THE contract (endpoints, fields, errors, real-mode differences)
  irsa-spike-findings.md     what real SPHEREx data looks like (read this before touching RealSource)
  questions-for-yazan.md     open science questions
  explorer-spec.md, homepage-spec.md, frontend-tasks.md   specs/tasks (frontend-tasks.md is now mostly DONE, needs updating)
```

## 4. API (details in docs/api-contract.md)
`GET /api/health` · `GET /api/targets` · `GET /api/search?ra=&dec=&radius=` ·
`GET /api/observations/{id}` · `GET /api/observations/{id}/image?ra=&dec=&size=&stretch=&vmin=&vmax=` (PNG +
headers X-Source-File, X-Obs-Time, X-Wavelength-Um, X-Band, X-Release, X-Cutout-Ra/Dec, X-Stretch-Vmin/Vmax) ·
`GET /api/hips/allwise/{file}` (sky-map tile relay).
Error codes: BAD_REQUEST 400, NOT_FOUND 404, NO_COVERAGE 404, UPSTREAM_ERROR 502, NOT_IMPLEMENTED 501, INTERNAL_ERROR 500.

**Blink rule:** first image's X-Stretch-Vmin/Vmax are passed to the others, or brightness changes vanish.

---

## 5. Real SPHEREx data: facts we verified (don't re-learn these)
- IRSA replaced QR2 with **DR1** (Surveys 1–2): search `spherex_dr1` + `spherex_qr3` (different time ranges). Searches are cached 24 h in `.cache/search`.
- Cutouts: `access_url?center=ra,dec deg&size=N arcsec`. 300″ ≈ 49×49 px at 6.15″/px. ~5 MB (mostly PSF HDU), **5–33 s**, transient 503s/timeouts → retries + disk cache.
- Cutouts are detector-frame and **rotate ~180° between visits** → reproject north-up (done in irsa.py).
- **Wavelength varies across the detector**: same detector D3 gave 2.37 µm and 1.62 µm in different visits. Target pixel → raw detector pixel via WCS key `A`; wavelength/bandwidth from CWAVE/CBAND calibration (`scripts/download_spectral_wcs.py`) or the image's WCS-WAVE (`key="W"`) when missing. They agree to ≤0.4 nm. The UI warns when frames' bands don't overlap or releases are mixed.
- FLAGS bit meanings come from header cards `MSKN*`/`MSKM*`; flagged pixels are repaired **for display only** (3×3 median).
- Moving targets: `scripts/check_moving_targets.py` (Horizons + `s_region` polygons). Vesta verified (2026-07-13 D2), 3I/ATLAS pending (2025-12-08 D1), 12P too faint. Details: `docs/science-findings.md`.
- Saturated bright stars have **NaN cores** → treated as bright (white), not NO_COVERAGE.
- High proper motion: Barnard's Star (Gaia DR3 via IRSA TAP) is propagated to 2026.0 and lands within ~0.7″ of the images. Real-mode `/api/targets` shows asteroids/comets **only with a verified `real_view`** (position, time window, band).
- Verified in real data: Barnard's Star difference image shows a north-light/south-dark pair growing with time (its proper motion, sub-pixel); Mira's glow grew then shrank across visits (core saturated). The story texts reflect this.
- CDS servers (aladin.cds.unistra.fr, alasky) were **unreachable** from this network; IRSA hosts HiPS mirrors but sends **no CORS headers** → backend relay `/api/hips/allwise`.

## 6. Decisions already taken (don't undo without asking Jana)
- Name **SKYTRACE**; logo rebuilt in code (SKY white, TRACE purple incl. T, Λ-shaped A with star, trail with 3 dots); Batool still has to approve it.
- Home telescope: small and still beside Earth; large one fades/slides in once when section 2 enters view (no scroll-linked travel).
- Explorer uses Batool's tokens: bg `#03040a`, text `#f3f2fb`, purple `#c27af3`, DM Sans, light 400 headings.
- Aladin Lite is **GPL-3** → loaded at runtime from `cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.js` (ES module), never bundled. Options `hipsList: [], log: false` (no CDS calls).
- GIF export with `gifenc@1.0.3` (MIT); every frame captioned with time/band/wavelength + data credit.
- Footer credit on both pages: "Data: NASA SPHEREx via NASA/IPAC IRSA · NASA Space Apps Challenge 2026 project, not an official NASA product."
- No database needed (disk cache + JSON). Only if a shared "flag a candidate" list is added (then SQLite).
- Every commit ends with `Co-Authored-By: Claude …`; commits that port Batool's work also credit her
  (`Co-authored-by: BatoolQubaa <182422769+BatoolQubaa@users.noreply.github.com>`). Push only when Jana says.

## 7. Gotchas
- **Windows long paths**: astropy fails ("filename or extension is too long") → venv at `C:\Users\moham\.venvs\planetx`; `git config core.longpaths true` is set.
- **OneDrive**: locks `.next` files (build EPERM) and syncs node_modules. Moving the repo to e.g. `C:\Projects\NASA` is recommended (not done).
- **`img.decode()` hangs in hidden tabs** (browser pane hidden) → we use load events everywhere. Don't reintroduce `decode()`.
- Browser testing in the app's pane: the user often clicks in the same tab; open a separate tab for tests.

---

## 8. Status
### Done ✅
Backend (mock + real), contract, spike findings, Explorer (Sadeel + additions), Home (Batool's design),
real-data fixes, guided stories, scale bar, swipe compare, favicon, share image, credit line, sky map, GIF export.
Since 2026-11-12: DR1+QR3 search (cached), real footprints (polygons), candidate endpoints (mock),
target metadata (validation status, catalog motion, real_view, time window, preferred band), Vesta on real
data (verified), 3I/ATLAS target (pending), Barnard from Gaia DR3, CWAVE/CBAND wavelengths (all 6 calibration
files downloaded to `backend/.cache/cal`), FLAGS repair for display, Dockerfiles + `docs/deploy.md`,
`docs/science-findings.md`. Hint: the "Something moved" story works on real data (Vesta 2026-07-13 D2).

### Yazan's answers (2026-11-13) → what to do
Yazan answered the 7 final questions (end of `docs/questions-for-yazan.md`). Decisions:
1. **DR1 + QR3:** DR1 reprocessed Surveys 1–2 with the same pipeline/calibration as QR3 → mixing is OK.
   Check pipeline/calibration compatibility, not the release name. ✅ DONE (uncommitted): frontend
   `mixedPipelines()` in `lib/observations.ts` warns only when `l2b-vNN` differs (all cached DR1 and QR3 = `l2b-v27`).
   Needs: backend already returns `processing_version`; tests updated (13 pass, tsc ok).
2. **Stories:** Yazan wants the texts of the 3 stories (Vesta, Mira, Barnard) from `frontend/lib/stories.ts`
   to review sentence by sentence → give Jana the texts (plain, copyable) to send him.
3. **WISE 0855:** D6 default is fine, user can change band. Proper motion from published IR astrometry:
   **pmRA = −8.119″/yr, pmDec = +0.680″/yr** (total ~8.15″/yr). ✅ DONE (uncommitted). Was: update `("pm", -8.1, 0.7)` and
   `PM_SOURCE` in `backend/scripts/generate_mock.py`, regenerate mock JSON. Note: exact position needs
   parallax too (~0.4″, below the 6.15″ pixel) → mention, don't implement.
4. **TRANSIENT pixels:** never change science data; repair only a display copy; in the difference image
   and analysis do NOT replace flagged pixels; keep them as a mask; warn if a candidate is near them.
   ✅ DONE (uncommitted). Was: remove "TRANSIENT" from `DISPLAY_BAD_FLAGS` in `backend/app/services/irsa.py` (difference is computed
   from the display PNGs in the frontend), add header `X-Transient-Pixels` (count) + expose in CORS, show a
   small note in the Explorer metadata. Update the FLAGS test in `tests/test_real_source.py`.
5. **3I/ATLAS:** adopt as a **Known Moving Object Demo** (never a discovery). Show real frames + expected
   position per exposure vs measured. Our 265″ in 1.64 h (00:07→01:45 UTC 2025-12-08) must be checked
   against IRSA's official 3I/ATLAS page (schedule + predicted coords) or Horizons. It has a coma (extended)
   → no point-source photometry. TODO: look at it in real mode; if visible → `verified` + note "known object demo".
6. **Detection engine:** a Python library inside the project, called by the backend, returning Candidate
   objects per an agreed contract (Yazan defines algorithm/measurements/scoring, then agrees the contract with Jana).
   ✅ DONE (uncommitted). Was: add optional `snr`, `quality_flags: list[str]`, `evidence: dict` to `app/schemas/candidate.py`
   (+ frontend type if any, + `docs/api-contract.md`).
7. **Photometry/units:** PSF photometry (official SPHEREx Tractor-based spectrophotometry tool) for point
   sources; aperture only as a test (try 2/2.5/3 px + background annulus, not final); extended sources
   (3I) need extended-source analysis. Units: image pixels **MJy/sr**; integrated flux and flux_error **µJy**
   (convert with the pixel solid-angle map; never sum MJy/sr as flux). ✅ DONE (uncommitted). Was: document in contract
   (`flux_unit` = "uJy").

Then: record decisions in `docs/science-findings.md` + `docs/questions-for-yazan.md` (mark answered),
run tests (`backend`: 47 passed 1 skipped; `frontend`: npm test 13 pass, `npx tsc --noEmit`), commit, ask Jana to push.

### Left to do (other)
**Blocked on Batool:** image sources → `frontend/public/skytrace/CREDITS.md`; approve the code logo.
**Blocked on Sadeel:** review what was added to her Explorer.
**Can be done now:**
1. **Deploy** following `docs/deploy.md` (Docker files not tested: Docker isn't installed). Accounts must be Jana's.
2. Untested paths: "Search here" from the map; stories in real mode via UI; mobile; reduced-motion.
3. Timeline · Arabic/English UI (RTL).
4. Housekeeping: split `explorer.tsx`; delete old branches; move repo out of OneDrive.
5. Demo video (1–2 min).
