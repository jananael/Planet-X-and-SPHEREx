from typing import Literal

from pydantic import BaseModel, Field

TargetType = Literal["asteroid", "comet", "brown_dwarf", "star", "variable"]
# verified: shown in real SPHEREx images; pending: not checked yet; challenging: data exist but
# detection is not guaranteed; not_supported: no usable SPHEREx coverage.
ValidationStatus = Literal["verified", "pending", "challenging", "not_supported"]


class Target(BaseModel):
    id: str
    name: str
    type: TargetType
    ra: float = Field(ge=0, lt=360, description="Reference RA, degrees (ICRS). For moving objects: position at first observation.")
    dec: float = Field(ge=-90, le=90, description="Reference Dec, degrees (ICRS)")
    description: str
    position_epoch: float | None = Field(default=None, description="Epoch of ra/dec, decimal year (2026.0 once propagated)")
    catalog_motion: "CatalogMotion | None" = Field(
        default=None, description="Known proper motion from an external catalogue. NOT a SPHEREx measurement.")
    validation_status: ValidationStatus = Field(
        default="pending", description="Is this target actually supported by SPHEREx data?")
    validation_note: str | None = None
    recommended_size_arcsec: int = Field(default=300, description="Starting cutout size for the UI (user can change it)")


class CatalogMotion(BaseModel):
    """Catalogue proper motion (kept apart from motion measured in SPHEREx images)."""

    pm_ra_cosdec_mas_yr: float
    pm_dec_mas_yr: float
    reference_epoch: float = Field(description="Epoch the proper motion / position refers to, decimal year")
    source_catalog: str


Target.model_rebuild()


class TargetList(BaseModel):
    targets: list[Target]
    count: int
