# API Contract — v0

Base URL (dev): `http://localhost:8000`  ·  All paths are prefixed with `/api`.
Content type: `application/json; charset=utf-8` (except the image endpoint, which redirects).
CORS: `http://localhost:3000` is allowed in dev.

The shapes below match `mock/targets.v0.json` and `mock/observations.v0.json` exactly, so the
frontend can be built against the mock files before the backend is running.

---

## Data types

### `Observation`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique, URL-safe (e.g. `wise-0855-0714-neowise-w2-2`) |
| `survey` | string | One of `allwise`, `neowise`, `spherex` (v0) |
| `mjd` | number | Modified Julian Date of the observation (UTC) |
| `band` | string | `W1`, `W2` for WISE; `SPHEREx-B1` … `SPHEREx-B6` for SPHEREx (v0, see open questions) |
| `image_url` | string | Absolute URL to a preview image (placeholder PNGs in v0) |

### `ObservationDetail` = `Observation` + `target_id: string`

### `Target`

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique, URL-safe (e.g. `wise-0855-0714`) |
| `name` | string | Display name |
| `ra` | number | Right ascension, degrees, ICRS/J2000, `0 ≤ ra < 360` |
| `dec` | number | Declination, degrees, `-90 ≤ dec ≤ 90` |
| `observations` | `Observation[]` | Sorted by `mjd` ascending |

### `SearchResult` = `Target` + `distance_deg: number` (angular separation from the query point)

### Error

Every non-2xx response uses this shape:

```json
{ "error": { "code": "TARGET_NOT_FOUND", "message": "No observation with id 'abc'" } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed request |
| 404 | `NOT_FOUND` | Unknown route |
| 404 | `OBSERVATION_NOT_FOUND` | Unknown observation id |
| 422 | `VALIDATION_ERROR` | Missing/invalid query or path params (message says which) |
| 501 | `NOT_IMPLEMENTED` | Data source doesn't support this yet (e.g. `DATA_SOURCE=real`) |
| 500 | `INTERNAL_ERROR` | Anything unexpected |

The frontend should switch on `error.code`, not on `message` (messages may change).

---

## Endpoints

### `GET /api/health`

Liveness + which data source is active.

```json
200 { "status": "ok", "data_source": "mock", "version": "0.1.0" }
```

### `GET /api/targets`

All targets with their observations.

```json
200 {
  "targets": [
    {
      "id": "wise-0855-0714",
      "name": "WISE J085510.83-071442.5",
      "ra": 133.79513,
      "dec": -7.24514,
      "observations": [
        { "id": "wise-0855-0714-allwise-w2-1", "survey": "allwise", "mjd": 55325.4, "band": "W2",
          "image_url": "https://placehold.co/512x512/png?text=..." }
      ]
    }
  ],
  "count": 5
}
```

### `GET /api/observations/{id}`

One observation by **observation id** (not target id).

```json
200 { "id": "wise-0855-0714-neowise-w2-2", "target_id": "wise-0855-0714", "survey": "neowise",
      "mjd": 58978.2, "band": "W2", "image_url": "https://placehold.co/..." }
404 { "error": { "code": "OBSERVATION_NOT_FOUND", "message": "No observation with id 'x'" } }
```

### `GET /api/search?ra=&dec=&radius=`

Cone search. Returns targets whose position is within `radius` of (`ra`, `dec`), nearest first.

| Param | Type | Required | Rules |
|---|---|---|---|
| `ra` | float (deg) | yes | `0 ≤ ra < 360` |
| `dec` | float (deg) | yes | `-90 ≤ dec ≤ 90` |
| `radius` | float (deg) | no, default `0.1` | `0 < radius ≤ 10` |

```json
200 {
  "query": { "ra": 133.8, "dec": -7.25, "radius": 0.1 },
  "results": [ { "...Target fields...": "", "distance_deg": 0.0067 } ],
  "count": 1
}
422 { "error": { "code": "VALIDATION_ERROR", "message": "query.ra: Input should be less than 360" } }
```

No matches is **not** an error: `200` with `"results": []`.

### `GET /api/observations/{id}/image`

Returns the image for an observation as a **`307` redirect** to its `image_url`, so it can
be used directly: `<img src="http://localhost:8000/api/observations/{id}/image">`.
Unknown id → `404 OBSERVATION_NOT_FOUND` (JSON).

> Later (RealSource) this may stream the bytes instead of redirecting (e.g. cutouts from
> FITS). The URL stays the same, so the frontend doesn't change.

---

## Versioning

- Mock files are versioned by filename (`*.v0.json`). A breaking shape change → `v1` files
  + update this doc in the same PR.
- Additive fields are non-breaking; the frontend must ignore unknown fields.
