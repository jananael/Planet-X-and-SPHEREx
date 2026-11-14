from fastapi.testclient import TestClient

from app.main import app


def test_ml_api_is_removed_while_non_ml_service_routes_remain_available():
    client = TestClient(app)
    assert client.get("/api/ml/status").status_code == 404
    assert client.get("/api/health").status_code == 200
