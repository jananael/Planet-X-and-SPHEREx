"""Conservative SPHEREx source detection and positional cross-matching.

This first engine intentionally reports peak-pixel SNR and sky positions only. It does
not claim calibrated photometry: flux remains null until the Tractor/solid-angle path is
available. It reads the cached science FITS, never display PNGs or repaired pixels.
"""
from __future__ import annotations

import math
from collections.abc import Iterable
from datetime import timedelta

import numpy as np

from app.errors import BadRequest
from app.schemas.candidate import Candidate, Classification, Detection, Motion, Quality
from app.services import irsa
from app.services.data_source import angular_separation_deg
from app.services.engine import EngineRequest

ENGINE_VERSION = "spherex-peak-detect-0.1"
MATCH_RADIUS_ARCSEC = 12.3  # conservative provisional gate; not a motion model or orbit fit
DETECTION_SNR = 5.0
IMAGE_BUNIT = {"mjy/sr", "mjy sr-1", "mjy sr^-1", "mjy sr**-1"}
VARIANCE_BUNIT = {"(mjy/sr)^2", "(mjy/sr)**2", "mjy2/sr2", "mjy^2/sr^2"}
DETECTION_MASK_FLAGS = (*irsa.DISPLAY_BAD_FLAGS, "DICHROIC", "NONLINEAR", "PERSIST", "OUTLIER",
                        "BLOOM", "CROSSTALK", "GHOST", "GHOST_FPA", "GHOST_EXT", "STREAK",
                        "SNOWBALL", "HALO", *irsa.WARN_FLAGS)


def _unit(header) -> str:
    return " ".join(str(header.get("BUNIT", "")).strip().lower().split()).replace(" / ", "/")


def _valid_wcs(header):
    try:
        wcs = irsa._quiet_wcs(header).celestial
        # Reject empty/non-celestial WCS objects before calling pixel_to_world_values.
        if wcs.pixel_n_dim != 2 or wcs.world_n_dim != 2:
            return None
        probe = wcs.pixel_to_world_values(1.0, 1.0)
        if not all(math.isfinite(float(v)) for v in probe):
            return None
        return wcs
    except Exception:
        return None


def _mad_sigma(values: np.ndarray) -> float | None:
    finite = values[np.isfinite(values)]
    if finite.size < 16:
        return None
    median = float(np.median(finite))
    sigma = 1.4826 * float(np.median(np.abs(finite - median)))
    return sigma if math.isfinite(sigma) and sigma > 0 else None


def _peaks(data: np.ndarray, mask: np.ndarray, variance: np.ndarray | None,
           background_mask: np.ndarray | None = None) -> list[tuple[int, int, float, str]]:
    """Return isolated 3x3 local maxima with a measured pixel SNR >= threshold."""
    if data.ndim != 2 or min(data.shape) < 7:
        return []
    valid = np.isfinite(data) & ~mask
    bg_valid = valid if background_mask is None else valid & ~background_mask
    global_background = float(np.median(data[bg_valid])) if bg_valid.any() else 0.0
    noise = _mad_sigma(data[bg_valid] - global_background)
    if noise is None and variance is None:
        return []

    h, w = data.shape
    peaks: list[tuple[int, int, float, str]] = []
    for y in range(2, h - 2):
        for x in range(2, w - 2):
            if not valid[y, x]:
                continue
            # A 5x5 annulus supplies a local background without the source core.
            ring = data[y - 2:y + 3, x - 2:x + 3].copy()
            ring_valid = bg_valid[y - 2:y + 3, x - 2:x + 3].copy()
            ring_valid[1:4, 1:4] = False
            if ring_valid.sum() < 8:
                continue
            local_background = float(np.median(ring[ring_valid]))
            signal = float(data[y, x] - local_background)
            sigma = noise
            snr_method = "mad_global_noise"
            if variance is not None:
                v = float(variance[y, x])
                if math.isfinite(v) and v > 0:
                    sigma = math.sqrt(v)
                    snr_method = "variance_pixel_sigma"
            if sigma is None or sigma <= 0:
                continue
            snr = signal / sigma
            if snr < DETECTION_SNR:
                continue
            neighborhood = data[y - 1:y + 2, x - 1:x + 2]
            neighborhood_valid = valid[y - 1:y + 2, x - 1:x + 2]
            if not neighborhood_valid.any() or data[y, x] < np.max(neighborhood[neighborhood_valid]):
                continue
            peaks.append((y, x, snr, snr_method))

    # Deterministic non-maximum suppression; keep the stronger peak within a 3x3 patch.
    peaks.sort(key=lambda p: p[2], reverse=True)
    kept: list[tuple[int, int, float, str]] = []
    for peak in peaks:
        if all(max(abs(peak[0] - other[0]), abs(peak[1] - other[1])) > 1 for other in kept):
            kept.append(peak)
    return kept


def _frame_detections(frame, request: EngineRequest) -> list[tuple[Detection, list[str], dict]]:
    with irsa.open_fits(frame.fits_path.read_bytes()) as hdul:
        if "IMAGE" not in hdul:
            raise BadRequest(f"FITS observation {frame.observation_id} has no IMAGE plane")
        image_hdu = hdul["IMAGE"]
        image = np.asarray(image_hdu.data, dtype=float)
        if image.ndim != 2 or min(image.shape) < 7:
            raise BadRequest(f"FITS observation {frame.observation_id} has an invalid IMAGE shape")
        if _unit(image_hdu.header) not in IMAGE_BUNIT:
            # Do not apply a threshold with unverified units. Surface this frame as unusable.
            raise BadRequest(f"FITS observation {frame.observation_id} IMAGE BUNIT is missing or incompatible")
        # Keep IMAGE untouched. ZODI is a model plane and IRSA's spectrophotometry tool does not
        # use it; the local annulus below estimates the detection background from IMAGE itself.
        flags = np.asarray(hdul["FLAGS"].data) if "FLAGS" in hdul else None
        if flags is not None and flags.shape != image.shape:
            flags = None
        planes = irsa.flag_planes(hdul)
        bad_bits = 0
        for name in DETECTION_MASK_FLAGS:
            bad_bits |= planes.get(name, 0)
        mask = ~np.isfinite(image)
        transient = np.zeros(image.shape, dtype=bool)
        if flags is not None and bad_bits:
            mask |= (flags.astype(np.int64) & bad_bits) != 0
        if flags is not None and planes.get("TRANSIENT", 0):
            transient = (flags.astype(np.int64) & planes["TRANSIENT"]) != 0
        variance = None
        if "VARIANCE" in hdul:
            var_hdu = hdul["VARIANCE"]
            value = np.asarray(var_hdu.data, dtype=float)
            if value.shape == image.shape and _unit(var_hdu.header) in VARIANCE_BUNIT:
                variance = value
        wcs = _valid_wcs(image_hdu.header)
        if wcs is None:
            raise BadRequest(f"FITS observation {frame.observation_id} has missing or invalid celestial WCS")
        # SOURCE is an informational pipeline bit, not a bad-pixel mask. On real
        # SPHEREx cutouts it can cover most of the image; excluding it from the
        # local background would leave no usable annulus and suppress all peaks.
        peaks = _peaks(image, mask, variance)
        output = []
        for y, x, snr, snr_method in peaks:
            ra, dec = map(float, wcs.pixel_to_world_values(x, y))
            if not (math.isfinite(ra) and math.isfinite(dec)):
                continue
            if angular_separation_deg(request.ra_deg, request.dec_deg, ra, dec) > request.radius_deg:
                continue
            flags_out: list[str] = []
            nearby = transient[max(0, y - 1):y + 2, max(0, x - 1):x + 2]
            if nearby.any():
                flags_out.append("near_transient_pixels")
            if y < 3 or x < 3 or y >= image.shape[0] - 3 or x >= image.shape[1] - 3:
                flags_out.append("edge_of_image")
            detection = Detection(
                observation_id=frame.observation_id,
                # Provenance of THIS frame, never inferred from another detection (contract 0.2).
                release=frame.release,
                processing_version=frame.processing_version,
                source_file=frame.source_file,
                archive_id=frame.archive_id,
                observation_time=frame.obs_time,
                band=frame.band,
                wavelength_um=frame.wavelength_um,
                bandwidth_um=frame.bandwidth_um,
                ra_deg=ra,
                dec_deg=dec,
                snr=round(snr, 2),
                # Deliberately null: this detector has not performed calibrated photometry.
                flux=None,
                flux_error=None,
                flux_unit=None,
                quality_flags=flags_out,
            )
            output.append((detection, flags_out, {"x_pixel": x, "y_pixel": y, "peak_pixel_snr": round(snr, 2),
                                                  "snr_method": snr_method,
                                                  "variance_available": variance is not None,
                                                  "flags_available": flags is not None,
                                                  "zodi_subtracted": False}))
        return output


def _distance_arcsec(a: Detection, b: Detection) -> float:
    return angular_separation_deg(a.ra_deg, a.dec_deg, b.ra_deg, b.dec_deg) * 3600


def _motion(detections: list[Detection]) -> Motion | None:
    if len(detections) < 3:
        return None
    first, last = detections[0], detections[-1]
    times = [d.observation_time for d in detections]
    if any(t.tzinfo is None or t.utcoffset() != timedelta(0) for t in times):
        return None
    elapsed_days = np.asarray([(t - times[0]).total_seconds() / 86400 for t in times])
    if np.any(np.diff(elapsed_days) <= 0):
        return None
    dec_mid = math.radians((first.dec_deg + last.dec_deg) / 2)
    x = np.asarray([((d.ra_deg - first.ra_deg + 180) % 360 - 180) * math.cos(dec_mid) * 3600 for d in detections])
    y = np.asarray([(d.dec_deg - first.dec_deg) * 3600 for d in detections])
    fit_x = np.polyval(np.polyfit(elapsed_days, x, 1), elapsed_days)
    fit_y = np.polyval(np.polyfit(elapsed_days, y, 1), elapsed_days)
    # Reject a track whose intermediate positions deviate by over one nominal detector pixel.
    # This is a provisional consistency gate, not an astrometric uncertainty estimate.
    if np.max(np.hypot(x - fit_x, y - fit_y)) > 6.15:
        return None
    dra, ddec = float(x[-1] - x[0]), float(y[-1] - y[0])
    distance = math.hypot(dra, ddec)
    days = elapsed_days[-1]
    if days <= 0:
        return None
    return Motion(
        delta_ra_arcsec=round(dra, 3), delta_dec_arcsec=round(ddec, 3),
        angular_displacement_arcsec=round(distance, 3),
        angular_speed_arcsec_per_day=round(distance / days, 4) if days > 0 else None,
        position_angle_deg=round(math.degrees(math.atan2(dra, ddec)) % 360, 1) if distance else None,
    )


def _known_match(detection: Detection, known_objects: Iterable) -> str | None:
    matches = []
    for obj in known_objects:
        if abs((detection.observation_time - obj.epoch_utc).total_seconds()) > 180:
            continue
        distance = angular_separation_deg(detection.ra_deg, detection.dec_deg, obj.ra_deg, obj.dec_deg) * 3600
        if distance <= max(MATCH_RADIUS_ARCSEC, obj.uncertainty_arcsec or 0):
            matches.append((distance, obj.name))
    return min(matches)[1] if matches else None


class SourceDetectionEngine:
    """Thresholded pixel-peak detections associated across supplied FITS epochs."""

    version = ENGINE_VERSION

    def detect(self, request: EngineRequest) -> list[Candidate]:
        tracks: list[dict] = []
        for frame in sorted(request.frames, key=lambda f: f.obs_time):
            frame_sources = _frame_detections(frame, request)
            unmatched = set(range(len(tracks)))
            for detection, qflags, measurement in frame_sources:
                options = [(_distance_arcsec(detection, track["detections"][-1][0]), i)
                           for i, track in enumerate(tracks) if i in unmatched]
                options = [item for item in options if item[0] <= MATCH_RADIUS_ARCSEC]
                if options:
                    options.sort()
                    # Refuse a near tie: one detection could plausibly belong to either track.
                    best_distance, index = options[0]
                    if len(options) > 1 and options[1][0] - best_distance <= 1.0:
                        tracks.append({"detections": [(detection, qflags, measurement)], "ambiguous": True})
                        continue
                    tracks[index]["detections"].append((detection, qflags, measurement))
                    unmatched.remove(index)
                else:
                    tracks.append({"detections": [(detection, qflags, measurement)], "ambiguous": False})

        candidates = []
        for track in tracks:
            rows = sorted(track["detections"], key=lambda row: row[0].observation_time)
            detections = [r[0] for r in rows]
            flags = sorted({flag for _, q, _ in rows for flag in q})
            known = None
            for detection in detections:
                known = _known_match(detection, request.known_objects)
                if known:
                    break
            # Positional tracks are not enough for a motion estimate when the association was ambiguous.
            displacement = None if track.get("ambiguous") else _motion(detections)
            if displacement and displacement.angular_displacement_arcsec and displacement.angular_displacement_arcsec >= 6.15:
                kind = "possible_moving_object"
            elif displacement and displacement.angular_displacement_arcsec:
                kind = "sub_pixel_motion"
            else:
                kind = "unclassified"
            if len(detections) < 3 or displacement is None:
                flags.append("insufficient_epochs")
            candidate_id = "cand-" + "-".join(d.observation_id for d in detections[:3]) + f"-{round(detections[0].ra_deg * 1e5)}-{round(detections[0].dec_deg * 1e5)}"
            candidates.append(Candidate(
                candidate_id=candidate_id,
                observation_ids=list(dict.fromkeys(d.observation_id for d in detections)),
                detections=detections,
                motion=displacement,
                classification=Classification(candidate_type=kind,
                    method="3x3 local pixel peak; SNR from VARIANCE when valid, otherwise robust image MAD; positional association only"),
                quality=Quality(data_quality="degraded" if flags else "unknown", insufficient_evidence=displacement is None),
                # A positional match is a review hint, not independent validation.
                status="pending_validation",
                known_match=known,
                # data_release is left out: the contract derives it from every detection ("DR1+QR3").
                engine_version=self.version,
                quality_flags=flags,
                evidence={"detection_threshold_snr": DETECTION_SNR, "association_radius_arcsec": MATCH_RADIUS_ARCSEC,
                          "photometry": None, "association_ambiguous": bool(track.get("ambiguous")),
                          "motion_fit_gate_arcsec": 6.15,
                          "measurements": [m for _, _, m in rows]},
                is_mock=False,
            ))
        return sorted(candidates, key=lambda c: (-((c.median_snr or 0)), c.candidate_id))
