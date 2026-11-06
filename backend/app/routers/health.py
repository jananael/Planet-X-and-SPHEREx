from fastapi import APIRouter

from app import __version__
from app.config import get_settings
from app.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", data_source=get_settings().data_source, version=__version__)
