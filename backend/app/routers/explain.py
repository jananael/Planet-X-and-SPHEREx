from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas import ErrorResponse
from app.schemas.explain import ExplainResponse
from app.services.data_source import DataSource, get_data_source
from app.services.explain import explain

router = APIRouter(tags=["explain"], responses={400: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})


@router.get("/explain", response_model=ExplainResponse)
def get_explain(
    ra: Annotated[float, Query(ge=0, lt=360, description="Centre of the images, degrees")],
    dec: Annotated[float, Query(ge=-90, le=90)],
    ids: Annotated[str, Query(description="Comma-separated observation ids of the frames shown")],
    size: Annotated[float, Query(ge=30, le=1800, description="Image side, arcsec (same as the image requests)")] = 300,
    ds: DataSource = Depends(get_data_source),
) -> ExplainResponse:
    """Plain-language facts for the frames on screen: known object, predicted positions, motion. Not a detection."""
    return explain(ds, ra, dec, size, [i for i in ids.split(",") if i])
