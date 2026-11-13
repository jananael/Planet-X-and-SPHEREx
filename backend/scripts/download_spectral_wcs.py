"""Download the SPHEREx spectral-WCS calibration files (CWAVE / CBAND per detector pixel).

    python scripts/download_spectral_wcs.py          (from backend/, ~33 MB per detector, 6 detectors)

Saved as CACHE_DIR/cal/spectral_wcs_D{1..6}.fits. When present, the API reports the wavelength
and bandwidth at the target from CWAVE/CBAND (wavelength_source "CWAVE"); otherwise it uses the
WCS-WAVE lookup table inside each image. Measured difference between the two: <= 0.4 nm, i.e.
~1.5% of the bandwidth (see docs/science-findings.md).

Downloads are resumable (HTTP Range): IRSA connections were dropping mid-transfer in testing.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import pyvo
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import get_settings  # noqa: E402

TAP = "https://irsa.ipac.caltech.edu/TAP"
PRODUCT = "spectral_wcs-cal-swcs-v5-2026-191"  # DR1 calibration product (check TAP for newer versions)


def resumable_get(url: str, out: Path, tries: int = 40) -> None:
    total = int(requests.head(url, timeout=60, allow_redirects=True).headers.get("Content-Length", 0))
    for attempt in range(tries):
        have = out.stat().st_size if out.exists() else 0
        if total and have >= total:
            return
        try:
            with requests.get(url, headers={"Range": f"bytes={have}-"}, stream=True, timeout=(15, 60)) as r:
                if r.status_code not in (200, 206):
                    time.sleep(3); continue
                with open(out, "ab" if r.status_code == 206 else "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
        except requests.RequestException:
            time.sleep(2)
    raise RuntimeError(f"incomplete download: {out} ({out.stat().st_size if out.exists() else 0}/{total} bytes)")


def main():
    cal_dir = get_settings().cache_dir / "cal"
    cal_dir.mkdir(parents=True, exist_ok=True)
    tap = pyvo.dal.TAPService(TAP)
    rows = tap.run_sync(
        f"SELECT energy_bandpassname, access_url FROM spherex.obscore "
        f"WHERE obs_collection='spherex_dr1_cal' AND obs_id='{PRODUCT}'").to_table()
    for row in rows:
        det = str(row["energy_bandpassname"]).removeprefix("SPHEREx-")
        out = cal_dir / f"spectral_wcs_{det}.fits"
        links = pyvo.dal.adhoc.DatalinkResults.from_result_url(str(row["access_url"]))
        url = next(l.access_url for l in links if l.semantics == "#calibration")
        t0 = time.time()
        resumable_get(url, out)
        print(f"{det}: {out.stat().st_size / 1e6:.1f} MB ({time.time() - t0:.0f}s) -> {out}", flush=True)


if __name__ == "__main__":
    main()
