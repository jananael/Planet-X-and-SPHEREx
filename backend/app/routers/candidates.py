from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas import ErrorResponse
from app.schemas.candidate import Candidate, CandidateList
from app.services.data_source import DataSource, get_data_source

router = APIRouter(tags=["candidates"], responses={400: {"model": ErrorResponse}, 501: {"model": ErrorResponse}})


@router.get("/candidates", response_model=CandidateList)
def list_candidates(
    ra: Annotated[float, Query(ge=0, lt=360, description="Right ascension, degrees (ICRS)")],
    dec: Annotated[float, Query(ge=-90, le=90, description="Declination, degrees")],
    radius: Annotated[float, Query(gt=0, le=5, description="Search radius, degrees")] = 0.5,
    ds: DataSource = Depends(get_data_source),
) -> CandidateList:
    """Candidates from the science engine near (ra, dec). Mock data until the engine is connected."""
    found = ds.candidates(ra, dec, radius)
    return CandidateList(query={"ra": ra, "dec": dec, "radius": radius}, candidates=found, count=len(found))


@router.get("/candidates/{candidate_id}", response_model=Candidate, responses={404: {"model": ErrorResponse}})
def get_candidate(candidate_id: str, ds: DataSource = Depends(get_data_source)) -> Candidate:
    return ds.get_candidate(candidate_id)
