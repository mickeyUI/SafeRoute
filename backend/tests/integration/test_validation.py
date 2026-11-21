"""Request validation error-envelope tests."""

from fastapi.testclient import TestClient


def test_bad_coordinates_return_validation_envelope(client: TestClient) -> None:
    response = client.post(
        "/api/v1/routes/compare",
        json={
            "origin": [-122.4194],
            "destination": [-122.4089, 37.7866],
            "travel_mode": "walk",
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["request_id"]
