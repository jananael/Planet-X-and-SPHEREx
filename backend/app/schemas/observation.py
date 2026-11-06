from datetime import datetime

from pydantic import BaseModel, Field


class Footprint(BaseModel):
    """Approximate sky coverage of the image (circle). v0 simplification of the real polygon."""

    ra: float
    dec: float
    radius_deg: float


class Observation(BaseModel):
    id: str
    target_id: str | None = Field(description="null when the image isn't tied to a demo target")
    obs_time: datetime = Field(description="UTC, ISO-8601")
    mjd: float = Field(description="Modified Julian Date (UTC)")
    wavelength_um: float = Field(description="Wavelength at the cutout centre (varies across a SPHEREx image)")
    band: str = Field(examples=["D3"], description="SPHEREx detector D1..D6")
    release: str = Field(examples=["QR2"])
    source_file: str = Field(description="Archive file name, shown in the UI as provenance")
    image_url: str = Field(description="Relative URL of the PNG cutout endpoint")
    footprint: Footprint | None = None


class SearchQuery(BaseModel):
    ra: float
    dec: float
    radius: float


class ObservationSearch(BaseModel):
    query: SearchQuery
    observations: list[Observation]
    count: int
