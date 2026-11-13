# API Contract — v0 (draft, to review with Yazan)

Base URL (dev): `http://localhost:8000`. All paths start with `/api`.
JSON everywhere except the image endpoint (`image/png`). CORS: `http://localhost:3000`.

Mock data: [`backend/app/mock_data/`](../backend/app/mock_data/). The JSON shapes below match it exactly
(minus the internal `mock_truth` field, which the API never returns).

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | service status + active data source |
| GET | `/api/targets` | demo targets |
| GET | `/api/search?ra=&dec=&radius=` | SPHEREx observations covering the point, oldest first |
| GET | `/api/observations/{id}` | one observation's metadata |
| GET | `/api/observations/{id}/image?ra=&dec=&size=&stretch=&vmin=&vmax=` | PNG cutout |
| GET | `/api/hips/allwise/{file}` | Sky-map tiles for the Explorer's map picker (AllWISE colour from IRSA, relayed because IRSA sends no CORS headers; only HiPS file names accepted, cached on disk) |

---

## Types

### `Target`

```json
{
  "id": "vesta",
  "name": "(4) Vesta",
  "type": "asteroid",
  "ra": 210.4,
  "dec": -11.85,
  "description": "Bright main-belt asteroid. Moves visibly between SPHEREx exposures taken hours apart. ..."
}
```

| Field | Type | Notes |
|---|---|---|
| `type` | `asteroid` \| `comet` \| `brown_dwarf` \| `star` \| `variable` | |
| `ra`, `dec` | number, deg (ICRS) | Moving objects: position at the **first** observation |
| `position_epoch` | number \| null | Decimal year of `ra`/`dec` (e.g. `2000.0`; `2026.0` in real mode after propagation) |
| `catalog_motion` | object \| null | **Catalogue** proper motion, kept apart from motion measured in SPHEREx: `pm_ra_cosdec_mas_yr`, `pm_dec_mas_yr`, `reference_epoch`, `source_catalog`. `null` for asteroids/comets |
| `validation_status` | `verified` \| `pending` \| `challenging` \| `not_supported` | Is the target actually supported by SPHEREx data? (+ `validation_note`) |
| `recommended_size_arcsec` | number | Starting cutout size for the UI: asteroid 450, comet 900, stars 240 (user can change it) |

### `Observation`

```json
{
  "id": "vesta-20250814-d3-1",
  "target_id": "vesta",
  "obs_time": "2025-08-14T02:10:00Z",
  "mjd": 60901.09028,
  "wavelength_um": 2.04,
  "band": "D3",
  "release": "QR2",
  "source_file": "MOCK_spherex_qr2_vesta-20250814-d3-1.fits",
  "image_url": "/api/observations/vesta-20250814-d3-1/image",
  "footprint": { "ra": 210.85, "dec": -12.15, "radius_deg": 1.75 }
}
```

| Field | Type | Notes |
|---|---|---|
| `target_id` | string \| null | null = image not tied to a demo target |
| `obs_time` | ISO-8601 UTC | |
| `mjd` | number | Same instant as `obs_time` |
| `wavelength_um` | number \| null | At the **cutout centre**: SPHEREx wavelength varies across the image. **Real data: `null` in search results** (it needs the image header). The exact value comes with the image in `X-Wavelength-Um` |
| `wavelength_range_um` | [min, max] \| null | Whole-detector range. Fine for "roughly which colour", **not** the value at the target |
| `bandwidth_um` | number \| null | Spectral bandwidth at the target pixel (real: from the image header, like `wavelength_um`) |
| `wavelength_source` | string \| null | `WCS-WAVE` (image lookup table), `mock`; `CWAVE` planned (calibration product) |
| `wavelength_pixel` | {x, y, frame} \| null | Pixel where the wavelength was read (`frame: "cutout"`, 0-based) |
| `band` | `D1`…`D6` | SPHEREx detector (D1 0.75–1.09 µm … D6 4.42–5.00 µm) |
| `release` | string | Release of **this** observation: `DR1` (Surveys 1-2) or `QR3` (Surveys 3-4). Calibrations differ between releases |
| `processing_version` | string \| null | Pipeline tag, e.g. `l2b-v27-2026-228` |
| `archive_id` | string \| null | The archive's own id (`obs_publisher_did`) |
| `source_file` | string | Archive file name. **Show it in the UI** (provenance) |
| `image_url` | string | Relative. Prefix with the API base URL |
| `footprint` | object \| null | Approximate coverage circle (v0 simplification, extra field beyond the brief) |

### Error (every non-2xx JSON response)

```json
{ "error": { "code": "NOT_FOUND", "message": "No observation with id 'x'" } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Missing / invalid params (message names the param) |
| 404 | `NOT_FOUND` | Unknown observation id or route |
| 404 | `NO_COVERAGE` | Image requested at a ra/dec the observation doesn't cover |
| 502 | `UPSTREAM_ERROR` | IRSA / archive failed (RealSource only) |
| 501 | `NOT_IMPLEMENTED` | Feature not available in the active data source |
| 500 | `INTERNAL_ERROR` | Unexpected |

Switch on `error.code`, never on `message`.

---

## Endpoints

### `GET /api/health`
```json
200 { "status": "ok", "data_source": "mock", "version": "0.1.0" }
```

### `GET /api/targets`
```json
200 { "targets": [Target, ...], "count": 5 }
```

### `GET /api/search`

| Param | Required | Rules |
|---|---|---|
| `ra` | yes | deg, `0 ≤ ra < 360` |
| `dec` | yes | deg, `-90 ≤ dec ≤ 90` |
| `radius` | no (default `0`) | deg, `0 ≤ radius ≤ 5`. `0` = image must cover the exact point |

```json
200 { "query": { "ra": 133.79513, "dec": -7.24514, "radius": 0 },
      "observations": [Observation, ...], "count": 3 }
```
Sorted by `obs_time` ascending. **No coverage is not an error:** `200` with `"observations": []`
(the UI should say "no SPHEREx coverage here yet").

### `GET /api/observations/{id}`
```json
200 Observation
404 { "error": { "code": "NOT_FOUND", ... } }
```

### `GET /api/observations/{id}/image`

| Param | Default | Rules |
|---|---|---|
| `ra`, `dec` | target's `ra`/`dec` (or footprint centre) | deg. Pass both or neither |
| `size` | `300` | arcsec, `30–1800` (SPHEREx pixel ≈ 6.15″, so 300″ ≈ 49 px) |
| `stretch` | `asinh` | `linear` \| `asinh` \| `zscale` |
| `vmin`, `vmax` | auto | Fixed stretch limits. Pass both or neither, `vmax > vmin` |

Returns `image/png`, north up / east left, upscaled (nearest-neighbour) to ≥ 256 px so the real
pixels stay visible. Response headers (exposed to the browser via CORS):

| Header | Example |
|---|---|
| `X-Source-File` | `MOCK_spherex_qr2_vesta-20250814-d3-1.fits` |
| `X-Obs-Time` | `2025-08-14T02:10:00Z` |
| `X-Wavelength-Um` / `X-Band` / `X-Release` | `2.04` / `D3` / `QR2` |
| `X-Cutout-Ra` / `X-Cutout-Dec` | centre actually used |
| `X-Stretch-Vmin` / `X-Stretch-Vmax` | limits actually used |
| `X-Bandwidth-Um` / `X-Wavelength-Source` / `X-Processing-Version` | bandwidth at the target, where it came from, pipeline version |

Errors: `400 BAD_REQUEST`, `404 NOT_FOUND`, `404 NO_COVERAGE`, `502 UPSTREAM_ERROR`.

#### Blink recipe (frontend)
1. `GET /api/search?ra=&dec=` → list of observations.
2. Load the first image with the **same** `ra`, `dec`, `size`, `stretch` you'll use for all of them.
3. Read `X-Stretch-Vmin`/`X-Stretch-Vmax` from that response.
4. Load the other epochs with those `vmin`/`vmax`. Otherwise each image is normalised on its own
   and brightness changes (variable stars) disappear.
5. Show `source_file`, `obs_time` and `X-Wavelength-Um` under every frame.

---

## Real data mode (`DATA_SOURCE=real`)

Same endpoints and shapes. What differs:

| | Mock | Real |
|---|---|---|
| `/search` | Mock observations | Live IRSA SIA2, **DR1 + QR3 merged** (QR2 was replaced by DR1 in Nov 2026), ~5–15 s |
| Observation `id` | `vesta-20250814-d3-1` | `obs_id` + detector, e.g. `2026W11_2A_0501_1D2` |
| Valid ids | Fixed list | **Only ids returned by a `/search`** (remembered on disk, so they survive a restart) |
| `target_id` | Set | `null` |
| `/targets` | All 5 demo targets | **Stars only** (asteroid/comet positions are illustrative), with `ra`/`dec` **moved by proper motion to 2026.0** (`epoch: 2026.0`) |
| `wavelength_um` | Set | `null` in search, exact value in `X-Wavelength-Um` on `/image` |
| `/image` default centre | Target position | **The point you searched** |
| `/image` latency | Instant | **5–30 s the first time**, ~0.1 s after (disk cache). Show a loading state |
| `/image` pixels | Synthetic | Real, ZODI subtracted, **reprojected north-up** so every visit lines up |
| Saturated stars | — | Core pixels masked by SPHEREx, shown white |
| `NO_COVERAGE` | — | The point is outside that image |
| `UPSTREAM_ERROR` (502) | — | IRSA down or timed out after retries |

**High proper-motion targets:** search at the position **for the observation epoch**, not J2000.
Barnard's Star has moved ~4.5′ since 2000, so a J2000 search finds images whose cutout misses it.
`/api/targets` already does this in real mode, so clicking a target card searches the right place.

**Temporary archive failures:** the backend retries IRSA (3 tries, ~170 s worst case, logged as
`IRSA cutout attempt n/3 failed`). The frontend waits up to 180 s per image and retries an
`UPSTREAM_ERROR` once by itself before showing it.

---

## Mock targets (v0)

| id | type | What the blink shows |
|---|---|---|
| `vesta` | asteroid | Clear motion across 3 exposures ~95 min apart |
| `12p-pons-brooks` | comet | Fuzzy, slow motion over 3 days |
| `wise-0855-0714` | brown_dwarf | ~8″/yr: **under 1 pixel** per 6 months, which honestly shows the resolution limit |
| `barnards-star` | star | ~10″/yr: still under 1 pixel per 6 months |
| `mira` | variable | Same position, brightness drops |

Asteroid and comet positions are illustrative, not ephemerides. Images are synthetic
(`app/services/mock_sky.py`). Regenerate the JSON with `python scripts/generate_mock.py`.

## Versioning
Breaking shape change → `*.v1.json` + update this doc in the same PR. New optional fields are
non-breaking; clients ignore unknown fields.

**Comparing wavelengths (science team rule):** frames are comparable when their spectral bands
overlap (`wavelength ± bandwidth/2` for every frame share a common range), not by a fixed ±0.05 µm.
