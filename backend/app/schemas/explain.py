"""Facts for the "Explain it simply" player. Every value comes from real metadata or a stated prediction."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

StoryKind = Literal["moves", "creeps", "brightness", "no_known_object"]


class ExplainObject(BaseModel):
    id: str
    name: str
    type: str
    description: str
    validation_status: str
    position_source: str = Field(description="Where the per-frame positions come from, e.g. 'JPL Horizons'")


class ExplainFrame(BaseModel):
    observation_id: str
    obs_time: datetime
    band: str
    release: str
    # Predicted position of the object in this frame, as a fraction of the image (0..1, x to the right,
    # y down, north up). Null when no known object is predicted here.
    x: float | None = None
    y: float | None = None
    inside: bool = Field(default=False, description="Predicted position falls inside the image")


class ExplainResponse(BaseModel):
    kind: StoryKind
    object: ExplainObject | None
    frames: list[ExplainFrame]
    image_size_arcsec: float
    pixel_scale_arcsec: float
    elapsed_hours: float | None = Field(description="First to last frame")
    displacement_arcsec: float | None = Field(description="Predicted motion of the object, first to last frame")
    displacement_pixels: float | None
    direction: str | None = Field(description="Compass direction of the motion, e.g. 'north-east'")
    notes: list[str] = Field(default_factory=list, description="Limits of this explanation, shown to the user")
    is_mock: bool
