"""S2-T2 Observation inventory: every SPHEREx image of each demo target, with independent epochs.

    python scripts/observation_inventory.py          (from backend/, short-path venv)

Sources:
- Moving targets (Vesta, 12P, 3I/ATLAS): scripts/out/<name>.json from check_moving_targets.py
  (Horizons position at each image's mid-time, tested against the real footprint polygon).
  Run that script first if the files are missing.
- Fixed targets (Mira, Barnard's Star, WISE 0855): IRSA SIA2 point search (DR1 + QR3) at the
  position the app uses (proper motion applied to 2026.0). Uses the backend's 24 h search cache
  when present, otherwise searches live.

Definitions (to confirm with the science team):
- image:     one detector (D1..D6) of one exposure. id = obs_id + band, e.g. 2025W29_1A_0273_2D4.
- exposure:  one obs_id. Its detectors are read simultaneously, so it is ONE epoch (a point usually
             falls on one detector pair: D1+D4, D2+D5 or D3+D6).
- visit:     exposures closer than 30 days in time (same rule as the Explorer's grouping).

Writes docs/inventory/<target>.csv (one row per image) and docs/observation-inventory.md (summary).
"""
from __future__ import annotations

import csv
import json
import sys
import time
from collections import Counter
from pathlib import Path

from astropy.time import Time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.services import irsa  # noqa: E402
from app.services.real_source import SEARCH_TTL_S, RealSource  # noqa: E402

TARGETS_FILE = ROOT / "app" / "mock_data" / "targets.v0.json"

DOCS = ROOT.parent / "docs"
OUT_CSV = DOCS / "inventory"
MOVING = [("vesta", "(4) Vesta", "Vesta"), ("12p-pons-brooks", "12P/Pons-Brooks", "12P_Pons-Brooks"),
          ("3i-atlas", "3I/ATLAS", "3I_ATLAS")]
FIXED = [("mira", "Mira (o Ceti)", 34.83663, -2.97764),
         ("barnards-star", "Barnard's Star", 269.446283, 4.767996),     # Gaia DR3 propagated to 2026.0
         ("wise-0855-0714", "WISE 0855-0714", 133.759974, -7.242126)]   # propagated to 2026.0
VISIT_GAP_DAYS = 30
COLLECTIONS = ("spherex_dr1", "spherex_qr3")


def utc(mjd: float) -> str:
    return Time(mjd, format="mjd").isot[:19] + "Z"


def cached_search(ra: float, dec: float) -> tuple[list[dict], str] | None:
    """The backend's own search cache entry for exactly this query, if still fresh.

    Same key as RealSource (collections + ra + dec + radius), so a cache written for another set of
    collections is never reused; RealSource only writes it when EVERY collection answered (complete
    results); and entries older than SEARCH_TTL_S (24 h) are ignored, like the API does.
    (Taqwa's review, 2026-11-13: the previous version matched coordinates only.)
    """
    src = RealSource(targets_file=TARGETS_FILE, cache_dir=ROOT / ".cache")
    path = src._search_cache_path(ra, dec, 0)
    if not path.exists():
        return None
    age = time.time() - path.stat().st_mtime
    if age >= SEARCH_TTL_S:
        return None
    recs = json.loads(path.read_text(encoding="utf-8"))["records"]
    if {r["collection"] for r in recs} - set(irsa.COLLECTIONS):
        return None
    return recs, f"backend search cache, {age / 3600:.1f} h old"


def fixed_rows(ra: float, dec: float) -> tuple[list[dict], str]:
    hit = cached_search(ra, dec)
    if hit is not None:
        recs, origin = hit
    else:
        print(f"   no fresh cache for {ra}, {dec}: searching IRSA live", flush=True)
        recs = []
        for coll in irsa.COLLECTIONS:  # raises UpstreamError if any collection fails: no partial inventory
            recs += [r.__dict__ for r in irsa.sia_search(ra, dec, 0, coll)]
        origin = f"live IRSA search, {Time.now().isot[:16]} UTC"
    rows = []
    for r in recs:
        rec = irsa.SiaRecord(**{k: r[k] for k in irsa.SiaRecord.__dataclass_fields__ if k in r})
        rec.t_min, rec.t_max = float(rec.t_min), float(rec.t_max)
        poly = irsa.parse_polygon(rec.s_region)
        if poly and not irsa.point_in_polygon(poly, ra, dec):
            continue
        rows.append({"image_id": rec.id, "obs_id": rec.id[:-2], "band": rec.band, "release": rec.release,
                     "processing_version": rec.processing_version or "", "mjd_mid": round(rec.mjd_mid, 5),
                     "utc_mid": utc(rec.mjd_mid), "ra": ra, "dec": dec, "vmag": ""})
    return rows, origin


def moving_rows(report_name: str) -> list[dict] | None:
    f = ROOT / "scripts" / "out" / f"{report_name}.json"
    if not f.exists():
        return None
    hits = json.loads(f.read_text(encoding="utf-8"))["hits"]
    return [{"image_id": h["id"], "obs_id": h["obs_id"], "band": h["band"],
             "release": h["collection"].removeprefix("spherex_").upper(), "processing_version": "",
             "mjd_mid": h["mjd"], "utc_mid": h["utc"], "ra": h["ra"], "dec": h["dec"], "vmag": h["vmag"]}
            for h in hits]


def summarise(rows: list[dict]) -> dict:
    rows.sort(key=lambda r: r["mjd_mid"])
    exposures: dict[str, float] = {}
    for r in rows:
        exposures.setdefault(r["obs_id"], r["mjd_mid"])
    visits: list[list] = []
    for obs_id, t in sorted(exposures.items(), key=lambda e: e[1]):
        if not visits or t - visits[-1][1] > VISIT_GAP_DAYS:
            visits.append([t, t, set(), Counter()])
        v = visits[-1]; v[1] = t; v[2].add(obs_id)
    visit_of = {obs_id: i for i, v in enumerate(visits) for obs_id in v[2]}
    for r in rows:
        r["visit"] = visit_of[r["obs_id"]] + 1
        visits[visit_of[r["obs_id"]]][3][r["band"]] += 1
    bands_all_visits = sorted(b for b in "D1 D2 D3 D4 D5 D6".split() if all(v[3][b] for v in visits)) if visits else []
    return {
        "images": len(rows), "exposures": len(exposures), "visits": len(visits),
        "by_release": dict(Counter(r["release"] for r in rows)),
        "pipelines": dict(Counter(r["processing_version"].split("-2")[0] for r in rows if r["processing_version"])),
        "first": rows[0]["utc_mid"][:10] if rows else None, "last": rows[-1]["utc_mid"][:10] if rows else None,
        "bands_in_every_visit": bands_all_visits,
        "visit_list": [{"from": utc(a)[:10], "to": utc(b)[:10], "exposures": len(ids), "images": sum(c.values()),
                        "bands": dict(sorted(c.items()))} for a, b, ids, c in visits],
    }


# External review against IRSA (science team). Keep in sync when a target is re-checked.
REVIEW = [
    "## Review status",
    "",
    "| Target | Reviewed by | Result |",
    "|---|---|---|",
    "| WISE 0855-0714 | Taqwa, 2026-11-13 | ✅ 258 DR1 images / 129 exposures; image ids identical to IRSA, none missing or extra |",
    "| Mira (o Ceti) | Taqwa, 2026-11-13 | ✅ DR1: IRSA returns 273 rows, 6 do not cover Mira (`s_region`), so 267 kept; "
    "QR3: all 124 identical. Total 391 images / 199 exposures |",
    "| (4) Vesta | Yazan, 2026-11-13 | ✅ demo day 2026-07-13 only (9 exposures): "
    "[science/vesta-epoch-inventory-2026-07-13.md](science/vesta-epoch-inventory-2026-07-13.md) |",
    "| 12P, 3I/ATLAS, Barnard's Star | — | ⏳ not reviewed yet: the six-target inventory is **not** approved as a whole |",
    "",
]


def main():
    OUT_CSV.mkdir(exist_ok=True)
    results = []
    for tid, name, report in MOVING:
        rows = moving_rows(report)
        if rows is None:
            print(f"!! {name}: run scripts/check_moving_targets.py first"); continue
        results.append((tid, name, "moving (Horizons + footprint)", rows))
    for tid, name, ra, dec in FIXED:
        rows, origin = fixed_rows(ra, dec)
        print(f"   {name}: {origin}", flush=True)
        results.append((tid, name, f"fixed (SIA2 point search; {origin.split(',')[0]})", rows))

    lines = ["# S2-T2: Observation inventory (SPHEREx DR1 + QR3)", "",
             f"Generated by `backend/scripts/observation_inventory.py` on {Time.now().isot[:10]}. "
             "Full per-image lists: [`docs/inventory/`](inventory/).", "",
             "**Definitions (to confirm with the science team):** *image* = one detector of one exposure; "
             "*exposure* = one `obs_id`: all its detectors are read at the same time, so it is **one epoch**. "
             "SPHEREx's two arrays see the same sky through a beam splitter (D1+D4, D2+D5, D3+D6), so a point "
             "usually lands on 2 images per exposure; "
             f"*visit* = exposures less than {VISIT_GAP_DAYS} days apart (SPHEREx returns to each point about every 6 months, "
             "and stays on it for days to weeks). For blinking: exposures hours apart (moving objects), "
             "visits months apart (proper motion, variability).", "",
             "| Target | Method | Images | Independent exposures | Visits | Dates | DR1 / QR3 | Bands in every visit |",
             "|---|---|---|---|---|---|---|---|"]
    detail = []
    for tid, name, method, rows in results:
        s = summarise(rows)
        with (OUT_CSV / f"{tid}.csv").open("w", newline="", encoding="utf-8") as f:
            cols = ["image_id", "obs_id", "band", "release", "processing_version", "utc_mid", "mjd_mid", "visit", "ra", "dec", "vmag"]
            w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore"); w.writeheader(); w.writerows(rows)
        rel = f"{s['by_release'].get('DR1', 0)} / {s['by_release'].get('QR3', 0)}"
        lines.append(f"| {name} | {method} | {s['images']} | {s['exposures']} | {s['visits']} | "
                     f"{s['first']} → {s['last']} | {rel} | {', '.join(s['bands_in_every_visit']) or '—'} |")
        detail += ["", f"## {name}", "", f"CSV: [`inventory/{tid}.csv`](inventory/{tid}.csv)"
                   + (f" · pipelines: {s['pipelines']}" if s["pipelines"] else ""), "",
                   "| Visit | Dates | Exposures | Images per band |", "|---|---|---|---|"]
        for i, v in enumerate(s["visit_list"], 1):
            detail.append(f"| {i} | {v['from']} → {v['to']} | {v['exposures']} | "
                          + ", ".join(f"{b}: {n}" for b, n in v["bands"].items()) + " |")
        print(f"{name}: {s['images']} images, {s['exposures']} exposures, {s['visits']} visits", flush=True)
    (DOCS / "observation-inventory.md").write_text("\n".join(lines + [""] + REVIEW + detail) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
