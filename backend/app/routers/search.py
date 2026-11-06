from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas import ErrorResponse, SearchQuery, SearchResponse
from app.services.data_source import DataSource, get_data_source

router = APIRouter(tags=["search"], responses={422: {"model": ErrorResponse}})


@router.get("/search", response_model=SearchResponse)
def cone_search(
    ra: Annotated[float, Query(ge=0, lt=360, description="Right ascension, degrees")],
    dec: Annotated[float, Query(ge=-90, le=90, description="Declination, degrees")],
    radius: Annotated[float, Query(gt=0, le=10, description="Search radius, degrees")] = 0.1,
    ds: DataSource = Depends(get_data_source),
) -> SearchResponse:
    results = ds.search(ra, dec, radius)
    return SearchResponse(
        query=SearchQuery(ra=ra, dec=dec, radius=radius), results=results, count=len(results)
    )
