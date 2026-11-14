from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from astropy.io import fits

from app.schemas.candidate import Candidate
from app.errors import BadRequest
from app.services.engine import EngineFrame, EngineRequest
from app.services.source_detection import SourceDetectionEngine, _frame_detections


RA, DEC = 42.0, 10.0


def make_frame(tmp_path, name, sources=(), *, time_offset=0, size=64, variance=True,
               variance_unit="(MJy/sr)^2", wcs=True, image_unit="MJy / sr", flags=(), include_flags=True,
               release="DR1", processing_version="l2b-v27-2026-228", source_file=None, archive_id=None):
    rng = np.random.default_rng(43)
    image = rng.normal(0, 0.03, (size, size))
    for x, y, flux in sources:
        image[y, x] += flux
    header = fits.Header()
    header["BUNIT"] = image_unit
    if wcs:
        header["CTYPE1"] = "RA---TAN"
        header["CTYPE2"] = "DEC--TAN"
        header["CRVAL1"] = RA
        header["CRVAL2"] = DEC
        header["CRPIX1"] = size / 2
        header["CRPIX2"] = size / 2
        header["CD1_1"] = -6.15 / 3600
        header["CD1_2"] = 0
        header["CD2_1"] = 0
        header["CD2_2"] = 6.15 / 3600
    hdus = [fits.PrimaryHDU(), fits.ImageHDU(image, header=header, name="IMAGE")]
    mask = np.zeros((size, size), dtype=np.int32)
    fh = fits.Header()
    for bit, (x, y, plane) in enumerate(flags):
        mask[y, x] |= 1 << bit
        fh[f"MSKN{bit:04d}"] = plane
        fh[f"MSKM{bit:04d}"] = 1 << bit
    if include_flags:
        hdus.append(fits.ImageHDU(mask, header=fh, name="FLAGS"))
    if variance:
        var_header = fits.Header({"BUNIT": variance_unit})
        hdus.append(fits.ImageHDU(np.full((size, size), 0.03**2), header=var_header, name="VARIANCE"))
    path = tmp_path / f"{name}.fits"
    fits.HDUList(hdus).writeto(path)
    return EngineFrame(name, path, datetime(2025, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=time_offset),
                       "D3", release, processing_version, None, None,
                       source_file=source_file or f"{name}.fits", archive_id=archive_id or f"archive:{name}")


def request(frames):
    return EngineRequest(RA, DEC, 1.0, frames)


def test_no_qualifying_sources_returns_empty(tmp_path):
    assert SourceDetectionEngine().detect(request([make_frame(tmp_path, "empty")])) == []


def test_one_source_across_epochs_is_associated_without_invented_photometry(tmp_path):
    frames = [make_frame(tmp_path, f"e{i}", [(32, 32, 2)], time_offset=i * 10) for i in range(2)]
    candidates = SourceDetectionEngine().detect(request(frames))
    assert len(candidates) == 1
    candidate = candidates[0]
    assert len(candidate.detections) == 2
    assert candidate.motion is None  # two epoch detections do not establish a defensible track rate
    assert all(d.flux is None and d.flux_error is None for d in candidate.detections)


def test_two_nearby_sources_are_kept_separate(tmp_path):
    frame = make_frame(tmp_path, "pair", [(29, 32, 2), (33, 32, 2)])
    candidates = SourceDetectionEngine().detect(request([frame]))
    assert len(candidates) == 2


def test_motion_beyond_current_association_gate_is_not_forced_into_track(tmp_path):
    frames = [make_frame(tmp_path, "before", [(28, 32, 2)], time_offset=0),
              make_frame(tmp_path, "after", [(33, 32, 2)], time_offset=10)]
    candidates = SourceDetectionEngine().detect(request(frames))
    assert len(candidates) == 2
    assert all(c.motion is None and len(c.detections) == 1 for c in candidates)


def test_ambiguous_nearest_association_remains_separate(tmp_path):
    frames = [make_frame(tmp_path, "two", [(30, 32, 2), (32, 32, 2)], time_offset=0),
              make_frame(tmp_path, "ambiguous", [(31, 32, 2)], time_offset=10)]
    candidates = SourceDetectionEngine().detect(request(frames))
    assert len(candidates) == 3
    assert sorted(len(c.detections) for c in candidates) == [1, 1, 1]
    assert all(c.motion is None for c in candidates)


def test_transient_pixels_near_a_source_are_reported(tmp_path):
    frame = make_frame(tmp_path, "transient", [(32, 32, 2)],
                       flags=[(33, 32, "TRANSIENT")])
    results = _frame_detections(frame, request([frame]))
    assert len(results) == 1
    assert "near_transient_pixels" in results[0][1]


@pytest.mark.parametrize("variance,variance_unit", [(False, ""), (True, "adu")])
def test_missing_or_invalid_variance_uses_mad_fallback(tmp_path, variance, variance_unit):
    frame = make_frame(tmp_path, "mad", [(32, 32, 2)], variance=variance, variance_unit=variance_unit)
    assert len(_frame_detections(frame, request([frame]))) == 1


def test_zero_variance_uses_mad_fallback(tmp_path):
    frame = make_frame(tmp_path, "zero-var", [(32, 32, 2)])
    with fits.open(frame.fits_path, mode="update") as hdul:
        hdul["VARIANCE"].data[:] = 0
        hdul.flush()
    result = _frame_detections(frame, request([frame]))
    assert len(result) == 1 and result[0][2]["snr_method"] == "mad_global_noise"


def test_invalid_wcs_returns_no_unlocated_detections(tmp_path):
    frame = make_frame(tmp_path, "no-wcs", [(32, 32, 2)], wcs=False)
    with pytest.raises(BadRequest, match="WCS"):
        _frame_detections(frame, request([frame]))


def test_incompatible_units_are_not_compared(tmp_path):
    frame = make_frame(tmp_path, "bad-unit", [(32, 32, 2)], image_unit="adu")
    with pytest.raises(BadRequest, match="BUNIT"):
        _frame_detections(frame, request([frame]))


def test_unknown_or_incompatible_multi_frame_pipeline_is_rejected(tmp_path):
    a = make_frame(tmp_path, "a", [(32, 32, 2)])
    b = make_frame(tmp_path, "b", [(32, 32, 2)], time_offset=1)
    unknown = EngineFrame(a.observation_id, a.fits_path, a.obs_time, a.band, a.release,
                          "vendor-unknown", None, None)
    with pytest.raises(ValueError, match="unknown processing_version"):
        EngineRequest(RA, DEC, 1, [unknown])
    with pytest.raises(ValueError, match="pipeline"):
        EngineRequest(RA, DEC, 1, [a, EngineFrame(b.observation_id, b.fits_path, b.obs_time, b.band,
                      b.release, "vendor-unknown", None, None)])
    with pytest.raises(ValueError, match="pipeline"):
        EngineRequest(RA, DEC, 1, [a, EngineFrame(b.observation_id, b.fits_path, b.obs_time, b.band,
                      b.release, "l2b-v28-2026-001", None, None)])


def test_motion_needs_three_epoch_associations(tmp_path):
    frames = [make_frame(tmp_path, f"m{i}", [(32, 32, 2)], time_offset=i * 10) for i in range(3)]
    candidate = SourceDetectionEngine().detect(request(frames))[0]
    assert len(candidate.detections) == 3
    assert candidate.motion is not None
    assert candidate.motion.uncertainty_arcsec is None


def test_unavailable_flag_information_is_exposed_and_quality_stays_unknown(tmp_path):
    frames = [make_frame(tmp_path, f"no-flags-{i}", [(32, 32, 2)], time_offset=i * 10,
                         include_flags=False) for i in range(3)]
    candidate = SourceDetectionEngine().detect(request(frames))[0]
    assert candidate.quality.data_quality == "unknown"
    assert all(not row["flags_available"] for row in candidate.evidence["measurements"])


def test_more_than_500_peaks_are_not_silently_discarded(tmp_path):
    sources = [(x, y, 2) for y in range(4, 96, 3) for x in range(4, 96, 3)]
    frame = make_frame(tmp_path, "crowded", sources, size=100)
    results = _frame_detections(frame, request([frame]))
    assert len(results) > 500


def test_overflow_pixels_are_excluded_without_claiming_full_saturation(tmp_path):
    frame = make_frame(tmp_path, "overflow", [(32, 32, 2)], flags=[(32, 32, "OVERFLOW")])
    assert _frame_detections(frame, request([frame])) == []


def test_source_flag_is_informational_and_does_not_suppress_detection(tmp_path):
    frame = make_frame(tmp_path, "source-mask", [(32, 32, 2)], flags=[(32, 32, "SOURCE")])
    # This plane can be broad in real products; it does not mean invalid pixels.
    with fits.open(frame.fits_path, mode="update") as hdul:
        hdul["FLAGS"].data[:] |= 1
        hdul.flush()
    assert len(_frame_detections(frame, request([frame]))) == 1


def test_high_background_uses_local_annulus_and_variance(tmp_path):
    frame = make_frame(tmp_path, "high-background", [(32, 32, 2)])
    with fits.open(frame.fits_path, mode="update") as hdul:
        hdul["IMAGE"].data += 1000
        hdul.flush()
    assert len(_frame_detections(frame, request([frame]))) == 1


def test_duplicate_observation_id_or_simultaneous_frames_are_rejected(tmp_path):
    a = make_frame(tmp_path, "same", [(32, 32, 2)])
    b = EngineFrame("same", a.fits_path, a.obs_time + timedelta(minutes=5), a.band,
                    a.release, a.processing_version, None, None)
    with pytest.raises(ValueError, match="duplicate observation IDs"):
        EngineRequest(RA, DEC, 1, [a, b])
    c = EngineFrame("different-id", a.fits_path, a.obs_time, a.band, a.release,
                    a.processing_version, None, None)
    with pytest.raises(ValueError, match="simultaneous"):
        EngineRequest(RA, DEC, 1, [a, c])


def test_candidate_output_conforms_to_measurement_contract(tmp_path):
    frame = make_frame(tmp_path, "contract", [(32, 32, 2)])
    candidate = SourceDetectionEngine().detect(request([frame]))[0]
    assert Candidate.model_validate(candidate.model_dump()) == candidate


def test_detections_preserve_provenance_from_each_frame_and_summarize_releases(tmp_path):
    frames = [
        make_frame(tmp_path, "dr1", [(32, 32, 2)], time_offset=0,
                   release="DR1", source_file="dr1-frame.fits", archive_id="ivo:archive/dr1"),
        make_frame(tmp_path, "qr3", [(32, 32, 2)], time_offset=10,
                   release="QR3", source_file="qr3-frame.fits", archive_id="ivo:archive/qr3"),
    ]
    candidate = SourceDetectionEngine().detect(request(frames))[0]
    by_id = {d.observation_id: d for d in candidate.detections}
    assert by_id["dr1"].release == "DR1"
    assert by_id["dr1"].processing_version == "l2b-v27-2026-228"
    assert by_id["dr1"].source_file == "dr1-frame.fits"
    assert by_id["dr1"].archive_id == "ivo:archive/dr1"
    assert by_id["qr3"].release == "QR3"
    assert by_id["qr3"].processing_version == "l2b-v27-2026-228"
    assert by_id["qr3"].source_file == "qr3-frame.fits"
    assert by_id["qr3"].archive_id == "ivo:archive/qr3"
    assert candidate.data_release == "DR1+QR3"
