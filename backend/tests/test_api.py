import io
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import APP_DIR
from app.main import app

client = TestClient(app)
VESTA_1 = "vesta-20250814-d3-1"
VESTA_2 = "vesta-20250814-d3-2"


def assert_error(resp, status, code):
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


def png_array(resp) -> np.ndarray:
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "image/png"
    return np.asarray(Image.open(io.BytesIO(resp.content)))


# ---------- health / targets ----------

def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok" and r.json()["data_source"] == "mock"


def test_targets_shape_and_types():
    body = client.get("/api/targets").json()
    assert body["count"] == len(body["targets"]) == 5
    for t in body["targets"]:
        assert set(t) == {"id", "name", "type", "ra", "dec", "description", "pm_ra", "pm_dec", "epoch"}
    assert {t["type"] for t in body["targets"]} == {"asteroid", "comet", "brown_dwarf", "star", "variable"}


# ---------- observations ----------

def test_get_observation_shape():
    r = client.get(f"/api/observations/{VESTA_1}")
    assert r.status_code == 200
    o = r.json()
    assert {"id", "target_id", "obs_time", "mjd", "wavelength_um", "band", "release",
            "source_file", "image_url"} <= set(o)
    assert "mock_truth" not in o
    assert o["obs_time"] == "2025-08-14T02:10:00Z"
    assert o["image_url"] == f"/api/observations/{VESTA_1}/image"
    assert o["release"] == "QR2"


def test_unknown_observation_is_not_found():
    assert_error(client.get("/api/observations/nope"), 404, "NOT_FOUND")
    assert_error(client.get("/api/observations/nope/image"), 404, "NOT_FOUND")


# ---------- search ----------

def test_search_returns_covering_observations_sorted_by_time():
    t = next(t for t in client.get("/api/targets").json()["targets"] if t["id"] == "wise-0855-0714")
    body = client.get("/api/search", params={"ra": t["ra"], "dec": t["dec"]}).json()
    times = [o["obs_time"] for o in body["observations"]]
    assert body["count"] == len(times) == 3
    assert times == sorted(times)
    assert {o["target_id"] for o in body["observations"]} == {"wise-0855-0714"}


def test_search_without_coverage_is_empty_200():
    r = client.get("/api/search", params={"ra": 0.5, "dec": 80})
    assert r.status_code == 200 and r.json()["observations"] == []


@pytest.mark.parametrize("params", [{}, {"ra": 400, "dec": 0}, {"ra": 1, "dec": 0, "radius": -1}, {"ra": "x", "dec": 0}])
def test_search_bad_params(params):
    assert_error(client.get("/api/search", params=params), 400, "BAD_REQUEST")


# ---------- image ----------

def test_image_png_with_provenance_headers():
    r = client.get(f"/api/observations/{VESTA_1}/image")
    arr = png_array(r)
    assert arr.ndim == 2 and min(arr.shape) >= 256
    assert r.headers["x-source-file"].endswith(".fits")
    assert r.headers["x-obs-time"] == "2025-08-14T02:10:00Z"
    assert float(r.headers["x-wavelength-um"]) == pytest.approx(2.04)
    assert float(r.headers["x-stretch-vmax"]) > float(r.headers["x-stretch-vmin"])


@pytest.mark.parametrize("stretch", ["linear", "asinh", "zscale"])
def test_image_stretches(stretch):
    png_array(client.get(f"/api/observations/{VESTA_1}/image", params={"stretch": stretch}))


def centre(arr: np.ndarray, half: int = 4) -> float:
    """Mean brightness in a small box at the image centre (= the target's reference position)."""
    cy, cx = arr.shape[0] // 2, arr.shape[1] // 2
    return float(arr[cy - half:cy + half, cx - half:cx + half].mean())


def blink_pair(id_a: str, id_b: str) -> tuple[np.ndarray, np.ndarray]:
    """Two epochs at the same default centre, the second reusing the first's stretch limits."""
    first = client.get(f"/api/observations/{id_a}/image")
    lim = {"vmin": first.headers["x-stretch-vmin"], "vmax": first.headers["x-stretch-vmax"]}
    second = client.get(f"/api/observations/{id_b}/image", params=lim)
    return png_array(first).astype(int), png_array(second).astype(int)


def test_asteroid_moves_between_epochs_but_stars_do_not():
    a, b = blink_pair(VESTA_1, VESTA_2)
    assert centre(a) - centre(b) > 80  # Vesta left the centre
    assert (np.abs(a - b) > 100).mean() < 0.02  # background stars stayed put


def test_variable_star_dims_with_fixed_stretch():
    bright, faint = blink_pair("mira-20250730-d2-1", "mira-20260128-d2-2")
    assert centre(bright) - centre(faint) > 20  # asinh compresses the bright end


def test_image_no_coverage():
    assert_error(client.get(f"/api/observations/{VESTA_1}/image", params={"ra": 10, "dec": 10}), 404, "NO_COVERAGE")


@pytest.mark.parametrize("params", [
    {"ra": 210.4}, {"vmin": 0.1}, {"vmin": 1, "vmax": 0.5}, {"size": 5}, {"stretch": "log"},
])
def test_image_bad_params(params):
    assert_error(client.get(f"/api/observations/{VESTA_1}/image", params=params), 400, "BAD_REQUEST")


# ---------- plumbing ----------

def test_unknown_route_uses_error_shape():
    assert_error(client.get("/api/nope"), 404, "NOT_FOUND")


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://127.0.0.1:3000"])
def test_cors_allows_dev_frontend_and_exposes_provenance(origin):
    r = client.get(f"/api/observations/{VESTA_1}/image", headers={"Origin": origin})
    assert r.headers["access-control-allow-origin"] == origin
    assert "x-source-file" in r.headers["access-control-expose-headers"].lower()


def test_mock_observations_reference_known_targets():
    targets = json.loads((APP_DIR / "mock_data/targets.v0.json").read_text(encoding="utf-8"))["targets"]
    obs = json.loads((APP_DIR / "mock_data/observations.v0.json").read_text(encoding="utf-8"))["observations"]
    ids = {t["id"] for t in targets}
    assert all(o["target_id"] in ids or o["target_id"] is None for o in obs)
    assert len({o["id"] for o in obs}) == len(obs)


# ---------- sky-map relay ----------

def test_hips_relay_rejects_anything_but_hips_files():
    for path in ["../secret", "http://evil.example/x", "Norder3/Dir0/Npix1.exe", "index.html"]:
        assert client.get(f"/api/hips/allwise/{path}").status_code in (400, 404)
    assert_error(client.get("/api/hips/other/properties"), 404, "NOT_FOUND")


def test_hips_relay_serves_and_caches(tmp_path, monkeypatch):
    from app.config import get_settings
    from app.routers import hips

    monkeypatch.setattr(get_settings(), "cache_dir", tmp_path)
    calls = []

    class Resp:
        status_code = 200
        content = b"\xff\xd8jpeg"

    monkeypatch.setattr(hips.requests, "get", lambda url, timeout: calls.append(url) or Resp())
    for _ in range(2):
        r = client.get("/api/hips/allwise/Norder3/Dir0/Npix12.jpg", headers={"Origin": "http://localhost:3000"})
        assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
        assert r.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert len(calls) == 1 and calls[0].endswith("/RGB-W4-W2-W1/Norder3/Dir0/Npix12.jpg")
