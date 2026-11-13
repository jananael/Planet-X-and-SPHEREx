"""Which SPHEREx images actually contain a moving object (asteroid / comet)?

    python scripts/check_moving_targets.py            (from backend/, short-path venv with astroquery)

For each object:
  1. JPL Horizons geocentric ephemeris, 1-day steps over the SPHEREx survey period
     (SPHEREx is in low Earth orbit: parallax vs geocentre is < 1" for these targets).
  2. IRSA SIA2 searches in 10-day windows (spherex_dr1 + spherex_qr3), circle around the
     object's path in that window, restricted to the window's time range.
  3. For every returned image: object position at the image's mid-exposure time
     (interpolated) and a point-in-polygon test against the image footprint (s_region).
Counts *independent exposures* (distinct obs_id), not detectors of the same exposure
(the science team's rule). Writes a JSON report next to the script output folder.
"""
from __future__ import annotations

import json
import math
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from astropy.time import Time
from astroquery.jplhorizons import Horizons
from pyvo.dal import SIA2Service

SIA = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = ("spherex_dr1", "spherex_qr3")
START, STOP = "2025-04-25", "2026-11-12"
WINDOW_DAYS = 10
OBJECTS = [  # name, Horizons kwargs, ephemeris kwargs
    ("Vesta", {"id": "4", "id_type": "smallbody"}, {}),
    ("12P/Pons-Brooks", {"id": "12P", "id_type": "designation"}, {"closest_apparition": True, "no_fragments": True}),
    ("3I/ATLAS", {"id": "3I", "id_type": "designation"}, {"closest_apparition": True, "no_fragments": True}),
]
OUT = Path(__file__).resolve().parent / "out"


def ephemeris(hkw, ekw):
    eph = Horizons(location="500", epochs={"start": START, "stop": STOP, "step": "1d"}, **hkw).ephemerides(**ekw)
    mjd = Time(np.asarray(eph["datetime_jd"], float), format="jd").mjd
    ra = np.unwrap(np.radians(np.asarray(eph["RA"], float)))
    dec = np.asarray(eph["DEC"], float)
    vmag = np.asarray(eph["V"] if "V" in eph.colnames else eph["Tmag"], float)
    return mjd, ra, dec, vmag


def position(mjd, ra_unwrapped, dec, t):
    return math.degrees(np.interp(t, mjd, ra_unwrapped)) % 360, float(np.interp(t, mjd, dec))


def ang(ra1, dec1, ra2, dec2):
    r1, d1, r2, d2 = map(math.radians, (ra1, dec1, ra2, dec2))
    h = math.sin((d2 - d1) / 2) ** 2 + math.cos(d1) * math.cos(d2) * math.sin((r2 - r1) / 2) ** 2
    return math.degrees(2 * math.asin(min(1, math.sqrt(h))))


def polygon(s_region: str):
    """'POLYGON ICRS ra1 dec1 ra2 dec2 ...' -> [(ra, dec), ...]"""
    nums = [float(v) for v in re.findall(r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", s_region)]
    return list(zip(nums[0::2], nums[1::2]))


def inside(poly, ra, dec) -> bool:
    """Point-in-polygon in the tangent plane at the polygon centre (footprints are ~3.5 deg)."""
    cra = math.degrees(math.atan2(sum(math.sin(math.radians(p[0])) for p in poly), sum(math.cos(math.radians(p[0])) for p in poly)))
    cdec = sum(p[1] for p in poly) / len(poly)

    def proj(a, d):
        a, d, a0, d0 = map(math.radians, (a, d, cra, cdec))
        c = math.sin(d0) * math.sin(d) + math.cos(d0) * math.cos(d) * math.cos(a - a0)
        return (math.cos(d) * math.sin(a - a0) / c, (math.cos(d0) * math.sin(d) - math.sin(d0) * math.cos(d) * math.cos(a - a0)) / c)

    pts = [proj(*p) for p in poly]
    x, y = proj(ra, dec)
    hit = False
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


_service = None


def service():
    """One SIA2 service object (its capabilities are fetched once), created with retries."""
    global _service
    for attempt in range(5):
        if _service is not None:
            return _service
        try:
            _service = SIA2Service(SIA)
        except Exception as e:
            print(f"   ! SIA2 service not reachable ({type(e).__name__}), retrying", flush=True)
            time.sleep(3 + 3 * attempt)
    raise RuntimeError("IRSA SIA2 service unreachable")


def search_window(args):
    coll, t0, t1, ra, dec, radius = args
    svc = service()
    err = None
    for attempt in range(4):
        try:
            tab = svc.search(pos=(ra, dec, radius), time=(Time(t0, format="mjd"), Time(t1, format="mjd")), collection=coll).to_table()
            return coll, tab
        except Exception as e:  # transient IRSA errors
            err = e; time.sleep(3 + 3 * attempt)
    print(f"   ! {coll} window {t0:.0f}-{t1:.0f} failed: {type(err).__name__}", flush=True)
    return coll, None


def check(name, hkw, ekw):
    t_start = time.time()
    mjd, ra_u, dec, vmag = ephemeris(hkw, ekw)
    jobs = []
    for t0 in np.arange(mjd[0], mjd[-1], WINDOW_DAYS):
        t1 = min(t0 + WINDOW_DAYS, mjd[-1])
        a0, d0 = position(mjd, ra_u, dec, t0)
        a1, d1 = position(mjd, ra_u, dec, t1)
        amid, dmid = position(mjd, ra_u, dec, (t0 + t1) / 2)
        radius = min(ang(a0, d0, a1, d1) / 2 + 2.6, 15)  # half the path + a detector's half-diagonal
        jobs += [(c, t0, t1, amid, dmid, radius) for c in COLLECTIONS]
    hits, seen = [], set()
    service()  # connect once before fanning out
    with ThreadPoolExecutor(max_workers=4) as pool:
        for coll, tab in pool.map(search_window, jobs):
            if tab is None:
                continue
            for row in tab:
                if str(row["dataproduct_subtype"]) != "science":
                    continue
                band = str(row["energy_bandpassname"]).removeprefix("SPHEREx-")
                key = (str(row["obs_id"]), band)
                if key in seen:
                    continue
                seen.add(key)
                t = (float(row["t_min"]) + float(row["t_max"])) / 2
                pra, pdec = position(mjd, ra_u, dec, t)
                if inside(polygon(str(row["s_region"])), pra, pdec):
                    hits.append({"obs_id": key[0], "band": band, "collection": coll, "mjd": round(t, 5),
                                 "utc": Time(t, format="mjd").isot[:19] + "Z", "ra": round(pra, 5), "dec": round(pdec, 5),
                                 "vmag": round(float(np.interp(t, mjd, vmag)), 2), "id": f"{key[0]}{band}"})
    hits.sort(key=lambda h: h["mjd"])
    exposures = sorted({(h["obs_id"], h["mjd"]) for h in hits}, key=lambda e: e[1])
    # closest pairs of *different* exposures, with the expected motion between them
    pairs = []
    for (o1, t1), (o2, t2) in zip(exposures, exposures[1:]):
        if o1 != o2:
            a1, d1 = position(mjd, ra_u, dec, t1); a2, d2 = position(mjd, ra_u, dec, t2)
            pairs.append({"from": o1, "to": o2, "hours_apart": round((t2 - t1) * 24, 2), "motion_arcsec": round(ang(a1, d1, a2, d2) * 3600, 1)})
    visits, last = [], None
    for _, t in exposures:
        if last is None or t - last > 30:
            visits.append([t, t, 0])
        visits[-1][1] = t; visits[-1][2] += 1; last = t
    report = {
        "object": name, "images": len(hits), "independent_exposures": len(exposures),
        "visits": [{"from": Time(a, format="mjd").isot[:10], "to": Time(b, format="mjd").isot[:10], "exposures": n} for a, b, n in visits],
        "vmag_range": [round(float(min(h["vmag"] for h in hits)), 1), round(float(max(h["vmag"] for h in hits)), 1)] if hits else None,
        "closest_pairs": sorted(pairs, key=lambda p: p["hours_apart"])[:8],
        "by_collection": {c: sum(h["collection"] == c for h in hits) for c in COLLECTIONS},
        "hits": hits, "seconds": round(time.time() - t_start, 1),
    }
    return report


def main():
    OUT.mkdir(exist_ok=True)
    names = sys.argv[1:] or [o[0] for o in OBJECTS]
    summary = []
    for name, hkw, ekw in OBJECTS:
        if name not in names:
            continue
        print(f"== {name}", flush=True)
        r = check(name, hkw, ekw)
        (OUT / f"{name.replace('/', '_')}.json").write_text(json.dumps(r, indent=2), encoding="utf-8")
        print(f"   images={r['images']} exposures={r['independent_exposures']} vmag={r['vmag_range']} "
              f"by_collection={r['by_collection']} ({r['seconds']}s)")
        for v in r["visits"]:
            print(f"   visit {v['from']} .. {v['to']}: {v['exposures']} exposures")
        for p in r["closest_pairs"][:4]:
            print(f"   pair {p['from']} -> {p['to']}: {p['hours_apart']} h apart, moves {p['motion_arcsec']}\"")
        summary.append({k: r[k] for k in ("object", "images", "independent_exposures", "visits", "vmag_range", "by_collection")})
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
