"""Data access layer. Routers only talk to `DataSource`; switch Mock <-> Real with DATA_SOURCE."""
from __future__ import annotations

import json
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.config import get_settings
from app.errors import NoCoverage, NotFound, NotImplementedYet
from app.schemas import Observation, Target
from app.services import mock_sky

MOCK_VERSION = "v0"
SPHEREX_PIXEL_ARCSEC = 6.15


def angular_separation_deg(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    """Great-circle distance in degrees (haversine; stable for small angles)."""
    ra1, dec1, ra2, dec2 = map(math.radians, (ra1, dec1, ra2, dec2))
    h = math.sin((dec2 - dec1) / 2) ** 2 + math.cos(dec1) * math.cos(dec2) * math.sin((ra2 - ra1) / 2) ** 2
    return math.degrees(2 * math.asin(min(1.0, math.sqrt(h))))


@dataclass
class Cutout:
    """Raw pixels around (ra, dec); image_service turns this into a PNG."""

    data: np.ndarray
    ra: float
    dec: float
    pixel_scale_arcsec: float
    observation: Observation


class DataSource(ABC):
    name: str

    @abstractmethod
    def list_targets(self) -> list[Target]: ...

    @abstractmethod
    def get_observation(self, observation_id: str) -> Observation: ...

    @abstractmethod
    def search(self, ra: float, dec: float, radius: float) -> list[Observation]:
        """Observations whose footprint covers (ra, dec) within `radius` deg, oldest first."""

    @abstractmethod
    def get_cutout(self, observation_id: str, ra: float | None, dec: float | None, size_arcsec: float) -> Cutout:
        """Pixels of one observation around (ra, dec). Defaults to the target's reference position."""


class MockSource(DataSource):
    """Reads app/mock_data/*.v0.json and renders synthetic cutouts (see mock_sky)."""

    name = "mock"

    def __init__(self, mock_dir: Path, version: str = MOCK_VERSION):
        targets_raw = self._load(mock_dir / f"targets.{version}.json")["targets"]
        obs_raw = self._load(mock_dir / f"observations.{version}.json")["observations"]
        self._targets = {t["id"]: Target.model_validate(t) for t in targets_raw}
        self._observations = {o["id"]: Observation.model_validate(o) for o in obs_raw}
        self._truth = {o["id"]: o.get("mock_truth") for o in obs_raw}

    @staticmethod
    def _load(path: Path) -> dict:
        with path.open(encoding="utf-8") as f:
            return json.load(f)

    def list_targets(self) -> list[Target]:
        return list(self._targets.values())

    def get_observation(self, observation_id: str) -> Observation:
        obs = self._observations.get(observation_id)
        if obs is None:
            raise NotFound(f"No observation with id '{observation_id}'")
        return obs

    def search(self, ra: float, dec: float, radius: float) -> list[Observation]:
        hits = [
            o for o in self._observations.values()
            if o.footprint
            and angular_separation_deg(ra, dec, o.footprint.ra, o.footprint.dec) <= o.footprint.radius_deg + radius
        ]
        return sorted(hits, key=lambda o: o.obs_time)

    def get_cutout(self, observation_id: str, ra: float | None, dec: float | None, size_arcsec: float) -> Cutout:
        obs = self.get_observation(observation_id)
        target = self._targets.get(obs.target_id) if obs.target_id else None
        if ra is None or dec is None:
            ref = target or obs.footprint
            ra, dec = (ref.ra, ref.dec) if ref else (None, None)
        fp = obs.footprint
        if ra is None or fp is None or angular_separation_deg(ra, dec, fp.ra, fp.dec) > fp.radius_deg:
            raise NoCoverage(f"Observation '{observation_id}' does not cover ra={ra}, dec={dec}")

        size_px = max(8, round(size_arcsec / SPHEREX_PIXEL_ARCSEC))
        truth = self._truth.get(observation_id)
        field_ra, field_dec = (target.ra, target.dec) if target else (fp.ra, fp.dec)
        data = mock_sky.render(
            center_ra=ra, center_dec=dec, size_px=size_px, pixel_scale_arcsec=SPHEREX_PIXEL_ARCSEC,
            field_seed=obs.target_id or obs.id, field_ra=field_ra, field_dec=field_dec,
            noise_seed=obs.id, source=truth,
        )
        return Cutout(data=data, ra=ra, dec=dec, pixel_scale_arcsec=SPHEREX_PIXEL_ARCSEC, observation=obs)


class RealSource(DataSource):
    """IRSA access (SIA2 search + Cutout Service). To be filled in with the science team's code.

    Planned:
      search      -> pyvo SIA2 query on the SPHEREx Quick Release collection at (ra, dec)
      get_cutout  -> IRSA cutout of the spectral image, read with astropy.io.fits, raise
                     UpstreamError on archive failures and NoCoverage when (ra, dec) is off-image
    """

    name = "real"

    def list_targets(self) -> list[Target]:
        raise NotImplementedYet("RealSource.list_targets is not implemented yet")

    def get_observation(self, observation_id: str) -> Observation:
        raise NotImplementedYet("RealSource.get_observation is not implemented yet")

    def search(self, ra: float, dec: float, radius: float) -> list[Observation]:
        raise NotImplementedYet("RealSource.search is not implemented yet")

    def get_cutout(self, observation_id: str, ra: float | None, dec: float | None, size_arcsec: float) -> Cutout:
        raise NotImplementedYet("RealSource.get_cutout is not implemented yet")


@lru_cache
def get_data_source() -> DataSource:
    """FastAPI dependency. Override in tests via app.dependency_overrides."""
    s = get_settings()
    return RealSource() if s.data_source == "real" else MockSource(s.mock_dir)
