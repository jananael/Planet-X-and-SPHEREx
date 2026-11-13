"""Predicted positions of known objects for the detection engine (contract: the BACKEND prepares them).

The engine never calls Horizons, Gaia or IRSA itself (Yazan, 2026-11-13): this module turns the demo
targets into `KnownObject` predictions at each frame's mid-exposure time.

- Stars / brown dwarfs: catalogue position moved by proper motion to the frame epoch
  (source GAIA_DR3 when the motion comes from Gaia, LITERATURE otherwise).
- Asteroids / comets: JPL Horizons geocentric ephemeris at the frame time, only for targets with a
  verified `real_view` near the query and in its time window (no Horizons call for anything else).
  Results are cached on disk. SPHEREx is in low Earth orbit, so geocentric positions can be off by a
  few arcsec for close objects (~5" seen for 3I/ATLAS): stated as the uncertainty.

A match with a known object is a review hint, never validation of a detection.
"""
from __future__ import annotations

import json
import logging
import math
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.schemas import Target
from app.services.data_source import angular_separation_deg
from app.services.engine import EngineFrame, KnownObject

log = logging.getLogger(__name__)

SOLAR_SYSTEM = {"asteroid", "comet"}
# Horizons ids for the moving demo targets (same as scripts/check_moving_targets.py).
HORIZONS = {
    "vesta": ({"id": "4", "id_type": "smallbody"}, {}),
    "3i-atlas": ({"id": "3I", "id_type": "designation"}, {"closest_apparition": True, "no_fragments": True}),
}
# Geocentric ephemeris vs a low-Earth-orbit observer (measured ~5" offset on 3I/ATLAS, 2025-12-08).
HORIZONS_UNCERTAINTY_ARCSEC = 6.0
# How far outside the analysed area a prediction may still be useful (an object near the edge).
MARGIN_DEG = 0.05
REAL_VIEW_SLACK = timedelta(days=1)


def decimal_year(t: datetime) -> float:
    start = datetime(t.year, 1, 1, tzinfo=timezone.utc)
    end = datetime(t.year + 1, 1, 1, tzinfo=timezone.utc)
    return t.year + (t - start).total_seconds() / (end - start).total_seconds()


def _propagated(target: Target, epoch: float) -> tuple[float, float]:
    pm, start = target.catalog_motion, target.position_epoch
    if pm is None or start is None:
        return target.ra, target.dec
    years = epoch - start
    dec = target.dec + pm.pm_dec_mas_yr / 1000 * years / 3600
    ra = (target.ra + pm.pm_ra_cosdec_mas_yr / 1000 * years / 3600 / math.cos(math.radians(target.dec))) % 360
    return ra, dec


def _horizons(target_id: str, t: datetime, cache_dir: Path) -> tuple[float, float] | None:
    """Geocentric RA/Dec from JPL Horizons at t, cached on disk. None if Horizons is unreachable."""
    cache = cache_dir / f"{target_id}_{t.strftime('%Y%m%dT%H%M%S')}.json"
    if cache.exists():
        ra, dec = json.loads(cache.read_text(encoding="utf-8"))
        return ra, dec
    try:
        from astropy.time import Time
        from astroquery.jplhorizons import Horizons

        hkw, ekw = HORIZONS[target_id]
        eph = Horizons(location="500", epochs=[Time(t).jd], **hkw).ephemerides(**ekw)
        ra, dec = float(eph["RA"][0]), float(eph["DEC"][0])
    except Exception as exc:  # network / service errors: skip this prediction, never invent one
        log.warning("Horizons unavailable for %s at %s: %s", target_id, t.isoformat(), exc)
        return None
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps([ra, dec]), encoding="utf-8")
    return ra, dec


def known_objects_for(targets: Iterable[Target], frames: list[EngineFrame], ra: float, dec: float,
                      radius_deg: float, cache_dir: Path) -> tuple[list[KnownObject], list[str]]:
    """Predictions for every frame, plus notes about predictions that could not be made."""
    reach = radius_deg + MARGIN_DEG
    out: list[KnownObject] = []
    notes: list[str] = []
    for target in targets:
        if target.type in SOLAR_SYSTEM:
            view = target.real_view
            if view is None or target.id not in HORIZONS:
                continue
            if angular_separation_deg(ra, dec, view.ra, view.dec) > reach + 1.0:
                continue  # nowhere near: do not call Horizons
            for frame in frames:
                if not (view.start - REAL_VIEW_SLACK <= frame.obs_time <= view.end + REAL_VIEW_SLACK):
                    continue
                pos = _horizons(target.id, frame.obs_time, cache_dir)
                if pos is None:
                    notes.append(f"{target.name}: JPL Horizons unavailable for {frame.observation_id}")
                    continue
                if angular_separation_deg(ra, dec, *pos) <= reach:
                    out.append(KnownObject(object_id=target.id, name=target.name, ra_deg=pos[0], dec_deg=pos[1],
                                           epoch_utc=frame.obs_time, source="JPL_HORIZONS",
                                           uncertainty_arcsec=HORIZONS_UNCERTAINTY_ARCSEC))
        else:
            source = ("GAIA_DR3" if target.catalog_motion and "gaia" in target.catalog_motion.source_catalog.lower()
                      else "LITERATURE")
            for frame in frames:
                pos = _propagated(target, decimal_year(frame.obs_time))
                if angular_separation_deg(ra, dec, *pos) <= reach:
                    out.append(KnownObject(object_id=target.id, name=target.name, ra_deg=pos[0], dec_deg=pos[1],
                                           epoch_utc=frame.obs_time, source=source))
    return out, notes
