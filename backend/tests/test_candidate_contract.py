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


def test_snr_summary_is_computed_from_detections_and_checked():
    d = example()
    for det, snr in zip(d["detections"], (12.4, 4.2)):
        det["snr"] = snr
    c = Candidate.model_validate(d)                       # both null -> filled from the detections
    assert (c.median_snr, c.min_snr) == (8.3, 4.2)
    d["median_snr"], d["min_snr"] = 12.4, 12.4            # an average that hides the weak detection
    with pytest.raises(ValidationError, match="summarise"):
        Candidate.model_validate(d)
    d["detections"][1]["snr"] = None                      # missing snr values are left out of the summary
    d["median_snr"] = d["min_snr"] = None
    c = Candidate.model_validate(d)
    assert (c.median_snr, c.min_snr) == (12.4, 12.4)


def test_low_snr_flag_is_added_below_5_and_value_kept():
    d = example()
    d["detections"][0]["snr"], d["detections"][1]["snr"] = 4.99, 5.0
    c = Candidate.model_validate(d)
    assert c.detections[0].quality_flags == ["low_snr"] and c.detections[0].snr == 4.99
    assert c.detections[1].quality_flags == []
    assert c.status == "known_object"                     # a weak detection never rejects the candidate


def test_measured_flux_must_be_in_ujy():
    d = example(); d["is_mock"] = False
    d["detections"][0].update(flux=120.0, flux_error=8.0, flux_unit="MJy/sr")
    with pytest.raises(ValidationError, match="uJy"):
        Candidate.model_validate(d)
    d["detections"][0]["flux_unit"] = "uJy"
    Candidate.model_validate(d)
    d["detections"][0].update(flux=None, flux_error=None)  # flux may be null (not measured)
    Candidate.model_validate(d)


def test_engine_request_refuses_mixed_pipelines():
    from datetime import datetime, timezone
    from pathlib import Path as P
    from app.services.engine import EngineFrame, EngineRequest, KnownObject
    t = datetime(2026, 7, 13, tzinfo=timezone.utc)
    f = lambda v: EngineFrame(observation_id="x", fits_path=P("x.fits"), obs_time=t, band="D2", release="QR3",
                              processing_version=v, wavelength_um=None, bandwidth_um=None)
    ko = KnownObject(object_id="vesta", name="(4) Vesta", ra_deg=22.5, dec_deg=1.36, epoch_utc=t, source="JPL_HORIZONS")
    EngineRequest(22.5, 1.36, 0.1, [f("l2b-v27-2026-228"), f("l2b_retry-v27-2026-214")], [ko])  # same pipeline
    with pytest.raises(ValueError, match="pipeline"):
        EngineRequest(22.5, 1.36, 0.1, [f("l2b-v27-2026-228"), f("l2b-v28-2027-010")])


def test_score_is_a_0_to_1_ranking():
    d = example(); d["classification"]["score"] = 1.5
    with pytest.raises(ValidationError):
        Candidate.model_validate(d)
