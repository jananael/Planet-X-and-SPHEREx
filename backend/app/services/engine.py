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
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Protocol

from app.schemas.candidate import Candidate

CONTRACT_VERSION = "0.1-draft"


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
class EngineRequest:
    ra_deg: float                      # ICRS, the point the user asked about
    dec_deg: float
    radius_deg: float
    frames: list[EngineFrame]          # sorted by obs_time; may mix DR1 and QR3 when pipelines match
    known_objects: list[dict] = field(default_factory=list)  # optional: {"name", "ra_deg", "dec_deg", "obs_time"} predictions (Horizons/Gaia)


class DetectionEngine(Protocol):
    version: str                       # copied into Candidate.engine_version

    def detect(self, request: EngineRequest) -> list[Candidate]:
        """Return candidates near (ra, dec). Must not raise for 'nothing found': return []."""
        ...
