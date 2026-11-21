"""Endpoints that require a user must reject missing or invalid credentials."""

from __future__ import annotations

from fastapi.testclient import TestClient

PROTECTED_REQUESTS = [
    ("get", "/api/v1/auth/me", None),
    (
        "post",
        "/api/v1/sos",
        {
            "location": [38.74, 9.03],
            "reason": "Should be rejected before reaching the data store",
        },
    ),
]


def test_missing_token_is_rejected(client: TestClient) -> None:
    for method, path, payload in PROTECTED_REQUESTS:
        response = client.request(method, path, json=payload)
        assert response.status_code == 401, f"{method.upper()} {path}"


def test_invalid_token_uses_error_envelope(client: TestClient) -> None:
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer definitely-not-a-jwt"},
    )
    assert response.status_code == 401
    body = response.json()
    assert body["error"]["code"] == "authentication_error"
    assert body["error"]["request_id"]


def test_demo_endpoints_allow_anonymous_use(client: TestClient) -> None:
    """The pulled demo frontend relies on anonymous report and journey flows."""
    assert client.get("/api/v1/journeys/active").status_code == 404
    report_response = client.post(
        "/api/v1/reports",
        json={
            "category": "poor_street_lighting",
            "latitude": 9.0345,
            "longitude": 38.752,
            "severity": 3,
            "description": "Anonymous demo report",
            "is_anonymous": True,
        },
    )
    assert report_response.status_code == 201
