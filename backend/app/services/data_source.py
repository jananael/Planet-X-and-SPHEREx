"""Data access layer. Routers only talk to `DataSource`; switch Mock <-> Real with DATA_SOURCE."""
from __future__ import annotations

import json
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import numpy as np

from app.config import get_settings
from app.errors import NoCoverage, NotFound, NotImplementedYet
from app.schemas import Observation, Target
from app.schemas.candidate import (
    Brightness, Candidate, Classification, Detection, Motion, Quality,
)
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
    repaired_pixels: int = 0          # flagged pixels replaced for display (real data)
    repaired_flags: list[str] = field(default_factory=list)
    transient_pixels: int = 0         # TRANSIENT-flagged pixels left unrepaired in the cutout (real data)


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
        """North-up pixels (row 0 = north) of one observation around (ra, dec).

        Default centre: mock = the target's reference position; real = the point that was searched.
        The returned Cutout.observation may carry fields only known after reading the image
        (e.g. wavelength_um at the target).
        """

    # Candidates come from the science team's engine. Sources that don't have one say so (501).
    def candidates(self, ra: float, dec: float, radius: float, *, band: str | None = None,
                   pipeline: str | None = None) -> list[Candidate]:
        raise NotImplementedYet("Candidate detection is not connected for this data source yet (science engine pending)")

    def get_candidate(self, candidate_id: str) -> Candidate:
        raise NotImplementedYet("Candidate detection is not connected for this data source yet (science engine pending)")


def build_mock_candidate(target: Target, observations: list[Observation], truth: dict) -> Candidate:
    """A candidate from mock positions/fluxes, labelled as mock. These are KNOWN objects, so the
    status is known_object: the point is to exercise the contract, not to claim anything."""
    obs = sorted(observations, key=lambda o: o.mjd)
    dets = [Detection(observation_id=o.id, release=o.release, processing_version=o.processing_version,
                      source_file=o.source_file, archive_id=o.archive_id,
                      observation_time=o.obs_time, band=o.band, wavelength_um=o.wavelength_um,
                      ra_deg=truth[o.id]["ra"],
                      dec_deg=truth[o.id]["dec"], flux=truth[o.id]["flux"], flux_unit="arbitrary (synthetic)")
            for o in obs]
    first, last = dets[0], dets[-1]
    cosd = math.cos(math.radians((first.dec_deg + last.dec_deg) / 2))
    dra = ((last.ra_deg - first.ra_deg + 180) % 360 - 180) * cosd * 3600
    ddec = (last.dec_deg - first.dec_deg) * 3600
    disp = math.hypot(dra, ddec)
    days = (obs[-1].mjd - obs[0].mjd) or None
    motion = Motion(delta_ra_arcsec=round(dra, 3), delta_dec_arcsec=round(ddec, 3),
                    angular_displacement_arcsec=round(disp, 3),
                    angular_speed_arcsec_per_day=round(disp / days, 4) if days else None,
                    position_angle_deg=round(math.degrees(math.atan2(dra, ddec)) % 360, 1) if disp > 0 else None)
    dflux = last.flux - first.flux
    rel = abs(dflux) / max(abs(first.flux), 1e-9)
    if disp >= 6.15:
        kind = "possible_moving_object"
    elif disp > 0:
        kind = "sub_pixel_motion"
    elif rel > 0.3:
        kind = "possible_variable"
    else:
        kind = "unclassified"
    return Candidate(
        candidate_id=f"cand-{target.id}", observation_ids=[o.id for o in obs], detections=dets,
        motion=motion, brightness=Brightness(band=first.band, delta_flux=round(dflux, 4),
                                            variability_status="variable" if rel > 0.3 else "inconclusive"),
        classification=Classification(candidate_type=kind, method="mock: synthetic positions and fluxes"),
        quality=Quality(data_quality="valid", insufficient_evidence=False),
        status="known_object", known_match=target.name, data_release=obs[0].release,
        engine_version="mock", is_mock=True,
    )


class MockSource(DataSource):
    """Reads app/mock_data/*.v0.json and renders synthetic cutouts (see mock_sky)."""

    name = "mock"

    def __init__(self, mock_dir: Path, version: str = MOCK_VERSION):
        targets_raw = self._load(mock_dir / f"targets.{version}.json")["targets"]
        obs_raw = self._load(mock_dir / f"observations.{version}.json")["observations"]
        self._targets = {t["id"]: Target.model_validate(t) for t in targets_raw}
        self._observations = {o["id"]: Observation.model_validate(o) for o in obs_raw}
        self._truth = {o["id"]: o.get("mock_truth") for o in obs_raw}
        by_target: dict[str, list[Observation]] = {}
        for o in self._observations.values():
            if o.target_id:
                by_target.setdefault(o.target_id, []).append(o)
        self._candidates = {
            c.candidate_id: c for c in (build_mock_candidate(self._targets[t], obs, self._truth)
                                        for t, obs in by_target.items() if len(obs) >= 2 and t in self._targets)
        }

    def candidates(self, ra: float, dec: float, radius: float, *, band: str | None = None,
                   pipeline: str | None = None) -> list[Candidate]:
        hits = [c for c in self._candidates.values()
                if angular_separation_deg(ra, dec, c.detections[0].ra_deg, c.detections[0].dec_deg) <= radius]
        return sorted(hits, key=lambda c: angular_separation_deg(ra, dec, c.detections[0].ra_deg, c.detections[0].dec_deg))

    def get_candidate(self, candidate_id: str) -> Candidate:
        c = self._candidates.get(candidate_id)
        if c is None:
            raise NotFound(f"No candidate with id '{candidate_id}'")
        return c

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


@lru_cache
def get_data_source() -> DataSource:
    """FastAPI dependency. Override in tests via app.dependency_overrides."""
    s = get_settings()
    if s.data_source == "real":
        from app.services.real_source import RealSource  # lazy: pulls in astropy / pyvo

        return RealSource(targets_file=s.mock_dir / f"targets.{MOCK_VERSION}.json", cache_dir=s.cache_dir)
    return MockSource(s.mock_dir)
