"""/api/journey: Horizons is faked here (no network); the cache and the inventory are real files."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import journey as jr

client = TestClient(app)


@pytest.fixture
def fake_horizons(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(jr, "_vectors", lambda hid, span, ephem=None: calls.append(("v", hid["id"])) or [["2025-May-01 00:00", 1.0, 2.0], ["2025-May-11 00:00", 1.5, 2.5]])
    monkeypatch.setattr(jr, "_sky", lambda hid, ephem: calls.append(("s", hid["id"])) or [["2025-May-01", 223.2, -4.3]])
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "cache_dir", tmp_path)
    return calls


def test_vesta_journey_has_orbits_sky_track_and_spherex_visits(fake_horizons):
    d = client.get("/api/journey/vesta").json()
    assert d["target"]["name"] == "(4) Vesta"
    assert {b["name"] for b in d["bodies"]} == {"(4) Vesta", "Earth", "Mars", "Jupiter"}
    assert d["bodies"][0]["track"][0] == ["2025-05-01", 1.0, 2.0]          # Horizons dates converted to ISO
    assert d["sky_track"][0] == ["2025-05-01", 223.2, -4.3]
    visits = d["spherex_visits"]                                           # from docs/inventory/vesta.csv
    assert [v["exposures"] for v in visits] == [88, 72] and visits[1]["releases"] == ["QR3"]
    assert any("JPL Horizons" in s for s in d["sources"])


def test_journey_is_cached_after_the_first_call(fake_horizons):
    client.get("/api/journey/vesta")
    n = len(fake_horizons)
    client.get("/api/journey/vesta")
    assert len(fake_horizons) == n                                         # second call: no Horizons request


def test_unknown_target_and_horizons_failure(monkeypatch, tmp_path):
    assert client.get("/api/journey/mira").status_code == 404
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "cache_dir", tmp_path)
    monkeypatch.setattr(jr, "_vectors", lambda *a, **k: (_ for _ in ()).throw(ConnectionError("down")))
    r = client.get("/api/journey/vesta")
    assert r.status_code == 502 and "Horizons" in r.json()["error"]["message"]   # never an invented path
