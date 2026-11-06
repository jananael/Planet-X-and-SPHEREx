import json

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT
from app.main import app
from app.services.data_source import RealSource, get_data_source

client = TestClient(app)


def assert_error(resp, status, code):
    assert resp.status_code == status, resp.text
    body = resp.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["data_source"] == "mock"


def test_targets_include_wise_0855():
    r = client.get("/api/targets")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == len(body["targets"]) >= 3
    t = next(t for t in body["targets"] if t["id"] == "wise-0855-0714")
    assert set(t) == {"id", "name", "ra", "dec", "observations"}
    assert set(t["observations"][0]) == {"id", "survey", "mjd", "band", "image_url"}


def test_get_observation_and_404():
    r = client.get("/api/observations/wise-0855-0714-neowise-w2-2")
    assert r.status_code == 200
    assert r.json()["target_id"] == "wise-0855-0714"
    assert_error(client.get("/api/observations/nope"), 404, "OBSERVATION_NOT_FOUND")


def test_image_redirects():
    r = client.get("/api/observations/wise-0855-0714-neowise-w2-2/image", follow_redirects=False)
    assert r.status_code == 307
    assert r.headers["location"].startswith("https://")
    assert_error(client.get("/api/observations/nope/image", follow_redirects=False), 404, "OBSERVATION_NOT_FOUND")


def test_search_finds_wise_0855_nearest_first():
    r = client.get("/api/search", params={"ra": 133.8, "dec": -7.25, "radius": 0.1})
    assert r.status_code == 200
    body = r.json()
    assert [x["id"] for x in body["results"]] == ["wise-0855-0714"]
    assert 0 < body["results"][0]["distance_deg"] < 0.1


def test_search_empty_is_200():
    r = client.get("/api/search", params={"ra": 0, "dec": 0, "radius": 0.01})
    assert r.status_code == 200 and r.json()["results"] == []


@pytest.mark.parametrize("params", [{}, {"ra": 400, "dec": 0}, {"ra": 1, "dec": 0, "radius": 0}, {"ra": "x", "dec": 0}])
def test_search_validation_errors(params):
    assert_error(client.get("/api/search", params=params), 422, "VALIDATION_ERROR")


def test_unknown_route_uses_error_shape():
    assert_error(client.get("/api/nope"), 404, "NOT_FOUND")


def test_cors_allows_localhost_3000():
    r = client.get("/api/health", headers={"Origin": "http://localhost:3000"})
    assert r.headers["access-control-allow-origin"] == "http://localhost:3000"


def test_real_source_returns_501():
    app.dependency_overrides[get_data_source] = RealSource
    try:
        assert_error(client.get("/api/targets"), 501, "NOT_IMPLEMENTED")
    finally:
        app.dependency_overrides.clear()


def test_mock_files_are_consistent():
    """targets.v0.json (nested) and observations.v0.json (flat) must describe the same observations."""
    targets = json.loads((REPO_ROOT / "mock/targets.v0.json").read_text(encoding="utf-8"))["targets"]
    obs = json.loads((REPO_ROOT / "mock/observations.v0.json").read_text(encoding="utf-8"))["observations"]
    nested = {o["id"]: {**o, "target_id": t["id"]} for t in targets for o in t["observations"]}
    assert nested == {o["id"]: o for o in obs}
    assert len(obs) == len(nested)  # no duplicate ids
