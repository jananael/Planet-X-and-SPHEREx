"""IRSA access for SPHEREx: SIA2 search, cutouts, reprojection, wavelength.

Heavy imports (astropy, pyvo) are done inside functions so mock mode never needs them.
Findings behind each choice: docs/irsa-spike-findings.md.
"""
from __future__ import annotations

import io
import logging
import math
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse

import numpy as np
import requests

from app.errors import UpstreamError

log = logging.getLogger("skytrace.irsa")

SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
# DR1 (Surveys 1-2, reprocessed; replaced QR2, which IRSA no longer serves) + QR3 (Surveys 3-4).
# Different time ranges: search both. Calibrations differ between releases, so every
# observation carries its own release; don't treat DR1 vs QR3 photometry as identical.
COLLECTIONS = ("spherex_dr1", "spherex_qr3")
PIXEL_ARCSEC = 6.15
ROTATION_MARGIN = 1.45  # >= sqrt(2): cutouts are detector-frame and rotate between visits
MIN_SEARCH_RADIUS_DEG = 1 / 3600  # pyvo rejects radius 0
MJD0 = datetime(1858, 11, 17, tzinfo=timezone.utc)


@dataclass
class SiaRecord:
    """One SPHEREx image as found by SIA2 (everything we need later to cut it out)."""

    id: str                 # obs_id + detector, e.g. 2025W19_1B_0116_1D3 (URL-safe)
    collection: str         # spherex_dr1 | spherex_qr3
    band: str               # D1..D6
    t_min: float
    t_max: float
    em_min_um: float        # whole-detector range, NOT the wavelength at the target
    em_max_um: float
    access_url: str
    s_ra: float
    s_dec: float
    s_fov: float            # deg, side of the (square) detector field
    publisher_did: str = ""  # archive identifier (obs_publisher_did)
    s_region: str = ""       # real footprint, e.g. "POLYGON ICRS ra1 dec1 ra2 dec2 ..."

    @property
    def release(self) -> str:
        return self.collection.removeprefix("spherex_").upper()  # spherex_dr1 -> DR1

    @property
    def source_file(self) -> str:
        return PurePosixPath(urlparse(self.access_url).path).name

    @property
    def processing_version(self) -> str | None:
        """Pipeline tag from the file name, e.g. 'l2b-v27-2026-228' (changes when IRSA reprocesses).
        Some DR1 files were re-run and are tagged 'l2b_retry-v27-...': same pipeline version."""
        m = re.search(r"(l2b(?:_retry)?-v\d+-\d{4}-\d{3})", self.source_file)
        return m.group(1) if m else None

    @property
    def mjd_mid(self) -> float:
        return (self.t_min + self.t_max) / 2

    @property
    def obs_time(self) -> datetime:
        return (MJD0 + timedelta(days=self.mjd_mid)).replace(microsecond=0)


def parse_polygon(s_region: str) -> list[tuple[float, float]]:
    """'POLYGON ICRS ra1 dec1 ra2 dec2 ...' -> [(ra, dec), ...] (empty if not a polygon)."""
    if "POLYGON" not in s_region.upper():
        return []
    nums = [float(v) for v in re.findall(r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", s_region)]
    return list(zip(nums[0::2], nums[1::2]))


def point_in_polygon(poly: list[tuple[float, float]], ra: float, dec: float) -> bool:
    """Ray casting in the tangent plane at the polygon centre (fine for ~3.5 deg footprints)."""
    if len(poly) < 3:
        return False
    cra = math.degrees(math.atan2(sum(math.sin(math.radians(p[0])) for p in poly),
                                  sum(math.cos(math.radians(p[0])) for p in poly)))
    cdec = sum(p[1] for p in poly) / len(poly)

    def proj(a, d):
        a, d, a0, d0 = map(math.radians, (a, d, cra, cdec))
        c = math.sin(d0) * math.sin(d) + math.cos(d0) * math.cos(d) * math.cos(a - a0)
        if c <= 0:  # other hemisphere: certainly outside
            return None
        return (math.cos(d) * math.sin(a - a0) / c,
                (math.cos(d0) * math.sin(d) - math.sin(d0) * math.cos(d) * math.cos(a - a0)) / c)

    pts = [proj(*p) for p in poly]
    pt = proj(ra, dec)
    if pt is None or any(p is None for p in pts):
        return False
    x, y = pt
    hit = False
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


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
        publisher_did=_s(row["obs_publisher_did"]) if "obs_publisher_did" in row.colnames else "",
        s_region=_s(row["s_region"]) if "s_region" in row.colnames else "",
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
                 connect_timeout: float = 10, read_timeout: float = 45) -> bytes:
    """IRSA cutout = access_url?center=&size=. Retries: we see transient 503s and timeouts.

    Worst case ~3 x (10 + 45) s + backoff ≈ 170 s, kept under the frontend's 180 s image timeout
    so the user gets UPSTREAM_ERROR (with Retry) rather than a silent client timeout.
    """
    url = f"{access_url}?center={ra},{dec}deg&size={size_arcsec:.1f}arcsec"
    last = ""
    for attempt in range(1, tries + 1):
        try:
            resp = requests.get(url, timeout=(connect_timeout, read_timeout))
            if resp.status_code == 200 and resp.content[:6] == b"SIMPLE":
                if attempt > 1:
                    log.info("IRSA cutout succeeded on attempt %d: %s", attempt, url)
                return resp.content
            last = f"HTTP {resp.status_code}"
        except requests.RequestException as e:
            last = type(e).__name__
        log.warning("IRSA cutout attempt %d/%d failed (%s): %s", attempt, tries, last, url)
        if attempt < tries:
            time.sleep(2 * attempt)
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


_cal_cache: dict[str, tuple] = {}


def _calibration(cal_dir, detector: str):
    """(CWAVE, CBAND, product name) for a detector from CACHE_DIR/cal, or None if not downloaded."""
    if cal_dir is None:
        return None
    path = Path(cal_dir) / f"spectral_wcs_{detector}.fits"
    key = str(path)
    if key not in _cal_cache:
        if not path.exists():
            return None
        from astropy.io import fits
        with fits.open(path) as h:
            name = str(h[0].header.get("FILENAME", path.name))
            _cal_cache[key] = (h["CWAVE"].data.copy(), h["CBAND"].data.copy(), name)
    return _cal_cache[key]


def wavelength_at(hdul, ra: float, dec: float, cal_dir=None) -> dict | None:
    """Wavelength and bandwidth (um) at sky position (ra, dec), from the alternate WCS 'W' (WAVE-TAB).

    SPHEREx is a linear-variable-filter instrument: wavelength depends on the detector pixel, so it
    is evaluated at the target's own pixel. Source: the WCS-WAVE lookup table in the image file.
    (The science team prefers CWAVE/CBAND from the spectral-WCS calibration product; planned.)
    """
    from astropy.coordinates import SkyCoord

    hdr = hdul["IMAGE"].header
    x, y = _quiet_wcs(hdr).celestial.world_to_pixel(SkyCoord(ra, dec, unit="deg"))
    x, y = float(x), float(y)
    lam, dlam = _quiet_wcs(hdr, fobj=hdul, key="W").pixel_to_world_values(x, y)
    lam, dlam = float(lam), float(dlam)
    if not math.isfinite(lam):
        return None
    pixel = {"x": round(x, 2), "y": round(y, 2), "frame": "cutout"}
    result = {"wavelength_um": lam, "bandwidth_um": dlam if math.isfinite(dlam) else None,
              "source": "WCS-WAVE", "pixel": pixel}
    if "CRPIX1A" in hdr:  # alternate WCS 'A': cutout pixel -> raw detector (FITS, 1-based) coordinates
        dx, dy = _quiet_wcs(hdr, key="A").pixel_to_world_values(x, y)
        dx, dy = float(dx), float(dy)
        if math.isfinite(dx) and math.isfinite(dy):
            result["pixel"] = {"x": round(dx, 2), "y": round(dy, 2), "frame": "detector"}
            # Preferred (science team): CWAVE/CBAND from the spectral-WCS calibration product.
            cal = _calibration(cal_dir, f"D{hdr.get('DETECTOR', '')}")
            if cal is not None:
                cw, cb, name = cal
                xi, yi = int(round(dx)) - 1, int(round(dy)) - 1
                if 0 <= yi < cw.shape[0] and 0 <= xi < cw.shape[1] and math.isfinite(float(cw[yi, xi])):
                    result.update(wavelength_um=float(cw[yi, xi]), bandwidth_um=float(cb[yi, xi]),
                                  source=f"CWAVE ({name})")
    return result

# FLAGS planes treated as bad pixels FOR DISPLAY: detector defects. They would otherwise appear as
# dots that "change" between frames in a blink. Informational planes (SOURCE, HALO, BLOOM, GHOST,
# PERSIST, ...) are left alone. Names come from the file's own MSKNnnnn / MSKMnnnn header cards,
# so nothing is hard-coded by bit number.
# TRANSIENT (cosmic rays) is deliberately NOT repaired (science team, 2026-11-13): the difference
# image is computed from these PNGs, and replacing transient pixels there could hide or fake a
# change. They are kept as-is and counted instead (X-Transient-Pixels) so the UI can warn.
DISPLAY_BAD_FLAGS = ("OVERFLOW", "SUR_ERROR", "NONFUNC", "MISSING_DATA", "HOT", "COLD")
WARN_FLAGS = ("TRANSIENT",)


def flag_planes(hdul) -> dict[str, int]:
    """{plane name: bitmask} as documented in the FLAGS extension header."""
    if "FLAGS" not in hdul:
        return {}
    hdr = hdul["FLAGS"].header
    return {str(hdr[k]): int(hdr.get("MSKM" + k[4:], 1 << int(k[4:]))) for k in hdr if k.startswith("MSKN")}


def flag_mask(hdul, names) -> np.ndarray | None:
    """Boolean mask of pixels carrying any of the FLAGS planes `names`, or None if none apply."""
    planes = flag_planes(hdul)
    bits = 0
    for n in names:
        bits |= planes.get(n, 0)
    if not bits:
        return None
    return (hdul["FLAGS"].data.astype(np.int64) & bits) != 0


def repair_flagged(hdul, img: np.ndarray, names=DISPLAY_BAD_FLAGS) -> tuple[np.ndarray, int, list[str]]:
    """Replace pixels flagged with any of `names` by the median of their good 3x3 neighbours.
    Display only; returns (image, number of pixels replaced, plane names actually present)."""
    planes = flag_planes(hdul)
    mask_bits = 0
    used = [n for n in names if n in planes]
    for n in used:
        mask_bits |= planes[n]
    if not mask_bits:
        return img, 0, []
    flags = hdul["FLAGS"].data.astype(np.int64)
    bad = (flags & mask_bits) != 0
    if not bad.any():
        return img, 0, used
    work = img.astype(float).copy()
    work[bad] = np.nan
    padded = np.pad(work, 1, mode="edge")
    h, w = work.shape
    neigh = np.stack([padded[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]
                      for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx])
    with np.errstate(all="ignore"):
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", RuntimeWarning)
            fill = np.nanmedian(neigh, axis=0)
    fixed = img.astype(float).copy()
    ok = bad & np.isfinite(fill)
    fixed[ok] = fill[ok]
    return fixed, int(ok.sum()), used


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
