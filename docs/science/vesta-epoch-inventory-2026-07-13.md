# Y1 — SPHEREx independent epoch inventory (Vesta demo pair)

**Scope:** Complete metadata-backed inventory for the Vesta observations matching the target footprint on 2026-07-13 (QR3). This is the selected end-to-end demo sequence, not a claim that this one-day extract is the full 160-exposure survey-wide inventory.

## Source and method

- Archive: IRSA SIA v2, collection `spherex_qr3`; source metadata from each returned science image row.
- Target: (4) Vesta; JPL Horizons observer ephemeris, geocentric center `500@399`, queried in 1-hour steps for 2026-07-13 UTC. At each SPHEREx row midpoint, its position was interpolated and checked against the row’s `s_region` polygon.
- Spatial query returned 78 candidate SIA rows for the day; 18 science rows passed the moving-target-in-footprint check, representing **9 unique `obs_id` exposures**.
- Grouping rule: a unique `obs_id` with its `t_min`/`t_max` is one exposure/epoch. D2 and D5 rows sharing that same ID and interval are products/bands of that same exposure, not independent epochs. Sequential IDs with distinct intervals are separate exposures.
- Dates are derived from the SIA `t_min`/`t_max` MJD values converted to UTC; timestamps in the inventory are exposure bounds.

## Selected independent epochs for the demo

| Role | SPHEREx `obs_id` | UTC start–end | Products | IRSA publisher IDs |
|---|---|---|---|---|
| Frame 1 | `2026W29_1A_0138_4` | 2026-07-13T15:57:52.977601+00:00 (midpoint; SIA bounds in CSV) | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0138_4/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0138_4/D5 |
| Frame 2 | `2026W29_1A_0163_1` | 2026-07-13T19:07:09.652800+00:00 (midpoint; SIA bounds in CSV) | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0163_1/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0163_1/D5 |

Horizons-predicted sky displacement between these selected exposure midpoints: **123.6 arcsec**. This is consistent with the project’s 124-arcsec reported motion to the precision expected from the chosen exposure pair and interpolation.

## Full day inventory

| `obs_id` | UTC midpoint | bands/products | publisher IDs |
|---|---|---|---|
| `2026W29_1A_0055_1` | 2026-07-13T06:05:03.436800+00:00 | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0055_1/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0055_1/D5 |
| `2026W29_1A_0055_2` | 2026-07-13T06:07:12.345600+00:00 | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0055_2/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0055_2/D5 |
| `2026W29_1A_0055_3` | 2026-07-13T06:09:21.254400+00:00 | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0055_3/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0055_3/D5 |
| `2026W29_1A_0055_4` | 2026-07-13T06:11:30.206400+00:00 | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0055_4/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0055_4/D5 |
| `2026W29_1A_0138_4` | 2026-07-13T15:57:52.977601+00:00 | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0138_4/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0138_4/D5 |
| `2026W29_1A_0163_1` | 2026-07-13T19:07:09.652800+00:00 | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0163_1/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0163_1/D5 |
| `2026W29_1A_0163_2` | 2026-07-13T19:09:18.561601+00:00 | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0163_2/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0163_2/D5 |
| `2026W29_1A_0163_3` | 2026-07-13T19:11:27.513600+00:00 | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0163_3/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0163_3/D5 |
| `2026W29_1A_0163_4` | 2026-07-13T19:13:36.422400+00:00 | SPHEREx-D2, SPHEREx-D5 | ivo://irsa.ipac/spherex_qr3?2026W29_1A_0163_4/D2, ivo://irsa.ipac/spherex_qr3?2026W29_1A_0163_4/D5 |

Each publisher ID links to a traceable archive product; the CSV includes collection, time bounds, processing version, IRSA release date, target field metadata, and FITS access URL for every matched science row.

## Known gaps / limits

- This scoped inventory covers Vesta on 2026-07-13 and the two selected demo epochs plus other exposures that day. The repository’s wider science summary reports 160 independent Vesta exposures across DR1+QR3 visits in 2025 and 2026; its generated JSON hit inventory is not committed, so row-level traceability for the other dates remains outside this selected-pair deliverable.
- IRSA metadata `target_name` describes the survey field, not Vesta as an intended target; actual inclusion was independently checked against the moving ephemeris and `s_region`.
- No files were grouped by FITS count or band. The two spectral products for each selected `obs_id` are same-time products.

## Reproducible source links

- [SPHEREx SIA v2 query documentation](https://irsa.ipac.caltech.edu/ibe/sia.html)
- [IRSA SPHEREx archive](https://irsa.ipac.caltech.edu/Missions/spherex.html)
- [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- [Project science findings](https://github.com/jananael/Planet-X-and-SPHEREx/blob/main/docs/science-findings.md)
