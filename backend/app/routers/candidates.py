from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.schemas import ErrorResponse
from app.schemas.candidate import Candidate, CandidateAnalysis, CandidateList
from app.services.data_source import DataSource, get_data_source

router = APIRouter(tags=["candidates"], responses={400: {"model": ErrorResponse}, 501: {"model": ErrorResponse}})


@router.get("/candidates", response_model=CandidateList)
def list_candidates(
    ra: Annotated[float, Query(ge=0, lt=360, description="Right ascension, degrees (ICRS)")],
    dec: Annotated[float, Query(ge=-90, le=90, description="Declination, degrees")],
    radius: Annotated[float, Query(gt=0, le=5, description="Search radius, degrees")] = 0.5,
    band: Annotated[str | None, Query(pattern="^D[1-6]$", description="SPHEREx band to analyze")]=None,
    pipeline: Annotated[str | None, Query(pattern="^v\\d+$", description="Processing pipeline, e.g. v27")]=None,
    ds: DataSource = Depends(get_data_source),
) -> CandidateList:
    """Candidates from mock fixtures or the real FITS detection engine."""
    found = ds.candidates(ra, dec, radius, band=band, pipeline=pipeline)
    return CandidateList(query={"ra": ra, "dec": dec, "radius": radius,
                                "band": band, "pipeline": pipeline}, candidates=found, count=len(found),
                         analysis=CandidateAnalysis(state="completed", data_source=ds.name))


@router.get("/candidates/{candidate_id}", response_model=Candidate, responses={404: {"model": ErrorResponse}})
def get_candidate(candidate_id: str, ds: DataSource = Depends(get_data_source)) -> Candidate:
    return ds.get_candidate(candidate_id)
