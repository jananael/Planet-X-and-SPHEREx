"""Re-run Y2 source-detection validation on named real SPHEREx DR1 exposures.

Run from backend with `python scripts/validate_source_detection_samples.py`. FITS cutouts are
cached under backend/.cache/y2-validation/ and summary JSON is written beside them.
"""
from __future__ import annotations

import csv
import json
import statistics
import time
from pathlib import Path

import numpy as np
from astropy.wcs import WCS

from app.services.data_source import angular_separation_deg
from app.services.engine import EngineFrame, EngineRequest
from app.services.irsa import fetch_cutout, flag_planes, open_fits, sia_search
from app.services.source_detection import _frame_detections

ROOT = Path(__file__).resolve().parents[2]
INVENTORIES = ROOT / "docs" / "inventory"
CACHE = ROOT / "backend" / ".cache" / "y2-validation"
SAMPLES = {
    "Vesta": (INVENTORIES / "vesta.csv", ["2026W29_1A_0138_4D2", "2026W29_1A_0163_1D2"]),
    "3I/ATLAS": (INVENTORIES / "3i-atlas.csv", ["2025W50_1A_0002_1D1", "2025W50_1A_0021_1D1"]),
    "Barnard's Star": (INVENTORIES / "barnards-star.csv", ["2025W33_2C_0321_1D6"]),
}


def inventory_rows(path: Path) -> dict[str, dict]:
    with path.open(newline="", encoding="utf-8") as stream:
        return {row["image_id"]: row for row in csv.DictReader(stream)}


def validate_one(target_name: str, inventory: dict, image_id: str) -> dict:
    row = inventory[image_id]
    ra, dec = float(row["ra"]), float(row["dec"])
    collection = "spherex_dr1" if row["release"] == "DR1" else "spherex_qr3"
    records = sia_search(ra, dec, 0.6, collection)
    record = next((rec for rec in records if rec.id == image_id), None)
    if record is None:
        raise RuntimeError(f"IRSA did not return requested observation {image_id} ({collection})")

    CACHE.mkdir(parents=True, exist_ok=True)
    fits_path = CACHE / f"{image_id}.fits"
    if not fits_path.exists():
        fits_path.write_bytes(fetch_cutout(record.access_url, ra, dec, 180))
    with open_fits(fits_path.read_bytes()) as hdul:
        image = np.asarray(hdul["IMAGE"].data, dtype=float)
        variance = np.asarray(hdul["VARIANCE"].data, dtype=float) if "VARIANCE" in hdul else None
        flags = np.asarray(hdul["FLAGS"].data) if "FLAGS" in hdul else None
        header = hdul["IMAGE"].header.copy()
        planes = flag_planes(hdul)
        utc_mid = header.get("DATE-AVG") or record.obs_time.isoformat()
        wcs = WCS(header).celestial
        x, y = wcs.world_to_pixel_values(ra, dec)
        x, y = int(round(float(x))), int(round(float(y)))
        if flags is not None and 0 <= y < flags.shape[0] and 0 <= x < flags.shape[1]:
            raw = int(flags[y, x])
            target_flags = [name for name, bit in planes.items() if raw & bit]
        else:
            target_flags = None
        target_pixel = {
            "x": x, "y": y,
            "value": float(image[y, x]) if 0 <= y < image.shape[0] and 0 <= x < image.shape[1] and np.isfinite(image[y, x]) else None,
            "flags": target_flags,
        }
        variance_unit = hdul["VARIANCE"].header.get("BUNIT") if "VARIANCE" in hdul else None
        flags_present = flags is not None
        flagged_pixel_count = int(np.count_nonzero(flags)) if flags_present else None

    frame = EngineFrame(image_id, fits_path, record.obs_time, row["band"], record.release,
                        record.processing_version, None, None)
    request = EngineRequest(ra, dec, 0.05, [frame])  # one epoch: no cross-epoch association
    start = time.perf_counter()
    detections = _frame_detections(frame, request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    snrs = [d.snr for d, _, _ in detections]
    separations = [angular_separation_deg(ra, dec, d.ra_deg, d.dec_deg) * 3600 for d, _, _ in detections]
    nearest = int(np.argmin(separations)) if separations else None
    return {
        "target": target_name,
        "observation_id": image_id,
        "release": record.release,
        "processing_version": record.processing_version,
        "band": row["band"],
        "utc_mid": utc_mid,
        "shape": list(image.shape),
        "image_bunit": header.get("BUNIT"),
        "variance_bunit": variance_unit,
        "flags_available": flags_present,
        "flagged_pixel_count": flagged_pixel_count,
        "detection_count": len(detections),
        "snr_min": min(snrs) if snrs else None,
        "snr_median": statistics.median(snrs) if snrs else None,
        "snr_p95": float(np.percentile(snrs, 95)) if snrs else None,
        "snr_max": max(snrs) if snrs else None,
        "nearest_peak_to_inventory_position_arcsec": separations[nearest] if nearest is not None else None,
        "nearest_peak_snr": detections[nearest][0].snr if nearest is not None else None,
        "inventory_position_pixel": target_pixel,
        "near_transient_peaks": [measurement for _, qflags, measurement in detections
                                  if "near_transient_pixels" in qflags],
        "detection_runtime_ms": round(elapsed_ms, 2),
        "fits_cache_file": str(fits_path),
    }


def main() -> None:
    results = []
    for target, (path, image_ids) in SAMPLES.items():
        inventory = inventory_rows(path)
        for image_id in image_ids:
            result = validate_one(target, inventory, image_id)
            results.append(result)
            print(json.dumps(result, sort_keys=True))
    output = CACHE / "real-validation.json"
    output.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
