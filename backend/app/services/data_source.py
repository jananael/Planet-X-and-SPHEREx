"""Data access layer. Routers only talk to `DataSource`; swap Mock <-> Real via DATA_SOURCE."""
from __future__ import annotations

import json
import math
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path

from app.config import get_settings
from app.errors import NotFound, NotImplementedYet
from app.schemas import ObservationDetail, SearchResult, Target

MOCK_VERSION = "v0"


def angular_separation_deg(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    """Great-circle distance in degrees (haversine; stable for small angles)."""
    ra1, dec1, ra2, dec2 = map(math.radians, (ra1, dec1, ra2, dec2))
    h = math.sin((dec2 - dec1) / 2) ** 2 + math.cos(dec1) * math.cos(dec2) * math.sin((ra2 - ra1) / 2) ** 2
    return math.degrees(2 * math.asin(min(1.0, math.sqrt(h))))


class DataSource(ABC):
    name: str

    @abstractmethod
    def list_targets(self) -> list[Target]: ...

    @abstractmethod
    def get_observation(self, observation_id: str) -> ObservationDetail: ...

    def search(self, ra: float, dec: float, radius: float) -> list[SearchResult]:
        results = []
        for t in self.list_targets():
            d = angular_separation_deg(ra, dec, t.ra, t.dec)
            if d <= radius:
                results.append(SearchResult(**t.model_dump(), distance_deg=round(d, 6)))
        return sorted(results, key=lambda r: r.distance_deg)


class MockSource(DataSource):
    """Reads mock/targets.<version>.json and mock/observations.<version>.json."""

    name = "mock"

    def __init__(self, mock_dir: Path, version: str = MOCK_VERSION):
        targets_raw = self._load(mock_dir / f"targets.{version}.json")["targets"]
        obs_raw = self._load(mock_dir / f"observations.{version}.json")["observations"]
        self._targets = [Target.model_validate(t) for t in targets_raw]
        self._observations = {o["id"]: ObservationDetail.model_validate(o) for o in obs_raw}

    @staticmethod
    def _load(path: Path) -> dict:
        with path.open(encoding="utf-8") as f:
            return json.load(f)

    def list_targets(self) -> list[Target]:
        return [t.model_copy(deep=True) for t in self._targets]

    def get_observation(self, observation_id: str) -> ObservationDetail:
        obs = self._observations.get(observation_id)
        if obs is None:
            raise NotFound("OBSERVATION_NOT_FOUND", f"No observation with id '{observation_id}'")
        return obs


class RealSource(DataSource):
    """Placeholder for real archive access (IRSA / SPHEREx / WISE). Not implemented yet."""

    name = "real"

    def list_targets(self) -> list[Target]:
        raise NotImplementedYet("RealSource.list_targets is not implemented yet")

    def get_observation(self, observation_id: str) -> ObservationDetail:
        raise NotImplementedYet("RealSource.get_observation is not implemented yet")

    def search(self, ra: float, dec: float, radius: float) -> list[SearchResult]:
        raise NotImplementedYet("RealSource.search is not implemented yet")


@lru_cache
def get_data_source() -> DataSource:
    """FastAPI dependency. Override in tests via app.dependency_overrides."""
    s = get_settings()
    return RealSource() if s.data_source == "real" else MockSource(s.mock_dir)
