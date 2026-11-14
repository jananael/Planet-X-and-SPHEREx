"""Warm the real-data cache for the demo targets (searches, default cutouts, journeys).

Used by scripts/prefetch_demo.py and, when WARM_ON_START=1, by the API at startup in a background thread:
on a free host that sleeps and loses its disk (Render free), the demo images are ready again a few
minutes after the server wakes up, instead of making the first visitor wait 5-30 s per image.
Failures are logged and skipped, never raised: warming must not stop the API.
"""
from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable

from app.errors import ApiError

log = logging.getLogger("uvicorn.error")  # shows up in the host's log (Render, Railway)
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


def warm(src, sizes: list[int] | None = None, all_bands: bool = False, journeys: bool = True,
         say: Callable[[str], None] = log.info) -> None:
    """Prefetch what the Explorer loads by default for every live demo target."""
    for t in src.list_targets():
        try:
            t0 = time.time()
            obs = src.search(t.ra, t.dec, 0)
            if t.search_start or t.search_end:  # moving object: only its time window
                obs = [o for o in obs if (not t.search_start or o.obs_time >= t.search_start)
                       and (not t.search_end or o.obs_time <= t.search_end)]
            if not obs:
                say(f"== {t.name}: no images"); continue
            bands = sorted({o.band for o in obs}) if all_bands else [t.preferred_band if any(o.band == t.preferred_band for o in obs) else None]
            target_sizes = sizes or sorted({t.recommended_size_arcsec, 300})
            say(f"== {t.name}: {len(obs)} images, {len(visits(obs))} visits ({time.time() - t0:.1f}s)")
            for b in bands:
                band, frames = default_selection(obs, b)
                for size in target_sizes:
                    for o in frames:
                        t1 = time.time()
                        try:
                            src.get_cutout(o.id, t.ra, t.dec, size)
                            say(f"   {band} {size}\" {o.obs_time:%Y-%m-%d} {o.id}: ok ({time.time() - t1:.1f}s)")
                        except ApiError as e:
                            say(f"   {band} {size}\" {o.id}: {e.code.value} {e.message}")
        except Exception as e:  # one bad target must not stop the others
            say(f"== {t.name}: skipped ({type(e).__name__}: {e})")
    if journeys:
        from app.config import get_settings
        from app.services.journey import OBJECTS, journey
        for target_id in OBJECTS:
            try:
                journey(target_id, get_settings().cache_dir / "journey")
                say(f"== journey {target_id}: ok")
            except Exception as e:
                say(f"== journey {target_id}: skipped ({type(e).__name__})")


def warm_in_background(src) -> threading.Thread:
    thread = threading.Thread(target=lambda: warm(src), name="skytrace-warmup", daemon=True)
    thread.start()
    return thread
