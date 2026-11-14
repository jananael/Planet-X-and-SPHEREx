"""/api/explain: plain-language facts for the frames on screen (mock data, no network)."""
from fastapi.testclient import TestClient

from app.main import app
from app.services.data_source import get_data_source

client = TestClient(app)


def frames_for(ra, dec, band):
    obs = client.get("/api/search", params={"ra": ra, "dec": dec}).json()["observations"]
    return ",".join(o["id"] for o in obs if o["band"] == band)


def test_asteroid_moves_with_predicted_positions_inside_the_image():
    d = client.get("/api/explain", params={"ra": 210.40, "dec": -11.85, "ids": frames_for(210.40, -11.85, "D3")}).json()
    assert d["kind"] == "moves" and d["object"]["name"] == "(4) Vesta" and d["is_mock"] is True
    assert d["displacement_pixels"] > 1 and d["direction"] == "east" and d["elapsed_hours"] > 3
    assert all(f["inside"] and 0 <= f["x"] <= 1 for f in d["frames"])
    assert any("PREDICTED" in n for n in d["notes"]) and any("Synthetic" in n for n in d["notes"])
    assert not any("Real SPHEREx" in n for n in d["notes"])          # mock is never called real


def test_variable_star_is_a_brightness_story():
    d = client.get("/api/explain", params={"ra": 34.83663, "dec": -2.97764, "ids": frames_for(34.83663, -2.97764, "D2")}).json()
    assert d["kind"] == "brightness" and d["object"]["type"] == "variable" and d["displacement_arcsec"] == 0


def test_field_without_a_known_object_stays_general():
    ids = frames_for(210.40, -11.85, "D3")
    d = client.get("/api/explain", params={"ra": 210.40, "dec": -11.85 + 2, "ids": ids}).json()
    assert d["kind"] == "no_known_object" and d["object"] is None and all(f["x"] is None for f in d["frames"])


def test_bad_requests():
    assert client.get("/api/explain", params={"ra": 10, "dec": 0, "ids": ""}).status_code == 400
    assert client.get("/api/explain", params={"ra": 10, "dec": 0, "ids": "nope"}).status_code == 404
    many = ",".join(["nope"] * 13)
    assert client.get("/api/explain", params={"ra": 10, "dec": 0, "ids": many}).status_code == 400
