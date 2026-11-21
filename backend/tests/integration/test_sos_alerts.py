from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_sos_alert_nearby_discovery_and_resolve():
    create_response = client.post(
        "/api/v1/sos/alerts",
        json={
            "latitude": 9.055,
            "longitude": 38.785,
            "radius_meters": 2000,
            "reason": "Need help near the market",
            "client_id": "test-sos-device-1",
            "valid_hours": 2,
        },
    )
    assert create_response.status_code == 201
    alert_id = create_response.json()["alert_id"]
    assert create_response.json()["status"] == "active"

    nearby_response = client.get(
        "/api/v1/sos/alerts/nearby"
        "?latitude=9.056&longitude=38.786&radius_meters=25000"
    )
    assert nearby_response.status_code == 200
    alerts = nearby_response.json()["alerts"]
    match = next((alert for alert in alerts if alert["alert_id"] == alert_id), None)
    assert match is not None
    assert match["reason"] == "Need help near the market"
    assert match["distance_meters"] >= 0

    far_response = client.get(
        "/api/v1/sos/alerts/nearby"
        "?latitude=9.5&longitude=39.2&radius_meters=25000"
    )
    assert all(alert["alert_id"] != alert_id for alert in far_response.json()["alerts"])

    wrong_device = client.patch(
        f"/api/v1/sos/alerts/{alert_id}/resolve?client_id=someone-else"
    )
    assert wrong_device.status_code == 404

    resolve_response = client.patch(
        f"/api/v1/sos/alerts/{alert_id}/resolve?client_id=test-sos-device-1"
    )
    assert resolve_response.status_code == 200
    assert resolve_response.json()["status"] == "resolved"

    after_resolve = client.get(
        "/api/v1/sos/alerts/nearby"
        "?latitude=9.056&longitude=38.786&radius_meters=25000"
    )
    assert all(alert["alert_id"] != alert_id for alert in after_resolve.json()["alerts"])
