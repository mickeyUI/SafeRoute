"""Protected endpoints must reject missing or invalid credentials."""

from __future__ import annotations

from fastapi.testclient import TestClient

PROTECTED_REQUESTS = [
    ("get", "/api/v1/auth/me", None),
    ("get", "/api/v1/journeys/active", None),
    (
        "post",
        "/api/v1/reports",
        {
            "type": "harassment",
            "severity": 4,
            "description": "Should be rejected before reaching the DB",
            "location": [-122.4161, 37.7812],
            "occurred_at": "2026-11-21T18:00:00Z",
        },
    ),
    (
        "post",
        "/api/v1/sos",
        {
            "location": [38.74, 9.03],
            "reason": "Should be rejected before reaching the DB",
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
