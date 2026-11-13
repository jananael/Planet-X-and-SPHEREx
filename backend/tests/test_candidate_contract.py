"""Measurement contract (S2-T3) validation: the rules agreed with the science team are enforced."""
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.schemas.candidate import Candidate

DOCS = Path(__file__).resolve().parents[2] / "docs"


def example() -> dict:
    return json.loads((DOCS / "examples" / "candidate.example.json").read_text(encoding="utf-8"))


def test_example_is_valid():
    c = Candidate.model_validate(example())
    assert c.classification.score is None and c.status != "discovered"


def test_unknown_quality_flag_is_rejected():
    d = example(); d["quality_flags"] = ["cosmic_ray"]  # not in the agreed list (TRANSIENT != cosmic ray)
    with pytest.raises(ValidationError):
        Candidate.model_validate(d)
    d = example(); d["detections"][0]["quality_flags"] = ["near_transient_pixels", "low_snr"]
    Candidate.model_validate(d)


def test_brightness_series_must_use_one_band():
    d = example()
    d["detections"][0].update(flux=10.0, band="D4"); d["detections"][1].update(flux=12.0, band="D6")
    d["brightness"] = {"delta_flux": 2.0}
    with pytest.raises(ValidationError, match="one band"):
        Candidate.model_validate(d)
    d["detections"][0]["band"] = "D6"; d["brightness"]["band"] = "D6"
    Candidate.model_validate(d)


def test_snr_summary_is_consistent():
    d = example(); d["median_snr"], d["min_snr"] = 8.7, 12.4
    with pytest.raises(ValidationError):
        Candidate.model_validate(d)
    d["median_snr"], d["min_snr"] = 8.7, 4.2
    Candidate.model_validate(d)


def test_score_is_a_0_to_1_ranking():
    d = example(); d["classification"]["score"] = 1.5
    with pytest.raises(ValidationError):
        Candidate.model_validate(d)
