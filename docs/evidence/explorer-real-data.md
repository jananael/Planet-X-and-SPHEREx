# Evidence: Explorer RA/Dec search on real SPHEREx data

**Date:** 2026-11-13 · **Backend:** `DATA_SOURCE=real` (IRSA DR1 + QR3) · **Frontend:** `npm run dev`, `/explore`
Tested in a browser by driving the real UI (no mocks), plus direct API calls for the error codes.

## 1. User journey (real data)

| Step | What the user does | What happened |
|---|---|---|
| 1 | Types RA `34.83663`, Dec `-2.97764` (Mira), presses Enter | URL becomes `/explore?ra=34.83663&dec=-2.97764`; badge **LIVE ARCHIVE** |
| 2 | Waits for the search | **391 images across 43 dates**, 3 visits, 2025-07-15 → 2026-08-07, header **NASA / IPAC IRSA ARCHIVE** (DR1 267 + QR3 124, same as Taqwa's IRSA check) |
| 3 | Clicks *Suggested selection* (one D1 frame per visit) | Loading state: "Gathering moments in time · 2 of 3 images ready · First-time archive images can take 5–30 seconds each" |
| 4 | Waits (one image was not cached; IRSA failed once and the backend retried) | **3 real frames** shown, blink ready |
| 5 | Reads the metadata | `2025-07-15 10:53:59 UTC` · `D1` · `0.744 µm` · `DR1` · `level2_2025W29_1A_0273_2D1_spx_l2b-v27-2026-217.fits` · TRANSIENT note · "Data: NASA/IPAC IRSA, SPHEREx" |

The UI also warned that these 3 frames' wavelength ranges do not overlap (expected: the wavelength varies across the detector).

## 2. Requests sent by the browser

```
GET /api/health                                                                  200
GET /api/targets                                                                 200
GET /api/search?ra=34.83663&dec=-2.97764                                         200
GET /api/observations/2025W29_1A_0273_2D1/image?ra=34.83663&dec=-2.97764&size=300&stretch=asinh                        200
GET /api/observations/2026W29_1A_0553_1D1/image?...&vmin=2.57992&vmax=2019.61   200   (same stretch as frame 1)
GET /api/observations/2025W52_2A_0488_1D1/image?...&vmin=2.57992&vmax=2019.61   200   (after one IRSA retry)
```

## 3. Responses

`/api/search` (first record):
```json
{"id": "2025W29_1A_0273_2D4", "obs_time": "2025-07-15T10:53:59Z", "band": "D4", "release": "DR1",
 "processing_version": "l2b-v27-2026-217", "source_file": "level2_2025W29_1A_0273_2D4_spx_l2b-v27-2026-217.fits",
 "archive_id": "ivo://irsa.ipac/spherex_dr1?2025W29_1A_0273_2/D4"}
```
count 391 · `{"DR1": 267, "QR3": 124}`

Image response headers (`200 OK`, `image/png`):
```
x-source-file: level2_2025W29_1A_0273_2D1_spx_l2b-v27-2026-217.fits
x-obs-time: 2025-07-15T10:53:59Z      x-band: D1      x-release: DR1
x-wavelength-um: 0.7443   x-bandwidth-um: 0.0173   x-wavelength-source: CWAVE (spectral_wcs_D1.fits)
x-processing-version: l2b-v27-2026-217
x-stretch-vmin: 2.57992   x-stretch-vmax: 2019.61
x-repaired-pixels: 72     x-transient-pixels: 152
```

## 4. Error and empty states

| State | How it was triggered | Result |
|---|---|---|
| **API error** (UI) | Backend stopped, search `/explore?ra=120&dec=40` | Badge **API NOT CONNECTED**; "Cannot reach the backend. Check that it is running on port 8000, then retry." with *Retry connection* / *Retry search* buttons |
| **No coverage, search** (UI) | Mock backend, search RA 120 Dec 40 (no demo data there) | "A little further into the sky · Try another position or one of the demo targets." (SPHEREx covers the whole sky, so a real point search is not expected to be empty) |
| **No coverage, image** (API) | `GET /api/observations/2025W29_1A_0273_2D1/image?ra=120&dec=40` | `404 {"error":{"code":"NO_COVERAGE","message":"Observation '2025W29_1A_0273_2D1' does not cover ra=120.0, dec=40.0"}}`; the UI shows "This image does not cover the selected position." (frontend test `api.test.ts`) |
| **Bad input** (API) | `GET /api/search?ra=400&dec=0` | `400 BAD_REQUEST "query.ra: Input should be less than 360"`; the UI form blocks it before sending |
| **Unknown id** (API) | `GET /api/observations/nope/image` | `404 NOT_FOUND` |
| **IRSA failure** | Happened by itself (HTTP 503 / ChunkedEncodingError) | Backend retried and the frame loaded; after all retries the API returns `502 UPSTREAM_ERROR` and the frontend retries once (test in `api.test.ts`) |

## 5. Mock vs real

| Where | Real mode | Mock mode |
|---|---|---|
| Header badge | LIVE ARCHIVE | **MOCK DATA** |
| Results heading | NASA / IPAC IRSA ARCHIVE | **SYNTHETIC DEMO DATA** |
| Release tag | DR1 / QR3 | **MOCK** (was "QR2", a real release name; changed 2026-11-13) |
| Source file | `level2_…_spx_l2b-v27-….fits` | `MOCK_spherex_….fits` |
| Credit line | Data: NASA/IPAC IRSA, SPHEREx | … · **Synthetic demo images** |
| GIF export | – | captioned as synthetic |

## Not covered

- No screen recording (the browser pane was hidden during the test; evidence is request/response + page text).
- Mobile layout and the sky-map "Search here" path were not part of this run.
