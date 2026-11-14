from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.services.sky_catalogs import parse_skybot_payload, propagate_gaia_position


def test_gaia_proper_motion_propagation_respects_cos_dec():
    epoch = datetime(2026, 1, 1, tzinfo=timezone.utc)
    ra, dec = propagate_gaia_position(10, 60, 3600, 3600, epoch)
    assert ra > 10.001
    assert dec > 60.001


def test_missing_gaia_proper_motion_is_not_replaced_with_zero_motion():
    epoch = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert propagate_gaia_position(10, 60, None, 3600, epoch) == (10, 60)


def test_parse_skybot_text_rows_to_decimal_coordinates():
    rows = parse_skybot_payload({"flag": 1, "result": "123|Example asteroid|01 00 00.0|+10 30 00|MBA|17.2|0.4"})
    assert rows == [{
        "name": "Example asteroid", "ra_deg": 15.0, "dec_deg": 10.5,
        "object_type": "MBA", "visual_magnitude": 17.2, "position_error_arcsec": 0.4,
    }]


def test_parse_skybot_rejects_error_payload():
    assert parse_skybot_payload({"flag": 0, "result": "not a result"}) == []


def test_sky_objects_route_returns_provider_provenance(monkeypatch):
    import app.routers.sky_objects as route

    monkeypatch.setattr(route, "query_sky_objects", lambda ra, dec, radius, epoch: {
        "center": {"ra_deg": ra, "dec_deg": dec}, "radius_deg": radius,
        "epoch_utc": epoch.isoformat(), "stars": [], "solar_system_objects": [],
        "providers": {"gaia_dr3": {"status": "available", "count": 0}, "skybot": {"status": "unavailable", "reason": "Timeout"}},
    })
    response = TestClient(app).get("/api/sky-objects?ra=34.8366&dec=-2.9776&radius_deg=0.5&epoch=2026-11-14T12:00:00Z")
    assert response.status_code == 200
    payload = response.json()
    assert payload["center"] == {"ra_deg": 34.8366, "dec_deg": -2.9776}
    assert payload["providers"]["gaia_dr3"]["status"] == "available"
    assert payload["providers"]["skybot"]["status"] == "unavailable"


def test_sky_objects_route_rejects_unsupported_epoch():
    response = TestClient(app).get("/api/sky-objects?ra=34&dec=0&epoch=2200-01-01T00:00:00Z")
    assert response.status_code == 400
