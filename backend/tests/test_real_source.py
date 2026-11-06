"""RealSource tests.

Offline (default): IRSA is faked with synthetic FITS cutouts, rotated 180 deg like real SPHEREx visits.
Network (opt-in):  RUN_NETWORK_TESTS=1 pytest -k network   -> hits the real IRSA archive.
"""
import io
import os

import numpy as np
import pytest

for _mod in ("astropy.io.fits", "astropy.wcs", "pyvo"):  # RealSource deps; mock-only envs skip this file
    pytest.importorskip(_mod, exc_type=ImportError)  # ImportError too: broken DLLs on long Windows paths

from astropy.io import fits  # noqa: E402
from astropy.wcs import WCS  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import APP_DIR  # noqa: E402
from app.errors import UpstreamError  # noqa: E402
from app.main import app  # noqa: E402
from app.services import irsa  # noqa: E402
from app.services.data_source import get_data_source  # noqa: E402
from app.services.real_source import RealSource  # noqa: E402

TARGETS = APP_DIR / "mock_data" / "targets.v0.json"
RA, DEC = 133.79513, -7.24514
STAR = (RA + 40 / 3600, DEC + 20 / 3600)  # a star 40" east, 20" north of the centre


def fake_record(i: int, rotated: bool, collection="spherex_qr2") -> irsa.SiaRecord:
    return irsa.SiaRecord(
        id=f"2025W{19 + i}_1B_0116_{i}D3", collection=collection, band="D3",
        t_min=60800.7 + 180 * i, t_max=60800.7013 + 180 * i, em_min_um=1.63, em_max_um=2.42,
        access_url=f"https://irsa.example/{'rot' if rotated else 'up'}/level2_x_{i}D3_spx.fits",
        s_ra=RA + 0.5, s_dec=DEC - 0.3, s_fov=3.485,
    )


def fake_cutout_fits(rotated: bool, n: int = 80, nan_centre: bool = False) -> bytes:
    """Detector-frame cutout around (RA, DEC); rotated=True mimics the ~180 deg flip between visits."""
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [RA, DEC]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    w.wcs.cdelt = [-6.15 / 3600, 6.15 / 3600]
    if rotated:
        w.wcs.pc = [[-1, 0], [0, -1]]
    x, y = w.all_world2pix([[*STAR]], 0)[0]
    yy, xx = np.mgrid[0:n, 0:n]
    img = 0.5 + 10 * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * 1.0**2))
    if nan_centre:  # like a saturated bright star at the target: SPHEREx delivers NaN there
        c = (n - 1) // 2
        img[c - 1:c + 3, c - 1:c + 3] = np.nan
    hdul = fits.HDUList([
        fits.PrimaryHDU(),
        fits.ImageHDU(img.astype("float32"), header=w.to_header(), name="IMAGE"),
        fits.ImageHDU(np.full((n, n), 0.5, dtype="float32"), name="ZODI"),
    ])
    buf = io.BytesIO()
    hdul.writeto(buf)
    return buf.getvalue()


@pytest.fixture
def real(tmp_path, monkeypatch):
    calls = {"search": 0, "cutout": 0}

    def fake_search(ra, dec, radius, collection):
        calls["search"] += 1
        if collection == "spherex_qr3":
            return []
        return [fake_record(0, rotated=False), fake_record(1, rotated=True)]

    def fake_fetch(url, ra, dec, size):
        calls["cutout"] += 1
        assert size >= 300 * 1.4  # asked for the rotation margin
        return fake_cutout_fits(rotated="/rot/" in url)

    monkeypatch.setattr(irsa, "sia_search", fake_search)
    monkeypatch.setattr(irsa, "fetch_cutout", fake_fetch)
    monkeypatch.setattr(irsa, "wavelength_at", lambda hdul, ra, dec: (2.03, 0.03))
    src = RealSource(TARGETS, tmp_path)
    app.dependency_overrides[get_data_source] = lambda: src
    yield TestClient(app), calls, src, tmp_path
    app.dependency_overrides.clear()


def brightest(png: bytes):
    from PIL import Image

    a = np.asarray(Image.open(io.BytesIO(png)))
    return np.unravel_index(a.argmax(), a.shape)


def test_search_maps_sia_fields(real):
    client, calls, _, _ = real
    body = client.get("/api/search", params={"ra": RA, "dec": DEC}).json()
    assert body["count"] == 2 and calls["search"] == 2  # both QR2 and QR3 queried
    o = body["observations"][0]
    assert o["id"] == "2025W19_1B_0116_0D3"
    assert o["band"] == "D3" and o["release"] == "QR2" and o["target_id"] is None
    assert o["wavelength_um"] is None and o["wavelength_range_um"] == [1.63, 2.42]
    assert o["source_file"] == "level2_x_0D3_spx.fits"
    assert o["obs_time"].startswith("2025-05-05T16:")
    assert [x["obs_time"] for x in body["observations"]] == sorted(x["obs_time"] for x in body["observations"])


def test_rotated_visits_are_aligned_north_up(real):
    """The core blink requirement: a star lands on the same output pixel for both visits."""
    client, _, _, _ = real
    ids = [o["id"] for o in client.get("/api/search", params={"ra": RA, "dec": DEC}).json()["observations"]]
    a = client.get(f"/api/observations/{ids[0]}/image")
    b = client.get(f"/api/observations/{ids[1]}/image")
    assert a.status_code == b.status_code == 200
    pa, pb = brightest(a.content), brightest(b.content)
    assert abs(pa[0] - pb[0]) <= 6 and abs(pa[1] - pb[1]) <= 6  # within one SPHEREx pixel (6x upscale)
    h, w = 294, 294
    assert pa[0] < h / 2 and pa[1] < w / 2  # star is north (up) and east (left) of centre
    assert a.headers["x-wavelength-um"] == "2.03"


def test_cutouts_are_cached(real):
    client, calls, _, _ = real
    oid = client.get("/api/search", params={"ra": RA, "dec": DEC}).json()["observations"][0]["id"]
    client.get(f"/api/observations/{oid}/image")
    client.get(f"/api/observations/{oid}/image", params={"stretch": "zscale"})
    assert calls["cutout"] == 1


def test_ids_survive_restart(real):
    client, _, _, cache = real
    oid = client.get("/api/search", params={"ra": RA, "dec": DEC}).json()["observations"][0]["id"]
    app.dependency_overrides[get_data_source] = lambda: RealSource(TARGETS, cache)  # fresh instance
    r = client.get(f"/api/observations/{oid}")
    assert r.status_code == 200 and r.json()["id"] == oid


def test_unknown_id_and_no_coverage(real):
    client, _, _, _ = real
    assert client.get("/api/observations/NOPE").json()["error"]["code"] == "NOT_FOUND"
    oid = client.get("/api/search", params={"ra": RA, "dec": DEC}).json()["observations"][0]["id"]
    r = client.get(f"/api/observations/{oid}/image", params={"ra": 10, "dec": 10})
    assert r.status_code == 404 and r.json()["error"]["code"] == "NO_COVERAGE"


def test_saturated_centre_is_not_no_coverage(real, monkeypatch):
    """Regression: Barnard's Star's core is NaN in real data; that is coverage, shown white."""
    client, _, _, _ = real
    monkeypatch.setattr(irsa, "fetch_cutout", lambda *a, **k: fake_cutout_fits(rotated=False, nan_centre=True))
    oid = client.get("/api/search", params={"ra": RA, "dec": DEC}).json()["observations"][0]["id"]
    r = client.get(f"/api/observations/{oid}/image")
    assert r.status_code == 200
    from PIL import Image

    a = np.asarray(Image.open(io.BytesIO(r.content)))
    assert a[a.shape[0] // 2, a.shape[1] // 2] == 255


def test_upstream_failure_is_502(real, monkeypatch):
    client, _, _, _ = real

    def boom(*a, **k):
        raise UpstreamError("IRSA down")

    monkeypatch.setattr(irsa, "sia_search", boom)
    r = client.get("/api/search", params={"ra": RA, "dec": DEC})
    assert r.status_code == 502 and r.json()["error"]["code"] == "UPSTREAM_ERROR"


def test_live_targets_skip_illustrative_and_apply_proper_motion(real):
    """Live mode: no asteroid/comet with made-up positions; stars moved to the SPHEREx epoch."""
    client, _, _, _ = real
    targets = {t["id"]: t for t in client.get("/api/targets").json()["targets"]}
    assert set(targets) == {"wise-0855-0714", "barnards-star", "mira"}
    barnard = targets["barnards-star"]
    assert barnard["epoch"] == 2026.0
    # 26 years x 10.33"/yr north = ~268" = ~0.0746 deg (the position we verified against real images)
    assert barnard["dec"] == pytest.approx(4.69339 + 10.33 * 26 / 3600, abs=1e-5)
    assert barnard["ra"] == pytest.approx(269.4463, abs=2e-4)
    assert targets["mira"]["ra"] == pytest.approx(34.83663)  # no proper motion -> unchanged


# ---------- real IRSA (opt-in) ----------

network = pytest.mark.skipif(os.environ.get("RUN_NETWORK_TESTS") != "1", reason="set RUN_NETWORK_TESTS=1")


@network
def test_network_search_and_cutout(tmp_path):
    src = RealSource(TARGETS, tmp_path)
    obs = src.search(RA, DEC, 0)
    assert len(obs) > 100 and {o.release for o in obs} >= {"QR2"}
    first = next(o for o in obs if o.band == "D3")
    cut = src.get_cutout(first.id, None, None, 120)
    assert cut.data.shape == (20, 20)
    assert cut.observation.wavelength_um is not None
    assert 0.7 < cut.observation.wavelength_um < 5.1
