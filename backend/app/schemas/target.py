from pydantic import BaseModel, Field

from .observation import Observation


class Target(BaseModel):
    id: str
    name: str
    ra: float = Field(ge=0, lt=360, description="Right ascension, degrees (ICRS/J2000)")
    dec: float = Field(ge=-90, le=90, description="Declination, degrees")
    observations: list[Observation] = []


class TargetList(BaseModel):
    targets: list[Target]
    count: int


class SearchResult(Target):
    distance_deg: float


class SearchQuery(BaseModel):
    ra: float
    dec: float
    radius: float


class SearchResponse(BaseModel):
    query: SearchQuery
    results: list[SearchResult]
    count: int
