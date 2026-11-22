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


def test_sos_alert_authenticated_lifecycle(client: TestClient) -> None:
    # 1. Login to obtain bearer token
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "demo@saferoute.app", "password": "SafeRoute2026!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Trigger SOS alert
    sos_payload = {
        "location": [38.745, 9.032],
        "reason": "Test emergency distress signal",
        "voice_attached": False,
        "picture_name": "evidence.jpg",
    }
    create_res = client.post("/api/v1/sos", json=sos_payload, headers=headers)
    assert create_res.status_code == 201
    alert_data = create_res.json()
    assert alert_data["id"]
    assert alert_data["location"] == [38.745, 9.032]
    assert alert_data["reason"] == "Test emergency distress signal"
    assert alert_data["status"] == "active"

    # 3. Retrieve user's SOS alerts
    list_res = client.get("/api/v1/sos/mine", headers=headers)
    assert list_res.status_code == 200
    mine = list_res.json()
    assert len(mine) >= 1
    assert any(a["id"] == alert_data["id"] for a in mine)

