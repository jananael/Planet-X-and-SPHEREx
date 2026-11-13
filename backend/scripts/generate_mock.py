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
    ("3i-atlas", "3I/ATLAS (C/2025 N1)", "comet", 173.80864, 2.82116,
     "Third known interstellar object, passing through the Solar System in 2025-26. Mock track uses "
     "its real position and rate on 2025-12-08 (JPL Horizons); images are synthetic in mock mode.",
     ("rate", -1.0156, 0.3603),
     [("2025-12-08T00:07:26Z", "D1", 0.85, 0.7), ("2025-12-08T01:45:53Z", "D1", 0.86, 0.7),
      ("2025-12-08T03:23:21Z", "D1", 0.85, 0.7)]),
    ("wise-0855-0714", "WISE J085510.83-071442.5", "brown_dwarf", 133.79513, -7.24514,
     "Coldest known brown dwarf (~250 K). Proper motion ~8 arcsec/yr, i.e. about 1 SPHEREx "
     "pixel per year: barely visible between 6-month visits.",
     ("pm", -8.119, 0.680),  # published IR astrometry (science team, 2026-11-13)
     [("2025-05-21T08:00:00Z", "D5", 4.10, 0.5), ("2025-11-19T08:30:00Z", "D5", 4.12, 0.5),
      ("2026-05-18T07:45:00Z", "D5", 4.09, 0.5)]),
    ("barnards-star", "Barnard's Star (GJ 699)", "star", 269.4485025, 4.7394201,  # Gaia DR3, epoch 2016.0
     "Highest proper-motion star (~10.4 arcsec/yr). Still under 1 SPHEREx pixel per 6 months.",
     ("pm", -0.801551, 10.362394),  # Gaia DR3 pmra*cosdec, pmdec (arcsec/yr)
     [("2025-09-03T20:00:00Z", "D2", 1.30, 1.0), ("2026-03-04T19:40:00Z", "D2", 1.32, 1.0)]),
    ("mira", "Mira (o Ceti)", "variable", 34.83663, -2.97764,
     "Long-period variable (~332 d). Position fixed; the change over time is brightness.",
     ("pm", 0.0, 0.0),
     [("2025-07-30T03:00:00Z", "D2", 1.25, 1.0), ("2026-01-28T03:20:00Z", "D2", 1.27, 0.18)]),
]


# Epoch of the catalogue coordinates above. WISE designations give the position at the WISE
# epoch (~2010.5), not J2000. Approximate; to confirm with the science team.
CATALOG_EPOCH = {"wise-0855-0714": 2010.5, "barnards-star": 2016.0, "mira": 2000.0}
PM_SOURCE = {
    "barnards-star": "Gaia DR3 4472832130942575872 (queried via IRSA TAP); errors ~0.03 mas/yr",
    "wise-0855-0714": "published infrared astrometry (pmRA -8.119, pmDec +0.680 arcsec/yr); not in Gaia DR3. Parallax (~0.4 arcsec) not applied, below the 6.15 arcsec pixel",
}
# Starting cutout sizes per type (science team: asteroid 300-600", comet 600-1200", stars 180-300").
SIZE = {"asteroid": 450, "comet": 900, "brown_dwarf": 240, "star": 240, "variable": 240}
# Is each target actually supported by SPHEREx data? (science team's validation_status rule)
VALIDATION = {
    "vesta": ("verified", "Real SPHEREx images found with an ephemeris check (JPL Horizons vs footprints): "
                          "160 independent exposures; on 2026-07-13 it moves ~124\" (~20 px) in 3.2 h."),
    "12p-pons-brooks": ("challenging", "Ephemeris check: SPHEREx footprints cover it in 172 exposures, but it is "
                                        "V ~19.7-23.8 in 2025-26, probably too faint to see in single images."),
    "3i-atlas": ("pending", "Ephemeris check: in 184 SPHEREx exposures (DR1); brightest V ~15.3 on 2025-12-08, "
                            "moving ~265\" in 1.6 h. Still to confirm it is visible in the images."),
    "wise-0855-0714": ("challenging", "Real images exist; detection in a single frame is not guaranteed "
                                       "(very faint below ~3 um). Motion ~8\"/yr is about 1 pixel per year."),
    "barnards-star": ("verified", "Centred in 4 real SPHEREx visits after proper-motion propagation; "
                                  "difference images show its northward sub-pixel shift."),
    "mira": ("verified", "Seen in 3 real visits; the saturated core's glow grows and shrinks between them. "
                         "Gaia DR3 has no proper motion for it (too bright), so none is applied."),
}
# Real-data views for moving objects (from scripts/check_moving_targets.py + JPL Horizons).
REAL_VIEW = {
    "3i-atlas": {"ra": 173.77394, "dec": 2.83347,  # midpoint of its positions at 00:07 and 01:45 UTC
                 "start": "2025-12-08T00:05:00Z", "end": "2025-12-08T01:47:00Z", "band": "D1",
                 "source": "JPL Horizons ephemeris + SPHEREx DR1 footprint check (exposures "
                           "2025W50_1A_0002_1..4 and 2025W50_1A_0021_1)"},
    "vesta": {"ra": 22.555155, "dec": 1.367605,  # midpoint of its positions at 15:57 and 19:07 UTC
              "start": "2026-07-13T15:50:00Z", "end": "2026-07-13T19:08:00Z", "band": "D2",
              "source": "JPL Horizons ephemeris + SPHEREx QR3 footprint check (exposures "
                        "2026W29_1A_0138_4 and 2026W29_1A_0163_1)"},
}
# Detector band to open first for non-moving targets (moving ones take it from REAL_VIEW).
# WISE 0855 (~250 K Y dwarf) is brightest near 4.5-5 um and very faint below ~3 um -> D6 (4.42-5.00 um).
PREFERRED_BAND = {"wise-0855-0714": "D6"}
# SPHEREx spectral resolving power per detector (approx.): bandwidth ~ wavelength / R (mock only).
RESOLVING_POWER = {"D1": 41, "D2": 41, "D3": 41, "D4": 41, "D5": 135, "D6": 130}


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
        target = {"id": tid, "name": name, "type": ttype, "ra": ra, "dec": dec, "description": desc,
                  "position_epoch": CATALOG_EPOCH.get(tid), "catalog_motion": None,
                  "validation_status": VALIDATION[tid][0], "validation_note": VALIDATION[tid][1],
                  "recommended_size_arcsec": SIZE[ttype]}
        if motion[0] == "pm" and (motion[1] or motion[2]):
            target["catalog_motion"] = {"pm_ra_cosdec_mas_yr": motion[1] * 1000, "pm_dec_mas_yr": motion[2] * 1000,
                                        "reference_epoch": CATALOG_EPOCH[tid], "source_catalog": PM_SOURCE[tid]}
        if tid in PREFERRED_BAND:
            target["preferred_band"] = PREFERRED_BAND[tid]
        if tid in REAL_VIEW:
            target["real_view"] = REAL_VIEW[tid]
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
                "bandwidth_um": round(wl / RESOLVING_POWER[band], 4),
                "wavelength_source": "mock",
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
