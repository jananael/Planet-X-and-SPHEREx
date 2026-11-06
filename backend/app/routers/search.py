from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas import ErrorResponse, ObservationSearch, SearchQuery
from app.services.data_source import DataSource, get_data_source

router = APIRouter(tags=["search"], responses={400: {"model": ErrorResponse}})


@router.get("/search", response_model=ObservationSearch)
def search_observations(
    ra: Annotated[float, Query(ge=0, lt=360, description="Right ascension, degrees (ICRS)")],
    dec: Annotated[float, Query(ge=-90, le=90, description="Declination, degrees")],
    radius: Annotated[float, Query(ge=0, le=5, description="Extra search radius, degrees (0 = must cover the point)")] = 0,
    ds: DataSource = Depends(get_data_source),
) -> ObservationSearch:
    """All observations whose image covers (ra, dec), oldest first. Empty list = no coverage (still 200)."""
    obs = ds.search(ra, dec, radius)
    return ObservationSearch(query=SearchQuery(ra=ra, dec=dec, radius=radius), observations=obs, count=len(obs))
