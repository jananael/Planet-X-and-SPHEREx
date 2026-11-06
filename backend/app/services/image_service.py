"""Pixels (from FITS or the mock) -> web PNG with a display stretch."""
from __future__ import annotations

import io
import math
from typing import Literal

import numpy as np
from PIL import Image

Stretch = Literal["linear", "asinh", "zscale"]
MIN_OUTPUT_PX = 256


def _percentile_limits(data: np.ndarray, lo=0.5, hi=99.5) -> tuple[float, float]:
    vmin, vmax = np.nanpercentile(data, [lo, hi])
    return float(vmin), float(vmax)


def zscale_limits(data: np.ndarray, contrast: float = 0.25, max_samples: int = 1000,
                  n_iter: int = 5, krej: float = 2.5) -> tuple[float, float]:
    """IRAF-style zscale (simplified). Swap for astropy.visualization.ZScaleInterval when astropy is in."""
    flat = data[np.isfinite(data)].ravel()
    if flat.size == 0:
        return 0.0, 1.0
    step = max(1, flat.size // max_samples)
    samples = np.sort(flat[::step])
    n = samples.size
    x = np.arange(n)
    keep = np.ones(n, dtype=bool)
    slope, intercept = 0.0, float(np.median(samples))
    for _ in range(n_iter):
        if keep.sum() < max(5, n // 2):
            break
        slope, intercept = np.polyfit(x[keep], samples[keep], 1)
        resid = samples - (slope * x + intercept)
        sigma = np.std(resid[keep])
        new_keep = np.abs(resid) < krej * sigma
        if np.array_equal(new_keep, keep):
            break
        keep = new_keep
    median = float(np.median(samples))
    half = (n / 2) * slope / contrast
    return max(float(samples[0]), median - half), min(float(samples[-1]), median + half)


def stretch_limits(data: np.ndarray, method: Stretch) -> tuple[float, float]:
    return zscale_limits(data) if method == "zscale" else _percentile_limits(data)


def stretch(data: np.ndarray, method: Stretch = "asinh",
            limits: tuple[float, float] | None = None) -> tuple[np.ndarray, tuple[float, float]]:
    """Return (values in [0, 1], (vmin, vmax) used).

    Pass the same `limits` for every epoch in a blink sequence, otherwise per-image
    normalisation hides brightness changes (e.g. a variable star).
    """
    vmin, vmax = limits or stretch_limits(data, method)
    if not math.isfinite(vmax - vmin) or vmax <= vmin:
        return np.zeros_like(data), (vmin, vmax)
    norm = np.clip((data - vmin) / (vmax - vmin), 0, 1)
    if method == "asinh":
        a = 0.1
        norm = np.arcsinh(norm / a) / math.asinh(1 / a)
    return np.nan_to_num(norm), (vmin, vmax)


def to_png(data: np.ndarray, method: Stretch = "asinh", limits: tuple[float, float] | None = None,
           min_output_px: int = MIN_OUTPUT_PX) -> tuple[bytes, tuple[float, float]]:
    """Stretch and upscale a north-up 2D array (row 0 = top). Returns (png bytes, limits used)."""
    norm, used = stretch(data, method, limits)
    im = Image.fromarray((norm * 255).round().astype(np.uint8))
    factor = max(1, math.ceil(min_output_px / max(im.size)))
    if factor > 1:  # nearest keeps real pixels visible — important when judging sub-pixel motion
        im = im.resize((im.width * factor, im.height * factor), Image.Resampling.NEAREST)
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue(), used
