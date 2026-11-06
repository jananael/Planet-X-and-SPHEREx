"""IRSA access for SPHEREx: SIA2 search, cutouts, reprojection, wavelength.

Heavy imports (astropy, pyvo) are done inside functions so mock mode never needs them.
Findings behind each choice: docs/irsa-spike-findings.md.
"""
from __future__ import annotations

import io
import math
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath
from urllib.parse import urlparse

import numpy as np
import requests

from app.errors import UpstreamError

SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = ("spherex_qr2", "spherex_qr3")  # different time ranges, not versions: search both
PIXEL_ARCSEC = 6.15
ROTATION_MARGIN = 1.45  # >= sqrt(2): cutouts are detector-frame and rotate between visits
MIN_SEARCH_RADIUS_DEG = 1 / 3600  # pyvo rejects radius 0
MJD0 = datetime(1858, 11, 17, tzinfo=timezone.utc)


@dataclass
class SiaRecord:
    """One SPHEREx image as found by SIA2 (everything we need later to cut it out)."""

    id: str                 # obs_id + detector, e.g. 2025W19_1B_0116_1D3 (URL-safe)
    collection: str         # spherex_qr2 | spherex_qr3
    band: str               # D1..D6
    t_min: float
    t_max: float
    em_min_um: float        # whole-detector range, NOT the wavelength at the target
    em_max_um: float
    access_url: str
    s_ra: float
    s_dec: float
    s_fov: float            # deg, side of the (square) detector field

    @property
    def release(self) -> str:
        return self.collection.removeprefix("spherex_").upper()  # spherex_qr2 -> QR2

    @property
    def source_file(self) -> str:
        return PurePosixPath(urlparse(self.access_url).path).name

    @property
    def mjd_mid(self) -> float:
        return (self.t_min + self.t_max) / 2

    @property
    def obs_time(self) -> datetime:
        return (MJD0 + timedelta(days=self.mjd_mid)).replace(microsecond=0)


def _s(v) -> str:
    return v.decode() if isinstance(v, bytes) else str(v)


def row_to_record(row, collection: str) -> SiaRecord:
    band = _s(row["energy_bandpassname"]).removeprefix("SPHEREx-")
    return SiaRecord(
        id=f"{_s(row['obs_id'])}{band}",
        collection=collection,
        band=band,
        t_min=float(row["t_min"]),
        t_max=float(row["t_max"]),
        em_min_um=float(row["em_min"]) * 1e6,
        em_max_um=float(row["em_max"]) * 1e6,
        access_url=_s(row["access_url"]),
        s_ra=float(row["s_ra"]),
        s_dec=float(row["s_dec"]),
        s_fov=float(row["s_fov"]),
    )


def sia_search(ra: float, dec: float, radius_deg: float, collection: str) -> list[SiaRecord]:
    from pyvo.dal import DALServiceError, DALQueryError, SIA2Service  # lazy

    try:
        table = SIA2Service(SIA_URL).search(
            pos=(ra, dec, max(radius_deg, MIN_SEARCH_RADIUS_DEG)), collection=collection
        ).to_table()
    except (DALServiceError, DALQueryError, requests.RequestException) as e:
        raise UpstreamError(f"IRSA SIA2 search failed for {collection}: {e}") from e
    return [row_to_record(row, collection) for row in table if _s(row["dataproduct_subtype"]) == "science"]


def fetch_cutout(access_url: str, ra: float, dec: float, size_arcsec: float, *, tries: int = 3,
                 connect_timeout: float = 10, read_timeout: float = 90) -> bytes:
    """IRSA cutout = access_url?center=&size=. Retries: the spike saw transient 503s and timeouts."""
    url = f"{access_url}?center={ra},{dec}deg&size={size_arcsec:.1f}arcsec"
    last = ""
    for attempt in range(1, tries + 1):
        try:
            resp = requests.get(url, timeout=(connect_timeout, read_timeout))
            if resp.status_code == 200 and resp.content[:6] == b"SIMPLE":
                return resp.content
            last = f"HTTP {resp.status_code}"
        except requests.RequestException as e:
            last = type(e).__name__
        if attempt < tries:
            time.sleep(1.5 * attempt)
    raise UpstreamError(f"IRSA cutout failed after {tries} tries ({last})")


def open_fits(data: bytes):
    from astropy.io import fits  # lazy

    return fits.open(io.BytesIO(data))


def _quiet_wcs(header, **kw):
    """SPHEREx headers carry SIP terms without '-SIP' in CTYPE; astropy applies them and logs a
    long INFO each time. Applying SIP is what we want (open question for Yazan), so keep logs quiet."""
    import warnings

    from astropy import log as astropy_log
    from astropy.utils.exceptions import AstropyWarning
    from astropy.wcs import WCS

    astropy_log.setLevel("WARNING")
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", AstropyWarning)
        return WCS(header, **kw)


def wavelength_at(hdul, ra: float, dec: float) -> tuple[float, float] | None:
    """Wavelength (um) and bandwidth at sky position (ra, dec), from the alternate WCS 'W' (WAVE-TAB).

    SPHEREx is a linear-variable-filter instrument: wavelength depends on the detector pixel,
    so this must be evaluated at the target's pixel, not taken from the detector's range.
    """
    from astropy.coordinates import SkyCoord

    hdr = hdul["IMAGE"].header
    x, y = _quiet_wcs(hdr).celestial.world_to_pixel(SkyCoord(ra, dec, unit="deg"))
    lam, dlam = _quiet_wcs(hdr, fobj=hdul, key="W").pixel_to_world_values(float(x), float(y))
    lam, dlam = float(lam), float(dlam)
    return (lam, dlam) if math.isfinite(lam) else None


def reproject_north_up(hdul, data: np.ndarray, ra: float, dec: float, size_arcsec: float,
                       scale_arcsec: float = PIXEL_ARCSEC) -> tuple[np.ndarray, np.ndarray]:
    """Resample onto a north-up / east-left TAN grid centred on (ra, dec); row 0 = north.

    Same (ra, dec, size) => same grid for every visit, which is what makes blinking meaningful.
    Bilinear. Returns (values, inside): `inside` marks output pixels that fall on the source image.
    Values can be NaN even where inside=True: SPHEREx masks e.g. saturated star cores.
    """
    from astropy.wcs import WCS

    n = max(8, int(round(size_arcsec / scale_arcsec)))
    out = WCS(naxis=2)
    out.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    out.wcs.crval = [ra, dec]
    out.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    out.wcs.cdelt = [-scale_arcsec / 3600, scale_arcsec / 3600]
    yy, xx = np.mgrid[0:n, 0:n]
    sx, sy = _quiet_wcs(hdul["IMAGE"].header).celestial.world_to_pixel(out.pixel_to_world(xx, yy))
    val, inside = bilinear(data, np.asarray(sx), np.asarray(sy))
    return np.flipud(val), np.flipud(inside)


def bilinear(data: np.ndarray, sx: np.ndarray, sy: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    h, w = data.shape
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = sx - x0, sy - y0
    inside = (x0 >= 0) & (y0 >= 0) & (x0 + 1 < w) & (y0 + 1 < h)
    x0c, y0c = np.clip(x0, 0, w - 2), np.clip(y0, 0, h - 2)
    val = (data[y0c, x0c] * (1 - fx) * (1 - fy) + data[y0c, x0c + 1] * fx * (1 - fy)
           + data[y0c + 1, x0c] * (1 - fx) * fy + data[y0c + 1, x0c + 1] * fx * fy)
    return np.where(inside, val, np.nan), inside
