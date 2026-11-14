from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Query

from app.errors import BadRequest
from app.services.sky_catalogs import query_sky_objects

router = APIRouter(tags=["sky objects"])


@router.get("/sky-objects")
def sky_objects(
    ra: Annotated[float, Query(ge=0, lt=360)],
    dec: Annotated[float, Query(ge=-90, le=90)],
    radius_deg: Annotated[float, Query(gt=0, le=1)] = 0.5,
    epoch: datetime | None = None,
):
    """Return Gaia DR3 stars and SkyBoT solar-system ephemerides for one sky cone."""
    if epoch is None:
        epoch = datetime.now(timezone.utc)
    elif epoch.tzinfo is None:
        epoch = epoch.replace(tzinfo=timezone.utc)
    if epoch.year < 1889 or epoch.year > 2060:
        raise BadRequest("epoch must be within SkyBoT's supported range (1889–2060)")
    return query_sky_objects(ra, dec, radius_deg, epoch)
