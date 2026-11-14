"""A coarse real spectrum at one sky position, for the Learning lab.

For each requested SPHEREx image: the mean surface brightness of the 3x3 pixels at the centre of the
north-up cutout (zodiacal light removed), at that image's own wavelength (CWAVE calibration when
available). The uncertainty is the scatter of those 9 pixels divided by 3. This is surface brightness
in MJy/sr at a spot, not calibrated point-source photometry.
"""
from __future__ import annotations

from typing import Annotated

import numpy as np
from fastapi import APIRouter, Depends, Query

from app.errors import ApiError, BadRequest
from app.services.data_source import DataSource, get_data_source

router = APIRouter(tags=["spectrum"])


@router.get("/spectrum")
def spectrum(
    ra: Annotated[float, Query(ge=0, lt=360)],
    dec: Annotated[float, Query(ge=-90, le=90)],
    ids: Annotated[str, Query(description="Comma-separated observation ids (from /api/search)")],
    size: Annotated[float, Query(gt=0, le=1800)] = 300,
    ds: DataSource = Depends(get_data_source),
) -> dict:
    wanted = [i for i in ids.split(",") if i][:24]
    if not wanted:
        raise BadRequest("Give at least one observation id.")
    points, skipped = [], []
    for oid in wanted:
        try:
            cut = ds.get_cutout(oid, ra, dec, size)
        except ApiError as e:
            skipped.append({"observation_id": oid, "reason": e.message}); continue
        data = np.asarray(cut.data, dtype=float)
        cy, cx = data.shape[0] // 2, data.shape[1] // 2
        box = data[max(0, cy - 1):cy + 2, max(0, cx - 1):cx + 2]
        good = box[np.isfinite(box)]
        o = cut.observation
        if not good.size or o.wavelength_um is None:
            skipped.append({"observation_id": oid, "reason": "no valid centre pixels or wavelength"}); continue
        points.append({"observation_id": oid, "band": o.band, "obs_time": o.obs_time, "release": o.release,
                       "wavelength_um": round(float(o.wavelength_um), 4),
                       "bandwidth_um": o.bandwidth_um, "wavelength_source": o.wavelength_source,
                       "surface_brightness": float(np.mean(good)),
                       "uncertainty": float(np.std(good) / np.sqrt(good.size)) if good.size > 1 else None,
                       # Fewer than 9 valid pixels = part of the centre is saturated or flagged: value unreliable.
                       "valid_pixels": int(good.size), "saturated": bool(good.size < box.size)})
    points.sort(key=lambda p: p["wavelength_um"])
    return {"center": {"ra": ra, "dec": dec}, "unit": "MJy/sr", "points": points, "skipped": skipped,
            "method": "mean of the central 3x3 pixels of each north-up cutout, zodiacal light removed; not point-source photometry"}
