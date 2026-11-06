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


class TargetList(BaseModel):
    targets: list[Target]
    count: int
