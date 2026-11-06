"""Synthetic sky cutouts for MockSource — lets the frontend build the blink view before real data.

Background stars are fixed on the sky per field (same seed every epoch), so blinking two cutouts
of the same field only shows what actually changed: the moving / varying target and the noise.
"""
from __future__ import annotations

import hashlib
import math

import numpy as np

FIELD_RADIUS_DEG = 0.3
N_FIELD_STARS = 1500


def _rng(key: str) -> np.random.Generator:
    return np.random.default_rng(int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "little"))


def _to_pixels(ra, dec, center_ra, center_dec, size_px, scale_arcsec):
    """Tangent-plane approximation, north up / east left (fine for cutouts << 1 deg)."""
    dra = (np.asarray(ra) - center_ra + 180.0) % 360.0 - 180.0
    dx = dra * math.cos(math.radians(center_dec)) * 3600 / scale_arcsec
    dy = (np.asarray(dec) - center_dec) * 3600 / scale_arcsec
    c = (size_px - 1) / 2
    return c - dx, c - dy  # (col, row)


def _add_gaussians(img, cols, rows, fluxes, fwhm_px):
    sigma = fwhm_px / 2.355
    yy, xx = np.mgrid[0:img.shape[0], 0:img.shape[1]]
    margin = 4 * sigma
    for c, r, f in zip(np.atleast_1d(cols), np.atleast_1d(rows), np.atleast_1d(fluxes)):
        if -margin <= c <= img.shape[1] + margin and -margin <= r <= img.shape[0] + margin:
            img += f * np.exp(-((xx - c) ** 2 + (yy - r) ** 2) / (2 * sigma**2))


def render(*, center_ra, center_dec, size_px, pixel_scale_arcsec, field_seed, field_ra, field_dec,
           noise_seed, source: dict | None) -> np.ndarray:
    img = np.zeros((size_px, size_px), dtype=np.float64)

    # fixed background stars scattered around the field centre
    rng = _rng(f"field:{field_seed}")
    r = FIELD_RADIUS_DEG * np.sqrt(rng.random(N_FIELD_STARS))
    theta = 2 * np.pi * rng.random(N_FIELD_STARS)
    s_dec = field_dec + r * np.sin(theta)
    s_ra = field_ra + r * np.cos(theta) / math.cos(math.radians(field_dec))
    s_flux = np.minimum(0.03 * (rng.pareto(1.6, N_FIELD_STARS) + 1), 0.4)  # keep the target the brightest
    cols, rows = _to_pixels(s_ra, s_dec, center_ra, center_dec, size_px, pixel_scale_arcsec)
    _add_gaussians(img, cols, rows, s_flux, fwhm_px=1.4)

    # the target at its position for this epoch
    if source:
        c, r_ = _to_pixels(source["ra"], source["dec"], center_ra, center_dec, size_px, pixel_scale_arcsec)
        _add_gaussians(img, c, r_, [source["flux"]], fwhm_px=source.get("fwhm_px", 1.4))

    # sky background + per-exposure noise
    noise = _rng(f"noise:{noise_seed}")
    img += 0.02 + noise.normal(0, 0.008, img.shape)
    return img
