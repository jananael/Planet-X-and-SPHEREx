from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.errors import BadRequest
from app.schemas import ErrorResponse, ObservationSearch, SearchQuery
from app.services.data_source import DataSource, get_data_source

router = APIRouter(tags=["search"], responses={400: {"model": ErrorResponse}})


@router.get("/search", response_model=ObservationSearch)
def search_observations(
    ra: Annotated[float, Query(ge=0, lt=360, description="Right ascension, degrees (ICRS)")],
    dec: Annotated[float, Query(ge=-90, le=90, description="Declination, degrees")],
    radius: Annotated[float, Query(ge=0, le=5, description="Extra search radius, degrees (0 = must cover the point)")] = 0,
    start: Annotated[datetime | None, Query(description="Only observations at/after this UTC time (ISO-8601)")] = None,
    end: Annotated[datetime | None, Query(description="Only observations at/before this UTC time (ISO-8601)")] = None,
    ds: DataSource = Depends(get_data_source),
) -> ObservationSearch:
    """All observations whose image covers (ra, dec), oldest first. Empty list = no coverage (still 200).
    start/end narrow it to a time window: needed for moving objects, which are only there briefly."""
    def utc(t: datetime | None) -> datetime | None:
        return t.replace(tzinfo=timezone.utc) if t is not None and t.tzinfo is None else t
    start, end = utc(start), utc(end)
    if start and end and end < start:
        raise BadRequest("end must be after start")
    obs = [o for o in ds.search(ra, dec, radius)
           if (start is None or o.obs_time >= start) and (end is None or o.obs_time <= end)]
    return ObservationSearch(query=SearchQuery(ra=ra, dec=dec, radius=radius), observations=obs, count=len(obs))
