"""Conservative SPHEREx source detection and positional cross-matching.

This first engine intentionally reports peak-pixel SNR and sky positions only. It does
not claim calibrated photometry: flux remains null until the Tractor/solid-angle path is
available. It reads the cached science FITS, never display PNGs or repaired pixels.
"""
from __future__ import annotations

import math
from collections.abc import Iterable

import numpy as np

from app.schemas.candidate import Candidate, Classification, Detection, Motion, Quality
from app.services import irsa
from app.services.data_source import angular_separation_deg
from app.services.engine import EngineRequest

ENGINE_VERSION = "spherex-peak-detect-0.1"
MATCH_RADIUS_ARCSEC = 12.3  # two nominal SPHEREx pixels; a positional association, not an orbit fit
DETECTION_SNR = 5.0
MAX_DETECTIONS_PER_FRAME = 500


def _mad_sigma(values: np.ndarray) -> float | None:
    finite = values[np.isfinite(values)]
    if finite.size < 16:
        return None
    median = float(np.median(finite))
    sigma = 1.4826 * float(np.median(np.abs(finite - median)))
    return sigma if math.isfinite(sigma) and sigma > 0 else None


def _peaks(data: np.ndarray, mask: np.ndarray, variance: np.ndarray | None) -> list[tuple[int, int, float]]:
    """Return isolated 3x3 local maxima with a measured pixel SNR >= threshold."""
    if data.ndim != 2 or min(data.shape) < 7:
        return []
    valid = np.isfinite(data) & ~mask
    global_background = float(np.median(data[valid])) if valid.any() else 0.0
    noise = _mad_sigma(data[valid] - global_background)
    if noise is None and variance is None:
        return []

    h, w = data.shape
    peaks: list[tuple[int, int, float]] = []
    for y in range(2, h - 2):
        for x in range(2, w - 2):
            if not valid[y, x]:
                continue
            # A 5x5 annulus supplies a local background without the source core.
            ring = data[y - 2:y + 3, x - 2:x + 3].copy()
            ring_valid = valid[y - 2:y + 3, x - 2:x + 3].copy()
            ring_valid[1:4, 1:4] = False
            if ring_valid.sum() < 8:
                continue
            local_background = float(np.median(ring[ring_valid]))
            signal = float(data[y, x] - local_background)
            sigma = noise
            if variance is not None:
                v = float(variance[y, x])
                if math.isfinite(v) and v > 0:
                    sigma = math.sqrt(v)
            if sigma is None or sigma <= 0:
                continue
            snr = signal / sigma
            if snr < DETECTION_SNR:
                continue
            neighborhood = data[y - 1:y + 2, x - 1:x + 2]
            neighborhood_valid = valid[y - 1:y + 2, x - 1:x + 2]
            if not neighborhood_valid.any() or data[y, x] < np.max(neighborhood[neighborhood_valid]):
                continue
            peaks.append((y, x, snr))

    # Deterministic non-maximum suppression; keep the stronger peak within a 3x3 patch.
    peaks.sort(key=lambda p: p[2], reverse=True)
    kept: list[tuple[int, int, float]] = []
    for peak in peaks:
        if all(max(abs(peak[0] - other[0]), abs(peak[1] - other[1])) > 1 for other in kept):
            kept.append(peak)
        if len(kept) >= MAX_DETECTIONS_PER_FRAME:
            break
    return kept


def _frame_detections(frame, request: EngineRequest) -> list[tuple[Detection, list[str], dict]]:
    with irsa.open_fits(frame.fits_path.read_bytes()) as hdul:
        image = np.asarray(hdul["IMAGE"].data, dtype=float)
        if "ZODI" in hdul:
            image = image - np.asarray(hdul["ZODI"].data, dtype=float)
        flags = np.asarray(hdul["FLAGS"].data) if "FLAGS" in hdul else None
        planes = irsa.flag_planes(hdul)
        bad_names = (*irsa.DISPLAY_BAD_FLAGS, *irsa.WARN_FLAGS)
        bad_bits = 0
        for name in bad_names:
            bad_bits |= planes.get(name, 0)
        mask = ~np.isfinite(image)
        transient = np.zeros(image.shape, dtype=bool)
        if flags is not None and bad_bits:
            mask |= (flags.astype(np.int64) & bad_bits) != 0
        if flags is not None and planes.get("TRANSIENT", 0):
            transient = (flags.astype(np.int64) & planes["TRANSIENT"]) != 0

        variance = None
        if "VARIANCE" in hdul:
            value = np.asarray(hdul["VARIANCE"].data, dtype=float)
            if value.shape == image.shape:
                variance = value
        wcs = irsa._quiet_wcs(hdul["IMAGE"].header).celestial
        peaks = _peaks(image, mask, variance)
        output = []
        for y, x, snr in peaks:
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
            output.append((detection, flags_out, {"x_pixel": x, "y_pixel": y, "peak_pixel_snr": round(snr, 2)}))
        return output


def _distance_arcsec(a: Detection, b: Detection) -> float:
    return angular_separation_deg(a.ra_deg, a.dec_deg, b.ra_deg, b.dec_deg) * 3600


def _motion(detections: list[Detection]) -> Motion | None:
    if len(detections) < 2:
        return None
    first, last = detections[0], detections[-1]
    dec_mid = math.radians((first.dec_deg + last.dec_deg) / 2)
    dra = ((last.ra_deg - first.ra_deg + 180) % 360 - 180) * math.cos(dec_mid) * 3600
    ddec = (last.dec_deg - first.dec_deg) * 3600
    distance = math.hypot(dra, ddec)
    days = (last.observation_time - first.observation_time).total_seconds() / 86400
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
                    _, index = min(options)
                    tracks[index]["detections"].append((detection, qflags, measurement))
                    unmatched.remove(index)
                else:
                    tracks.append({"detections": [(detection, qflags, measurement)]})

        candidates = []
        for track in tracks:
            rows = sorted(track["detections"], key=lambda row: row[0].observation_time)
            detections = [r[0] for r in rows]
            flags = sorted({flag for _, q, _ in rows for flag in q})
            known = next((_known_match(d, request.known_objects) for d in detections
                          if _known_match(d, request.known_objects)), None)
            displacement = _motion(detections)
            if displacement and displacement.angular_displacement_arcsec and displacement.angular_displacement_arcsec >= 6.15:
                kind = "possible_moving_object"
            elif displacement and displacement.angular_displacement_arcsec:
                kind = "sub_pixel_motion"
            else:
                kind = "unclassified"
            if len(detections) < 2:
                flags.append("insufficient_epochs")
            candidate_id = "cand-" + "-".join(d.observation_id for d in detections[:3]) + f"-{round(detections[0].ra_deg * 1e5)}-{round(detections[0].dec_deg * 1e5)}"
            candidates.append(Candidate(
                candidate_id=candidate_id,
                observation_ids=list(dict.fromkeys(d.observation_id for d in detections)),
                detections=detections,
                motion=displacement,
                classification=Classification(candidate_type=kind,
                    method="3x3 local pixel peak; SNR from VARIANCE when valid, otherwise robust image MAD; positional association only"),
                quality=Quality(data_quality="degraded" if flags else "unknown", insufficient_evidence=len(detections) < 2),
                # A positional match is a review hint, not independent validation.
                status="pending_validation",
                known_match=known,
                data_release=next((f.release for f in request.frames
                                   if f.observation_id == detections[0].observation_id), None),
                engine_version=self.version,
                quality_flags=flags,
                evidence={"detection_threshold_snr": DETECTION_SNR, "association_radius_arcsec": MATCH_RADIUS_ARCSEC,
                          "photometry": None, "measurements": [m for _, _, m in rows]},
                is_mock=False,
            ))
        return sorted(candidates, key=lambda c: (-((c.median_snr or 0)), c.candidate_id))
