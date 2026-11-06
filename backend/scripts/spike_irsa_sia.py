"""SPIKE (throwaway): what does real SPHEREx data look like through IRSA?

    pip install astropy pyvo astroquery
    python scripts/spike_irsa_sia.py --ra 133.79513 --dec -7.24514 --detector 3 --out spike_out/wise0855

Does, for one sky position:
  1. SIA2 query on IRSA (default collection spherex_qr2) -> summary of images, detectors, epochs
  2. For one image per epoch (same detector): IRSA cutout -> FITS -> spectral WCS wavelength at
     the centre, ZODI subtracted -> PNG via app.services.image_service with SHARED stretch limits
  3. Writes summary.json + epoch PNGs + a side-by-side sheet into --out

Not wired into the API. Findings feed RealSource and docs/irsa-spike-findings.md.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import time
import warnings
from pathlib import Path

import numpy as np
import requests
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.utils.exceptions import AstropyWarning
from astropy.wcs import WCS, FITSFixedWarning
from astroquery.ipac.irsa import Irsa
import astropy.units as u
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import image_service  # noqa: E402

warnings.simplefilter("ignore", category=AstropyWarning)
warnings.simplefilter("ignore", category=FITSFixedWarning)

EPOCH_GAP_DAYS = 30  # SPHEREx revisits a field every ~6 months; images within a visit are days apart


def sia_query(ra: float, dec: float, collection: str):
    t0 = time.time()
    r = Irsa.query_sia(pos=(SkyCoord(ra, dec, unit="deg"), 1 * u.arcsec), collection=collection)
    r.sort("t_min")
    return r, time.time() - t0


def split_epochs(t_min: np.ndarray) -> list[list[int]]:
    """Group row indices (sorted by time) into visits separated by > EPOCH_GAP_DAYS."""
    epochs, current = [], [0]
    for i in range(1, len(t_min)):
        if t_min[i] - t_min[i - 1] > EPOCH_GAP_DAYS:
            epochs.append(current)
            current = []
        current.append(i)
    epochs.append(current)
    return epochs


def fetch_cutout(access_url: str, ra: float, dec: float, size_arcsec: float, tries: int = 4):
    """IRSA cutout = the file's access_url + ?center=&size=. Retries: we saw transient 503s."""
    url = f"{access_url}?center={ra},{dec}deg&size={size_arcsec}arcsec"
    for attempt in range(1, tries + 1):
        t0 = time.time()
        try:
            resp = requests.get(url, timeout=120)
            if resp.status_code == 200 and resp.content[:6] == b"SIMPLE":
                return fits.open(io.BytesIO(resp.content)), time.time() - t0, len(resp.content), attempt
            err = f"HTTP {resp.status_code}: {resp.content[:80]!r}"
        except requests.RequestException as e:
            err = repr(e)
        print(f"    attempt {attempt} failed ({err}), retrying", flush=True)
        time.sleep(2 * attempt)
    raise RuntimeError(f"cutout failed after {tries} tries: {url}")


def wavelength_at_centre(hdul) -> tuple[float, float]:
    """SPHEREx LVF: wavelength varies across the image. Alternate WCS 'W' (WAVE-TAB) gives it per pixel."""
    w = WCS(hdul["IMAGE"].header, fobj=hdul, key="W")
    ny, nx = hdul["IMAGE"].data.shape
    lam, dlam = w.pixel_to_world_values((nx - 1) / 2, (ny - 1) / 2)
    return float(lam), float(dlam)


def north_angle_deg(hdul) -> float:
    """Angle of celestial north in pixel space (0 = +y). Differs per visit if images aren't north-aligned."""
    w = WCS(hdul["IMAGE"].header).celestial
    ny, nx = hdul["IMAGE"].data.shape
    c = w.pixel_to_world((nx - 1) / 2, (ny - 1) / 2)
    n = SkyCoord(c.ra, c.dec + 30 * u.arcsec)
    x0, y0 = w.world_to_pixel(c)
    x1, y1 = w.world_to_pixel(n)
    return float(np.degrees(np.arctan2(x1 - x0, y1 - y0)))


def reproject_north_up(hdul, data: np.ndarray, ra: float, dec: float, size_arcsec: float,
                       scale_arcsec: float = 6.15) -> np.ndarray:
    """Resample onto a north-up / east-left TAN grid centred on (ra, dec). Row 0 = top (north).

    SPHEREx cutouts are pixel slices in the detector frame, and the frame rotates between visits
    (we measured ~180 deg), so without this, blinking epochs is meaningless. Bilinear, numpy only.
    """
    n = int(round(size_arcsec / scale_arcsec))
    out = WCS(naxis=2)
    out.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    out.wcs.crval = [ra, dec]
    out.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    out.wcs.cdelt = [-scale_arcsec / 3600, scale_arcsec / 3600]  # RA increases to the left
    yy, xx = np.mgrid[0:n, 0:n]
    world = out.pixel_to_world(xx, yy)
    sx, sy = WCS(hdul["IMAGE"].header).celestial.world_to_pixel(world)
    x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
    fx, fy = sx - x0, sy - y0
    h, w = data.shape
    ok = (x0 >= 0) & (y0 >= 0) & (x0 + 1 < w) & (y0 + 1 < h)
    x0c, y0c = np.clip(x0, 0, w - 2), np.clip(y0, 0, h - 2)
    val = (data[y0c, x0c] * (1 - fx) * (1 - fy) + data[y0c, x0c + 1] * fx * (1 - fy)
           + data[y0c + 1, x0c] * (1 - fx) * fy + data[y0c + 1, x0c + 1] * fx * fy)
    val = np.where(ok, val, np.nan)
    return np.flipud(val)  # WCS row 0 is south; PNG row 0 is north


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ra", type=float, required=True)
    ap.add_argument("--dec", type=float, required=True)
    ap.add_argument("--collection", default="spherex_qr2")
    ap.add_argument("--detector", type=int, default=3, help="1..6; compare epochs within one detector")
    ap.add_argument("--size", type=float, default=300, help="cutout side, arcsec")
    ap.add_argument("--stretch", default="asinh", choices=["linear", "asinh", "zscale"])
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)

    # ---- 1. search
    r, dt = sia_query(a.ra, a.dec, a.collection)
    print(f"[SIA2] {a.collection} at ({a.ra}, {a.dec}): {len(r)} images in {dt:.1f}s")
    if not len(r):
        print("No coverage."); return
    bands = np.asarray(r["energy_bandpassname"]).astype(str)
    t_min = np.asarray(r["t_min"], dtype=float)
    epochs = split_epochs(t_min)
    per_det = {b: int((bands == b).sum()) for b in sorted(set(bands))}
    print(f"       per detector: {per_det}")
    for k, idx in enumerate(epochs):
        print(f"       epoch {k}: MJD {t_min[idx[0]]:.2f}-{t_min[idx[-1]]:.2f}, {len(idx)} images")

    # ---- 2. one image per epoch, same detector
    det_name = f"SPHEREx-D{a.detector}"
    picks = []
    for idx in epochs:
        same = [i for i in idx if bands[i] == det_name]
        if same:
            picks.append(same[0])
    print(f"[CUTOUT] {len(picks)} epoch(s) with {det_name}; size {a.size}\"")

    frames, limits = [], None
    for i in picks:
        row = r[i]
        cache = a.out / f"{row['obs_id']}_D{a.detector}.fits"
        if cache.exists():
            hdul, secs, nbytes, attempt = fits.open(cache), 0.0, cache.stat().st_size, 0
        else:
            hdul, secs, nbytes, attempt = fetch_cutout(str(row["access_url"]), a.ra, a.dec, a.size)
            hdul.writeto(cache)
        img = hdul["IMAGE"].data.astype(float)
        zodi = hdul["ZODI"].data.astype(float) if "ZODI" in hdul else 0.0
        data = img - zodi
        lam, dlam = wavelength_at_centre(hdul)
        hdr = hdul["IMAGE"].header
        aligned = reproject_north_up(hdul, data, a.ra, a.dec, a.size)
        png, used = image_service.to_png(np.nan_to_num(aligned, nan=np.nanmedian(data)), a.stretch, limits)
        limits = limits or used  # shared stretch across epochs = fair blink
        name = f"{len(frames):02d}_{row['obs_id']}_D{a.detector}.png"
        (a.out / name).write_bytes(png)
        info = {
            "obs_id": str(row["obs_id"]), "publisher_did": str(row["obs_publisher_did"]),
            "date_obs": hdr.get("DATE-OBS"), "mjd_avg": hdr.get("MJD-AVG"),
            "wavelength_um": round(lam, 4), "bandwidth_um": round(dlam, 4), "bunit": hdr.get("BUNIT"),
            "north_angle_deg": round(north_angle_deg(hdul), 1),
            "shape": list(img.shape), "cutout_seconds": round(secs, 1), "cutout_bytes": nbytes,
            "attempts": attempt, "png": name, "hdus": [h.name for h in hdul],
            "nan_fraction": float(np.isnan(img).mean()),
        }
        frames.append(info)
        print(f"    {info['date_obs']}  lambda={lam:.3f}um  north={info['north_angle_deg']}deg  "
              f"{secs:.1f}s  {nbytes/1e6:.1f}MB  -> {name}")

    # ---- 3. sheet + summary
    if frames:
        ims = [Image.open(a.out / f["png"]) for f in frames]
        sheet = Image.new("L", (sum(i.width for i in ims) + 10 * (len(ims) - 1), ims[0].height), 255)
        x = 0
        for im in ims:
            sheet.paste(im, (x, 0)); x += im.width + 10
        sheet.save(a.out / "sheet.png")
    summary = {
        "query": {"ra": a.ra, "dec": a.dec, "collection": a.collection, "size_arcsec": a.size},
        "sia_seconds": round(dt, 1), "n_images": len(r), "per_detector": per_det,
        "epochs": [{"mjd_start": float(t_min[i[0]]), "mjd_end": float(t_min[i[-1]]), "n": len(i)} for i in epochs],
        "sia_columns": r.colnames, "stretch_limits": limits, "frames": frames,
    }
    (a.out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"[DONE] {a.out}")


if __name__ == "__main__":
    main()
