"""Interface between the backend and the science team's detection engine (S2-T3, DRAFT).

The engine is a Python library inside this repo (decision: Yazan, 2026-11-13). The backend gives it
the frames it already found and cached; the engine returns `Candidate` objects
(app/schemas/candidate.py), which the API serves unchanged. The backend never edits measurements.

Contract rules (docs/measurement-contract.md):
- Science pixels are read from the original FITS (IMAGE, FLAGS, VARIANCE, ZODI, EPSF, WCS-WAVE HDUs), never from
  the display PNGs: display PNGs have defects repaired and a stretch applied.
- TRANSIENT-flagged pixels are kept as a mask, never replaced. A candidate near them gets
  "near_transient_pixels" in quality_flags.
- Pixels are MJy/sr. Integrated flux and flux_error are in uJy (flux_unit="uJy"), converted with the
  pixel solid-angle map. Never sum MJy/sr as a flux.
- Unmeasured values are None. `score` stays None until the method that defines it is documented.
- Status is never "discovered": pending_validation | known_object | artifact | rejected.
- The engine never calls Horizons / Gaia / IRSA itself: the backend downloads the FITS and sends
  `known_objects`, so a run is reproducible from its inputs alone (Yazan, 2026-11-13).
- Brightness time series only within one band. Frames from incompatible pipelines are not compared
  quantitatively (the backend sends one pipeline per request; the flag alone is not enough).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Literal, Protocol

from app.schemas.candidate import CONTRACT_VERSION, Candidate  # noqa: F401  (re-exported)

# Initial operational limits (Yazan, 2026-11-13). Not scientific limits: to re-measure on real data.
DIRECT_MAX_FRAMES = 3          # more frames -> background job (API returns a job_id)
DIRECT_TARGET_SECONDS = 60     # target for a direct (synchronous) request
WORKER_MAX_SECONDS = 180       # hard limit for one engine run in a worker


@dataclass(frozen=True)
class EngineFrame:
    """One SPHEREx image the engine may use. All of it comes from the archive, nothing is derived for display."""

    observation_id: str                # e.g. "2025W19_1B_0241_1D1" (same id the API uses)
    fits_path: Path                    # cached cutout FITS: IMAGE, FLAGS, VARIANCE, ZODI, EPSF, WCS-WAVE (+ WCS keys A, W)
    obs_time: datetime                 # UTC, mid-exposure
    band: str                          # D1..D6
    release: str                       # DR1 | QR3
    processing_version: str | None     # e.g. "l2b-v27-2026-228"; compare pipelines with this, not `release`
    wavelength_um: float | None        # at the target pixel (CWAVE calibration, else WCS-WAVE)
    bandwidth_um: float | None
    pixel_scale_arcsec: float = 6.15


@dataclass(frozen=True)
class KnownObject:
    """Predicted position of a known object at one time, prepared by the backend."""

    object_id: str                     # e.g. "3i-atlas", "barnards-star"
    name: str
    ra_deg: float
    dec_deg: float
    epoch_utc: datetime                # time the position is valid for (an exposure mid-time)
    source: Literal["JPL_HORIZONS", "GAIA_DR3", "LITERATURE"]  # solar-system bodies: JPL_HORIZONS
    uncertainty_arcsec: float | None = None


@dataclass(frozen=True)
class EngineRequest:
    ra_deg: float                      # ICRS, the point the user asked about
    dec_deg: float
    radius_deg: float
    frames: list[EngineFrame]          # sorted by obs_time; may mix DR1 and QR3 when pipelines match
    known_objects: list[KnownObject] = field(default_factory=list)  # a match alone does not validate a detection


class DetectionEngine(Protocol):
    version: str                       # copied into Candidate.engine_version

    def detect(self, request: EngineRequest) -> list[Candidate]:
        """Return candidates near (ra, dec). Must not raise for 'nothing found': return []."""
        ...
