"""Regenerate app/mock_data/*.v0.json.

    python scripts/generate_mock.py        (from backend/)

Everything here is MOCK. Fixed stars use catalogue J2000 positions and real proper motions;
asteroid/comet positions and rates are illustrative, NOT ephemerides. `mock_truth` is only
read by MockSource to draw synthetic cutouts and is never returned by the API.
"""
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app" / "mock_data"
MJD0 = datetime(1858, 11, 17, tzinfo=timezone.utc)
RELEASE = "QR2"
FOOTPRINT_RADIUS_DEG = 1.75  # ~ one 3.5 deg x 3.5 deg SPHEREx detector, as a circle

# SPHEREx detectors -> wavelength coverage (um). The wavelength varies across each image;
# `wavelength_um` is the value at the cutout centre.
BANDS = {"D1": (0.75, 1.09), "D2": (1.10, 1.62), "D3": (1.63, 2.41),
         "D4": (2.42, 3.82), "D5": (3.83, 4.41), "D6": (4.42, 5.00)}


def utc(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# id, name, type, ra, dec, description, motion model, observations[(obs_time, band, wavelength_um, flux)]
# motion: ("pm", mu_ra_cosdec_arcsec_per_yr, mu_dec_arcsec_per_yr) or ("rate", dra_deg_per_day, ddec_deg_per_day)
TARGETS = [
    ("vesta", "(4) Vesta", "asteroid", 210.40, -11.85,
     "Bright main-belt asteroid. Moves visibly between SPHEREx exposures taken hours apart. "
     "Mock positions are illustrative, not an ephemeris.",
     ("rate", 0.26, -0.07),
     [("2025-08-14T02:10:00Z", "D3", 2.04, 1.0), ("2025-08-14T03:45:00Z", "D3", 2.06, 1.0),
      ("2025-08-14T05:20:00Z", "D3", 2.03, 1.0)]),
    ("12p-pons-brooks", "12P/Pons-Brooks", "comet", 95.20, 22.40,
     "Periodic comet; diffuse coma, slower apparent motion than the asteroid. "
     "Mock positions are illustrative, not an ephemeris.",
     ("rate", 0.012, 0.004),
     [("2025-10-02T11:00:00Z", "D4", 3.10, 0.6), ("2025-10-03T11:30:00Z", "D4", 3.12, 0.6),
      ("2025-10-04T12:05:00Z", "D4", 3.08, 0.55)]),
    ("wise-0855-0714", "WISE J085510.83-071442.5", "brown_dwarf", 133.79513, -7.24514,
     "Coldest known brown dwarf (~250 K). Proper motion ~8 arcsec/yr, i.e. about 1 SPHEREx "
     "pixel per year: barely visible between 6-month visits.",
     ("pm", -8.1, 0.7),
     [("2025-05-21T08:00:00Z", "D5", 4.10, 0.5), ("2025-11-19T08:30:00Z", "D5", 4.12, 0.5),
      ("2026-05-18T07:45:00Z", "D5", 4.09, 0.5)]),
    ("barnards-star", "Barnard's Star (GJ 699)", "star", 269.45208, 4.69339,
     "Highest proper-motion star (~10.4 arcsec/yr). Still under 1 SPHEREx pixel per 6 months.",
     ("pm", -0.80, 10.33),
     [("2025-09-03T20:00:00Z", "D2", 1.30, 1.0), ("2026-03-04T19:40:00Z", "D2", 1.32, 1.0)]),
    ("mira", "Mira (o Ceti)", "variable", 34.83663, -2.97764,
     "Long-period variable (~332 d). Position fixed; the change over time is brightness.",
     ("pm", 0.0, 0.0),
     [("2025-07-30T03:00:00Z", "D2", 1.25, 1.0), ("2026-01-28T03:20:00Z", "D2", 1.27, 0.18)]),
]


# Epoch of the catalogue coordinates above. WISE designations give the position at the WISE
# epoch (~2010.5), not J2000. Approximate; to confirm with the science team.
CATALOG_EPOCH = {"wise-0855-0714": 2010.5, "barnards-star": 2000.0, "mira": 2000.0}


def position_at(ra0, dec0, motion, t0: datetime, t: datetime):
    days = (t - t0).total_seconds() / 86400
    kind, a, b = motion
    if kind == "pm":  # arcsec/yr, mu_ra already multiplied by cos(dec)
        yrs = days / 365.25
        return ra0 + a * yrs / 3600 / math.cos(math.radians(dec0)), dec0 + b * yrs / 3600
    return ra0 + a * days, dec0 + b * days


def main():
    targets, observations = [], []
    for tid, name, ttype, ra, dec, desc, motion, obs in TARGETS:
        target = {"id": tid, "name": name, "type": ttype, "ra": ra, "dec": dec, "description": desc}
        if motion[0] == "pm":
            target |= {"pm_ra": motion[1], "pm_dec": motion[2], "epoch": CATALOG_EPOCH[tid]}
        targets.append(target)
        t0 = utc(obs[0][0])
        for n, (when, band, wl, flux) in enumerate(obs, 1):
            assert BANDS[band][0] <= wl <= BANDS[band][1], (tid, band, wl)
            t = utc(when)
            pra, pdec = position_at(ra, dec, motion, t0, t)
            oid = f"{tid}-{t:%Y%m%d}-{band.lower()}-{n}"
            observations.append({
                "id": oid,
                "target_id": tid,
                "obs_time": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "mjd": round((t - MJD0).total_seconds() / 86400, 5),
                "wavelength_um": wl,
                "band": band,
                "release": RELEASE,
                "source_file": f"MOCK_spherex_{RELEASE.lower()}_{oid}.fits",
                "image_url": f"/api/observations/{oid}/image",
                # footprint centre offset from the target so it isn't trivially centred
                "footprint": {"ra": round(ra + 0.45, 5), "dec": round(dec - 0.30, 5),
                              "radius_deg": FOOTPRINT_RADIUS_DEG},
                "mock_truth": {"ra": round(pra, 7), "dec": round(pdec, 7), "flux": flux,
                               "fwhm_px": 3.0 if ttype == "comet" else 1.4},
            })
    meta = {"version": "v0", "note": "MOCK data for development. Not real SPHEREx measurements."}
    OUT.mkdir(parents=True, exist_ok=True)
    for fname, key, rows in (("targets.v0.json", "targets", targets),
                             ("observations.v0.json", "observations", observations)):
        (OUT / fname).write_text(json.dumps({**meta, key: rows}, indent=2, ensure_ascii=False) + "\n",
                                 encoding="utf-8", newline="\n")
    print(f"{len(targets)} targets, {len(observations)} observations -> {OUT}")


if __name__ == "__main__":
    main()
