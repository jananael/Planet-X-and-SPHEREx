from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from app.errors import BadRequest
from app.schemas import ErrorResponse, Observation
from app.services import image_service
from app.services.data_source import DataSource, get_data_source

router = APIRouter(tags=["observations"], responses={404: {"model": ErrorResponse}})

# Provenance + stretch info sent with every PNG. Exposed via CORS in main.py.
IMAGE_HEADERS = (
    "X-Source-File", "X-Obs-Time", "X-Wavelength-Um", "X-Band", "X-Release",
    "X-Cutout-Ra", "X-Cutout-Dec", "X-Stretch-Vmin", "X-Stretch-Vmax",
    "X-Bandwidth-Um", "X-Wavelength-Source", "X-Processing-Version", "X-Repaired-Pixels", "X-Repaired-Flags",
    "X-Transient-Pixels",
)


@router.get("/observations/{observation_id}", response_model=Observation)
def get_observation(observation_id: str, ds: DataSource = Depends(get_data_source)) -> Observation:
    return ds.get_observation(observation_id)


@router.get(
    "/observations/{observation_id}/image",
    response_class=Response,
    responses={
        200: {"content": {"image/png": {}}, "description": "PNG cutout"},
        400: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
def get_observation_image(
    observation_id: str,
    ra: Annotated[float | None, Query(ge=0, lt=360, description="Cutout centre RA (deg). Default: target position")] = None,
    dec: Annotated[float | None, Query(ge=-90, le=90, description="Cutout centre Dec (deg)")] = None,
    size: Annotated[float, Query(ge=30, le=1800, description="Cutout side, arcsec")] = 300,
    stretch: Annotated[image_service.Stretch, Query(description="Display stretch")] = "asinh",
    vmin: Annotated[float | None, Query(description="Fix stretch limits (reuse X-Stretch-* from the first epoch)")] = None,
    vmax: Annotated[float | None, Query()] = None,
    ds: DataSource = Depends(get_data_source),
) -> Response:
    if (ra is None) != (dec is None):
        raise BadRequest("Pass both ra and dec, or neither")
    if (vmin is None) != (vmax is None):
        raise BadRequest("Pass both vmin and vmax, or neither")
    if vmin is not None and vmax <= vmin:
        raise BadRequest("vmax must be greater than vmin")

    cutout = ds.get_cutout(observation_id, ra, dec, size)
    limits = (vmin, vmax) if vmin is not None else None
    png, (used_min, used_max) = image_service.to_png(cutout.data, stretch, limits)

    obs = cutout.observation
    headers = dict(zip(IMAGE_HEADERS, (
        obs.source_file, obs.obs_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "" if obs.wavelength_um is None else f"{obs.wavelength_um}", obs.band,
        obs.release, f"{cutout.ra:.6f}", f"{cutout.dec:.6f}", f"{used_min:.6g}", f"{used_max:.6g}",
        "" if obs.bandwidth_um is None else f"{obs.bandwidth_um}", obs.wavelength_source or "",
        obs.processing_version or "", str(cutout.repaired_pixels), ",".join(cutout.repaired_flags),
        "" if cutout.transient_pixels is None else str(cutout.transient_pixels),
    )))
    headers["Cache-Control"] = "public, max-age=3600"
    return Response(content=png, media_type="image/png", headers=headers)
