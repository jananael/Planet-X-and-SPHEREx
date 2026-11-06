from typing import Literal

from pydantic import BaseModel, Field

TargetType = Literal["asteroid", "comet", "brown_dwarf", "star", "variable"]


class Target(BaseModel):
    id: str
    name: str
    type: TargetType
    ra: float = Field(ge=0, lt=360, description="Reference RA, degrees (ICRS). For moving objects: position at first observation.")
    dec: float = Field(ge=-90, le=90, description="Reference Dec, degrees (ICRS)")
    description: str
    # Proper motion for fixed stars / brown dwarfs (None for solar-system objects).
    pm_ra: float | None = Field(default=None, description="Proper motion in RA * cos(Dec), arcsec/yr")
    pm_dec: float | None = Field(default=None, description="Proper motion in Dec, arcsec/yr")
    epoch: float | None = Field(default=None, description="Epoch of ra/dec, decimal year (e.g. 2000.0)")


class TargetList(BaseModel):
    targets: list[Target]
    count: int
