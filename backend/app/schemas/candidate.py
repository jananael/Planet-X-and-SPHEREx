"""Candidate shape agreed with the science team (Yazan's draft + backend review).

Rules: measured values only (null when not measured, never invented); RA offsets are on-sky
(multiplied by cos Dec); times are UTC mid-exposure; every number carries its unit in its name.
A candidate is never a discovery: status says whether it is pending, a known object, an artifact...
"""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class Detection(BaseModel):
    observation_id: str
    observation_time: datetime = Field(description="UTC, mid-exposure")
    ra_deg: float | None
    dec_deg: float | None
    flux: float | None = None
    flux_error: float | None = None
    flux_unit: str | None = Field(default=None, description='Real engine: "uJy" (integrated flux). Never MJy/sr')


class Motion(BaseModel):
    delta_ra_arcsec: float | None = Field(description="On-sky RA offset (includes cos Dec), first -> last detection")
    delta_dec_arcsec: float | None
    angular_displacement_arcsec: float | None
    angular_speed_arcsec_per_day: float | None
    position_angle_deg: float | None = Field(description="Direction of motion, degrees east of north")
    uncertainty_arcsec: float | None = None


class Brightness(BaseModel):
    delta_flux: float | None
    delta_mag: float | None = None
    variability_status: Literal["variable", "not_variable", "inconclusive"] = "inconclusive"


class Classification(BaseModel):
    candidate_type: Literal["possible_moving_object", "possible_variable", "sub_pixel_motion", "unclassified"]
    score: float | None = Field(default=None, description="Stays null until a documented method defines it")
    method: str


class Quality(BaseModel):
    data_quality: Literal["valid", "degraded", "unknown"] = "unknown"
    insufficient_evidence: bool = True


class Candidate(BaseModel):
    candidate_id: str
    observation_ids: list[str]
    detections: list[Detection]
    motion: Motion | None = None
    brightness: Brightness | None = None
    classification: Classification
    quality: Quality
    status: Literal["pending_validation", "known_object", "artifact", "rejected"] = "pending_validation"
    known_match: str | None = Field(default=None, description="Known object this matches (catalogue / ephemeris)")
    data_release: str | None = None
    engine_version: str = Field(description="What produced this candidate, e.g. 'mock' or the engine's version")
    # Filled by the science team's detection engine (null / empty until it defines them).
    snr: float | None = Field(default=None, description="Signal-to-noise of the detection, as defined by the engine")
    quality_flags: list[str] = Field(default_factory=list,
                                     description="e.g. 'near_transient_pixels', 'saturated', 'mixed_pipeline'")
    evidence: dict[str, Any] = Field(default_factory=dict, description="Engine-specific measurements behind the result")
    is_mock: bool


class CandidateList(BaseModel):
    query: dict
    candidates: list[Candidate]
    count: int
