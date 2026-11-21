"""The static map demo is served from the same origin as the API."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_demo_map_page(client: TestClient) -> None:
    response = client.get("/demo/map/")
    assert response.status_code == 200
    assert "SafeRoute Map Demo" in response.text
    assert "Compare routes" in response.text


def test_demo_map_assets(client: TestClient) -> None:
    for path in (
        "/demo/map/app.js",
        "/demo/map/styles.css",
        "/demo/map/vendor/leaflet.js",
        "/demo/map/vendor/leaflet.css",
    ):
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.content
