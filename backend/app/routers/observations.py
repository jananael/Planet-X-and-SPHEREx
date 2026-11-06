from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse

from app.schemas import ErrorResponse, ObservationDetail
from app.services.data_source import DataSource, get_data_source

router = APIRouter(tags=["observations"], responses={404: {"model": ErrorResponse}})


@router.get("/observations/{observation_id}", response_model=ObservationDetail)
def get_observation(observation_id: str, ds: DataSource = Depends(get_data_source)) -> ObservationDetail:
    return ds.get_observation(observation_id)


@router.get(
    "/observations/{observation_id}/image",
    response_class=RedirectResponse,
    status_code=307,
    responses={307: {"description": "Redirect to the observation's image_url"}},
)
def get_observation_image(observation_id: str, ds: DataSource = Depends(get_data_source)):
    return RedirectResponse(ds.get_observation(observation_id).image_url, status_code=307)
