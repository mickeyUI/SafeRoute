"""Liveness endpoint integration tests."""

from fastapi.testclient import TestClient


def test_root_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["routing_provider"] in ("stub", "osrm", "graphhopper")


def test_v1_health(client: TestClient) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
