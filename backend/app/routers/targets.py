from fastapi import APIRouter, Depends

from app.schemas import TargetList
from app.services.data_source import DataSource, get_data_source

router = APIRouter(tags=["targets"])


@router.get("/targets", response_model=TargetList)
def list_targets(ds: DataSource = Depends(get_data_source)) -> TargetList:
    targets = ds.list_targets()
    return TargetList(targets=targets, count=len(targets))
