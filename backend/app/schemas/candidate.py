"""Candidate shape agreed with the science team (Yazan's draft + backend review).

Rules: measured values only (null when not measured, never invented); RA offsets are on-sky
(multiplied by cos Dec); times are UTC mid-exposure; every number carries its unit in its name.
A candidate is never a discovery: status says whether it is pending, a known object, an artifact...

Contract version 0.2-draft (Yazan's answers, 2026-11-13; see docs/measurement-contract.md):
- SNR per detection (one per observation) + a candidate summary (median_snr, min_snr).
- quality_flags from a fixed list (QualityFlag). A flag is a warning, not an automatic rejection.
- Brightness time series only within ONE band (D6 with D6, never D4 with D6).
- score stays null until its method is documented; it is a ranking, never a probability.
- low_snr is added automatically to a detection with snr < LOW_SNR_THRESHOLD (a warning, never a rejection).
- median_snr / min_snr are computed from the detections' non-null snr values (null if there are none).
- A measured flux (not mock) must be in uJy; flux_error never comes without flux.
- Times must carry a timezone. Naive times are rejected (never assumed UTC); other offsets are
  converted to UTC explicitly.
- observation_ids are the detections' ids: one detection per observation, no duplicates.
"""
import statistics
from datetime import timezone
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, AwareDatetime, BaseModel, Field, model_validator

CONTRACT_VERSION = "0.2-draft"
# Initial operational threshold (Yazan, 2026-11-13), to test on real SPHEREx data:
# < 3 very weak (not a reliable detection alone) · 3-5 marginal (needs more evidence) · >= 5 strong signal
# (still not proof the source is real). Only the < 5 flag is applied automatically.
LOW_SNR_THRESHOLD = 5.0

QualityFlag = Literal[
    "near_transient_pixels",  # source or its measurement area is close to TRANSIENT-flagged pixels
    "saturated",              # saturated pixels inside the measurement area
    "edge_of_image",          # near the image edge or an incomplete area
    "mixed_pipeline",         # compared data come from processing versions that may not be compatible
    "extended_source",        # not point-like (e.g. 3I/ATLAS coma)
    "low_snr",                # below the agreed SNR quality threshold
    "poor_wcs",               # WCS quality / reliability not sufficient
    "high_background",        # background noticeably affects the measurement
    "insufficient_epochs",    # not enough independent exposures for the conclusion
    "photometry_failed",      # no reliable flux measurement
]
Band = Literal["D1", "D2", "D3", "D4", "D5", "D6"]


def to_utc(t):
    """Reject naive times (never guess UTC); convert any explicit offset to UTC."""
    if t.tzinfo is None or t.utcoffset() is None:
        raise ValueError("time must carry a timezone (UTC expected), naive times are not accepted")
    return t.astimezone(timezone.utc)


UtcDatetime = Annotated[AwareDatetime, AfterValidator(to_utc)]


class Detection(BaseModel):
    """The object measured in ONE observation (one detector image of one exposure)."""

    observation_id: str
    observation_time: UtcDatetime = Field(description="UTC, mid-exposure (offsets are converted to UTC; naive rejected)")
    band: Band | None = None
    wavelength_um: float | None = Field(default=None, description="At the source position")
    bandwidth_um: float | None = None
    ra_deg: float | None
    dec_deg: float | None
    snr: float | None = Field(default=None, description="Signal-to-noise in this observation; null if not reliable")
    flux: float | None = None
    flux_error: float | None = None
    flux_unit: str | None = Field(default=None, description='Real engine: "uJy" (integrated flux). Never MJy/sr')
    quality_flags: list[QualityFlag] = Field(default_factory=list)

    @model_validator(mode="after")
    def _flag_low_snr(self):
        if self.snr is not None and self.snr < LOW_SNR_THRESHOLD and "low_snr" not in self.quality_flags:
            self.quality_flags.append("low_snr")  # the numeric snr is kept as measured
        return self


class Motion(BaseModel):
    delta_ra_arcsec: float | None = Field(description="On-sky RA offset (includes cos Dec), first -> last detection")
    delta_dec_arcsec: float | None
    angular_displacement_arcsec: float | None
    angular_speed_arcsec_per_day: float | None
    position_angle_deg: float | None = Field(description="Direction of motion, degrees east of north")
    uncertainty_arcsec: float | None = None


class Brightness(BaseModel):
    band: Band | None = Field(default=None, description="The single band this time series uses")
    delta_flux: float | None
    delta_mag: float | None = None
    variability_status: Literal["variable", "not_variable", "inconclusive"] = "inconclusive"


class Classification(BaseModel):
    candidate_type: Literal["possible_moving_object", "possible_variable", "sub_pixel_motion", "unclassified"]
    score: float | None = Field(default=None, ge=0, le=1,
                                description="Ranking of how strongly the evidence deserves review (0-1). NOT a probability "
                                            "and NOT a discovery claim. Null until the method is documented")
    method: str


class Quality(BaseModel):
    data_quality: Literal["valid", "degraded", "unknown"] = "unknown"
    insufficient_evidence: bool = True


class Candidate(BaseModel):
    candidate_id: str
    observation_ids: list[str] = Field(default_factory=list,
                                       description="Derived from detections when omitted; if given, must match them exactly")
    detections: list[Detection]
    motion: Motion | None = None
    brightness: Brightness | None = None
    classification: Classification
    quality: Quality
    status: Literal["pending_validation", "known_object", "artifact", "rejected"] = "pending_validation"
    known_match: str | None = Field(default=None, description="Known object this matches (catalogue / ephemeris)")
    data_release: str | None = None
    engine_version: str = Field(description="What produced this candidate, e.g. 'mock' or the engine's version")
    # Summary of the per-detection SNR. Never hide a weak detection behind an average.
    median_snr: float | None = None
    min_snr: float | None = None
    quality_flags: list[QualityFlag] = Field(default_factory=list,
                                             description="Candidate-level flags; per-observation flags live on each detection")
    evidence: dict[str, Any] = Field(default_factory=dict, description="Engine-specific measurements behind the result")
    is_mock: bool = Field(description="True when the MEASUREMENTS were not produced by the science engine (mock mode "
                                      "or a contract example). The observations/images it refers to may still be real")

    @model_validator(mode="after")
    def _consistent(self):
        det_ids = [d.observation_id for d in self.detections]
        if len(set(det_ids)) != len(det_ids):
            raise ValueError("one detection per observation: duplicate observation_id in detections")
        if not self.observation_ids:
            self.observation_ids = det_ids
        elif len(set(self.observation_ids)) != len(self.observation_ids) or set(self.observation_ids) != set(det_ids):
            raise ValueError("observation_ids must list exactly the detections' observation ids, without duplicates")
        for d in self.detections:
            if d.flux_error is not None and d.flux is None:
                raise ValueError(f"flux_error without flux (detection {d.observation_id})")
        snrs = [d.snr for d in self.detections if d.snr is not None]
        expected_median = round(statistics.median(snrs), 2) if snrs else None
        expected_min = round(min(snrs), 2) if snrs else None
        if self.median_snr is None and self.min_snr is None:
            self.median_snr, self.min_snr = expected_median, expected_min  # filled from the detections
        elif (self.median_snr is None or expected_median is None
              or abs(self.median_snr - expected_median) > 0.01 or abs((self.min_snr or 0) - expected_min) > 0.01):
            raise ValueError(f"median_snr/min_snr must summarise the detections' snr values "
                             f"(expected {expected_median} / {expected_min}, or leave both null)")
        if not self.is_mock:
            for d in self.detections:
                if (d.flux is not None or d.flux_error is not None) and d.flux_unit != "uJy":
                    raise ValueError(f"measured flux must be in uJy (detection {d.observation_id}: {d.flux_unit!r})")
        if self.brightness is not None and self.brightness.delta_flux is not None:
            bands = {d.band for d in self.detections if d.flux is not None}
            if len(bands) > 1:
                raise ValueError(f"a brightness time series must use one band, got {sorted(map(str, bands))}")
            if self.brightness.band is not None and bands and bands != {self.brightness.band}:
                raise ValueError("brightness.band does not match the detections' band")
        return self


class CandidateList(BaseModel):
    query: dict
    candidates: list[Candidate]
    count: int
