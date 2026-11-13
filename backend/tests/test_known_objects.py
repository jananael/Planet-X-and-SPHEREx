"""Known-object predictions prepared by the backend for the engine (no network: Horizons is faked)."""
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app.schemas import Target
from app.services import known_objects as ko
from app.services.engine import EngineFrame

TARGETS = [Target.model_validate(t) for t in json.loads(
    (Path(__file__).resolve().parents[1] / "app" / "mock_data" / "targets.v0.json").read_text(encoding="utf-8"))["targets"]]
BY_ID = {t.id: t for t in TARGETS}


def frame(t: datetime, oid="f1") -> EngineFrame:
    return EngineFrame(observation_id=oid, fits_path=Path("x.fits"), obs_time=t, band="D1", release="DR1",
                       processing_version="l2b-v27-2026-209", wavelength_um=None, bandwidth_um=None)


def test_barnard_is_predicted_from_gaia_proper_motion_at_the_frame_epoch(tmp_path):
    t = datetime(2026, 3, 11, tzinfo=timezone.utc)
    ra, dec = ko._propagated(BY_ID["barnards-star"], ko.decimal_year(t))
    known, notes = ko.known_objects_for(TARGETS, [frame(t)], ra, dec, 0.1, tmp_path)
    barnard = [k for k in known if k.object_id == "barnards-star"]
    assert len(barnard) == 1 and barnard[0].source == "GAIA_DR3" and barnard[0].epoch_utc == t and not notes
    # ~10.4"/yr north: the 2026.2 position is ~105" north of the 2016.0 Gaia position
    assert (barnard[0].dec_deg - BY_ID["barnards-star"].dec) * 3600 == pytest.approx(10.362 * 10.19, rel=0.02)


def test_comet_uses_horizons_only_inside_its_verified_window(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(ko, "_horizons", lambda tid, t, cache: calls.append((tid, t)) or (173.80416, 2.82275))
    inside = datetime(2025, 12, 8, 0, 13, 54, tzinfo=timezone.utc)
    outside = datetime(2026, 3, 20, tzinfo=timezone.utc)
    known, _ = ko.known_objects_for(TARGETS, [frame(inside, "a"), frame(outside, "b")], 173.774, 2.833, 0.25, tmp_path)
    atlas = [k for k in known if k.object_id == "3i-atlas"]
    assert [k.epoch_utc for k in atlas] == [inside] and atlas[0].source == "JPL_HORIZONS"
    assert atlas[0].uncertainty_arcsec == ko.HORIZONS_UNCERTAINTY_ARCSEC
    assert calls == [("3i-atlas", inside)]                      # no call for the frame outside the window


def test_no_horizons_call_far_from_any_moving_target(tmp_path, monkeypatch):
    monkeypatch.setattr(ko, "_horizons", lambda *a: pytest.fail("Horizons must not be called"))
    known, notes = ko.known_objects_for(TARGETS, [frame(datetime(2025, 12, 8, tzinfo=timezone.utc))], 10.0, 60.0, 0.25, tmp_path)
    assert known == [] and notes == []


def test_horizons_failure_is_reported_not_invented(tmp_path, monkeypatch):
    monkeypatch.setattr(ko, "_horizons", lambda *a: None)
    t = datetime(2025, 12, 8, 0, 13, 54, tzinfo=timezone.utc)
    known, notes = ko.known_objects_for(TARGETS, [frame(t)], 173.774, 2.833, 0.25, tmp_path)
    assert not [k for k in known if k.object_id == "3i-atlas"]
    assert notes and "Horizons unavailable" in notes[0]
