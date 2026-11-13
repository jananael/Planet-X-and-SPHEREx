"""Warm the real-data cache for the demo, so images appear instantly in front of the judges.

    python scripts/prefetch_demo.py                  (from backend/, short-path venv)
    python scripts/prefetch_demo.py --sizes 240 300 --all-bands

For every live demo target (what /api/targets returns with DATA_SOURCE=real) it runs the search
(cached) and downloads the same frames the Explorer selects by default: the detector band seen in
the most visits, one exposure per visit (all exposures if there is only one visit). Cutouts are
cached under CACHE_DIR, exactly where the API looks for them.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.errors import ApiError  # noqa: E402
from app.services.real_source import RealSource  # noqa: E402

VISIT_GAP_DAYS = 30  # same rule as the frontend (lib/observations.ts)


def visits(observations):
    groups, last = [], None
    for o in sorted(observations, key=lambda o: o.mjd):
        if last is None or o.mjd - last > VISIT_GAP_DAYS:
            groups.append([])
        groups[-1].append(o); last = o.mjd
    return groups


def default_selection(observations, band=None):
    groups = visits(observations)
    if band is None:  # band present in the most visits; ties -> alphabetical (frontend rule)
        bands = sorted({o.band for o in observations})
        band = max(bands, key=lambda b: (sum(any(o.band == b for o in g) for g in groups), -bands.index(b)))
    per_visit = [next(o for o in g if o.band == band) for g in groups if any(o.band == band for o in g)]
    if len(per_visit) >= 2:
        return band, per_visit
    return band, sorted((o for o in observations if o.band == band), key=lambda o: o.mjd)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sizes", type=int, nargs="+", default=[240, 300], help="cutout sizes in arcsec")
    ap.add_argument("--all-bands", action="store_true", help="also prefetch one frame per visit for every band")
    a = ap.parse_args()
    s = get_settings()
    src = RealSource(s.mock_dir / "targets.v0.json", s.cache_dir)
    for t in src.list_targets():
        t0 = time.time()
        obs = src.search(t.ra, t.dec, 0)
        bands = sorted({o.band for o in obs}) if a.all_bands else [None]
        print(f"== {t.name} ({t.validation_status}) at {t.ra:.5f}, {t.dec:.5f}: {len(obs)} images, "
              f"{len(visits(obs))} visits ({time.time() - t0:.1f}s)", flush=True)
        for b in bands:
            band, frames = default_selection(obs, b)
            for size in a.sizes:
                for o in frames:
                    t1 = time.time()
                    try:
                        cut = src.get_cutout(o.id, t.ra, t.dec, size)
                        wl = cut.observation.wavelength_um
                        print(f"   {band} {size}\" {o.obs_time:%Y-%m-%d} {o.release} {o.id}: ok "
                              f"lambda={wl} ({time.time() - t1:.1f}s)", flush=True)
                    except ApiError as e:
                        print(f"   {band} {size}\" {o.obs_time:%Y-%m-%d} {o.id}: {e.code.value} {e.message}", flush=True)


if __name__ == "__main__":
    main()
