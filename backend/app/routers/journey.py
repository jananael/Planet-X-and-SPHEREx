from pathlib import Path

from fastapi import APIRouter, Depends

from app.config import get_settings
from app.schemas import ErrorResponse
from app.services.data_source import DataSource, get_data_source
from app.services.journey import journey

router = APIRouter(tags=["journey"], responses={404: {"model": ErrorResponse}, 502: {"model": ErrorResponse}})


@router.get("/journey/{target_id}")
def get_journey(target_id: str, ds: DataSource = Depends(get_data_source)) -> dict:
    """The object's journey: Solar System positions, sky track and SPHEREx moments (JPL Horizons + inventory)."""
    target = next((t for t in ds.list_targets() if t.id == target_id), None)
    view = target.real_view.model_dump(mode="json") if target and target.real_view else None
    return journey(target_id, Path(get_settings().cache_dir) / "journey", view)
