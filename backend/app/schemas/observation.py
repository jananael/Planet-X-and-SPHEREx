from datetime import datetime

from pydantic import BaseModel, Field


class Footprint(BaseModel):
    """Sky coverage of the image. `polygon` is the real footprint (from the archive's s_region) when
    known; the circle (centre + radius) is only an approximation kept for compatibility."""

    ra: float
    dec: float
    radius_deg: float
    polygon: list[tuple[float, float]] | None = Field(default=None, description="[[ra, dec], ...] in degrees, ICRS")


class PixelRef(BaseModel):
    """Pixel where a per-pixel quantity was read. frame='cutout': 0-based pixel in the IRSA cutout FITS."""

    x: float
    y: float
    frame: str = "cutout"


class Observation(BaseModel):
    id: str
    target_id: str | None = Field(description="null when the image isn't tied to a demo target")
    obs_time: datetime = Field(description="UTC, ISO-8601")
    mjd: float = Field(description="Modified Julian Date (UTC)")
    wavelength_um: float | None = Field(
        description="Wavelength at the cutout centre (varies across a SPHEREx image). "
                    "Real data: null in search results (needs the image header); the /image response "
                    "carries it in X-Wavelength-Um."
    )
    wavelength_range_um: tuple[float, float] | None = Field(
        default=None, description="Whole-detector wavelength range, NOT the value at the target"
    )
    bandwidth_um: float | None = Field(default=None, description="Spectral bandwidth at the target pixel")
    wavelength_source: str | None = Field(
        default=None, description="Where wavelength/bandwidth come from: 'WCS-WAVE' (image lookup table), "
                                  "'CWAVE' (calibration product, planned), 'mock'")
    wavelength_pixel: PixelRef | None = Field(default=None, description="Pixel where wavelength_um was evaluated")
    band: str = Field(examples=["D3"], description="SPHEREx detector D1..D6")
    release: str = Field(examples=["DR1"], description="Data release of THIS observation (DR1, QR3, ...)")
    processing_version: str | None = Field(default=None, examples=["l2b-v27-2026-228"],
                                           description="Pipeline version tag from the archive file name")
    archive_id: str | None = Field(default=None, examples=["ivo://irsa.ipac/spherex_dr1?2025W33_2C_0321_1/D6"],
                                   description="obs_publisher_did: the archive's own identifier")
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
