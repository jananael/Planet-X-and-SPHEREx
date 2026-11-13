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
from app.errors import NotFound, UpstreamError  # noqa: E402
from app.main import app  # noqa: E402
from app.services import irsa  # noqa: E402
from app.services.data_source import get_data_source  # noqa: E402
from app.services.real_source import RealSource  # noqa: E402

TARGETS = APP_DIR / "mock_data" / "targets.v0.json"
RA, DEC = 133.79513, -7.24514
STAR = (RA + 40 / 3600, DEC + 20 / 3600)  # a star 40" east, 20" north of the centre


def fake_record(i: int, rotated: bool, collection="spherex_dr1") -> irsa.SiaRecord:
    return irsa.SiaRecord(
        id=f"2025W{19 + i}_1B_0116_{i}D3", collection=collection, band="D3",
        t_min=60800.7 + 180 * i, t_max=60800.7013 + 180 * i, em_min_um=1.63, em_max_um=2.42,
        access_url=f"https://irsa.example/{'rot' if rotated else 'up'}/level2_x_{i}D3_spx.fits",
        s_ra=RA + 0.5, s_dec=DEC - 0.3, s_fov=3.485,
    )


def fake_cutout_fits(rotated: bool, n: int = 80, nan_centre: bool = False, blank: bool = False) -> bytes:
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
    img = np.full((n, n), 0.5) if blank else 0.5 + 10 * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * 1.0**2))
    if nan_centre:  # like a saturated bright star at the target: SPHEREx delivers NaN there
        c = (n - 1) // 2
        img[c - 1:c + 3, c - 1:c + 3] = np.nan
    image_header = w.to_header()
    image_header["BUNIT"] = "MJy / sr"
    variance_header = fits.Header({"BUNIT": "(MJy/sr)^2"})
    hdul = fits.HDUList([
        fits.PrimaryHDU(),
        fits.ImageHDU(img.astype("float32"), header=image_header, name="IMAGE"),
        fits.ImageHDU(np.full((n, n), 0.5, dtype="float32"), name="ZODI"),
        fits.ImageHDU(np.full((n, n), 0.25, dtype="float32"), header=variance_header, name="VARIANCE"),
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
    monkeypatch.setattr(irsa, "wavelength_at", lambda hdul, ra, dec, cal_dir=None: {
        "wavelength_um": 2.03, "bandwidth_um": 0.05, "source": "WCS-WAVE", "pixel": {"x": 39.5, "y": 39.5, "frame": "cutout"}})
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
    assert body["count"] == 2 and calls["search"] == 2  # both DR1 and QR3 queried
    o = body["observations"][0]
    assert o["id"] == "2025W19_1B_0116_0D3"
    assert o["band"] == "D3" and o["release"] == "DR1" and o["target_id"] is None
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
    # 12P has no real view (too faint); 3I/ATLAS has one, verified in the real images on 2026-11-13
    assert set(targets) == {"vesta", "3i-atlas", "wise-0855-0714", "barnards-star", "mira"}
    assert targets["3i-atlas"]["validation_status"] == "verified" and targets["3i-atlas"]["preferred_band"] == "D1"
    assert "not a discovery" in targets["3i-atlas"]["validation_note"]
    vesta = targets["vesta"]
    assert vesta["validation_status"] == "verified" and vesta["preferred_band"] == "D2"
    assert vesta["ra"] == pytest.approx(22.555155) and vesta["search_start"].startswith("2026-07-13T15:50")
    barnard = targets["barnards-star"]
    assert barnard["position_epoch"] == 2026.0
    assert barnard["catalog_motion"]["pm_dec_mas_yr"] == pytest.approx(10362.394)  # Gaia DR3, kept apart from SPHEREx
    assert barnard["catalog_motion"]["source_catalog"].startswith("Gaia DR3")
    # Gaia DR3 position (2016.0) + 10 yr of Gaia proper motion; within ~1" of the position that
    # centred the star in the real SPHEREx images (269.44628, 4.76800)
    assert barnard["dec"] == pytest.approx(4.7394201 + 10.362394 * 10 / 3600, abs=1e-6)
    assert barnard["ra"] == pytest.approx(269.44628, abs=3e-4) and barnard["dec"] == pytest.approx(4.768, abs=3e-4)
    assert targets["mira"]["ra"] == pytest.approx(34.83663)  # no proper motion -> unchanged


# ---------- real IRSA (opt-in) ----------

network = pytest.mark.skipif(os.environ.get("RUN_NETWORK_TESTS") != "1", reason="set RUN_NETWORK_TESTS=1")


@network
@pytest.mark.parametrize("release", ["DR1", "QR3"])
def test_network_search_returns_each_release(tmp_path, release):
    """Live IRSA: Mira is covered by both releases (DR1: 2025-07 to 2026-01, QR3: 2026-07)."""
    obs = [o for o in RealSource(TARGETS, tmp_path).search(34.83663, -2.97764, 0) if o.release == release]
    assert len(obs) > 50
    for o in obs:
        assert o.id and o.source_file.endswith(".fits") and o.archive_id.startswith(f"ivo://irsa.ipac/spherex_{release.lower()}?")
        assert o.processing_version and "-v27-" in o.processing_version


@network
def test_network_search_and_cutout(tmp_path):
    src = RealSource(TARGETS, tmp_path)
    obs = src.search(RA, DEC, 0)
    assert len(obs) > 100 and {o.release for o in obs} >= {"DR1"}
    first = next(o for o in obs if o.band == "D3")
    cut = src.get_cutout(first.id, None, None, 120)
    assert cut.data.shape == (20, 20)
    assert cut.observation.wavelength_um is not None
    assert 0.7 < cut.observation.wavelength_um < 5.1


@pytest.mark.parametrize("collection, release, obs_id, version", [
    ("spherex_dr1", "DR1", "2025W33_2C_0321_1", "l2b-v27-2026-228"),
    ("spherex_qr3", "QR3", "2026W29_1A_0138_4", "l2b-v27-2026-276"),
])
def test_real_observation_has_release_version_archive_id_and_bandwidth(real, monkeypatch, collection, release, obs_id, version):
    client, _, src, cache = real
    rec = fake_record(0, rotated=False, collection=collection)
    rec.id = f"{obs_id}D3"
    rec.access_url = f"https://irsa.example/level2_{obs_id}D3_spx_{version}.fits"
    rec.publisher_did = f"ivo://irsa.ipac/{collection}?{obs_id}/D3"
    monkeypatch.setattr(irsa, "sia_search", lambda ra, dec, radius, coll: [rec] if coll == collection else [])
    o = client.get("/api/search", params={"ra": RA, "dec": DEC}).json()["observations"][0]
    # release, observation id and file identifiers survive the search
    assert o["release"] == release and o["processing_version"] == version
    assert o["id"] == f"{obs_id}D3" and o["archive_id"] == f"ivo://irsa.ipac/{collection}?{obs_id}/D3"
    assert o["source_file"] == f"level2_{obs_id}D3_spx_{version}.fits"
    r = client.get(f"/api/observations/{o['id']}/image")
    assert r.headers["x-bandwidth-um"] == "0.05" and r.headers["x-wavelength-source"] == "WCS-WAVE"
    assert r.headers["x-processing-version"] == version and r.headers["x-release"] == release
    # the processing version is part of the cutout cache key
    assert any(version in p.name for p in (cache / "cutouts").iterdir())


def test_search_results_are_cached(real):
    client, calls, _, cache = real
    first = client.get("/api/search", params={"ra": RA, "dec": DEC}).json()
    second = client.get("/api/search", params={"ra": RA, "dec": DEC}).json()
    assert first == second
    assert calls["search"] == 2  # two collections queried once; the repeat came from the cache
    assert len(list((cache / "search").iterdir())) == 1


def test_partial_search_failures_are_not_cached(real, monkeypatch):
    client, _, _, cache = real

    def half_down(ra, dec, radius, coll):
        if coll == "spherex_qr3":
            raise UpstreamError("QR3 down")
        return [fake_record(0, rotated=False)]

    monkeypatch.setattr(irsa, "sia_search", half_down)
    assert client.get("/api/search", params={"ra": RA, "dec": DEC}).json()["count"] == 1
    assert list((cache / "search").iterdir()) == []


def test_polygon_helpers():
    poly = irsa.parse_polygon("POLYGON ICRS 133.959 -7.753 130.569 -6.869 131.578 -3.533 134.968 -4.417")
    assert len(poly) == 4
    assert irsa.point_in_polygon(poly, 132.77, -5.66)
    assert not irsa.point_in_polygon(poly, 140.0, -5.6)
    assert irsa.parse_polygon("CIRCLE ICRS 10 10 1") == []


def test_real_footprint_polygon_is_returned_and_used_for_coverage(real, monkeypatch):
    client, _, _, _ = real
    rec = fake_record(0, rotated=False)
    # a thin footprint just east of the target: the circle around (s_ra, s_dec) would include RA, DEC
    rec.s_region = f"POLYGON ICRS {RA + 0.10} {DEC - 1} {RA + 0.30} {DEC - 1} {RA + 0.30} {DEC + 1} {RA + 0.10} {DEC + 1}"
    monkeypatch.setattr(irsa, "sia_search", lambda ra, dec, radius, coll: [rec] if coll == "spherex_dr1" else [])
    o = client.get("/api/search", params={"ra": RA, "dec": DEC}).json()["observations"][0]
    assert len(o["footprint"]["polygon"]) == 4
    r = client.get(f"/api/observations/{o['id']}/image")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NO_COVERAGE"


def _versioned_records():
    records = [fake_record(0, rotated=False), fake_record(1, rotated=True)]
    for i, record in enumerate(records):
        record.access_url = f"https://irsa.example/l2b-v27-2026-228/level2_x_{i}D3_spx_l2b-v27-2026-228.fits"
    return records


def test_candidates_real_fits_and_multiple_requests(real, monkeypatch):
    client, _, src, _ = real
    records = _versioned_records()
    monkeypatch.setattr(irsa, "sia_search", lambda ra, dec, radius, coll: records if coll == "spherex_dr1" else [])
    params = {"ra": RA, "dec": DEC, "radius": 0.1, "band": "D3", "pipeline": "v27"}
    first = client.get("/api/candidates", params=params)
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["count"] >= 1 and body["count"] == len(body["candidates"])
    candidate = body["candidates"][0]
    assert candidate["is_mock"] is False
    assert all(d["flux"] is None and d["flux_error"] is None for d in candidate["detections"])
    assert candidate["evidence"]["selected_band"] == "D3"
    assert candidate["evidence"]["selected_pipeline"] == "v27"
    assert client.get(f"/api/candidates/{candidate['candidate_id']}").json()["candidate_id"] == candidate["candidate_id"]
    second = client.get("/api/candidates", params=params)
    assert second.status_code == 200


def test_candidates_empty_result_is_successful_empty_list(real, monkeypatch):
    client, _, _, _ = real
    monkeypatch.setattr(irsa, "sia_search", lambda *args: [])
    r = client.get("/api/candidates", params={"ra": RA, "dec": DEC})
    assert r.status_code == 200 and r.json()["candidates"] == [] and r.json()["count"] == 0


def test_candidates_require_supported_pipeline_metadata(real, monkeypatch):
    client, _, _, _ = real
    monkeypatch.setattr(irsa, "sia_search", lambda ra, dec, radius, coll: [fake_record(0, False)] if coll == "spherex_dr1" else [])
    r = client.get("/api/candidates", params={"ra": RA, "dec": DEC})
    assert r.status_code == 400 and "pipeline" in r.json()["error"]["message"]


def test_candidates_do_not_choose_between_bands_silently(real, monkeypatch):
    client, _, _, _ = real
    records = _versioned_records()
    second = _versioned_records()[0]
    second.id = "2025W30_1B_0116_2D4"
    second.band = "D4"
    second.access_url = "https://irsa.example/l2b-v27-2026-228/level2_x_2D4_spx_l2b-v27-2026-228.fits"
    records.append(second)
    monkeypatch.setattr(irsa, "sia_search", lambda ra, dec, radius, coll: records if coll == "spherex_dr1" else [])
    r = client.get("/api/candidates", params={"ra": RA, "dec": DEC})
    assert r.status_code == 400 and "specify band and pipeline" in r.json()["error"]["message"]


def test_candidates_empty_detection_result_is_200(real, monkeypatch):
    client, _, _, _ = real
    records = _versioned_records()[:1]
    monkeypatch.setattr(irsa, "sia_search", lambda ra, dec, radius, coll: records if coll == "spherex_dr1" else [])
    monkeypatch.setattr(irsa, "fetch_cutout", lambda url, ra, dec, size: fake_cutout_fits(False, blank=True))
    r = client.get("/api/candidates", params={"ra": RA, "dec": DEC, "band": "D3", "pipeline": "v27"})
    assert r.status_code == 200 and r.json()["count"] == 0 and r.json()["candidates"] == []


def test_candidates_report_upstream_download_failure(real, monkeypatch):
    client, _, _, _ = real
    records = _versioned_records()[:1]
    monkeypatch.setattr(irsa, "sia_search", lambda ra, dec, radius, coll: records if coll == "spherex_dr1" else [])
    monkeypatch.setattr(irsa, "fetch_cutout", lambda *args, **kwargs: (_ for _ in ()).throw(UpstreamError("offline")))
    r = client.get("/api/candidates", params={"ra": RA, "dec": DEC, "band": "D3", "pipeline": "v27"})
    assert r.status_code == 502 and r.json()["error"]["code"] == "UPSTREAM_ERROR"


def test_candidates_report_corrupt_fits_read(real, monkeypatch):
    client, _, _, _ = real
    records = _versioned_records()[:1]
    monkeypatch.setattr(irsa, "sia_search", lambda ra, dec, radius, coll: records if coll == "spherex_dr1" else [])
    monkeypatch.setattr(irsa, "fetch_cutout", lambda *args, **kwargs: b"not a FITS file")
    r = client.get("/api/candidates", params={"ra": RA, "dec": DEC, "band": "D3", "pipeline": "v27"})
    assert r.status_code == 502 and r.json()["error"]["code"] == "UPSTREAM_ERROR"


def test_defects_repaired_for_display_but_transients_and_sources_are_not():
    img = np.full((7, 7), 1.0)
    img[3, 3] = 500.0   # hot pixel flagged HOT: repaired for display
    img[5, 5] = 300.0   # cosmic-ray hit flagged TRANSIENT: kept as-is (science team), only counted
    img[1, 1] = 50.0    # real star flagged SOURCE: must stay
    flags = np.zeros((7, 7), dtype=np.int32)
    flags[5, 5] = 1          # bit 0 TRANSIENT
    flags[3, 3] = 1 << 7     # bit 7 HOT
    flags[1, 1] = 1 << 21    # bit 21 SOURCE
    fh = fits.Header()
    for bit, name in [(0, "TRANSIENT"), (7, "HOT"), (21, "SOURCE")]:
        fh[f"MSKN{bit:04d}"] = name; fh[f"MSKM{bit:04d}"] = 1 << bit
    hdul = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(img, name="IMAGE"), fits.ImageHDU(flags, header=fh, name="FLAGS")])
    assert irsa.flag_planes(hdul) == {"TRANSIENT": 1, "HOT": 1 << 7, "SOURCE": 1 << 21}
    fixed, n, used = irsa.repair_flagged(hdul, img)
    assert n == 1 and used == ["HOT"]
    assert fixed[3, 3] == pytest.approx(1.0) and fixed[1, 1] == 50.0 and fixed[5, 5] == 300.0
    mask = irsa.flag_mask(hdul, irsa.WARN_FLAGS)
    assert mask is not None and mask.sum() == 1 and mask[5, 5]


def test_processing_version_includes_retry_files():
    # Real DR1 example: some files were re-run by IRSA and tagged 'l2b_retry-v27-...'.
    url = ("https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/2026W03_1A/l2b_retry-v27-2026-214/6/"
           "level2_2026W03_1A_0640_1D6_spx_l2b_retry-v27-2026-214.fits")
    rec = irsa.SiaRecord(id="2026W03_1A_0640_1D6", collection="spherex_dr1", band="D6", t_min=61055.26,
                         t_max=61055.27, em_min_um=4.41, em_max_um=5.01, access_url=url,
                         s_ra=33.75, s_dec=-1.61, s_fov=3.485)
    assert rec.processing_version == "l2b_retry-v27-2026-214"


def test_candidate_results_survive_a_restart_and_are_shared_by_workers(real, monkeypatch, tmp_path):
    """Results are stored on disk: a new RealSource on the same cache (restart, other worker) finds them."""
    client, _, src, cache = real
    records = _versioned_records()
    monkeypatch.setattr(irsa, "sia_search", lambda ra, dec, radius, coll: records if coll == "spherex_dr1" else [])
    params = {"ra": RA, "dec": DEC, "radius": 0.1, "band": "D3", "pipeline": "v27"}
    cid = client.get("/api/candidates", params=params).json()["candidates"][0]["candidate_id"]
    restarted = RealSource(TARGETS, cache)
    again = restarted.get_candidate(cid)
    assert again.candidate_id == cid and again.detections[0].release == "DR1"
    with pytest.raises(NotFound):
        restarted.get_candidate("../../etc/passwd")      # never read outside the candidate folder


def test_candidate_radius_beyond_the_analysed_cutout_is_refused(real, monkeypatch):
    client, _, _, _ = real
    monkeypatch.setattr(irsa, "sia_search", lambda ra, dec, radius, coll: _versioned_records() if coll == "spherex_dr1" else [])
    r = client.get("/api/candidates", params={"ra": RA, "dec": DEC, "radius": 1.0, "band": "D3", "pipeline": "v27"})
    assert r.status_code == 400 and "0.25" in r.json()["error"]["message"]
    ok = client.get("/api/candidates", params={"ra": RA, "dec": DEC, "band": "D3", "pipeline": "v27"})  # default 0.25
    assert ok.status_code == 200, ok.text
