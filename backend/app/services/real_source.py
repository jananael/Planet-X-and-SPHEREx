"""RealSource: live SPHEREx data from IRSA (SIA2 search + cutouts).

Ids come from /api/search. Each search remembers its records (memory + disk), so
/observations/{id} and /image work for any id a search has returned, also after a restart.
Cutout FITS files are cached on disk (IRSA cutouts take 8-30 s).
"""
from __future__ import annotations

import json
import math
from dataclasses import asdict
from pathlib import Path

import numpy as np

from app.errors import NoCoverage, NotFound, UpstreamError
from app.schemas import Footprint, Observation, Target
from app.services import irsa
from app.services.data_source import Cutout, DataSource, angular_separation_deg


REAL_EPOCH = 2026.0  # middle of the SPHEREx QR2 + QR3 coverage (mid-2025 to late 2026)
SOLAR_SYSTEM = {"asteroid", "comet"}


def propagate(target: Target, epoch: float) -> Target:
    """Move a target's position by its proper motion from target.epoch to `epoch`."""
    if target.pm_ra is None or target.pm_dec is None or target.epoch is None:
        return target
    years = epoch - target.epoch
    dec = target.dec + target.pm_dec * years / 3600
    ra = (target.ra + target.pm_ra * years / 3600 / math.cos(math.radians(target.dec))) % 360
    return target.model_copy(update={"ra": round(ra, 6), "dec": round(dec, 6), "epoch": epoch})


class RealSource(DataSource):
    name = "real"

    def __init__(self, targets_file: Path, cache_dir: Path, collections: tuple[str, ...] = irsa.COLLECTIONS):
        # The demo target list is curated by the team, same file in mock and real mode.
        raw = json.loads(targets_file.read_text(encoding="utf-8"))["targets"]
        self._targets = [Target.model_validate(t) for t in raw]
        self._collections = collections
        self._obs_dir = cache_dir / "obs"
        self._cutout_dir = cache_dir / "cutouts"
        self._obs_dir.mkdir(parents=True, exist_ok=True)
        self._cutout_dir.mkdir(parents=True, exist_ok=True)
        self._records: dict[str, tuple[irsa.SiaRecord, float, float]] = {}

    # ---------- records ----------

    def _remember(self, rec: irsa.SiaRecord, query_ra: float, query_dec: float) -> None:
        self._records[rec.id] = (rec, query_ra, query_dec)
        path = self._obs_dir / f"{rec.id}.json"
        if not path.exists():
            path.write_text(json.dumps({"record": asdict(rec), "query": [query_ra, query_dec]}), encoding="utf-8")

    def _lookup(self, observation_id: str) -> tuple[irsa.SiaRecord, float, float]:
        if observation_id in self._records:
            return self._records[observation_id]
        path = self._obs_dir / f"{observation_id}.json"
        if path.parent != self._obs_dir or not path.exists():  # also blocks path tricks in the id
            raise NotFound(f"Unknown observation id '{observation_id}'. Ids come from /api/search.")
        saved = json.loads(path.read_text(encoding="utf-8"))
        entry = (irsa.SiaRecord(**saved["record"]), *saved["query"])
        self._records[observation_id] = entry
        return entry

    @staticmethod
    def _to_observation(rec: irsa.SiaRecord, wavelength_um: float | None = None) -> Observation:
        return Observation(
            id=rec.id,
            target_id=None,
            obs_time=rec.obs_time,
            mjd=round(rec.mjd_mid, 6),
            wavelength_um=round(wavelength_um, 4) if wavelength_um is not None else None,
            wavelength_range_um=(round(rec.em_min_um, 4), round(rec.em_max_um, 4)),
            band=rec.band,
            release=rec.release,
            source_file=rec.source_file,
            image_url=f"/api/observations/{rec.id}/image",
            footprint=Footprint(ra=rec.s_ra, dec=rec.s_dec, radius_deg=round(rec.s_fov / math.sqrt(2), 4)),
        )

    # ---------- DataSource ----------

    def list_targets(self) -> list[Target]:
        """Demo targets usable with live data.

        - Asteroids/comets are left out: their mock positions are illustrative, not ephemerides,
          so a live search there would show an unrelated patch of sky.
        - Stars/brown dwarfs are moved by proper motion to REAL_EPOCH. Catalogue (J2000 / WISE-epoch)
          positions are off by minutes of arc for fast movers (Barnard's Star: ~4.5' by 2026).
        """
        return [propagate(t, REAL_EPOCH) for t in self._targets if t.type not in SOLAR_SYSTEM]

    def get_observation(self, observation_id: str) -> Observation:
        return self._to_observation(self._lookup(observation_id)[0])

    def search(self, ra: float, dec: float, radius: float) -> list[Observation]:
        records, failures = [], []
        for coll in self._collections:
            try:
                records += irsa.sia_search(ra, dec, radius, coll)
            except UpstreamError as e:
                failures.append(e)
        if failures and not records:
            raise failures[0]
        for rec in records:
            self._remember(rec, ra, dec)
        return sorted((self._to_observation(r) for r in records), key=lambda o: o.obs_time)

    def get_cutout(self, observation_id: str, ra: float | None, dec: float | None, size_arcsec: float) -> Cutout:
        rec, query_ra, query_dec = self._lookup(observation_id)
        if ra is None or dec is None:
            ra, dec = query_ra, query_dec  # default: the point the user searched for
        if angular_separation_deg(ra, dec, rec.s_ra, rec.s_dec) > rec.s_fov / math.sqrt(2):
            raise NoCoverage(f"Observation '{observation_id}' does not cover ra={ra}, dec={dec}")

        request_size = size_arcsec * irsa.ROTATION_MARGIN
        cache = self._cutout_dir / f"{rec.id}_{ra:.5f}_{dec:.5f}_{request_size:.0f}.fits"
        if cache.exists():
            raw = cache.read_bytes()
        else:
            raw = irsa.fetch_cutout(rec.access_url, ra, dec, request_size)
            cache.write_bytes(raw)

        with irsa.open_fits(raw) as hdul:
            img = hdul["IMAGE"].data.astype(float)
            if "ZODI" in hdul:
                img = img - hdul["ZODI"].data.astype(float)  # zodiacal light dominates the IR background
            wl = irsa.wavelength_at(hdul, ra, dec)
            data, inside = irsa.reproject_north_up(hdul, img, ra, dec, size_arcsec)

        c = data.shape[0] // 2
        if not inside[c, c]:
            raise NoCoverage(f"Observation '{observation_id}' does not cover ra={ra}, dec={dec}")
        # NaN inside the image = masked pixels, typically saturated cores of bright stars.
        # Show them as the brightest value (white) rather than black holes.
        masked = np.isnan(data) & inside
        if masked.any() and np.isfinite(data).any():
            data[masked] = np.nanmax(data)
        obs = self._to_observation(rec, wl[0] if wl else None)
        return Cutout(data=data, ra=ra, dec=dec, pixel_scale_arcsec=irsa.PIXEL_ARCSEC, observation=obs)
