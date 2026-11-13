"""Is 3I/ATLAS visible in real SPHEREx images on 2025-12-08?

    python scripts/check_3i_atlas_images.py <out_dir>      (from backend/, short-path venv)

For every DR1 science image of 2025-12-07 22:00 to 2025-12-08 04:00 UTC near the comet: JPL Horizons
position at mid-exposure (geocentric), 600" north-up cutout around it, brightest source within 4 px,
its offset from the prediction and a rough peak SNR (background MAD). Writes <out_dir>/report.json.
Result on 2026-11-13: 23 images, every one within 1 px of the prediction (docs/science-findings.md).
"""
import json, math, sys, time
from pathlib import Path
import numpy as np
from astropy.time import Time
from astroquery.jplhorizons import Horizons
from pyvo.dal import SIA2Service

sys.path.insert(0, ".")
from app.services import irsa  # noqa: E402

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
RA0, DEC0 = 173.77394, 2.83347
T0, T1 = Time("2025-12-07T22:00:00").mjd, Time("2025-12-08T04:00:00").mjd
SIZE = 600.0  # arcsec

svc = SIA2Service("https://irsa.ipac.caltech.edu/SIA")
tab = None
for a in range(4):
    try:
        tab = svc.search(pos=(RA0, DEC0, 0.6), time=(Time(T0, format="mjd"), Time(T1, format="mjd")),
                         collection="spherex_dr1").to_table(); break
    except Exception as e:
        print("search retry", e); time.sleep(4)
rows = [r for r in tab if str(r["dataproduct_subtype"]) == "science"]
print("science images:", len(rows))

recs = []
for r in rows:
    rec = irsa.row_to_record(r, "spherex_dr1")
    recs.append(rec)
recs.sort(key=lambda r: r.t_min)
mids = [r.mjd_mid for r in recs]
# Geocentric ephemeris (SPHEREx is in LEO: parallax at ~1.8 au is a few arcsec, < 1 pixel)
eph = Horizons(id="3I", id_type="designation", location="500", epochs=[Time(m, format="mjd").jd for m in mids]
               ).ephemerides(closest_apparition=True, no_fragments=True)
report = []
for rec, e in zip(recs, eph):
    ra, dec = float(e["RA"]), float(e["DEC"])
    poly = irsa.parse_polygon(rec.s_region)
    if poly and not irsa.point_in_polygon(poly, ra, dec):
        continue
    try:
        raw = irsa.fetch_cutout(rec.access_url, ra, dec, SIZE * irsa.ROTATION_MARGIN)
    except Exception as ex:
        print("cutout failed", rec.id, ex); continue
    with irsa.open_fits(raw) as h:
        img = h["IMAGE"].data.astype(float)
        if "ZODI" in h: img = img - h["ZODI"].data
        img, _, _ = irsa.repair_flagged(h, img)
        var = h["VARIANCE"].data.astype(float) if "VARIANCE" in h else None
        wl = irsa.wavelength_at(h, ra, dec)
        data, inside = irsa.reproject_north_up(h, img, ra, dec, SIZE)
        if var is not None:
            vdat, _ = irsa.reproject_north_up(h, var, ra, dec, SIZE)
    n = data.shape[0]; c = n // 2
    bkg = np.nanmedian(data); noise = 1.4826 * np.nanmedian(np.abs(data - bkg))
    yy, xx = np.mgrid[0:n, 0:n]
    near = (np.hypot(xx - c, yy - c) <= 4) & np.isfinite(data)
    sub = np.where(near, data - bkg, -np.inf)
    py, px = np.unravel_index(np.argmax(sub), sub.shape)
    w = np.clip(np.nan_to_num(data[py-2:py+3, px-2:px+3] - bkg), 0, None)
    cy = (w * yy[py-2:py+3, px-2:px+3]).sum() / w.sum(); cx = (w * xx[py-2:py+3, px-2:px+3]).sum() / w.sum()
    # north-up, row 0 = north, east = left
    d_north = (c - cy) * irsa.PIXEL_ARCSEC; d_east = (c - cx) * irsa.PIXEL_ARCSEC
    item = dict(id=rec.id, band=rec.band, mid=Time(rec.mjd_mid, format="mjd").isot[:19] + "Z",
                pred_ra=round(ra, 5), pred_dec=round(dec, 5), V=float(e["V"]) if "V" in e.colnames else float(e["Tmag"]),
                wavelength_um=round(wl["wavelength_um"], 3) if wl else None,
                peak_snr=round(float((data[py, px] - bkg) / noise), 1),
                offset_east_arcsec=round(float(d_east), 1), offset_north_arcsec=round(float(d_north), 1),
                offset_px=round(math.hypot(d_east, d_north) / irsa.PIXEL_ARCSEC, 2))
    print(item, flush=True)
    report.append(item)
    np.save(OUT / f"{rec.id}.npy", data)
json.dump(report, open(OUT / "report.json", "w"), indent=1)
