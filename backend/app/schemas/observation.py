from pydantic import BaseModel, Field


class Observation(BaseModel):
    id: str
    survey: str = Field(examples=["neowise"])
    mjd: float = Field(description="Modified Julian Date (UTC)")
    band: str = Field(examples=["W2"])
    image_url: str


class ObservationDetail(Observation):
    target_id: str
